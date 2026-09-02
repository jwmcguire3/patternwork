import type { NextRequest } from "next/server";
import { cookieKeyringFromEnv, readSessionCookieValue } from "@/lib/server/security";
import { AssessmentError } from "./errors.ts";

export function authenticatedAssessmentSessionId(request: NextRequest): string {
  const claim = readSessionCookieValue(request.cookies.get("pw_assessment_session")?.value, cookieKeyringFromEnv());
  if (!claim) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  return claim.sessionId;
}

export function publicBaseUrl(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PATTERNWORK_APP_URL;
  if (configured) return configured;
  return request.nextUrl.origin;
}

export function assessmentErrorStatus(error: unknown): number {
  if (!(error instanceof AssessmentError)) return 500;
  if (error.code === "conflict") return 409;
  if (error.code === "invalid" || error.code === "completion_blocked") return 422;
  if (error.code === "expired" || error.code === "replayed" || error.code === "not_found") return 410;
  return 401;
}
