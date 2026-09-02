import { NextResponse } from "next/server";
import { consumeViewReportToken, issueReportViewCookie, REPORT_VIEW_COOKIE, reportViewCookieOptions } from "../_server/access";
import { ASSESSMENT_SESSION_COOKIE, assessmentSessionCookieOptions, cookieKeyringFromEnv, issueSessionCookieValue } from "@/lib/server/security";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  try {
    const access = await consumeViewReportToken(token);
    const response = NextResponse.redirect(new URL(`/reports/${encodeURIComponent(access.sessionId)}`, url.origin), 303);
    response.cookies.set(REPORT_VIEW_COOKIE, issueReportViewCookie(access.sessionId, access.expiresAt), reportViewCookieOptions);
    response.cookies.set(ASSESSMENT_SESSION_COOKIE, issueSessionCookieValue(access.sessionId, cookieKeyringFromEnv()), assessmentSessionCookieOptions);
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.redirect(new URL("/reports?error=invalid", url.origin), 303);
  }
}
