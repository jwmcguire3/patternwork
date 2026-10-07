import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { canonicalJson, sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  PWQE5_NEGATIVE_CASES_SHA256,
  PWQE5_QUALIFICATION_FIXTURE_SET_SHA256,
  PWQE5_WORKED_PATHS_SHA256,
  ReportCostCapError,
  assertCallWithinCostCap,
  type QualifiedModelTier,
  type ReviewedPwqe5QualificationManifest,
  type ReviewedQualificationPin,
} from "./policy.ts";
import { buildPwqe5QualificationFixtureSet, type Pwqe5ProviderQualificationFixture, type Pwqe5ProviderQualificationFixtureSet } from "./pwqe5-qualification-fixtures.ts";
import type { OpenRouterGenerationRequest, OpenRouterTransport, OpenRouterUsage } from "./types.ts";
import { OpenRouterTransportError } from "./types.ts";
import { buildGenerationPrompt, buildRepairPrompt, loadPwqe6ReportPrompt } from "../reports/prompts.ts";
import { renderPwqe6ReportDraftMarkdown, validatePwqe6ReportDraftValue } from "../reports/pwqe6-validation.ts";
import type { Pwqe5SourcePackage as Pwqe6ReportSourcePackage } from "../reports/pwqe6-source.ts";
import { PWQE5_RELEASE_IDENTITY, PWQE5_SOURCE_MANIFEST_SHA256 } from "../reports/pwqe6-source.ts";
import type { Pwqe6ReportDraft } from "../reports/types.ts";

export const PWQE5_QUALIFICATION_RUN_FILE = "pwqe5-qualification-run.json" as const;
export const PWQE5_PENDING_REVIEW_FILE = "pwqe5-pending-review.json" as const;
export const PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS = 32_768 as const;
export const PWQE5_QUALIFICATION_REPORT_ORDER = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];

export interface Pwqe5QualificationAttempt {
  readonly phase: "initial" | "repair";
  readonly durationMs: number;
  readonly provider: "openrouter";
  readonly actualModel: string;
  readonly generationId: string;
  readonly requestId?: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly reasoningTokens: number;
  readonly totalTokens: number;
  readonly costMicros: number;
  readonly currency: "USD";
  readonly issues: readonly ValidationIssue[];
  readonly outputPath?: string;
  readonly outputSha256?: string;
}

export interface Pwqe5QualificationRunRecord {
  readonly key: string;
  readonly reportType: ReportType;
  readonly candidate: QualifiedModelTier["name"];
  readonly profileId: string;
  readonly status: "started" | "completed";
  readonly inputSha256: string;
  readonly sourcePacketSha256: string;
  readonly requestedModel: string;
  readonly requestedReasoningEffort: string;
  readonly requestedMaxOutputTokens: number;
  readonly attempts: readonly Pwqe5QualificationAttempt[];
  readonly machinePassed?: boolean;
  readonly repairUsed?: boolean;
  readonly finalDraftPath?: string;
  readonly finalDraftSha256?: string;
  readonly finalMarkdownPath?: string;
  readonly issues?: readonly ValidationIssue[];
}

export interface Pwqe5QualificationSelection {
  readonly reportType: ReportType;
  readonly candidate: QualifiedModelTier["name"];
  readonly model: string;
  readonly reasoningEffort: string;
  readonly runKeys: readonly string[];
}

export interface Pwqe5QualificationRunManifest {
  readonly manifestVersion: "pwqe5-provider-run-1";
  readonly status: "running" | "machine_failed" | "budget_blocked" | "pending_review";
  readonly qualificationMode: "provider";
  readonly questionRelease: typeof PWQE5_RELEASE_IDENTITY.release;
  readonly routerVersion: typeof PWQE5_RELEASE_IDENTITY.routerVersion;
  readonly promptRelease: typeof PWQE5_RELEASE_IDENTITY.promptRelease;
  readonly evidenceContract: typeof PWQE5_RELEASE_IDENTITY.evidenceContract;
  readonly reportContract: typeof PWQE5_RELEASE_IDENTITY.reportContract;
  readonly routerPacketSchemaId: "urn:patternwork:router-evidence:1";
  readonly reportDraftSchemaRevision: "draft-2020-12";
  readonly sourceSha256: typeof PWQE5_RELEASE_IDENTITY.sourceSha256;
  readonly sourceManifestSha256: typeof PWQE5_SOURCE_MANIFEST_SHA256;
  readonly workedPathsSha256: typeof PWQE5_WORKED_PATHS_SHA256;
  readonly negativeCasesSha256: typeof PWQE5_NEGATIVE_CASES_SHA256;
  readonly fixtureSetSha256: typeof PWQE5_QUALIFICATION_FIXTURE_SET_SHA256;
  readonly candidateOrderSha256: string;
  readonly candidates: readonly QualifiedModelTier[];
  readonly profileIds: readonly string[];
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly costCapMicros: number;
  readonly totalCostMicros: number;
  readonly runs: readonly Pwqe5QualificationRunRecord[];
  readonly selections: Partial<Readonly<Record<ReportType, Pwqe5QualificationSelection>>>;
  readonly failure?: string;
}

export type Pwqe5QualificationDraftPin = ReviewedQualificationPin;

export interface Pwqe5PendingQualificationResult {
  readonly status: "pending_review";
  readonly qualificationRunSha256: string;
  readonly draftPinsSha256: string;
  readonly totalCostMicros: number;
  readonly draftPins: Readonly<Record<ReportType, Pwqe5QualificationDraftPin>>;
  readonly reviewChecklist: readonly string[];
  readonly profileReviewReferences: readonly { readonly profileId: string; readonly reference: JsonObject }[];
  readonly negativeCases: readonly JsonObject[];
  readonly run: Pwqe5QualificationRunManifest;
}

export interface Pwqe5QualificationReviewApproval {
  readonly status: "approved";
  readonly qualificationRunSha256: string;
  readonly draftPinsSha256: string;
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly checklist: {
    readonly allOutputsReviewed: true;
    readonly prohibitedClaimsReviewed: true;
    readonly traceabilityReviewed: true;
    readonly fixtureComparabilityReviewed: true;
    readonly pinsApproved: true;
  };
}

export interface RunPwqe5QualificationOptions {
  readonly outputDirectory: string;
  readonly provider: OpenRouterTransport;
  readonly fixtures?: Pwqe5ProviderQualificationFixtureSet;
  readonly candidates?: readonly QualifiedModelTier[];
  readonly costCapMicros: number;
  readonly workspaceRoot?: string;
  readonly now?: () => Date;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function asJsonObject(value: unknown): JsonObject {
  if (!object(value)) throw new Error("PWQE5 qualification expected a JSON object.");
  return value as JsonObject;
}

const UNSUPPORTED_STRICT_SCHEMA_KEYS = new Set(["$schema", "$id", "title", "description", "allOf", "if", "then", "else", "uniqueItems"]);

function openRouterStrictSchemaMap(value: unknown): unknown {
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, schema]) => [key, openRouterStrictSchema(schema)]));
}

function openRouterStrictSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openRouterStrictSchema);
  if (!object(value)) return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !UNSUPPORTED_STRICT_SCHEMA_KEYS.has(key))
    .map(([key, child]) => [key,
      key === "properties" || key === "$defs" || key === "definitions"
        ? openRouterStrictSchemaMap(child)
        : key === "items" || key === "additionalProperties" || key === "not" || key === "contains"
          ? openRouterStrictSchema(child)
          : key === "anyOf" || key === "oneOf" || key === "prefixItems"
            ? Array.isArray(child) ? child.map(openRouterStrictSchema) : child
            : child,
    ]));
}

function runKey(reportType: ReportType, candidate: QualifiedModelTier["name"], profileId: string): string {
  return `${reportType}:${candidate}:${profileId}:run-1`;
}

function promptInput(
  reportType: ReportType,
  fixture: Pwqe5ProviderQualificationFixture,
  manifest: Pwqe5QualificationRunManifest,
  outputDirectory: string,
): Promise<JsonObject> {
  const packet = reportType === "MAP" ? fixture.mappingPacket : fixture.reportPacket;
  if (reportType !== "SYNTHESIS") {
    return Promise.resolve(reportType === "MAP" ? { packets: [packet] } as unknown as JsonObject : { packet } as unknown as JsonObject);
  }
  return (async () => {
    const layerReports = [];
    for (const type of ["IFS", "PV", "ATT"] as const) {
      const selection = manifest.selections[type];
      const run = manifest.runs.find((candidate) => candidate.key === selection?.runKeys.find((key) => manifest.runs.some((entry) => entry.key === key && entry.profileId === fixture.id)));
      if (!run?.machinePassed || !run.finalDraftPath || !run.finalDraftSha256) {
        throw new Error(`Synthesis qualification for ${fixture.id} has no selected ${type} draft from the same profile.`);
      }
      const draft = asJsonObject(JSON.parse(await readFile(path.join(outputDirectory, run.finalDraftPath), "utf8")));
      if (sha256Canonical(draft) !== run.finalDraftSha256) throw new Error(`Selected ${type} draft digest changed for ${fixture.id}.`);
      layerReports.push({ report_type: type, draft });
    }
    return {
      release_id: "PWQE-5.0.0-design.1",
      snapshot_id: fixture.deepeningSnapshotId,
      report_type: "SYNTHESIS",
      source_manifest_sha256: manifest.sourceManifestSha256,
      packet,
      layer_reports: layerReports,
    } as unknown as JsonObject;
  })();
}

function replaceRun(manifest: Pwqe5QualificationRunManifest, record: Pwqe5QualificationRunRecord, now: Date): Pwqe5QualificationRunManifest {
  const runs = [...manifest.runs.filter((run) => run.key !== record.key), record];
  return {
    ...manifest,
    updatedAt: now.toISOString(),
    totalCostMicros: runs.reduce((sum, run) => sum + run.attempts.reduce((attemptSum, attempt) => attemptSum + attempt.costMicros, 0), 0),
    runs,
  };
}

async function saveJson(outputDirectory: string, file: string, value: unknown): Promise<void> {
  const target = path.join(outputDirectory, file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, target);
}

async function saveText(outputDirectory: string, file: string, value: string): Promise<void> {
  const target = path.join(outputDirectory, file);
  await mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.tmp`;
  await writeFile(temporary, value, "utf8");
  await rename(temporary, target);
}

async function loadRun(outputDirectory: string): Promise<Pwqe5QualificationRunManifest | undefined> {
  try {
    return JSON.parse(await readFile(path.join(outputDirectory, PWQE5_QUALIFICATION_RUN_FILE), "utf8")) as Pwqe5QualificationRunManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

function initialRecord(input: {
  readonly key: string;
  readonly reportType: ReportType;
  readonly candidate: QualifiedModelTier;
  readonly fixture: Pwqe5ProviderQualificationFixture;
  readonly input: JsonObject;
}): Pwqe5QualificationRunRecord {
  const packet = input.reportType === "MAP" ? input.fixture.mappingPacket : input.fixture.reportPacket;
  return {
    key: input.key,
    reportType: input.reportType,
    candidate: input.candidate.name,
    profileId: input.fixture.id,
    status: "started",
    inputSha256: sha256Canonical(input.input),
    sourcePacketSha256: sha256Canonical(packet),
    requestedModel: input.candidate.model,
    requestedReasoningEffort: input.candidate.reasoningEffort,
    requestedMaxOutputTokens: PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS,
    attempts: [],
  };
}

function draftPins(manifest: Pwqe5QualificationRunManifest, candidates: readonly QualifiedModelTier[]): Readonly<Record<ReportType, Pwqe5QualificationDraftPin>> {
  return Object.fromEntries(PWQE5_QUALIFICATION_REPORT_ORDER.map((reportType) => {
    const selection = manifest.selections[reportType];
    if (!selection) throw new Error(`Cannot create PWQE5 reviewed pins without a ${reportType} selection.`);
    const index = candidates.findIndex((candidate) => candidate.name === selection.candidate);
    if (index < 0) throw new Error(`Selected ${reportType} candidate is not present in the reviewed order.`);
    const tier = candidates[index];
    const escalation = candidates[Math.min(index + 1, candidates.length - 1)];
    return [reportType, {
      tier: tier.name,
      model: tier.model,
      reasoningEffort: tier.reasoningEffort,
      escalationTier: escalation.name,
      escalationModel: escalation.model,
      escalationReasoningEffort: escalation.reasoningEffort,
      maxOutputTokens: PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS,
    }];
  })) as unknown as Readonly<Record<ReportType, Pwqe5QualificationDraftPin>>;
}

function pendingResult(
  manifest: Pwqe5QualificationRunManifest,
  fixtures: Pwqe5ProviderQualificationFixtureSet,
  pins: Readonly<Record<ReportType, Pwqe5QualificationDraftPin>>,
): Pwqe5PendingQualificationResult {
  return {
    status: "pending_review",
    qualificationRunSha256: sha256Canonical(manifest),
    draftPinsSha256: sha256Canonical(pins),
    totalCostMicros: manifest.totalCostMicros,
    draftPins: pins,
    reviewChecklist: [
      "Review every selected MAP, IFS, PV, ATT, and SYNTHESIS output for all nine profile fixtures.",
      "Compare the reader-facing reports with the separate authored review references; those references were not sent as respondent evidence.",
      "Review every negative case for prohibited claims and check both overreach and sterile non-interpretation.",
      "Check evidence IDs and occurrence scopes, sequence claims, profile isolation, and same-profile synthesis lineage.",
      "Confirm the chosen candidate, reasoning effort, 32768-token output ceiling, escalation pins, and cost cap.",
    ],
    profileReviewReferences: fixtures.profiles.map((fixture) => ({ profileId: fixture.id, reference: JSON.parse(JSON.stringify(fixture.reviewReference)) as JsonObject })),
    negativeCases: fixtures.negativeCases.map((entry) => ({ ...entry })) as unknown as JsonObject[],
    run: manifest,
  };
}

function machineIssue(code: string, message: string, path = "$" ): ValidationIssue {
  return { code, path, message };
}

function usageAttempt(phase: "initial" | "repair", durationMs: number, usage: OpenRouterUsage, issues: readonly ValidationIssue[], outputPath?: string, outputSha256?: string): Pwqe5QualificationAttempt {
  return {
    phase,
    durationMs,
    provider: "openrouter",
    actualModel: usage.model,
    generationId: usage.generationId,
    ...(usage.requestId ? { requestId: usage.requestId } : {}),
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    reasoningTokens: usage.reasoningTokens,
    totalTokens: usage.totalTokens,
    costMicros: usage.costMicros,
    currency: usage.currency,
    issues,
    ...(outputPath ? { outputPath } : {}),
    ...(outputSha256 ? { outputSha256 } : {}),
  };
}

async function callAndValidate(input: {
  readonly phase: "initial" | "repair";
  readonly prompt: string;
  readonly system: string;
  readonly schema: JsonObject;
  readonly schemaName: string;
  readonly reportType: ReportType;
  readonly fixture: Pwqe5ProviderQualificationFixture;
  readonly packet: JsonObject;
  readonly source: Pwqe6ReportSourcePackage;
  readonly candidate: QualifiedModelTier;
  readonly provider: OpenRouterTransport;
  readonly fixtureSetSha256: string;
  readonly runKey: string;
  readonly outputDirectory: string;
  readonly budget: { capMicros: number; spentMicros: number };
  readonly saveAttempt: (attempt: Pwqe5QualificationAttempt) => Promise<void>;
  readonly now: () => Date;
}): Promise<{ readonly issues: readonly ValidationIssue[]; readonly draft?: JsonObject; readonly previousOutput?: JsonObject; readonly repairable: boolean; readonly costMicros: number; readonly overCap: boolean }> {
  assertCallWithinCostCap(input.budget, input.candidate, input.prompt, PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS);
  const startedAt = input.now().getTime();
  const response = await input.provider.generate({
    model: input.candidate.model,
    reasoningEffort: input.candidate.reasoningEffort,
    system: input.system,
    prompt: input.prompt,
    schemaName: input.schemaName,
    schema: input.schema,
    maxOutputTokens: PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS,
    idempotencyKey: `pwqe5-qualification:${input.fixtureSetSha256}:${input.runKey}:${input.phase}`,
  } satisfies OpenRouterGenerationRequest);
  const issues: ValidationIssue[] = [];
  let draft: JsonObject | undefined;
  const outputPath = `attempts/${input.reportType.toLowerCase()}/${input.candidate.name}/${input.fixture.id}/${input.phase}.json`;
  let outputValue: JsonObject;
  if (response.ok) {
    outputValue = response.output;
    await saveJson(input.outputDirectory, outputPath, outputValue);
    const checked = validatePwqe6ReportDraftValue({
      value: response.output,
      reportType: input.reportType,
      snapshotId: input.reportType === "MAP" ? input.fixture.mappingSnapshotId : input.fixture.deepeningSnapshotId,
      packet: input.packet,
      source: input.source,
    });
    if (checked.ok) {
      draft = checked.value as unknown as JsonObject;
    } else issues.push(...checked.issues);
  } else {
    issues.push(machineIssue(response.kind, response.message));
    outputValue = { kind: response.kind, message: response.message, ...(response.rawContent ? { rawContent: response.rawContent } : {}) } as JsonObject;
    await saveJson(input.outputDirectory, outputPath, outputValue);
  }
  if (response.usage.model !== input.candidate.model) {
    issues.push(machineIssue("actual_model_mismatch", `Provider returned ${response.usage.model}; requested ${input.candidate.model}.`));
    draft = undefined;
  }
  const attempt = usageAttempt(input.phase, Math.max(0, Date.now() - startedAt), response.usage, issues, outputPath, sha256Canonical(outputValue));
  await input.saveAttempt(attempt);
  return {
    issues,
    ...(draft ? { draft } : {}),
    ...(response.ok ? { previousOutput: response.output } : {}),
    repairable: response.ok || response.kind === "invalid_json",
    costMicros: response.usage.costMicros,
    overCap: input.budget.spentMicros + response.usage.costMicros > input.budget.capMicros,
  };
}

async function restoreStoredAttempt(input: {
  readonly attempt: Pwqe5QualificationAttempt;
  readonly reportType: ReportType;
  readonly fixture: Pwqe5ProviderQualificationFixture;
  readonly packet: JsonObject;
  readonly source: Pwqe6ReportSourcePackage;
  readonly candidate: QualifiedModelTier;
  readonly outputDirectory: string;
  readonly totalCostMicros: number;
  readonly costCapMicros: number;
}): Promise<{ readonly issues: readonly ValidationIssue[]; readonly draft?: JsonObject; readonly previousOutput?: JsonObject; readonly repairable: boolean; readonly costMicros: number; readonly overCap: boolean }> {
  if (!input.attempt.outputPath || !input.attempt.outputSha256) {
    throw new Error(`Stored ${input.attempt.phase} attempt is missing its output binding.`);
  }
  const root = path.resolve(input.outputDirectory);
  const outputPath = path.resolve(root, input.attempt.outputPath);
  const relative = path.relative(root, outputPath);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Stored ${input.attempt.phase} attempt output escapes its qualification directory.`);
  }
  const output = asJsonObject(JSON.parse(await readFile(outputPath, "utf8")));
  if (sha256Canonical(output) !== input.attempt.outputSha256) {
    throw new Error(`Stored ${input.attempt.phase} attempt output digest changed.`);
  }
  const overCap = input.totalCostMicros > input.costCapMicros;
  const transportIssue = input.attempt.issues.find((issue) => issue.code === "invalid_json" || issue.code === "refusal");
  if (transportIssue) {
    return {
      issues: input.attempt.issues,
      repairable: transportIssue.code === "invalid_json",
      costMicros: 0,
      overCap,
    };
  }
  const checked = validatePwqe6ReportDraftValue({
    value: output,
    reportType: input.reportType,
    snapshotId: input.reportType === "MAP" ? input.fixture.mappingSnapshotId : input.fixture.deepeningSnapshotId,
    packet: input.packet,
    source: input.source,
  });
  const issues = [...checked.issues];
  const modelMismatch = input.attempt.actualModel !== input.candidate.model;
  if (modelMismatch) issues.push(machineIssue("actual_model_mismatch", `Provider returned ${input.attempt.actualModel}; requested ${input.candidate.model}.`));
  return {
    issues,
    ...(!modelMismatch && checked.ok ? { draft: checked.value as unknown as JsonObject } : {}),
    previousOutput: output,
    repairable: true,
    costMicros: 0,
    overCap,
  };
}

export async function runPwqe5ProviderQualification(options: RunPwqe5QualificationOptions): Promise<Pwqe5QualificationRunManifest | Pwqe5PendingQualificationResult> {
  if (!Number.isSafeInteger(options.costCapMicros) || options.costCapMicros <= 0) throw new Error("A positive PWQE5 qualification cost cap is required.");
  const now = options.now ?? (() => new Date());
  const fixtures = options.fixtures ?? await buildPwqe5QualificationFixtureSet(options.workspaceRoot);
  if (fixtures.questionRelease !== PWQE5_RELEASE_IDENTITY.release
    || fixtures.routerVersion !== PWQE5_RELEASE_IDENTITY.routerVersion
    || fixtures.promptRelease !== PWQE5_RELEASE_IDENTITY.promptRelease
    || fixtures.evidenceContract !== PWQE5_RELEASE_IDENTITY.evidenceContract
    || fixtures.reportContract !== PWQE5_RELEASE_IDENTITY.reportContract
    || fixtures.sourceSha256 !== PWQE5_RELEASE_IDENTITY.sourceSha256
    || fixtures.sourceManifestSha256 !== PWQE5_SOURCE_MANIFEST_SHA256
    || fixtures.workedPathsSha256 !== PWQE5_WORKED_PATHS_SHA256
    || fixtures.negativeCasesSha256 !== PWQE5_NEGATIVE_CASES_SHA256
    || fixtures.fixtureSetSha256 !== PWQE5_QUALIFICATION_FIXTURE_SET_SHA256) {
    throw new Error("PWQE5 qualification fixtures do not match the pinned report source identity.");
  }
  const candidates = options.candidates ?? QUALIFICATION_MODEL_ORDER;
  if (candidates.length !== 4 || candidates.map((candidate) => candidate.name).join(",") !== "luna-low,luna-medium,terra-medium,sol-high") {
    throw new Error("PWQE5 qualification candidates must preserve the accepted four-tier model order.");
  }
  const candidateOrderSha256 = sha256Canonical(candidates);
  let manifest = await loadRun(options.outputDirectory) ?? {
    manifestVersion: "pwqe5-provider-run-1",
    status: "running",
    qualificationMode: "provider",
    questionRelease: PWQE5_RELEASE_IDENTITY.release,
    routerVersion: PWQE5_RELEASE_IDENTITY.routerVersion,
    promptRelease: PWQE5_RELEASE_IDENTITY.promptRelease,
    evidenceContract: PWQE5_RELEASE_IDENTITY.evidenceContract,
    reportContract: PWQE5_RELEASE_IDENTITY.reportContract,
    routerPacketSchemaId: "urn:patternwork:router-evidence:1",
    reportDraftSchemaRevision: "draft-2020-12",
    sourceSha256: PWQE5_RELEASE_IDENTITY.sourceSha256,
    sourceManifestSha256: PWQE5_SOURCE_MANIFEST_SHA256,
    workedPathsSha256: PWQE5_WORKED_PATHS_SHA256,
    negativeCasesSha256: PWQE5_NEGATIVE_CASES_SHA256,
    fixtureSetSha256: PWQE5_QUALIFICATION_FIXTURE_SET_SHA256,
    candidateOrderSha256,
    candidates: structuredClone(candidates),
    profileIds: fixtures.profiles.map((profile) => profile.id),
    startedAt: now().toISOString(),
    updatedAt: now().toISOString(),
    costCapMicros: options.costCapMicros,
    totalCostMicros: 0,
    runs: [],
    selections: {},
  } satisfies Pwqe5QualificationRunManifest;
  if (manifest.manifestVersion !== "pwqe5-provider-run-1"
    || manifest.fixtureSetSha256 !== fixtures.fixtureSetSha256
    || manifest.sourceManifestSha256 !== fixtures.sourceManifestSha256
    || manifest.workedPathsSha256 !== fixtures.workedPathsSha256
    || manifest.negativeCasesSha256 !== fixtures.negativeCasesSha256
    || manifest.candidateOrderSha256 !== candidateOrderSha256
    || sha256Canonical(manifest.candidates) !== candidateOrderSha256
    || sha256Canonical(manifest.profileIds) !== sha256Canonical(fixtures.profiles.map((profile) => profile.id))
    || manifest.costCapMicros !== options.costCapMicros) {
    throw new Error("Resumed PWQE5 qualification run does not match the pinned source, fixtures, candidates, profiles, or cost cap.");
  }
  if (manifest.status === "pending_review") return pendingResult(manifest, fixtures, draftPins(manifest, candidates));
  if (manifest.status === "machine_failed" || manifest.status === "budget_blocked") return manifest;

  for (const reportType of PWQE5_QUALIFICATION_REPORT_ORDER) {
    if (manifest.selections[reportType]) continue;
    let selected = false;
    const promptPackage = await loadPwqe6ReportPrompt(reportType, options.workspaceRoot);
    const providerSchema = openRouterStrictSchema(promptPackage.schema) as JsonObject;
    for (const candidate of candidates) {
      const records: Pwqe5QualificationRunRecord[] = [];
      let candidateFailed = false;
      for (const fixture of fixtures.profiles) {
        const key = runKey(reportType, candidate.name, fixture.id);
        let record = manifest.runs.find((run) => run.key === key);
        const input = await promptInput(reportType, fixture, manifest, options.outputDirectory);
        const packet = reportType === "MAP" ? fixture.mappingPacket : fixture.reportPacket;
        if (record?.status === "completed") {
          if (record.inputSha256 !== sha256Canonical(input) || record.sourcePacketSha256 !== sha256Canonical(packet)) {
            throw new Error(`Resumed ${key} input or packet digest changed.`);
          }
          records.push(record);
          if (!record.machinePassed) candidateFailed = true;
          continue;
        }
        const recordIdentity = initialRecord({ key, reportType, candidate, fixture, input });
        if (record && record.status === "started") {
          if (record.inputSha256 !== recordIdentity.inputSha256 || record.sourcePacketSha256 !== recordIdentity.sourcePacketSha256
            || record.requestedModel !== candidate.model || record.requestedReasoningEffort !== candidate.reasoningEffort
            || record.requestedMaxOutputTokens !== PWQE5_QUALIFICATION_MAX_OUTPUT_TOKENS) {
            throw new Error(`Resumed in-progress ${key} identity changed.`);
          }
        } else record = recordIdentity;
        manifest = replaceRun(manifest, record, now());
        await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
        const generationPrompt = buildGenerationPrompt(reportType, input);
        const addAttempt = async (attempt: Pwqe5QualificationAttempt) => {
          record = { ...record!, attempts: [...record!.attempts, attempt] };
          manifest = replaceRun(manifest, record!, now());
          await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
        };
        let checked: Awaited<ReturnType<typeof callAndValidate>>;
        try {
          const savedInitialAttempt = record!.attempts.find((attempt) => attempt.phase === "initial");
          checked = savedInitialAttempt
            ? await restoreStoredAttempt({
              attempt: savedInitialAttempt,
              reportType,
              fixture,
              packet,
              source: promptPackage.source,
              candidate,
              outputDirectory: options.outputDirectory,
              totalCostMicros: manifest.totalCostMicros,
              costCapMicros: options.costCapMicros,
            })
            : await callAndValidate({
            phase: "initial",
            prompt: generationPrompt,
            system: promptPackage.system,
            schema: providerSchema,
            schemaName: promptPackage.schemaName,
            reportType,
            fixture,
            packet,
            source: promptPackage.source,
            candidate,
            provider: options.provider,
            fixtureSetSha256: fixtures.fixtureSetSha256,
            runKey: key,
            outputDirectory: options.outputDirectory,
            budget: { capMicros: options.costCapMicros, spentMicros: manifest.totalCostMicros },
            saveAttempt: addAttempt,
            now,
          });
        } catch (error) {
          if (error instanceof ReportCostCapError) {
            manifest = { ...manifest, status: "budget_blocked", failure: error.message, updatedAt: now().toISOString() };
            await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
            return manifest;
          }
          if (error instanceof OpenRouterTransportError) {
            manifest = {
              ...manifest,
              status: error.retryable ? "running" : "machine_failed",
              failure: `OpenRouter ${error.kind}${error.statusCode ? ` HTTP ${error.statusCode}` : ""}; no usage metadata was returned.`,
              updatedAt: now().toISOString(),
            };
            await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
            return manifest;
          }
          throw error;
        }
        let finalDraft = checked.draft;
        let finalIssues = checked.issues;
        if (checked.overCap) {
          manifest = { ...manifest, status: "machine_failed", failure: "Actual provider usage exceeded the configured qualification cost cap; the run cannot be reviewed or activated.", updatedAt: now().toISOString() };
          await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
          return manifest;
        }
        if (!checked.draft && checked.repairable && !checked.issues.some((issue) => issue.code === "actual_model_mismatch")) {
          const repairPrompt = buildRepairPrompt(reportType, input, checked.issues, checked.previousOutput);
          try {
            const savedRepairAttempt = record!.attempts.find((attempt) => attempt.phase === "repair");
            const repaired = savedRepairAttempt
              ? await restoreStoredAttempt({
                attempt: savedRepairAttempt,
                reportType,
                fixture,
                packet,
                source: promptPackage.source,
                candidate,
                outputDirectory: options.outputDirectory,
                totalCostMicros: manifest.totalCostMicros,
                costCapMicros: options.costCapMicros,
              })
              : await callAndValidate({
              phase: "repair",
              prompt: repairPrompt,
              system: promptPackage.system,
              schema: providerSchema,
              schemaName: promptPackage.schemaName,
              reportType,
              fixture,
              packet,
              source: promptPackage.source,
              candidate,
              provider: options.provider,
              fixtureSetSha256: fixtures.fixtureSetSha256,
              runKey: key,
              outputDirectory: options.outputDirectory,
              budget: { capMicros: options.costCapMicros, spentMicros: manifest.totalCostMicros },
              saveAttempt: addAttempt,
              now,
            });
            if (repaired.overCap) {
              manifest = { ...manifest, status: "machine_failed", failure: "Actual provider usage exceeded the configured qualification cost cap during repair; the run cannot be reviewed or activated.", updatedAt: now().toISOString() };
              await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
              return manifest;
            }
            finalDraft = repaired.draft;
            finalIssues = repaired.issues;
          } catch (error) {
            if (error instanceof ReportCostCapError) {
              manifest = { ...manifest, status: "budget_blocked", failure: error.message, updatedAt: now().toISOString() };
              await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
              return manifest;
            }
            if (error instanceof OpenRouterTransportError) {
              const diagnostics = [
                error.providerCode ? `code=${error.providerCode}` : undefined,
                error.providerParam ? `param=${error.providerParam}` : undefined,
                error.providerName ? `provider=${error.providerName}` : undefined,
                error.providerUpstreamCode ? `upstream=${error.providerUpstreamCode}` : undefined,
                error.providerHints?.length ? `hints=${error.providerHints.join("+")}` : undefined,
                error.providerMetadataKeys?.length ? `metadata=${error.providerMetadataKeys.join("+")}` : undefined,
              ].filter(Boolean).join(", ");
              manifest = {
                ...manifest,
                status: error.retryable ? "running" : "machine_failed",
                failure: `OpenRouter ${error.kind}${error.statusCode ? ` HTTP ${error.statusCode}` : ""}${diagnostics ? ` (${diagnostics})` : ""}; no usage metadata was returned.`,
                updatedAt: now().toISOString(),
              };
              await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
              return manifest;
            }
            throw error;
          }
        }
        let finalDraftPath: string | undefined;
        let finalDraftSha256: string | undefined;
        let finalMarkdownPath: string | undefined;
        if (finalDraft) {
          finalDraftPath = `drafts/${reportType.toLowerCase()}/${candidate.name}/${fixture.id}/selected.json`;
          finalDraftSha256 = sha256Canonical(finalDraft);
          await saveJson(options.outputDirectory, finalDraftPath, finalDraft);
          finalMarkdownPath = `reports/${reportType.toLowerCase()}/${candidate.name}/${fixture.id}.md`;
          await saveText(options.outputDirectory, finalMarkdownPath, renderPwqe6ReportDraftMarkdown(finalDraft as unknown as Pwqe6ReportDraft));
        }
        record = {
          ...record!,
          status: "completed",
          machinePassed: Boolean(finalDraft && finalIssues.length === 0),
          repairUsed: record!.attempts.some((attempt) => attempt.phase === "repair"),
          ...(finalDraftPath ? { finalDraftPath, finalDraftSha256 } : {}),
          ...(finalMarkdownPath ? { finalMarkdownPath } : {}),
          issues: finalIssues,
        };
        manifest = replaceRun(manifest, record, now());
        await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
        records.push(record);
        if (!record.machinePassed) candidateFailed = true;
      }
      if (records.length !== fixtures.profiles.length) throw new Error(`${candidate.name} did not complete the full profile set for ${reportType}.`);
      if (!candidateFailed && records.every((record) => record.machinePassed)) {
        const selectedKeys = records.map((record) => record.key);
        manifest = {
          ...manifest,
          selections: {
            ...manifest.selections,
            [reportType]: { reportType, candidate: candidate.name, model: candidate.model, reasoningEffort: candidate.reasoningEffort, runKeys: selectedKeys },
          },
          updatedAt: now().toISOString(),
        };
        await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
        selected = true;
        break;
      }
    }
    if (!selected) {
      manifest = { ...manifest, status: "machine_failed", failure: `No candidate passed all ${fixtures.profiles.length} ${reportType} profile fixtures.`, updatedAt: now().toISOString() };
      await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
      return manifest;
    }
  }
  manifest = { ...manifest, status: "pending_review", updatedAt: now().toISOString() };
  await saveJson(options.outputDirectory, PWQE5_QUALIFICATION_RUN_FILE, manifest);
  const pending = pendingResult(manifest, fixtures, draftPins(manifest, candidates));
  await saveJson(options.outputDirectory, PWQE5_PENDING_REVIEW_FILE, pending);
  return pending;
}

export function approvePwqe5Qualification(
  pending: Pwqe5PendingQualificationResult,
  approval: Pwqe5QualificationReviewApproval,
): ReviewedPwqe5QualificationManifest {
  const run = pending.run;
  if (pending.status !== "pending_review"
    || run.status !== "pending_review"
    || pending.qualificationRunSha256 !== sha256Canonical(run)
    || pending.draftPinsSha256 !== sha256Canonical(pending.draftPins)
    || pending.totalCostMicros !== run.totalCostMicros
    || run.candidateOrderSha256 !== sha256Canonical(run.candidates)
    || run.profileIds.length !== 9
    || run.profileIds.some((profileId) => !pending.profileReviewReferences.some((entry) => entry.profileId === profileId))) {
    throw new Error("PWQE5 pending-review package digests, source fixture coverage, or profile references are invalid.");
  }
  if (!hasExactKeys(approval as unknown as Record<string, unknown>, ["status", "qualificationRunSha256", "draftPinsSha256", "reviewedBy", "reviewedAt", "checklist"])
    || !hasExactKeys(approval.checklist as unknown as Record<string, unknown>, ["allOutputsReviewed", "prohibitedClaimsReviewed", "traceabilityReviewed", "fixtureComparabilityReviewed", "pinsApproved"])) {
    throw new Error("PWQE5 approval contains missing or unexpected fields.");
  }
  for (const reportType of PWQE5_QUALIFICATION_REPORT_ORDER) {
    const selection = run.selections[reportType];
    const pin = pending.draftPins[reportType];
    const keys = selection?.runKeys ?? [];
    if (!selection || keys.length !== run.profileIds.length || new Set(keys).size !== run.profileIds.length) {
      throw new Error(`PWQE5 review package has no complete selected ${reportType} profile set.`);
    }
    for (const profileId of run.profileIds) {
      const record = run.runs.find((candidate) => candidate.key === keys.find((key) => run.runs.some((entry) => entry.key === key && entry.profileId === profileId)));
      if (!record?.machinePassed || record.status !== "completed" || record.reportType !== reportType
        || record.candidate !== selection.candidate || record.requestedModel !== pin.model
        || record.requestedReasoningEffort !== pin.reasoningEffort || record.requestedMaxOutputTokens !== pin.maxOutputTokens
        || !record.finalDraftPath || !record.finalDraftSha256) {
        throw new Error(`PWQE5 selected ${reportType} output is invalid or missing for ${profileId}.`);
      }
    }
  }
  if (approval.status !== "approved"
    || approval.qualificationRunSha256 !== pending.qualificationRunSha256
    || approval.draftPinsSha256 !== pending.draftPinsSha256
    || !approval.reviewedBy.trim()
    || Number.isNaN(Date.parse(approval.reviewedAt))
    || Object.values(approval.checklist).some((checked) => checked !== true)) {
    throw new Error("PWQE5 human review approval is missing identity, timestamp, completed checklist, or matching run and pin digests.");
  }
  const approvalEvidence = structuredClone(approval);
  const manifest = {
    manifestVersion: "pwqe5-qualification-1",
    status: "reviewed",
    qualificationMode: "provider",
    questionRelease: run.questionRelease,
    routerVersion: run.routerVersion,
    promptRelease: run.promptRelease,
    evidenceContract: run.evidenceContract,
    reportContract: run.reportContract,
    routerPacketSchemaId: run.routerPacketSchemaId,
    reportDraftSchemaRevision: run.reportDraftSchemaRevision,
    sourceSha256: run.sourceSha256,
    sourceManifestSha256: run.sourceManifestSha256,
    workedPathsSha256: run.workedPathsSha256,
    negativeCasesSha256: run.negativeCasesSha256,
    fixtureSetSha256: run.fixtureSetSha256,
    qualificationRunSha256: pending.qualificationRunSha256,
    candidateOrderSha256: run.candidateOrderSha256,
    draftPinsSha256: pending.draftPinsSha256,
    approvalSha256: sha256Canonical(approvalEvidence),
    reviewedAt: approval.reviewedAt,
    reviewedBy: approval.reviewedBy,
    candidates: structuredClone(run.candidates),
    approval: approvalEvidence,
    pins: Object.fromEntries(PWQE5_QUALIFICATION_REPORT_ORDER.map((reportType) => {
      const pin = pending.draftPins[reportType];
      return [reportType, {
        tier: pin.tier,
        model: pin.model,
        reasoningEffort: pin.reasoningEffort,
        escalationTier: pin.escalationTier,
        escalationModel: pin.escalationModel,
        escalationReasoningEffort: pin.escalationReasoningEffort,
        maxOutputTokens: pin.maxOutputTokens,
      }];
    })) as ReviewedPwqe5QualificationManifest["pins"],
  } satisfies ReviewedPwqe5QualificationManifest;
  return manifest;
}

export async function approveAndSavePwqe5Qualification(
  pending: Pwqe5PendingQualificationResult,
  approval: Pwqe5QualificationReviewApproval,
  outputDirectory: string,
): Promise<{ readonly manifest: ReviewedPwqe5QualificationManifest; readonly manifestSha256: string }> {
  const manifest = approvePwqe5Qualification(pending, approval);
  await saveJson(outputDirectory, "reviewed-activation-manifest.json", manifest);
  return { manifest, manifestSha256: sha256Canonical(manifest) };
}

export function serializePwqe5QualificationRun(value: unknown): string {
  return canonicalJson(value);
}
