import { NextResponse } from "next/server";
import { authorizeDebugRequest, debugAuthorizationResponse } from "../../../../lib/server/debug/auth.ts";
import { loadDebugOverview } from "../../../../lib/server/debug/overview.ts";

const NO_STORE = { "cache-control": "no-store, private", "x-robots-tag": "noindex, nofollow, noarchive" };

export async function GET(request: Request): Promise<Response> {
  const unauthorized = debugAuthorizationResponse(authorizeDebugRequest(request));
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json(await loadDebugOverview(), { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "The database overview could not be loaded." }, { status: 503, headers: NO_STORE });
  }
}
