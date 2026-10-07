import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonSchema } from "../../report-contracts/schema-validator.ts";

export const PWQE5_SOURCE_DIRECTORY = "specs/patternwork/question-engine-v5" as const;
export const PWQE5_SOURCE_MANIFEST_PATH = `${PWQE5_SOURCE_DIRECTORY}/release-manifest.json` as const;
export const PWQE5_SOURCE_MANIFEST_SHA256 = "cad96086c1c8cf08b96d90394b4ec8b3ea35b7256a45ecfcf6045f3018320854" as const;

export const PWQE5_RELEASE_IDENTITY = {
  manifestVersion: "1",
  release: "PWQE-5.0.0-design.1",
  routerVersion: "PW-ROUTER-1.0.0-candidate.1",
  promptRelease: "6.0",
  evidenceContract: "patternwork-router-evidence-v1",
  reportContract: "patternwork-report-v6-design",
  sourceSha256: "bc94e4f06e8331725df477f258754e807bae9ad9e22a2987bcffed67fa839b7c",
  sourceReleaseManifestSha256: "bb773492b9b941c038a6a87b545a8cfd1dd7afbaeac056c8eb56eefafe80007a",
} as const;

export const PWQE6_REPORT_PROMPT_FILES = {
  shared: "reports/00_SHARED_REPORT_PROMPT_v6.md",
  mapping: "reports/01_MAPPING_REPORT_PROMPT.md",
  ifs: "reports/02_IFS_REPORT_PROMPT.md",
  state: "reports/03_STATE_REPORT_PROMPT.md",
  attachment: "reports/04_ATTACHMENT_REPORT_PROMPT.md",
  synthesis: "reports/05_SYNTHESIS_REPORT_PROMPT.md",
  reviewer: "reports/06_REVIEWER_PROMPT.md",
} as const;

export type Pwqe6ReportPromptKey = keyof typeof PWQE6_REPORT_PROMPT_FILES;

const SCHEMA_FILES = {
  routerPacket: "schemas/router_packet.schema.json",
  reportDraft: "schemas/report_draft.schema.json",
} as const;

const EXPECTED_SOURCE_ASSET_PATHS = [
  "assessment/question_bank.json",
  "architecture/routing_targets.json",
  "architecture/item_gates.json",
  "examples/worked_paths.json",
  "examples/negative_cases.json",
  ...Object.values(PWQE6_REPORT_PROMPT_FILES),
  ...Object.values(SCHEMA_FILES),
].sort();

interface SourceFileDigest {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

interface Pwqe5SourceManifest {
  readonly manifestVersion: string;
  readonly release: string;
  readonly routerVersion: string;
  readonly promptRelease: string;
  readonly evidenceContract: string;
  readonly reportContract: string;
  readonly schemaRevisions: {
    readonly routerPacket: string;
    readonly reportDraft: string;
  };
  readonly bindings: Record<string, string>;
  readonly sourceSha256: string;
  readonly sourceReleaseManifestSha256: string;
  readonly counts: Record<string, number>;
  readonly files: readonly SourceFileDigest[];
}

export interface Pwqe5SourcePackage {
  readonly identities: typeof PWQE5_RELEASE_IDENTITY;
  readonly sourceManifestSha256: typeof PWQE5_SOURCE_MANIFEST_SHA256;
  readonly reportPrompts: Readonly<Record<Pwqe6ReportPromptKey, string>>;
  readonly schemas: {
    readonly routerPacket: JsonSchema;
    readonly reportDraft: JsonSchema;
  };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(message: string): never {
  throw new Error(`PWQE-5 source package rejected: ${message}`);
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (error) {
    fail(`${label} is not valid JSON (${error instanceof Error ? error.message : String(error)}).`);
  }
}

function assertManifest(value: unknown): asserts value is Pwqe5SourceManifest {
  if (!record(value)) fail("release manifest must be an object.");
  const manifest = value as Record<string, unknown>;
  for (const [key, expected] of Object.entries(PWQE5_RELEASE_IDENTITY)) {
    if (manifest[key] !== expected) fail(`release manifest ${key} does not match the pinned v5 source identity.`);
  }
  if (manifest.sourceReleaseManifestSha256 !== PWQE5_RELEASE_IDENTITY.sourceReleaseManifestSha256) {
    fail("upstream source release manifest digest does not match the pinned v5 source identity.");
  }
  if (!record(manifest.schemaRevisions)
    || manifest.schemaRevisions.routerPacket !== "urn:patternwork:router-evidence:1"
    || manifest.schemaRevisions.reportDraft !== "draft-2020-12") {
    fail("schema revision bindings do not match the pinned v5 source identity.");
  }
  const expectedBindings: Record<string, string> = {
    questionBankPath: "assessment/question_bank.json",
    routingTargetsPath: "architecture/routing_targets.json",
    itemGatesPath: "architecture/item_gates.json",
    routerPacketSchemaPath: SCHEMA_FILES.routerPacket,
    reportDraftSchemaPath: SCHEMA_FILES.reportDraft,
  };
  const bindings = record(manifest.bindings) ? manifest.bindings : undefined;
  if (!bindings || Object.keys(expectedBindings).some((key) => bindings[key] !== expectedBindings[key])) {
    fail("question, router, or schema source bindings do not match the pinned v5 package layout.");
  }
  if (!record(manifest.counts)
    || manifest.counts.questionBank !== 1
    || manifest.counts.routingAssets !== 2
    || manifest.counts.workedExamples !== 1
    || manifest.counts.negativeExamples !== 1
    || manifest.counts.reportPrompts !== 7
    || manifest.counts.schemas !== 2
    || manifest.counts.sourceAssets !== EXPECTED_SOURCE_ASSET_PATHS.length) {
    fail("release manifest asset counts do not match the pinned v5 package layout.");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length !== EXPECTED_SOURCE_ASSET_PATHS.length) {
    fail("release manifest does not enumerate the complete pinned source asset set.");
  }
  const files = manifest.files as unknown[];
  const observedPaths: string[] = [];
  for (const entry of files) {
    if (!record(entry)
      || typeof entry.path !== "string"
      || !Number.isSafeInteger(entry.bytes)
      || (entry.bytes as number) < 0
      || typeof entry.sha256 !== "string"
      || !/^[a-f0-9]{64}$/u.test(entry.sha256)) {
      fail("release manifest contains an invalid file digest entry.");
    }
    observedPaths.push(entry.path as string);
  }
  observedPaths.sort();
  if (observedPaths.some((entry, index) => entry !== EXPECTED_SOURCE_ASSET_PATHS[index])) {
    fail("release manifest file set does not match the pinned v5 source package.");
  }
}

function assertSchemaShape(schema: JsonSchema, name: string): asserts schema is Record<string, unknown> {
  const properties = record(schema) && record(schema.properties) ? schema.properties : undefined;
  if (!record(schema)
    || schema.$schema !== "https://json-schema.org/draft/2020-12/schema"
    || schema.type !== "object"
    || schema.additionalProperties !== false
    || !properties
    || !Array.isArray(schema.required)
    || schema.required.length === 0
    || !schema.required.every((key) => typeof key === "string" && Object.hasOwn(properties, key))) {
    fail(`${name} schema has an invalid draft 2020-12 object shape.`);
  }
}

function assertRouterPacketBindings(schema: Record<string, unknown>): void {
  const properties = schema.properties as Record<string, unknown>;
  const format = record(properties.format) ? properties.format : undefined;
  const sourceBinding = record(properties.source_binding) ? properties.source_binding : undefined;
  const sourceProperties = sourceBinding && record(sourceBinding.properties) ? sourceBinding.properties : undefined;
  const sourceRequired = sourceBinding && Array.isArray(sourceBinding.required) ? sourceBinding.required : [];
  const rootRequired = Array.isArray(schema.required) ? schema.required : [];
  if (schema.$id !== "urn:patternwork:router-evidence:1"
    || format?.const !== PWQE5_RELEASE_IDENTITY.evidenceContract
    || !sourceBinding
    || sourceBinding.type !== "object"
    || !sourceProperties
    || !["question_release", "runtime_version", "source_sha256"].every((key) => sourceRequired.includes(key))
    || !["format", "source_binding"].every((key) => rootRequired.includes(key))) {
    fail("router packet schema identity or release binding does not match the pinned v5 source package.");
  }
}

function assertReportDraftBindings(schema: Record<string, unknown>): void {
  const properties = schema.properties as Record<string, unknown>;
  const reportType = record(properties.report_type) ? properties.report_type : undefined;
  const required = Array.isArray(schema.required) ? schema.required : [];
  if (schema.title !== "Patternwork v6 design report draft"
    || !reportType
    || JSON.stringify(reportType.enum) !== JSON.stringify(["MAP", "IFS", "PV", "ATT", "SYNTHESIS"])
    || !["release_id", "snapshot_id", "report_type", "sections", "claims"].every((key) => required.includes(key))) {
    fail("report draft schema identity or release binding does not match the pinned v5 source package.");
  }
}

/**
 * Loads the byte-pinned v5 design source release used by the v6 report contract.
 * Missing files, changed bytes, altered identities, or schema contract drift fail closed.
 */
export async function loadPwqe5SourcePackage(workspaceRoot = process.cwd()): Promise<Pwqe5SourcePackage> {
  const packageRoot = path.join(workspaceRoot, ...PWQE5_SOURCE_DIRECTORY.split("/"));
  const manifestBytes = await readFile(path.join(packageRoot, "release-manifest.json"));
  if (sha256(manifestBytes) !== PWQE5_SOURCE_MANIFEST_SHA256) {
    fail("release manifest digest does not match the loader-pinned source release.");
  }
  const manifest = parseJson(manifestBytes.toString("utf8"), "release manifest");
  assertManifest(manifest);

  const fileDigests = new Map(manifest.files.map((entry) => [entry.path, entry]));
  const readPinnedAsset = async (relativePath: string): Promise<Buffer> => {
    const expected = fileDigests.get(relativePath);
    if (!expected) fail(`required source file ${relativePath} is not manifest-bound.`);
    const bytes = await readFile(path.join(packageRoot, ...relativePath.split("/")));
    if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
      fail(`source asset ${relativePath} has changed or is incomplete.`);
    }
    return bytes;
  };

  // Check every imported asset. This prevents a partial package from appearing valid
  // when an unused bank or example file has been removed or changed.
  await Promise.all(manifest.files.map((entry) => readPinnedAsset(entry.path)));

  const prompts = {} as Record<Pwqe6ReportPromptKey, string>;
  await Promise.all(Object.entries(PWQE6_REPORT_PROMPT_FILES).map(async ([key, relativePath]) => {
    const text = (await readPinnedAsset(relativePath)).toString("utf8");
    if (!text.trim() || !text.startsWith("#")) fail(`report prompt ${relativePath} is empty or not Markdown.`);
    prompts[key as Pwqe6ReportPromptKey] = text;
  }));

  const [routerPacketBytes, reportDraftBytes] = await Promise.all([
    readPinnedAsset(SCHEMA_FILES.routerPacket),
    readPinnedAsset(SCHEMA_FILES.reportDraft),
  ]);
  const routerPacket = parseJson(routerPacketBytes.toString("utf8"), SCHEMA_FILES.routerPacket) as JsonSchema;
  const reportDraft = parseJson(reportDraftBytes.toString("utf8"), SCHEMA_FILES.reportDraft) as JsonSchema;
  assertSchemaShape(routerPacket, "router packet");
  assertSchemaShape(reportDraft, "report draft");
  assertRouterPacketBindings(routerPacket);
  assertReportDraftBindings(reportDraft);

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.compile(routerPacket as object);
    ajv.compile(reportDraft as object);
  } catch (error) {
    fail(`JSON Schema validation failed (${error instanceof Error ? error.message : String(error)}).`);
  }

  return {
    identities: PWQE5_RELEASE_IDENTITY,
    sourceManifestSha256: PWQE5_SOURCE_MANIFEST_SHA256,
    reportPrompts: prompts,
    schemas: { routerPacket, reportDraft },
  };
}
