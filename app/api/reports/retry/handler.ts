import { NextRequest, NextResponse } from "next/server";
import { authenticatedAssessmentSessionId } from "../../../../lib/server/assessment/http.ts";
import { ReportAttemptError } from "../../../../lib/server/reports/attempts.ts";
import { retryReportWorkflow } from "../../../../lib/server/reports/retry.ts";

const NO_STORE = { "cache-control": "no-store, private" };

export async function POST(request: NextRequest): Promise<Response> {
  let body: { snapshotId?: unknown } = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as { snapshotId?: unknown };
  } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400, headers: NO_STORE }); }
  let assessmentSessionId: string;
  try { assessmentSessionId = authenticatedAssessmentSessionId(request); } catch { return NextResponse.json({ error: "not authorized" }, { status: 401, headers: NO_STORE }); }
  const snapshotId = typeof body.snapshotId === "string" ? body.snapshotId.trim() : undefined;
  const requestIdempotencyKey = request.headers.get("idempotency-key")?.trim() ?? "";
  if (requestIdempotencyKey.length < 12 || requestIdempotencyKey.length > 200) return NextResponse.json({ error: "A valid Idempotency-Key header is required." }, { status: 400, headers: NO_STORE });
  try {
    const result = await retryReportWorkflow({ assessmentSessionId, requestIdempotencyKey, requestedBy: "USER", ...(snapshotId ? { snapshotId } : {}) });
    return NextResponse.json({ status: result.status, attemptId: result.invocation.attemptId, attemptNumber: result.invocation.attemptNumber, workflowRunId: result.workflowRunId, watchdogRunId: result.watchdogRunId }, { status: 202, headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReportAttemptError) {
      const status = error.code === "not_found" ? 404 : error.code === "already_released" ? 200 : 409;
      return NextResponse.json({ error: status === 404 ? "No report is available to retry." : status === 200 ? "Reports are already available." : "This report cannot be retried here." }, { status, headers: NO_STORE });
    }
    return NextResponse.json({ error: "Unable to retry report generation." }, { status: 503, headers: NO_STORE });
  }
}
