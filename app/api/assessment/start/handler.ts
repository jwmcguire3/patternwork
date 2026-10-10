import { NextRequest, NextResponse } from "next/server";
import { getAssessmentState, getPwqe51AssessmentState, pwqe51CandidateConfigured, requestAssessmentResumeLink, startAssessment, startPwqe51Assessment } from "@/lib/server/assessment";
import { authenticatedAssessmentSessionId, publicBaseUrl } from "@/lib/server/assessment/http";
import { ASSESSMENT_SESSION_COOKIE, assessmentSessionCookieOptions, cookieKeyringFromEnv, issueSessionCookieValue } from "@/lib/server/security";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: unknown; consentVersion?: unknown };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const consentVersion = typeof body.consentVersion === "string" ? body.consentVersion.trim() : "";
  if (!emailPattern.test(email) || consentVersion !== "PWQE5-CONSENT-1") return NextResponse.json({ error: "Email and current consent are required." }, { status: 400 });

  let usePwqe51: boolean;
  try { usePwqe51 = await pwqe51CandidateConfigured(); }
  catch (error) {
    console.error("PWQE 5.1 candidate readiness failed", error);
    return NextResponse.json({ error: "Unable to start assessment." }, { status: 503 });
  }

  try {
    const existingSessionId = authenticatedAssessmentSessionId(request);
    const current = usePwqe51
      ? await getPwqe51AssessmentState(existingSessionId)
      : await getAssessmentState(existingSessionId);
    if (!usePwqe51) await requestAssessmentResumeLink({ email, baseUrl: publicBaseUrl(request) });
    return NextResponse.json({ state: current.state }, { status: 200 });
  } catch {
    // A missing/expired device cookie starts a new session; email alone never authenticates an old one.
  }

  try {
    const created = usePwqe51
      ? await startPwqe51Assessment({ email, consentVersion, baseUrl: publicBaseUrl(request) })
      : await startAssessment({ email, consentVersion, baseUrl: publicBaseUrl(request) });
    const response = NextResponse.json({ state: created.state, notificationStatus: created.notificationStatus }, { status: 201 });
    response.cookies.set(ASSESSMENT_SESSION_COOKIE, issueSessionCookieValue(created.sessionId, cookieKeyringFromEnv()), assessmentSessionCookieOptions);
    return response;
  } catch (error) {
    console.error("Assessment start failed", error);
    return NextResponse.json({ error: "Unable to start assessment." }, { status: 503 });
  }
}
