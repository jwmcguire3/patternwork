import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST as requestLink } from "../../app/api/response-exports/request-link/route.ts";
import { issueReportViewCookie } from "../../app/reports/_server/access.ts";
import { consumeResponseExportToken, requestResponseExportLinkForSession } from "../../lib/server/exports/service.ts";
import { authorizeResponseExportRequest, issueResponseExportCookie, RESPONSE_EXPORT_COOKIE } from "../../lib/server/exports/cookie.ts";
import { issueScopedAccessToken, scopedAccessTokenHash } from "../../lib/server/security/access-token.ts";
import { encryptString } from "../../lib/server/security/crypto.ts";

test("EXPORT_RESPONSES tokens have an exact 24-hour lifetime", () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const exportToken = issueScopedAccessToken("EXPORT_RESPONSES", now, "export-token");
  const reportToken = issueScopedAccessToken("VIEW_REPORT", now, "report-token");
  assert.equal(exportToken.expiresAt.toISOString(), "2026-09-03T12:00:00.000Z");
  assert.equal(reportToken.expiresAt.toISOString(), "2026-10-02T12:00:00.000Z");
  assert.notEqual(scopedAccessTokenHash("same", "EXPORT_RESPONSES"), scopedAccessTokenHash("same", "VIEW_REPORT"));
});

test("EXPORT_RESPONSES consumption is atomic, single-use, and pins the latest frozen snapshot", async () => {
  const token = "opaque-export-token";
  const now = new Date("2026-09-02T12:00:00.000Z");
  let consumed = false;
  const record = {
    id: "access-1", assessmentSessionId: "session-1", tokenHash: scopedAccessTokenHash(token, "EXPORT_RESPONSES"), purpose: "EXPORT_RESPONSES",
    usedAt: null, revokedAt: null, expiresAt: new Date("2026-09-03T12:00:00.000Z"),
    assessmentSession: { status: "COMPLETE", retentionExpiresAt: new Date("2026-10-01T00:00:00.000Z"), snapshots: [{ snapshotId: "snapshot-pass-2", snapshotRevision: "1" }] },
  };
  const database = { async $transaction(callback: (tx: unknown) => Promise<unknown>) {
    return callback({ patternworkV31AccessToken: {
      async findUnique() { return record; },
      async updateMany() { if (consumed) return { count: 0 }; consumed = true; return { count: 1 }; },
    } });
  } };
  const grant = await consumeResponseExportToken(token, now, database as never);
  assert.deepEqual(grant, { sessionId: "session-1", snapshotId: "snapshot-pass-2", snapshotRevision: "1", expiresAt: record.expiresAt });
  await assert.rejects(() => consumeResponseExportToken(token, now, database as never), /invalid_response_export_access/u);
});

test("only the encrypted export cookie authorizes and it is bound to session and expiry", () => {
  const prior = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "response-export-test-cookie-secret-with-32-characters";
  const now = new Date("2026-09-02T12:00:00.000Z");
  try {
    const value = issueResponseExportCookie({ sessionId: "session-1", snapshotId: "snapshot-2", snapshotRevision: "1", expiresAt: new Date("2026-09-03T12:00:00.000Z") });
    const authorized = new Request("https://patternwork.example/api/response-exports/session-1/responses.json", { headers: { cookie: `${RESPONSE_EXPORT_COOKIE}=${encodeURIComponent(value)}` } });
    assert.equal(authorizeResponseExportRequest(authorized, "session-1", now)?.snapshotId, "snapshot-2");
    assert.equal(authorizeResponseExportRequest(authorized, "session-2", now), null);
    assert.equal(authorizeResponseExportRequest(authorized, "session-1", new Date("2026-09-03T12:00:00.000Z")), null);
    const reportOnly = new Request("https://patternwork.example/api/response-exports/session-1/responses.json", { headers: { cookie: "pw_report_view=report; pw_assessment_session=assessment" } });
    assert.equal(authorizeResponseExportRequest(reportOnly, "session-1", now), null);
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = prior; }
});

test("report-view access cannot request or download raw responses", async () => {
  const prior = process.env.ASSESSMENT_COOKIE_SECRET;
  process.env.ASSESSMENT_COOKIE_SECRET = "response-export-test-cookie-secret-with-32-characters";
  try {
    const reportCookie = issueReportViewCookie("session-1", new Date("2099-01-01T00:00:00.000Z"));
    const request = new NextRequest("https://patternwork.example/api/response-exports/request-link", { method: "POST", headers: { cookie: `pw_report_view=${encodeURIComponent(reportCookie)}` } });
    assert.equal((await requestLink(request)).status, 401);
    assert.equal(authorizeResponseExportRequest(request, "session-1"), null);
  } finally { process.env.ASSESSMENT_COOKIE_SECRET = prior; }
});

test("authenticated link issuance persists only a scoped hash and delivers no response content", async () => {
  const now = new Date("2026-09-02T12:00:00.000Z");
  const keyring = { activeVersion: "v1", keys: { v1: Buffer.alloc(32, 7) } };
  const encryptedEmail = encryptString("person@example.com", "patternwork:assessment-email:session-1", keyring);
  let created: Record<string, unknown> | undefined;
  let delivered: Record<string, unknown> | undefined;
  const db = {
    patternworkV31AssessmentSession: { async findFirst() { return { id: "session-1", contactEmailCiphertext: encryptedEmail.ciphertext, contactEmailNonce: encryptedEmail.nonce, encryptionKeyVersion: encryptedEmail.keyVersion }; } },
    patternworkV31AccessToken: { async create(input: { data: Record<string, unknown> }) { created = input.data; return input.data; } },
  };
  await requestResponseExportLinkForSession({ sessionId: "session-1", baseUrl: "https://patternwork.example" }, {
    db: db as never, keyring, now: () => now, delivery: { async deliver(input) { delivered = input as unknown as Record<string, unknown>; } },
  });
  assert.equal(created?.purpose, "EXPORT_RESPONSES");
  assert.match(String(created?.tokenHash), /^[a-f0-9]{64}$/u);
  assert.equal("token" in (created ?? {}), false);
  assert.equal(delivered?.email, "person@example.com");
  assert.equal((delivered?.expiresAt as Date).toISOString(), "2026-09-03T12:00:00.000Z");
  assert.match(String(delivered?.exportUrl), /^https:\/\/patternwork\.example\/response-exports\/consume\?token=/u);
  assert.doesNotMatch(JSON.stringify(delivered), /privateNote|trustedEvidence|responseCiphertext/u);
});
