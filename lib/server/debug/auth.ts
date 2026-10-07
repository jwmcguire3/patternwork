import { constantTimeEqual } from "../security/crypto.ts";

export type DebugAuthorization = "authorized" | "disabled" | "unauthorized";

export function authorizeDebugRequest(request: Request): DebugAuthorization {
  const expected = process.env.PATTERNWORK_DEBUG_TOKEN;
  if (!expected || expected.length < 32) return "disabled";

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/iu.exec(authorization);
  if (!match || !constantTimeEqual(match[1], expected)) return "unauthorized";
  return "authorized";
}

export function debugAuthorizationResponse(status: DebugAuthorization): Response | undefined {
  if (status === "authorized") return undefined;
  const headers = { "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" };
  if (status === "disabled") {
    return Response.json({ error: "Debug tools are disabled until PATTERNWORK_DEBUG_TOKEN is configured." }, { status: 503, headers });
  }
  return Response.json({ error: "Unauthorized." }, { status: 401, headers });
}
