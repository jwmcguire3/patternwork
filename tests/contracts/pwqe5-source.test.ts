import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PWQE5_RELEASE_MANIFEST_SHA256,
  PWQE5_RELEASE_MANIFEST_PATH,
  verifyPwqe5SourceIntegrity,
} from "../../lib/question-engine/source-integrity.ts";
import { loadPwqe5SourcePackage, validatePwqe5Source } from "../../lib/question-engine/pwqe5-source.ts";

test("PWQE 5 source release is pinned to the canonical source population", async () => {
  const result = await verifyPwqe5SourceIntegrity();
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues, null, 2));
  if (result.ok) {
    assert.equal(result.value.release, "PWQE-5.0.0-design.1");
    assert.equal(result.value.routerVersion, "PW-ROUTER-1.0.0-candidate.1");
    assert.equal(result.value.promptRelease, "6.0");
    assert.equal(result.value.files.length, 14);
  }
});

test("PWQE 5 loader exposes every canonical item, option, target, gate, prompt, and schema", async () => {
  const loaded = await loadPwqe5SourcePackage();
  const raw = JSON.parse(await readFile(path.join(process.cwd(), "specs/patternwork/question-engine-v5/assessment/question_bank.json"), "utf8")) as typeof loaded.questionBank;
  assert.equal(loaded.questionBank.items.length, 94);
  assert.equal(loaded.questionBank.items.filter((item) => item.stage === "mapping").length, 30);
  assert.equal(loaded.questionBank.items.filter((item) => item.stage === "deepening").length, 64);
  assert.equal(loaded.questionBank.counts.substantive_options, 550);
  assert.deepEqual(loaded.questionBank, raw);
  assert.equal(new Set(loaded.questionBank.items.map((item) => item.id)).size, 94);
  assert.ok(loaded.questionBank.items.every((item) => /^(?:M|D)\d{2}$/u.test(item.id)));
  assert.equal(loaded.questionBank.variants.length, 1);
  const allOptions = [...loaded.questionBank.items, ...loaded.questionBank.variants].flatMap((item) => item.options);
  assert.equal(allOptions.length, 556);
  assert.equal(new Set(allOptions.map((option) => option.id)).size, 556);
  assert.equal(loaded.routingTargets.targets.length, 53);
  assert.equal(Object.keys((loaded.itemGates.gates ?? {}) as object).length, 29);
  assert.equal(Object.keys(loaded.reportPrompts).length, 7);
  assert.equal(loaded.schemas.routerPacket.$id, "urn:patternwork:router-evidence:1");
  assert.equal(loaded.manifest.evidenceContract, "patternwork-router-evidence-v1");
  assert.equal(loaded.manifest.reportContract, "patternwork-report-v6-design");
  assert.deepEqual(
    ["assessment/question_bank.json", "architecture/routing_targets.json", "architecture/item_gates.json"].map((assetPath) => loaded.manifest.files.find((file) => file.path === assetPath)?.sha256),
    [
      "ab6d2d51461976a7826eef63c6468033eba331008ef382d51ec194ee48ce8d16",
      "f6d9eab4c3478055403500e285cb41c64500385c15e50b88ee42a6d37e265977",
      "d7b72aab20d9b3a2890279be8f334cb17f8842ed0e82ac6a1e3f9471461ac7fd",
    ],
  );
  assert.equal(PWQE5_RELEASE_MANIFEST_PATH, "specs/patternwork/question-engine-v5/release-manifest.json");
  assert.match(PWQE5_RELEASE_MANIFEST_SHA256, /^[a-f0-9]{64}$/u);
});

test("source validation rejects missing references and stale question IDs", async () => {
  const loaded = await loadPwqe5SourcePackage();
  const bank = structuredClone(loaded.questionBank) as unknown as { items: Array<Record<string, unknown>>; variants: unknown[] };
  bank.items[0] = { ...bank.items[0], id: "RL-101" };
  const issues = validatePwqe5Source({ questionBank: bank, routingTargets: loaded.routingTargets, itemGates: loaded.itemGates });
  assert.ok(issues.some((issue) => issue.code === "pwqe5_question_population" || issue.code === "pwqe5_question_definition"));
});

test("changing an authored asset without updating the pinned manifest fails integrity", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwqe5-source-drift-"));
  try {
    const packageRoot = path.join(temporaryRoot, "specs/patternwork/question-engine-v5");
    await cp(path.join(process.cwd(), "specs/patternwork/question-engine-v5"), packageRoot, { recursive: true });
    const bankPath = path.join(packageRoot, "assessment/question_bank.json");
    await writeFile(bankPath, `${await readFile(bankPath, "utf8")}\n`, "utf8");
    const result = await verifyPwqe5SourceIntegrity(temporaryRoot);
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "pwqe5_source_hash_drift" || issue.code === "pwqe5_source_size_drift"));
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("a self-rewritten release manifest and extra stale files fail integrity", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwqe5-manifest-drift-"));
  try {
    const packageRoot = path.join(temporaryRoot, "specs/patternwork/question-engine-v5");
    await cp(path.join(process.cwd(), "specs/patternwork/question-engine-v5"), packageRoot, { recursive: true });
    const manifestPath = path.join(packageRoot, "release-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.promptRelease = "4.1.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(path.join(packageRoot, "assessment/retired-a-f-bank.json"), "{}\n", "utf8");
    const result = await verifyPwqe5SourceIntegrity(temporaryRoot);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(result.issues.some((issue) => issue.code === "pwqe5_manifest_pin_drift"));
      assert.ok(result.issues.some((issue) => issue.code === "pwqe5_unexpected_file"));
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
