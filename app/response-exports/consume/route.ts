import { NextResponse } from "next/server";
import { consumeResponseExportToken, issueResponseExportCookie, RESPONSE_EXPORT_COOKIE, responseExportCookieOptions, type ResponseExportGrant } from "@/lib/server/exports";

export function responseExportRedirectResponse(url: URL, grant: ResponseExportGrant): NextResponse {
  const response = NextResponse.redirect(new URL(`/response-exports/${encodeURIComponent(grant.sessionId)}`, url.origin), 303);
  response.cookies.set(RESPONSE_EXPORT_COOKIE, issueResponseExportCookie(grant), { ...responseExportCookieOptions, maxAge: Math.min(responseExportCookieOptions.maxAge, Math.max(0, Math.floor((grant.expiresAt.getTime() - Date.now()) / 1000))) });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    return responseExportRedirectResponse(url, await consumeResponseExportToken(url.searchParams.get("token") ?? ""));
  } catch {
    return NextResponse.redirect(new URL("/response-exports?error=invalid", url.origin), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
