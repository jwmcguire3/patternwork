import { NextRequest, NextResponse } from "next/server";
import { assessmentErrorStatus, authenticatedAssessmentSessionId, publicBaseUrl } from "@/lib/server/assessment/http";
import { requestResponseExportLinkForSession } from "@/lib/server/exports";

const accepted = { accepted: true, message: "A secure response-export link will be sent to the email saved with this assessment." };

export async function POST(request: NextRequest): Promise<Response> {
  try {
    const sessionId = authenticatedAssessmentSessionId(request);
    await requestResponseExportLinkForSession({ sessionId, baseUrl: publicBaseUrl(request) });
    return NextResponse.json(accepted, { status: 202, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch (error) {
    const status = assessmentErrorStatus(error);
    return NextResponse.json({ error: status === 500 ? "Response export is temporarily unavailable." : "Assessment session is unavailable." }, { status: status === 500 ? 503 : status, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
}
