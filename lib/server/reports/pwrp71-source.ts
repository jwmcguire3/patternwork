import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonSchema } from "../../report-contracts/schema-validator.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";

export const PWRP71_SOURCE_DIRECTORY = "reporting" as const;
export const PWRP71_RELEASE_MANIFEST_PATH = `${PWRP71_SOURCE_DIRECTORY}/contracts/report_release_manifest.json` as const;
export const PWRP71_RELEASE_MANIFEST_SHA256 = "026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5" as const;

export const PWRP71_PROMPT_FILES = {
  shared: "prompts/00_SHARED_REPORT_PROMPT_v7.md",
  mapping: "prompts/01_MAPPING_REPORT_PROMPT.md",
  ifs: "prompts/02_IFS_REPORT_PROMPT.md",
  state: "prompts/03_STATE_REPORT_PROMPT.md",
  attachment: "prompts/04_ATTACHMENT_REPORT_PROMPT.md",
  synthesis: "prompts/05_SYNTHESIS_REPORT_PROMPT.md",
  reviewer: "prompts/06_REVIEWER_PROMPT.md",
  repair: "prompts/07_REPAIR_REPORT_PROMPT.md",
} as const;

export type Pwrp71PromptKey = keyof typeof PWRP71_PROMPT_FILES;

export interface Pwrp71ReleaseManifest {
  readonly report_release: string;
  readonly kind: string;
  readonly content_binding: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface Pwrp71ReportPolicy {
  readonly release: string;
  readonly status: string;
  readonly compatible_router_format: string;
  readonly compatible_router_source_sha256: string;
  readonly compatible_question_release: string;
  readonly activation: string;
  readonly runtime_implementation: string;
  readonly findings_cardinality: {
    readonly minimum: number | null;
    readonly maximum: number | null;
    readonly theoretical_balance_required: boolean;
  };
  readonly prompt_composition: string;
  readonly layer_prompts: Readonly<Record<string, string>>;
  readonly shared_prompt: string;
  readonly reviewer_prompt: string;
  readonly repair_prompt: string;
  readonly draft_schema: string;
  readonly review_schema: string;
}

export interface Pwrp71SourcePackage {
  readonly manifest: Pwrp71ReleaseManifest;
  readonly manifestSha256: typeof PWRP71_RELEASE_MANIFEST_SHA256;
  readonly policy: Pwrp71ReportPolicy;
  readonly prompts: Readonly<Record<Pwrp71PromptKey, string>>;
  readonly schemas: { readonly reportDraft: JsonSchema; readonly reportReview: JsonSchema };
}

export interface Pwrp71SourceIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type Pwrp71IntegrityResult =
  | { readonly ok: true; readonly value: Pwrp71ReleaseManifest; readonly issues: readonly [] }
  | { readonly ok: false; readonly issues: readonly Pwrp71SourceIssue[] };

const POLICY_FILE = "contracts/report_policy.json";
const DRAFT_SCHEMA_FILE = "schemas/report_draft.schema.json";
const REVIEW_SCHEMA_FILE = "schemas/report_review.schema.json";
const ALLOWED_FILES = new Set([
  ...Object.values(PWRP71_PROMPT_FILES),
  POLICY_FILE,
  DRAFT_SCHEMA_FILE,
  REVIEW_SCHEMA_FILE,
  "contracts/ADDED_CHANNELS.md",
  "contracts/CONSTRUCT_GUIDE.md",
  "contracts/EVIDENCE_COVERAGE.md",
  "contracts/EVIDENCE_PACKET_INTERFACE.md",
  "implementation/patternwork_reports/__init__.py",
  "implementation/patternwork_reports/pipeline.py",
  "implementation/report_cli.py",
]);

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sourceIssue(code: string, source: string, message: string): Pwrp71SourceIssue {
  return { code, path: source, message };
}

async function walk(root: string, current = root): Promise<{ files: string[]; symlinks: string[] }> {
  const files: string[] = [];
  const symlinks: string[] = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    const relative = path.relative(root, absolute).replaceAll("\\", "/");
    if (entry.isSymbolicLink()) symlinks.push(relative);
    else if (entry.isDirectory()) {
      const nested = await walk(root, absolute);
      files.push(...nested.files);
      symlinks.push(...nested.symlinks);
    } else if (entry.isFile()) files.push(relative);
  }
  return { files, symlinks };
}

export async function verifyPwrp71SourceIntegrity(workspaceRoot = process.cwd()): Promise<Pwrp71IntegrityResult> {
  const issues: Pwrp71SourceIssue[] = [];
  let rawManifest: string;
  let manifest: Pwrp71ReleaseManifest;
  try {
    rawManifest = await readFile(path.join(workspaceRoot, PWRP71_RELEASE_MANIFEST_PATH), "utf8");
    manifest = JSON.parse(rawManifest) as Pwrp71ReleaseManifest;
  } catch (error) {
    return { ok: false, issues: [sourceIssue("pwrp71_manifest_unreadable", PWRP71_RELEASE_MANIFEST_PATH, String(error))] };
  }
  if (sha256(Buffer.from(rawManifest, "utf8")) !== PWRP71_RELEASE_MANIFEST_SHA256) {
    issues.push(sourceIssue("pwrp71_manifest_pin_drift", PWRP71_RELEASE_MANIFEST_PATH, "The imported PWRP 7.1 release manifest no longer matches its content pin."));
  }
  if (manifest.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease || manifest.kind !== "content_binding_not_approval"
    || !/^[a-f0-9]{64}$/u.test(manifest.content_binding) || !manifest.files || Object.keys(manifest.files).length !== 18) {
    issues.push(sourceIssue("pwrp71_release_binding", PWRP71_RELEASE_MANIFEST_PATH, "The PWRP 7.1 manifest has an unexpected release identity or content population."));
  }
  for (const file of Object.keys(manifest.files ?? {})) {
    if (!ALLOWED_FILES.has(file)) issues.push(sourceIssue("pwrp71_unexpected_manifest_member", file, "The report release manifest includes an unreviewed content path."));
  }
  for (const file of ALLOWED_FILES) {
    if (!(file in (manifest.files ?? {}))) issues.push(sourceIssue("pwrp71_missing_manifest_member", file, "The report release manifest is missing a required prompt, schema, or contract."));
  }

  const packageRoot = path.join(workspaceRoot, PWRP71_SOURCE_DIRECTORY);
  try {
    const observed = await walk(packageRoot);
    const expected = new Set([...ALLOWED_FILES, "contracts/report_release_manifest.json"]);
    for (const extra of observed.files) if (!expected.has(extra)) issues.push(sourceIssue("pwrp71_unexpected_file", extra, "An unpinned file was added to the active reporting source."));
    for (const missing of expected) if (!observed.files.includes(missing)) issues.push(sourceIssue("pwrp71_missing_file", missing, "A pinned active reporting source file is missing."));
    for (const link of observed.symlinks) issues.push(sourceIssue("pwrp71_symlink", link, "Symbolic links are not allowed in the active reporting source."));
    for (const [relative, expectedDigest] of Object.entries(manifest.files ?? {})) {
      if (relative.startsWith("/") || relative.split("/").some((part) => part === "." || part === "..")
        || !/^[a-f0-9]{64}$/u.test(expectedDigest)) {
        issues.push(sourceIssue("pwrp71_unsafe_manifest_entry", relative, "Manifest paths must be safe relative paths with lowercase SHA-256 values."));
        continue;
      }
      try {
        const absolute = path.join(packageRoot, ...relative.split("/"));
        const metadata = await stat(absolute);
        if (!metadata.isFile()) throw new Error("Manifest entry is not a regular file.");
        const actualDigest = sha256(await readFile(absolute));
        if (actualDigest !== expectedDigest) issues.push(sourceIssue("pwrp71_content_drift", relative, `Expected ${expectedDigest}; found ${actualDigest}.`));
      } catch (error) {
        if (!issues.some((entry) => entry.code === "pwrp71_missing_file" && entry.path === relative)) {
          issues.push(sourceIssue("pwrp71_file_unreadable", relative, String(error)));
        }
      }
    }
  } catch (error) {
    issues.push(sourceIssue("pwrp71_package_unreadable", PWRP71_SOURCE_DIRECTORY, String(error)));
  }
  return issues.length === 0 ? { ok: true, value: manifest, issues: [] } : { ok: false, issues };
}

async function readJson<T>(workspaceRoot: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(workspaceRoot, PWRP71_SOURCE_DIRECTORY, ...relativePath.split("/")), "utf8")) as T;
}

async function loadPackage(workspaceRoot: string): Promise<Pwrp71SourcePackage> {
  const integrity = await verifyPwrp71SourceIntegrity(workspaceRoot);
  if (!integrity.ok) throw new Error(`PWRP 7.1 source integrity failed: ${JSON.stringify(integrity.issues)}`);
  const [policy, promptValues, reportDraft, reportReview] = await Promise.all([
    readJson<Pwrp71ReportPolicy>(workspaceRoot, POLICY_FILE),
    Promise.all(Object.values(PWRP71_PROMPT_FILES).map((file) => readFile(path.join(workspaceRoot, PWRP71_SOURCE_DIRECTORY, ...file.split("/")), "utf8"))),
    readJson<JsonSchema>(workspaceRoot, DRAFT_SCHEMA_FILE),
    readJson<JsonSchema>(workspaceRoot, REVIEW_SCHEMA_FILE),
  ]);
  if (policy.release !== integrity.value.report_release
    || policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || policy.compatible_router_format !== "patternwork-router-evidence-v1"
    || policy.activation !== "requires_external_provider_qualification_and_authorized_release_approval"
    || policy.runtime_implementation !== "standalone_adapter_not_deployed"
    || policy.findings_cardinality.minimum !== null || policy.findings_cardinality.maximum !== null
    || policy.findings_cardinality.theoretical_balance_required !== false) {
    throw new Error("PWRP 7.1 report policy does not match the candidate source, activation gate, or unbounded findings contract.");
  }
  const prompts = Object.fromEntries(Object.keys(PWRP71_PROMPT_FILES).map((key, index) => [key, promptValues[index]])) as Record<Pwrp71PromptKey, string>;
  for (const [key, prompt] of Object.entries(prompts)) {
    if (!prompt.trim() || !prompt.startsWith("#")) throw new Error(`PWRP 7.1 prompt ${key} is empty or not Markdown.`);
  }
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.compile(reportDraft as object);
    ajv.compile(reportReview as object);
  } catch (error) {
    throw new Error(`PWRP 7.1 schema compilation failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    manifest: integrity.value,
    manifestSha256: PWRP71_RELEASE_MANIFEST_SHA256,
    policy,
    prompts,
    schemas: { reportDraft, reportReview },
  };
}

const packageCache = new Map<string, Promise<Pwrp71SourcePackage>>();

export async function loadPwrp71SourcePackage(workspaceRoot = process.cwd()): Promise<Pwrp71SourcePackage> {
  const root = path.resolve(workspaceRoot);
  let pending = packageCache.get(root);
  if (!pending) {
    pending = loadPackage(root);
    packageCache.set(root, pending);
    pending.catch(() => packageCache.delete(root));
  }
  return pending;
}
