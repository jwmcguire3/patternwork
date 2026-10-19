import test from "node:test";
import assert from "node:assert/strict";
import { safeTransportErrorRecord, transportErrorDetails } from "./transport-error-details.mjs";

test("transport diagnostics retain nested socket cause fields without request secrets", () => {
  const socketError = Object.assign(new Error("connect ETIMEDOUT"), {
    code: "ETIMEDOUT",
    syscall: "connect",
    hostname: "api.openai.com",
    port: 443,
    authorization: "must-not-be-copied",
  });
  const error = new TypeError("fetch failed", { cause: socketError });
  const details = transportErrorDetails(error);
  assert.equal(details.schemaVersion, "PATTERNWORK-TRANSPORT-ERROR-DETAILS-V1");
  assert.equal(details.causeChain.length, 2);
  assert.equal(details.causeChain[0].message, "fetch failed");
  assert.equal(details.causeChain[1].code, "ETIMEDOUT");
  assert.equal(details.causeChain[1].hostname, "api.openai.com");
  assert.equal(details.causeChain[1].port, 443);
  assert.equal(JSON.stringify(details).includes("must-not-be-copied"), false);
});

test("transport diagnostics bound cause depth and tolerate circular causes", () => {
  const root = new Error("root");
  const child = new Error("child", { cause: root });
  root.cause = child;
  const details = transportErrorDetails(child);
  assert.equal(details.causeChain.length, 2);
  assert.equal(details.causeChain[0].message, "child");
  assert.equal(details.causeChain[1].message, "root");
});

test("transport diagnostic messages redact common inline credentials and URL queries", () => {
  const error = new Error("Authorization: Bearer sk-proj-secret-token Authorization: Basic dXNlcjpwYXNz \"Authorization\": \"Basic dXNlcjpwYXNz\" Authorization: Token opaque-token-123 \"Authorization\": \"Token opaque-token-123\" api_key=hidden-key failed at https://api.openai.com/path?access_token=query-secret");
  const details = transportErrorDetails(error);
  const serialized = JSON.stringify(details);
  for (const secret of ["sk-proj-secret-token", "dXNlcjpwYXNz", "opaque-token-123", "hidden-key", "query-secret"]) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.match(details.causeChain[0].message, /\[REDACTED\]/);
  assert.match(details.causeChain[0].message, /failed at https:\/\/api\.openai\.com\/path\?\[REDACTED\]/);
  const record = safeTransportErrorRecord(error);
  assert.equal(record.summary, details.causeChain[0].message);
  assert.equal(JSON.stringify(record).includes("dXNlcjpwYXNz"), false);
  assert.equal(JSON.stringify(record).includes("sk-proj-secret-token"), false);
});
