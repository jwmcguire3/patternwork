import { constantTimeEqual, cookieKeyringFromEnv, decryptJson, encryptJson, packEnvelope, unpackEnvelope } from "@/lib/server/security";
import type { ResponseExportGrant } from "./types.ts";

export const RESPONSE_EXPORT_COOKIE = "pw_response_export";
export const responseExportCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV !== "development",
  sameSite: "strict" as const,
  path: "/",
  maxAge: 24 * 60 * 60,
};

interface ResponseExportCookieClaim {
  readonly purpose: "response-export";
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly snapshotRevision: string;
  readonly expiresAt: string;
}

export function issueResponseExportCookie(grant: ResponseExportGrant): string {
  const claim: ResponseExportCookieClaim = {
    purpose: "response-export",
    sessionId: grant.sessionId,
    snapshotId: grant.snapshotId,
    snapshotRevision: grant.snapshotRevision,
    expiresAt: grant.expiresAt.toISOString(),
  };
  return packEnvelope(encryptJson(claim, "patternwork:response-export-cookie", cookieKeyringFromEnv()));
}

function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function readResponseExportCookie(value: string | undefined, now = new Date()): ResponseExportGrant | null {
  if (!value) return null;
  try {
    const claim = decryptJson<ResponseExportCookieClaim>(unpackEnvelope(value), "patternwork:response-export-cookie", cookieKeyringFromEnv());
    const expiresAt = new Date(claim.expiresAt);
    if (claim.purpose !== "response-export" || !claim.sessionId || !claim.snapshotId || !claim.snapshotRevision || !Number.isFinite(expiresAt.getTime()) || expiresAt <= now) return null;
    return { sessionId: claim.sessionId, snapshotId: claim.snapshotId, snapshotRevision: claim.snapshotRevision, expiresAt };
  } catch {
    return null;
  }
}

export function authorizeResponseExportRequest(request: Request, assessmentSessionId: string, now = new Date()): ResponseExportGrant | null {
  const grant = readResponseExportCookie(cookieValue(request, RESPONSE_EXPORT_COOKIE), now);
  return grant && constantTimeEqual(grant.sessionId, assessmentSessionId) ? grant : null;
}
