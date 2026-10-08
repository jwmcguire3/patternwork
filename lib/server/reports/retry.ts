import { randomUUID } from "node:crypto";
import { createRetryAttempt } from "./attempts.ts";
import { enqueuePassReportWorkflow } from "./enqueue.ts";
import { prisma } from "../../prisma.ts";
import { isCompleteActiveReportSet, ReportAttemptError } from "./attempts.ts";
import { getReportDeliveryBoundary } from "../email/delivery.ts";
import { dispatchReportAttemptNotification } from "../notifications/report-status.ts";

export async function retryReportWorkflow(input: {
  readonly assessmentSessionId: string;
  readonly requestIdempotencyKey: string;
  readonly requestedBy: "USER" | "OPERATOR";
  readonly snapshotId?: string;
}) {
  const created = await createRetryAttempt(input);
  if (created.replay) return { ...created, status: "replayed" as const };
  try {
    const runs = await enqueuePassReportWorkflow(created.invocation);
    if (created.invocation.attemptId) await dispatchReportAttemptNotification(created.invocation.attemptId, "REPORT_STARTED");
    return { ...created, ...runs, status: "queued" as const };
  } catch (error) {
    if (created.invocation.attemptId) await dispatchReportAttemptNotification(created.invocation.attemptId, "REPORT_FAILED");
    throw error;
  }
}

export async function retryOperatorReportAttempt(attemptId: string, requestIdempotencyKey = `pw31-operator-retry:${attemptId}:${randomUUID()}`) {
  const attempt = await prisma.patternworkV31ReportWorkflowAttempt.findUnique({
    where: { id: attemptId },
    include: { assessmentSnapshot: { include: { reportRuns: { include: { artifact: true } }, assessmentSession: { select: { id: true } } } } },
  });
  if (!attempt || (attempt.assessmentSnapshot.completedPass !== 1 && attempt.assessmentSnapshot.completedPass !== 2)) throw new ReportAttemptError("not_found", "Report attempt is unavailable.");
  const workflowInput = { assessmentSessionId: attempt.assessmentSnapshot.assessmentSession.id, snapshotId: attempt.assessmentSnapshot.snapshotId, completedPass: attempt.assessmentSnapshot.completedPass, attemptId: attempt.id, attemptNumber: attempt.attemptNumber, invocationKey: attempt.invocationKey } as const;
  if (attempt.status === "SUCCEEDED" && isCompleteActiveReportSet(attempt.assessmentSnapshot.completedPass, attempt.assessmentSnapshot.reportRuns)) {
    await getReportDeliveryBoundary().deliverReleased(workflowInput);
    return { status: "delivery_replayed" as const, invocation: workflowInput };
  }
  if (attempt.retryAudience !== "OPERATOR" || !["FAILED", "STALLED"].includes(attempt.status)) throw new ReportAttemptError("not_retryable", "Report attempt is not eligible for operator retry.");
  return retryReportWorkflow({ assessmentSessionId: workflowInput.assessmentSessionId, snapshotId: workflowInput.snapshotId, requestedBy: "OPERATOR", requestIdempotencyKey });
}
