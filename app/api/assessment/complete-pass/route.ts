import { NextRequest, NextResponse } from "next/server";
import { completeAssessmentPass } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function POST(request: NextRequest) {
  let body: { expectedRevision?: unknown; completedPass?: unknown; action?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  if (!Number.isInteger(body.expectedRevision) || ![1, 2].includes(Number(body.completedPass)) || (body.action !== undefined && !["finish", "continue"].includes(String(body.action)))) return NextResponse.json({ error: "Revision and completed pass are required." }, { status: 400 });
  try {
    const result = await completeAssessmentPass(authenticatedAssessmentSessionId(request), { expectedRevision: body.expectedRevision as number, completedPass: body.completedPass as 1 | 2, action: body.action as "finish" | "continue" | undefined });
    return NextResponse.json({ ...result, assessmentId: result.state.sessionId, reportReadyUrl: result.state.reportReadyUrl }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to complete pass." }, { status: assessmentErrorStatus(error) });
  }
}
