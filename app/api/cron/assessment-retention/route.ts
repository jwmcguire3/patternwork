import { NextResponse } from "next/server";
import { runAssessmentRetentionBatch, type AssessmentRetentionJobResult } from "@/lib/server/assessment/retention-job";
import { constantTimeEqual } from "@/lib/server/security";

export const dynamic = "force-dynamic";

interface RetentionLogger {
  error(message: string): void;
  info(message: string): void;
  warn(message: string): void;
}

interface AssessmentRetentionRouteDependencies {
  readonly getCronSecret?: () => string | undefined;
  readonly logger?: RetentionLogger;
  readonly now?: () => number;
  readonly runJob?: () => Promise<AssessmentRetentionJobResult>;
}

function metric(event: string, fields: Readonly<Record<string, unknown>>): string {
  return JSON.stringify({ event, ...fields });
}

export function createAssessmentRetentionHandler(
  dependencies: AssessmentRetentionRouteDependencies = {},
) {
  const getCronSecret = dependencies.getCronSecret ?? (() => process.env.CRON_SECRET);
  const logger = dependencies.logger ?? console;
  const now = dependencies.now ?? Date.now;
  const runJob = dependencies.runJob ?? runAssessmentRetentionBatch;

  return async function GET(request: Request): Promise<Response> {
    const secret = getCronSecret();
    if (!secret) {
      logger.error(metric("assessment_retention_configuration_failure", { failureCount: 1 }));
      return NextResponse.json({ error: "Retention job unavailable." }, { status: 503 });
    }

    const authorization = request.headers.get("authorization") ?? "";
    if (!constantTimeEqual(authorization, `Bearer ${secret}`)) {
      logger.warn(metric("assessment_retention_unauthorized", { failureCount: 1 }));
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const startedAt = now();
    try {
      const result = await runJob();
      logger.info(metric("assessment_retention_completed", {
        abandonedPurged: result.abandonedPurged,
        batchLimitReached: result.batchLimitReached,
        batchSize: result.batchSize,
        candidatesExamined: result.candidatesExamined,
        completedPurged: result.completedPurged,
        durationMs: Math.max(0, now() - startedAt),
        failureCount: 0,
        purged: result.purged,
      }));
      return NextResponse.json({ ok: true, ...result });
    } catch (error) {
      logger.error(metric("assessment_retention_failed", {
        durationMs: Math.max(0, now() - startedAt),
        errorType: error instanceof Error ? error.name : "UnknownError",
        failureCount: 1,
      }));
      return NextResponse.json({ error: "Retention job failed." }, { status: 500 });
    }
  };
}

export const GET = createAssessmentRetentionHandler();
