import { NextRequest, NextResponse } from "next/server";
import { getAssessmentState } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";

export async function GET(request: NextRequest) {
  try {
    const result = await getAssessmentState(authenticatedAssessmentSessionId(request));
    return NextResponse.json({ state: result.state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: "Assessment session is unavailable." }, { status: assessmentErrorStatus(error) });
  }
}
