import { NextRequest, NextResponse } from "next/server";
import type { BankItemId, JsonValue } from "@/lib/question-engine/types";
import { saveAssessmentResponse } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function PUT(request: NextRequest) {
  let body: {
    expectedRevision?: unknown;
    interactionInstanceId?: unknown;
    bankItemId?: unknown;
    completionState?: unknown;
    response?: unknown;
    responseOrder?: unknown;
    userArousal?: unknown;
    unsafeContext?: unknown;
  };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim() ?? "";
  if (!idempotencyKey || !Number.isInteger(body.expectedRevision) || typeof body.interactionInstanceId !== "string" || !["PARTIAL", "COMPLETED", "SKIPPED"].includes(String(body.completionState))) {
    return NextResponse.json({ error: "Revision, interaction, completion state, and Idempotency-Key are required." }, { status: 400 });
  }
  try {
    const result = await saveAssessmentResponse(authenticatedAssessmentSessionId(request), {
      expectedRevision: body.expectedRevision as number,
      idempotencyKey,
      interactionInstanceId: body.interactionInstanceId,
      bankItemId: typeof body.bankItemId === "string" ? body.bankItemId as BankItemId : undefined,
      completionState: body.completionState as "PARTIAL" | "COMPLETED" | "SKIPPED",
      response: (body.response ?? null) as JsonValue,
      responseOrder: Array.isArray(body.responseOrder) ? body.responseOrder.filter((entry): entry is string => typeof entry === "string") : [],
      userArousal: ["low", "unknown", "elevated", "high"].includes(String(body.userArousal)) ? body.userArousal as "low" | "unknown" | "elevated" | "high" : undefined,
      unsafeContext: body.unsafeContext === true,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save response." }, { status: assessmentErrorStatus(error) });
  }
}
