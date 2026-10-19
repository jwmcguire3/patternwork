import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadEnvConfig } from "@next/env";
import { normalizeLf, sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../lib/question-engine/pwqe51-source.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import {
  GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY,
  maximumQuotedCallCostMicros,
} from "../../lib/server/openrouter/qualification-budget.ts";
import { OPENROUTER_DEFAULT_ENDPOINT } from "../../lib/server/openrouter/wire.ts";
import type { OpenRouterGenerationResult } from "../../lib/server/openrouter/types.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import {
  FileQualificationAttemptStore,
  JournaledPwrp71Transport,
  type QualificationAttemptRecord,
} from "../../lib/server/reports/qualification/attempt-store.ts";
import {
  computePwqe51RouterRuntimeSha256,
  loadPwrp71FictionalDiagnosticFixture,
} from "../../lib/server/reports/qualification/runner.ts";
import { PWRP71_SEMANTIC_CASE_SET_SHA256 } from "../../lib/server/reports/pwrp71-readiness.ts";
import {
  assertDiagnosticSourcePins,
  createDiagnosticFetch,
  buildFictionalDiagnosticRequest,
  FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE,
  FICTIONAL_IFS_DIAGNOSTIC_PINS,
  FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID,
  FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
  OPENAI_ERROR_DETAIL_RESEND_MARKER,
} from "./diagnostic.ts";
import { assertOpenRouterNonZdrDiagnosticRouteEligible, assertOpenRouterReachable, type OpenRouterDiagnosticRouteEvidence } from "./connectivity.ts";
import { renameFileWithTransientRetry } from "../../lib/server/reports/qualification/atomic-file.ts";

export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_PARENT_SHA256 = "3959ea731dc6effa86703060023007bb1a9f97fbbb8a0c3eff1d0f0a0ea254c6" as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256 = "4db2ad54d5fcb3de6d1753c0d3f90dfd169983beb668e8cf15e0a5bad93e735c" as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_SCHEMA_SHA256 = "8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451" as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_PRICING_SHA256 = "b447dbc231f34b76c5d8a7406628ce928775d5a8293aa8c9ce1bdadac691f11c" as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS = 115_000 as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS = 3_000_000 as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_PRIOR_UNKNOWN_MICROS = 230_000 as const;
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_OUTPUT_RELATIVE = `${FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE}/${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}` as const;

const PARENT_RUN_ID = FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID;
const PARENT_RELATIVE = `${FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE}/${PARENT_RUN_ID}`;
const NON_ZDR_PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-12-openai-non-zdr.json";
const APPROVAL_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/approval-statements/c01-c02-live-ifs-approval.md";
const REVIEW_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/independent-review/c01-c02-current-scope-review.md";
const ERROR_DETAIL_RESEND_OPERATOR_FLAG = "--owner-authorized-c01-openai-error-detail-resend";
const ALLOW_NON_ZDR_OPERATOR_FLAG = "--owner-authorized-allow-non-zdr";

export interface FictionalIfsErrorDetailResendInvocation {
  readonly operatorAuthorized: true;
  readonly allowNonZdr: true;
  readonly maxCallCostMicros: typeof FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS;
  readonly aggregateCostCapMicros: typeof FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS;
}

interface ParentRun {
  readonly runSha256?: unknown;
  readonly runId?: unknown;
  readonly status?: unknown;
  readonly routingQualification?: unknown;
  readonly productionActivationEffect?: unknown;
  readonly providerDispatchCount?: unknown;
  readonly providerDispatchesFileSha256?: unknown;
  readonly scope?: Record<string, unknown>;
  readonly sourcePins?: Record<string, unknown>;
  readonly pricing?: Record<string, unknown>;
  readonly budget?: Record<string, unknown>;
}

interface DispatchEntry {
  readonly index: number;
  readonly idempotencyKey: string;
  readonly profileId: string;
  readonly phase: string;
  readonly requestVariant?: string;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly endpoint: string;
  readonly wirePayloadSha256: string;
  readonly outcome: string;
  readonly responseStatus?: number;
  readonly responseRequestId?: string;
}

interface DispatchFile {
  readonly schemaVersion: 1;
  readonly entries: readonly DispatchEntry[];
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
    readonly providerAllowlist: readonly string[];
    readonly providerFallbacks: boolean;
    readonly requireParameters: boolean;
    readonly dataCollection: string;
    readonly zeroDataRetention: boolean;
    readonly maxPricePromptUsdPerMillionTokens: number;
    readonly maxPriceCompletionUsdPerMillionTokens: number;
  };
  readonly privacyAcknowledgement: {
    readonly ownerDirective: string;
    readonly providerMayRetainPrompts: boolean;
  };
  readonly sources: readonly string[];
  readonly limits: {
    readonly quoteIsProviderDependent: boolean;
    readonly invoiceMaximumGuaranteed: boolean;
    readonly reasoningEffort: string;
    readonly pwrp71IfsMaxOutputTokens: number;
    readonly perCallReservationMicros: number;
    readonly aggregateAuthorizationMicros: number;
  };
}

interface PreparedResend {
  readonly workspaceRoot: string;
  readonly parentRunSha256: string;
  readonly parentAttempts: readonly QualificationAttemptRecord[];
  readonly parentDispatches: DispatchFile;
  readonly parentRunBytes: Buffer;
  readonly parentAttemptsBytes: Buffer;
  readonly parentDispatchesBytes: Buffer;
  readonly parentReservedMicros: number;
  readonly route: OpenRouterDiagnosticRouteEvidence;
  readonly pricing: PricingEvidence;
  readonly pricingSha256: string;
  readonly fixture: Awaited<ReturnType<typeof loadPwrp71FictionalDiagnosticFixture>>;
  readonly request: ReturnType<typeof buildFictionalDiagnosticRequest>["request"];
  readonly wireRequest: ReturnType<typeof buildFictionalDiagnosticRequest>["wireRequest"];
  readonly requestFingerprint: string;
  readonly wirePayloadSha256: string;
  readonly sourcePins: Record<string, unknown>;
}

export function parseFictionalIfsErrorDetailResendArgs(argv: readonly string[]): FictionalIfsErrorDetailResendInvocation {
  let operatorAuthorized = false;
  let allowNonZdr = false;
  const values = new Map<string, string>();
  const acceptedValues = new Set(["--max-call-cost-micros", "--aggregate-cost-cap-micros"]);
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]!;
    if (name === ERROR_DETAIL_RESEND_OPERATOR_FLAG) {
      if (operatorAuthorized) throw new Error(`${name} may appear only once.`);
      operatorAuthorized = true;
      continue;
    }
    if (name === ALLOW_NON_ZDR_OPERATOR_FLAG) {
      if (allowNonZdr) throw new Error(`${name} may appear only once.`);
      allowNonZdr = true;
      continue;
    }
    if (!acceptedValues.has(name) || values.has(name)) throw new Error(`Unsupported or duplicate resend argument: ${name}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    values.set(name, value);
    index += 1;
  }
  if (!operatorAuthorized) throw new Error(`Explicit ${ERROR_DETAIL_RESEND_OPERATOR_FLAG} authorization is required.`);
  if (!allowNonZdr) throw new Error(`Explicit ${ALLOW_NON_ZDR_OPERATOR_FLAG} authorization is required for this exact resend.`);
  if (Number(values.get("--max-call-cost-micros")) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
    || values.get("--max-call-cost-micros") !== "115000") {
    throw new Error("The per-call reservation must be explicitly set to exactly 115000 microdollars.");
  }
  if (Number(values.get("--aggregate-cost-cap-micros")) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS
    || values.get("--aggregate-cost-cap-micros") !== "3000000") {
    throw new Error("The aggregate authorization must be explicitly set to exactly 3000000 microdollars.");
  }
  return {
    operatorAuthorized: true,
    allowNonZdr: true,
    maxCallCostMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS,
    aggregateCostCapMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS,
  };
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function dateInNewYork(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await renameFileWithTransientRetry(temporary, file); }
  catch (error) { await import("node:fs/promises").then(({ rm }) => rm(temporary, { force: true })).catch(() => undefined); throw error; }
}

function validatePriorRun(input: {
  readonly run: ParentRun;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
}): { readonly runSha256: string; readonly reservedMicros: number } {
  const { run, attempts, dispatches } = input;
  if (run.runSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_PARENT_SHA256
    || run.runId !== PARENT_RUN_ID || run.status !== "diagnostic_stopped"
    || run.routingQualification !== "not_claimed" || run.productionActivationEffect !== "none") {
    throw new Error("The current parent is not the exact stopped, fictional-only diagnostic approved for this one-shot resend.");
  }
  const withoutDigest = Object.fromEntries(Object.entries(run).filter(([key]) => key !== "runSha256"));
  if (sha256Canonical(withoutDigest) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_PARENT_SHA256) throw new Error("The parent run manifest integrity digest does not match the reviewed parent.");
  const scope = run.scope;
  if (JSON.stringify(scope?.profiles) !== JSON.stringify(["C01", "C02"])) throw new Error("The parent profile scope is not the approved C01/C02 fictional scope.");
  if (scope?.reportType !== "IFS" || scope?.fixtureSet !== "route-replays-v5" || scope?.model !== "openai/gpt-6-luna"
    || scope?.reasoningEffort !== "max" || scope?.retentionPolicy !== "non_zdr_allowed") {
    throw new Error("The parent report, fixture, model, reasoning, or non-ZDR policy differs from the approved request.");
  }
  if (attempts.length !== 2 || dispatches.schemaVersion !== 1 || dispatches.entries.length !== 2
    || run.providerDispatchCount !== 2 || run.providerDispatchesFileSha256 !== sha256Canonical(dispatches)
    || Number(run.budget?.unknownOrInFlightReservedCostMicros) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_PRIOR_UNKNOWN_MICROS
    || Number(run.budget?.aggregateReportedCostMicros) !== 0) {
    throw new Error("The parent ledger must contain exactly two unresolved 115000-microdollar C01 attempts and no reported cost.");
  }
  const attemptIds = attempts.map((attempt) => attempt.attemptId);
  const [firstId, secondId] = dispatches.entries.map((entry) => entry.idempotencyKey);
  if (attemptIds[0] !== firstId || attemptIds[1] !== secondId
    || attempts.some((attempt) => attempt.status !== "unknown" || attempt.usageStatus !== "unknown"
      || attempt.request.requestedModel !== "openai/gpt-6-luna" || attempt.request.requestedReasoningEffort !== "max"
      || attempt.reservedCostMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
      || attempt.maximumCallCostMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
      || attempt.aggregateCostCapMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS
      || attempt.endpoint !== OPENROUTER_DEFAULT_ENDPOINT)) {
    throw new Error("The parent attempt journal no longer matches the exact two unknown C01 provider attempts.");
  }
  const [first, second] = dispatches.entries;
  if (!first || !second || first.index !== 1 || second.index !== 2
    || first.profileId !== "C01" || second.profileId !== "C01"
    || first.phase !== "initial" || second.phase !== "initial"
    || first.responseStatus !== 404 || second.responseStatus !== 400
    || first.endpoint !== OPENROUTER_DEFAULT_ENDPOINT || second.endpoint !== OPENROUTER_DEFAULT_ENDPOINT
    || second.requestVariant !== "openai-non-zdr-continuation-1"
    || second.wirePayloadSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256
    || attempts[1]?.diagnostic?.providerName !== "OpenAI"
    || attempts[1]?.diagnostic?.providerUpstreamCode !== "invalid_json_schema") {
    throw new Error("The parent does not contain the documented ZDR route rejection followed by the OpenAI schema rejection.");
  }
  if (attempts.some((attempt) => attempt.attemptId.includes(":C02:"))
    || dispatches.entries.some((entry) => entry.profileId !== "C01" || entry.idempotencyKey.includes(":C02:"))) {
    throw new Error("The prior run unexpectedly dispatched outside C01; this resend is blocked.");
  }
  const priorWireSchemaSha = attempts[1]?.request.wireSchemaSha256;
  if (priorWireSchemaSha !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_SCHEMA_SHA256) throw new Error("The prior serialized schema identity differs from the reviewed C01 request.");
  return { runSha256: FICTIONAL_IFS_ERROR_DETAIL_RESEND_PARENT_SHA256, reservedMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_PRIOR_UNKNOWN_MICROS };
}

function validatePricing(input: { readonly pricing: PricingEvidence; readonly digest: string; readonly date: string }): void {
  const { pricing, digest, date } = input;
  const allowedSources = [
    "https://developers.openai.com/api/docs/models/gpt-6-luna",
    "https://openrouter.ai/openai/gpt-6-luna/providers",
    "https://openrouter.ai/docs/guides/routing/provider-selection",
  ];
  if (pricing.schemaVersion !== "PWRP71-OPENROUTER-PRICING-CHECK-1" || pricing.checkedOn !== date
    || pricing.model !== "openai/gpt-6-luna" || pricing.inputUsdPerMillionTokens !== 0.1
    || pricing.completionUsdPerMillionTokens !== 0.5 || pricing.contextTokens !== 1_050_000
    || pricing.maxCompletionTokens !== 128_000 || pricing.structuredOutputJsonSchema !== true
    || JSON.stringify(pricing.providerRouting.providerAllowlist) !== JSON.stringify(["OpenAI"])
    || pricing.providerRouting.providerFallbacks !== false || pricing.providerRouting.requireParameters !== true
    || pricing.providerRouting.dataCollection !== "deny" || pricing.providerRouting.zeroDataRetention !== false
    || pricing.providerRouting.maxPricePromptUsdPerMillionTokens !== 0.1
    || pricing.providerRouting.maxPriceCompletionUsdPerMillionTokens !== 0.5
    || pricing.privacyAcknowledgement.ownerDirective !== "allow non zdr"
    || pricing.privacyAcknowledgement.providerMayRetainPrompts !== true
    || pricing.limits.quoteIsProviderDependent !== true || pricing.limits.invoiceMaximumGuaranteed !== false
    || pricing.limits.reasoningEffort !== "max" || pricing.limits.pwrp71IfsMaxOutputTokens !== 20_000
    || pricing.limits.perCallReservationMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
    || pricing.limits.aggregateAuthorizationMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS
    || allowedSources.some((source) => !pricing.sources.includes(source))
    || digest !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_PRICING_SHA256) {
    throw new Error("Today's pricing or explicit OpenAI-only non-ZDR provider evidence is missing or mismatched.");
  }
}

async function prepareResend(input: {
  readonly workspaceRoot: string;
  readonly now: Date;
  readonly route: OpenRouterDiagnosticRouteEvidence;
}): Promise<PreparedResend> {
  const { workspaceRoot, now, route } = input;
  const parentDir = path.join(workspaceRoot, PARENT_RELATIVE);
  const [runBytes, attemptsBytes, dispatchesBytes, pricingBytes, approvalBytes, reviewBytes, semanticBytes] = await Promise.all([
    readFile(path.join(parentDir, "run.json")), readFile(path.join(parentDir, "attempts.json")), readFile(path.join(parentDir, "dispatches.json")),
    readFile(path.join(workspaceRoot, NON_ZDR_PRICING_RELATIVE)), readFile(path.join(workspaceRoot, APPROVAL_RELATIVE)),
    readFile(path.join(workspaceRoot, REVIEW_RELATIVE)), readFile(path.join(workspaceRoot, "qualification/pwrp71/SEMANTIC_CASES.json")),
  ]);
  const run = JSON.parse(runBytes.toString("utf8")) as ParentRun;
  const attemptsFile = JSON.parse(attemptsBytes.toString("utf8")) as { readonly schemaVersion: number; readonly attempts: readonly QualificationAttemptRecord[] };
  const dispatches = JSON.parse(dispatchesBytes.toString("utf8")) as DispatchFile;
  if (attemptsFile.schemaVersion !== 1 || !Array.isArray(attemptsFile.attempts)) throw new Error("The parent attempts file has an invalid format.");
  const parent = validatePriorRun({ run, attempts: attemptsFile.attempts, dispatches });
  const parentDispatchDigest = run.providerDispatchesFileSha256;
  if (parentDispatchDigest !== sha256Canonical(dispatches)) throw new Error("The parent dispatch receipt digest changed.");
  if (sha256(approvalBytes) !== FICTIONAL_IFS_DIAGNOSTIC_PINS.approvalRecordSha256
    || sha256(reviewBytes) !== FICTIONAL_IFS_DIAGNOSTIC_PINS.independentReviewSha256) {
    throw new Error("The owner approval or independent scope review no longer matches the reviewed pins.");
  }
  const approvalText = approvalBytes.toString("utf8");
  for (const required of ["fictional v5", "C01 and C02", "IFS", "$3", "$0.115", "does not approve", "production activation"]) {
    if (!approvalText.toLocaleLowerCase("en-US").includes(required.toLocaleLowerCase("en-US"))) throw new Error(`The recorded approval no longer contains its ${required} scope boundary.`);
  }
  const pricing = JSON.parse(pricingBytes.toString("utf8")) as PricingEvidence;
  const pricingSha256 = sha256(pricingBytes);
  validatePricing({ pricing, digest: pricingSha256, date: dateInNewYork(now) });
  const semanticCaseSetSha256 = createHash("sha256").update(normalizeLf(semanticBytes.toString("utf8")), "utf8").digest("hex");
  if (semanticCaseSetSha256 !== PWRP71_SEMANTIC_CASE_SET_SHA256
    || semanticCaseSetSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.semanticCaseSetSha256) throw new Error("The CQ semantic case set changed from the reviewed candidate.");
  if (route.model !== "openai/gpt-6-luna" || route.privacyMode !== "non_zdr_allowed"
    || route.zeroDataRetentionRequired !== false || route.dataCollectionPolicy !== "deny"
    || route.providerAllowlist.join(",") !== "openai" || route.matchingEligibleEndpointCount < 1
    || route.matchingEligibleEndpoints.some((entry) => entry.provider.toLocaleLowerCase("en-US") !== "openai")) {
    throw new Error("Current OpenRouter endpoint metadata does not confirm the approved OpenAI-only non-ZDR route.");
  }
  const fixture = await loadPwrp71FictionalDiagnosticFixture({ profileId: "C01", workspaceRoot });
  const routerRuntimeSha256 = await computePwqe51RouterRuntimeSha256(workspaceRoot);
  assertDiagnosticSourcePins({
    questionSourceSha256: fixture.questionSource.manifest.source_binding.source_sha256,
    questionSourceManifestSha256: fixture.questionSource.sourceManifestSha256,
    routerRuntimeSha256,
    reportSourceManifestSha256: fixture.reportSource.manifestSha256,
    semanticCaseSetSha256,
    fixtureManifestSha256: fixture.fixtureManifestSha256,
    profileId: "C01",
    packetSha256: fixture.packetSha256,
  });
  if (fixture.packetSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.c01PacketSha256
    || fixture.packetSha256 !== sha256Canonical(fixture.packet)
    || fixture.reportSource.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || fixture.questionSource.manifest.source_binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256
    || fixture.issues.length > 0) {
    throw new Error("The current C01 v5 fictional packet or report/question source failed its pinned source and adapter checks.");
  }
  const parentPins = run.sourcePins;
  const parentProfilePins = parentPins?.profiles as readonly Record<string, unknown>[] | undefined;
  const parentC01 = parentProfilePins?.find((pin) => pin.profileId === "C01");
  if (parentC01?.packetSha256 !== fixture.packetSha256 || parentC01.fixtureArtifactSha256 !== fixture.fixtureArtifactSha256
    || parentC01.evidenceSha256 !== String((fixture.packet as Record<string, unknown>).content_sha256)
    || parentPins?.routerRuntimeSha256 !== routerRuntimeSha256
    || parentPins?.fixtureManifestSha256 !== fixture.fixtureManifestSha256
    || parentPins?.fixtureSetSha256 !== fixture.fixtureSetSha256) {
    throw new Error("The current C01 packet/source differs from the immutable stopped-run evidence.");
  }
  const prepared = preparePwrp71Request({
    packet: fixture.packet,
    reportType: "IFS",
    questionSource: fixture.questionSource,
    reportSource: fixture.reportSource,
    canonicalResponseEvidence: fixture.canonicalResponseEvidence,
  });
  if (!prepared.ok) throw new Error(`The current C01 packet failed production PWRP 7.1 preparation: ${prepared.issues.map((issue) => issue.code).join(", ")}.`);
  const request = buildFictionalDiagnosticRequest({
    profileId: "C01", prepared: prepared.value, runId: FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
    continuation: false, errorDetailResend: true,
  });
  const oldAttempt = attemptsFile.attempts[1];
  if (request.wirePayloadSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256
    || request.request.idempotencyKey === oldAttempt?.attemptId
    || request.wireRequest.model !== "openai/gpt-6-luna"
    || request.wireRequest.reasoningEffort !== "max"
    || request.wireRequest.providerPolicy?.only?.join(",") !== "openai"
    || request.wireRequest.providerPolicy?.allow_fallbacks !== false
    || request.wireRequest.providerPolicy?.zdr !== undefined
    || request.wireRequest.providerPolicy?.data_collection !== "deny"
    || sha256Canonical(request.wireRequest.schema) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_SCHEMA_SHA256
    || maximumQuotedCallCostMicros(request.wireRequest) !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
    || request.wireRequest.schemaName !== "patternwork_ifs_pwrp71_candidate_1") {
    throw new Error("The resend request body, schema, privacy setting, model, reasoning, or budget no longer matches the exact approved C01 request.");
  }
  const oldPromptSha = oldAttempt?.request.promptSha256;
  const oldSystemSha = oldAttempt?.request.systemSha256;
  if (oldPromptSha !== sha256(Buffer.from(request.request.prompt, "utf8"))
    || oldSystemSha !== sha256(Buffer.from(request.request.system, "utf8"))) {
    throw new Error("The current production prompt differs from the failed C01 request; resending is blocked pending re-review.");
  }
  if (parent.reservedMicros + FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS > FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS) {
    throw new Error("The existing unknown reservations plus this one request exceed the approved aggregate authorization.");
  }
  const sourcePins = {
    questionSourceSha256: fixture.questionSource.manifest.source_binding.source_sha256,
    questionSourceManifestSha256: fixture.questionSource.sourceManifestSha256,
    routerRuntimeSha256,
    reportSourceManifestSha256: fixture.reportSource.manifestSha256,
    semanticCaseSetSha256,
    fixtureManifestSha256: fixture.fixtureManifestSha256,
    fixtureSetSha256: String(parentPins?.fixtureSetSha256 ?? ""),
    fixtureArtifactSha256: fixture.fixtureArtifactSha256,
    packetSha256: fixture.packetSha256,
    evidenceSha256: String((fixture.packet as Record<string, unknown>).content_sha256 ?? ""),
    requestFingerprint: request.requestFingerprint,
    wirePayloadSha256: request.wirePayloadSha256,
    wireSchemaSha256: sha256Canonical(request.wireRequest.schema),
  };
  return {
    workspaceRoot, parentRunSha256: parent.runSha256, parentAttempts: attemptsFile.attempts,
    parentDispatches: dispatches, parentRunBytes: runBytes, parentAttemptsBytes: attemptsBytes,
    parentDispatchesBytes: dispatchesBytes, parentReservedMicros: parent.reservedMicros, route, pricing, pricingSha256,
    fixture, request: request.request, wireRequest: request.wireRequest,
    requestFingerprint: request.requestFingerprint, wirePayloadSha256: request.wirePayloadSha256,
    sourcePins,
  };
}

export async function runFictionalIfsErrorDetailResend(
  invocation: FictionalIfsErrorDetailResendInvocation,
  dependencies: {
    readonly workspaceRoot: string;
    /** Test-only output redirection; the CLI never accepts a caller-supplied output path. */
    readonly outputDirectory?: string;
    readonly now?: () => Date;
    readonly routeCheck?: () => Promise<OpenRouterDiagnosticRouteEvidence>;
    readonly beforeDispatch?: (input: { readonly requestFingerprint: string; readonly wirePayloadSha256: string }) => Promise<void>;
  },
): Promise<Record<string, unknown>> {
  if (!invocation || invocation.operatorAuthorized !== true || invocation.allowNonZdr !== true
    || invocation.maxCallCostMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS
    || invocation.aggregateCostCapMicros !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS) {
    throw new Error("This CLI accepts one explicitly authorized C01 IFS non-ZDR resend with both exact approved spend limits.");
  }
  const workspaceRoot = path.resolve(dependencies.workspaceRoot);
  const now = dependencies.now ?? (() => new Date());
  const outputDirectory = path.resolve(dependencies.outputDirectory ?? path.join(workspaceRoot, FICTIONAL_IFS_ERROR_DETAIL_RESEND_OUTPUT_RELATIVE));
  try { await stat(outputDirectory); throw new Error("This one-use resend run ID already exists; it will not be reused or dispatched again."); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  const route = dependencies.routeCheck
    ? await dependencies.routeCheck()
    : await (async () => {
      await assertOpenRouterReachable(globalThis.fetch);
      return assertOpenRouterNonZdrDiagnosticRouteEligible(globalThis.fetch, now);
    })();
  const prepared = await prepareResend({ workspaceRoot, now: now(), route });
  loadEnvConfig(workspaceRoot);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is unavailable after local environment loading; no provider request was dispatched.");
  await dependencies.beforeDispatch?.({ requestFingerprint: prepared.requestFingerprint, wirePayloadSha256: prepared.wirePayloadSha256 });

  await mkdir(outputDirectory, { recursive: false });
  const historyDirectory = path.join(outputDirectory, "history");
  await mkdir(historyDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(historyDirectory, "parent-run.json"), prepared.parentRunBytes),
    writeFile(path.join(historyDirectory, "parent-attempts.json"), prepared.parentAttemptsBytes),
    writeFile(path.join(historyDirectory, "parent-dispatches.json"), prepared.parentDispatchesBytes),
    writeFile(path.join(outputDirectory, "attempts.json"), prepared.parentAttemptsBytes),
    writeFile(path.join(outputDirectory, "dispatches.json"), prepared.parentDispatchesBytes),
  ]);
  const attemptsStore = new FileQualificationAttemptStore(outputDirectory);
  const preflight = {
    schemaVersion: "PWRP71-C01-IFS-ERROR-DETAIL-RESEND-PREFLIGHT-1",
    checkedAt: now().toISOString(),
    resultKind: "fictional_report_diagnostic_preflight",
    authorization: {
      operatorFlag: ERROR_DETAIL_RESEND_OPERATOR_FLAG,
      nonZdrFlag: ALLOW_NON_ZDR_OPERATOR_FLAG,
      profileId: "C01", reportType: "IFS", fixtureSet: "route-replays-v5",
      model: "openai/gpt-6-luna", reasoningEffort: "max",
      maxCallCostMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS,
      aggregateCostCapMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS,
      approvalFileIsNotCryptographicCredential: true,
    },
    parentRunId: PARENT_RUN_ID,
    parentRunSha256: prepared.parentRunSha256,
    sourcePins: prepared.sourcePins,
    request: {
      endpoint: OPENROUTER_DEFAULT_ENDPOINT,
      idempotencyKey: prepared.request.idempotencyKey,
      requestVariant: OPENAI_ERROR_DETAIL_RESEND_MARKER,
      bodySha256: prepared.wirePayloadSha256,
      responseSchemaSha256: prepared.sourcePins.wireSchemaSha256,
      requestFingerprint: prepared.requestFingerprint,
      exactPriorNonZdrWireBodyReused: prepared.wirePayloadSha256 === FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256,
      model: prepared.request.model,
      reasoningEffort: prepared.request.reasoningEffort,
      providerPolicy: GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY,
    },
    pricing: {
      evidenceFile: NON_ZDR_PRICING_RELATIVE,
      evidenceSha256: prepared.pricingSha256,
      checkedOn: prepared.pricing.checkedOn,
      inputUsdPerMillionTokens: prepared.pricing.inputUsdPerMillionTokens,
      outputUsdPerMillionTokens: prepared.pricing.completionUsdPerMillionTokens,
      officialSources: prepared.pricing.sources,
      quoteIsProviderDependent: true,
      invoiceMaximumGuaranteed: false,
    },
    route,
    budgetBeforeDispatch: {
      priorUnknownReservedMicros: prepared.parentReservedMicros,
      thisCallReservedMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS,
      totalIfUnknownMicros: prepared.parentReservedMicros + FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS,
      remainingIfUnknownMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS - prepared.parentReservedMicros - FICTIONAL_IFS_ERROR_DETAIL_RESEND_MAX_CALL_MICROS,
    },
    priorDispatchCount: prepared.parentDispatches.entries.length,
    dispatchPerformed: false,
    providerCalls: 0,
  };
  await writeJsonAtomic(path.join(outputDirectory, "preflight.json"), preflight);
  const runManifest: Record<string, unknown> = {
    schemaVersion: "PWRP71-C01-IFS-ERROR-DETAIL-RESEND-1",
    resultKind: "fictional_report_diagnostic_resend",
    purpose: "capture_provider_schema_rejection_detail_for_one_c01_ifs_generation_request",
    status: "prepared",
    routingQualification: "not_claimed",
    productionActivationEffect: "none",
    runId: FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
    createdAt: now().toISOString(),
    parentRunSha256: prepared.parentRunSha256,
    scope: { profileId: "C01", reportType: "IFS", fixtureSet: "route-replays-v5", model: "openai/gpt-6-luna", reasoningEffort: "max", providerRestriction: "openai_only_no_fallbacks", privacyMode: "non_zdr_allowed" },
    authorization: preflight.authorization,
    preflightSha256: sha256Canonical(preflight),
    sourcePins: prepared.sourcePins,
    pricingSha256: prepared.pricingSha256,
    attemptId: prepared.request.idempotencyKey,
    dispatchCountForThisRun: 0,
    providerDispatchCountIncludingParent: prepared.parentDispatches.entries.length,
    cost: { reportedMicros: 0, reservedUnknownMicros: prepared.parentReservedMicros, remainingAuthorizedMicros: FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS - prepared.parentReservedMicros },
    automatedPwrpDraftValidation: "not_run_until_provider_response",
    automatedReviewer: "not_run_one_request_only",
    semanticReview: "pending",
  };
  await writeJsonAtomic(path.join(outputDirectory, "run.json"), withDigest(runManifest));

  const dispatchFile = path.join(outputDirectory, "dispatches.json");
  const recordResponse = async (index: number, status: number, requestId?: string): Promise<void> => {
    const dispatches = await readJson<DispatchFile>(dispatchFile);
    const updated: DispatchFile = { schemaVersion: 1, entries: dispatches.entries.map((entry) => entry.index === index ? { ...entry, outcome: "response_received", responseStatus: status, ...(requestId ? { responseRequestId: requestId } : {}) } : entry) };
    await writeJsonAtomic(dispatchFile, updated);
  };
  const recordNoResponse = async (index: number): Promise<void> => {
    const dispatches = await readJson<DispatchFile>(dispatchFile);
    await writeJsonAtomic(dispatchFile, { schemaVersion: 1, entries: dispatches.entries.map((entry) => entry.index === index ? { ...entry, outcome: "no_http_response" } : entry) } satisfies DispatchFile);
  };
  const fetchForClient = createDiagnosticFetch({
    dispatchFile,
    store: attemptsStore,
    hooks: { recordResponse, recordNoResponse },
    now,
  });
  const provider = new OpenRouterClient({ apiKey, fetch: fetchForClient, captureProviderErrorDetail: true });
  const journaled = new JournaledPwrp71Transport({
    store: attemptsStore,
    transport: provider,
    endpoint: OPENROUTER_DEFAULT_ENDPOINT,
    providerPolicy: GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY,
    maxCallCostMicros: invocation.maxCallCostMicros,
    aggregateCostCapMicros: invocation.aggregateCostCapMicros,
    usageStatus: "reported",
    now,
  });
  runManifest.status = "dispatching";
  runManifest.dispatchCountForThisRun = 0;
  await writeJsonAtomic(path.join(outputDirectory, "run.json"), withDigest(runManifest));
  let providerResult: OpenRouterGenerationResult | undefined;
  let providerError: unknown;
  try { providerResult = await journaled.generate(prepared.request); }
  catch (error) { providerError = error; }

  const finalAttempts = await attemptsStore.list();
  const finalAttempt = finalAttempts.find((attempt) => attempt.attemptId === prepared.request.idempotencyKey);
  const finalDispatches = await readJson<DispatchFile>(dispatchFile);
  const thisRunDispatches = finalDispatches.entries.filter((entry) => entry.idempotencyKey === prepared.request.idempotencyKey);
  const reportedMicros = finalAttempts.reduce((sum, attempt) => sum + (attempt.status === "completed" ? (attempt.usage?.costMicros ?? 0) : 0), 0);
  const reservedUnknownMicros = finalAttempts.reduce((sum, attempt) => sum + (attempt.status === "completed" ? 0 : (attempt.reservedCostMicros ?? 0)), 0);
  providerResult ??= finalAttempt?.providerResult;
  let validation: Record<string, unknown> | undefined;
  if (providerResult?.ok) {
    const checked = validatePwrp71ReportDraft({
      value: providerResult.output,
      reportType: "IFS",
      snapshotId: String((prepared.fixture.packet as Record<string, unknown>).snapshot_id),
      packet: prepared.fixture.packet,
      source: prepared.fixture.reportSource,
    });
    validation = { ok: checked.ok, issues: checked.issues };
    if (checked.ok) {
      const artifactFile = path.join(outputDirectory, "C01-IFS-draft-artifact.json");
      const markdownFile = path.join(outputDirectory, "C01-IFS-draft.md");
      await writeJsonAtomic(artifactFile, checked.value);
      await writeJsonAtomic(path.join(outputDirectory, "C01-IFS-provider-output.json"), providerResult.output);
      await writeJsonAtomic(markdownFile, checked.value.report_markdown);
      runManifest.artifactFile = path.basename(artifactFile);
      runManifest.markdownFile = path.basename(markdownFile);
    } else {
      await writeJsonAtomic(path.join(outputDirectory, "C01-IFS-provider-output.json"), providerResult.output);
    }
  }
  if (providerResult && !providerResult.ok) {
    runManifest.providerResponse = { kind: providerResult.kind, message: providerResult.message, finishReason: providerResult.finishReason, usage: providerResult.usage };
  }
  if (providerResult?.ok) {
    runManifest.providerResponse = { ok: true, usage: providerResult.usage, finishReason: providerResult.finishReason };
  }
  if (providerError instanceof Error) runManifest.providerFailureMessage = providerError.message;
  runManifest.status = providerError
    ? thisRunDispatches[0]?.outcome === "no_http_response" ? "no_http_response" : "provider_rejected"
    : providerResult?.ok ? (validation?.ok === true ? "draft_validated" : "draft_validation_failed") : "provider_response_invalid";
  runManifest.providerDiagnostic = finalAttempt?.diagnostic;
  runManifest.providerResponseReceived = thisRunDispatches[0]?.outcome === "response_received";
  runManifest.responseStatus = thisRunDispatches[0]?.responseStatus;
  if (thisRunDispatches[0]?.responseRequestId) runManifest.providerRequestId = thisRunDispatches[0].responseRequestId;
  runManifest.providerDispatchCountIncludingParent = finalDispatches.entries.length;
  runManifest.dispatchCountForThisRun = thisRunDispatches.length;
  runManifest.providerDispatchesSha256 = sha256Canonical(finalDispatches);
  runManifest.cost = {
    reportedMicros,
    reservedUnknownMicros,
    remainingAuthorizedMicros: Math.max(0, FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS - reportedMicros - reservedUnknownMicros),
    invoiceStatusForUnknownAttempts: reservedUnknownMicros > 0 ? "unknown" : "reported_for_completed_attempts_only",
  };
  runManifest.attemptLedgerSha256 = sha256Canonical({ schemaVersion: 1, attempts: finalAttempts });
  runManifest.semanticReview = "pending_independent_review";
  runManifest.automatedPwrpDraftValidation = validation ?? "provider_rejected_before_draft_validation";
  runManifest.automatedReviewer = "not_run_one_request_only";
  runManifest.updatedAt = now().toISOString();
  await writeJsonAtomic(path.join(outputDirectory, "run.json"), withDigest(runManifest));
  if (thisRunDispatches.length !== 1) throw new Error(`One-shot resend invariant failed: expected one dispatch, recorded ${thisRunDispatches.length}.`);
  return runManifest;
}

function withDigest(value: Record<string, unknown>): Record<string, unknown> {
  const normalized = omitUndefined(value) as Record<string, unknown>;
  const withoutDigest = Object.fromEntries(Object.entries(normalized).filter(([key]) => key !== "runSha256"));
  return { ...withoutDigest, runSha256: sha256Canonical(withoutDigest) };
}

function omitUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitUndefined);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([, child]) => child !== undefined).map(([key, child]) => [key, omitUndefined(child)]));
}

/** Completes a receipt from the durable ledgers after a process-level receipt-write failure; never dispatches. */
export async function finalizeFictionalIfsErrorDetailResendReceipt(input: {
  readonly workspaceRoot: string;
  readonly now?: () => Date;
}): Promise<Record<string, unknown>> {
  const outputDirectory = path.join(path.resolve(input.workspaceRoot), FICTIONAL_IFS_ERROR_DETAIL_RESEND_OUTPUT_RELATIVE);
  const runFile = path.join(outputDirectory, "run.json");
  const run = await readJson<Record<string, unknown>>(runFile);
  if (run.schemaVersion !== "PWRP71-C01-IFS-ERROR-DETAIL-RESEND-1"
    || run.resultKind !== "fictional_report_diagnostic_resend"
    || run.runId !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID
    || run.status !== "dispatching"
    || run.routingQualification !== "not_claimed"
    || run.productionActivationEffect !== "none") {
    throw new Error("Receipt recovery requires the exact interrupted one-shot C01 resend manifest; no provider request will be made.");
  }
  const existingDigest = run.runSha256;
  const withoutDigest = Object.fromEntries(Object.entries(run).filter(([key]) => key !== "runSha256"));
  if (typeof existingDigest !== "string" || sha256Canonical(withoutDigest) !== existingDigest) throw new Error("The interrupted resend manifest failed its integrity check.");
  const attemptFile = await readJson<{ readonly schemaVersion: number; readonly attempts: readonly QualificationAttemptRecord[] }>(path.join(outputDirectory, "attempts.json"));
  const dispatches = await readJson<DispatchFile>(path.join(outputDirectory, "dispatches.json"));
  const parentBackup = await readJson<ParentRun>(path.join(outputDirectory, "history", "parent-run.json"));
  const parentAttempts = await readJson<{ readonly schemaVersion: number; readonly attempts: readonly QualificationAttemptRecord[] }>(path.join(outputDirectory, "history", "parent-attempts.json"));
  const parentDispatches = await readJson<DispatchFile>(path.join(outputDirectory, "history", "parent-dispatches.json"));
  if (parentBackup.runSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_PARENT_SHA256
    || run.parentRunSha256 !== parentBackup.runSha256
    || parentAttempts.schemaVersion !== 1 || parentAttempts.attempts.length !== 2
    || parentDispatches.entries.length !== 2 || attemptFile.schemaVersion !== 1
    || attemptFile.attempts.length !== 3 || dispatches.schemaVersion !== 1 || dispatches.entries.length !== 3) {
    throw new Error("The one-shot resend ledgers do not contain the exact immutable parent plus one attempt.");
  }
  const attempt = attemptFile.attempts[2];
  const dispatch = dispatches.entries[2];
  const expectedAttemptId = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:openai-gpt-6-luna-max:attempt-1`;
  if (!attempt || !dispatch || attempt.attemptId !== expectedAttemptId || dispatch.idempotencyKey !== expectedAttemptId
    || attempt.status !== "unknown" || attempt.usageStatus !== "unknown"
    || attempt.request.requestedModel !== "openai/gpt-6-luna"
    || attempt.request.requestedReasoningEffort !== "max"
    || attempt.wirePayloadSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256
    || dispatch.profileId !== "C01" || dispatch.phase !== "initial"
    || dispatch.requestVariant !== OPENAI_ERROR_DETAIL_RESEND_MARKER
    || dispatch.wirePayloadSha256 !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_WIRE_SHA256
    || dispatch.outcome !== "response_received" || dispatch.responseStatus !== 400
    || attempt.diagnostic?.providerName !== "OpenAI"
    || attempt.diagnostic?.providerUpstreamCode !== "invalid_json_schema"
    || !attempt.diagnostic.providerErrorRaw) {
    throw new Error("Receipt recovery did not find the exact C01 OpenAI HTTP 400 schema rejection; no provider retry is allowed.");
  }
  const reportedMicros = attemptFile.attempts.reduce((sum, item) => sum + (item.status === "completed" ? (item.usage?.costMicros ?? 0) : 0), 0);
  const reservedUnknownMicros = attemptFile.attempts.reduce((sum, item) => sum + (item.status === "completed" ? 0 : (item.reservedCostMicros ?? 0)), 0);
  run.status = "provider_rejected";
  run.providerResponseReceived = true;
  run.responseStatus = dispatch.responseStatus;
  if (dispatch.responseRequestId) run.providerRequestId = dispatch.responseRequestId;
  run.providerDiagnostic = attempt.diagnostic;
  run.providerErrorDetail = attempt.diagnostic.providerErrorRaw;
  run.providerDispatchCountIncludingParent = dispatches.entries.length;
  run.dispatchCountForThisRun = 1;
  run.providerDispatchesSha256 = sha256Canonical(dispatches);
  run.attemptLedgerSha256 = sha256Canonical(attemptFile);
  run.cost = {
    reportedMicros,
    reservedUnknownMicros,
    remainingAuthorizedMicros: Math.max(0, FICTIONAL_IFS_ERROR_DETAIL_RESEND_AGGREGATE_CAP_MICROS - reportedMicros - reservedUnknownMicros),
    invoiceStatusForUnknownAttempts: "unknown",
  };
  run.providerFailureMessage = attempt.diagnostic.message;
  run.semanticReview = "pending_independent_review";
  run.automatedPwrpDraftValidation = "provider_rejected_before_draft_validation";
  run.automatedReviewer = "not_run_one_request_only";
  run.updatedAt = (input.now ?? (() => new Date()))().toISOString();
  const finalized = withDigest(run);
  await writeJsonAtomic(runFile, finalized);
  return finalized;
}

async function main(): Promise<void> {
  if (process.argv.slice(2).join(" ") === "--finalize-only") {
    const run = await finalizeFictionalIfsErrorDetailResendReceipt({ workspaceRoot: process.cwd() });
    process.stdout.write(`${JSON.stringify({
      status: run.status,
      runId: run.runId,
      dispatchCountForThisRun: run.dispatchCountForThisRun,
      providerResponseReceived: run.providerResponseReceived,
      responseStatus: run.responseStatus,
      providerDiagnostic: run.providerDiagnostic,
      cost: run.cost,
      outputDirectory: path.join(process.cwd(), FICTIONAL_IFS_ERROR_DETAIL_RESEND_OUTPUT_RELATIVE),
    }, null, 2)}\n`);
    return;
  }
  const invocation = parseFictionalIfsErrorDetailResendArgs(process.argv.slice(2));
  const run = await runFictionalIfsErrorDetailResend(invocation, { workspaceRoot: process.cwd() });
  process.stdout.write(`${JSON.stringify({
    status: run.status,
    runId: run.runId,
    dispatchCountForThisRun: run.dispatchCountForThisRun,
    providerResponseReceived: run.providerResponseReceived,
    responseStatus: run.responseStatus,
    providerDiagnostic: run.providerDiagnostic,
    cost: run.cost,
    outputDirectory: path.join(process.cwd(), FICTIONAL_IFS_ERROR_DETAIL_RESEND_OUTPUT_RELATIVE),
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
