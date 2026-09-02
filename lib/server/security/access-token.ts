import { constantTimeEqual, randomOpaqueToken, sha256 } from "./crypto.ts";

export const ACCESS_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export type AccessTokenScope = "RESUME_ASSESSMENT" | "VIEW_REPORT";

export function scopedAccessTokenHash(token: string, scope: AccessTokenScope): string {
  return sha256(`patternwork:access-token:${scope}:${token}`);
}

export function issueScopedAccessToken(scope: AccessTokenScope, now = new Date(), token = randomOpaqueToken()) {
  return { token, tokenHash: scopedAccessTokenHash(token, scope), scope, expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_MS) };
}

export function validateScopedAccessToken(
  token: string,
  scope: AccessTokenScope,
  record: { readonly tokenHash: string; readonly scope: AccessTokenScope; readonly expiresAt: Date; readonly usedAt?: Date | null; readonly revokedAt?: Date | null },
  now = new Date(),
): "valid" | "invalid" | "expired" | "replayed" {
  const digest = scopedAccessTokenHash(token, scope);
  if (!constantTimeEqual(digest, record.tokenHash) || record.scope !== scope) return "invalid";
  if (record.usedAt || record.revokedAt) return "replayed";
  if (record.expiresAt <= now) return "expired";
  return "valid";
}
