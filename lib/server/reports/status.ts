import { prisma } from "../../prisma.ts";
import { ASSESSMENT_SESSION_COOKIE, constantTimeEqual, cookieKeyringFromEnv, readSessionCookieValue } from "../security/index.ts";
import { isCompleteActiveReportSet, reportFailureStatus } from "./attempts.ts";
import type { ReportFailureCategory } from "./types.ts";

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
  readonly updatedAt: string;
}

export interface ReportSessionStatus {
  readonly assessmentSessionId: string;
  readonly runs: readonly ReportRunStatus[];
  readonly reportStatus: "NOT_STARTED" | "QUEUED" | "GENERATING" | "READY" | "FAILED";
  readonly deliveryStatus: "NOT_STARTED" | "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  readonly failureCategory?: string;
  readonly retryAudience: "USER" | "OPERATOR" | "NONE";
  readonly canRetry: boolean;
  readonly currentAttempt?: {
    readonly attemptId: string;
    readonly attemptNumber: number;
    readonly status: string;
    readonly failureCategory?: string;
    readonly userRetryable: boolean;
    readonly operatorRetryable: boolean;
  };
}

interface StatusPrisma {
  patternworkV31AssessmentSession: {
    findUnique(args: unknown): Promise<{
      id: string;
      snapshots: Array<{
        snapshotId: string;
        completedPass: number;
        currentReportAttemptNumber: number;
        reportAttempts: Array<{ id: string; attemptNumber: number; status: string; failureCategory: string | null; retryAudience: "USER" | "OPERATOR" | "NONE"; notifications: Array<{ type: string; status: string }> }>;
        reportRuns: Array<{
          reportType: string;
          status: string;
          failureCode: string | null;
          updatedAt: Date;
          artifact: { reportId: string; artifactStatus: string; pdfStatus: string; deliveries: Array<{ status: string }> } | null;
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
      return Boolean(claim?.sessionId && constantTimeEqual(claim.sessionId, assessmentSessionId));
    } catch {
      return false;
    }
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
            currentReportAttemptNumber: true,
            reportAttempts: { orderBy: { attemptNumber: "desc" }, take: 1, select: { id: true, attemptNumber: true, status: true, failureCategory: true, retryAudience: true, notifications: { orderBy: { createdAt: "desc" }, select: { type: true, status: true } } } },
            reportRuns: {
              orderBy: { reportType: "asc" },
              select: {
                reportType: true,
                status: true,
                failureCode: true,
                updatedAt: true,
                artifact: { select: { reportId: true, artifactStatus: true, pdfStatus: true, deliveries: { select: { status: true } } } },
              },
            },
          },
        },
      },
    });
    if (!session) return null;
    const latest = [...session.snapshots].sort((a, b) => b.completedPass - a.completedPass)[0];
    const complete = latest ? isCompleteActiveReportSet(latest.completedPass as 1 | 2, latest.reportRuns) : false;
    const attempt = latest?.reportAttempts[0];
    const retry = reportFailureStatus((attempt?.failureCategory ?? null) as ReportFailureCategory | null, attempt?.retryAudience ?? "NONE");
    const reportStatus = complete ? "READY" : !latest ? "NOT_STARTED" : attempt?.status === "QUEUED" ? "QUEUED" : attempt && ["FAILED", "STALLED"].includes(attempt.status) ? "FAILED" : "GENERATING";
    const deliveryStates = complete ? latest!.reportRuns.flatMap((run) => run.artifact?.deliveries.map((delivery) => delivery.status) ?? []) : [];
    const attemptNotification = attempt?.notifications.find((notification) => notification.type === (attempt.status === "FAILED" || attempt.status === "STALLED" ? "REPORT_FAILED" : "REPORT_STARTED"));
    const notificationDeliveryStatus = !attemptNotification ? "NOT_STARTED" : attemptNotification.status === "DELIVERED" ? "DELIVERED" : attemptNotification.status === "SENT" ? "SENT" : attemptNotification.status === "FAILED" || attemptNotification.status === "BOUNCED" ? "FAILED" : "PENDING";
    const deliveryStatus = !complete ? notificationDeliveryStatus : deliveryStates.length === 0 ? "NOT_STARTED" : deliveryStates.some((status) => status === "FAILED" || status === "BOUNCED") ? "FAILED" : deliveryStates.every((status) => status === "DELIVERED") ? "DELIVERED" : deliveryStates.every((status) => status === "SENT" || status === "DELIVERED") ? "SENT" : "PENDING";
    const failureCategory = complete && deliveryStatus === "FAILED" ? "DELIVERY" : attempt?.failureCategory ?? undefined;
    const retryAudience = complete && deliveryStatus === "FAILED" ? "OPERATOR" : attempt?.retryAudience ?? "NONE";
    return {
      assessmentSessionId: session.id,
      reportStatus,
      deliveryStatus,
      ...(failureCategory ? { failureCategory } : {}),
      retryAudience,
      canRetry: Boolean(attempt && ["FAILED", "STALLED"].includes(attempt.status) && attempt.retryAudience === "USER"),
      ...(attempt ? { currentAttempt: { attemptId: attempt.id, attemptNumber: attempt.attemptNumber, status: attempt.status, ...(attempt.failureCategory ? { failureCategory: attempt.failureCategory } : {}), ...retry } } : {}),
      runs: session.snapshots.flatMap((snapshot) => {
        const released = isCompleteActiveReportSet(snapshot.completedPass as 1 | 2, snapshot.reportRuns);
        return snapshot.reportRuns.map((run) => ({
        snapshotId: snapshot.snapshotId,
        completedPass: snapshot.completedPass,
        reportType: run.reportType,
        status: run.status,
        artifactAvailable: released && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY",
        ...(released && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY" ? { reportId: run.artifact.reportId } : {}),
        updatedAt: run.updatedAt.toISOString(),
      })); }),
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
