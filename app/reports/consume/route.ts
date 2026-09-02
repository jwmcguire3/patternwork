import { NextResponse } from "next/server";
import { consumeViewReportToken, issueReportViewCookie, REPORT_VIEW_COOKIE, reportViewCookieOptions } from "../_server/access";

export function reportViewRedirectResponse(url: URL, access: { readonly sessionId: string; readonly expiresAt: Date }): NextResponse {
  const response = NextResponse.redirect(new URL(`/reports/${encodeURIComponent(access.sessionId)}`, url.origin), 303);
  response.cookies.set(REPORT_VIEW_COOKIE, issueReportViewCookie(access.sessionId, access.expiresAt), reportViewCookieOptions);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  try {
    const access = await consumeViewReportToken(token);
    return reportViewRedirectResponse(url, access);
  } catch {
    return NextResponse.redirect(new URL("/reports?error=invalid", url.origin), 303);
  }
}
