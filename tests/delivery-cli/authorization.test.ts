import assert from "node:assert/strict";
import test from "node:test";
import { consumeViewReportToken, issueReportViewCookie, authorizedSessionFromCookies } from "../../app/reports/_server/access.ts";
import { scopedAccessTokenHash } from "../../lib/server/security/access-token.ts";

test("VIEW_REPORT token is atomically single-use and becomes a scoped encrypted cookie", async () => {
  const priorSecret = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "test-cookie-secret-that-is-at-least-32-characters";
  const token = "opaque-view-token"; const now = new Date("2026-09-02T16:00:00.000Z");
  let consumed = false;
  const record = { id: "token-1", tokenHash: scopedAccessTokenHash(token, "VIEW_REPORT"), purpose: "VIEW_REPORT", usedAt: null, revokedAt: null, expiresAt: new Date("2026-09-03T16:00:00.000Z"), assessmentSessionId: "session-1", assessmentSession: { retentionExpiresAt: new Date("2026-10-01T00:00:00.000Z") } };
  const database = { async $transaction(callback: (tx: unknown) => Promise<unknown>) { return callback({ patternworkV31AccessToken: { async findUnique() { return record; }, async updateMany() { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; } } }); } };
  try {
    const result = await consumeViewReportToken(token, now, database as never);
    const cookie = issueReportViewCookie(result.sessionId, result.expiresAt);
    assert.equal(authorizedSessionFromCookies({ report: cookie }, now), "session-1");
    await assert.rejects(() => consumeViewReportToken(token, now, database as never), /invalid_report_access/u);
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = priorSecret; }
});

test("invalid cookies do not authorize or reveal a session", () => {
  assert.equal(authorizedSessionFromCookies({ assessment: "bad", report: "bad" }), null);
});
