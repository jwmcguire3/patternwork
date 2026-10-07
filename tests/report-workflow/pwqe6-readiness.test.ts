import assert from "node:assert/strict";
import test from "node:test";
import { assertPwqe6ReportActivationReady } from "@/lib/server/reports/pwqe6-readiness";

test("PWQE6 live readiness fails closed when reviewed provider qualification is absent", async () => {
  const previousManifest = process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
  const previousDigest = process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
  delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
  delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
  try {
    await assert.rejects(assertPwqe6ReportActivationReady(), /disabled until a reviewed v5 qualification manifest is configured/i);
  } finally {
    if (previousManifest === undefined) delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
    else process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON = previousManifest;
    if (previousDigest === undefined) delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
    else process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256 = previousDigest;
  }
});
