import { NextRequest, NextResponse } from "next/server";
import { consumeAssessmentAccessToken } from "@/lib/server/assessment";
import { ASSESSMENT_SESSION_COOKIE, assessmentSessionCookieOptions, cookieKeyringFromEnv, issueSessionCookieValue } from "@/lib/server/security";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const destination = new URL("/assessment", request.nextUrl.origin);
  if (!token) return NextResponse.redirect(destination, 303);
  try {
    const consumed = await consumeAssessmentAccessToken(token);
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(ASSESSMENT_SESSION_COOKIE, issueSessionCookieValue(consumed.sessionId, cookieKeyringFromEnv()), assessmentSessionCookieOptions);
    return response;
  } catch {
    destination.searchParams.set("resume", "invalid");
    const response = NextResponse.redirect(destination, 303);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
