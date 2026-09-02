import { decryptJson, encryptJson, packEnvelope, unpackEnvelope, type EncryptionKeyring } from "./crypto.ts";

export const ASSESSMENT_SESSION_COOKIE = "pw_assessment_session";
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionCookieClaim {
  readonly purpose: "assessment-session";
  readonly sessionId: string;
  readonly expiresAt: string;
}

export function issueSessionCookieValue(
  sessionId: string,
  keyring: EncryptionKeyring,
  now = new Date(),
): string {
  const expiresAt = new Date(now.getTime() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000);
  const claim: SessionCookieClaim = { purpose: "assessment-session", sessionId, expiresAt: expiresAt.toISOString() };
  return packEnvelope(encryptJson(claim, "patternwork:assessment-session-cookie", keyring));
}

export function readSessionCookieValue(
  value: string | undefined,
  keyring: EncryptionKeyring,
  now = new Date(),
): { sessionId: string; expiresAt: Date } | null {
  if (!value) return null;
  try {
    const claim = decryptJson<SessionCookieClaim>(unpackEnvelope(value), "patternwork:assessment-session-cookie", keyring);
    const expiresAt = new Date(claim.expiresAt);
    if (claim.purpose !== "assessment-session" || !claim.sessionId || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return null;
    return { sessionId: claim.sessionId, expiresAt };
  } catch {
    return null;
  }
}

export const assessmentSessionCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "lax" as const,
  path: "/",
  maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
};
