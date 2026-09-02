import assert from "node:assert/strict";
import test from "node:test";
import { issueScopedAccessToken, validateScopedAccessToken } from "../../lib/server/security/access-token.ts";
import { issueSessionCookieValue, readSessionCookieValue } from "../../lib/server/security/session-cookie.ts";

const keyring = { activeVersion: "cookie-v1", keys: { "cookie-v1": Buffer.alloc(32, 4) } } as const;

test("opaque session cookie supports same-device resume without exposing the session id", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const cookie = issueSessionCookieValue("session-secret-id", keyring, now);
  assert.equal(cookie.includes("session-secret-id"), false);
  assert.equal(readSessionCookieValue(cookie, keyring, now)?.sessionId, "session-secret-id");
  assert.equal(readSessionCookieValue(cookie, keyring, new Date("2026-10-03T12:00:00Z")), null);
});

test("30-day scoped token supports cross-device resume and rejects wrong scope, expiry, and replay", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  const issued = issueScopedAccessToken("RESUME_ASSESSMENT", now, "opaque-cross-device-token");
  const record = { tokenHash: issued.tokenHash, scope: issued.scope, expiresAt: issued.expiresAt };
  assert.equal(validateScopedAccessToken(issued.token, "RESUME_ASSESSMENT", record, now), "valid");
  assert.equal(validateScopedAccessToken(issued.token, "VIEW_REPORT", { ...record, scope: "RESUME_ASSESSMENT" }, now), "invalid");
  assert.equal(validateScopedAccessToken(issued.token, "RESUME_ASSESSMENT", record, new Date("2026-10-03T12:00:00Z")), "expired");
  assert.equal(validateScopedAccessToken(issued.token, "RESUME_ASSESSMENT", { ...record, usedAt: now }, now), "replayed");
});
