import { NextRequest, NextResponse } from "next/server";
import { getAssessmentState, requestAssessmentResumeLink, startAssessment } from "@/lib/server/assessment";
import { authenticatedAssessmentSessionId, publicBaseUrl } from "@/lib/server/assessment/http";
import { ASSESSMENT_SESSION_COOKIE, assessmentSessionCookieOptions, cookieKeyringFromEnv, issueSessionCookieValue } from "@/lib/server/security";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: unknown; consentVersion?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const consentVersion = typeof body.consentVersion === "string" ? body.consentVersion.trim() : "";
  if (!emailPattern.test(email) || !consentVersion) return NextResponse.json({ error: "Email and consent are required." }, { status: 400 });

  try {
    const existingSessionId = authenticatedAssessmentSessionId(request);
    const current = await getAssessmentState(existingSessionId);
    await requestAssessmentResumeLink({ email, baseUrl: publicBaseUrl(request) });
    return NextResponse.json({ state: current.state }, { status: 200 });
  } catch {
    // A missing/expired device cookie starts a new session; email alone never authenticates an old one.
  }

  try {
    const created = await startAssessment({ email, consentVersion, baseUrl: publicBaseUrl(request) });
    const response = NextResponse.json({ state: created.state }, { status: 201 });
    response.cookies.set(ASSESSMENT_SESSION_COOKIE, issueSessionCookieValue(created.sessionId, cookieKeyringFromEnv()), assessmentSessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Assessment start failed", error);
    return NextResponse.json({ error: "Unable to start assessment." }, { status: 503 });
  }
}
