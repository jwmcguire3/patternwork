import assert from "node:assert/strict";
import test from "node:test";
import { getReportWorkflowDependencies } from "../../lib/server/reports/dependencies.ts";
import { acceptedLayersForPwrp71Report } from "../../lib/server/reports/steps.ts";
import type { GeneratedCanonicalArtifact } from "../../lib/server/reports/types.ts";

test("report dependencies do not require legacy PWQE 5.0 qualification before snapshot selection", () => {
  const previousCap = process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD;
  const previousManifest = process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
  const previousDigest = process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
  const previousEncryptionKey = process.env.PATTERNWORK_ENCRYPTION_KEY_V1;
  const previousCookieSecret = process.env.ASSESSMENT_COOKIE_SECRET;
  try {
    process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD = "2";
    process.env.PATTERNWORK_ENCRYPTION_KEY_V1 = Buffer.alloc(32, 7).toString("base64");
    process.env.ASSESSMENT_COOKIE_SECRET = "test-cookie-secret-with-at-least-32-characters";
    delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
    delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
    const dependencies = getReportWorkflowDependencies();
    assert.equal(dependencies.modelPolicy, undefined);
  } finally {
    if (previousCap === undefined) delete process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD;
    else process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD = previousCap;
    if (previousManifest === undefined) delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON;
    else process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON = previousManifest;
    if (previousDigest === undefined) delete process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256;
    else process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256 = previousDigest;
    if (previousEncryptionKey === undefined) delete process.env.PATTERNWORK_ENCRYPTION_KEY_V1;
    else process.env.PATTERNWORK_ENCRYPTION_KEY_V1 = previousEncryptionKey;
    if (previousCookieSecret === undefined) delete process.env.ASSESSMENT_COOKIE_SECRET;
    else process.env.ASSESSMENT_COOKIE_SECRET = previousCookieSecret;
  }
});

test("PWRP 7.1 PDF layer binding is supplied only to synthesis", () => {
  const generated = ["IFS", "PV", "ATT"].map((reportType) => ({
    reportType,
    artifact: { artifact_type: "pwrp71_report", draft: { report_type: reportType } },
  })) as unknown as GeneratedCanonicalArtifact[];

  assert.equal(acceptedLayersForPwrp71Report("IFS", generated), undefined);
  assert.equal(acceptedLayersForPwrp71Report("PV", generated), undefined);
  assert.equal(acceptedLayersForPwrp71Report("ATT", generated), undefined);
  assert.deepEqual(acceptedLayersForPwrp71Report("SYNTHESIS", generated), {
    IFS: { report_type: "IFS" }, PV: { report_type: "PV" }, ATT: { report_type: "ATT" },
  });
});
