import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadPwqe5SourcePackage } from "../../lib/question-engine/pwqe5-source.ts";
import {
  loadPwqe51SourcePackage,
  PWQE51_RELEASE_IDENTITY,
  PWQE51_SOURCE_DIRECTORY,
  PWQE51_SOURCE_MANIFEST_PATH,
  PWQE51_SOURCE_MANIFEST_SHA256,
  verifyPwqe51SourceIntegrity,
  validatePwqe51Source,
} from "../../lib/question-engine/pwqe51-source.ts";

test("PWQE 5.1 candidate source is pinned independently from PWQE 5.0", async () => {
  const integrity = await verifyPwqe51SourceIntegrity();
  assert.equal(integrity.ok, true, integrity.ok ? undefined : JSON.stringify(integrity.issues, null, 2));
  assert.equal(PWQE51_SOURCE_MANIFEST_PATH, `${PWQE51_SOURCE_DIRECTORY}/SOURCE_MANIFEST.json`);
  assert.match(PWQE51_SOURCE_MANIFEST_SHA256, /^[a-f0-9]{64}$/u);

  const [oldSource, newSource] = await Promise.all([loadPwqe5SourcePackage(), loadPwqe51SourcePackage()]);
  assert.equal(oldSource.questionBank.items.length, 94);
  assert.equal(newSource.questionBank.items.length, 130);
  assert.deepEqual(newSource.manifest.source_binding, {
    question_release: PWQE51_RELEASE_IDENTITY.questionRelease,
    runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion,
    source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
  });
  assert.equal(newSource.questionBank.items.filter((item) => item.stage === "mapping").length, 30);
  assert.equal(newSource.questionBank.items.filter((item) => item.stage === "deepening").length, 100);
  assert.equal(newSource.questionBank.items.reduce((count, item) => count + item.options.length, 0), 766);
  assert.equal(newSource.questionBank.variants.length, 1);
  assert.equal(newSource.routingTargets.targets.length, 92);
  assert.equal(newSource.coverageRules.rules.length, 39);
  assert.equal((newSource.schemas.routerPacket as Record<string, unknown>).$id, "urn:patternwork:router-evidence:1");

  const newById = new Map(newSource.questionBank.items.map((item) => [item.id, item]));
  for (const oldItem of oldSource.questionBank.items) {
    const candidate = newById.get(oldItem.id);
    assert.ok(candidate, `PWQE 5.1 must retain ${oldItem.id}`);
    assert.equal(candidate.prompt, oldItem.prompt, `${oldItem.id} prompt`);
    assert.deepEqual(candidate.options, oldItem.options, `${oldItem.id} authored options`);
  }
});

test("PWQE 5.1 structural validation rejects stale coverage, target and option references", async () => {
  const loaded = await loadPwqe51SourcePackage();
  const altered = structuredClone(loaded) as unknown as Record<string, Record<string, unknown>>;
  const rules = structuredClone(loaded.coverageRules) as unknown as { rules: Array<Record<string, unknown>> };
  rules.rules[0] = { ...rules.rules[0], item_id: "D999" };
  altered.coverageRules = rules as unknown as Record<string, unknown>;
  const issues = validatePwqe51Source(altered as unknown as Parameters<typeof validatePwqe51Source>[0]);
  assert.ok(issues.some((entry) => entry.code === "pwqe51_coverage_target_binding" || entry.code === "pwqe51_coverage_item_set"));
});

test("changing a PWQE 5.1 authored asset fails the immutable content check", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwqe51-source-drift-"));
  try {
    const sourceRoot = path.join(process.cwd(), PWQE51_SOURCE_DIRECTORY);
    const packageRoot = path.join(temporaryRoot, PWQE51_SOURCE_DIRECTORY);
    await cp(sourceRoot, packageRoot, { recursive: true });
    const bankPath = path.join(packageRoot, "assessment/question_bank.json");
    await writeFile(bankPath, `${await readFile(bankPath, "utf8")}\n`, "utf8");
    const result = await verifyPwqe51SourceIntegrity(temporaryRoot);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "pwqe51_source_hash_drift"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("an unlisted file cannot be added to the immutable PWQE 5.1 source", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwqe51-source-population-"));
  try {
    const sourceRoot = path.join(process.cwd(), PWQE51_SOURCE_DIRECTORY);
    const packageRoot = path.join(temporaryRoot, PWQE51_SOURCE_DIRECTORY);
    await cp(sourceRoot, packageRoot, { recursive: true });
    await writeFile(path.join(packageRoot, "stale.json"), "{}\n", "utf8");
    const result = await verifyPwqe51SourceIntegrity(temporaryRoot);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "pwqe51_unexpected_file"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
