import { NextRequest, NextResponse } from "next/server";
import { setAssessmentPause } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Number.isInteger(body.expectedRevision) || !["pause", "resume"].includes(String(body.action))) return NextResponse.json({ error: "Revision and action are required." }, { status: 400 });
  try {
    const result = await setAssessmentPause(authenticatedAssessmentSessionId(request), { expectedRevision: body.expectedRevision as number, action: body.action as "pause" | "resume" });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update assessment." }, { status: assessmentErrorStatus(error) });
  }
}
