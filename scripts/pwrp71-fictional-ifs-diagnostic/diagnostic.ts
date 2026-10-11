import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical, normalizeLf } from "../../lib/report-contracts/delivery-validator.ts";
import type { JsonObject, ValidationIssue } from "../../lib/question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256 } from "../../lib/question-engine/pwqe51-source.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import {
  GPT6_LUNA_BILLING_BASIS_SHA256,
  GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
  maximumQuotedCallCostMicros,
} from "../../lib/server/openrouter/qualification-budget.ts";
import { buildOpenRouterWirePayload, OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import { OpenRouterTransportError, type OpenRouterGenerationRequest, type OpenRouterTransport, type OpenRouterUsage } from "../../lib/server/openrouter/types.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { preparePwrp71Request, type Pwrp71PreparedRequest } from "../../lib/server/reports/pwrp71-adapter.ts";
import { buildGenerationPrompt } from "../../lib/server/reports/prompts.ts";
import { generateCanonicalReport, type Pwrp71GenerationEvent } from "../../lib/server/reports/generator.ts";
import type { Pwrp71ReportArtifact } from "../../lib/server/reports/pwrp71-validation.ts";
import {
  FileQualificationAttemptStore,
  JournaledPwrp71Transport,
  QualificationAttemptError,
  qualificationAttemptFingerprint,
  type QualificationAttemptRecord,
} from "../../lib/server/reports/qualification/attempt-store.ts";
import {
  computePwqe51RouterRuntimeSha256,
  loadPwrp71FictionalDiagnosticFixture,
} from "../../lib/server/reports/qualification/runner.ts";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../../lib/server/reports/pwrp71-readiness.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { renameFileWithTransientRetry } from "../../lib/server/reports/qualification/atomic-file.ts";

export const FICTIONAL_IFS_DIAGNOSTIC_SCHEMA = "PWRP71-FICTIONAL-IFS-DIAGNOSTIC-1" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_RUN_ID = "gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL = "openai-gpt-6-luna-max" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/live" as const;

export const FICTIONAL_IFS_DIAGNOSTIC_LIMITS = {
  maxCallCostMicros: 115_000,
  aggregateCostCapMicros: 3_000_000,
} as const;

export const FICTIONAL_IFS_DIAGNOSTIC_PINS = {
  questionSourceSha256: "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832",
  questionSourceManifestSha256: "144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc",
  routerRuntimeSha256: "d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d",
  reportSourceManifestSha256: "026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5",
  semanticCaseSetSha256: "fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d",
  fixtureManifestSha256: "17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f",
  approvalRecordSha256: "674661c9fbb12c49fbe00b1773e7dce22b4867f299c0d4c0378f548c18d2cf48",
  independentReviewSha256: "19f9e069cee6b60a777864beac326e2aeb5621483a79d82adb8e9a335148ad79",
  priorNoDispatchPreflightSha256: "2aae9c58d9305129da5f42ad69578933dbcafc3e4ea04ce0c01b8e72a041143b",
  currentPricingCheckSha256: "2fa98427307b6bfcbab46674261bef83b05f6d1cd7b697809a6838ed8e5ed4c0",
  c01PacketSha256: "c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036",
  c02PacketSha256: "c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055",
} as const;

const APPROVAL_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/approval-statements/c01-c02-live-ifs-approval.md";
const REVIEW_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/independent-review/c01-c02-current-scope-review.md";
const PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-11.json";
const PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-no-dispatch-20261011.json";
const DIAGNOSTIC_LOCK_NAME = ".diagnostic-run.lock";

type ProfileId = "C01" | "C02";
type DiagnosticPhase = "initial" | "repair" | "escalation" | "review" | "review_after_repair";

export interface FictionalIfsDiagnosticInvocation {
  readonly operatorAuthorized: true;
  readonly profiles: readonly ["C01", "C02"];
  readonly reportType: "IFS";
  readonly fixtureSet: "route-replays-v5";
  readonly model: "openai/gpt-6-luna";
  readonly reasoningEffort: "max";
  readonly maxCallCostMicros: 115_000;
  readonly aggregateCostCapMicros: 3_000_000;
}

export interface DiagnosticHttpDispatchRecord {
  readonly index: number;
  readonly idempotencyKey: string;
  readonly profileId: ProfileId;
  readonly phase: DiagnosticPhase;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly endpoint: string;
  readonly wirePayloadSha256: string;
  readonly dispatchedAt: string;
  readonly responseAt?: string;
  readonly responseStatus?: number;
  readonly responseRequestId?: string;
  readonly outcome: "dispatched" | "response_received" | "no_http_response";
}

interface DispatchFile {
  readonly schemaVersion: 1;
  readonly entries: readonly DiagnosticHttpDispatchRecord[];
}

export interface FictionalIfsDiagnosticReportResult {
  readonly profileId: ProfileId;
  readonly reportType: "IFS";
  readonly status: "accepted" | "failed";
  readonly packetSha256: string;
  readonly evidenceSha256: string;
  readonly requestedModel: string;
  readonly reasoningEffort: string;
  readonly artifactFile?: string;
  readonly markdownFile?: string;
  readonly artifactSha256?: string;
  readonly markdownSha256?: string;
  readonly usage?: {
    readonly costMicros: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly totalTokens: number;
    readonly attempts: number;
    readonly generationIds: readonly string[];
    readonly finishReasons: readonly string[];
  };
  readonly reviewerReceipts: readonly Record<string, unknown>[];
  readonly validationResults: readonly {
    readonly attemptId: string;
    readonly ok: boolean;
    readonly issues: readonly { readonly code: string; readonly path: string; readonly message: string }[];
  }[];
  readonly failure?: { readonly code: string; readonly message: string; readonly issues: readonly ValidationIssue[] };
}

export interface FictionalIfsDiagnosticRun {
  readonly schemaVersion: typeof FICTIONAL_IFS_DIAGNOSTIC_SCHEMA;
  readonly resultKind: "fictional_report_diagnostic";
  readonly purpose: "fictional_ifs_generation_validation_automated_review_and_semantic_evaluation";
  readonly status: "prepared" | "running" | "diagnostic_complete" | "diagnostic_stopped";
  readonly routingQualification: "not_claimed";
  readonly productionActivationEffect: "none";
  readonly runId: typeof FICTIONAL_IFS_DIAGNOSTIC_RUN_ID;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runFingerprint: string;
  readonly runSha256?: string;
  readonly outputDirectory: string;
  readonly attemptsFile: string;
  readonly dispatchesFile: string;
  readonly scope: {
    readonly profiles: readonly ["C01", "C02"];
    readonly reportType: "IFS";
    readonly fixtureSet: "route-replays-v5";
    readonly model: "openai/gpt-6-luna";
    readonly reasoningEffort: "max";
  };
  readonly authorization: {
    readonly operatorFlagProvided: true;
    readonly recordedApprovalSha256: string;
    readonly independentScopeReviewSha256: string;
    readonly credentialInterpretation: "approval_record_is_not_a_cryptographic_credential_or_routing_receipt";
  };
  readonly sourcePins: {
    readonly questionRelease: string;
    readonly questionSourceSha256: string;
    readonly questionSourceManifestSha256: string;
    readonly routerRuntimeSha256: string;
    readonly reportRelease: string;
    readonly reportSourceManifestSha256: string;
    readonly semanticCaseSetSha256: string;
    readonly fixtureManifestSha256: string;
    readonly fixtureSetSha256: string;
    readonly preflightSha256: string;
    readonly profiles: readonly {
      readonly profileId: ProfileId;
      readonly fixtureArtifactSha256: string;
      readonly packetSha256: string;
      readonly evidenceSha256: string;
      readonly preparedRequestFingerprint: string;
      readonly initialWirePayloadSha256: string;
    }[];
  };
  readonly pricing: {
    readonly evidenceFile: string;
    readonly evidenceSha256: string;
    readonly billingBasisSha256: string;
    readonly currentPublishedInputUsdPerMillionTokens: number;
    readonly currentPublishedCompletionUsdPerMillionTokens: number;
    readonly perCallReservationMicros: number;
    readonly aggregateAuthorizationMicros: number;
    readonly providerDependentInvoiceLimit: true;
  };
  readonly budget: {
    readonly aggregateReportedCostMicros: number;
    readonly unknownOrInFlightReservedCostMicros: number;
    readonly remainingAuthorizedMicros: number;
  };
  readonly providerDispatchCount: number;
  readonly providerDispatchesFileSha256: string;
  readonly attempts: readonly {
    readonly attemptId: string;
    readonly status: string;
    readonly requestedModel: string;
    readonly requestedReasoningEffort: string;
    readonly usage?: OpenRouterUsage;
    readonly finishReason?: string;
    readonly validation?: QualificationAttemptRecord["validation"];
    readonly reviewerReceipt?: Record<string, unknown>;
    readonly providerResultSha256?: string;
  }[];
  readonly results: readonly FictionalIfsDiagnosticReportResult[];
  readonly blockers: readonly string[];
}

type DiagnosticFixture = Awaited<ReturnType<typeof loadPwrp71FictionalDiagnosticFixture>>;

interface PreparedProfile {
  readonly fixture: DiagnosticFixture;
  readonly prepared: Pwrp71PreparedRequest;
  readonly request: OpenRouterGenerationRequest;
  readonly wireRequest: OpenRouterGenerationRequest;
  readonly requestFingerprint: string;
  readonly wirePayloadSha256: string;
}

export interface DiagnosticFetchHooks {
  readonly recordResponse: (index: number, status: number, requestId?: string) => Promise<void>;
  readonly recordNoResponse: (index: number) => Promise<void>;
}

export interface FictionalIfsDiagnosticDependencies {
  readonly workspaceRoot: string;
  readonly outputRoot?: string;
  readonly transportFactory: (input: { readonly fetch: typeof fetch }) => OpenRouterTransport | Promise<OpenRouterTransport>;
  readonly fixtureLoader?: typeof loadPwrp71FictionalDiagnosticFixture;
  readonly runtimeShaLoader?: typeof computePwqe51RouterRuntimeSha256;
  readonly now?: () => Date;
}

interface PricingEvidence {
  readonly schemaVersion: string;
  readonly checkedOn: string;
  readonly model: string;
  readonly inputUsdPerMillionTokens: number;
  readonly completionUsdPerMillionTokens: number;
  readonly contextTokens: number;
  readonly maxCompletionTokens: number;
  readonly structuredOutputJsonSchema: boolean;
  readonly providerRouting: {
    readonly requireParameters: boolean;
    readonly dataCollection: string;
    readonly zeroDataRetention: boolean;
    readonly maxPricePromptUsdPerMillionTokens: number;
    readonly maxPriceCompletionUsdPerMillionTokens: number;
  };
  readonly limits: {
    readonly quoteIsProviderDependent: boolean;
    readonly invoiceMaximumGuaranteed: boolean;
    readonly reasoningEffort: string;
    readonly pwrp71IfsMaxOutputTokens: number;
    readonly perCallReservationMicros: number;
    readonly aggregateAuthorizationMicros: number;
  };
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return sha256Bytes(Buffer.from(value, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function localDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (kind: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === kind)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function expectedPacketSha(profileId: ProfileId): string {
  return profileId === "C01" ? FICTIONAL_IFS_DIAGNOSTIC_PINS.c01PacketSha256 : FICTIONAL_IFS_DIAGNOSTIC_PINS.c02PacketSha256;
}

function validateInvocation(value: FictionalIfsDiagnosticInvocation): void {
  if (!value || value.operatorAuthorized !== true) throw new Error("An explicit --owner-authorized-fictional-diagnostic operator flag is required.");
  if (JSON.stringify(value.profiles) !== JSON.stringify(["C01", "C02"])) throw new Error("This CLI path accepts only the exact fictional C01,C02 cohort.");
  if (value.reportType !== "IFS" || value.fixtureSet !== "route-replays-v5") throw new Error("This CLI path accepts only IFS packets from route-replays-v5.");
  if (value.model !== "openai/gpt-6-luna" || value.reasoningEffort !== "max") throw new Error("The requested model and reasoning effort differ from the owner-approved pins.");
  if (value.maxCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || value.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros) {
    throw new Error("Both explicit spend limits must exactly match the authorized $0.115 per-call and $3.00 aggregate ceilings.");
  }
}

const REQUIRED_VALUE_FLAGS = [
  "--profiles",
  "--reports",
  "--fixture-set",
  "--model",
  "--reasoning-effort",
  "--max-call-cost-micros",
  "--aggregate-cost-cap-micros",
] as const;

export function parseFictionalIfsDiagnosticArgs(argv: readonly string[]): FictionalIfsDiagnosticInvocation {
  const values = new Map<string, string>();
  let operatorAuthorized = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]!;
    if (name === "--owner-authorized-fictional-diagnostic") {
      if (operatorAuthorized) throw new Error(`${name} may be specified only once.`);
      operatorAuthorized = true;
      continue;
    }
    if (!REQUIRED_VALUE_FLAGS.includes(name as typeof REQUIRED_VALUE_FLAGS[number]) || values.has(name)) {
      throw new Error(`Unsupported or duplicate diagnostic argument: ${name}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    values.set(name, value);
    index += 1;
  }
  if (!operatorAuthorized) throw new Error("An explicit --owner-authorized-fictional-diagnostic operator flag is required.");
  for (const name of REQUIRED_VALUE_FLAGS) if (!values.has(name)) throw new Error(`${name} is required.`);
  const invocation: FictionalIfsDiagnosticInvocation = {
    operatorAuthorized: true,
    profiles: values.get("--profiles")!.split(",") as ["C01", "C02"],
    reportType: values.get("--reports") as "IFS",
    fixtureSet: values.get("--fixture-set") as "route-replays-v5",
    model: values.get("--model") as "openai/gpt-6-luna",
    reasoningEffort: values.get("--reasoning-effort") as "max",
    maxCallCostMicros: Number(values.get("--max-call-cost-micros")) as 115_000,
    aggregateCostCapMicros: Number(values.get("--aggregate-cost-cap-micros")) as 3_000_000,
  };
  validateInvocation(invocation);
  return invocation;
}

export function assertDiagnosticSourcePins(input: {
  readonly questionSourceSha256: string;
  readonly questionSourceManifestSha256: string;
  readonly routerRuntimeSha256: string;
  readonly reportSourceManifestSha256: string;
  readonly semanticCaseSetSha256: string;
  readonly fixtureManifestSha256: string;
  readonly profileId: ProfileId;
  readonly packetSha256: string;
}): void {
  const expected = FICTIONAL_IFS_DIAGNOSTIC_PINS;
  for (const key of [
    "questionSourceSha256",
    "questionSourceManifestSha256",
    "routerRuntimeSha256",
    "reportSourceManifestSha256",
    "semanticCaseSetSha256",
    "fixtureManifestSha256",
  ] as const) {
    if (input[key] !== expected[key]) throw new Error(`Diagnostic source pin ${key} differs from the reviewed candidate.`);
  }
  if (input.packetSha256 !== expectedPacketSha(input.profileId)) throw new Error(`${input.profileId} IFS packet digest differs from the reviewed candidate.`);
}

async function readBytes(workspaceRoot: string, relative: string): Promise<Buffer> {
  return readFile(path.join(workspaceRoot, relative));
}

function buildRequest(input: {
  readonly profileId: ProfileId;
  readonly prepared: Pwrp71PreparedRequest;
}): { readonly request: OpenRouterGenerationRequest; readonly wireRequest: OpenRouterGenerationRequest; readonly requestFingerprint: string; readonly wirePayloadSha256: string } {
  const modelPin = UNQUALIFIED_MOCK_MODEL_POLICY.IFS;
  if (modelPin.model !== "openai/gpt-6-luna" || modelPin.reasoningEffort !== "max"
    || modelPin.maxOutputTokens !== 20_000
    || QUALIFICATION_MODEL_ORDER_NOT_FIXED(modelPin)) {
    throw new Error("The IFS candidate policy no longer matches the approved OpenRouter model, reasoning, and output pins.");
  }
  const invocationKey = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:${input.profileId}`;
  const request: OpenRouterGenerationRequest = {
    model: modelPin.model,
    reasoningEffort: modelPin.reasoningEffort,
    system: input.prepared.system,
    prompt: buildGenerationPrompt("IFS", input.prepared.user_data),
    schemaName: "patternwork_ifs_pwrp71_candidate_1",
    schema: input.prepared.response_schema,
    maxOutputTokens: modelPin.maxOutputTokens,
    idempotencyKey: `${invocationKey}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    includeUsage: true,
  };
  const wireRequest: OpenRouterGenerationRequest = {
    ...request,
    schema: projectOpenRouterStrictSchemaObject(request.schema),
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" },
    includeUsage: true,
  };
  const payload = buildOpenRouterWirePayload(wireRequest);
  const quotedCost = maximumQuotedCallCostMicros(wireRequest);
  if (quotedCost !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros) throw new Error("The model price and token limits no longer fit the approved per-call reservation.");
  return {
    request,
    wireRequest,
    requestFingerprint: qualificationAttemptFingerprint({
      request,
      wireRequest,
      endpoint: OPENROUTER_DEFAULT_ENDPOINT,
      maxCallCostMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
      aggregateCostCapMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
    }),
    wirePayloadSha256: sha256Text(JSON.stringify(payload)),
  };
}

// The diagnostic never varies the model; IFS escalation remains the same exact
// model and reasoning effort, as required by the pinned candidate policy.
function QUALIFICATION_MODEL_ORDER_NOT_FIXED(modelPin: typeof UNQUALIFIED_MOCK_MODEL_POLICY.IFS): boolean {
  return modelPin.escalationModel !== "openai/gpt-6-luna" || modelPin.escalationReasoningEffort !== "max";
}

function validatePricing(value: PricingEvidence, hash: string, now: Date): void {
  if (hash !== FICTIONAL_IFS_DIAGNOSTIC_PINS.currentPricingCheckSha256
    || value.schemaVersion !== "PWRP71-OPENROUTER-PRICING-CHECK-1"
    || value.checkedOn !== localDate(now)
    || value.model !== "openai/gpt-6-luna"
    || value.inputUsdPerMillionTokens !== 0.1
    || value.completionUsdPerMillionTokens !== 0.5
    || value.contextTokens !== 1_050_000
    || value.maxCompletionTokens !== 128_000
    || value.structuredOutputJsonSchema !== true
    || value.providerRouting.requireParameters !== true
    || value.providerRouting.dataCollection !== "deny"
    || value.providerRouting.zeroDataRetention !== true
    || value.providerRouting.maxPricePromptUsdPerMillionTokens !== 0.1
    || value.providerRouting.maxPriceCompletionUsdPerMillionTokens !== 0.5
    || value.limits.quoteIsProviderDependent !== true
    || value.limits.invoiceMaximumGuaranteed !== false
    || value.limits.reasoningEffort !== "max"
    || value.limits.pwrp71IfsMaxOutputTokens !== 20_000
    || value.limits.perCallReservationMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || value.limits.aggregateAuthorizationMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros) {
    throw new Error("Current pricing or provider-policy evidence is missing, stale, changed, or outside the approved scope.");
  }
}

function validatePreflight(input: {
  readonly preflight: Record<string, unknown>;
  readonly profiles: readonly PreparedProfile[];
  readonly runtimeSha256: string;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource: Pwrp71SourcePackage;
  readonly semanticCaseSetSha256: string;
}): string {
  const preflight = input.preflight;
  if (preflight.schemaVersion !== "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1"
    || preflight.dispatchPerformed !== false || preflight.providerCalls !== 0 || preflight.apiKeyRead !== false
    || preflight.runId !== FICTIONAL_IFS_DIAGNOSTIC_RUN_ID || preflight.fixtureSet !== "route-replays-v5") {
    throw new Error("The regenerated no-dispatch preflight is missing or has an unexpected scope/status.");
  }
  const candidate = preflight.candidate;
  const sourcePins = preflight.sourceManifestPins;
  const exactRequests = preflight.exactRequests;
  if (!isRecord(candidate) || candidate.model !== "openai/gpt-6-luna" || candidate.reasoningEffort !== "max" || candidate.reportType !== "IFS"
    || !isRecord(sourcePins)
    || sourcePins.currentRouterRuntimeSha256 !== input.runtimeSha256
    || sourcePins.questionSourceSha256 !== input.questionSource.manifest.source_binding.source_sha256
    || sourcePins.questionSourceManifestSha256 !== input.questionSource.sourceManifestSha256
    || sourcePins.reportSourceManifestSha256 !== input.reportSource.manifestSha256
    || sourcePins.semanticCaseSetSha256 !== input.semanticCaseSetSha256
    || !Array.isArray(exactRequests) || exactRequests.length !== 2) {
    throw new Error("The regenerated no-dispatch preflight does not bind the exact current sources and C01/C02 scope.");
  }
  for (const profile of input.profiles) {
    const row = exactRequests.find((entry) => isRecord(entry) && entry.profileId === profile.fixture.profileId);
    if (!isRecord(row) || row.status !== "request_prepared_no_dispatch" || !isRecord(row.request)) {
      throw new Error(`${profile.fixture.profileId} is absent from the exact regenerated no-dispatch preflight.`);
    }
    const request = row.request;
    const body = request.finalWirePayload;
    const payloadSha256 = isRecord(body) ? sha256Text(JSON.stringify(body)) : "";
    if (row.packetSha256 !== profile.fixture.packetSha256
      || request.model !== profile.request.model
      || request.reasoningEffort !== profile.request.reasoningEffort
      || request.schemaName !== profile.request.schemaName
      || request.maxOutputTokens !== profile.request.maxOutputTokens
      || !isRecord(request.requestCorrelationHeader)
      || request.requestCorrelationHeader.value !== profile.request.idempotencyKey
      || request.requestFingerprint !== profile.requestFingerprint
      || payloadSha256 !== profile.wirePayloadSha256
      || !isRecord(body) || sha256Canonical(body) !== sha256Canonical(buildOpenRouterWirePayload(profile.wireRequest))) {
      throw new Error(`${profile.fixture.profileId} serialized request differs from the prepared production PWRP 7.1 request.`);
    }
  }
  return sha256Canonical(preflight);
}

interface PreparedDiagnostic {
  readonly workspaceRoot: string;
  readonly runDirectory: string;
  readonly runFingerprint: string;
  readonly preparedProfiles: readonly PreparedProfile[];
  readonly sourcePins: FictionalIfsDiagnosticRun["sourcePins"];
  readonly authorization: FictionalIfsDiagnosticRun["authorization"];
  readonly pricing: FictionalIfsDiagnosticRun["pricing"];
}

async function prepareDiagnostic(
  invocation: FictionalIfsDiagnosticInvocation,
  dependencies: FictionalIfsDiagnosticDependencies,
): Promise<PreparedDiagnostic> {
  validateInvocation(invocation);
  const workspaceRoot = path.resolve(dependencies.workspaceRoot);
  const now = dependencies.now?.() ?? new Date();
  const [approvalBytes, reviewBytes, pricingBytes, preflightBytes, semanticBytes] = await Promise.all([
    readBytes(workspaceRoot, APPROVAL_RELATIVE),
    readBytes(workspaceRoot, REVIEW_RELATIVE),
    readBytes(workspaceRoot, PRICING_RELATIVE),
    readBytes(workspaceRoot, PREFLIGHT_RELATIVE),
    readBytes(workspaceRoot, "qualification/pwrp71/SEMANTIC_CASES.json"),
  ]);
  const approvalSha256 = sha256Bytes(approvalBytes);
  const reviewSha256 = sha256Bytes(reviewBytes);
  const pricingSha256 = sha256Bytes(pricingBytes);
  if (approvalSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.approvalRecordSha256) throw new Error("The recorded owner approval statement changed from the reviewed C01/C02 scope.");
  if (reviewSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.independentReviewSha256) throw new Error("The current-scope technical review changed from the reviewed C01/C02 scope.");
  const approvalText = approvalBytes.toString("utf8");
  const reviewText = reviewBytes.toString("utf8");
  for (const term of ["fictional v5", "C01 and C02", "IFS", "$3", "$0.115", "does not approve", "production activation"]) {
    if (!approvalText.toLowerCase().includes(term.toLowerCase())) throw new Error(`Recorded owner approval does not retain the required ${term} scope statement.`);
  }
  for (const term of [
    FICTIONAL_IFS_DIAGNOSTIC_PINS.routerRuntimeSha256,
    FICTIONAL_IFS_DIAGNOSTIC_PINS.c01PacketSha256,
    FICTIONAL_IFS_DIAGNOSTIC_PINS.c02PacketSha256,
  ]) if (!reviewText.includes(term)) throw new Error("The independent current-scope review no longer binds the exact diagnostic source and packet pins.");
  const pricing = JSON.parse(pricingBytes.toString("utf8")) as PricingEvidence;
  validatePricing(pricing, pricingSha256, now);

  const semanticCaseSetSha256 = sha256Text(normalizeLf(semanticBytes.toString("utf8")));
  if (semanticCaseSetSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256) throw new Error("The semantic case bytes do not match the PWRP 7.1 readiness pin.");
  const runtimeShaLoader = dependencies.runtimeShaLoader ?? computePwqe51RouterRuntimeSha256;
  const runtimeSha256 = await runtimeShaLoader(workspaceRoot);
  const fixtureLoader = dependencies.fixtureLoader ?? loadPwrp71FictionalDiagnosticFixture;
  const [firstFixture, secondFixture] = await Promise.all([
    fixtureLoader({ profileId: "C01", workspaceRoot }),
    fixtureLoader({ profileId: "C02", workspaceRoot }),
  ]);
  const fixtures = [firstFixture, secondFixture] as const;
  const preparedProfiles: PreparedProfile[] = [];
  for (const fixture of fixtures) {
    const questionSourceSha256 = fixture.questionSource.manifest.source_binding.source_sha256;
    assertDiagnosticSourcePins({
      questionSourceSha256,
      questionSourceManifestSha256: fixture.questionSource.sourceManifestSha256,
      routerRuntimeSha256: runtimeSha256,
      reportSourceManifestSha256: fixture.reportSource.manifestSha256,
      semanticCaseSetSha256,
      fixtureManifestSha256: fixture.fixtureManifestSha256,
      profileId: fixture.profileId,
      packetSha256: sha256Canonical(fixture.packet),
    });
    if (fixture.packetSha256 !== sha256Canonical(fixture.packet)) throw new Error(`${fixture.profileId} current packet digest is internally inconsistent.`);
    if (fixture.issues.length) throw new Error(`${fixture.profileId} IFS packet failed source/adapter checks: ${fixture.issues.map((issue) => issue.code).join(", ")}.`);
    if (fixture.reportSource.manifestSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.reportSourceManifestSha256
      || fixture.questionSource.sourceManifestSha256 !== PWQE51_SOURCE_MANIFEST_SHA256
      || fixture.questionSource.manifest.source_binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
      || fixture.reportSource.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease) {
      throw new Error(`${fixture.profileId} loaded question/report package does not match the reviewed release identities.`);
    }
    const canonicalResponseEvidence = fixture.canonicalResponseEvidence;
    const prepared = preparePwrp71Request({
      packet: fixture.packet,
      reportType: "IFS",
      questionSource: fixture.questionSource,
      reportSource: fixture.reportSource,
      canonicalResponseEvidence,
    });
    if (!prepared.ok) throw new Error(`${fixture.profileId} IFS packet failed current PWRP 7.1 preparation: ${prepared.issues.map((issue) => issue.code).join(", ")}.`);
    const request = buildRequest({ profileId: fixture.profileId, prepared: prepared.value });
    preparedProfiles.push({ fixture, prepared: prepared.value, ...request });
  }
  if (firstFixture.fixtureManifestSha256 !== secondFixture.fixtureManifestSha256
    || firstFixture.fixtureSetSha256 !== secondFixture.fixtureSetSha256) throw new Error("C01 and C02 do not share the same pinned v5 fixture set.");
  const preflight = JSON.parse(preflightBytes.toString("utf8")) as Record<string, unknown>;
  const preflightSha256 = validatePreflight({
    preflight,
    profiles: preparedProfiles,
    runtimeSha256,
    questionSource: firstFixture.questionSource,
    reportSource: firstFixture.reportSource,
    semanticCaseSetSha256,
  });
  const sourcePins: FictionalIfsDiagnosticRun["sourcePins"] = {
    questionRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
    questionSourceSha256: firstFixture.questionSource.manifest.source_binding.source_sha256,
    questionSourceManifestSha256: firstFixture.questionSource.sourceManifestSha256,
    routerRuntimeSha256: runtimeSha256,
    reportRelease: firstFixture.reportSource.policy.release,
    reportSourceManifestSha256: firstFixture.reportSource.manifestSha256,
    semanticCaseSetSha256,
    fixtureManifestSha256: firstFixture.fixtureManifestSha256,
    fixtureSetSha256: firstFixture.fixtureSetSha256,
    preflightSha256,
    profiles: preparedProfiles.map((profile) => ({
      profileId: profile.fixture.profileId,
      fixtureArtifactSha256: profile.fixture.fixtureArtifactSha256,
      packetSha256: profile.fixture.packetSha256,
      evidenceSha256: String(profile.fixture.packet.content_sha256 ?? ""),
      preparedRequestFingerprint: profile.requestFingerprint,
      initialWirePayloadSha256: profile.wirePayloadSha256,
    })),
  };
  const reportModelPolicy = structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY).IFS;
  const runFingerprint = sha256Canonical({
    schemaVersion: FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    scope: { profiles: ["C01", "C02"], reportType: "IFS", fixtureSet: "route-replays-v5", model: "openai/gpt-6-luna", reasoningEffort: "max" },
    authorization: { operatorFlagProvided: true, approvalSha256, reviewSha256 },
    pricingSha256,
    sourcePins,
    requestFingerprints: preparedProfiles.map((profile) => profile.requestFingerprint),
    candidatePolicy: reportModelPolicy,
    maxCallCostMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
    aggregateCostCapMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
    billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
  });
  const outputRoot = path.resolve(dependencies.outputRoot ?? path.join(workspaceRoot, FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE));
  return {
    workspaceRoot,
    runDirectory: path.join(outputRoot, FICTIONAL_IFS_DIAGNOSTIC_RUN_ID),
    runFingerprint,
    preparedProfiles,
    sourcePins,
    authorization: {
      operatorFlagProvided: true,
      recordedApprovalSha256: approvalSha256,
      independentScopeReviewSha256: reviewSha256,
      credentialInterpretation: "approval_record_is_not_a_cryptographic_credential_or_routing_receipt",
    },
    pricing: {
      evidenceFile: PRICING_RELATIVE,
      evidenceSha256: pricingSha256,
      billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
      currentPublishedInputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
      currentPublishedCompletionUsdPerMillionTokens: pricing.completionUsdPerMillionTokens,
      perCallReservationMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
      aggregateAuthorizationMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
      providerDependentInvoiceLimit: true,
    },
  };
}

function validateFinalWireRequest(input: string | URL | Request, init: RequestInit | undefined): {
  readonly idempotencyKey: string;
  readonly profileId: ProfileId;
  readonly phase: DiagnosticPhase;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly payloadSha256: string;
} {
  const endpoint = String(input);
  const headers = new Headers(init?.headers);
  const idempotencyKey = headers.get("x-request-id") ?? "";
  const bodyText = typeof init?.body === "string" ? init.body : "";
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(bodyText) as Record<string, unknown>; }
  catch { throw new Error("The final OpenRouter body is missing or is not valid JSON."); }
  const match = idempotencyKey.match(/^pwrp71-fictional-diagnostic:gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011:(C01|C02):IFS:(initial|repair|escalation|review|review_after_repair):openai-gpt-6-luna-max:attempt-\d+$/u);
  if (init?.method !== "POST" || endpoint !== OPENROUTER_DEFAULT_ENDPOINT || !headers.get("authorization")?.startsWith("Bearer ")
    || !match || !isRecord(payload.reasoning) || !isRecord(payload.provider) || !isRecord(payload.usage)
    || !isRecord(payload.prompt_cache_options) || !isRecord(payload.response_format) || !isRecord(payload.response_format.json_schema)) {
    throw new Error("The provider request is outside the journaled fictional diagnostic transport contract.");
  }
  const expectedKeys = ["model", "messages", "stream", "max_completion_tokens", "reasoning", "provider", "prompt_cache_options", "usage", "response_format"];
  const tierProfile = match[1] as ProfileId;
  const phase = match[2] as DiagnosticPhase;
  const messages = payload.messages;
  const jsonSchema = payload.response_format.json_schema;
  if (Object.keys(payload).sort().join("|") !== expectedKeys.slice().sort().join("|")
    || payload.model !== "openai/gpt-6-luna"
    || payload.stream !== false
    || payload.max_completion_tokens !== 20_000
    || payload.reasoning.effort !== "max"
    || sha256Canonical(payload.provider) !== sha256Canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
    || payload.prompt_cache_options.mode !== "explicit"
    || payload.usage.include !== true
    || !Array.isArray(messages) || messages.length !== 2
    || !messages.every((message) => isRecord(message) && typeof message.content === "string")
    || !["patternwork_ifs_pwrp71_candidate_1", "patternwork_ifs_pwrp71_review_candidate_1"].includes(String(jsonSchema.name))
    || jsonSchema.strict !== true || !isRecord(jsonSchema.schema)) {
    throw new Error("The serialized model, reasoning, data policy, usage, schema, or generation limits differ from the authorized request.");
  }
  return {
    idempotencyKey,
    profileId: tierProfile,
    phase,
    model: String(payload.model),
    reasoningEffort: String(payload.reasoning.effort),
    payloadSha256: sha256Text(bodyText),
  };
}

async function readDispatchFile(file: string): Promise<DispatchFile> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as DispatchFile;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.entries)) throw new Error("Diagnostic dispatch log has an invalid schema.");
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { schemaVersion: 1, entries: [] };
    throw error;
  }
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(contents, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await renameFileWithTransientRetry(temporary, file); }
  catch (error) { await rm(temporary, { force: true }).catch(() => undefined); throw error; }
}

async function saveRun(directory: string, run: FictionalIfsDiagnosticRun): Promise<FictionalIfsDiagnosticRun> {
  const withoutDigest = Object.fromEntries(Object.entries(run).filter(([key]) => key !== "runSha256")) as Omit<FictionalIfsDiagnosticRun, "runSha256">;
  const runSha256 = sha256Canonical(withoutDigest);
  const finalized = { ...withoutDigest, runSha256 } as FictionalIfsDiagnosticRun;
  await atomicWrite(path.join(directory, "run.json"), `${JSON.stringify(finalized, null, 2)}\n`);
  return finalized;
}

async function acquireRunLock(directory: string): Promise<() => Promise<void>> {
  await mkdir(directory, { recursive: true });
  const lockPath = path.join(directory, DIAGNOSTIC_LOCK_NAME);
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${process.pid}\t${new Date().toISOString()}\n`, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error("The fixed diagnostic run already has an active or unresolved owner lock; no retry or new run ID is allowed.");
    throw error;
  }
  return async () => { await handle.close(); await rm(lockPath, { force: true }); };
}

function attemptsSummary(attempts: readonly QualificationAttemptRecord[]): FictionalIfsDiagnosticRun["attempts"] {
  return attempts.map(({ providerResult, ...attempt }) => ({
    attemptId: attempt.attemptId,
    status: attempt.status,
    requestedModel: attempt.request.requestedModel,
    requestedReasoningEffort: attempt.request.requestedReasoningEffort,
    ...(attempt.usage ? { usage: attempt.usage } : {}),
    ...(attempt.finishReason ? { finishReason: attempt.finishReason } : {}),
    ...(attempt.validation ? { validation: attempt.validation } : {}),
    ...(attempt.reviewReceipt ? { reviewerReceipt: attempt.reviewReceipt } : {}),
    ...(providerResult ? { providerResultSha256: sha256Canonical(providerResult) } : {}),
  }));
}

function costAndReserve(attempts: readonly QualificationAttemptRecord[]): { reported: number; reserved: number } {
  let reported = 0;
  let reserved = 0;
  for (const attempt of attempts) {
    if (attempt.status === "completed" && attempt.usageStatus === "reported" && attempt.usage) reported += attempt.usage.costMicros;
    else reserved += attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros;
  }
  return { reported, reserved };
}

function reportUsage(attempts: readonly QualificationAttemptRecord[], invocationPrefix: string): FictionalIfsDiagnosticReportResult["usage"] {
  const selected = attempts.filter((attempt) => attempt.attemptId.startsWith(invocationPrefix));
  const usages = selected.flatMap((attempt) => attempt.status === "completed" && attempt.usageStatus === "reported" && attempt.usage ? [attempt.usage] : []);
  if (!selected.length) return undefined;
  return {
    costMicros: usages.reduce((total, usage) => total + usage.costMicros, 0),
    inputTokens: usages.reduce((total, usage) => total + usage.inputTokens, 0),
    outputTokens: usages.reduce((total, usage) => total + usage.outputTokens, 0),
    reasoningTokens: usages.reduce((total, usage) => total + usage.reasoningTokens, 0),
    totalTokens: usages.reduce((total, usage) => total + usage.totalTokens, 0),
    attempts: selected.length,
    generationIds: usages.map((usage) => usage.generationId),
    finishReasons: selected.flatMap((attempt) => attempt.finishReason ? [attempt.finishReason] : []),
  };
}

function makeRun(input: {
  readonly prepared: PreparedDiagnostic;
  readonly status: FictionalIfsDiagnosticRun["status"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly results: readonly FictionalIfsDiagnosticReportResult[];
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly blockers: readonly string[];
}): FictionalIfsDiagnosticRun {
  const totals = costAndReserve(input.attempts);
  return {
    schemaVersion: FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
    resultKind: "fictional_report_diagnostic",
    purpose: "fictional_ifs_generation_validation_automated_review_and_semantic_evaluation",
    status: input.status,
    routingQualification: "not_claimed",
    productionActivationEffect: "none",
    runId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    runFingerprint: input.prepared.runFingerprint,
    outputDirectory: input.prepared.runDirectory,
    attemptsFile: "attempts.json",
    dispatchesFile: "dispatches.json",
    scope: { profiles: ["C01", "C02"], reportType: "IFS", fixtureSet: "route-replays-v5", model: "openai/gpt-6-luna", reasoningEffort: "max" },
    authorization: input.prepared.authorization,
    sourcePins: input.prepared.sourcePins,
    pricing: input.prepared.pricing,
    budget: {
      aggregateReportedCostMicros: totals.reported,
      unknownOrInFlightReservedCostMicros: totals.reserved,
      remainingAuthorizedMicros: Math.max(0, FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - totals.reported - totals.reserved),
    },
    providerDispatchCount: input.dispatches.entries.length,
    providerDispatchesFileSha256: sha256Canonical(input.dispatches),
    attempts: attemptsSummary(input.attempts),
    results: input.results,
    blockers: input.blockers,
  };
}

async function loadRun(file: string): Promise<FictionalIfsDiagnosticRun | undefined> {
  try {
    const parsed = JSON.parse(await readFile(file, "utf8")) as FictionalIfsDiagnosticRun;
    if (parsed.schemaVersion !== FICTIONAL_IFS_DIAGNOSTIC_SCHEMA || parsed.resultKind !== "fictional_report_diagnostic" || !Array.isArray(parsed.results)) {
      throw new Error("Existing fictional diagnostic file has an invalid or incompatible schema.");
    }
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function runFictionalIfsDiagnostic(
  invocation: FictionalIfsDiagnosticInvocation,
  dependencies: FictionalIfsDiagnosticDependencies,
): Promise<FictionalIfsDiagnosticRun> {
  const prepared = await prepareDiagnostic(invocation, dependencies);
  const now = dependencies.now ?? (() => new Date());
  const runPath = path.join(prepared.runDirectory, "run.json");
  const dispatchFile = path.join(prepared.runDirectory, "dispatches.json");
  const releaseLock = await acquireRunLock(prepared.runDirectory);
  try {
    const existing = await loadRun(runPath);
    if (existing && existing.runFingerprint !== prepared.runFingerprint) throw new Error("The fixed diagnostic run ID is already bound to different approvals, source, packet, provider request, or budget pins.");
    if (existing?.status === "diagnostic_complete" || existing?.status === "diagnostic_stopped") return existing;

    const store = new FileQualificationAttemptStore(prepared.runDirectory);
    let dispatches = await readDispatchFile(dispatchFile);
    let results: FictionalIfsDiagnosticReportResult[] = [...(existing?.results ?? [])];
    const createdAt = existing?.createdAt ?? now().toISOString();
    let run = makeRun({ prepared, status: existing ? "running" : "prepared", createdAt, updatedAt: now().toISOString(), results, attempts: await store.list(), dispatches, blockers: [] });
    run = await saveRun(prepared.runDirectory, run);
    const priorAttempts = await store.list();
    if (priorAttempts.some((attempt) => attempt.status !== "completed")) {
      const stopped = makeRun({
        prepared, status: "diagnostic_stopped", createdAt, updatedAt: now().toISOString(), results,
        attempts: priorAttempts, dispatches, blockers: ["A provider attempt has unknown or in-flight billing status. The reserved amount remains held and this diagnostic will not redispatch it."],
      });
      return await saveRun(prepared.runDirectory, stopped);
    }

    const dispatchHooks: DiagnosticFetchHooks = {
      recordResponse: async (index, status, requestId) => {
        dispatches = await readDispatchFile(dispatchFile);
        const entries = dispatches.entries.map((entry) => entry.index === index
          ? { ...entry, outcome: "response_received" as const, responseAt: now().toISOString(), responseStatus: status, ...(requestId ? { responseRequestId: requestId } : {}) }
          : entry);
        dispatches = { schemaVersion: 1, entries };
        await atomicWrite(dispatchFile, `${JSON.stringify(dispatches, null, 2)}\n`);
      },
      recordNoResponse: async (index) => {
        dispatches = await readDispatchFile(dispatchFile);
        dispatches = { schemaVersion: 1, entries: dispatches.entries.map((entry) => entry.index === index ? { ...entry, outcome: "no_http_response" as const } : entry) };
        await atomicWrite(dispatchFile, `${JSON.stringify(dispatches, null, 2)}\n`);
      },
    };
    const provider = await dependencies.transportFactory({
      fetch: createDiagnosticFetch({
        dispatchFile,
        store,
        hooks: dispatchHooks,
        now,
      }),
    });
    if (provider.endpoint && provider.endpoint !== OPENROUTER_DEFAULT_ENDPOINT) throw new Error("The diagnostic requires the default OpenRouter endpoint; custom endpoints are not accepted.");

    for (const profile of prepared.preparedProfiles) {
      const priorResult = results.find((result) => result.profileId === profile.fixture.profileId && result.reportType === "IFS");
      if (priorResult?.status === "accepted") continue;
      if (priorResult?.status === "failed") break;
      const invocationPrefix = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:${profile.fixture.profileId}:`;
      const attemptsBefore = await store.list();
      const spentBefore = attemptsBefore
        .filter((attempt) => !attempt.attemptId.startsWith(invocationPrefix))
        .reduce((total, attempt) => total + (attempt.status === "completed" && attempt.usageStatus === "reported"
          ? attempt.usage?.costMicros ?? attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros
          : attempt.reservedCostMicros ?? attempt.locallyEstimatedCostMicros), 0);
      const journaled = new JournaledPwrp71Transport({
        store,
        transport: provider,
        endpoint: provider.endpoint ?? OPENROUTER_DEFAULT_ENDPOINT,
        maxCallCostMicros: invocation.maxCallCostMicros,
        aggregateCostCapMicros: invocation.aggregateCostCapMicros,
        usageStatus: "reported",
        now,
        onResult: (_request, result) => {
          if (result.usage.model !== invocation.model) {
            throw new OpenRouterTransportError("protocol", `The fictional diagnostic requested ${invocation.model}, but the provider reported ${result.usage.model}.`, { retryable: false });
          }
        },
      });
      const generated = await generateCanonicalReport({
        reportType: "IFS",
        input: {} as JsonObject,
        packets: [profile.fixture.packet],
        provider: journaled,
        invocationKey: invocationPrefix.slice(0, -1),
        spentMicros: spentBefore,
        costCapMicros: invocation.aggregateCostCapMicros,
        modelPolicy: structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY),
        contractVersion: "v7.1",
        requestIdentityLabel: FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL,
        pwrp71: { request: profile.prepared, packet: profile.fixture.packet, source: profile.fixture.reportSource },
        onPwrp71Event: async (event: Pwrp71GenerationEvent) => store.recordGenerationEvent(event),
      });
      const attempts = await store.list();
      const ownAttempts = attempts.filter((attempt) => attempt.attemptId.startsWith(invocationPrefix));
      const receipts = ownAttempts.flatMap((attempt) => attempt.reviewReceipt ? [attempt.reviewReceipt] : []);
      const validations = ownAttempts.flatMap((attempt) => attempt.validation ? [{ attemptId: attempt.attemptId, ...attempt.validation }] : []);
      const usage = reportUsage(attempts, invocationPrefix);
      let reportResult: FictionalIfsDiagnosticReportResult;
      if (!generated.ok) {
        reportResult = {
          profileId: profile.fixture.profileId,
          reportType: "IFS",
          status: "failed",
          packetSha256: profile.fixture.packetSha256,
          evidenceSha256: String(profile.fixture.packet.content_sha256 ?? ""),
          requestedModel: invocation.model,
          reasoningEffort: invocation.reasoningEffort,
          ...(usage ? { usage } : {}),
          reviewerReceipts: receipts,
          validationResults: validations,
          failure: { code: generated.failure.code, message: generated.failure.message, issues: generated.failure.issues },
        };
      } else {
        const artifact = generated.value.artifact as Pwrp71ReportArtifact;
        const artifactFile = `reports/${profile.fixture.profileId}_IFS.json`;
        const markdownFile = `reports/${profile.fixture.profileId}_IFS.md`;
        await atomicWrite(path.join(prepared.runDirectory, artifactFile), `${JSON.stringify(artifact, null, 2)}\n`);
        await atomicWrite(path.join(prepared.runDirectory, markdownFile), artifact.report_markdown);
        reportResult = {
          profileId: profile.fixture.profileId,
          reportType: "IFS",
          status: "accepted",
          packetSha256: profile.fixture.packetSha256,
          evidenceSha256: artifact.evidence_sha256,
          requestedModel: invocation.model,
          reasoningEffort: invocation.reasoningEffort,
          artifactFile,
          markdownFile,
          artifactSha256: artifact.digests.artifact_sha256,
          markdownSha256: artifact.digests.report_markdown_sha256,
          ...(usage ? { usage } : {}),
          reviewerReceipts: receipts,
          validationResults: validations,
        };
      }
      results = [...results.filter((result) => result.profileId !== profile.fixture.profileId), reportResult];
      const stoppedDueUnknown = attempts.some((attempt) => attempt.status !== "completed");
      const [latestAttempts, latestDispatches] = await Promise.all([store.list(), readDispatchFile(dispatchFile)]);
      dispatches = latestDispatches;
      const status: FictionalIfsDiagnosticRun["status"] = !generated.ok || stoppedDueUnknown ? "diagnostic_stopped" : "running";
      run = makeRun({
        prepared,
        status,
        createdAt,
        updatedAt: now().toISOString(),
        results,
        attempts: latestAttempts,
        dispatches,
        blockers: generated.ok ? [] : [`${profile.fixture.profileId} stopped after ${generated.failure.code}: ${generated.failure.message}`],
      });
      run = await saveRun(prepared.runDirectory, run);
      if (status === "diagnostic_stopped") break;
    }

    const attempts = await store.list();
    dispatches = await readDispatchFile(dispatchFile);
    const allAccepted = ["C01", "C02"].every((profileId) => results.some((result) => result.profileId === profileId && result.status === "accepted"));
    const hasUnknown = attempts.some((attempt) => attempt.status !== "completed");
    const status: FictionalIfsDiagnosticRun["status"] = allAccepted && !hasUnknown ? "diagnostic_complete" : "diagnostic_stopped";
    const blockers = status === "diagnostic_complete" ? [] : run.blockers.length ? run.blockers : [
      hasUnknown ? "A provider attempt has unknown billing status; its reservation remains held and no retry was made." : "The approved C01/C02 diagnostic did not complete both accepted IFS outputs.",
    ];
    return await saveRun(prepared.runDirectory, makeRun({ prepared, status, createdAt, updatedAt: now().toISOString(), results, attempts, dispatches, blockers }));
  } catch (error) {
    const store = new FileQualificationAttemptStore(prepared.runDirectory);
    const [attempts, dispatches] = await Promise.all([store.list().catch(() => []), readDispatchFile(dispatchFile).catch(() => ({ schemaVersion: 1 as const, entries: [] }))]);
    const prior = await loadRun(runPath).catch(() => undefined);
    const stopped = makeRun({
      prepared,
      status: "diagnostic_stopped",
      createdAt: prior?.createdAt ?? now().toISOString(),
      updatedAt: now().toISOString(),
      results: prior?.results ?? [],
      attempts,
      dispatches,
      blockers: [error instanceof QualificationAttemptError && error.code === "attempt_uncertain"
        ? "A provider attempt has unknown billing status; its full reservation is retained and no automatic retry was attempted."
        : error instanceof Error ? error.message : "The diagnostic stopped after an unexpected operational error."],
    });
    return await saveRun(prepared.runDirectory, stopped);
  } finally {
    await releaseLock();
  }
}

export function createDiagnosticFetch(input: {
  readonly dispatchFile: string;
  readonly store: FileQualificationAttemptStore;
  readonly hooks: DiagnosticFetchHooks;
  readonly now: () => Date;
}): typeof fetch {
  const consumedAttemptIds = new Set<string>();
  return async (request, init) => {
    const checked = validateFinalWireRequest(request, init);
    if (consumedAttemptIds.has(checked.idempotencyKey)) throw new Error("This durable fictional diagnostic attempt has already crossed its one-use dispatch boundary.");
    const attempt = await input.store.get(checked.idempotencyKey);
    if (!attempt
      || attempt.status !== "started"
      || attempt.attemptId !== checked.idempotencyKey
      || attempt.endpoint !== String(request)
      || attempt.request.idempotencyKey !== checked.idempotencyKey
      || attempt.request.requestedModel !== checked.model
      || attempt.request.requestedReasoningEffort !== checked.reasoningEffort
      || attempt.request.maxOutputTokens !== 20_000
      || !attempt.request.schemaName.startsWith("patternwork_ifs_pwrp71_")
      || attempt.maximumCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
      || attempt.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
      || attempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
      || !Number.isSafeInteger(attempt.reservedCostMicros)
      || (attempt.reservedCostMicros ?? 0) <= 0
      || (attempt.reservedCostMicros ?? Number.POSITIVE_INFINITY) > FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
      || attempt.wirePayloadSha256 !== checked.payloadSha256) {
      throw new Error("The final provider payload has no matching durable C01/C02 IFS journal reservation or differs from its exact authorized wire request.");
    }
    if (consumedAttemptIds.has(checked.idempotencyKey)) throw new Error("This durable fictional diagnostic attempt has already crossed its one-use dispatch boundary.");
    consumedAttemptIds.add(checked.idempotencyKey);
    const dispatches = await readDispatchFile(input.dispatchFile);
    if (dispatches.entries.some((entry) => entry.idempotencyKey === checked.idempotencyKey)) {
      throw new Error("This journaled fictional diagnostic attempt already has a durable dispatch record and cannot be sent again.");
    }
    const index = dispatches.entries.length + 1;
    const entry: DiagnosticHttpDispatchRecord = {
      index,
      idempotencyKey: checked.idempotencyKey,
      profileId: checked.profileId,
      phase: checked.phase,
      model: checked.model,
      reasoningEffort: checked.reasoningEffort,
      endpoint: String(request),
      wirePayloadSha256: checked.payloadSha256,
      dispatchedAt: input.now().toISOString(),
      outcome: "dispatched",
    };
    await atomicWrite(input.dispatchFile, `${JSON.stringify({ schemaVersion: 1, entries: [...dispatches.entries, entry] } satisfies DispatchFile, null, 2)}\n`);
    try {
      const response = await globalThis.fetch(request, init);
      await input.hooks.recordResponse(index, response.status, response.headers.get("x-request-id") ?? response.headers.get("x-openrouter-request-id") ?? undefined);
      return response;
    } catch (error) {
      await input.hooks.recordNoResponse(index);
      throw error;
    }
  };
}

export function diagnosticManifestCannotQualify(value: unknown): boolean {
  return !isRecord(value)
    || value.schemaVersion !== 1
    || value.resultKind === "fictional_report_diagnostic"
    || value.routingQualification === "not_claimed"
    || value.routeParity !== "qualified";
}
