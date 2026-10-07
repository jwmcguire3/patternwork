import { NextRequest, NextResponse } from "next/server";
import { completeAssessmentPass } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";
import { AssessmentError } from "@/lib/server/assessment/errors";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; completedPass?: unknown; action?: unknown; optedInTopics?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Number.isInteger(body.expectedRevision) || ![1, 2].includes(Number(body.completedPass)) || (body.action !== undefined && !["finish", "continue", "end"].includes(String(body.action))) || (body.optedInTopics !== undefined && (!Array.isArray(body.optedInTopics) || body.optedInTopics.some((topic) => typeof topic !== "string")))) return NextResponse.json({ error: "Revision and completed pass are required." }, { status: 400 });
  try {
    const result = await completeAssessmentPass(authenticatedAssessmentSessionId(request), { expectedRevision: body.expectedRevision as number, completedPass: body.completedPass as 1 | 2, action: body.action as "finish" | "continue" | "end" | undefined, optedInTopics: body.optedInTopics as string[] | undefined });
    return NextResponse.json({ ...result, assessmentId: result.state.sessionId, reportReadyUrl: result.state.reportReadyUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AssessmentError ? error.message : "Report preparation is temporarily unavailable. Your answers remain saved; please try again later." }, { status: assessmentErrorStatus(error) });
  }
}
