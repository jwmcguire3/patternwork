import assert from "node:assert/strict";
import test from "node:test";
import {
  REPORT_ATTEMPT_STALL_MS,
  buildAttemptInvocationKey,
  canRequestReportRetry,
  classifyReportFailure,
  createReportAttemptWithClient,
  isCompleteActiveReportSet,
  isCurrentReportAttemptOwner,
  planReportAttemptWatchdog,
  ReportAttemptError,
  type AttemptTransaction,
} from "../../lib/server/reports/attempts.ts";
import { reportGenerationReadiness, type ReportPreflightResult } from "../../lib/server/reports/preflight.ts";

test("failure classification exposes only transient and stalled failures to user retry", () => {
  assert.deepEqual(classifyReportFailure("network", "offline"), { category: "TRANSIENT", retryAudience: "USER", code: "network", message: "Report preparation was interrupted and can be retried." });
  assert.equal(classifyReportFailure("workflow_stalled", "late").retryAudience, "USER");
  for (const code of ["input_contract_invalid", "cost_cap_exceeded", "pdf_verification_failed", "client_error", "atomic_release_failed"]) {
    assert.equal(classifyReportFailure(code, "blocked").retryAudience, "OPERATOR", code);
  }
});

test("READY requires every expected active and PDF-ready artifact in the pass", () => {
  const ready = (reportType: string) => ({ reportType, status: "SUCCEEDED", artifact: { artifactStatus: "ACTIVE", pdfStatus: "READY" } });
  assert.equal(isCompleteActiveReportSet(1, [ready("MAP")]), true);
  assert.equal(isCompleteActiveReportSet(2, [ready("IFS"), ready("PV"), ready("ATT")]), false);
  assert.equal(isCompleteActiveReportSet(2, [ready("IFS"), ready("PV"), ready("ATT"), ready("SYNTHESIS")]), true);
  assert.equal(isCompleteActiveReportSet(2, [ready("IFS"), ready("PV"), ready("ATT"), { ...ready("SYNTHESIS"), artifact: { artifactStatus: "VALIDATED", pdfStatus: "READY" } }]), false);
});

test("watchdog waits until 30 minutes, stalls only the current attempt, and ignores terminal work", () => {
  const heartbeatAt = new Date("2026-09-02T12:00:00.000Z");
  const active = { status: "RUNNING", attemptNumber: 2, heartbeatAt };
  const before = new Date(heartbeatAt.getTime() + REPORT_ATTEMPT_STALL_MS - 1);
  assert.equal(planReportAttemptWatchdog(active, 2, 2, before).status, "waiting");
  assert.equal(planReportAttemptWatchdog(active, 2, 2, new Date(heartbeatAt.getTime() + REPORT_ATTEMPT_STALL_MS)).status, "stalled");
  assert.equal(planReportAttemptWatchdog(active, 2, 3, new Date(heartbeatAt.getTime() + REPORT_ATTEMPT_STALL_MS)).status, "terminal");
  assert.equal(planReportAttemptWatchdog({ ...active, status: "SUCCEEDED" }, 2, 2, before).status, "terminal");
});

test("attempt identity makes retries distinct while replay remains idempotent", () => {
  const base = { assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 2 as const };
  const first = buildAttemptInvocationKey({ ...base, attemptId: "attempt-1", attemptNumber: 1 });
  const replay = buildAttemptInvocationKey({ ...base, attemptId: "attempt-1", attemptNumber: 1 });
  const retry = buildAttemptInvocationKey({ ...base, attemptId: "attempt-2", attemptNumber: 2 });
  assert.equal(first, replay);
  assert.notEqual(first, retry);
});

test("stale attempts and the wrong retry audience are rejected", () => {
  const input = { attemptId: "attempt-1", attemptNumber: 1 };
  assert.equal(isCurrentReportAttemptOwner(input, { id: "attempt-1", attemptNumber: 1, currentAttemptNumber: 1, status: "RUNNING" }), true);
  assert.equal(isCurrentReportAttemptOwner(input, { id: "attempt-1", attemptNumber: 1, currentAttemptNumber: 2, status: "RUNNING" }), false);
  assert.equal(isCurrentReportAttemptOwner(input, { id: "attempt-1", attemptNumber: 1, currentAttemptNumber: 1, status: "STALLED" }), false);
  assert.equal(canRequestReportRetry({ status: "FAILED", retryAudience: "USER" }, "USER"), true);
  assert.equal(canRequestReportRetry({ status: "FAILED", retryAudience: "OPERATOR" }, "USER"), false);
  assert.equal(canRequestReportRetry({ status: "RUNNING", retryAudience: "USER" }, "USER"), false);
});

test("concurrent attempt creation advances immutable ownership only once", async () => {
  let advanced = false;
  let creates = 0;
  const tx = {
    patternworkV31AssessmentSnapshot: {
      async findUnique() { return { id: "snapshot-db", assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 2, currentReportAttemptNumber: 0 }; },
      async findFirst() { return null; },
      async updateMany() { if (advanced) return { count: 0 }; advanced = true; return { count: 1 }; },
    },
    patternworkV31ReportWorkflowAttempt: {
      async findUnique() { return null; }, async findFirst() { return null; },
      async create({ data }: { data: Record<string, unknown> }) { creates += 1; return { ...data, status: "QUEUED", retryAudience: "NONE", heartbeatAt: new Date() }; },
      async updateMany() { return { count: 0 }; },
    },
    patternworkV31ReportRun: { async updateMany() { return { count: 0 }; } },
  } as unknown as AttemptTransaction;
  const input = { snapshotDatabaseId: "snapshot-db", assessmentSessionId: "session", snapshotId: "snapshot", completedPass: 2 as const, requestedBy: "USER" as const };
  const results = await Promise.allSettled([createReportAttemptWithClient(tx, input), createReportAttemptWithClient(tx, input)]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason instanceof ReportAttemptError && result.reason.code === "conflict").length, 1);
  assert.equal(creates, 1);
});

test("idempotency replay cannot cross snapshot or retry-audience bindings", async () => {
  const replay = { id: "attempt", assessmentSnapshotId: "snapshot-a", attemptNumber: 2, invocationKey: "invocation", requestedBy: "USER", status: "FAILED", retryAudience: "USER", heartbeatAt: new Date() };
  const tx = {
    patternworkV31AssessmentSnapshot: { async findUnique() { return null; }, async findFirst() { return null; }, async updateMany() { return { count: 0 }; } },
    patternworkV31ReportWorkflowAttempt: { async findUnique() { return replay; }, async findFirst() { return null; }, async create() { return replay; }, async updateMany() { return { count: 0 }; } },
    patternworkV31ReportRun: { async updateMany() { return { count: 0 }; } },
  } as unknown as AttemptTransaction;
  await assert.rejects(() => createReportAttemptWithClient(tx, { snapshotDatabaseId: "snapshot-b", assessmentSessionId: "session", snapshotId: "snapshot-b", completedPass: 2, requestedBy: "USER", requestIdempotencyKey: "same-key" }), (error: unknown) => error instanceof ReportAttemptError && error.code === "conflict");
  await assert.rejects(() => createReportAttemptWithClient(tx, { snapshotDatabaseId: "snapshot-a", assessmentSessionId: "session", snapshotId: "snapshot-a", completedPass: 2, requestedBy: "OPERATOR", requestIdempotencyKey: "same-key" }), (error: unknown) => error instanceof ReportAttemptError && error.code === "conflict");
});

test("delivery configuration remains observable without blocking generation readiness", () => {
  const result: ReportPreflightResult = { ok: false, checks: [
    { name: "OPENROUTER_API_KEY", ok: true, message: "configured" },
    { name: "pdf-raster-verifier", ok: true, message: "available" },
    { name: "RESEND_API_KEY", ok: false, message: "missing" },
    { name: "EMAIL_FROM", ok: false, message: "missing" },
    { name: "public-app-url", ok: false, message: "missing" },
  ] };
  assert.equal(result.ok, false, "operator preflight must report delivery configuration failures");
  assert.equal(reportGenerationReadiness(result).ok, true, "delivery configuration cannot block artifact generation");
  assert.deepEqual(reportGenerationReadiness(result).checks.map((check) => check.name), ["OPENROUTER_API_KEY", "pdf-raster-verifier"]);
});
