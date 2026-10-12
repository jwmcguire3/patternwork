import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { sha256Canonical, normalizeLf } from "../../lib/report-contracts/delivery-validator.ts";
import type { JsonObject, ValidationIssue } from "../../lib/question-engine/types.ts";
import { PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256 } from "../../lib/question-engine/pwqe51-source.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import {
  GPT6_LUNA_BILLING_BASIS_SHA256,
  GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY,
  GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY,
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
export const FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID = "gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2" as const;
export const FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID = "gate11-c01-c02-ifs-schema-correction-20261012" as const;
export const FICTIONAL_IFS_128K_OUTPUT_RUN_ID = "gate11-c01-c02-ifs-128k-output-20261012" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL = "openai-gpt-6-luna-max" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/live" as const;
export const FICTIONAL_IFS_128K_OUTPUT_LIMIT = 128_000 as const;
export const FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS = 200_000 as const;

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
  nonZdrPricingCheckSha256: "fd34d59b4bdf49f7dc1fa6b5b43af7953a45c6a50c457b09db4c00a92f0b4b57",
  schemaCorrectionPricingCheckSha256: "a22eef221ee00fe65183f5310e4690532ae1d83c6d1839c0f5da5d6cbd41116c",
  schemaCorrectionPreflightSha256: "70b7adc162141b7b09bbc323df14b7b08ad1d92d791b907e0124e921a20bcda2",
  outputLimit128kPricingCheckSha256: "363c45955b6fa821bb5d5b68fb16c295e3a69a4f5cce897017661b2a9b1becb4",
  outputLimit128kPreflightSha256: "c3e9315ffeef0d2027eed70b8970cc72553c45077f32dadbea9144d62dc6e501",
  c01PacketSha256: "c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036",
  c02PacketSha256: "c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055",
} as const;

const APPROVAL_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/approval-statements/c01-c02-live-ifs-approval.md";
const REVIEW_RELATIVE = "qualification/pwrp71/gate10-routing-budget-readiness/independent-review/c01-c02-current-scope-review.md";
const PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-11.json";
const NON_ZDR_PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-11-openai-non-zdr.json";
const PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-schema-correction-no-dispatch-20261012.json";
const CONTINUATION_PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-continuation-schema-correction-no-dispatch-20261012.json";
const FRESH_BUDGET_EPOCH_2_PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-fresh-budget-epoch-2-schema-correction-no-dispatch-20261012.json";
const NON_ZDR_CONTINUATION_PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-non-zdr-continuation-schema-correction-no-dispatch-20261012.json";
const SCHEMA_CORRECTION_PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-schema-correction-continuation-no-dispatch-20261012.json";
const SCHEMA_CORRECTION_PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-12-openai-non-zdr-c01-c02-schema-correction.json";
const DIAGNOSTIC_LOCK_NAME = ".diagnostic-run.lock";
const CONTINUATION_FLAG = "--continue-after-unknown-provider-attempt";
const FRESH_BUDGET_EPOCH_2_FLAG = "--owner-authorized-fresh-budget-epoch-2";
const NON_ZDR_CONTINUATION_FLAG = "--owner-authorized-allow-non-zdr-continuation";
const SCHEMA_CORRECTION_CONTINUATION_FLAG = "--owner-authorized-schema-correction-continuation";
const OUTPUT_LIMIT_128K_CONTINUATION_FLAG = "--owner-authorized-128k-output-continuation";
const FRESH_BUDGET_EPOCH_2_MARKER = "fresh-budget-epoch-2";
const OPENAI_NON_ZDR_CONTINUATION_MARKER = "openai-non-zdr-continuation-1";
export const OPENAI_ERROR_DETAIL_RESEND_MARKER = "openai-error-detail-resend-1" as const;
export const OPENAI_SCHEMA_CORRECTION_MARKER = "openai-schema-correction-continuation-1" as const;
export const OPENAI_128K_OUTPUT_MARKER = "openai-128k-output-continuation-1" as const;
export const FICTIONAL_IFS_128K_PARENT_SHA256 = "cdaf7c96acbbb4e0c378d1417a37e0515e964fc5aa6d37ef4fa1b6319b40060f" as const;
const OUTPUT_LIMIT_128K_PARENT_ATTEMPTS_RAW_SHA256 = "84391ad5f477f367c9066bf788f43e150a404095f9f38eba418c1b59b06f3fdf" as const;
const OUTPUT_LIMIT_128K_PARENT_DISPATCHES_RAW_SHA256 = "dcda92dcdf3cff6752fc1eedc241795ab1e4d18b39bafb2d31f55ce670cf5fe7" as const;
const OUTPUT_LIMIT_128K_PRICING_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/pricing-check-2026-10-12-openai-non-zdr-c01-c02-128k-output.json";
const OUTPUT_LIMIT_128K_PREFLIGHT_RELATIVE = "qualification/pwrp71/gate11-fictional-ifs-diagnostic/provider-preflight/c01-c02-ifs-openai-only-non-zdr-128k-output-no-dispatch-20261012.json";
export const FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256 = "ea14e8ce48894bc13509f0cbf47843bd4151e2626a62d4893be0b266a5858288" as const;
const SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256 = "9581a49c928dbad61ae612e7e9634cb5113110dc5cb22eac845030f197e26f62";
const SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256 = "428d1ad1717d5eb5898ee227d17c1b4d42cab34678fba73756f32091f500a372";
const SCHEMA_CORRECTION_PARENT_PREFLIGHT_SHA256 = "ddd63d80b561b4fa294f7d677c00d199eb71f906a56e28da2c2be95c793c7a2e";
const SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS = 345_000;
const SCHEMA_CORRECTION_PREVIOUS_WIRE_SCHEMA_SHA256 = "8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451";
const LEGACY_DEFAULT_ROUTE_RUN_SHA256 = "63b73b54845e4a719603b77abddd403f7297c6d157be4a8ffbf5f1d29b2e73be";
const LEGACY_DEFAULT_ROUTE_RUN_FINGERPRINT = "e6223344cc26baa9dea4480b31b0e8c7f1c2296f3313aed0b61c0260a901bd83";
const LEGACY_C01_ATTEMPT_ID = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`;
const OPENAI_ROUTE_CONTINUATION_MARKER = "openai-route-continuation-1";
export const FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID = "gate11-c01-error-detail-resend-20261012" as const;
export const FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256 = "f64878238c24e42cc8a4ce149eab22002e92fbab0eb28dc52731d94eb255b314" as const;
const FRESH_EPOCH_2_ZDR_RUN_FINGERPRINT = "47f4481c127b1546745d3089207e8eda46f38f4ce530b2e2a76cf8616092b928";
const FRESH_EPOCH_2_C01_ATTEMPT_ID = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`;

type ProfileId = "C01" | "C02";
type DiagnosticPhase = "initial" | "repair" | "escalation" | "review" | "review_after_repair";

export interface FictionalIfsDiagnosticInvocation {
  readonly operatorAuthorized: true;
  readonly profiles: readonly ["C01", "C02"];
  readonly reportType: "IFS";
  readonly fixtureSet: "route-replays-v5";
  readonly model: "openai/gpt-6-luna";
  readonly reasoningEffort: "max";
  readonly maxCallCostMicros: number;
  readonly aggregateCostCapMicros: 3_000_000;
  /** Explicit operator signal for the reviewed OpenAI-only continuation of the prior Azure 400. */
  readonly continueAfterUnknownProviderAttempt?: boolean;
  /** One explicitly owner-directed fresh budget epoch; previous unknown attempts remain archived in their prior run. */
  readonly freshBudgetEpoch2?: boolean;
  /** Owner-authorized OpenAI-only non-ZDR continuation of the exact epoch-2 ZDR route rejection. */
  readonly allowNonZdrContinuation?: boolean;
  /** One new C01/C02 request pair after the pinned OpenAI schema rejection was corrected. */
  readonly schemaCorrectionContinuation?: boolean;
  /** New owner-authorized run using the published 128k output limit and $0.20 call reservation. */
  readonly outputLimit128kContinuation?: boolean;
}

export interface FictionalIfsDiagnosticContinuation {
  readonly ordinal: 1 | 2 | 3 | 4;
  readonly reason: "openai_only_provider_route_after_prior_azure_schema_rejection" | "owner_authorized_non_zdr_after_openai_zdr_route_rejection" | "owner_authorized_schema_correction_after_openai_schema_rejection" | "owner_authorized_128k_output_after_length_limited_c01";
  readonly operatorFlag: typeof CONTINUATION_FLAG | typeof NON_ZDR_CONTINUATION_FLAG | typeof SCHEMA_CORRECTION_CONTINUATION_FLAG | typeof OUTPUT_LIMIT_128K_CONTINUATION_FLAG;
  readonly operatorDirective: "run em" | "allow non zdr" | "run requests for c01 and c02" | "raise per call reservation to .2 and run";
  readonly priorRunSha256: string;
  readonly priorRunFingerprint: string | null;
  readonly priorRunArchiveFile: string;
  readonly priorAttemptsArchiveFile: string;
  readonly priorDispatchesArchiveFile: string;
  readonly priorPreflightArchiveFile?: string;
  readonly carriedUnknownAttemptIds: readonly string[];
  readonly carriedUnknownReservationMicros: number;
  readonly preDispatchStopRunArchives?: readonly string[];
  readonly startedAt: string;
}

export interface DiagnosticHttpDispatchRecord {
  readonly index: number;
  readonly idempotencyKey: string;
  readonly profileId: ProfileId;
  readonly phase: DiagnosticPhase;
  readonly requestVariant?: typeof OPENAI_ROUTE_CONTINUATION_MARKER | typeof FRESH_BUDGET_EPOCH_2_MARKER | typeof OPENAI_NON_ZDR_CONTINUATION_MARKER | typeof OPENAI_ERROR_DETAIL_RESEND_MARKER | typeof OPENAI_SCHEMA_CORRECTION_MARKER | typeof OPENAI_128K_OUTPUT_MARKER;
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
  readonly status: "prepared" | "running" | "diagnostic_complete" | "diagnostic_complete_with_prior_unknown_cost" | "diagnostic_stopped";
  readonly routingQualification: "not_claimed";
  readonly productionActivationEffect: "none";
  readonly runId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runFingerprint: string;
  readonly continuation?: FictionalIfsDiagnosticContinuation;
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
    readonly maxOutputTokens: number;
    readonly providerRestriction: "openai_only_no_fallbacks";
    readonly retentionPolicy: "zdr_required" | "non_zdr_allowed";
  };
  readonly authorization: {
    readonly operatorFlagProvided: true;
    readonly budgetEpoch: 1 | 2;
    readonly priorRunBudgetDisposition?: {
      readonly priorRunId: typeof FICTIONAL_IFS_DIAGNOSTIC_RUN_ID;
      readonly priorUnknownReservedMicros: 230_000;
      readonly excludedFromFreshEpochCap: true;
      readonly priorInvoiceStatusRemainsUnknown: true;
      readonly operatorDirective: "billing starts over";
    };
    readonly nonZdrContinuation?: {
      readonly operatorDirective: "allow non zdr";
      readonly priorEpoch2UnknownReservedMicros: 115_000;
      readonly priorInvoiceStatusRemainsUnknown: true;
      readonly promptRetentionAcknowledged: true;
    };
    readonly schemaCorrectionContinuation?: {
      readonly operatorDirective: "run requests for c01 and c02";
      readonly priorRunId: typeof FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID;
      readonly priorRunSha256: typeof FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256;
      readonly priorEpoch2UnknownReservedMicros: 345_000;
      readonly priorInvoiceStatusRemainsUnknown: true;
      readonly providerAcceptanceBeforeThisRun: "untested_after_schema_correction";
    };
    readonly outputLimit128kContinuation?: {
      readonly operatorDirective: "raise per call reservation to .2 and run";
      readonly priorRunId: typeof FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID;
      readonly priorRunSha256: string;
      readonly priorUnknownReservedMicros: 345_000;
      readonly priorReportedCostMicros: 12_138;
      readonly promptRetentionAcknowledged: true;
    };
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
    readonly providerAllowlist?: readonly string[];
    readonly providerFallbacks?: boolean;
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
  readonly privacyAcknowledgement?: {
    readonly ownerDirective?: string;
    readonly latestOwnerDirective?: string;
    readonly scope?: string;
    readonly providerMayRetainPrompts?: boolean;
    readonly accountWideSettingsMayStillRestrictTheRoute?: boolean;
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

function runIdFor(invocation: FictionalIfsDiagnosticInvocation): string {
  if (invocation.outputLimit128kContinuation) return FICTIONAL_IFS_128K_OUTPUT_RUN_ID;
  if (invocation.schemaCorrectionContinuation) return FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID;
  return invocation.freshBudgetEpoch2 || invocation.allowNonZdrContinuation
    ? FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID
    : FICTIONAL_IFS_DIAGNOSTIC_RUN_ID;
}

function validateInvocation(value: FictionalIfsDiagnosticInvocation): void {
  if (!value || value.operatorAuthorized !== true) throw new Error("An explicit --owner-authorized-fictional-diagnostic operator flag is required.");
  if (JSON.stringify(value.profiles) !== JSON.stringify(["C01", "C02"])) throw new Error("This CLI path accepts only the exact fictional C01,C02 cohort.");
  if (value.reportType !== "IFS" || value.fixtureSet !== "route-replays-v5") throw new Error("This CLI path accepts only IFS packets from route-replays-v5.");
  if (value.model !== "openai/gpt-6-luna" || value.reasoningEffort !== "max") throw new Error("The requested model and reasoning effort differ from the owner-approved pins.");
  const authorizedCallCap = value.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS : FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros;
  if (value.maxCallCostMicros !== authorizedCallCap
    || value.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros) {
    throw new Error(value.outputLimit128kContinuation
      ? "The 128k continuation requires the explicit $0.20 per-call reservation and $3.00 aggregate authorization."
      : "Both explicit spend limits must exactly match the authorized $0.115 per-call and $3.00 aggregate ceilings.");
  }
  if (value.continueAfterUnknownProviderAttempt && value.freshBudgetEpoch2) {
    throw new Error("The legacy continuation and fresh budget epoch cannot be requested together.");
  }
  if (value.allowNonZdrContinuation && !value.freshBudgetEpoch2) {
    throw new Error("The non-ZDR continuation must remain within the explicitly started fresh budget epoch 2.");
  }
  if (value.allowNonZdrContinuation && value.continueAfterUnknownProviderAttempt) {
    throw new Error("The epoch-2 non-ZDR continuation cannot be combined with the legacy continuation.");
  }
  if (value.schemaCorrectionContinuation
    && (!value.freshBudgetEpoch2 || !value.allowNonZdrContinuation || value.continueAfterUnknownProviderAttempt)) {
    throw new Error("Schema-correction continuation requires the existing epoch-2 and non-ZDR owner directives and cannot combine with an earlier continuation.");
  }
  if (value.schemaCorrectionContinuation && value.freshBudgetEpoch2 !== true) {
    throw new Error("Schema-correction continuation cannot create a new budget epoch or reset prior reservations.");
  }
  if (value.outputLimit128kContinuation
    && (!value.freshBudgetEpoch2 || !value.allowNonZdrContinuation || value.continueAfterUnknownProviderAttempt || value.schemaCorrectionContinuation)) {
    throw new Error("The 128k continuation requires the already authorized epoch-2 non-ZDR scope and its own new run identity; prior continuation flags cannot be replayed.");
  }
  if (!value.outputLimit128kContinuation && value.maxCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros) {
    throw new Error("The $0.20 call reservation is restricted to the exact 128k output continuation.");
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
  let continueAfterUnknownProviderAttempt = false;
  let freshBudgetEpoch2 = false;
  let allowNonZdrContinuation = false;
  let schemaCorrectionContinuation = false;
  let outputLimit128kContinuation = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]!;
    if (name === "--owner-authorized-fictional-diagnostic") {
      if (operatorAuthorized) throw new Error(`${name} may be specified only once.`);
      operatorAuthorized = true;
      continue;
    }
    if (name === CONTINUATION_FLAG) {
      if (continueAfterUnknownProviderAttempt) throw new Error(`${name} may be specified only once.`);
      continueAfterUnknownProviderAttempt = true;
      continue;
    }
    if (name === FRESH_BUDGET_EPOCH_2_FLAG) {
      if (freshBudgetEpoch2) throw new Error(`${name} may be specified only once.`);
      freshBudgetEpoch2 = true;
      continue;
    }
    if (name === NON_ZDR_CONTINUATION_FLAG) {
      if (allowNonZdrContinuation) throw new Error(`${name} may be specified only once.`);
      allowNonZdrContinuation = true;
      continue;
    }
    if (name === SCHEMA_CORRECTION_CONTINUATION_FLAG) {
      if (schemaCorrectionContinuation) throw new Error(`${name} may be specified only once.`);
      schemaCorrectionContinuation = true;
      continue;
    }
    if (name === OUTPUT_LIMIT_128K_CONTINUATION_FLAG) {
      if (outputLimit128kContinuation) throw new Error(`${name} may be specified only once.`);
      outputLimit128kContinuation = true;
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
    maxCallCostMicros: Number(values.get("--max-call-cost-micros")),
    aggregateCostCapMicros: Number(values.get("--aggregate-cost-cap-micros")) as 3_000_000,
    continueAfterUnknownProviderAttempt,
    freshBudgetEpoch2,
    allowNonZdrContinuation,
    schemaCorrectionContinuation,
    outputLimit128kContinuation,
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

export function buildFictionalDiagnosticRequest(input: {
  readonly profileId: ProfileId;
  readonly prepared: Pwrp71PreparedRequest;
  readonly runId: string;
  readonly continuation: boolean;
  readonly allowNonZdrContinuation?: boolean;
  readonly errorDetailResend?: boolean;
  readonly schemaCorrectionContinuation?: boolean;
  readonly outputLimit128kContinuation?: boolean;
}): { readonly request: OpenRouterGenerationRequest; readonly wireRequest: OpenRouterGenerationRequest; readonly requestFingerprint: string; readonly wirePayloadSha256: string } {
  const modelPin = UNQUALIFIED_MOCK_MODEL_POLICY.IFS;
  if (modelPin.model !== "openai/gpt-6-luna" || modelPin.reasoningEffort !== "max"
    || modelPin.maxOutputTokens !== 20_000
    || QUALIFICATION_MODEL_ORDER_NOT_FIXED(modelPin)) {
    throw new Error("The IFS candidate policy no longer matches the approved OpenRouter model, reasoning, and output pins.");
  }
  if (input.errorDetailResend && (input.profileId !== "C01" || input.runId !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID)) {
    throw new Error("The error-detail resend request is fixed to the separately authorized C01-only follow-up run.");
  }
  if (input.outputLimit128kContinuation
    && (input.runId !== FICTIONAL_IFS_128K_OUTPUT_RUN_ID || !input.allowNonZdrContinuation || input.profileId !== "C01" && input.profileId !== "C02")) {
    throw new Error("The 128k output request is restricted to the unique C01/C02 OpenAI-only non-ZDR continuation run.");
  }
  if (input.schemaCorrectionContinuation
    && (input.runId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID || !input.allowNonZdrContinuation)) {
    throw new Error("The schema-correction request requires its unique run ID and the previously authorized OpenAI-only non-ZDR route.");
  }
  const requestVariant = input.errorDetailResend
    ? OPENAI_ERROR_DETAIL_RESEND_MARKER
    : input.outputLimit128kContinuation
      ? OPENAI_128K_OUTPUT_MARKER
    : input.schemaCorrectionContinuation
      ? OPENAI_SCHEMA_CORRECTION_MARKER
    : input.allowNonZdrContinuation
    ? OPENAI_NON_ZDR_CONTINUATION_MARKER
    : input.continuation && input.profileId === "C01" ? OPENAI_ROUTE_CONTINUATION_MARKER : undefined;
  const invocationKey = `pwrp71-fictional-diagnostic:${input.runId}:${input.profileId}${requestVariant ? `:${requestVariant}` : ""}`;
  const request: OpenRouterGenerationRequest = {
    model: modelPin.model,
    reasoningEffort: modelPin.reasoningEffort,
    system: input.prepared.system,
    prompt: buildGenerationPrompt("IFS", input.prepared.user_data),
    schemaName: "patternwork_ifs_pwrp71_candidate_1",
    schema: input.prepared.response_schema,
    maxOutputTokens: input.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : modelPin.maxOutputTokens,
    idempotencyKey: `${invocationKey}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    includeUsage: true,
  };
  const wireRequest: OpenRouterGenerationRequest = {
    ...request,
    schema: projectOpenRouterStrictSchemaObject(request.schema),
    providerPolicy: input.allowNonZdrContinuation || input.errorDetailResend || input.schemaCorrectionContinuation || input.outputLimit128kContinuation
      ? GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY
      : GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" },
    includeUsage: true,
  };
  const payload = buildOpenRouterWirePayload(wireRequest);
  const quotedCost = maximumQuotedCallCostMicros(wireRequest);
  const maxCallCostMicros = input.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS : FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros;
  if (quotedCost > maxCallCostMicros) throw new Error("The model price and token limits no longer fit the approved per-call reservation.");
  return {
    request,
    wireRequest,
    requestFingerprint: qualificationAttemptFingerprint({
      request,
      wireRequest,
      endpoint: OPENROUTER_DEFAULT_ENDPOINT,
      maxCallCostMicros,
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

function validatePricing(value: PricingEvidence, hash: string, now: Date, allowNonZdr = false, schemaCorrection = false, outputLimit128k = false): void {
  const expectedHash = outputLimit128k
    ? FICTIONAL_IFS_DIAGNOSTIC_PINS.outputLimit128kPricingCheckSha256
    : schemaCorrection
    ? FICTIONAL_IFS_DIAGNOSTIC_PINS.schemaCorrectionPricingCheckSha256
    : allowNonZdr
      ? FICTIONAL_IFS_DIAGNOSTIC_PINS.nonZdrPricingCheckSha256
    : FICTIONAL_IFS_DIAGNOSTIC_PINS.currentPricingCheckSha256;
  if (hash !== expectedHash
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
    || value.providerRouting.zeroDataRetention !== !allowNonZdr
    || value.providerRouting.maxPricePromptUsdPerMillionTokens !== 0.1
    || value.providerRouting.maxPriceCompletionUsdPerMillionTokens !== 0.5
    || value.limits.quoteIsProviderDependent !== true
    || value.limits.invoiceMaximumGuaranteed !== false
    || value.limits.reasoningEffort !== "max"
    || value.limits.pwrp71IfsMaxOutputTokens !== (outputLimit128k ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : 20_000)
    || value.limits.perCallReservationMicros !== (outputLimit128k ? FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS : FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros)
    || value.limits.aggregateAuthorizationMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros) {
    throw new Error("Current pricing or provider-policy evidence is missing, stale, changed, or outside the approved scope.");
  }
  if ((schemaCorrection || outputLimit128k) && (value.providerRouting.providerAllowlist?.length !== 1
    || value.providerRouting.providerAllowlist[0] !== "OpenAI"
    || value.providerRouting.providerFallbacks !== false
    || value.privacyAcknowledgement?.ownerDirective !== "allow non zdr"
    || value.privacyAcknowledgement.latestOwnerDirective !== (outputLimit128k ? "raise per call reservation to .2 and run" : "run requests for c01 and c02")
    || value.privacyAcknowledgement.scope !== (outputLimit128k ? "fictional C01/C02 IFS only; 128k output continuation" : "fictional C01/C02 IFS only; schema-corrected continuation")
    || value.privacyAcknowledgement.providerMayRetainPrompts !== true
    || value.privacyAcknowledgement.accountWideSettingsMayStillRestrictTheRoute !== true)) {
    throw new Error("The continuation pricing evidence does not retain the exact owner-authorized OpenAI-only, non-ZDR C01/C02 scope.");
  }
}

function validatePreflight(input: {
  readonly preflight: Record<string, unknown>;
  readonly profiles: readonly PreparedProfile[];
  readonly runtimeSha256: string;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource: Pwrp71SourcePackage;
  readonly semanticCaseSetSha256: string;
  readonly continuation: boolean;
  readonly freshBudgetEpoch2: boolean;
  readonly allowNonZdrContinuation: boolean;
  readonly schemaCorrectionContinuation: boolean;
  readonly outputLimit128kContinuation: boolean;
  readonly runId: string;
}): string {
  const preflight = input.preflight;
  if (preflight.schemaVersion !== "PWRP71-GATE10-OPENROUTER-NO-DISPATCH-PREFLIGHT-V1"
    || preflight.dispatchPerformed !== false || preflight.providerCalls !== 0 || preflight.apiKeyRead !== false
    || preflight.runId !== input.runId || preflight.fixtureSet !== "route-replays-v5") {
    throw new Error("The regenerated no-dispatch preflight is missing or has an unexpected scope/status.");
  }
  const candidate = preflight.candidate;
  const sourcePins = preflight.sourceManifestPins;
  const exactRequests = preflight.exactRequests;
  if (!isRecord(candidate) || candidate.model !== "openai/gpt-6-luna" || candidate.reasoningEffort !== "max" || candidate.reportType !== "IFS"
    || candidate.providerSelection !== "openai_only_no_fallbacks"
    || (candidate.requestVariant ?? "initial") !== (input.outputLimit128kContinuation
        ? OPENAI_128K_OUTPUT_MARKER
        : input.allowNonZdrContinuation
        ? input.schemaCorrectionContinuation ? OPENAI_SCHEMA_CORRECTION_MARKER : OPENAI_NON_ZDR_CONTINUATION_MARKER
        : input.continuation
        ? OPENAI_ROUTE_CONTINUATION_MARKER
        : input.freshBudgetEpoch2 ? FRESH_BUDGET_EPOCH_2_MARKER : "initial")
    || !isRecord(sourcePins)
    || sourcePins.currentRouterRuntimeSha256 !== input.runtimeSha256
    || sourcePins.questionSourceSha256 !== input.questionSource.manifest.source_binding.source_sha256
    || sourcePins.questionSourceManifestSha256 !== input.questionSource.sourceManifestSha256
    || sourcePins.reportSourceManifestSha256 !== input.reportSource.manifestSha256
    || sourcePins.semanticCaseSetSha256 !== input.semanticCaseSetSha256
    || !Array.isArray(exactRequests) || exactRequests.length !== 2) {
    throw new Error("The regenerated no-dispatch preflight does not bind the exact current sources and C01/C02 scope.");
  }
  if (input.schemaCorrectionContinuation) {
    const correction = preflight.schemaCorrectionContinuation;
    if (!isRecord(correction)
      || correction.parentRunId !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID
      || correction.parentRunSha256 !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256
      || correction.priorAttemptLedgerSha256 !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
      || correction.priorDispatchLedgerSha256 !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256
      || correction.priorUnknownReservedMicros !== SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
      || correction.remainingBeforeThisRunMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
      || correction.operatorDirective !== "run requests for c01 and c02"
      || correction.dispatchPerformed !== false || correction.providerCalls !== 0 || correction.apiKeyRead !== false) {
      throw new Error("The schema-correction preflight does not carry the exact stopped parent, unknown reservations, current C01/C02 instruction, and no-dispatch boundary.");
    }
    const budget = preflight.budgetEpochAuthorization;
    const privacy = preflight.ownerAuthorizedPrivacyContinuation;
    const schemaCorrection = preflight.schemaCorrection;
    if (!isRecord(budget)
      || budget.continuationParentRunId !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID
      || budget.continuationParentRunSha256 !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256
      || budget.priorAttemptLedgerSha256 !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
      || budget.priorDispatchLedgerSha256 !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256
      || budget.totalUnknownReservedMicros !== SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
      || budget.remainingAuthorizationMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
      || !Array.isArray(budget.retainedUnknownAttempts) || budget.retainedUnknownAttempts.length !== 3
      || !isRecord(privacy) || privacy.reportScope !== "fictional C01/C02 IFS only; corrected-schema continuation"
      || privacy.latestOwnerDirective !== "run requests for c01 and c02"
      || !isRecord(schemaCorrection) || schemaCorrection.sourceSchemasChanged !== false
      || schemaCorrection.reportPromptsChanged !== false || schemaCorrection.fixtureEvidenceChanged !== false
      || schemaCorrection.providerAcceptance !== "untested" || schemaCorrection.dispatchPerformed !== false
      || schemaCorrection.providerCalls !== 0 || schemaCorrection.apiKeyRead !== false) {
      throw new Error("The schema-correction preflight does not retain the exact budget journal and limited owner scope.");
    }
  }
  if (input.outputLimit128kContinuation) {
    const continuation = preflight.outputLimit128kContinuation;
    const budget = preflight.budgetEpochAuthorization;
    const priorUnknownIds = [
      `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
      `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
      `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    ];
    if (!isRecord(continuation)
      || continuation.parentRunId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID
      || continuation.parentRunSha256 !== FICTIONAL_IFS_128K_PARENT_SHA256
      || continuation.priorAttemptsRawSha256 !== OUTPUT_LIMIT_128K_PARENT_ATTEMPTS_RAW_SHA256
      || continuation.priorDispatchesRawSha256 !== OUTPUT_LIMIT_128K_PARENT_DISPATCHES_RAW_SHA256
      || continuation.maxOutputTokens !== FICTIONAL_IFS_128K_OUTPUT_LIMIT
      || continuation.maxCallCostMicros !== FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS
      || continuation.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
      || continuation.priorUnknownReservedMicros !== 345_000
      || continuation.priorReportedCostMicros !== 12_138
      || continuation.operatorDirective !== "raise per call reservation to .2 and run"
      || continuation.dispatchPerformed !== false || continuation.providerCalls !== 0 || continuation.apiKeyRead !== false
      || !isRecord(budget)
      || budget.continuationParentRunId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID
      || budget.continuationParentRunSha256 !== FICTIONAL_IFS_128K_PARENT_SHA256
      || budget.totalUnknownReservedMicros !== 345_000
      || budget.reportedCostMicros !== 12_138
      || budget.remainingAuthorizationMicros !== 2_642_862
      || !Array.isArray(budget.carriedUnknownAttemptIds)
      || budget.carriedUnknownAttemptIds.join("\n") !== priorUnknownIds.join("\n")) {
      throw new Error("The 128k preflight does not preserve the exact stopped parent, budget history, owner directive, and no-dispatch boundary.");
    }
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
  readonly runId: string;
  readonly runDirectory: string;
  readonly runFingerprint: string;
  readonly preparedProfiles: readonly PreparedProfile[];
  readonly sourcePins: FictionalIfsDiagnosticRun["sourcePins"];
  readonly authorization: FictionalIfsDiagnosticRun["authorization"];
  readonly pricing: FictionalIfsDiagnosticRun["pricing"];
  readonly outputLimit128kContinuation: boolean;
}

async function prepareDiagnostic(
  invocation: FictionalIfsDiagnosticInvocation,
  dependencies: FictionalIfsDiagnosticDependencies,
): Promise<PreparedDiagnostic> {
  validateInvocation(invocation);
  const workspaceRoot = path.resolve(dependencies.workspaceRoot);
  const now = dependencies.now?.() ?? new Date();
  const runId = runIdFor(invocation);
  const pricingRelative = invocation.outputLimit128kContinuation
    ? OUTPUT_LIMIT_128K_PRICING_RELATIVE
    : invocation.schemaCorrectionContinuation
    ? SCHEMA_CORRECTION_PRICING_RELATIVE
    : invocation.allowNonZdrContinuation ? NON_ZDR_PRICING_RELATIVE : PRICING_RELATIVE;
  const preflightRelative = invocation.outputLimit128kContinuation
    ? OUTPUT_LIMIT_128K_PREFLIGHT_RELATIVE
    : invocation.schemaCorrectionContinuation
    ? SCHEMA_CORRECTION_PREFLIGHT_RELATIVE
    : invocation.continueAfterUnknownProviderAttempt
    ? CONTINUATION_PREFLIGHT_RELATIVE
    : invocation.allowNonZdrContinuation ? NON_ZDR_CONTINUATION_PREFLIGHT_RELATIVE
      : invocation.freshBudgetEpoch2 ? FRESH_BUDGET_EPOCH_2_PREFLIGHT_RELATIVE : PREFLIGHT_RELATIVE;
  const [approvalBytes, reviewBytes, pricingBytes, preflightBytes, semanticBytes] = await Promise.all([
    readBytes(workspaceRoot, APPROVAL_RELATIVE),
    readBytes(workspaceRoot, REVIEW_RELATIVE),
    readBytes(workspaceRoot, pricingRelative),
    readBytes(workspaceRoot, preflightRelative),
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
  validatePricing(pricing, pricingSha256, now, invocation.allowNonZdrContinuation === true, invocation.schemaCorrectionContinuation === true, invocation.outputLimit128kContinuation === true);

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
    const request = buildFictionalDiagnosticRequest({
      profileId: fixture.profileId,
      prepared: prepared.value,
      runId,
      continuation: invocation.continueAfterUnknownProviderAttempt === true,
      allowNonZdrContinuation: invocation.allowNonZdrContinuation === true,
      schemaCorrectionContinuation: invocation.schemaCorrectionContinuation === true,
      outputLimit128kContinuation: invocation.outputLimit128kContinuation === true,
    });
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
    continuation: invocation.continueAfterUnknownProviderAttempt === true,
    freshBudgetEpoch2: invocation.freshBudgetEpoch2 === true,
    allowNonZdrContinuation: invocation.allowNonZdrContinuation === true,
    schemaCorrectionContinuation: invocation.schemaCorrectionContinuation === true,
    outputLimit128kContinuation: invocation.outputLimit128kContinuation === true,
    runId,
  });
  if (invocation.schemaCorrectionContinuation && preflightSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.schemaCorrectionPreflightSha256) {
    throw new Error("The schema-correction no-dispatch preflight digest differs from the reviewed request identity.");
  }
  if (invocation.outputLimit128kContinuation && preflightSha256 !== FICTIONAL_IFS_DIAGNOSTIC_PINS.outputLimit128kPreflightSha256) {
    throw new Error("The 128k no-dispatch preflight digest differs from the authorized output-limit request identity.");
  }
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
  const reportModelPolicy = {
    ...structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY).IFS,
    maxOutputTokens: invocation.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : UNQUALIFIED_MOCK_MODEL_POLICY.IFS.maxOutputTokens,
  };
  const runFingerprint = sha256Canonical({
    schemaVersion: FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
    runId,
    scope: {
      profiles: ["C01", "C02"], reportType: "IFS", fixtureSet: "route-replays-v5", model: "openai/gpt-6-luna",
      reasoningEffort: "max", maxOutputTokens: invocation.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : 20_000,
      providerRestriction: "openai_only_no_fallbacks",
      retentionPolicy: invocation.allowNonZdrContinuation ? "non_zdr_allowed" : "zdr_required",
    },
    authorization: {
      operatorFlagProvided: true,
      freshBudgetEpoch2: invocation.freshBudgetEpoch2 === true,
      allowNonZdrContinuation: invocation.allowNonZdrContinuation === true,
      schemaCorrectionContinuation: invocation.schemaCorrectionContinuation === true,
      outputLimit128kContinuation: invocation.outputLimit128kContinuation === true,
      ...(invocation.schemaCorrectionContinuation ? { schemaCorrectionParentSha256: FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256 } : {}),
      ...(invocation.outputLimit128kContinuation ? { outputLimit128kParentSha256: FICTIONAL_IFS_128K_PARENT_SHA256 } : {}),
      approvalSha256,
      reviewSha256,
    },
    pricingSha256,
    sourcePins,
    requestFingerprints: preparedProfiles.map((profile) => profile.requestFingerprint),
    candidatePolicy: reportModelPolicy,
    maxCallCostMicros: invocation.maxCallCostMicros,
    aggregateCostCapMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
    billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
  });
  const outputRoot = path.resolve(dependencies.outputRoot ?? path.join(workspaceRoot, FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE));
  return {
    workspaceRoot,
    runId,
    runDirectory: path.join(outputRoot, runId),
    runFingerprint,
    preparedProfiles,
    sourcePins,
    authorization: {
      operatorFlagProvided: true,
      budgetEpoch: invocation.freshBudgetEpoch2 ? 2 : 1,
      ...(invocation.freshBudgetEpoch2 ? {
        priorRunBudgetDisposition: {
          priorRunId: FICTIONAL_IFS_DIAGNOSTIC_RUN_ID,
          priorUnknownReservedMicros: 230_000,
          excludedFromFreshEpochCap: true,
          priorInvoiceStatusRemainsUnknown: true,
          operatorDirective: "billing starts over" as const,
        },
      } : {}),
      ...(invocation.allowNonZdrContinuation ? {
        nonZdrContinuation: {
          operatorDirective: "allow non zdr" as const,
          priorEpoch2UnknownReservedMicros: 115_000 as const,
          priorInvoiceStatusRemainsUnknown: true as const,
          promptRetentionAcknowledged: true as const,
        },
      } : {}),
      ...(invocation.schemaCorrectionContinuation ? {
        schemaCorrectionContinuation: {
          operatorDirective: "run requests for c01 and c02" as const,
          priorRunId: FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
          priorRunSha256: FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
          priorEpoch2UnknownReservedMicros: 345_000 as const,
          priorInvoiceStatusRemainsUnknown: true as const,
          providerAcceptanceBeforeThisRun: "untested_after_schema_correction" as const,
        },
      } : {}),
      ...(invocation.outputLimit128kContinuation ? {
        outputLimit128kContinuation: {
          operatorDirective: "raise per call reservation to .2 and run" as const,
          priorRunId: FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID,
          priorRunSha256: FICTIONAL_IFS_128K_PARENT_SHA256,
          priorUnknownReservedMicros: 345_000 as const,
          priorReportedCostMicros: 12_138 as const,
          promptRetentionAcknowledged: true as const,
        },
      } : {}),
      recordedApprovalSha256: approvalSha256,
      independentScopeReviewSha256: reviewSha256,
      credentialInterpretation: "approval_record_is_not_a_cryptographic_credential_or_routing_receipt",
    },
    pricing: {
      evidenceFile: pricingRelative,
      evidenceSha256: pricingSha256,
      billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
      currentPublishedInputUsdPerMillionTokens: pricing.inputUsdPerMillionTokens,
      currentPublishedCompletionUsdPerMillionTokens: pricing.completionUsdPerMillionTokens,
      perCallReservationMicros: invocation.maxCallCostMicros,
      aggregateAuthorizationMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros,
      providerDependentInvoiceLimit: true,
    },
    outputLimit128kContinuation: invocation.outputLimit128kContinuation === true,
  };
}

function validateFinalWireRequest(input: string | URL | Request, init: RequestInit | undefined): {
  readonly runId: string;
  readonly idempotencyKey: string;
  readonly profileId: ProfileId;
  readonly phase: DiagnosticPhase;
  readonly model: string;
  readonly reasoningEffort: string;
  readonly payloadSha256: string;
  readonly requestVariant?: typeof OPENAI_ROUTE_CONTINUATION_MARKER | typeof FRESH_BUDGET_EPOCH_2_MARKER | typeof OPENAI_NON_ZDR_CONTINUATION_MARKER | typeof OPENAI_ERROR_DETAIL_RESEND_MARKER | typeof OPENAI_SCHEMA_CORRECTION_MARKER | typeof OPENAI_128K_OUTPUT_MARKER;
} {
  const endpoint = String(input);
  const headers = new Headers(init?.headers);
  const idempotencyKey = headers.get("x-request-id") ?? "";
  const bodyText = typeof init?.body === "string" ? init.body : "";
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(bodyText) as Record<string, unknown>; }
  catch { throw new Error("The final OpenRouter body is missing or is not valid JSON."); }
  const match = idempotencyKey.match(/^pwrp71-fictional-diagnostic:(gate11-c01-error-detail-resend-20261012|gate11-c01-c02-ifs-schema-correction-20261012|gate11-c01-c02-ifs-128k-output-20261012|gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011(?:-fresh-budget-epoch-2)?):(C01|C02)(?::(openai-route-continuation-1|openai-non-zdr-continuation-1|openai-error-detail-resend-1|openai-schema-correction-continuation-1|openai-128k-output-continuation-1))?:IFS:(initial|repair|escalation|review|review_after_repair):openai-gpt-6-luna-max:attempt-\d+$/u);
  const runId = match?.[1];
  const profileId = match?.[2] as ProfileId | undefined;
  const requestVariantMarker = match?.[3] as typeof OPENAI_ROUTE_CONTINUATION_MARKER | typeof OPENAI_NON_ZDR_CONTINUATION_MARKER | typeof OPENAI_ERROR_DETAIL_RESEND_MARKER | typeof OPENAI_SCHEMA_CORRECTION_MARKER | typeof OPENAI_128K_OUTPUT_MARKER | undefined;
  const freshBudgetMarker = runId === FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID && requestVariantMarker !== OPENAI_NON_ZDR_CONTINUATION_MARKER && requestVariantMarker !== OPENAI_ERROR_DETAIL_RESEND_MARKER
    ? FRESH_BUDGET_EPOCH_2_MARKER : undefined;
  const phase = match?.[4] as DiagnosticPhase | undefined;
  if (init?.method !== "POST" || endpoint !== OPENROUTER_DEFAULT_ENDPOINT || !headers.get("authorization")?.startsWith("Bearer ")
    || !runId || !profileId
    || (runId === FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID
      && (requestVariantMarker !== OPENAI_SCHEMA_CORRECTION_MARKER || (profileId !== "C01" && profileId !== "C02")))
    || (runId === FICTIONAL_IFS_128K_OUTPUT_RUN_ID
      && (requestVariantMarker !== OPENAI_128K_OUTPUT_MARKER || (profileId !== "C01" && profileId !== "C02")))
    || (requestVariantMarker === OPENAI_ROUTE_CONTINUATION_MARKER && (profileId !== "C01" || runId !== FICTIONAL_IFS_DIAGNOSTIC_RUN_ID))
    || (requestVariantMarker === OPENAI_NON_ZDR_CONTINUATION_MARKER && runId !== FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID)
    || (requestVariantMarker === OPENAI_SCHEMA_CORRECTION_MARKER && runId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID)
    || (requestVariantMarker === OPENAI_ERROR_DETAIL_RESEND_MARKER && (profileId !== "C01" || runId !== FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID))
    || (requestVariantMarker === OPENAI_ERROR_DETAIL_RESEND_MARKER && phase !== "initial")
    || !phase || !isRecord(payload.reasoning) || !isRecord(payload.provider) || !isRecord(payload.usage)
    || !isRecord(payload.prompt_cache_options) || !isRecord(payload.response_format) || !isRecord(payload.response_format.json_schema)) {
    throw new Error("The provider request is outside the journaled fictional diagnostic transport contract.");
  }
  const expectedKeys = ["model", "messages", "stream", "max_completion_tokens", "reasoning", "provider", "prompt_cache_options", "usage", "response_format"];
  const messages = payload.messages;
  const jsonSchema = payload.response_format.json_schema;
  const expectedOutputLimit = requestVariantMarker === OPENAI_128K_OUTPUT_MARKER ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : 20_000;
  if (Object.keys(payload).sort().join("|") !== expectedKeys.slice().sort().join("|")
    || payload.model !== "openai/gpt-6-luna"
    || payload.stream !== false
    || payload.max_completion_tokens !== expectedOutputLimit
    || payload.reasoning.effort !== "max"
    || sha256Canonical(payload.provider) !== sha256Canonical(requestVariantMarker === OPENAI_NON_ZDR_CONTINUATION_MARKER || requestVariantMarker === OPENAI_ERROR_DETAIL_RESEND_MARKER || requestVariantMarker === OPENAI_SCHEMA_CORRECTION_MARKER || requestVariantMarker === OPENAI_128K_OUTPUT_MARKER
      ? GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY
      : GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY)
    || payload.prompt_cache_options.mode !== "explicit"
    || payload.usage.include !== true
    || !Array.isArray(messages) || messages.length !== 2
    || !messages.every((message) => isRecord(message) && typeof message.content === "string")
    || !["patternwork_ifs_pwrp71_candidate_1", "patternwork_ifs_pwrp71_review_candidate_1"].includes(String(jsonSchema.name))
    || (requestVariantMarker === OPENAI_ERROR_DETAIL_RESEND_MARKER && jsonSchema.name !== "patternwork_ifs_pwrp71_candidate_1")
    || jsonSchema.strict !== true || !isRecord(jsonSchema.schema)) {
    throw new Error("The serialized model, reasoning, data policy, usage, schema, or generation limits differ from the authorized request.");
  }
  return {
    runId,
    idempotencyKey,
    profileId,
    phase,
    model: String(payload.model),
    reasoningEffort: String(payload.reasoning.effort),
    payloadSha256: sha256Text(bodyText),
    ...(requestVariantMarker ? { requestVariant: requestVariantMarker } : freshBudgetMarker ? { requestVariant: freshBudgetMarker } : {}),
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
  readonly continuation?: FictionalIfsDiagnosticContinuation;
}): FictionalIfsDiagnosticRun {
  const totals = costAndReserve(input.attempts);
  return {
    schemaVersion: FICTIONAL_IFS_DIAGNOSTIC_SCHEMA,
    resultKind: "fictional_report_diagnostic",
    purpose: "fictional_ifs_generation_validation_automated_review_and_semantic_evaluation",
    status: input.status,
    routingQualification: "not_claimed",
    productionActivationEffect: "none",
    runId: input.prepared.runId,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    runFingerprint: input.prepared.runFingerprint,
    ...(input.continuation ? { continuation: input.continuation } : {}),
    outputDirectory: input.prepared.runDirectory,
    attemptsFile: "attempts.json",
    dispatchesFile: "dispatches.json",
    scope: {
      profiles: ["C01", "C02"], reportType: "IFS", fixtureSet: "route-replays-v5", model: "openai/gpt-6-luna",
      reasoningEffort: "max", maxOutputTokens: input.prepared.outputLimit128kContinuation ? FICTIONAL_IFS_128K_OUTPUT_LIMIT : 20_000,
      providerRestriction: "openai_only_no_fallbacks",
      retentionPolicy: input.prepared.authorization.nonZdrContinuation ? "non_zdr_allowed" : "zdr_required",
    },
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

function assertRunManifestDigest(run: FictionalIfsDiagnosticRun): void {
  if (!run.runSha256) throw new Error("The prior diagnostic run has no integrity digest and cannot be continued.");
  const withoutDigest = Object.fromEntries(Object.entries(run).filter(([key]) => key !== "runSha256"));
  if (sha256Canonical(withoutDigest) !== run.runSha256) throw new Error("The prior diagnostic run manifest failed its integrity digest check.");
}

function validateLegacyContinuationParent(input: {
  readonly existing: FictionalIfsDiagnosticRun;
  readonly prepared: PreparedDiagnostic;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly now: Date;
}): FictionalIfsDiagnosticContinuation {
  const { existing, prepared, attempts, dispatches } = input;
  assertRunManifestDigest(existing);
  if (existing.runSha256 !== LEGACY_DEFAULT_ROUTE_RUN_SHA256
    || existing.runFingerprint !== LEGACY_DEFAULT_ROUTE_RUN_FINGERPRINT
    || existing.status !== "diagnostic_stopped"
    || existing.runId !== FICTIONAL_IFS_DIAGNOSTIC_RUN_ID
    || existing.scope.providerRestriction !== undefined
    || existing.scope.profiles.join(",") !== "C01,C02"
    || existing.scope.reportType !== "IFS"
    || existing.scope.fixtureSet !== "route-replays-v5"
    || existing.scope.model !== "openai/gpt-6-luna"
    || existing.scope.reasoningEffort !== "max") {
    throw new Error("The fixed run is not the exact prior default-routed diagnostic eligible for its one OpenAI-only continuation.");
  }
  const stableSourcePins = [
    "questionRelease",
    "questionSourceSha256",
    "questionSourceManifestSha256",
    "routerRuntimeSha256",
    "reportRelease",
    "reportSourceManifestSha256",
    "semanticCaseSetSha256",
    "fixtureManifestSha256",
    "fixtureSetSha256",
  ] as const;
  for (const key of stableSourcePins) {
    if (existing.sourcePins[key] !== prepared.sourcePins[key]) throw new Error(`The prior diagnostic source pin ${key} differs from the reviewed continuation candidate.`);
  }
  if (existing.sourcePins.profiles.length !== 2 || prepared.sourcePins.profiles.length !== 2) throw new Error("The prior diagnostic does not retain exactly the reviewed C01/C02 packet pair.");
  for (const profileId of ["C01", "C02"] as const) {
    const prior = existing.sourcePins.profiles.find((row) => row.profileId === profileId);
    const current = prepared.sourcePins.profiles.find((row) => row.profileId === profileId);
    if (!prior || !current
      || prior.fixtureArtifactSha256 !== current.fixtureArtifactSha256
      || prior.packetSha256 !== current.packetSha256
      || prior.evidenceSha256 !== current.evidenceSha256) {
      throw new Error(`The prior ${profileId} evidence packet differs from the source-reviewed continuation candidate.`);
    }
  }
  const priorResult = existing.results;
  if (priorResult.length !== 1
    || priorResult[0]?.profileId !== "C01"
    || priorResult[0]?.reportType !== "IFS"
    || priorResult[0]?.status !== "failed"
    || priorResult[0]?.failure?.code !== "client_error"
    || existing.providerDispatchCount !== 1
    || existing.budget.aggregateReportedCostMicros !== 0
    || existing.budget.unknownOrInFlightReservedCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || existing.budget.remainingAuthorizedMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros) {
    throw new Error("The prior run does not have the exact single failed C01 attempt and held reservation required for continuation.");
  }
  const oldProfilePin = existing.sourcePins.profiles.find((row) => row.profileId === "C01");
  const oldAttempt = attempts.length === 1 ? attempts[0] : undefined;
  if (!oldAttempt
    || oldAttempt.attemptId !== LEGACY_C01_ATTEMPT_ID
    || oldAttempt.status !== "unknown"
    || oldAttempt.usageStatus !== "unknown"
    || oldAttempt.request.requestedModel !== "openai/gpt-6-luna"
    || oldAttempt.request.requestedReasoningEffort !== "max"
    || oldAttempt.request.schemaName !== "patternwork_ifs_pwrp71_candidate_1"
    || oldAttempt.reservedCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || oldAttempt.maximumCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || oldAttempt.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
    || oldAttempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
    || oldAttempt.endpoint !== OPENROUTER_DEFAULT_ENDPOINT
    || oldAttempt.wirePayloadSha256 !== oldProfilePin?.initialWirePayloadSha256
    || oldAttempt.diagnostic?.providerName !== "Azure"
    || oldAttempt.diagnostic?.providerUpstreamCode !== "invalid_json_schema"
    || oldAttempt.diagnostic?.statusCode !== 400) {
    throw new Error("The durable prior attempt does not match the single unknown-cost Azure schema rejection being continued.");
  }
  const priorDispatch = dispatches.entries.length === 1 ? dispatches.entries[0] : undefined;
  if (!priorDispatch
    || priorDispatch.idempotencyKey !== LEGACY_C01_ATTEMPT_ID
    || priorDispatch.profileId !== "C01"
    || priorDispatch.phase !== "initial"
    || priorDispatch.model !== "openai/gpt-6-luna"
    || priorDispatch.endpoint !== OPENROUTER_DEFAULT_ENDPOINT
    || priorDispatch.outcome !== "response_received"
    || priorDispatch.responseStatus !== 400
    || priorDispatch.wirePayloadSha256 !== oldAttempt.wirePayloadSha256
    || existing.providerDispatchesFileSha256 !== sha256Canonical(dispatches)) {
    throw new Error("The durable prior dispatch does not match the exact single C01 Azure HTTP 400 attempt.");
  }
  const parentRunArchiveFile = `history/prior-default-route-run-${LEGACY_DEFAULT_ROUTE_RUN_SHA256}.json`;
  return {
    ordinal: 1,
    reason: "openai_only_provider_route_after_prior_azure_schema_rejection",
    operatorFlag: CONTINUATION_FLAG,
    operatorDirective: "run em",
    priorRunSha256: LEGACY_DEFAULT_ROUTE_RUN_SHA256,
    priorRunFingerprint: LEGACY_DEFAULT_ROUTE_RUN_FINGERPRINT,
    priorRunArchiveFile: parentRunArchiveFile,
    priorAttemptsArchiveFile: `history/prior-default-route-attempts-${LEGACY_DEFAULT_ROUTE_RUN_SHA256}.json`,
    priorDispatchesArchiveFile: `history/prior-default-route-dispatches-${LEGACY_DEFAULT_ROUTE_RUN_SHA256}.json`,
    carriedUnknownAttemptIds: [LEGACY_C01_ATTEMPT_ID],
    carriedUnknownReservationMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
    startedAt: input.now.toISOString(),
  };
}

function validateEpoch2NonZdrContinuationParent(input: {
  readonly existing: FictionalIfsDiagnosticRun;
  readonly prepared: PreparedDiagnostic;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly now: Date;
}): FictionalIfsDiagnosticContinuation {
  const { existing, prepared, attempts, dispatches } = input;
  assertRunManifestDigest(existing);
  if (existing.runId !== FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID
    || existing.runSha256 !== FICTIONAL_IFS_DIAGNOSTIC_EPOCH_2_ZDR_PARENT_SHA256
    || existing.runFingerprint !== FRESH_EPOCH_2_ZDR_RUN_FINGERPRINT
    || existing.status !== "diagnostic_stopped"
    || existing.continuation !== undefined
    || existing.authorization.budgetEpoch !== 2
    || existing.scope.retentionPolicy !== undefined
    || existing.scope.providerRestriction !== "openai_only_no_fallbacks"
    || existing.sourcePins.routerRuntimeSha256 !== prepared.sourcePins.routerRuntimeSha256
    || existing.sourcePins.questionSourceSha256 !== prepared.sourcePins.questionSourceSha256
    || existing.sourcePins.questionSourceManifestSha256 !== prepared.sourcePins.questionSourceManifestSha256
    || existing.sourcePins.reportSourceManifestSha256 !== prepared.sourcePins.reportSourceManifestSha256
    || existing.sourcePins.semanticCaseSetSha256 !== prepared.sourcePins.semanticCaseSetSha256
    || existing.sourcePins.fixtureManifestSha256 !== prepared.sourcePins.fixtureManifestSha256
    || existing.sourcePins.fixtureSetSha256 !== prepared.sourcePins.fixtureSetSha256
    || existing.sourcePins.profiles.length !== 2
    || prepared.sourcePins.profiles.length !== 2) {
    throw new Error("The epoch-2 run is not the exact pinned OpenAI-only ZDR rejection eligible for this owner-authorized non-ZDR continuation.");
  }
  for (const profileId of ["C01", "C02"] as const) {
    const prior = existing.sourcePins.profiles.find((row) => row.profileId === profileId);
    const current = prepared.sourcePins.profiles.find((row) => row.profileId === profileId);
    if (!prior || !current
      || prior.fixtureArtifactSha256 !== current.fixtureArtifactSha256
      || prior.packetSha256 !== current.packetSha256
      || prior.evidenceSha256 !== current.evidenceSha256) {
      throw new Error(`The epoch-2 ${profileId} packet changed before the non-ZDR continuation.`);
    }
  }
  const priorResult = existing.results.length === 1 ? existing.results[0] : undefined;
  if (!priorResult || priorResult.profileId !== "C01" || priorResult.reportType !== "IFS" || priorResult.status !== "failed"
    || priorResult.failure?.code !== "client_error"
    || !priorResult.failure.message.includes("Zero data retention")
    || existing.providerDispatchCount !== 1
    || existing.budget.aggregateReportedCostMicros !== 0
    || existing.budget.unknownOrInFlightReservedCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || existing.budget.remainingAuthorizedMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros) {
    throw new Error("The epoch-2 parent must contain exactly the one failed C01 ZDR route attempt and its retained reservation.");
  }
  const oldProfile = existing.sourcePins.profiles.find((row) => row.profileId === "C01");
  const oldAttempt = attempts.length === 1 ? attempts[0] : undefined;
  if (!oldAttempt
    || oldAttempt.attemptId !== FRESH_EPOCH_2_C01_ATTEMPT_ID
    || oldAttempt.status !== "unknown"
    || oldAttempt.usageStatus !== "unknown"
    || oldAttempt.request.requestedModel !== "openai/gpt-6-luna"
    || oldAttempt.request.requestedReasoningEffort !== "max"
    || oldAttempt.request.schemaName !== "patternwork_ifs_pwrp71_candidate_1"
    || oldAttempt.reservedCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || oldAttempt.maximumCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
    || oldAttempt.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
    || oldAttempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
    || oldAttempt.endpoint !== OPENROUTER_DEFAULT_ENDPOINT
    || oldAttempt.wirePayloadSha256 !== oldProfile?.initialWirePayloadSha256
    || oldAttempt.diagnostic?.statusCode !== 404
    || oldAttempt.diagnostic?.providerCode !== "404"
    || !oldAttempt.diagnostic.message.includes("Zero data retention")) {
    throw new Error("The exact epoch-2 unknown reservation could not be validated and will not be carried into a new request.");
  }
  const priorDispatch = dispatches.entries.length === 1 ? dispatches.entries[0] : undefined;
  if (!priorDispatch
    || priorDispatch.idempotencyKey !== FRESH_EPOCH_2_C01_ATTEMPT_ID
    || priorDispatch.profileId !== "C01"
    || priorDispatch.phase !== "initial"
    || priorDispatch.model !== "openai/gpt-6-luna"
    || priorDispatch.endpoint !== OPENROUTER_DEFAULT_ENDPOINT
    || priorDispatch.outcome !== "response_received"
    || priorDispatch.responseStatus !== 404
    || priorDispatch.wirePayloadSha256 !== oldAttempt.wirePayloadSha256
    || existing.providerDispatchesFileSha256 !== sha256Canonical(dispatches)) {
    throw new Error("The epoch-2 dispatch receipt does not match the exact one-request ZDR rejection.");
  }
  const parentSha = existing.runSha256;
  return {
    ordinal: 2,
    reason: "owner_authorized_non_zdr_after_openai_zdr_route_rejection",
    operatorFlag: NON_ZDR_CONTINUATION_FLAG,
    operatorDirective: "allow non zdr",
    priorRunSha256: parentSha,
    priorRunFingerprint: existing.runFingerprint,
    priorRunArchiveFile: `history/prior-openai-zdr-route-run-${parentSha}.json`,
    priorAttemptsArchiveFile: `history/prior-openai-zdr-route-attempts-${parentSha}.json`,
    priorDispatchesArchiveFile: `history/prior-openai-zdr-route-dispatches-${parentSha}.json`,
    carriedUnknownAttemptIds: [FRESH_EPOCH_2_C01_ATTEMPT_ID],
    carriedUnknownReservationMicros: FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros,
    startedAt: input.now.toISOString(),
  };
}

async function preserveLegacyRunSnapshot(runDirectory: string, continuation: FictionalIfsDiagnosticContinuation): Promise<void> {
  const entries = [
    { source: "run.json", archive: continuation.priorRunArchiveFile },
    { source: "attempts.json", archive: continuation.priorAttemptsArchiveFile },
    { source: "dispatches.json", archive: continuation.priorDispatchesArchiveFile },
  ] as const;
  for (const entry of entries) {
    const sourceBytes = await readFile(path.join(runDirectory, entry.source));
    if (entry.source === "run.json") {
      const sourceRun = JSON.parse(sourceBytes.toString("utf8")) as FictionalIfsDiagnosticRun;
      assertRunManifestDigest(sourceRun);
      if (sourceRun.runSha256 !== continuation.priorRunSha256) throw new Error("The prior run changed before its immutable continuation snapshot could be retained.");
    }
    const archivePath = path.join(runDirectory, entry.archive);
    await mkdir(path.dirname(archivePath), { recursive: true });
    try {
      const handle = await open(archivePath, "wx");
      try { await handle.writeFile(sourceBytes); await handle.sync(); }
      finally { await handle.close(); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const archivedBytes = await readFile(archivePath);
      if (!archivedBytes.equals(sourceBytes)) throw new Error("The immutable parent-run archive path already contains different evidence.");
    }
  }
}

interface SchemaCorrectionSeed {
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly continuation: FictionalIfsDiagnosticContinuation;
}

async function writeImmutableArchive(file: string, bytes: Buffer): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  try {
    const handle = await open(file, "wx");
    try { await handle.writeFile(bytes); await handle.sync(); }
    finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await readFile(file)).equals(bytes)) throw new Error("A schema-correction history archive already exists with different bytes.");
  }
}

async function copyHistoryTreeImmutable(source: string, destination: string): Promise<void> {
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) await copyHistoryTreeImmutable(sourcePath, destinationPath);
    else if (entry.isFile()) await writeImmutableArchive(destinationPath, await readFile(sourcePath));
    else throw new Error("The parent diagnostic history contains an unsupported filesystem entry.");
  }
}

async function seed128kOutputHistory(input: {
  readonly workspaceRoot: string;
  readonly runDirectory: string;
  readonly prepared: PreparedDiagnostic;
  readonly now: Date;
}): Promise<{ readonly attempts: readonly QualificationAttemptRecord[]; readonly dispatches: DispatchFile; readonly continuation: FictionalIfsDiagnosticContinuation }> {
  const parentDirectory = path.join(input.workspaceRoot, FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE, FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID);
  const parentHistoryDirectory = path.join(parentDirectory, "history");
  const [runBytes, attemptsBytes, dispatchesBytes, preflightBytes] = await Promise.all([
    readFile(path.join(parentDirectory, "run.json")),
    readFile(path.join(parentDirectory, "attempts.json")),
    readFile(path.join(parentDirectory, "dispatches.json")),
    readBytes(input.workspaceRoot, SCHEMA_CORRECTION_PREFLIGHT_RELATIVE),
  ]);
  const parent = JSON.parse(runBytes.toString("utf8")) as FictionalIfsDiagnosticRun;
  assertRunManifestDigest(parent);
  if (parent.runId !== FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID
    || parent.runSha256 !== FICTIONAL_IFS_128K_PARENT_SHA256
    || parent.status !== "diagnostic_stopped"
    || parent.routingQualification !== "not_claimed"
    || parent.productionActivationEffect !== "none"
    || parent.scope.profiles.join(",") !== "C01,C02"
    || parent.scope.reportType !== "IFS"
    || parent.scope.fixtureSet !== "route-replays-v5"
    || parent.scope.model !== "openai/gpt-6-luna"
    || parent.scope.reasoningEffort !== "max"
    || parent.scope.retentionPolicy !== "non_zdr_allowed"
    || parent.budget.unknownOrInFlightReservedCostMicros !== 345_000
    || parent.budget.aggregateReportedCostMicros !== 12_138
    || parent.budget.remainingAuthorizedMicros !== 2_642_862
    || parent.providerDispatchCount !== 4
    || parent.sourcePins.preflightSha256 !== sha256Canonical(JSON.parse(preflightBytes.toString("utf8")))) {
    throw new Error("The 128k continuation parent is not the exact stopped C01 schema-correction run and current budget state.");
  }
  for (const key of ["questionRelease", "questionSourceSha256", "questionSourceManifestSha256", "routerRuntimeSha256", "reportRelease", "reportSourceManifestSha256", "semanticCaseSetSha256", "fixtureManifestSha256", "fixtureSetSha256"] as const) {
    if (parent.sourcePins[key] !== input.prepared.sourcePins[key]) throw new Error(`The 128k continuation parent source pin ${key} differs from the current reviewed packets.`);
  }
  if (sha256Bytes(attemptsBytes) !== OUTPUT_LIMIT_128K_PARENT_ATTEMPTS_RAW_SHA256
    || sha256Bytes(dispatchesBytes) !== OUTPUT_LIMIT_128K_PARENT_DISPATCHES_RAW_SHA256) {
    throw new Error("The parent attempt or dispatch journal bytes differ from the reviewed completed C01 and unknown-cost history.");
  }
  const attemptFile = JSON.parse(attemptsBytes.toString("utf8")) as { schemaVersion?: unknown; attempts?: unknown };
  const dispatches = JSON.parse(dispatchesBytes.toString("utf8")) as DispatchFile;
  if (attemptFile.schemaVersion !== 1 || !Array.isArray(attemptFile.attempts)
    || dispatches.schemaVersion !== 1 || !Array.isArray(dispatches.entries)) {
    throw new Error("The parent budget journals are malformed and cannot be inherited.");
  }
  const attempts = attemptFile.attempts as QualificationAttemptRecord[];
  const expectedUnknownIds = [
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
  ];
  const schemaAttemptId = `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID}:C01:${OPENAI_SCHEMA_CORRECTION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`;
  if (attempts.length !== 4 || attempts.slice(0, 3).some((attempt, index) => attempt.attemptId !== expectedUnknownIds[index]
    || attempt.status !== "unknown" || attempt.usageStatus !== "unknown" || attempt.reservedCostMicros !== 115_000)
    || attempts[3]?.attemptId !== schemaAttemptId || attempts[3]?.status !== "completed" || attempts[3]?.usageStatus !== "reported"
    || attempts[3]?.request.maxOutputTokens !== 20_000 || attempts[3]?.finishReason !== "length"
    || attempts[3]?.usage?.costMicros !== 12_138 || attempts[3]?.usage?.inputTokens !== 21_376
    || attempts[3]?.usage?.outputTokens !== 20_000 || attempts.some((attempt) => attempt.attemptId.includes(":C02:"))
    || dispatches.entries.length !== 4
    || dispatches.entries.some((entry, index) => entry.idempotencyKey !== (index < 3 ? expectedUnknownIds[index] : schemaAttemptId)
      || entry.profileId !== "C01" || entry.phase !== "initial" || entry.outcome !== "response_received"
      || entry.responseStatus !== [404, 400, 400, 200][index])) {
    throw new Error("The parent journal must retain exactly three unknown C01 reservations and one completed, length-limited C01 response; no C02 attempt is eligible.");
  }
  if (parent.results.length !== 1 || parent.results[0]?.profileId !== "C01" || parent.results[0]?.status !== "failed"
    || parent.results[0]?.failure?.code !== "incomplete_generation"
    || parent.results[0]?.usage?.finishReasons.join(",") !== "length") {
    throw new Error("The 128k continuation parent no longer records the exact C01 length-limit failure.");
  }
  const currentEntries = await readdir(input.runDirectory);
  if (currentEntries.some((entry) => entry !== DIAGNOSTIC_LOCK_NAME)) throw new Error("The unique 128k run directory already contains state and cannot be reused.");
  const runArchive = `history/parent-schema-correction-run-${FICTIONAL_IFS_128K_PARENT_SHA256}.json`;
  const attemptsArchive = `history/parent-schema-correction-attempts-${FICTIONAL_IFS_128K_PARENT_SHA256}.json`;
  const dispatchesArchive = `history/parent-schema-correction-dispatches-${FICTIONAL_IFS_128K_PARENT_SHA256}.json`;
  const preflightArchive = `history/parent-schema-correction-preflight-${FICTIONAL_IFS_128K_PARENT_SHA256}.json`;
  await Promise.all([
    writeImmutableArchive(path.join(input.runDirectory, runArchive), runBytes),
    writeImmutableArchive(path.join(input.runDirectory, attemptsArchive), attemptsBytes),
    writeImmutableArchive(path.join(input.runDirectory, dispatchesArchive), dispatchesBytes),
    writeImmutableArchive(path.join(input.runDirectory, preflightArchive), preflightBytes),
    copyHistoryTreeImmutable(parentHistoryDirectory, path.join(input.runDirectory, "history/parent-history")),
    atomicWrite(path.join(input.runDirectory, "attempts.json"), attemptsBytes.toString("utf8")),
    atomicWrite(path.join(input.runDirectory, "dispatches.json"), dispatchesBytes.toString("utf8")),
  ]);
  const continuation: FictionalIfsDiagnosticContinuation = {
    ordinal: 4,
    reason: "owner_authorized_128k_output_after_length_limited_c01",
    operatorFlag: OUTPUT_LIMIT_128K_CONTINUATION_FLAG,
    operatorDirective: "raise per call reservation to .2 and run",
    priorRunSha256: FICTIONAL_IFS_128K_PARENT_SHA256,
    priorRunFingerprint: parent.runFingerprint,
    priorRunArchiveFile: runArchive,
    priorAttemptsArchiveFile: attemptsArchive,
    priorDispatchesArchiveFile: dispatchesArchive,
    priorPreflightArchiveFile: preflightArchive,
    carriedUnknownAttemptIds: expectedUnknownIds,
    carriedUnknownReservationMicros: 345_000,
    startedAt: input.now.toISOString(),
  };
  return { attempts, dispatches, continuation };
}

async function validate128kOutputHistory(input: {
  readonly runDirectory: string;
  readonly existing: FictionalIfsDiagnosticRun;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
}): Promise<FictionalIfsDiagnosticContinuation> {
  const continuation = input.existing.continuation;
  if (!continuation
    || continuation.ordinal !== 4
    || continuation.reason !== "owner_authorized_128k_output_after_length_limited_c01"
    || continuation.operatorFlag !== OUTPUT_LIMIT_128K_CONTINUATION_FLAG
    || continuation.operatorDirective !== "raise per call reservation to .2 and run"
    || continuation.priorRunSha256 !== FICTIONAL_IFS_128K_PARENT_SHA256
    || continuation.carriedUnknownReservationMicros !== 345_000
    || continuation.carriedUnknownAttemptIds.length !== 3
    || !continuation.priorPreflightArchiveFile) {
    throw new Error("The existing run is not the exact 128k owner-authorized continuation.");
  }
  const [parentRunBytes, parentAttemptsBytes, parentDispatchesBytes, parentPreflightBytes] = await Promise.all([
    readFile(path.join(input.runDirectory, continuation.priorRunArchiveFile)),
    readFile(path.join(input.runDirectory, continuation.priorAttemptsArchiveFile)),
    readFile(path.join(input.runDirectory, continuation.priorDispatchesArchiveFile)),
    readFile(path.join(input.runDirectory, continuation.priorPreflightArchiveFile)),
  ]);
  const parent = JSON.parse(parentRunBytes.toString("utf8")) as FictionalIfsDiagnosticRun;
  const parentAttempts = JSON.parse(parentAttemptsBytes.toString("utf8")) as { schemaVersion?: unknown; attempts?: unknown };
  const parentDispatches = JSON.parse(parentDispatchesBytes.toString("utf8")) as DispatchFile;
  if (parent.runSha256 !== FICTIONAL_IFS_128K_PARENT_SHA256
    || sha256Canonical(Object.fromEntries(Object.entries(parent).filter(([key]) => key !== "runSha256"))) !== FICTIONAL_IFS_128K_PARENT_SHA256
    || sha256Bytes(parentAttemptsBytes) !== OUTPUT_LIMIT_128K_PARENT_ATTEMPTS_RAW_SHA256
    || sha256Bytes(parentDispatchesBytes) !== OUTPUT_LIMIT_128K_PARENT_DISPATCHES_RAW_SHA256
    || sha256Canonical(JSON.parse(parentPreflightBytes.toString("utf8"))) !== parent.sourcePins.preflightSha256
    || parentAttempts.schemaVersion !== 1 || !Array.isArray(parentAttempts.attempts)
    || parentDispatches.schemaVersion !== 1 || !Array.isArray(parentDispatches.entries)
    || sha256Canonical({ schemaVersion: 1, attempts: input.attempts.slice(0, 4) }) !== sha256Canonical(parentAttempts)
    || sha256Canonical({ schemaVersion: 1, entries: input.dispatches.entries.slice(0, 4) }) !== sha256Canonical(parentDispatches)
    || input.attempts.slice(0, 3).some((attempt) => !continuation.carriedUnknownAttemptIds.includes(attempt.attemptId))) {
    throw new Error("The 128k continuation journal no longer preserves the byte-pinned parent and its three unknown reservations.");
  }
  return continuation;
}

function isExact128kOutputPreDispatchStop(input: {
  readonly run: FictionalIfsDiagnosticRun;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly carriedUnknownAttemptIds: ReadonlySet<string>;
}): boolean {
  return input.run.runId === FICTIONAL_IFS_128K_OUTPUT_RUN_ID
    && input.run.status === "diagnostic_stopped"
    && input.run.results.length === 0
    && input.run.blockers.length === 1
    && input.run.blockers[0]?.startsWith("OpenRouter connectivity preflight ") === true
    && input.run.blockers[0]?.includes("no report request was dispatched") === true
    && input.attempts.length === 4
    && input.dispatches.entries.length === 4
    && input.attempts.slice(0, 3).every((attempt) => input.carriedUnknownAttemptIds.has(attempt.attemptId)
      && attempt.status === "unknown" && attempt.usageStatus === "unknown" && attempt.reservedCostMicros === 115_000);
}

function assertArchivedParentChain(input: {
  readonly parentRunBytes: Buffer;
  readonly parentAttemptsBytes: Buffer;
  readonly parentDispatchesBytes: Buffer;
  readonly expectedParentRunSha256: string;
  readonly currentAttemptsPrefix: readonly QualificationAttemptRecord[];
  readonly currentDispatchesPrefix: readonly DiagnosticHttpDispatchRecord[];
}): void {
  const parentRun = JSON.parse(input.parentRunBytes.toString("utf8")) as Record<string, unknown>;
  const parentWithoutDigest = Object.fromEntries(Object.entries(parentRun).filter(([key]) => key !== "runSha256"));
  const parentAttempts = JSON.parse(input.parentAttemptsBytes.toString("utf8")) as { schemaVersion?: unknown; attempts?: unknown };
  const parentDispatches = JSON.parse(input.parentDispatchesBytes.toString("utf8")) as DispatchFile;
  if (parentRun.runSha256 !== input.expectedParentRunSha256
    || sha256Canonical(parentWithoutDigest) !== input.expectedParentRunSha256
    || parentAttempts.schemaVersion !== 1 || !Array.isArray(parentAttempts.attempts)
    || parentDispatches.schemaVersion !== 1 || !Array.isArray(parentDispatches.entries)
    || sha256Canonical(parentAttempts) !== sha256Canonical({ schemaVersion: 1, attempts: input.currentAttemptsPrefix })
    || sha256Canonical(parentDispatches) !== sha256Canonical({ schemaVersion: 1, entries: input.currentDispatchesPrefix })) {
    throw new Error("The archived parent lineage does not match its pinned run digest and preserved attempt/dispatch prefixes.");
  }
}

function isExactSchemaCorrectionPreDispatchStop(input: {
  readonly run: FictionalIfsDiagnosticRun;
  readonly attempts: readonly QualificationAttemptRecord[];
  readonly dispatches: DispatchFile;
  readonly carriedUnknownAttemptIds: ReadonlySet<string>;
}): boolean {
  const expectedAttemptIds = [
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
  ];
  const expectedStatuses = [404, 400, 400];
  return input.run.runId === FICTIONAL_IFS_SCHEMA_CORRECTION_RUN_ID
    && input.run.status === "diagnostic_stopped"
    && input.run.results.length === 0
    && input.run.blockers.length === 1
    && input.run.blockers[0]?.startsWith("OpenRouter connectivity preflight ") === true
    && input.run.blockers[0]?.includes("no report request was dispatched") === true
    && input.attempts.length === expectedAttemptIds.length
    && input.attempts.every((attempt, index) => attempt.attemptId === expectedAttemptIds[index]
      && input.carriedUnknownAttemptIds.has(attempt.attemptId)
      && attempt.status === "unknown"
      && attempt.usageStatus === "unknown"
      && attempt.reservedCostMicros === FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros)
    && input.dispatches.entries.length === expectedAttemptIds.length
    && input.dispatches.entries.every((entry, index) => entry.idempotencyKey === expectedAttemptIds[index]
      && entry.profileId === "C01"
      && entry.phase === "initial"
      && entry.outcome === "response_received"
      && entry.responseStatus === expectedStatuses[index])
    && input.carriedUnknownAttemptIds.size === expectedAttemptIds.length
    && [...input.carriedUnknownAttemptIds].every((attemptId) => expectedAttemptIds.includes(attemptId));
}

async function seedSchemaCorrectionHistory(input: {
  readonly workspaceRoot: string;
  readonly runDirectory: string;
  readonly prepared: PreparedDiagnostic;
  readonly now: Date;
}): Promise<SchemaCorrectionSeed> {
  const parentDirectory = path.join(input.workspaceRoot, FICTIONAL_IFS_DIAGNOSTIC_OUTPUT_RELATIVE, FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID);
  const parentHistoryDirectory = path.join(parentDirectory, "history");
  const [runBytes, attemptsBytes, dispatchesBytes, preflightBytes, historicalParentRun, historicalParentAttempts, historicalParentDispatches] = await Promise.all([
    readFile(path.join(parentDirectory, "run.json")),
    readFile(path.join(parentDirectory, "attempts.json")),
    readFile(path.join(parentDirectory, "dispatches.json")),
    readFile(path.join(parentDirectory, "preflight.json")),
    readFile(path.join(parentHistoryDirectory, "parent-run.json")),
    readFile(path.join(parentHistoryDirectory, "parent-attempts.json")),
    readFile(path.join(parentHistoryDirectory, "parent-dispatches.json")),
  ]);
  const parent = JSON.parse(runBytes.toString("utf8")) as Record<string, unknown>;
  const withoutDigest = Object.fromEntries(Object.entries(parent).filter(([key]) => key !== "runSha256"));
  const parentRunConditions = [
    parent.schemaVersion === "PWRP71-C01-IFS-ERROR-DETAIL-RESEND-1",
    parent.resultKind === "fictional_report_diagnostic_resend",
    parent.status === "provider_rejected",
    parent.runId === FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID,
    parent.runSha256 === FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
    sha256Canonical(withoutDigest) === FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
    parent.parentRunSha256 === "3959ea731dc6effa86703060023007bb1a9f97fbbb8a0c3eff1d0f0a0ea254c6",
  ];
  if (parentRunConditions.includes(false)) {
    throw new Error(`The latest parent is not the exact byte-pinned OpenAI schema-rejection run eligible for schema correction (${parentDirectory}).`);
  }
  const scope = parent.scope;
  const sourcePins = parent.sourcePins;
  const cost = parent.cost;
  const diagnostic = parent.providerDiagnostic;
  if (!isRecord(scope) || scope.profileId !== "C01" || scope.reportType !== "IFS" || scope.fixtureSet !== "route-replays-v5"
    || scope.model !== "openai/gpt-6-luna" || scope.reasoningEffort !== "max"
    || scope.providerRestriction !== "openai_only_no_fallbacks" || scope.privacyMode !== "non_zdr_allowed"
    || !isRecord(sourcePins) || !isRecord(cost) || !isRecord(diagnostic)
    || diagnostic.providerName !== "OpenAI" || diagnostic.providerUpstreamCode !== "invalid_json_schema"
    || typeof diagnostic.providerErrorRaw !== "string" || !diagnostic.providerErrorRaw.includes("properties', 'report_release')")
    || cost.reportedMicros !== 0 || cost.reservedUnknownMicros !== SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
    || cost.remainingAuthorizedMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros - SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
    || parent.attemptLedgerSha256 !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
    || parent.providerDispatchesSha256 !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256
    || parent.preflightSha256 !== sha256Canonical(JSON.parse(preflightBytes.toString("utf8")))
    || parent.preflightSha256 !== SCHEMA_CORRECTION_PARENT_PREFLIGHT_SHA256) {
    throw new Error("The stopped parent does not preserve the exact OpenAI schema rejection, current budget, source pins, and preflight digest.");
  }
  for (const key of [
    "questionSourceSha256", "questionSourceManifestSha256", "routerRuntimeSha256",
    "reportSourceManifestSha256", "semanticCaseSetSha256", "fixtureManifestSha256", "fixtureSetSha256",
  ] as const) {
    if (sourcePins[key] !== input.prepared.sourcePins[key]) throw new Error(`The schema-correction parent source pin ${key} differs from the current reviewed candidate.`);
  }
  const currentC01 = input.prepared.sourcePins.profiles.find((profile) => profile.profileId === "C01");
  if (!currentC01 || sourcePins.packetSha256 !== currentC01.packetSha256
    || sourcePins.evidenceSha256 !== currentC01.evidenceSha256
    || sourcePins.fixtureArtifactSha256 !== currentC01.fixtureArtifactSha256) {
    throw new Error("The latest rejected C01 request did not use the current reviewed fictional packet.");
  }

  const attemptFile = JSON.parse(attemptsBytes.toString("utf8")) as { readonly schemaVersion?: unknown; readonly attempts?: unknown };
  const dispatches = JSON.parse(dispatchesBytes.toString("utf8")) as DispatchFile;
  if (attemptFile.schemaVersion !== 1 || !Array.isArray(attemptFile.attempts)
    || dispatches.schemaVersion !== 1 || dispatches.entries.length !== 3
    || sha256Canonical(attemptFile) !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
    || sha256Canonical(dispatches) !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256) {
    throw new Error("The prior attempt and dispatch journal hashes changed; unknown reservations cannot be carried safely.");
  }
  const attempts = attemptFile.attempts as QualificationAttemptRecord[];
  const expectedAttemptIds = [
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
    `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
  ];
  const expectedStatuses = [404, 400, 400];
  if (attempts.length !== expectedAttemptIds.length || dispatches.entries.length !== expectedAttemptIds.length
    || attempts.some((attempt, index) => attempt.attemptId !== expectedAttemptIds[index]
      || attempt.status !== "unknown" || attempt.usageStatus !== "unknown"
      || attempt.reservedCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
      || attempt.maximumCallCostMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros
      || attempt.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
      || attempt.request.requestedModel !== "openai/gpt-6-luna"
      || attempt.request.requestedReasoningEffort !== "max"
      || attempt.request.schemaName !== "patternwork_ifs_pwrp71_candidate_1"
      || attempt.request.wireSchemaSha256 !== SCHEMA_CORRECTION_PREVIOUS_WIRE_SCHEMA_SHA256
      || attempt.endpoint !== OPENROUTER_DEFAULT_ENDPOINT)
    || dispatches.entries.some((entry, index) => entry.index !== index + 1
      || entry.idempotencyKey !== expectedAttemptIds[index]
      || entry.profileId !== "C01" || entry.phase !== "initial"
      || entry.model !== "openai/gpt-6-luna" || entry.reasoningEffort !== "max"
      || entry.endpoint !== OPENROUTER_DEFAULT_ENDPOINT || entry.outcome !== "response_received"
      || entry.responseStatus !== expectedStatuses[index])
    || dispatches.entries[2]?.requestVariant !== OPENAI_ERROR_DETAIL_RESEND_MARKER
    || attempts[2]?.diagnostic?.providerUpstreamCode !== "invalid_json_schema"
    || attempts.some((attempt) => attempt.attemptId.includes(":C02:"))) {
    throw new Error("The parent must contain exactly three prior unknown C01 IFS attempts; none may be replayed or mislabeled.");
  }
  if (attempts[0]?.diagnostic?.statusCode !== 404
    || attempts[0]?.diagnostic?.message.toLowerCase().includes("zero data retention") !== true
    || attempts[1]?.diagnostic?.statusCode !== 400
    || attempts[1]?.diagnostic?.providerName !== "OpenAI"
    || attempts[1]?.diagnostic?.providerUpstreamCode !== "invalid_json_schema"
    || attempts[2]?.diagnostic?.statusCode !== 400
    || attempts[2]?.diagnostic?.providerName !== "OpenAI"
    || attempts[2]?.diagnostic?.providerUpstreamCode !== "invalid_json_schema") {
    throw new Error("The carried reservations do not match the exact prior ZDR route rejection followed by two OpenAI schema rejections.");
  }
  assertArchivedParentChain({
    parentRunBytes: historicalParentRun,
    parentAttemptsBytes: historicalParentAttempts,
    parentDispatchesBytes: historicalParentDispatches,
    expectedParentRunSha256: String(parent.parentRunSha256),
    currentAttemptsPrefix: attempts.slice(0, 2),
    currentDispatchesPrefix: dispatches.entries.slice(0, 2),
  });
  const currentEntries = await readdir(input.runDirectory);
  if (currentEntries.some((entry) => entry !== DIAGNOSTIC_LOCK_NAME)) {
    throw new Error("The unique schema-correction output directory already contains state; refusing to overwrite or adopt it.");
  }

  const continuation: FictionalIfsDiagnosticContinuation = {
    ordinal: 3,
    reason: "owner_authorized_schema_correction_after_openai_schema_rejection",
    operatorFlag: SCHEMA_CORRECTION_CONTINUATION_FLAG,
    operatorDirective: "run requests for c01 and c02",
    priorRunSha256: FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256,
    priorRunFingerprint: null,
    priorRunArchiveFile: `history/prior-schema-rejection-run-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`,
    priorAttemptsArchiveFile: `history/prior-schema-rejection-attempts-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`,
    priorDispatchesArchiveFile: `history/prior-schema-rejection-dispatches-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`,
    priorPreflightArchiveFile: `history/prior-schema-rejection-preflight-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`,
    carriedUnknownAttemptIds: expectedAttemptIds,
    carriedUnknownReservationMicros: SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS,
    startedAt: input.now.toISOString(),
  };
  await Promise.all([
    writeImmutableArchive(path.join(input.runDirectory, continuation.priorRunArchiveFile), runBytes),
    writeImmutableArchive(path.join(input.runDirectory, continuation.priorAttemptsArchiveFile), attemptsBytes),
    writeImmutableArchive(path.join(input.runDirectory, continuation.priorDispatchesArchiveFile), dispatchesBytes),
    writeImmutableArchive(path.join(input.runDirectory, continuation.priorPreflightArchiveFile!), preflightBytes),
    writeImmutableArchive(path.join(input.runDirectory, "history/prior-schema-rejection-parent-run.json"), historicalParentRun),
    writeImmutableArchive(path.join(input.runDirectory, "history/prior-schema-rejection-parent-attempts.json"), historicalParentAttempts),
    writeImmutableArchive(path.join(input.runDirectory, "history/prior-schema-rejection-parent-dispatches.json"), historicalParentDispatches),
  ]);
  await Promise.all([
    atomicWrite(path.join(input.runDirectory, "attempts.json"), attemptsBytes.toString("utf8")),
    atomicWrite(path.join(input.runDirectory, "dispatches.json"), dispatchesBytes.toString("utf8")),
  ]);
  return { attempts, dispatches, continuation };
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
  let continuation: FictionalIfsDiagnosticContinuation | undefined;
  let carriedUnknownAttemptIds = new Set<string>();
  let manifestWriteAuthorized = false;
  try {
    const existing = await loadRun(runPath);
    const store = new FileQualificationAttemptStore(prepared.runDirectory);
    let dispatches = await readDispatchFile(dispatchFile);
    let priorAttempts = await store.list();
    if (invocation.outputLimit128kContinuation && existing) {
      if (existing.runFingerprint !== prepared.runFingerprint) throw new Error("The unique 128k output run already exists with different current pins; it cannot be repurposed or redispatched.");
      assertRunManifestDigest(existing);
      continuation = await validate128kOutputHistory({ runDirectory: prepared.runDirectory, existing, attempts: priorAttempts, dispatches });
      carriedUnknownAttemptIds = new Set(continuation.carriedUnknownAttemptIds);
      manifestWriteAuthorized = true;
    }
    if (invocation.outputLimit128kContinuation && !existing) {
      if (priorAttempts.length !== 0 || dispatches.entries.length !== 0) {
        throw new Error("The unique 128k output directory contains a partial journal without a run record; refusing to adopt or overwrite it.");
      }
      const seed = await seed128kOutputHistory({
        workspaceRoot: prepared.workspaceRoot,
        runDirectory: prepared.runDirectory,
        prepared,
        now: now(),
      });
      continuation = seed.continuation;
      carriedUnknownAttemptIds = new Set(seed.continuation.carriedUnknownAttemptIds);
      priorAttempts = [...seed.attempts];
      dispatches = seed.dispatches;
      manifestWriteAuthorized = true;
    }
    if (invocation.schemaCorrectionContinuation && existing && existing.runFingerprint !== prepared.runFingerprint) {
      throw new Error("The unique schema-correction run already exists with different current pins; it cannot be repurposed or redispatched.");
    }
    if (invocation.schemaCorrectionContinuation && !existing) {
      if (priorAttempts.length !== 0 || dispatches.entries.length !== 0) {
        throw new Error("The unique schema-correction directory contains a partial attempt journal; refusing to overwrite or adopt it.");
      }
      const seed = await seedSchemaCorrectionHistory({
        workspaceRoot: prepared.workspaceRoot,
        runDirectory: prepared.runDirectory,
        prepared,
        now: now(),
      });
      continuation = seed.continuation;
      carriedUnknownAttemptIds = new Set(seed.continuation.carriedUnknownAttemptIds);
      priorAttempts = [...seed.attempts];
      dispatches = seed.dispatches;
      manifestWriteAuthorized = true;
    } else if (invocation.schemaCorrectionContinuation && existing) {
      assertRunManifestDigest(existing);
      if (existing.continuation?.ordinal !== 3
        || existing.continuation.reason !== "owner_authorized_schema_correction_after_openai_schema_rejection"
        || existing.continuation.operatorFlag !== SCHEMA_CORRECTION_CONTINUATION_FLAG
        || existing.continuation.operatorDirective !== "run requests for c01 and c02"
        || existing.continuation.priorRunSha256 !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256
        || existing.continuation.priorAttemptsArchiveFile !== `history/prior-schema-rejection-attempts-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`
        || existing.continuation.priorDispatchesArchiveFile !== `history/prior-schema-rejection-dispatches-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`
        || existing.continuation.priorRunArchiveFile !== `history/prior-schema-rejection-run-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`
        || existing.continuation.priorPreflightArchiveFile !== `history/prior-schema-rejection-preflight-${FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256}.json`
        || existing.continuation.carriedUnknownReservationMicros !== SCHEMA_CORRECTION_PARENT_UNKNOWN_RESERVED_MICROS
        || existing.continuation.carriedUnknownAttemptIds.join("\n") !== [
          `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
          `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_DIAGNOSTIC_FRESH_BUDGET_EPOCH_2_RUN_ID}:C01:${OPENAI_NON_ZDR_CONTINUATION_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
          `pwrp71-fictional-diagnostic:${FICTIONAL_IFS_ERROR_DETAIL_RESEND_RUN_ID}:C01:${OPENAI_ERROR_DETAIL_RESEND_MARKER}:IFS:initial:${FICTIONAL_IFS_DIAGNOSTIC_REQUEST_LABEL}:attempt-1`,
        ].join("\n")
        || existing.authorization.schemaCorrectionContinuation?.priorRunSha256 !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256) {
        throw new Error("The existing run ID is not the exact schema-correction continuation and cannot be reused.");
      }
      const archivedAttemptsBytes = await readFile(path.join(prepared.runDirectory, existing.continuation.priorAttemptsArchiveFile));
      const archivedDispatchesBytes = await readFile(path.join(prepared.runDirectory, existing.continuation.priorDispatchesArchiveFile));
      const archivedPreflightBytes = await readFile(path.join(prepared.runDirectory, existing.continuation.priorPreflightArchiveFile));
      const [archivedHistoryRunBytes, archivedHistoryAttemptsBytes, archivedHistoryDispatchesBytes] = await Promise.all([
        readFile(path.join(prepared.runDirectory, "history/prior-schema-rejection-parent-run.json")),
        readFile(path.join(prepared.runDirectory, "history/prior-schema-rejection-parent-attempts.json")),
        readFile(path.join(prepared.runDirectory, "history/prior-schema-rejection-parent-dispatches.json")),
      ]);
      if (sha256Canonical(JSON.parse(archivedAttemptsBytes.toString("utf8"))) !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
        || sha256Canonical(JSON.parse(archivedDispatchesBytes.toString("utf8"))) !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256
        || sha256Canonical(JSON.parse(archivedPreflightBytes.toString("utf8"))) !== SCHEMA_CORRECTION_PARENT_PREFLIGHT_SHA256
        || sha256Canonical({ schemaVersion: 1, attempts: priorAttempts.slice(0, 3) }) !== SCHEMA_CORRECTION_PARENT_ATTEMPT_LEDGER_SHA256
        || sha256Canonical({ schemaVersion: 1, entries: dispatches.entries.slice(0, 3) }) !== SCHEMA_CORRECTION_PARENT_DISPATCHES_SHA256) {
        throw new Error("The resumed schema-correction journal no longer begins with the byte-pinned three unknown parent attempts and dispatch receipts.");
      }
      const archivedParentRun = JSON.parse(await readFile(path.join(prepared.runDirectory, existing.continuation.priorRunArchiveFile), "utf8")) as Record<string, unknown>;
      const archivedParentWithoutDigest = Object.fromEntries(Object.entries(archivedParentRun).filter(([key]) => key !== "runSha256"));
      if (archivedParentRun.runSha256 !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256
        || sha256Canonical(archivedParentWithoutDigest) !== FICTIONAL_IFS_SCHEMA_CORRECTION_PARENT_SHA256) {
        throw new Error("The resumed schema-correction run has lost its immutable parent record or active attempt journal.");
      }
      assertArchivedParentChain({
        parentRunBytes: archivedHistoryRunBytes,
        parentAttemptsBytes: archivedHistoryAttemptsBytes,
        parentDispatchesBytes: archivedHistoryDispatchesBytes,
        expectedParentRunSha256: "3959ea731dc6effa86703060023007bb1a9f97fbbb8a0c3eff1d0f0a0ea254c6",
        currentAttemptsPrefix: priorAttempts.slice(0, 2),
        currentDispatchesPrefix: dispatches.entries.slice(0, 2),
      });
      continuation = existing.continuation;
      carriedUnknownAttemptIds = new Set(continuation.carriedUnknownAttemptIds);
      manifestWriteAuthorized = true;
    }
    if (!existing && (invocation.continueAfterUnknownProviderAttempt || (invocation.allowNonZdrContinuation && !invocation.schemaCorrectionContinuation && !invocation.outputLimit128kContinuation))) {
      throw new Error("An explicitly authorized continuation requires the exact previously stopped default-routed run; it cannot authorize a fresh or different run.");
    }
    if (existing && existing.runFingerprint !== prepared.runFingerprint) {
      if (invocation.allowNonZdrContinuation) {
        continuation = validateEpoch2NonZdrContinuationParent({ existing, prepared, attempts: priorAttempts, dispatches, now: now() });
      } else if (invocation.continueAfterUnknownProviderAttempt) {
        continuation = validateLegacyContinuationParent({ existing, prepared, attempts: priorAttempts, dispatches, now: now() });
      } else {
        throw new Error("The fixed diagnostic run has different request pins; the explicit --continue-after-unknown-provider-attempt operator flag or separately authorized non-ZDR continuation flag is required to consider this changed request.");
      }
      await preserveLegacyRunSnapshot(prepared.runDirectory, continuation);
      carriedUnknownAttemptIds = new Set(continuation.carriedUnknownAttemptIds);
      manifestWriteAuthorized = true;
    } else if (existing) {
      assertRunManifestDigest(existing);
      continuation = existing.continuation;
      if (continuation) carriedUnknownAttemptIds = new Set(continuation.carriedUnknownAttemptIds);
      if (invocation.continueAfterUnknownProviderAttempt && !continuation) throw new Error("The continuation flag cannot be used to repeat a matching request or an unknown attempt without a changed OpenAI-only request identity.");
      if (invocation.allowNonZdrContinuation && !invocation.schemaCorrectionContinuation && !invocation.outputLimit128kContinuation && continuation?.ordinal !== 2) throw new Error("The non-ZDR continuation flag requires the already recorded ordinal-2 privacy continuation.");
      if (invocation.outputLimit128kContinuation && continuation?.ordinal !== 4) throw new Error("The 128k continuation flag requires its exact ordinal-4 parent lineage.");
      manifestWriteAuthorized = true;
    } else {
      manifestWriteAuthorized = true;
    }
    const newlyAuthorizedContinuation = Boolean(existing && continuation && existing.runFingerprint !== prepared.runFingerprint);
    const safePreDispatchRetry = Boolean(existing?.status === "diagnostic_stopped"
      && existing.results.length === 0
      && ((priorAttempts.length === 0 && dispatches.entries.length === 0)
        || (invocation.schemaCorrectionContinuation && continuation?.ordinal === 3
          && isExactSchemaCorrectionPreDispatchStop({
            run: existing,
            attempts: priorAttempts,
            dispatches,
            carriedUnknownAttemptIds,
          }))
        || (invocation.outputLimit128kContinuation && continuation?.ordinal === 4
          && isExact128kOutputPreDispatchStop({ run: existing, attempts: priorAttempts, dispatches, carriedUnknownAttemptIds }))));
    if (existing?.status === "diagnostic_complete" || existing?.status === "diagnostic_complete_with_prior_unknown_cost"
      || (existing?.status === "diagnostic_stopped" && !newlyAuthorizedContinuation && !safePreDispatchRetry)) return existing;

    if (safePreDispatchRetry && existing && (continuation?.ordinal === 3 || continuation?.ordinal === 4)) {
      const archiveFile = `history/pre-dispatch-stop-run-${existing.runSha256}.json`;
      const existingBytes = await readFile(runPath);
      const persisted = JSON.parse(existingBytes.toString("utf8")) as FictionalIfsDiagnosticRun;
      assertRunManifestDigest(persisted);
      if (persisted.runSha256 !== existing.runSha256) throw new Error("The pre-dispatch stop changed before its immutable retry receipt could be saved.");
      await writeImmutableArchive(path.join(prepared.runDirectory, archiveFile), existingBytes);
      continuation = {
        ...continuation,
        preDispatchStopRunArchives: [...new Set([...(continuation.preDispatchStopRunArchives ?? []), archiveFile])],
      };
    }

    let results: FictionalIfsDiagnosticReportResult[] = newlyAuthorizedContinuation
      ? []
      : [...(existing?.results ?? [])];
    const createdAt = existing?.createdAt ?? now().toISOString();
    let run = makeRun({ prepared, status: existing ? "running" : "prepared", createdAt, updatedAt: now().toISOString(), results, attempts: priorAttempts, dispatches, blockers: [], continuation });
    run = await saveRun(prepared.runDirectory, run);
    const uncarriedUnknownAttempts = priorAttempts.filter((attempt) => attempt.status !== "completed" && !carriedUnknownAttemptIds.has(attempt.attemptId));
    if (uncarriedUnknownAttempts.length) {
      const stopped = makeRun({
        prepared, status: "diagnostic_stopped", createdAt, updatedAt: now().toISOString(), results,
        attempts: priorAttempts, dispatches, blockers: ["A provider attempt has unknown or in-flight billing status. The reserved amount remains held and this diagnostic will not redispatch it."], continuation,
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
      const profileInvocationPrefix = `pwrp71-fictional-diagnostic:${prepared.runId}:${profile.fixture.profileId}`;
      const requestVariant = continuation?.ordinal === 3
        ? OPENAI_SCHEMA_CORRECTION_MARKER
        : continuation?.ordinal === 4
        ? OPENAI_128K_OUTPUT_MARKER
        : continuation?.ordinal === 2
        ? OPENAI_NON_ZDR_CONTINUATION_MARKER
        : continuation && profile.fixture.profileId === "C01" ? OPENAI_ROUTE_CONTINUATION_MARKER : undefined;
      const invocationPrefix = `${profileInvocationPrefix}${requestVariant ? `:${requestVariant}` : ""}:`;
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
        providerPolicy: invocation.allowNonZdrContinuation
          ? GPT6_LUNA_OPENAI_NON_ZDR_DIAGNOSTIC_PROVIDER_POLICY
          : GPT6_LUNA_OPENAI_DIAGNOSTIC_PROVIDER_POLICY,
        usageStatus: "reported",
        now,
        onResult: (_request, result) => {
          if (result.usage.model !== invocation.model) {
            throw new OpenRouterTransportError("protocol", `The fictional diagnostic requested ${invocation.model}, but the provider reported ${result.usage.model}.`, { retryable: false });
          }
        },
      });
      const modelPolicy = invocation.outputLimit128kContinuation
        ? { ...structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY), IFS: { ...UNQUALIFIED_MOCK_MODEL_POLICY.IFS, maxOutputTokens: FICTIONAL_IFS_128K_OUTPUT_LIMIT } }
        : structuredClone(UNQUALIFIED_MOCK_MODEL_POLICY);
      const generated = await generateCanonicalReport({
        reportType: "IFS",
        input: {} as JsonObject,
        packets: [profile.fixture.packet],
        provider: journaled,
        invocationKey: invocationPrefix.slice(0, -1),
        spentMicros: spentBefore,
        costCapMicros: invocation.aggregateCostCapMicros,
        modelPolicy,
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
      const stoppedDueUnknown = attempts.some((attempt) => attempt.status !== "completed" && !carriedUnknownAttemptIds.has(attempt.attemptId));
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
        continuation,
      });
      run = await saveRun(prepared.runDirectory, run);
      if (status === "diagnostic_stopped") break;
    }

    const attempts = await store.list();
    dispatches = await readDispatchFile(dispatchFile);
    const allAccepted = ["C01", "C02"].every((profileId) => results.some((result) => result.profileId === profileId && result.status === "accepted"));
    const hasUnresolvedNewAttempt = attempts.some((attempt) => attempt.status !== "completed" && !carriedUnknownAttemptIds.has(attempt.attemptId));
    const hasCarriedUnknown = attempts.some((attempt) => attempt.status !== "completed" && carriedUnknownAttemptIds.has(attempt.attemptId));
    const workComplete = allAccepted && !hasUnresolvedNewAttempt;
    const status: FictionalIfsDiagnosticRun["status"] = !workComplete
      ? "diagnostic_stopped"
      : hasCarriedUnknown ? "diagnostic_complete_with_prior_unknown_cost" : "diagnostic_complete";
    const blockers = status === "diagnostic_complete"
      ? []
      : status === "diagnostic_complete_with_prior_unknown_cost"
        ? ["Both requested reports completed. Prior unknown-cost reservations remain recorded in this budget journal; they were preserved and not retried."]
        : run.blockers.length ? run.blockers : [
          hasUnresolvedNewAttempt ? "A new provider attempt has unknown billing status; its reservation remains held and no retry was made." : "The approved C01/C02 diagnostic did not complete both accepted IFS outputs.",
        ];
    return await saveRun(prepared.runDirectory, makeRun({ prepared, status, createdAt, updatedAt: now().toISOString(), results, attempts, dispatches, blockers, continuation }));
  } catch (error) {
    if (!manifestWriteAuthorized) throw error;
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
        : attempts.length === 0 && dispatches.entries.length === 0
          ? `Pre-dispatch check failed: ${error instanceof Error ? error.message : "The diagnostic stopped before provider dispatch."}`
          : error instanceof Error ? error.message : "The diagnostic stopped after an unexpected operational error."],
      continuation,
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
    const expectedCallCap = checked.runId === FICTIONAL_IFS_128K_OUTPUT_RUN_ID
      ? FICTIONAL_IFS_128K_OUTPUT_CALL_CAP_MICROS
      : FICTIONAL_IFS_DIAGNOSTIC_LIMITS.maxCallCostMicros;
    const expectedOutputLimit = checked.runId === FICTIONAL_IFS_128K_OUTPUT_RUN_ID
      ? FICTIONAL_IFS_128K_OUTPUT_LIMIT
      : 20_000;
    if (consumedAttemptIds.has(checked.idempotencyKey)) throw new Error("This durable fictional diagnostic attempt has already crossed its one-use dispatch boundary.");
    const attempt = await input.store.get(checked.idempotencyKey);
    if (!attempt
      || attempt.status !== "started"
      || attempt.attemptId !== checked.idempotencyKey
      || attempt.endpoint !== String(request)
      || attempt.request.idempotencyKey !== checked.idempotencyKey
      || attempt.request.requestedModel !== checked.model
      || attempt.request.requestedReasoningEffort !== checked.reasoningEffort
      || attempt.request.maxOutputTokens !== expectedOutputLimit
      || !attempt.request.schemaName.startsWith("patternwork_ifs_pwrp71_")
      || attempt.maximumCallCostMicros !== expectedCallCap
      || attempt.aggregateCostCapMicros !== FICTIONAL_IFS_DIAGNOSTIC_LIMITS.aggregateCostCapMicros
      || attempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
      || !Number.isSafeInteger(attempt.reservedCostMicros)
      || (attempt.reservedCostMicros ?? 0) <= 0
      || (attempt.reservedCostMicros ?? Number.POSITIVE_INFINITY) > expectedCallCap
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
      ...(checked.requestVariant ? { requestVariant: checked.requestVariant } : {}),
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
