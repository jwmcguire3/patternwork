import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPwrp71ReportPrompt } from "../../lib/server/reports/prompts.ts";
import {
  loadPwrp71SourcePackage,
  PWRP71_RELEASE_MANIFEST_SHA256,
  PWRP71_RELEASE_MANIFEST_PATH,
  PWRP71_SOURCE_DIRECTORY,
  verifyPwrp71SourceIntegrity,
} from "../../lib/server/reports/pwrp71-source.ts";

test("PWRP 7.1 binds active prompts, schemas and the PWQE 5.1 evidence source", async () => {
  const integrity = await verifyPwrp71SourceIntegrity();
  assert.equal(integrity.ok, true, integrity.ok ? undefined : JSON.stringify(integrity.issues, null, 2));
  assert.equal(PWRP71_RELEASE_MANIFEST_PATH, "reporting/contracts/report_release_manifest.json");
  assert.match(PWRP71_RELEASE_MANIFEST_SHA256, /^[a-f0-9]{64}$/u);
  const loaded = await loadPwrp71SourcePackage();
  assert.equal(loaded.manifest.report_release, "PWRP-7.1.0-candidate.1");
  assert.equal(loaded.policy.compatible_question_release, "PWQE-5.1.0-candidate.1");
  assert.equal(loaded.policy.compatible_router_source_sha256, "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832");
  assert.equal(loaded.policy.runtime_implementation, "standalone_adapter_not_deployed");
  assert.equal(loaded.policy.findings_cardinality.minimum, null);
  assert.equal(loaded.policy.findings_cardinality.maximum, null);
  assert.equal(Object.keys(loaded.prompts).length, 8);
  assert.equal(loaded.schemas.reportDraft !== false, true);
  assert.equal(loaded.schemas.reportReview !== false, true);

  const semanticCasesPath = path.join(process.cwd(), "docs/plans/pwqe5.1-pwrp7.1/source/reporting/qualification/SEMANTIC_CASES.json");
  const semanticCasesBytes = await readFile(semanticCasesPath);
  const semanticCases = JSON.parse(semanticCasesBytes.toString("utf8")) as Record<string, unknown>;
  assert.equal(semanticCases.report_release, "PWRP-7.1.0-candidate.1");
  assert.equal(semanticCases.question_release, "PWQE-5.1.0-candidate.1");
  assert.ok(Array.isArray(semanticCases.cases));
  assert.equal(semanticCases.cases.length, 14);
  const deliveryManifestPath = path.join(process.cwd(), "docs/plans/pwqe5.1-pwrp7.1/source/DELIVERABLE_MANIFEST.json");
  const deliveryManifest = JSON.parse(await readFile(deliveryManifestPath, "utf8")) as {
    files: Record<string, string>;
    source_binding: { source_sha256: string; question_release: string };
  };
  assert.equal(deliveryManifest.source_binding.question_release, "PWQE-5.1.0-candidate.1");
  assert.equal(deliveryManifest.source_binding.source_sha256, loaded.policy.compatible_router_source_sha256);
  const actualSemanticCasesSha = createHash("sha256").update(semanticCasesBytes).digest("hex");
  assert.equal(actualSemanticCasesSha, deliveryManifest.files["reporting/qualification/SEMANTIC_CASES.json"]);
});

test("an edit to an active PWRP 7.1 prompt invalidates the source package", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwrp71-source-drift-"));
  try {
    const packageRoot = path.join(temporaryRoot, PWRP71_SOURCE_DIRECTORY);
    await cp(path.join(process.cwd(), PWRP71_SOURCE_DIRECTORY), packageRoot, { recursive: true });
    const promptPath = path.join(packageRoot, "prompts/00_SHARED_REPORT_PROMPT_v7.md");
    await writeFile(promptPath, `${await readFile(promptPath, "utf8")}\n`, "utf8");
    const result = await verifyPwrp71SourceIntegrity(temporaryRoot);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "pwrp71_content_drift"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("PWRP 7.1 prompt binding combines only its shared and selected layer prompt", async () => {
  const mapping = await loadPwrp71ReportPrompt("MAP");
  assert.equal(mapping.schemaName, "patternwork_map_pwrp_7_1_candidate");
  assert.ok(mapping.system.includes(mapping.source.prompts.shared));
  assert.ok(mapping.system.includes(mapping.source.prompts.mapping));
  assert.equal(mapping.system.includes(mapping.source.prompts.ifs), false);
  assert.equal(mapping.schema, mapping.source.schemas.reportDraft);
});
