import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { purgeExpiredAssessmentSessions, type AssessmentServiceDependencies } from "./service.ts";

export const DEFAULT_ASSESSMENT_RETENTION_BATCH_SIZE = 100;
export const MAX_ASSESSMENT_RETENTION_BATCH_SIZE = 100;

type PurgeExpiredAssessmentSessions = typeof purgeExpiredAssessmentSessions;

export interface AssessmentRetentionJobOptions {
  readonly batchSize?: number;
  readonly database?: PrismaClient;
  readonly dependencies?: Omit<AssessmentServiceDependencies, "db" | "now">;
  readonly now?: () => Date;
  readonly purgeExpired?: PurgeExpiredAssessmentSessions;
}

export interface AssessmentRetentionJobResult {
  readonly abandonedPurged: number;
  readonly batchLimitReached: boolean;
  readonly batchSize: number;
  readonly candidatesExamined: number;
  readonly completedPurged: number;
  readonly purged: number;
}

function boundedBatchSize(requested = DEFAULT_ASSESSMENT_RETENTION_BATCH_SIZE): number {
  if (!Number.isFinite(requested)) return DEFAULT_ASSESSMENT_RETENTION_BATCH_SIZE;
  return Math.max(1, Math.min(MAX_ASSESSMENT_RETENTION_BATCH_SIZE, Math.trunc(requested)));
}

function boundedCandidateDatabase(
  database: PrismaClient,
  expiresAt: Date,
  batchSize: number,
  onCandidates: (count: number) => void,
): PrismaClient {
  const sessionDelegate = database.patternworkV31AssessmentSession;
  const boundedSessionDelegate = new Proxy(sessionDelegate, {
    get(target, property) {
      if (property === "findMany") {
        return async (args: unknown = {}) => {
          const requested = args && typeof args === "object" ? args as Record<string, unknown> : {};
          const rows = await target.findMany({
            ...requested,
            where: {
              AND: [
                requested.where && typeof requested.where === "object" ? requested.where : {},
                { retentionExpiresAt: { lte: expiresAt } },
              ],
            },
            orderBy: [{ retentionExpiresAt: "asc" }, { id: "asc" }],
            take: batchSize,
          });
          onCandidates(rows.length);
          return rows;
        };
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });

  return new Proxy(database, {
    get(target, property) {
      if (property === "patternworkV31AssessmentSession") return boundedSessionDelegate;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function runAssessmentRetentionBatch(
  options: AssessmentRetentionJobOptions = {},
): Promise<AssessmentRetentionJobResult> {
  const batchSize = boundedBatchSize(options.batchSize);
  const timestamp = (options.now ?? (() => new Date()))();
  let candidatesExamined = 0;
  const database = boundedCandidateDatabase(
    options.database ?? prisma,
    timestamp,
    batchSize,
    (count) => { candidatesExamined = count; },
  );
  const purgeExpired = options.purgeExpired ?? purgeExpiredAssessmentSessions;
  const plan = await purgeExpired({
    ...options.dependencies,
    db: database,
    now: () => timestamp,
  });
  const abandonedPurged = plan.abandonedSessionIds.length;
  const completedPurged = plan.completedSessionIds.length;
  const purged = abandonedPurged + completedPurged;
  return {
    abandonedPurged,
    batchLimitReached: candidatesExamined === batchSize,
    batchSize,
    candidatesExamined,
    completedPurged,
    purged,
  };
}
