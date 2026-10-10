import { NextRequest, NextResponse } from "next/server";
import { requestAssessmentResumeLinkForSession } from "@/lib/server/assessment";
import { authenticatedAssessmentSessionId, publicBaseUrl } from "@/lib/server/assessment/http";

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const status = await requestAssessmentResumeLinkForSession({ sessionId: authenticatedAssessmentSessionId(request), baseUrl: publicBaseUrl(request) });
    return NextResponse.json({ status }, { status: status === "SENT" ? 202 : 503, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Unable to resend the secure resume link." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
