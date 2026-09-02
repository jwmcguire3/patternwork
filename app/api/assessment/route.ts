import { NextRequest, NextResponse } from "next/server";
import { purgeAssessmentSession } from "@/lib/server/assessment";
import { assessmentErrorStatus, authenticatedAssessmentSessionId } from "@/lib/server/assessment/http";
import { ASSESSMENT_SESSION_COOKIE } from "@/lib/server/security";

export async function DELETE(request: NextRequest) {
  try {
    await purgeAssessmentSession(authenticatedAssessmentSessionId(request));
    const response = NextResponse.json({ deleted: true });
    response.cookies.set(ASSESSMENT_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Unable to delete assessment." }, { status: assessmentErrorStatus(error) });
  }
}
