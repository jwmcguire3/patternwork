import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadPwqe5SourcePackage,
  PWQE5_RELEASE_IDENTITY,
  PWQE5_SOURCE_DIRECTORY,
  PWQE6_REPORT_PROMPT_FILES,
} from "../../lib/server/reports/pwqe6-source.ts";

const workspaceRoot = process.cwd();
const promptKeys = ["shared", "mapping", "ifs", "state", "attachment", "synthesis", "reviewer"] as const;

function record(value: unknown): Record<string, unknown> {
  assert.ok(value && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

async function withCopiedPackage<T>(run: (root: string) => Promise<T>): Promise<T> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "pwqe6-source-"));
  try {
    await cp(
      path.join(workspaceRoot, PWQE5_SOURCE_DIRECTORY),
      path.join(temporaryRoot, PWQE5_SOURCE_DIRECTORY),
      { recursive: true },
    );
    return await run(temporaryRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

test("loads all seven pinned v6 report prompts", async () => {
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  assert.deepEqual(Object.keys(source.reportPrompts).sort(), [...promptKeys].sort());
  for (const key of promptKeys) {
    assert.ok(source.reportPrompts[key].trim().startsWith("#"), `${key} prompt is Markdown`);
  }
});

test("schema identities and source bindings match the pinned v5 release", async () => {
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  assert.deepEqual(source.identities, PWQE5_RELEASE_IDENTITY);
  const routerPacket = record(source.schemas.routerPacket);
  const routerProperties = record(routerPacket.properties);
  const format = record(routerProperties.format);
  const sourceBinding = record(routerProperties.source_binding);
  const reportDraft = record(source.schemas.reportDraft);
  const reportProperties = record(reportDraft.properties);
  const reportTypes = record(reportProperties.report_type);
  assert.equal(routerPacket.$id, "urn:patternwork:router-evidence:1");
  assert.equal(format.const, "patternwork-router-evidence-v1");
  assert.deepEqual(sourceBinding.required, ["question_release", "runtime_version", "source_sha256"]);
  assert.equal(reportDraft.title, "Patternwork v6 design report draft");
  assert.deepEqual(reportTypes.enum, ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]);
});

test("fails closed when a pinned prompt is tampered with", async () => {
  await withCopiedPackage(async (root) => {
    const promptPath = path.join(root, PWQE5_SOURCE_DIRECTORY, PWQE6_REPORT_PROMPT_FILES.mapping);
    await writeFile(promptPath, `${await readFile(promptPath, "utf8")}\nTampered.\n`, "utf8");
    await assert.rejects(loadPwqe5SourcePackage(root), /source asset .* has changed or is incomplete/u);
  });
});

test("fails closed when a required v6 prompt is missing", async () => {
  await withCopiedPackage(async (root) => {
    const promptPath = path.join(root, PWQE5_SOURCE_DIRECTORY, PWQE6_REPORT_PROMPT_FILES.reviewer);
    await rm(promptPath);
    await assert.rejects(loadPwqe5SourcePackage(root), /ENOENT/u);
  });
});

test("fails closed when an unpinned identity is presented", async () => {
  await withCopiedPackage(async (root) => {
    const manifestPath = path.join(root, PWQE5_SOURCE_DIRECTORY, "release-manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
    manifest.promptRelease = "5.0";
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await assert.rejects(loadPwqe5SourcePackage(root), /release manifest digest does not match/u);
  });
});
