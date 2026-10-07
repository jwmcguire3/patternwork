import { randomUUID } from "node:crypto";
import { prisma } from "../../prisma.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import type {
  ClassifiedReportFailure,
  PassReportWorkflowInput,
  ReportAttemptPhase,
  ReportFailureCategory,
  ReportRetryAudience,
} from "./types.ts";
import { classifyReportFailure } from "./failure-policy.ts";
export { classifyReportFailure, failureFromUnknown } from "./failure-policy.ts";

export const REPORT_ATTEMPT_STALL_MS = 30 * 60 * 1_000;

type AttemptRequester = "COMPLETION" | "USER" | "OPERATOR" | "BACKFILL";

export interface AttemptTransaction {
  patternworkV31AssessmentSnapshot: {
    findUnique(args: unknown): Promise<AttemptSnapshotRecord | null>;
    findFirst(args: unknown): Promise<AttemptSnapshotRecord | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportWorkflowAttempt: {
    findUnique(args: unknown): Promise<AttemptRecord | null>;
    findFirst(args: unknown): Promise<AttemptRecord | null>;
    create(args: unknown): Promise<AttemptRecord>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportRun: {
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}

interface AttemptRecord {
  id: string;
  assessmentSnapshotId: string;
  attemptNumber: number;
  invocationKey: string;
  requestedBy: AttemptRequester;
  workflowRunId?: string | null;
  watchdogRunId?: string | null;
  status: string;
  retryAudience: ReportRetryAudience;
  heartbeatAt: Date;
  startedAt?: Date | null;
  assessmentSnapshot?: AttemptSnapshotRecord;
}

interface AttemptSnapshotRecord {
  id: string;
  assessmentSessionId: string;
  snapshotId: string;
  completedPass: number;
  currentReportAttemptNumber: number;
  frozenAt?: Date;
  reportRuns?: Array<{ reportType: string; status: string; artifact?: { artifactStatus: string; pdfStatus: string } | null }>;
  reportAttempts?: AttemptRecord[];
}

const attemptDb = prisma as unknown as AttemptTransaction & {
  $transaction<T>(fn: (tx: AttemptTransaction) => Promise<T>, options?: unknown): Promise<T>;
};

export class ReportAttemptError extends Error {
  constructor(readonly code: "not_found" | "not_retryable" | "conflict" | "already_released", message: string) {
    super(message);
    this.name = "ReportAttemptError";
  }
}

export function expectedReportTypes(completedPass: 1 | 2): readonly ("MAP" | "IFS" | "PV" | "ATT" | "SYNTHESIS")[] {
  return completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
}

export function isCompleteActiveReportSet(
  completedPass: 1 | 2,
  runs: readonly { reportType: string; status: string; artifact?: { artifactStatus: string; pdfStatus: string } | null }[],
): boolean {
  const expected = expectedReportTypes(completedPass);
  return expected.every((reportType) => runs.some((run) =>
    run.reportType === reportType && run.status === "SUCCEEDED" &&
    run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY"));
}

export function isCurrentReportAttemptOwner(
  input: { readonly attemptId?: string; readonly attemptNumber?: number },
  persisted: { readonly id: string; readonly attemptNumber: number; readonly status: string; readonly currentAttemptNumber: number },
): boolean {
  return Boolean(input.attemptId && input.attemptNumber && persisted.id === input.attemptId && persisted.attemptNumber === input.attemptNumber && persisted.currentAttemptNumber === input.attemptNumber && persisted.status === "RUNNING");
}

export function canRequestReportRetry(
  attempt: { readonly status: string; readonly retryAudience: ReportRetryAudience } | null,
  requestedBy: "USER" | "OPERATOR",
): boolean {
  return Boolean(attempt && ["FAILED", "STALLED"].includes(attempt.status) && attempt.retryAudience === requestedBy);
}

export function buildAttemptInvocationKey(input: {
  assessmentSessionId: string;
  snapshotId: string;
  completedPass: 1 | 2;
  attemptId: string;
  attemptNumber: number;
}): string {
  return `pw31-report-${sha256Canonical({ ...input, contract: "PWQE3-CONTRACT-2", promptRelease: "4.1.0" })}`;
}

export async function createReportAttemptWithClient(
  tx: AttemptTransaction,
  input: {
    snapshotDatabaseId: string;
    assessmentSessionId: string;
    snapshotId: string;
    completedPass: 1 | 2;
    requestedBy: AttemptRequester;
    requestIdempotencyKey?: string;
    now?: Date;
  },
): Promise<PassReportWorkflowInput> {
  if (input.requestIdempotencyKey) {
    const replay = await tx.patternworkV31ReportWorkflowAttempt.findUnique({ where: { requestIdempotencyKey: input.requestIdempotencyKey } });
    if (replay) {
      if (replay.assessmentSnapshotId !== input.snapshotDatabaseId || replay.requestedBy !== input.requestedBy) throw new ReportAttemptError("conflict", "Idempotency key reuse conflicts with the original retry request.");
      return {
      assessmentSessionId: input.assessmentSessionId, snapshotId: input.snapshotId, completedPass: input.completedPass,
      attemptId: replay.id, attemptNumber: replay.attemptNumber, invocationKey: replay.invocationKey,
      };
    }
  }
  const snapshot = await tx.patternworkV31AssessmentSnapshot.findUnique({
    where: { id: input.snapshotDatabaseId },
    select: { currentReportAttemptNumber: true },
  });
  if (!snapshot) throw new ReportAttemptError("not_found", "Assessment snapshot is unavailable.");
  const attemptNumber = snapshot.currentReportAttemptNumber + 1;
  const advanced = await tx.patternworkV31AssessmentSnapshot.updateMany({
    where: { id: input.snapshotDatabaseId, currentReportAttemptNumber: snapshot.currentReportAttemptNumber },
    data: { currentReportAttemptNumber: attemptNumber },
  });
  if (advanced.count !== 1) throw new ReportAttemptError("conflict", "A report attempt was created concurrently.");
  const attemptId = `pwfa_${randomUUID()}`;
  const invocation = {
    assessmentSessionId: input.assessmentSessionId,
    snapshotId: input.snapshotId,
    completedPass: input.completedPass,
    attemptId,
    attemptNumber,
    invocationKey: "",
  } satisfies PassReportWorkflowInput;
  const invocationKey = buildAttemptInvocationKey(invocation);
  await tx.patternworkV31ReportWorkflowAttempt.create({ data: {
    id: attemptId,
    assessmentSnapshotId: input.snapshotDatabaseId,
    attemptNumber,
    invocationKey,
    requestIdempotencyKey: input.requestIdempotencyKey,
    requestedBy: input.requestedBy,
    heartbeatAt: input.now ?? new Date(),
  } });
  return { ...invocation, invocationKey };
}

export async function bindAttemptRunIds(input: PassReportWorkflowInput, ids: { workflowRunId?: string; watchdogRunId?: string }): Promise<void> {
  if (!input.attemptId || !input.attemptNumber) throw new ReportAttemptError("conflict", "Durable report attempt identity is required.");
  const updated = await attemptDb.patternworkV31ReportWorkflowAttempt.updateMany({
    where: { id: input.attemptId, attemptNumber: input.attemptNumber, status: { in: ["QUEUED", "RUNNING", "SUCCEEDED"] }, assessmentSnapshot: { currentReportAttemptNumber: input.attemptNumber } },
    data: ids,
  });
  if (updated.count !== 1) throw new ReportAttemptError("conflict", "Report attempt is no longer current.");
}

export async function claimReportAttempt(input: PassReportWorkflowInput, now = new Date()): Promise<"claimed" | "already_released"> {
  if (!input.attemptId || !input.attemptNumber) return "claimed";
  return attemptDb.$transaction(async (tx) => {
    const attempt = await tx.patternworkV31ReportWorkflowAttempt.findUnique({
      where: { id: input.attemptId },
      include: { assessmentSnapshot: { include: { reportRuns: { include: { artifact: true } } } } },
    });
    if (!attempt || !attempt.assessmentSnapshot || attempt.attemptNumber !== input.attemptNumber || attempt.assessmentSnapshot.currentReportAttemptNumber !== input.attemptNumber) {
      throw new ReportAttemptError("conflict", "Report attempt is stale.");
    }
    if (isCompleteActiveReportSet(input.completedPass, attempt.assessmentSnapshot.reportRuns ?? [])) return "already_released";
    if (attempt.status === "RUNNING") return "claimed";
    const claimed = await tx.patternworkV31ReportWorkflowAttempt.updateMany({
      where: { id: input.attemptId, status: "QUEUED" },
      data: { status: "RUNNING", phase: "PREFLIGHT", startedAt: attempt.startedAt ?? now, heartbeatAt: now, failureCategory: null, retryAudience: "NONE", failureCode: null, failureMessage: null, finishedAt: null },
    });
    if (claimed.count !== 1) throw new ReportAttemptError("conflict", "Report attempt cannot be claimed.");
    return "claimed";
  }, { isolationLevel: "Serializable" });
}

export async function heartbeatReportAttempt(input: PassReportWorkflowInput, phase: ReportAttemptPhase, now = new Date()): Promise<void> {
  if (!input.attemptId || !input.attemptNumber) return;
  const updated = await attemptDb.patternworkV31ReportWorkflowAttempt.updateMany({
    where: { id: input.attemptId, attemptNumber: input.attemptNumber, status: "RUNNING", assessmentSnapshot: { currentReportAttemptNumber: input.attemptNumber } },
    data: { phase, heartbeatAt: now },
  });
  if (updated.count !== 1) throw new ReportAttemptError("conflict", "Report attempt lost ownership.");
}

export async function failReportAttempt(input: PassReportWorkflowInput, failure: ClassifiedReportFailure, now = new Date()): Promise<boolean> {
  if (!input.attemptId || !input.attemptNumber) return false;
  return attemptDb.$transaction(async (tx) => {
    const updated = await tx.patternworkV31ReportWorkflowAttempt.updateMany({
      where: { id: input.attemptId, attemptNumber: input.attemptNumber, status: { in: ["QUEUED", "RUNNING"] }, assessmentSnapshot: { currentReportAttemptNumber: input.attemptNumber } },
      data: { status: failure.category === "STALLED" ? "STALLED" : "FAILED", failureCategory: failure.category, retryAudience: failure.retryAudience, failureCode: failure.code, failureMessage: failure.message, finishedAt: now, heartbeatAt: now },
    });
    if (updated.count !== 1) return false;
    await tx.patternworkV31ReportRun.updateMany({
      where: { reportWorkflowAttemptId: input.attemptId, status: { not: "SUCCEEDED" } },
      data: { status: "FAILED", failureCode: failure.code, failureMessage: failure.message, finishedAt: now },
    });
    return true;
  }, { isolationLevel: "Serializable" });
}

export async function markEnqueueFailure(input: PassReportWorkflowInput, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  await failReportAttempt(input, classifyReportFailure("workflow_enqueue_failed", message));
}

export interface WatchdogResult { readonly status: "terminal" | "waiting" | "stalled"; readonly nextCheckAt?: string }

export function planReportAttemptWatchdog(
  attempt: { readonly status: string; readonly attemptNumber: number; readonly heartbeatAt: Date } | null,
  expectedAttemptNumber: number,
  currentAttemptNumber: number,
  now: Date,
): WatchdogResult {
  if (!attempt || !["QUEUED", "RUNNING"].includes(attempt.status) || attempt.attemptNumber !== expectedAttemptNumber || currentAttemptNumber !== expectedAttemptNumber) return { status: "terminal" };
  const deadline = new Date(attempt.heartbeatAt.getTime() + REPORT_ATTEMPT_STALL_MS);
  return deadline > now ? { status: "waiting", nextCheckAt: deadline.toISOString() } : { status: "stalled" };
}

export async function inspectReportAttemptWatchdog(input: PassReportWorkflowInput, now = new Date()): Promise<WatchdogResult> {
  if (!input.attemptId || !input.attemptNumber) return { status: "terminal" };
  const attempt = await attemptDb.patternworkV31ReportWorkflowAttempt.findUnique({
    where: { id: input.attemptId },
    include: { assessmentSnapshot: { select: { currentReportAttemptNumber: true } } },
  });
  const plan = planReportAttemptWatchdog(attempt, input.attemptNumber, attempt?.assessmentSnapshot?.currentReportAttemptNumber ?? -1, now);
  if (plan.status !== "stalled") return plan;
  const stalled = await failReportAttempt(input, classifyReportFailure("workflow_stalled", "Report workflow emitted no durable heartbeat for 30 minutes."), now);
  return { status: stalled ? "stalled" : "terminal" };
}

export async function createRetryAttempt(input: {
  assessmentSessionId: string;
  requestIdempotencyKey: string;
  requestedBy: "USER" | "OPERATOR";
  snapshotId?: string;
  now?: Date;
}): Promise<{ readonly invocation: PassReportWorkflowInput; readonly replay: boolean; readonly workflowRunId?: string; readonly watchdogRunId?: string }> {
  return attemptDb.$transaction(async (tx) => {
    const replay = await tx.patternworkV31ReportWorkflowAttempt.findUnique({ where: { requestIdempotencyKey: input.requestIdempotencyKey }, include: { assessmentSnapshot: true } });
    if (replay) {
      const replaySnapshot = replay.assessmentSnapshot;
      if (!replaySnapshot || replaySnapshot.assessmentSessionId !== input.assessmentSessionId || replay.requestedBy !== input.requestedBy || (input.snapshotId && replaySnapshot.snapshotId !== input.snapshotId)) throw new ReportAttemptError("conflict", "Idempotency key reuse conflicts with the original retry request.");
      return { replay: true, invocation: { assessmentSessionId: input.assessmentSessionId, snapshotId: replaySnapshot.snapshotId, completedPass: replaySnapshot.completedPass as 1 | 2, attemptId: replay.id, attemptNumber: replay.attemptNumber, invocationKey: replay.invocationKey }, ...(replay.workflowRunId ? { workflowRunId: replay.workflowRunId } : {}), ...(replay.watchdogRunId ? { watchdogRunId: replay.watchdogRunId } : {}) };
    }
    const snapshot = await tx.patternworkV31AssessmentSnapshot.findFirst({
      where: { assessmentSessionId: input.assessmentSessionId, ...(input.snapshotId ? { snapshotId: input.snapshotId } : {}) },
      orderBy: [{ completedPass: "desc" }, { frozenAt: "desc" }],
      include: { reportRuns: { include: { artifact: true } }, reportAttempts: { orderBy: { attemptNumber: "desc" }, take: 1 } },
    });
    if (!snapshot || (snapshot.completedPass !== 1 && snapshot.completedPass !== 2)) throw new ReportAttemptError("not_found", "No report snapshot is available to retry.");
    if (isCompleteActiveReportSet(snapshot.completedPass, snapshot.reportRuns ?? [])) throw new ReportAttemptError("already_released", "Reports are already available.");
    const current = snapshot.reportAttempts?.[0] ?? null;
    if (!canRequestReportRetry(current, input.requestedBy)) {
      throw new ReportAttemptError("not_retryable", `This failure requires ${current?.retryAudience?.toLowerCase() ?? "operator"} retry.`);
    }
    const invocation = await createReportAttemptWithClient(tx, {
      snapshotDatabaseId: snapshot.id,
      assessmentSessionId: input.assessmentSessionId,
      snapshotId: snapshot.snapshotId,
      completedPass: snapshot.completedPass,
      requestedBy: input.requestedBy,
      requestIdempotencyKey: input.requestIdempotencyKey,
      now: input.now,
    });
    return { replay: false, invocation };
  }, { isolationLevel: "Serializable" });
}

export function reportFailureStatus(category: ReportFailureCategory | null, audience: ReportRetryAudience): { userRetryable: boolean; operatorRetryable: boolean } {
  return { userRetryable: audience === "USER", operatorRetryable: audience === "OPERATOR" && category !== null };
}
