import { NextRequest, NextResponse } from "next/server";
import { savePwqe51ReplayBinding } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; outcome?: unknown; correctionOfBindingRef?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!Number.isSafeInteger(body.expectedRevision) || !idempotencyKey
    || !["different", "same", "unknown", "no_event", "skip"].includes(String(body.outcome))
    || (body.correctionOfBindingRef !== undefined && typeof body.correctionOfBindingRef !== "string")) {
    return NextResponse.json({ error: "Revision, replay outcome, and Idempotency-Key are required." }, { status: 400 });
  }
  try {
    const result = await savePwqe51ReplayBinding(authenticatedAssessmentSessionId(request), {
      expectedRevision: body.expectedRevision as number,
      idempotencyKey,
      outcome: body.outcome as "different" | "same" | "unknown" | "no_event" | "skip",
      ...(typeof body.correctionOfBindingRef === "string" ? { correctionOfBindingRef: body.correctionOfBindingRef } : {}),
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save replay decision." }, { status: assessmentErrorStatus(error) });
  }
}
