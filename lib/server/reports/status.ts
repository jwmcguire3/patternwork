import { prisma } from "../../prisma.ts";
import { cookieKeyringFromEnv, readSessionCookieValue, scopedAccessTokenHash, ASSESSMENT_SESSION_COOKIE } from "../security/index.ts";

export interface ReportStatusAuthorizationBoundary {
  authorize(request: Request, assessmentSessionId: string): Promise<boolean>;
}

export interface ReportStatusPersistenceBoundary {
  getStatus(assessmentSessionId: string): Promise<ReportSessionStatus | null>;
}

export interface ReportRunStatus {
  readonly snapshotId: string;
  readonly completedPass: number;
  readonly reportType: string;
  readonly status: string;
  readonly artifactAvailable: boolean;
  readonly reportId?: string;
  readonly failureCode?: string;
  readonly model?: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly reasoningTokens?: number;
  readonly totalTokens?: number;
  readonly costMicros?: string;
  readonly updatedAt: string;
}

export interface ReportSessionStatus {
  readonly assessmentSessionId: string;
  readonly runs: readonly ReportRunStatus[];
}

interface StatusPrisma {
  patternworkV31AccessToken: {
    findUnique(args: unknown): Promise<{
      assessmentSessionId: string;
      purpose: string;
      expiresAt: Date;
      usedAt: Date | null;
      revokedAt: Date | null;
    } | null>;
  };
  patternworkV31AssessmentSession: {
    findUnique(args: unknown): Promise<{
      id: string;
      snapshots: Array<{
        snapshotId: string;
        completedPass: number;
        reportRuns: Array<{
          reportType: string;
          status: string;
          failureCode: string | null;
          model: string | null;
          inputTokens: number | null;
          outputTokens: number | null;
          reasoningTokens: number | null;
          totalTokens: number | null;
          costMicros: bigint | null;
          updatedAt: Date;
          artifact: { reportId: string; artifactStatus: string } | null;
        }>;
      }>;
    } | null>;
  };
}

const statusPrisma = prisma as unknown as StatusPrisma;

function cookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

export class DefaultReportStatusAuthorization implements ReportStatusAuthorizationBoundary {
  async authorize(request: Request, assessmentSessionId: string): Promise<boolean> {
    try {
      const claim = readSessionCookieValue(cookie(request, ASSESSMENT_SESSION_COOKIE), cookieKeyringFromEnv());
      if (claim?.sessionId === assessmentSessionId) return true;
    } catch {
      // A missing keyring or malformed cookie falls through to the scoped view token.
    }
    const authorization = request.headers.get("authorization");
    const token = authorization?.match(/^Bearer\s+(.+)$/iu)?.[1];
    if (!token) return false;
    const record = await statusPrisma.patternworkV31AccessToken.findUnique({ where: { tokenHash: scopedAccessTokenHash(token, "VIEW_REPORT") } });
    return Boolean(
      record &&
      record.assessmentSessionId === assessmentSessionId &&
      record.purpose === "VIEW_REPORT" &&
      !record.revokedAt &&
      record.expiresAt > new Date(),
    );
  }
}

export class PrismaReportStatusPersistence implements ReportStatusPersistenceBoundary {
  async getStatus(assessmentSessionId: string): Promise<ReportSessionStatus | null> {
    const session = await statusPrisma.patternworkV31AssessmentSession.findUnique({
      where: { id: assessmentSessionId },
      select: {
        id: true,
        snapshots: {
          orderBy: { frozenAt: "asc" },
          select: {
            snapshotId: true,
            completedPass: true,
            reportRuns: {
              orderBy: { reportType: "asc" },
              select: {
                reportType: true,
                status: true,
                failureCode: true,
                model: true,
                inputTokens: true,
                outputTokens: true,
                reasoningTokens: true,
                totalTokens: true,
                costMicros: true,
                updatedAt: true,
                artifact: { select: { reportId: true, artifactStatus: true } },
              },
            },
          },
        },
      },
    });
    if (!session) return null;
    return {
      assessmentSessionId: session.id,
      runs: session.snapshots.flatMap((snapshot) => snapshot.reportRuns.map((run) => ({
        snapshotId: snapshot.snapshotId,
        completedPass: snapshot.completedPass,
        reportType: run.reportType,
        status: run.status,
        artifactAvailable: run.artifact?.artifactStatus === "ACTIVE",
        ...(run.artifact?.artifactStatus === "ACTIVE" ? { reportId: run.artifact.reportId } : {}),
        ...(run.failureCode ? { failureCode: run.failureCode } : {}),
        ...(run.model ? { model: run.model } : {}),
        ...(run.inputTokens !== null ? { inputTokens: run.inputTokens } : {}),
        ...(run.outputTokens !== null ? { outputTokens: run.outputTokens } : {}),
        ...(run.reasoningTokens !== null ? { reasoningTokens: run.reasoningTokens } : {}),
        ...(run.totalTokens !== null ? { totalTokens: run.totalTokens } : {}),
        ...(run.costMicros !== null ? { costMicros: run.costMicros.toString() } : {}),
        updatedAt: run.updatedAt.toISOString(),
      }))),
    };
  }
}

let testBoundaries: { authorization: ReportStatusAuthorizationBoundary; persistence: ReportStatusPersistenceBoundary } | undefined;

export function setReportStatusBoundariesForTests(boundaries: typeof testBoundaries): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Report status boundary override is test-only.");
  testBoundaries = boundaries;
}

export function getReportStatusBoundaries(): { authorization: ReportStatusAuthorizationBoundary; persistence: ReportStatusPersistenceBoundary } {
  return testBoundaries ?? {
    authorization: new DefaultReportStatusAuthorization(),
    persistence: new PrismaReportStatusPersistence(),
  };
}
