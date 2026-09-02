import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { consumeViewReportToken, issueReportViewCookie, authorizedSessionFromCookies } from "../../app/reports/_server/access.ts";
import { reportViewRedirectResponse } from "../../app/reports/consume/route.ts";
import { authenticatedAssessmentSessionId } from "../../lib/server/assessment/http.ts";
import { DefaultReportStatusAuthorization } from "../../lib/server/reports/status.ts";
import { scopedAccessTokenHash } from "../../lib/server/security/access-token.ts";
import { ASSESSMENT_SESSION_COOKIE, cookieKeyringFromEnv, issueSessionCookieValue } from "../../lib/server/security/index.ts";

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

test("VIEW_REPORT consumption response issues only the report-view cookie", () => {
  const priorSecret = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "test-cookie-secret-that-is-at-least-32-characters";
  try {
    const response = reportViewRedirectResponse(new URL("https://patternwork.example/reports/consume?token=secret"), {
      sessionId: "session-1",
      expiresAt: new Date("2026-09-03T16:00:00.000Z"),
    });
    const setCookie = response.headers.get("set-cookie") ?? "";
    assert.match(setCookie, /(?:^|,\s*)pw_report_view=/u);
    assert.doesNotMatch(setCookie, /pw_assessment_session=/u);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = priorSecret; }
});

test("report-view cookie cannot authenticate an assessment mutation", () => {
  const priorSecret = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "test-cookie-secret-that-is-at-least-32-characters";
  try {
    const reportCookie = issueReportViewCookie("session-1", new Date("2099-09-03T16:00:00.000Z"));
    const request = new NextRequest("https://patternwork.example/api/assessment/response", {
      headers: { cookie: `pw_report_view=${encodeURIComponent(reportCookie)}` },
    });
    assert.throws(() => authenticatedAssessmentSessionId(request), /Assessment session is unavailable/u);
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = priorSecret; }
});

test("report status rejects bearer tokens, including already-consumed VIEW_REPORT tokens", async () => {
  const request = new Request("https://patternwork.example/api/reports/status?assessmentSessionId=session-1", {
    headers: { authorization: "Bearer opaque-view-token" },
  });
  assert.equal(await new DefaultReportStatusAuthorization().authorize(request, "session-1"), false);
});

test("report status remains available to the matching assessment session only", async () => {
  const priorSecret = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "test-cookie-secret-that-is-at-least-32-characters";
  try {
    const assessmentCookie = issueSessionCookieValue("session-1", cookieKeyringFromEnv());
    const request = new Request("https://patternwork.example/api/reports/status?assessmentSessionId=session-1", {
      headers: { cookie: `${ASSESSMENT_SESSION_COOKIE}=${encodeURIComponent(assessmentCookie)}` },
    });
    const authorization = new DefaultReportStatusAuthorization();
    assert.equal(await authorization.authorize(request, "session-1"), true);
    assert.equal(await authorization.authorize(request, "session-2"), false);
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = priorSecret; }
});
