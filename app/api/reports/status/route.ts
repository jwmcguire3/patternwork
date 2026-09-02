import { NextResponse } from "next/server";
import { getReportStatusBoundaries } from "../../../../lib/server/reports/status.ts";

const NO_STORE = { "cache-control": "no-store, private" };

export async function GET(request: Request): Promise<Response> {
  const assessmentSessionId = new URL(request.url).searchParams.get("assessmentSessionId")?.trim();
  if (!assessmentSessionId) return NextResponse.json({ error: "assessmentSessionId is required" }, { status: 400, headers: NO_STORE });
  const boundaries = getReportStatusBoundaries();
  if (!await boundaries.authorization.authorize(request, assessmentSessionId)) {
    return NextResponse.json({ error: "not authorized" }, { status: 401, headers: NO_STORE });
  }
  const status = await boundaries.persistence.getStatus(assessmentSessionId);
  if (!status) return NextResponse.json({ error: "assessment session not found" }, { status: 404, headers: NO_STORE });
  return NextResponse.json(status, { headers: NO_STORE });
}
