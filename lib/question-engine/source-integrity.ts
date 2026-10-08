import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { SourceManifest, SourceManifestEntry, ValidationIssue, ValidationResult } from "./types.ts";

export const SOURCE_MANIFEST_PATH = "specs/patternwork/source-manifest.v3.1.json";
export const PWQE5_RELEASE_MANIFEST_PATH = "specs/patternwork/question-engine-v5/release-manifest.json";
export const PWQE5_RELEASE_MANIFEST_SHA256 = "cad96086c1c8cf08b96d90394b4ec8b3ea35b7256a45ecfcf6045f3018320854" as const;
const CANONICAL_DIRECTORIES = [
  "specs/patternwork/question-engine-v3.1",
  "specs/patternwork/report-prompts-v4.1",
] as const;

const PWQE5_PACKAGE_DIRECTORY = "specs/patternwork/question-engine-v5";
const PWQE5_METADATA_FILES = new Set(["README.md", "release-manifest.json"]);
const PWQE5_SOURCE_ASSETS = [
  "assessment/question_bank.json",
  "architecture/routing_targets.json",
  "architecture/item_gates.json",
  "examples/worked_paths.json",
  "examples/negative_cases.json",
  "reports/00_SHARED_REPORT_PROMPT_v6.md",
  "reports/01_MAPPING_REPORT_PROMPT.md",
  "reports/02_IFS_REPORT_PROMPT.md",
  "reports/03_STATE_REPORT_PROMPT.md",
  "reports/04_ATTACHMENT_REPORT_PROMPT.md",
  "reports/05_SYNTHESIS_REPORT_PROMPT.md",
  "reports/06_REVIEWER_PROMPT.md",
  "schemas/report_draft.schema.json",
  "schemas/router_packet.schema.json",
] as const;

export interface Pwqe5SourceManifest {
  readonly manifestVersion: "1";
  readonly release: "PWQE-5.0.0-design.1";
  readonly routerVersion: "PW-ROUTER-1.0.0-candidate.1";
  readonly promptRelease: "6.0";
  readonly sourceSha256: "bc94e4f06e8331725df477f258754e807bae9ad9e22a2987bcffed67fa839b7c";
  readonly sourceReleaseManifestSha256: "bb773492b9b941c038a6a87b545a8cfd1dd7afbaeac056c8eb56eefafe80007a";
  readonly evidenceContract: "patternwork-router-evidence-v1";
  readonly reportContract: "patternwork-report-v6-design";
  readonly schemaRevisions: { readonly routerPacket: "urn:patternwork:router-evidence:1"; readonly reportDraft: "draft-2020-12" };
  readonly bindings: {
    readonly questionBankPath: "assessment/question_bank.json";
    readonly routingTargetsPath: "architecture/routing_targets.json";
    readonly itemGatesPath: "architecture/item_gates.json";
    readonly routerPacketSchemaPath: "schemas/router_packet.schema.json";
    readonly reportDraftSchemaPath: "schemas/report_draft.schema.json";
  };
  readonly counts: Readonly<Record<string, number>>;
  readonly files: readonly SourceManifestEntry[];
}

function normalizeRelative(value: string): string {
  return value.replaceAll("\\", "/");
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

export async function loadSourceManifest(workspaceRoot = process.cwd()): Promise<SourceManifest> {
  const raw = await readFile(path.join(workspaceRoot, SOURCE_MANIFEST_PATH), "utf8");
  return JSON.parse(raw) as SourceManifest;
}

export async function loadPwqe5SourceManifest(workspaceRoot = process.cwd()): Promise<Pwqe5SourceManifest> {
  const raw = await readFile(path.join(workspaceRoot, PWQE5_RELEASE_MANIFEST_PATH), "utf8");
  return JSON.parse(raw) as Pwqe5SourceManifest;
}

async function listFiles(root: string, issues: ValidationIssue[], current = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isSymbolicLink()) {
      const relative = normalizeRelative(path.relative(root, absolute));
      issues.push({ code: "pwqe5_symlink_source", path: `${PWQE5_PACKAGE_DIRECTORY}/${relative}`, message: "Symbolic links are not allowed in the immutable source package." });
      files.push(relative);
    } else if (entry.isDirectory()) {
      files.push(...await listFiles(root, issues, absolute));
    } else if (entry.isFile()) {
      files.push(normalizeRelative(path.relative(root, absolute)));
    }
  }
  return files;
}

/** Verify the installed PWQE 5 source release using the production SHA/byte-manifest mechanism. */
export async function verifyPwqe5SourceIntegrity(workspaceRoot = process.cwd()): Promise<ValidationResult<Pwqe5SourceManifest>> {
  const issues: ValidationIssue[] = [];
  let rawManifest: string;
  let manifest: Pwqe5SourceManifest;
  try {
    rawManifest = await readFile(path.join(workspaceRoot, PWQE5_RELEASE_MANIFEST_PATH), "utf8");
    manifest = JSON.parse(rawManifest) as Pwqe5SourceManifest;
  } catch (error) {
    return { ok: false, issues: [{ code: "pwqe5_manifest_unreadable", path: PWQE5_RELEASE_MANIFEST_PATH, message: String(error) }] };
  }

  if (!Array.isArray(manifest.files)) return { ok: false, issues: [{ code: "pwqe5_manifest_files", path: PWQE5_RELEASE_MANIFEST_PATH, message: "Release manifest must contain a source asset list." }] };

  const manifestHash = createHash("sha256").update(rawManifest, "utf8").digest("hex");
  if (manifestHash !== PWQE5_RELEASE_MANIFEST_SHA256) issues.push({ code: "pwqe5_manifest_pin_drift", path: PWQE5_RELEASE_MANIFEST_PATH, message: `Expected pinned manifest ${PWQE5_RELEASE_MANIFEST_SHA256}; found ${manifestHash}.` });
  if (manifest.manifestVersion !== "1" || manifest.release !== "PWQE-5.0.0-design.1" || manifest.routerVersion !== "PW-ROUTER-1.0.0-candidate.1" || manifest.promptRelease !== "6.0") {
    issues.push({ code: "pwqe5_release_binding", path: PWQE5_RELEASE_MANIFEST_PATH, message: "PWQE 5 source, router, or prompt identity does not match the reviewed package binding." });
  }
  if (manifest.sourceSha256 !== "bc94e4f06e8331725df477f258754e807bae9ad9e22a2987bcffed67fa839b7c" || manifest.sourceReleaseManifestSha256 !== "bb773492b9b941c038a6a87b545a8cfd1dd7afbaeac056c8eb56eefafe80007a") {
    issues.push({ code: "pwqe5_upstream_binding", path: PWQE5_RELEASE_MANIFEST_PATH, message: "The upstream release digests do not match the supplied ZIP binding." });
  }
  if (manifest.evidenceContract !== "patternwork-router-evidence-v1" || manifest.reportContract !== "patternwork-report-v6-design" || manifest.schemaRevisions?.routerPacket !== "urn:patternwork:router-evidence:1" || manifest.schemaRevisions?.reportDraft !== "draft-2020-12") {
    issues.push({ code: "pwqe5_contract_binding", path: PWQE5_RELEASE_MANIFEST_PATH, message: "Evidence/report contract or schema revision binding is missing or unexpected." });
  }

  const listed = new Set(manifest.files.map((entry) => normalizeRelative(entry.path)));
  const expected = new Set<string>(PWQE5_SOURCE_ASSETS);
  if (manifest.files.length !== expected.size || [...expected].some((file) => !listed.has(file)) || [...listed].some((file) => !expected.has(file))) {
    issues.push({ code: "pwqe5_source_population", path: `${PWQE5_PACKAGE_DIRECTORY}/release-manifest.json`, message: "The release manifest must enumerate exactly the canonical PWQE 5 source assets." });
  }
  if (manifest.counts?.sourceAssets !== expected.size) issues.push({ code: "pwqe5_source_asset_count", path: `${PWQE5_PACKAGE_DIRECTORY}/release-manifest.json`, message: `Expected ${expected.size} canonical source assets.` });

  for (const [binding, file] of Object.entries({
    questionBankPath: "assessment/question_bank.json",
    routingTargetsPath: "architecture/routing_targets.json",
    itemGatesPath: "architecture/item_gates.json",
    routerPacketSchemaPath: "schemas/router_packet.schema.json",
    reportDraftSchemaPath: "schemas/report_draft.schema.json",
  })) {
    if (manifest.bindings?.[binding as keyof Pwqe5SourceManifest["bindings"]] !== file) issues.push({ code: "pwqe5_source_binding", path: `${PWQE5_PACKAGE_DIRECTORY}/release-manifest.json`, message: `${binding} must bind ${file}.` });
  }

  const packageRoot = path.join(workspaceRoot, PWQE5_PACKAGE_DIRECTORY);
  try {
    const observed = new Set(await listFiles(packageRoot, issues));
    const allowed = new Set([...expected, ...PWQE5_METADATA_FILES]);
    for (const extra of observed.difference(allowed)) issues.push({ code: "pwqe5_unexpected_file", path: `${PWQE5_PACKAGE_DIRECTORY}/${extra}`, message: "An unreviewed file was added to the immutable PWQE 5 package." });
    for (const missing of allowed.difference(observed)) issues.push({ code: "pwqe5_missing_file", path: `${PWQE5_PACKAGE_DIRECTORY}/${missing}`, message: "A required PWQE 5 asset or package metadata file is missing." });
    for (const entry of manifest.files) {
      const relative = normalizeRelative(entry.path);
      if (relative.startsWith("/") || relative.split("/").some((part) => part === ".." || part === ".")) {
        issues.push({ code: "pwqe5_unsafe_path", path: relative, message: "Manifest paths must remain inside the package root." });
        continue;
      }
      const absolute = path.join(packageRoot, ...relative.split("/"));
      try {
        const metadata = await stat(absolute);
        if (!metadata.isFile()) throw new Error("Not a regular file.");
        if (metadata.size !== entry.bytes) issues.push({ code: "pwqe5_source_size_drift", path: relative, message: `Expected ${entry.bytes} bytes; found ${metadata.size}.` });
        const actualHash = await sha256File(absolute);
        if (actualHash !== entry.sha256) issues.push({ code: "pwqe5_source_hash_drift", path: relative, message: `Expected ${entry.sha256}; found ${actualHash}.` });
      } catch (error) {
        if (!issues.some((issue) => issue.code === "pwqe5_missing_file" && issue.path === `${PWQE5_PACKAGE_DIRECTORY}/${relative}`)) issues.push({ code: "pwqe5_source_unreadable", path: relative, message: String(error) });
      }
    }
  } catch (error) {
    issues.push({ code: "pwqe5_package_unreadable", path: PWQE5_PACKAGE_DIRECTORY, message: String(error) });
  }

  return issues.length === 0 ? { ok: true, value: manifest, issues: [] } : { ok: false, issues };
}

export async function verifyPatternworkSourceIntegrity(workspaceRoot = process.cwd()): Promise<ValidationResult<SourceManifest>> {
  const issues: ValidationIssue[] = [];
  let manifest: SourceManifest;
  try {
    manifest = await loadSourceManifest(workspaceRoot);
  } catch (error) {
    return { ok: false, issues: [{ code: "source_manifest_unreadable", path: SOURCE_MANIFEST_PATH, message: String(error) }] };
  }

  if (manifest.files.length !== 26) {
    issues.push({ code: "source_population_count", path: "$.files", message: `Expected 26 canonical source files; manifest has ${manifest.files.length}.` });
  }

  const expected = new Set(manifest.files.map((entry) => normalizeRelative(entry.path)));
  const observed = new Set<string>();
  for (const directory of CANONICAL_DIRECTORIES) {
    try {
      for (const entry of await readdir(path.join(workspaceRoot, directory), { withFileTypes: true })) {
        if (entry.isFile()) observed.add(`${directory}/${entry.name}`);
      }
    } catch (error) {
      issues.push({ code: "source_directory_unreadable", path: directory, message: String(error) });
    }
  }

  for (const unexpected of observed.difference(expected)) {
    issues.push({ code: "unexpected_source_file", path: unexpected, message: "Canonical source population contains an unreviewed file." });
  }
  for (const missing of expected.difference(observed)) {
    issues.push({ code: "missing_source_file", path: missing, message: "Canonical source file is missing." });
  }

  await Promise.all(manifest.files.map(async (entry) => {
    const relative = normalizeRelative(entry.path);
    const absolute = path.join(workspaceRoot, ...relative.split("/"));
    try {
      const metadata = await stat(absolute);
      if (metadata.size !== entry.bytes) {
        issues.push({ code: "source_size_drift", path: relative, message: `Expected ${entry.bytes} bytes; found ${metadata.size}.` });
      }
      const actualHash = await sha256File(absolute);
      if (actualHash !== entry.sha256) {
        issues.push({ code: "source_hash_drift", path: relative, message: `Expected ${entry.sha256}; found ${actualHash}.` });
      }
    } catch (error) {
      if (!issues.some((issue) => issue.code === "missing_source_file" && issue.path === relative)) {
        issues.push({ code: "source_unreadable", path: relative, message: String(error) });
      }
    }
  }));

  return issues.length === 0 ? { ok: true, value: manifest, issues: [] } : { ok: false, issues };
}
