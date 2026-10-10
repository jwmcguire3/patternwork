import { NextRequest, NextResponse } from "next/server";
import { applyPwqe5Control } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Number.isInteger(body.expectedRevision) || body.action !== "shorten") {
    return NextResponse.json({ error: "Revision and an authored control are required." }, { status: 400 });
  }
  try {
    const result = await applyPwqe5Control(authenticatedAssessmentSessionId(request), {
      expectedRevision: body.expectedRevision as number,
      action: "shorten",
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to apply assessment control." }, { status: assessmentErrorStatus(error) });
  }
}
