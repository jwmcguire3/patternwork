import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  PWQE5_PROMPT_RELEASE,
  PWQE5_ROUTER_RELEASE,
  PWQE5_SOURCE_RELEASE,
  PWQE5_CONSENT_VERSION,
  loadPwqe5SourceManifest,
  loadPwqe5SourcePackage,
  loadStructuredInstrumentManifest,
} from "@/lib/question-engine";
import {
  constantTimeEqual,
  decryptJson,
  decryptString,
  emailLookupHash,
  encryptJson,
  encryptString,
  encryptionKeyringFromEnv,
  normalizeEmail,
  issueScopedAccessToken,
  scopedAccessTokenHash,
  sha256,
  type EncryptionKeyring,
} from "@/lib/server/security";
import { AssessmentError } from "./errors.ts";
import { getResumeLinkDelivery, type ResumeLinkDelivery } from "./link-delivery.ts";
import { pauseRoutingState, resumeRoutingState, routeAssessmentResponse, toAssessmentStateView } from "./routing.ts";
import { abandonedRetentionExpiresAt, completedRetentionExpiresAt, planExpiredAssessmentDeletion } from "./retention.ts";
import type { AssessmentPass, AssessmentResponseInput, AssessmentRoutingState } from "./types.ts";
import { defaultWorkflowEnqueuer, type WorkflowEnqueuer } from "./workflow-adapter.ts";
import { deriveTrustedEvidenceForAuthoredResponse, referencedLibraries, trustedEvidenceJson } from "./trusted-evidence.ts";
import { createReportAttemptWithClient, isCompleteActiveReportSet, type AttemptTransaction } from "../reports/attempts.ts";
import { assertPwqe6ReportActivationReady } from "../reports/pwqe6-readiness.ts";
import { dispatchReportAttemptNotification, notificationIdempotencyKey, PrismaNotificationDelivery, type NotificationDispatchBoundary } from "../notifications/index.ts";
import { normalCompletionBoundary } from "./completion-boundary.ts";
import { buildPwqe6RouterPacket } from "../reports/pwqe6-packet.ts";
import { loadPwqe5SourcePackage as loadPwqe6SourcePackage } from "../reports/pwqe6-source.ts";
import {
  advancePwqe5Session,
  beginPwqe5Correction,
  canCompletePwqe5Pass,
  createPwqe5SessionState,
  endPwqe5Session,
  isPwqe5SessionState,
  pausePwqe5Session,
  renderPwqe5Interaction,
  pwqe5StageForState,
  shortenPwqe5Session,
  startPwqe5Deepening,
  type Pwqe5SessionState,
} from "./pwqe5-session.ts";
import { PWQE51_RELEASE_IDENTITY, PWQE51_SOURCE_MANIFEST_SHA256, loadPwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import { assertPwrp71ReportActivationReady } from "../reports/pwrp71-readiness.ts";
import { buildPwqe51RouterPacket } from "../reports/pwqe51-packet.ts";
import {
  advancePwqe51Session,
  beginPwqe51Correction,
  canCompletePwqe51Pass,
  createPwqe51SessionState,
  endPwqe51Session,
  isPwqe51SessionState,
  pausePwqe51Session,
  pwqe51FocusChoices,
  renderPwqe51Interaction,
  resumePwqe51Session,
  shortenPwqe51Session,
  startPwqe51Deepening,
  type Pwqe51SessionState,
} from "./pwqe51-session.ts";

const ACCESS_TOKEN_SCOPE = "RESUME_ASSESSMENT" as const;

type Database = PrismaClient;

export interface AssessmentServiceDependencies {
  readonly db?: Database;
  readonly keyring?: EncryptionKeyring;
  readonly emailHmacKey?: Uint8Array;
  readonly delivery?: ResumeLinkDelivery;
  readonly enqueueWorkflow?: WorkflowEnqueuer;
  readonly now?: () => Date;
  readonly reportReadiness?: () => Promise<void>;
  readonly pwqe5Activation?: () => Promise<unknown>;
  readonly notificationDelivery?: NotificationDispatchBoundary;
  readonly reportAttemptNotification?: (attemptId: string, type: "REPORT_STARTED" | "REPORT_FAILED") => Promise<unknown>;
}

function deps(input: AssessmentServiceDependencies = {}) {
  const pwqe5Activation = input.pwqe5Activation ?? (async () => assertPwqe6ReportActivationReady());
  return {
    db: input.db ?? prisma,
    keyring: input.keyring ?? encryptionKeyringFromEnv(),
    emailHmacKey: input.emailHmacKey,
    delivery: input.delivery,
    notificationDelivery: input.notificationDelivery ?? new PrismaNotificationDelivery(),
    enqueueWorkflow: input.enqueueWorkflow ?? defaultWorkflowEnqueuer,
    now: input.now ?? (() => new Date()),
    pwqe5Activation,
    reportReadiness: input.reportReadiness ?? (async () => { await pwqe5Activation(); }),
    reportAttemptNotification: input.reportAttemptNotification ?? dispatchReportAttemptNotification,
  };
}

function asEncrypted(row: { stateCiphertext: Uint8Array; stateNonce: Uint8Array; encryptionKeyVersion: string }) {
  return { ciphertext: Buffer.from(row.stateCiphertext), nonce: Buffer.from(row.stateNonce), keyVersion: row.encryptionKeyVersion };
}

function prismaBytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(value);
}

function statePurpose(sessionId: string) { return `patternwork:assessment-state:${sessionId}`; }
function emailPurpose(sessionId: string) { return `patternwork:assessment-email:${sessionId}`; }
function responsePurpose(sessionId: string, interactionInstanceId: string) { return `patternwork:assessment-response:${sessionId}:${interactionInstanceId}`; }
function snapshotPurpose(sessionId: string, completedPass: number) { return `patternwork:assessment-snapshot:${sessionId}:pass-${completedPass}`; }

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

let structuredManifestPromise: ReturnType<typeof loadStructuredInstrumentManifest> | undefined;
async function authoredInteraction(current: AssessmentRoutingState["currentInteraction"]) {
  if (!current) return null;
  structuredManifestPromise ??= loadStructuredInstrumentManifest();
  const manifest = await structuredManifestPromise;
  const definition = manifest.itemById.get(current.bankItemId);
  if (!definition) return current;
  return {
    ...current,
    intensity: Math.min(3, Math.max(0, definition.burden.numericIntensity ?? current.intensity)) as 0 | 1 | 2 | 3,
    authored: {
      prompt: definition.prompt,
      mechanic: definition.mechanic,
      eligibility: definition.eligibility,
      burden: definition.burden,
      optionGroups: definition.optionGroups,
      responseLibraries: referencedLibraries(manifest, definition.responseLibraryReferences, definition.responseLibraryIds)
        .map((library) => ({ libraryId: library.libraryId, title: library.title, options: library.options })),
      limits: definition.limits,
      recovery: definition.recovery,
    },
  };
}

const OPTION_TOKEN = /^(?:(?:OPT-|OL-)[A-Za-z0-9._-]+|(?:AG|AT|AU|BASE|BL|CF|CI|CR|CRG|DOWN|FO|IR|MIX|OM|RG|RI|RP|UN|UP)-[A-Z0-9._-]+)$/iu;
const SECTION_CODE = /^(?:IFS-(?:0[1-9]|1[0-2])|PV-(?:0[1-9]|1[01])|ATT-(?:0[1-9]|1[0-2]))$/u;
const OPTION_ARRAY_FIELDS = new Set(["choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds"]);
const OPTION_FIELDS = new Set(["Before", "When it first hit", "What happened next", "Later / aftermath", "Person / role 1", "Person / role 2", "Contact frequency", "Emotional disclosure", "Asking for help", "Space", "referentOptionId", "windowOptionId"]);

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

/** Default-deny response normalization. Unknown values remain private only when explicitly sent as privateNote. */
export function normalizeTypedAssessmentResponse(value: unknown, bankItemId?: string): Prisma.JsonObject {
  const root = object(value) ?? {};
  const candidate = root.schemaVersion === "PWRS-1" ? object(root.semantic) ?? {} : root;
  const semantic: Record<string, Prisma.JsonValue> = {};
  for (const [key, raw] of Object.entries(candidate)) {
    if (OPTION_ARRAY_FIELDS.has(key) && Array.isArray(raw)) semantic[key] = raw.filter((entry): entry is string => typeof entry === "string" && OPTION_TOKEN.test(entry));
    else if (OPTION_FIELDS.has(key) && typeof raw === "string" && OPTION_TOKEN.test(raw)) semantic[key] = raw;
    else if (key === "coverageSectionCodes" && Array.isArray(raw)) semantic[key] = raw.filter((entry): entry is string => typeof entry === "string" && SECTION_CODE.test(entry));
    else if (key === "safetyContext" && ["safe", "mixed", "unsafe", "unknown"].includes(String(raw))) semantic[key] = raw as string;
    else if (key === "userArousal" && ["low", "unknown", "elevated", "high"].includes(String(raw))) semantic[key] = raw as string;
    else if (key === "timeHorizon" && ["anticipatory", "immediate", "aftermath", "multi_horizon", "uncertain"].includes(String(raw))) semantic[key] = raw as string;
    else if (key === "evidenceDisposition" && ["observed", "missing"].includes(String(raw))) semantic[key] = raw as string;
    else if (key === "certainty" && typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1) semantic[key] = raw;
    else if (["resourceSafetyClear", "quotePermission", "eligible"].includes(key) && typeof raw === "boolean") semantic[key] = raw;
  }
  return {
    schemaVersion: "PWRS-1",
    ...(typeof bankItemId === "string" ? { bankItemId } : {}),
    semantic,
    ...(root.schemaVersion === "PWRS-1" && typeof root.privateNote === "string" ? { privateNote: root.privateNote } : typeof root.note === "string" ? { privateNote: root.note } : {}),
  } as Prisma.JsonObject;
}

export function responseSafetySignals(value: unknown): { userArousal: "low" | "unknown" | "elevated" | "high"; unsafeContext: boolean; resourceSafetyClear: boolean } {
  const semantic = object(object(value)?.semantic);
  const userArousal = semantic?.userArousal;
  return {
    userArousal: userArousal === "low" || userArousal === "elevated" || userArousal === "high" ? userArousal : "unknown",
    unsafeContext: semantic?.safetyContext === "unsafe",
    resourceSafetyClear: semantic?.resourceSafetyClear === true,
  };
}

function normalizePwqe5ResponsePayload(value: unknown): {
  readonly status: "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
  readonly mode: "single" | "simultaneous" | "order_unknown" | "ordered";
  readonly selectedOptionIds: readonly string[];
  readonly privateNote?: string;
} {
  const root = object(value);
  if (root?.schemaVersion !== "PWQE5-RS-1") throw new AssessmentError("invalid", "Response does not use the PWQE 5 response contract.");
  if (!["answered", "none_fit", "not_sure", "no_event", "not_applicable", "skip"].includes(String(root.status))) {
    throw new AssessmentError("invalid", "Response status is not supported by the PWQE 5 contract.");
  }
  if (!["single", "simultaneous", "order_unknown", "ordered"].includes(String(root.mode))) {
    throw new AssessmentError("invalid", "Response mode is not supported by the PWQE 5 contract.");
  }
  const status = root.status as "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
  const mode = root.mode as "single" | "simultaneous" | "order_unknown" | "ordered";
  if (!Array.isArray(root.selectedOptionIds) || root.selectedOptionIds.some((id) => typeof id !== "string")) {
    throw new AssessmentError("invalid", "Selected options must be an array of authored option IDs.");
  }
  const selectedOptionIds = root.selectedOptionIds as string[];
  if (new Set(selectedOptionIds).size !== selectedOptionIds.length) throw new AssessmentError("invalid", "A response cannot select the same option more than once.");
  if (status !== "answered" && selectedOptionIds.length > 0) throw new AssessmentError("invalid", "A missing response cannot include selected options.");
  if (mode === "single" && selectedOptionIds.length > 1) throw new AssessmentError("invalid", "A single-choice response cannot select multiple options.");
  if (root.privateNote !== undefined && (typeof root.privateNote !== "string" || root.privateNote.length > 8_000)) {
    throw new AssessmentError("invalid", "Private notes must be text of at most 8,000 characters.");
  }
  return {
    status,
    mode,
    selectedOptionIds,
    ...(typeof root.privateNote === "string" && root.privateNote.trim() ? { privateNote: root.privateNote } : {}),
  };
}

function validatePwqe5AuthoredSelection(
  question: unknown,
  status: "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip",
  mode: "single" | "simultaneous" | "order_unknown" | "ordered",
  selectedOptionIds: readonly string[],
): void {
  if (status !== "answered") return;
  const selection = object(object(question)?.selection) ?? {};
  const maxSelect = typeof selection.max_select === "number" && Number.isSafeInteger(selection.max_select)
    ? selection.max_select
    : 1;
  if (selectedOptionIds.length > maxSelect) throw new AssessmentError("invalid", "Response exceeds the authored selection limit.");
  if (mode === "simultaneous" && selection.allow_simultaneous_pair !== true) {
    throw new AssessmentError("invalid", "This question does not permit a simultaneous selection.");
  }
  if ((mode === "ordered" || mode === "order_unknown") && selection.mode !== "partial_order") {
    throw new AssessmentError("invalid", "This question does not permit a partial-order response.");
  }
  if ((mode === "ordered" || mode === "order_unknown") && selectedOptionIds.length < 2) {
    throw new AssessmentError("invalid", "A partial-order response must include at least two selected options.");
  }
}

const DEFAULT_HORIZON_BY_FAMILY: Readonly<Record<string, "anticipatory" | "immediate" | "aftermath" | "multi_horizon" | "uncertain">> = {
  BDA: "multi_horizon", BTM: "immediate", FSR: "immediate", RRE: "aftermath", RSR: "aftermath", SEF: "aftermath", VFR: "anticipatory", WMA: "anticipatory",
};

export async function enrichResponseFromAuthoredContract(response: Prisma.JsonObject, bankItemId: string, bankItemVersion: string, trustedReferentOptionId?: string): Promise<Prisma.JsonObject> {
  structuredManifestPromise ??= loadStructuredInstrumentManifest();
  const manifest = await structuredManifestPromise;
  const definition = manifest.itemById.get(bankItemId);
  const semantic = { ...(object(response.semantic) ?? {}) } as Record<string, Prisma.JsonValue>;
  if (!Array.isArray(semantic.coverageSectionCodes) || semantic.coverageSectionCodes.length === 0) semantic.coverageSectionCodes = [...(definition?.supportedReportSections ?? [])];
  if (typeof semantic.eligible !== "boolean") semantic.eligible = true;
  if (typeof semantic.timeHorizon !== "string") semantic.timeHorizon = DEFAULT_HORIZON_BY_FAMILY[definition?.family ?? ""] ?? "uncertain";
  delete semantic.referentOptionId;
  if (semantic.evidenceDisposition !== "missing") {
    const selected = Array.isArray(semantic.choices) ? semantic.choices.filter((value): value is string => typeof value === "string") : [];
    const authoredOptions = [
      ...(definition?.optionGroups.flatMap((group) => group.options).map((option) => ({ optionId:option.optionId, authored:option.authored, label:option.label })) ?? []),
      ...(definition?.responseLibraryIds.flatMap((libraryId) => manifest.responseLibraryById.get(libraryId)?.options ?? []).map((option) => ({ ...option, authored:option.optionId })) ?? []),
    ];
    const missingIds = new Set(authoredOptions.filter((option) => /(?:^|[_ -])(?:not[_ -]?sure|no[_ -]?memory|skip)(?:[_ -]|$)/iu.test(`${option.optionId} ${option.authored} ${option.label}`)).map((option) => option.optionId));
    const substantiveOther = Object.entries(semantic).some(([key, value]) => ["rank", "zones", "relationship", "Before", "When it first hit", "What happened next", "Later / aftermath"].includes(key) && (Array.isArray(value) ? value.length > 0 : Boolean(value)));
    semantic.evidenceDisposition = selected.length > 0 && selected.every((id) => missingIds.has(id) || /not-sure|no-memory|skip/iu.test(id)) && !substantiveOther ? "missing" : "observed";
  }
  const normalized = { ...response, semantic } as Prisma.JsonObject;
  const trustedEvidence = await deriveTrustedEvidenceForAuthoredResponse(bankItemId, bankItemVersion, normalized as unknown as import("../../question-engine/types.ts").JsonObject, trustedReferentOptionId);
  if (trustedEvidence?.referentOptionId) semantic.referentOptionId = trustedEvidence.referentOptionId;
  return { ...response, semantic, ...(trustedEvidence ? { trustedEvidence: trustedEvidenceJson(trustedEvidence) } : {}) } as Prisma.JsonObject;
}

export function establishedReferentFromRoutingState(state: AssessmentRoutingState): string | undefined {
  return [...state.completedInteractions].reverse()
    .map((entry) => entry as typeof entry & { evidenceEligible?: boolean; referentId?: string })
    .find((entry) => entry.family === "RL" && entry.completionState === "COMPLETED" && entry.evidenceEligible === true && typeof entry.referentId === "string")?.referentId;
}

export function trustedResponseOrderFromResponse(response: unknown): string[] {
  const selectedOptionIds = object(object(response)?.trustedEvidence)?.selectedOptionIds;
  return Array.isArray(selectedOptionIds)
    ? selectedOptionIds.filter((value): value is string => typeof value === "string" && OPTION_TOKEN.test(value))
    : [];
}

export function reportArtifactUrl(assessmentSessionId: string, reportId?: string): string {
  return `/reports/${encodeURIComponent(assessmentSessionId)}${reportId ? `#${encodeURIComponent(reportId)}` : ""}`;
}

async function ensurePwqe5SourceRelease(database: Database) {
  const manifest = await loadPwqe5SourceManifest();
  const pinnedSource = await loadPwqe6SourcePackage();
  const manifestSha = pinnedSource.sourceManifestSha256;
  return database.patternworkV31SourceRelease.upsert({
    where: { sourceManifestSha256: manifestSha },
    update: {},
    create: {
      contractId: PWQE5_SOURCE_RELEASE,
      integrityContractId: "patternwork-router-evidence-v1",
      packageVersion: PWQE5_ROUTER_RELEASE,
      promptRelease: PWQE5_PROMPT_RELEASE,
      sourceManifestSha256: manifestSha,
      sourceManifestJson: manifest as unknown as Prisma.InputJsonValue,
    },
  });
}

async function ensurePwqe51SourceRelease(database: Database) {
  const source = await loadPwqe51SourcePackage();
  return database.patternworkV31SourceRelease.upsert({
    where: { sourceManifestSha256: PWQE51_SOURCE_MANIFEST_SHA256 },
    update: {},
    create: {
      contractId: PWQE51_RELEASE_IDENTITY.questionRelease,
      integrityContractId: "patternwork-router-evidence-v1",
      packageVersion: PWQE51_RELEASE_IDENTITY.routerVersion,
      promptRelease: PWQE51_RELEASE_IDENTITY.questionRelease,
      sourceManifestSha256: PWQE51_SOURCE_MANIFEST_SHA256,
      sourceManifestJson: source.manifest as unknown as Prisma.InputJsonValue,
    },
  });
}

export const PWQE51_CONSENT_VERSION = PWQE5_CONSENT_VERSION;
const PWQE51_ASSESSMENT_KEY = "patternwork-pwqe51" as const;
const PWQE51_DETAIL_PERMISSIONS = new Set(["state", "body", "urge", "feeling", "texture", "recurrence", "contrast"]);

export interface Pwqe51PassTwoContextInput {
  readonly focusOccurrenceRefs?: readonly string[];
  readonly detailPermissions?: readonly string[];
  readonly comparisonDecisions?: readonly {
    readonly firstRef: string;
    readonly secondRef: string;
    readonly relation: "different" | "same" | "cannot_tell";
  }[];
}

function focusOccurrenceRef(sessionId: string, occurrenceId: string): string {
  return `focus_${sha256(`${sessionId}:${occurrenceId}`).slice(0, 20)}`;
}

export function resolvePwqe51PassTwoContext(sessionId: string, state: Pwqe51SessionState, input: Pwqe51PassTwoContextInput = {}) {
  const choices = pwqe51FocusChoices(state);
  const occurrenceByRef = new Map(choices.map((choice) => [focusOccurrenceRef(sessionId, choice.occurrenceId), choice.occurrenceId]));
  const resolveRef = (ref: unknown): string => {
    if (typeof ref !== "string" || !occurrenceByRef.has(ref)) throw new AssessmentError("invalid", "Pass-two focus reference is stale or unavailable.");
    return occurrenceByRef.get(ref)!;
  };
  const focusRefs = input.focusOccurrenceRefs ?? [];
  const details = input.detailPermissions ?? [];
  const decisions = input.comparisonDecisions ?? [];
  if (!Array.isArray(focusRefs) || focusRefs.some((ref) => typeof ref !== "string") || new Set(focusRefs).size !== focusRefs.length) {
    throw new AssessmentError("invalid", "Pass-two focus selections are malformed.");
  }
  if (!Array.isArray(details) || details.some((detail) => typeof detail !== "string" || !PWQE51_DETAIL_PERMISSIONS.has(detail)) || new Set(details).size !== details.length) {
    throw new AssessmentError("invalid", "Pass-two detail permissions are outside the authored controls.");
  }
  if (!Array.isArray(decisions)) throw new AssessmentError("invalid", "Pass-two comparison decisions are malformed.");
  const resolvedDecisions: { firstOccurrenceId: string; secondOccurrenceId: string; relation: "different" | "same" | "cannot_tell" }[] = [];
  const resolvedPairs: [string, string][] = [];
  const pairKeys = new Set<string>();
  for (const decision of decisions) {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)
      || Object.keys(decision).sort().join("\u0000") !== ["firstRef", "relation", "secondRef"].join("\u0000")
      || !["different", "same", "cannot_tell"].includes(decision.relation)) {
      throw new AssessmentError("invalid", "Pass-two comparison decisions are malformed.");
    }
    const first = resolveRef(decision.firstRef);
    const second = resolveRef(decision.secondRef);
    if (first === second) throw new AssessmentError("invalid", "An occasion cannot be marked distinct from itself.");
    const key = [first, second].sort().join("\u0000");
    if (pairKeys.has(key)) throw new AssessmentError("invalid", "Pass-two comparison decisions contain a duplicate pair.");
    pairKeys.add(key);
    const relation = decision.relation as "different" | "same" | "cannot_tell";
    resolvedDecisions.push({ firstOccurrenceId: first, secondOccurrenceId: second, relation });
    if (relation === "different") resolvedPairs.push([first, second]);
  }
  return {
    focusOccurrences: focusRefs.map(resolveRef),
    details: [...details],
    distinctPairs: resolvedPairs,
    comparisonDecisions: resolvedDecisions,
  } as const;
}

/** Candidate selector used by the start route: any partial/present manifest fails closed. */
export async function pwqe51CandidateConfigured(): Promise<boolean> {
  const hasManifest = process.env.PWRP71_QUALIFICATION_MANIFEST_JSON !== undefined || process.env.PWRP71_QUALIFICATION_MANIFEST_SHA256 !== undefined;
  if (!hasManifest) return false;
  await assertPwqe51Ready();
  return true;
}

async function assertPwqe51Ready(): Promise<Awaited<ReturnType<typeof assertPwrp71ReportActivationReady>>> {
  try { return await assertPwrp71ReportActivationReady(); }
  catch { throw new AssessmentError("report_unavailable", "PWQE 5.1 / PWRP 7.1 is unavailable until its reviewed qualification manifest is configured."); }
}

function pwqe51Stage(state: Pwqe51SessionState): string {
  return state.phase === "finished" ? "finished" : state.phase;
}

async function pwqe51StateView(client: Database | Prisma.TransactionClient, session: Awaited<ReturnType<Database["patternworkV31AssessmentSession"]["findUniqueOrThrow"]>>, state: Pwqe51SessionState, keyring: EncryptionKeyring) {
  const source = await loadPwqe51SourcePackage();
  const currentResponse = state.currentInteraction
    ? await client.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_interaction: { assessmentSessionId: session.id, interactionInstanceId: state.currentInteraction.interactionInstanceId } } })
    : null;
  const saved = currentResponse ? decryptJson<{ response: Prisma.JsonValue }>({ ciphertext: Buffer.from(currentResponse.responseCiphertext), nonce: Buffer.from(currentResponse.responseNonce), keyVersion: currentResponse.encryptionKeyVersion }, responsePurpose(session.id, currentResponse.interactionInstanceId), keyring) : null;
  const questions = new Map(source.questionBank.items.map((question) => [question.id, question]));
  const variants = new Map(source.questionBank.variants.map((variant) => [variant.id, variant]));
  const superseded = new Set(state.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
  return {
    engine: "PWQE51" as const,
    schemaVersion: state.schemaVersion,
    sessionId: session.id,
    status: session.status as "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED",
    revision: session.optimisticRevision,
    pass: state.pass,
    stage: pwqe51Stage(state),
    safeResumeStage: pwqe51Stage(state),
    currentInteraction: renderPwqe51Interaction(state, source),
    canCompletePass: canCompletePwqe51Pass(state),
    canPause: true as const,
    completedCount: state.responses.length,
    optedInTopics: state.optedInTopics,
    availableFocuses: pwqe51FocusChoices(state).map((choice) => ({ ref: focusOccurrenceRef(session.id, choice.occurrenceId), label: choice.label })),
    responseHistory: state.responses.filter((response) => !superseded.has(response.responseId)).map((response) => {
      const question = questions.get(response.questionId);
      const variant = response.variantId ? variants.get(response.variantId) : undefined;
      const options = variant && question && variant.replaces === question.id ? variant.options : question?.options ?? [];
      const selected = new Set(response.selectedOptionIds ?? []);
      return {
        responseId: response.responseId,
        questionId: response.questionId,
        occurrenceId: response.occurrenceId,
        stepId: response.stepId ?? question?.step_binding ?? "first",
        basis: response.basis,
        title: question?.title ?? response.questionId,
        context: question?.context ?? question?.episode_family ?? "",
        prompt: variant?.replaces === response.questionId ? variant.prompt ?? question?.prompt ?? "" : question?.prompt ?? "",
        selection: question?.selection ?? {},
        options: options.map((option) => ({ id: option.id, label: option.text, exclusive: option.exclusive === true })),
        status: response.status,
        mode: response.mode,
        selectedOptions: options.filter((option) => selected.has(option.id)).map((option) => ({ id: option.id, label: option.text })),
        canCorrect: !state.paused && state.phase !== "finished",
      };
    }),
    allowedControls: state.phase === "finished" ? [] as const : state.pass === 2 ? ["shorten", "end"] as const : ["end"] as const,
    availableTopics: Array.isArray(source.routingTargets.entry_points) ? source.routingTargets.entry_points.map((entry) => ({ id: String(entry.id ?? ""), label: String(entry.label ?? entry.title ?? entry.id ?? ""), description: typeof entry.description === "string" ? entry.description : "" })).filter((entry) => entry.id && entry.label) : [],
    currentResponse: currentResponse && saved ? { completionState: currentResponse.completionState as "PARTIAL" | "COMPLETED" | "SKIPPED", response: saved.response, responseOrder: Array.isArray(currentResponse.responseOrderJson) ? currentResponse.responseOrderJson.filter((entry): entry is string => typeof entry === "string") : [] } : null,
    reportStatus: "NOT_STARTED" as const,
    reportReadyUrl: null,
    deliveryStatus: "NOT_STARTED" as const,
    resumeNotificationStatus: "NOT_STARTED" as const,
  };
}

function validatePwqe5OptedInTopics(source: Awaited<ReturnType<typeof loadPwqe5SourcePackage>>, requested: readonly string[] = []): readonly string[] {
  const authoredIds = new Set(Array.isArray(source.routingTargets.entry_points)
    ? (source.routingTargets.entry_points as readonly Record<string, unknown>[]).map((entry) => String(entry.id ?? "")).filter(Boolean)
    : []);
  if (requested.some((topic) => typeof topic !== "string" || !authoredIds.has(topic))) {
    throw new AssessmentError("invalid", "Deepening opt-in includes a topic outside the authored entry points.");
  }
  return [...new Set(requested)];
}

async function createAccessToken(database: Database | Prisma.TransactionClient, assessmentSessionId: string, now: Date, scope: "RESUME_ASSESSMENT" | "VIEW_REPORT" = ACCESS_TOKEN_SCOPE) {
  const issued = issueScopedAccessToken(scope, now);
  await database.patternworkV31AccessToken.create({ data: { assessmentSessionId, tokenHash: issued.tokenHash, purpose: scope, expiresAt: issued.expiresAt } });
  return issued;
}

function resumeUrl(baseUrl: string, token: string): string {
  const url = new URL("/api/assessment/resume", baseUrl);
  url.searchParams.set("token", token);
  return url.toString();
}

async function deliverResumeNotification(input: { assessmentSessionId: string; email: string; actionUrl: string; tokenHash: string }, boundary: NotificationDispatchBoundary): Promise<"SENT" | "FAILED"> {
  try {
    const record = await boundary.create({ assessmentSessionId: input.assessmentSessionId, type: "RESUME_LINK", idempotencyKey: notificationIdempotencyKey({ type: "RESUME_LINK", subjectId: input.tokenHash }), email: input.email, actionUrl: input.actionUrl });
    await boundary.dispatch(record.id);
    return "SENT";
  }
  catch { return "FAILED"; }
}

export async function startAssessment(
  input: { email: string; consentVersion: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, emailHmacKey, delivery, notificationDelivery, now, pwqe5Activation } = deps(dependencies);
  if (input.consentVersion !== PWQE5_CONSENT_VERSION) throw new AssessmentError("invalid", "Consent must be accepted for the current assessment release.");
  try { await pwqe5Activation(); }
  catch { throw new AssessmentError("report_unavailable", "This assessment release is not available until its source and provider qualification have been reviewed."); }
  const timestamp = now();
  const email = normalizeEmail(input.email);
  const source = await loadPwqe5SourcePackage();
  const sourceRelease = await ensurePwqe5SourceRelease(db);
  const sessionId = `pwas_${randomUUID()}`;
  const state = createPwqe5SessionState(source);
  const encryptedState = encryptJson(state, statePurpose(sessionId), keyring);
  const encryptedEmail = encryptString(email, emailPurpose(sessionId), keyring);
  const session = await db.patternworkV31AssessmentSession.create({
    data: {
      id: sessionId,
      contactEmailHash: emailLookupHash(email, emailHmacKey),
      contactEmailCiphertext: prismaBytes(encryptedEmail.ciphertext),
      contactEmailNonce: prismaBytes(encryptedEmail.nonce),
      sourceReleaseId: sourceRelease.id,
      assessmentKey: "patternwork-pwqe5",
      consentVersion: input.consentVersion,
      consentedAt: timestamp,
      status: "IN_PROGRESS",
      currentPass: 1,
      currentStage: pwqe5StageForState(state),
      safeResumeStage: pwqe5StageForState(state),
      stateCiphertext: prismaBytes(encryptedState.ciphertext),
      stateNonce: prismaBytes(encryptedState.nonce),
      encryptionKeyVersion: encryptedState.keyVersion,
      expiresAt: abandonedRetentionExpiresAt(timestamp),
      retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
    },
  });
  const access = await createAccessToken(db, session.id, timestamp);
  const actionUrl = resumeUrl(input.baseUrl, access.token);
  const notificationStatus = delivery
    ? await delivery.deliver({ email, resumeUrl: actionUrl, expiresAt: access.expiresAt }).then(() => "SENT" as const, () => "FAILED" as const)
    : await deliverResumeNotification({ assessmentSessionId: session.id, email, actionUrl, tokenHash: access.tokenHash }, notificationDelivery);
  return { sessionId: session.id, state: await hydrateStateView(db, session, state, keyring), notificationStatus };
}

/** Starts a source-pinned candidate session; it is unavailable until PWRP 7.1 readiness passes. */
export async function startPwqe51Assessment(
  input: { email: string; consentVersion: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, emailHmacKey, delivery, notificationDelivery, now } = deps(dependencies);
  await assertPwqe51Ready();
  if (input.consentVersion !== PWQE51_CONSENT_VERSION) throw new AssessmentError("invalid", "Consent must be accepted for the current assessment release.");
  const timestamp = now();
  const email = normalizeEmail(input.email);
  const source = await loadPwqe51SourcePackage();
  const sourceRelease = await ensurePwqe51SourceRelease(db);
  const sessionId = `pwas_${randomUUID()}`;
  const state = createPwqe51SessionState(source);
  const encryptedState = encryptJson(state, statePurpose(sessionId), keyring);
  const encryptedEmail = encryptString(email, emailPurpose(sessionId), keyring);
  const session = await db.patternworkV31AssessmentSession.create({
    data: {
      id: sessionId,
      contactEmailHash: emailLookupHash(email, emailHmacKey),
      contactEmailCiphertext: prismaBytes(encryptedEmail.ciphertext),
      contactEmailNonce: prismaBytes(encryptedEmail.nonce),
      sourceReleaseId: sourceRelease.id,
      assessmentKey: PWQE51_ASSESSMENT_KEY,
      consentVersion: input.consentVersion,
      consentedAt: timestamp,
      status: "IN_PROGRESS",
      currentPass: 1,
      currentStage: pwqe51Stage(state),
      safeResumeStage: pwqe51Stage(state),
      stateCiphertext: prismaBytes(encryptedState.ciphertext),
      stateNonce: prismaBytes(encryptedState.nonce),
      encryptionKeyVersion: encryptedState.keyVersion,
      expiresAt: abandonedRetentionExpiresAt(timestamp),
      retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
    },
  });
  const access = await createAccessToken(db, session.id, timestamp);
  const actionUrl = resumeUrl(input.baseUrl, access.token);
  const notificationStatus = delivery
    ? await delivery.deliver({ email, resumeUrl: actionUrl, expiresAt: access.expiresAt }).then(() => "SENT" as const, () => "FAILED" as const)
    : await deliverResumeNotification({ assessmentSessionId: session.id, email, actionUrl, tokenHash: access.tokenHash }, notificationDelivery);
  return { sessionId: session.id, state: await pwqe51StateView(db, session, state, keyring), notificationStatus };
}

export async function getPwqe51AssessmentState(sessionId: string, dependencies: AssessmentServiceDependencies = {}) {
  await assertPwqe51Ready();
  const { db, keyring, now } = deps(dependencies);
  const session = await db.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
  if (!session || session.assessmentKey !== PWQE51_ASSESSMENT_KEY || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= now())) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  const state = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
  if (!isPwqe51SessionState(state) || state.sourceRelease !== PWQE51_RELEASE_IDENTITY.questionRelease) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
  return { session, routingState: state, state: await pwqe51StateView(db, session, state, keyring) };
}

export async function savePwqe51AssessmentResponse(
  sessionId: string,
  input: AssessmentResponseInput & { expectedRevision: number; idempotencyKey: string; correctionOfResponseId?: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  await assertPwqe51Ready();
  const { db, keyring, now } = deps(dependencies);
  const responseId = `pwr_${sha256(`${sessionId}:${input.idempotencyKey}`).slice(0, 40)}`;
  const body = object(input.response);
  if (body?.schemaVersion !== "PWQE51-RS-1") throw new AssessmentError("invalid", "Response does not use the PWQE 5.1 response contract.");
  const status = typeof body.status === "string" ? body.status : "answered";
  const mode = typeof body.mode === "string" ? body.mode : "single";
  const selectedOptionIds = Array.isArray(body.selectedOptionIds) ? body.selectedOptionIds.filter((item): item is string => typeof item === "string") : [];
  const referentRole = typeof body.referentRole === "string" ? body.referentRole : undefined;
  if (selectedOptionIds.length !== (Array.isArray(body.selectedOptionIds) ? body.selectedOptionIds.length : -1)
    || !["answered", "none_fit", "not_sure", "no_event", "not_applicable", "skip"].includes(status)
    || !["single", "simultaneous", "order_unknown", "ordered"].includes(mode)
    || (body.referentRole !== undefined && referentRole === undefined)
    || new Set(selectedOptionIds).size !== selectedOptionIds.length
    || (status !== "answered" && selectedOptionIds.length > 0)
    || (body.privateNote !== undefined && (typeof body.privateNote !== "string" || body.privateNote.length > 8_000))) {
    throw new AssessmentError("invalid", "Response is outside the PWQE 5.1 response contract.");
  }
  const basis = body.basis === "actual_recalled" || body.basis === "reported_typicality" ? body.basis : undefined;
  if (body.basis !== undefined && !basis) throw new AssessmentError("invalid", "Episode basis is not supported.");
  const canonicalResponse = { schemaVersion: "PWQE51-RS-1", status, mode, selectedOptionIds, ...(basis ? { basis } : {}), ...(typeof body.privateNote === "string" && body.privateNote.trim() ? { privateNote: body.privateNote } : {}) } as Prisma.JsonObject;
  const requestSha256 = sha256(canonicalize({ interactionInstanceId: input.interactionInstanceId, correctionOfResponseId: input.correctionOfResponseId ?? null, completionState: input.completionState, response: canonicalResponse, referentRole: referentRole ?? null }));
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || session.assessmentKey !== PWQE51_ASSESSMENT_KEY || !["IN_PROGRESS", "PASS2_IN_PROGRESS", "PAUSED"].includes(session.status)) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    const replay = await tx.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_response: { assessmentSessionId: sessionId, responseId } } });
    if (replay) {
      if (!constantTimeEqual(replay.requestSha256, requestSha256)) throw new AssessmentError("conflict", "Idempotency-Key was already used for a different response.");
      const stored = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
      if (!isPwqe51SessionState(stored)) throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
      return { state: await pwqe51StateView(tx, session, stored, keyring) };
    }
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const decoded = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (!isPwqe51SessionState(decoded) || decoded.sourceRelease !== PWQE51_RELEASE_IDENTITY.questionRelease) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
    let state = decoded;
    const source = await loadPwqe51SourcePackage();
    if (input.correctionOfResponseId) {
      try { state = beginPwqe51Correction(state, input.correctionOfResponseId, source); }
      catch { throw new AssessmentError("invalid", "Correction target is not an active response in this assessment."); }
    }
    const current = state.currentInteraction;
    if (!current || (!input.correctionOfResponseId && current.interactionInstanceId !== input.interactionInstanceId) || (input.bankItemId && current.questionId !== input.bankItemId)) throw new AssessmentError("invalid", "Response does not match the current interaction.");
    const rendered = renderPwqe51Interaction(state, source);
    if (referentRole !== undefined && (!rendered?.referentSlotRequired || !rendered.referentRoleOptions?.some((option) => option.id === referentRole))) {
      throw new AssessmentError("invalid", "Referent role is not available for this question.");
    }
    if (referentRole === "no_other_person" && status !== "not_applicable" && status !== "skip") {
      throw new AssessmentError("invalid", "Choose not applicable or skip when no other person was involved.");
    }
    const question = source.questionBank.items.find((entry) => entry.id === current.questionId);
    if (!question) throw new AssessmentError("invalid", "Current question is not in the pinned source release.");
    const variant = current.variantId ? source.questionBank.variants.find((entry) => entry.id === current.variantId && entry.replaces === question.id) : undefined;
    const options = variant?.options ?? question.options;
    if (selectedOptionIds.some((id) => !options.some((option) => option.id === id))) throw new AssessmentError("invalid", "Response includes an option outside the pinned question version.");
    const skipped = input.completionState === "SKIPPED";
    const answered = input.completionState === "COMPLETED" && status === "answered";
    if (answered && selectedOptionIds.length === 0) throw new AssessmentError("invalid", "An answered response must select at least one authored option.");
    if (answered) {
      const maxSelect = typeof question.selection.max_select === "number" ? question.selection.max_select : 1;
      if (selectedOptionIds.length > maxSelect || (question.selection.mode === "single" && (mode !== "single" || selectedOptionIds.length !== 1))
        || (maxSelect <= 1 && (mode !== "single" || selectedOptionIds.length !== 1))
        || (question.selection.mode === "partial_order" && selectedOptionIds.length > 1 && !question.selection.allow_simultaneous_pair && mode !== "ordered")
        || (selectedOptionIds.length > 1 && selectedOptionIds.some((id) => options.find((option) => option.id === id)?.exclusive))) {
        throw new AssessmentError("invalid", "Response does not match the authored selection rules.");
      }
    }
    const effectiveStatus = skipped ? "skip" : status as "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
    const effectiveOptions = effectiveStatus === "answered" ? selectedOptionIds : [];
    const effectiveMode = effectiveStatus === "answered" ? mode as "single" | "simultaneous" | "order_unknown" | "ordered" : "single";
    const timestamp = now();
    const encryptedResponse = encryptJson({ response: canonicalResponse }, responsePurpose(sessionId, current.interactionInstanceId), keyring);
    const nextState = input.completionState === "PARTIAL" ? state : advancePwqe51Session(state, {
      completionState: skipped ? "SKIPPED" : "COMPLETED",
      responseId,
      selectedOptionIds: effectiveOptions,
      status: effectiveStatus,
      mode: effectiveMode,
      basis: effectiveStatus === "answered" ? basis : undefined,
      supersedesResponseId: input.correctionOfResponseId,
      referentRole,
    }, source);
    await tx.patternworkV31AssessmentResponse.upsert({
      where: { pw31_session_interaction: { assessmentSessionId: sessionId, interactionInstanceId: current.interactionInstanceId } },
      create: { assessmentSessionId: sessionId, responseId, interactionInstanceId: current.interactionInstanceId, bankItemId: question.id, bankItemVersion: question.version, administrationSequence: state.responses.length + 1, stage: question.stage, completionState: input.completionState, requestSha256, responseOrderJson: effectiveOptions, responseCiphertext: prismaBytes(encryptedResponse.ciphertext), responseNonce: prismaBytes(encryptedResponse.nonce), encryptionKeyVersion: encryptedResponse.keyVersion, answeredAt: answered ? timestamp : null, skippedAt: skipped ? timestamp : null },
      update: { responseId, completionState: input.completionState, requestSha256, responseOrderJson: effectiveOptions, responseCiphertext: prismaBytes(encryptedResponse.ciphertext), responseNonce: prismaBytes(encryptedResponse.nonce), encryptionKeyVersion: encryptedResponse.keyVersion, answeredAt: answered ? timestamp : null, skippedAt: skipped ? timestamp : null },
    });
    const encryptedState = encryptJson(nextState, statePurpose(sessionId), keyring);
    const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: { status: session.status === "PAUSED" ? (nextState.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS") : session.status, currentPass: nextState.pass, currentStage: pwqe51Stage(nextState), safeResumeStage: pwqe51Stage(nextState), stateCiphertext: prismaBytes(encryptedState.ciphertext), stateNonce: prismaBytes(encryptedState.nonce), encryptionKeyVersion: encryptedState.keyVersion, optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) } });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    const fresh = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { state: await pwqe51StateView(tx, fresh, nextState, keyring) };
  }, { isolationLevel: "Serializable" });
}

export async function requestAssessmentResumeLink(
  input: { email: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
): Promise<void> {
  const { db, emailHmacKey, delivery, notificationDelivery, keyring, now } = deps(dependencies);
  const email = normalizeEmail(input.email);
  const emailHash = emailLookupHash(email, emailHmacKey);
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { assessmentKey: "patternwork-pwqe5", contactEmailHash: emailHash, status: { in: ["IN_PROGRESS", "PASS1_COMPLETE", "PASS2_IN_PROGRESS", "PAUSED"] }, retentionExpiresAt: { gt: now() } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session || !constantTimeEqual(emailHash, session.contactEmailHash ?? "")) return;
  // Decryption verifies that the lookup record is bound to the same normalized address.
  if (!session.contactEmailCiphertext || !session.contactEmailNonce) return;
  const storedEmail = decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, emailPurpose(session.id), keyring);
  if (!constantTimeEqual(storedEmail, email)) return;
  const access = await createAccessToken(db, session.id, now());
  const actionUrl = resumeUrl(input.baseUrl, access.token);
  if (delivery) await delivery.deliver({ email, resumeUrl: actionUrl, expiresAt: access.expiresAt }).catch(() => undefined);
  else await deliverResumeNotification({ assessmentSessionId: session.id, email, actionUrl, tokenHash: access.tokenHash }, notificationDelivery);
}

export async function requestAssessmentResumeLinkForSession(
  input: { sessionId: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
): Promise<"SENT" | "FAILED"> {
  const { db, keyring, notificationDelivery, now } = deps(dependencies);
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { id: input.sessionId, assessmentKey: "patternwork-pwqe5", status: { not: "ABANDONED" }, retentionExpiresAt: { gt: now() } },
  });
  if (!session?.contactEmailCiphertext || !session.contactEmailNonce) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  const email = decryptString(
    { ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion },
    emailPurpose(session.id),
    keyring,
  );
  const access = await createAccessToken(db, session.id, now());
  return deliverResumeNotification({ assessmentSessionId: session.id, email, actionUrl: resumeUrl(input.baseUrl, access.token), tokenHash: access.tokenHash }, notificationDelivery);
}

export async function requestReportAccessLink(
  input: { email: string; baseUrl: string },
  dependencies: AssessmentServiceDependencies = {},
): Promise<void> {
  const { db, emailHmacKey, delivery, keyring, now } = deps(dependencies);
  const email = normalizeEmail(input.email);
  const emailHash = emailLookupHash(email, emailHmacKey);
  const session = await db.patternworkV31AssessmentSession.findFirst({
    where: { assessmentKey: "patternwork-pwqe5", contactEmailHash: emailHash, status: { in: ["PASS1_COMPLETE", "PASS2_IN_PROGRESS", "COMPLETE"] }, retentionExpiresAt: { gt: now() } },
    orderBy: { updatedAt: "desc" },
  });
  if (!session || !constantTimeEqual(emailHash, session.contactEmailHash ?? "") || !session.contactEmailCiphertext || !session.contactEmailNonce) return;
  const storedEmail = decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, emailPurpose(session.id), keyring);
  if (!constantTimeEqual(storedEmail, email)) return;
  const access = await createAccessToken(db, session.id, now(), "VIEW_REPORT");
  const url = new URL("/reports", input.baseUrl);
  url.searchParams.set("token", access.token);
  await (delivery ?? getResumeLinkDelivery()).deliver({ email, resumeUrl: url.toString(), expiresAt: access.expiresAt });
}

export async function consumeAssessmentAccessToken(token: string, dependencies: AssessmentServiceDependencies = {}) {
  const { db, now } = deps(dependencies);
  const digest = scopedAccessTokenHash(token, ACCESS_TOKEN_SCOPE);
  return db.$transaction(async (tx) => {
    const record = await tx.patternworkV31AccessToken.findUnique({ where: { tokenHash: digest }, include: { assessmentSession: true } });
    if (!record || !constantTimeEqual(record.tokenHash, digest) || record.purpose !== ACCESS_TOKEN_SCOPE) throw new AssessmentError("not_found", "Access link is invalid.");
    const timestamp = now();
    if (record.revokedAt || record.usedAt) throw new AssessmentError("replayed", "Access link has already been used.");
    if (record.expiresAt <= timestamp || (record.assessmentSession.retentionExpiresAt && record.assessmentSession.retentionExpiresAt <= timestamp)) throw new AssessmentError("expired", "Access link has expired.");
    const consumed = await tx.patternworkV31AccessToken.updateMany({ where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: timestamp } }, data: { usedAt: timestamp } });
    if (consumed.count !== 1) throw new AssessmentError("replayed", "Access link has already been used.");
    return { sessionId: record.assessmentSessionId };
  }, { isolationLevel: "Serializable" });
}

export async function getAssessmentState(sessionId: string, dependencies: AssessmentServiceDependencies = {}) {
  const { db, keyring, now } = deps(dependencies);
  const session = await db.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
  if (session?.assessmentKey === PWQE51_ASSESSMENT_KEY) return getPwqe51AssessmentState(sessionId, dependencies);
  if (!session || session.assessmentKey !== "patternwork-pwqe5" || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= now())) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  const state = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
  if (!isPwqe5SessionState(state) || state.sourceRelease !== PWQE5_SOURCE_RELEASE || state.promptRelease !== PWQE5_PROMPT_RELEASE) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
  const hydrated = await hydrateStateView(db, session, state, keyring);
  return { session, routingState: state, state: hydrated };
}

async function hydrateStateView(
  client: Database | Prisma.TransactionClient,
  session: Awaited<ReturnType<Database["patternworkV31AssessmentSession"]["findUniqueOrThrow"]>>,
  routingState: AssessmentRoutingState | Pwqe5SessionState,
  keyring: EncryptionKeyring,
) {
  const pwqe5 = isPwqe5SessionState(routingState);
  const source = pwqe5 ? await loadPwqe5SourcePackage() : undefined;
  const base = pwqe5
    ? {
        engine: "PWQE5" as const,
        schemaVersion: routingState.schemaVersion,
        sessionId: session.id,
        status: session.status as "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED",
        revision: session.optimisticRevision,
        pass: routingState.pass,
        stage: pwqe5StageForState(routingState),
        safeResumeStage: pwqe5StageForState(routingState),
        currentInteraction: renderPwqe5Interaction(routingState, source!),
        canCompletePass: canCompletePwqe5Pass(routingState),
        canPause: true as const,
        completedCount: routingState.responses.length,
        optedInTopics: routingState.optedInTopics,
        responseHistory: (() => {
          const superseded = new Set(routingState.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
          return routingState.responses.filter((response) => !superseded.has(response.responseId)).map((response) => {
            const question = source!.questionBank.items.find((item) => item.id === response.questionId);
            const variant = response.variantId ? source!.questionBank.variants.find((item) => item.id === response.variantId) : undefined;
            const options = variant?.replaces === response.questionId ? variant.options : question?.options ?? [];
            const controls = new Map(source!.questionBank.common_response_controls.map((control) => [control.id, control.text]));
            const selected = new Set(response.selectedOptionIds ?? []);
            return {
              responseId: response.responseId,
              questionId: response.questionId,
              title: question?.title ?? response.questionId,
              context: typeof question?.context === "string" ? question.context : String(question?.episode_family ?? ""),
              prompt: variant?.replaces === response.questionId ? variant.prompt : question?.prompt ?? "",
              selection: question?.selection ?? {},
              responseControls: (question?.response_controls ?? []).map((id) => ({ id, text: controls.get(id) ?? id })),
              options: options.map((option) => ({ id: option.id, label: option.text, exclusive: option.exclusive === true })),
              status: response.status,
              mode: response.mode,
              selectedOptions: options.filter((option) => selected.has(option.id)).map((option) => ({ id: option.id, label: option.text })),
              canCorrect: !routingState.paused && routingState.phase !== "finished",
            };
          });
        })(),
        allowedControls: routingState.phase === "finished" ? [] as const : routingState.pass === 2 ? ["shorten", "end"] as const : ["end"] as const,
        availableTopics: Array.isArray(source!.routingTargets.entry_points)
          ? (source!.routingTargets.entry_points as readonly Record<string, unknown>[]).map((entry) => ({
              id: String(entry.id ?? ""),
              label: String(entry.label ?? entry.title ?? entry.id ?? ""),
              description: typeof entry.description === "string" ? entry.description : "",
            })).filter((entry) => entry.id && entry.label)
          : [],
      }
    : toAssessmentStateView(session.id, session.status as "IN_PROGRESS" | "PASS1_COMPLETE" | "PASS2_IN_PROGRESS" | "COMPLETE" | "PAUSED", session.optimisticRevision, routingState);
  const currentResponse = routingState.currentInteraction ? await client.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_interaction: { assessmentSessionId: session.id, interactionInstanceId: routingState.currentInteraction.interactionInstanceId } } }) : null;
  const saved = currentResponse ? decryptJson<{ response: Prisma.JsonValue }>({ ciphertext: Buffer.from(currentResponse.responseCiphertext), nonce: Buffer.from(currentResponse.responseNonce), keyVersion: currentResponse.encryptionKeyVersion }, responsePurpose(session.id, currentResponse.interactionInstanceId), keyring) : null;
  const resumeNotification = await client.patternworkV31Notification.findFirst({ where: { assessmentSessionId: session.id, type: "RESUME_LINK" }, orderBy: { createdAt: "desc" }, select: { status: true } });
  const snapshots = await client.patternworkV31AssessmentSnapshot.findMany({ where: { assessmentSessionId: session.id }, include: { reportRuns: { include: { artifact: { include: { deliveries: { select: { status: true } } } } } }, reportAttempts: { orderBy: { attemptNumber: "desc" }, take: 1, include: { notifications: { orderBy: { createdAt: "desc" }, select: { type: true, status: true } } } } }, orderBy: [{ completedPass: "desc" }, { frozenAt: "desc" }] });
  const latest = snapshots[0];
  const latestComplete = latest && (latest.completedPass === 1 || latest.completedPass === 2) ? isCompleteActiveReportSet(latest.completedPass, latest.reportRuns) : false;
  const currentAttempt = latest?.reportAttempts[0];
  const reportStatus = latestComplete ? "READY" : !latest ? "NOT_STARTED" : currentAttempt?.status === "QUEUED" ? "QUEUED" : currentAttempt && ["FAILED", "STALLED"].includes(currentAttempt.status) ? "FAILED" : "GENERATING";
  const readyRun = latestComplete ? latest.reportRuns.find((run) => run.reportType === (latest.completedPass === 2 ? "SYNTHESIS" : "MAP") && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY") : undefined;
  const mappingSnapshot = snapshots.find((snapshot) => snapshot.completedPass === 1 && isCompleteActiveReportSet(1, snapshot.reportRuns));
  const mappingRun = mappingSnapshot?.reportRuns.find((run) => run.reportType === "MAP" && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY");
  const deliveryStates = latestComplete ? latest.reportRuns.flatMap((run) => run.artifact?.deliveries.map((delivery) => delivery.status) ?? []) : [];
  const attemptNotification = currentAttempt?.notifications.find((notification) => notification.type === (currentAttempt.status === "FAILED" || currentAttempt.status === "STALLED" ? "REPORT_FAILED" : "REPORT_STARTED"));
  const notificationDeliveryStatus = !attemptNotification ? "NOT_STARTED" : attemptNotification.status === "DELIVERED" ? "DELIVERED" : attemptNotification.status === "SENT" ? "SENT" : attemptNotification.status === "FAILED" || attemptNotification.status === "BOUNCED" ? "FAILED" : "PENDING";
  const deliveryStatus = !latestComplete ? notificationDeliveryStatus : deliveryStates.length === 0 ? "NOT_STARTED" : deliveryStates.some((status) => status === "FAILED" || status === "BOUNCED") ? "FAILED" : deliveryStates.every((status) => status === "DELIVERED") ? "DELIVERED" : deliveryStates.every((status) => status === "SENT" || status === "DELIVERED") ? "SENT" : "PENDING";
  const failureCategory = latestComplete && deliveryStatus === "FAILED" ? "DELIVERY" : currentAttempt?.failureCategory ?? undefined;
  const retryAudience = latestComplete && deliveryStatus === "FAILED" ? "OPERATOR" : currentAttempt?.retryAudience ?? "NONE";
  const canRetry = Boolean(currentAttempt && ["FAILED", "STALLED"].includes(currentAttempt.status) && currentAttempt.retryAudience === "USER");
  const resumeNotificationStatus = !resumeNotification ? "NOT_STARTED" : resumeNotification.status === "DELIVERED" ? "DELIVERED" : resumeNotification.status === "SENT" ? "SENT" : resumeNotification.status === "FAILED" || resumeNotification.status === "BOUNCED" ? "FAILED" : "PENDING";
  return {
    ...base,
    ...(!pwqe5 ? { currentInteraction: await authoredInteraction(routingState.currentInteraction) } : {}),
    currentResponse: currentResponse && saved ? { completionState: currentResponse.completionState as "PARTIAL" | "COMPLETED" | "SKIPPED", response: saved.response, responseOrder: Array.isArray(currentResponse.responseOrderJson) ? currentResponse.responseOrderJson.filter((entry): entry is string => typeof entry === "string") : [] } : null,
    reportStatus,
    reportReadyUrl: readyRun?.artifact ? reportArtifactUrl(session.id, readyRun.artifact.reportId) : null,
    deliveryStatus,
    ...(failureCategory ? { failureCategory } : {}),
    retryAudience,
    canRetry,
    currentAttempt: currentAttempt ? { id: currentAttempt.id, attemptNumber: currentAttempt.attemptNumber, status: currentAttempt.status, ...(currentAttempt.startedAt ? { startedAt: currentAttempt.startedAt.toISOString() } : {}), updatedAt: currentAttempt.updatedAt.toISOString() } : null,
    resumeNotificationStatus,
    mappingSummaryUrl: mappingRun?.artifact ? reportArtifactUrl(session.id, mappingRun.artifact.reportId) : null,
  } as const;
}

export async function saveAssessmentResponse(
  sessionId: string,
  input: AssessmentResponseInput & { expectedRevision: number; idempotencyKey: string; correctionOfResponseId?: string },
  dependencies: AssessmentServiceDependencies = {},
) {
  if (object(input.response)?.schemaVersion === "PWQE51-RS-1") return savePwqe51AssessmentResponse(sessionId, input, dependencies);
  const { db, keyring, now } = deps(dependencies);
  const responseId = `pwr_${sha256(`${sessionId}:${input.idempotencyKey}`).slice(0, 40)}`;
  const pwqe5Request = object(input.response)?.schemaVersion === "PWQE5-RS-1";
  const normalizedResponse = pwqe5Request
    ? normalizePwqe5ResponsePayload(input.response) as unknown as Prisma.JsonObject
    : normalizeTypedAssessmentResponse(input.response, input.bankItemId);
  const normalizedResponseOrder = pwqe5Request
    ? [...(normalizedResponse.selectedOptionIds as string[])]
    : (input.responseOrder ?? []).filter((value) => OPTION_TOKEN.test(value));
  const requestSha256 = sha256(canonicalize({ interactionInstanceId: input.interactionInstanceId, correctionOfResponseId: input.correctionOfResponseId ?? null, completionState: input.completionState, response: normalizedResponse, responseOrder: normalizedResponseOrder }));
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || !["IN_PROGRESS", "PASS2_IN_PROGRESS", "PAUSED"].includes(session.status)) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    if (session.assessmentKey !== "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    const replay = await tx.patternworkV31AssessmentResponse.findUnique({ where: { pw31_session_response: { assessmentSessionId: sessionId, responseId } } });
    if (replay) {
      if (!constantTimeEqual(replay.requestSha256, requestSha256)) throw new AssessmentError("conflict", "Idempotency-Key was already used for a different response.");
      const current = await getAssessmentStateWithClient(tx, sessionId, keyring);
      return current;
    }
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const decryptedState = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (isPwqe5SessionState(decryptedState)) {
      if (session.assessmentKey !== "patternwork-pwqe5" || decryptedState.sourceRelease !== PWQE5_SOURCE_RELEASE) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
      const source = await loadPwqe5SourcePackage();
      let state = decryptedState;
      if (input.correctionOfResponseId) {
        try { state = beginPwqe5Correction(state, input.correctionOfResponseId, source); }
        catch { throw new AssessmentError("invalid", "Correction target is not an active response in this assessment."); }
      }
      if (state.paused) throw new AssessmentError("invalid", "Resume the assessment before answering.");
      const current = state.currentInteraction;
      if (!current || (!input.correctionOfResponseId && current.interactionInstanceId !== input.interactionInstanceId) || (!input.correctionOfResponseId && input.bankItemId && current.questionId !== input.bankItemId)) throw new AssessmentError("invalid", "Response does not match the current interaction.");
      const question = source.questionBank.items.find((item) => item.id === current.questionId);
      if (!question) throw new AssessmentError("invalid", "Current question is not present in the pinned source release.");
      const provided = normalizePwqe5ResponsePayload(input.response);
      if (input.completionState === "COMPLETED" && provided.status === "answered" && provided.selectedOptionIds.length === 0) {
        throw new AssessmentError("invalid", "An answered response must select at least one authored option.");
      }
      const variant = current.variantId ? source.questionBank.variants.find((candidate) => candidate.id === current.variantId) : undefined;
      const authoredOptions = variant?.replaces === question.id ? variant.options : question.options;
      const optionById = new Map(authoredOptions.map((option) => [option.id, option]));
      if (provided.selectedOptionIds.some((optionId) => !optionById.has(optionId))) throw new AssessmentError("invalid", "Response includes an option outside the pinned question version.");
      validatePwqe5AuthoredSelection(question, provided.status, provided.mode, provided.selectedOptionIds);
      if (provided.selectedOptionIds.some((optionId) => optionById.get(optionId)?.exclusive) && provided.selectedOptionIds.length > 1) {
        throw new AssessmentError("invalid", "An exclusive option cannot be combined with another answer.");
      }
      const responsePayload = input.completionState === "SKIPPED"
        ? { ...provided, status: "skip" as const, mode: "single" as const, selectedOptionIds: [] }
        : provided;
      const response = {
        schemaVersion: "PWQE5-RS-1",
        questionId: current.questionId,
        status: responsePayload.status,
        mode: responsePayload.mode,
        selectedOptionIds: [...responsePayload.selectedOptionIds],
        ...(responsePayload.privateNote ? { privateNote: responsePayload.privateNote } : {}),
      } as Prisma.JsonObject;
      const timestamp = now();
      const interactionInstanceId = current.interactionInstanceId;
      const encryptedResponse = encryptJson({ response }, responsePurpose(sessionId, interactionInstanceId), keyring);
      const nextState = input.completionState === "PARTIAL"
        ? state
        : advancePwqe5Session(state, {
            responseId,
            completionState: input.completionState,
            selectedOptionIds: responsePayload.selectedOptionIds,
            status: responsePayload.status,
            mode: responsePayload.mode,
          }, source);
      const encryptedState = encryptJson(nextState, statePurpose(sessionId), keyring);
      await tx.patternworkV31AssessmentResponse.upsert({
        where: { pw31_session_interaction: { assessmentSessionId: sessionId, interactionInstanceId } },
        create: {
          assessmentSessionId: sessionId,
          responseId,
          interactionInstanceId,
          bankItemId: question.id,
          bankItemVersion: question.version,
          administrationSequence: state.responses.length + 1,
          stage: question.stage,
          completionState: input.completionState,
          requestSha256,
          responseOrderJson: responsePayload.selectedOptionIds,
          responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
          responseNonce: prismaBytes(encryptedResponse.nonce),
          encryptionKeyVersion: encryptedResponse.keyVersion,
          answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
          skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
        },
        update: {
          responseId,
          completionState: input.completionState,
          requestSha256,
          responseOrderJson: responsePayload.selectedOptionIds,
          responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
          responseNonce: prismaBytes(encryptedResponse.nonce),
          encryptionKeyVersion: encryptedResponse.keyVersion,
          answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
          skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
        },
      });
      const updated = await tx.patternworkV31AssessmentSession.updateMany({
        where: { id: sessionId, optimisticRevision: input.expectedRevision },
        data: {
          status: session.status === "PAUSED" ? (nextState.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS") : session.status,
          currentPass: nextState.pass,
          currentStage: pwqe5StageForState(nextState),
          safeResumeStage: pwqe5StageForState(nextState),
          stateCiphertext: prismaBytes(encryptedState.ciphertext),
          stateNonce: prismaBytes(encryptedState.nonce),
          encryptionKeyVersion: encryptedState.keyVersion,
          optimisticRevision: { increment: 1 },
          expiresAt: abandonedRetentionExpiresAt(timestamp),
          retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
        },
      });
      if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
      return getAssessmentStateWithClient(tx, sessionId, keyring);
    }
    if (session.assessmentKey === "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
    const state = decryptedState as AssessmentRoutingState;
    const current = state.currentInteraction;
    if (!current || current.interactionInstanceId !== input.interactionInstanceId || (input.bankItemId && current.bankItemId !== input.bankItemId)) throw new AssessmentError("invalid", "Response does not match the current interaction.");
    const timestamp = now();
    const establishedReferent = establishedReferentFromRoutingState(state);
    const response = await enrichResponseFromAuthoredContract(normalizeTypedAssessmentResponse(input.response, current.bankItemId), current.bankItemId, current.bankItemVersion, establishedReferent);
    const trustedResponseOrder = trustedResponseOrderFromResponse(response);
    const encryptedResponse = encryptJson({ response }, responsePurpose(sessionId, input.interactionInstanceId), keyring);
    const safety = responseSafetySignals(response);
    structuredManifestPromise ??= loadStructuredInstrumentManifest();
    const authoredRoutingContracts = Object.fromEntries((await structuredManifestPromise).items.map((item) => [item.bankItemId, item.deterministicRouting.executable]));
    const routedInput = { ...input, response: response as unknown as AssessmentResponseInput["response"], bankItemId: current.bankItemId, userArousal: safety.userArousal, unsafeContext: safety.unsafeContext, resourceSafetyClear: safety.resourceSafetyClear, authoredRoutingContracts };
    const nextState = input.completionState === "PARTIAL" ? state : routeAssessmentResponse(state, routedInput);
    const encryptedState = encryptJson(nextState, statePurpose(sessionId), keyring);
    await tx.patternworkV31AssessmentResponse.upsert({
      where: { pw31_session_interaction: { assessmentSessionId: sessionId, interactionInstanceId: input.interactionInstanceId } },
      create: {
        assessmentSessionId: sessionId,
        responseId,
        interactionInstanceId: input.interactionInstanceId,
        bankItemId: current.bankItemId,
        bankItemVersion: current.bankItemVersion,
        administrationSequence: current.administrationSequence,
        stage: current.stage,
        completionState: input.completionState,
        requestSha256,
        responseOrderJson: trustedResponseOrder,
        responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
        responseNonce: prismaBytes(encryptedResponse.nonce),
        encryptionKeyVersion: encryptedResponse.keyVersion,
        answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
        skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
      },
      update: {
        responseId,
        completionState: input.completionState,
        requestSha256,
        responseOrderJson: trustedResponseOrder,
        responseCiphertext: prismaBytes(encryptedResponse.ciphertext),
        responseNonce: prismaBytes(encryptedResponse.nonce),
        encryptionKeyVersion: encryptedResponse.keyVersion,
        answeredAt: input.completionState === "COMPLETED" ? timestamp : null,
        skippedAt: input.completionState === "SKIPPED" ? timestamp : null,
      },
    });
    const updated = await tx.patternworkV31AssessmentSession.updateMany({
      where: { id: sessionId, optimisticRevision: input.expectedRevision },
      data: {
        status: session.status === "PAUSED" ? (nextState.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS") : session.status,
        currentStage: nextState.stage,
        safeResumeStage: nextState.safeResumeStage,
        stateCiphertext: prismaBytes(encryptedState.ciphertext),
        stateNonce: prismaBytes(encryptedState.nonce),
        encryptionKeyVersion: encryptedState.keyVersion,
        optimisticRevision: { increment: 1 },
        expiresAt: abandonedRetentionExpiresAt(timestamp),
        retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
      },
    });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    return getAssessmentStateWithClient(tx, sessionId, keyring);
  }, { isolationLevel: "Serializable" });
}

async function getAssessmentStateWithClient(tx: Prisma.TransactionClient, sessionId: string, keyring: EncryptionKeyring) {
  const session = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
  const routingState = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
  if (!isPwqe5SessionState(routingState) || session.assessmentKey !== "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
  return { state: await hydrateStateView(tx, session, routingState, keyring) };
}

export async function setAssessmentPause(
  sessionId: string,
  input: { expectedRevision: number; action: "pause" | "resume" },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, now } = deps(dependencies);
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || !["patternwork-pwqe5", PWQE51_ASSESSMENT_KEY].includes(session.assessmentKey)) throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const storedState = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (isPwqe51SessionState(storedState)) {
      if (session.assessmentKey !== PWQE51_ASSESSMENT_KEY) throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
      const next = input.action === "pause" ? pausePwqe51Session(storedState, true) : resumePwqe51Session(storedState);
      const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
      const timestamp = now();
      const status = input.action === "pause" ? "PAUSED" : next.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS";
      const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: { status, stateCiphertext: prismaBytes(encrypted.ciphertext), stateNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, currentStage: pwqe51Stage(next), safeResumeStage: pwqe51Stage(next), optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) } });
      if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
      const fresh = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
      return { state: await pwqe51StateView(tx, fresh, next, keyring) };
    }
    if (isPwqe5SessionState(storedState)) {
      if (session.assessmentKey !== "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
      const next = pausePwqe5Session(storedState, input.action === "pause");
      const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
      const timestamp = now();
      const status = input.action === "pause" ? "PAUSED" : next.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS";
      const updated = await tx.patternworkV31AssessmentSession.updateMany({
        where: { id: sessionId, optimisticRevision: input.expectedRevision },
        data: { status, stateCiphertext: prismaBytes(encrypted.ciphertext), stateNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, safeResumeStage: pwqe5StageForState(next), optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) },
      });
      if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
      return getAssessmentStateWithClient(tx, sessionId, keyring);
    }
    if (session.assessmentKey === "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
    const state = storedState as AssessmentRoutingState;
    const next = input.action === "pause" ? pauseRoutingState(state) : resumeRoutingState(state);
    const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
    const timestamp = now();
    const status = input.action === "pause" ? "PAUSED" : next.pass === 1 ? "IN_PROGRESS" : "PASS2_IN_PROGRESS";
    const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: { status, stateCiphertext: prismaBytes(encrypted.ciphertext), stateNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, safeResumeStage: next.safeResumeStage, optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) } });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    return getAssessmentStateWithClient(tx, sessionId, keyring);
  }, { isolationLevel: "Serializable" });
}

export async function applyPwqe5Control(
  sessionId: string,
  input: { expectedRevision: number; action: "shorten" },
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, now } = deps(dependencies);
  return db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || !["patternwork-pwqe5", PWQE51_ASSESSMENT_KEY].includes(session.assessmentKey) || session.status !== "PASS2_IN_PROGRESS") throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const stored = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (isPwqe51SessionState(stored) && session.assessmentKey === PWQE51_ASSESSMENT_KEY) {
      if (stored.paused) throw new AssessmentError("invalid", "Assessment cannot apply that control right now.");
      const source = await loadPwqe51SourcePackage();
      let next: Pwqe51SessionState;
      try { next = shortenPwqe51Session(stored, source); }
      catch { throw new AssessmentError("invalid", "Assessment cannot apply that control right now."); }
      const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
      const timestamp = now();
      const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: { status: "PASS2_IN_PROGRESS", currentStage: pwqe51Stage(next), safeResumeStage: pwqe51Stage(next), stateCiphertext: prismaBytes(encrypted.ciphertext), stateNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, optimisticRevision: { increment: 1 }, expiresAt: abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: abandonedRetentionExpiresAt(timestamp) } });
      if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
      const fresh = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
      return pwqe51StateView(tx, fresh, next, keyring).then((state) => ({ state }));
    }
    if (!isPwqe5SessionState(stored) || stored.paused) throw new AssessmentError("invalid", "Assessment cannot apply that control right now.");
    const source = await loadPwqe5SourcePackage();
    let next: Pwqe5SessionState;
    try { next = shortenPwqe5Session(stored, source); }
    catch { throw new AssessmentError("invalid", "Assessment cannot apply that control right now."); }
    const encrypted = encryptJson(next, statePurpose(sessionId), keyring);
    const timestamp = now();
    const updated = await tx.patternworkV31AssessmentSession.updateMany({
      where: { id: sessionId, optimisticRevision: input.expectedRevision },
      data: {
        status: "PASS2_IN_PROGRESS",
        currentStage: pwqe5StageForState(next),
        safeResumeStage: pwqe5StageForState(next),
        stateCiphertext: prismaBytes(encrypted.ciphertext),
        stateNonce: prismaBytes(encrypted.nonce),
        encryptionKeyVersion: encrypted.keyVersion,
        optimisticRevision: { increment: 1 },
        expiresAt: abandonedRetentionExpiresAt(timestamp),
        retentionExpiresAt: abandonedRetentionExpiresAt(timestamp),
      },
    });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    return getAssessmentStateWithClient(tx, sessionId, keyring);
  }, { isolationLevel: "Serializable" });
}

async function completePwqe51AssessmentPass(
  sessionId: string,
  input: { expectedRevision: number; completedPass: AssessmentPass; action?: "finish" | "continue" | "end"; optedInTopics?: readonly string[] } & Pwqe51PassTwoContextInput,
  dependencies: AssessmentServiceDependencies,
) {
  await assertPwqe51Ready();
  const { db, keyring, enqueueWorkflow, now, reportAttemptNotification } = deps(dependencies);
  const frozen = await db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session || session.assessmentKey !== PWQE51_ASSESSMENT_KEY || session.currentPass !== input.completedPass) throw new AssessmentError("invalid", "Pass does not match current assessment state.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const hasPassTwoContext = input.focusOccurrenceRefs !== undefined || input.detailPermissions !== undefined || input.comparisonDecisions !== undefined;
    if (hasPassTwoContext && (input.completedPass !== 1 || input.action !== "continue")) {
      throw new AssessmentError("invalid", "Pass-two context is accepted only when continuing after Mapping.");
    }
    const existing = await tx.patternworkV31AssessmentSnapshot.findFirst({ where: { assessmentSessionId: sessionId, completedPass: input.completedPass } });
    if (existing) {
      const storedExisting = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
      if (!isPwqe51SessionState(storedExisting)) throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
      return { snapshotId: existing.id, workflowInput: null, state: { state: await pwqe51StateView(tx, session, storedExisting, keyring) } };
    }
    const stored = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (!isPwqe51SessionState(stored) || stored.sourceRelease !== PWQE51_RELEASE_IDENTITY.questionRelease) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
    if (stored.paused) throw new AssessmentError("invalid", "Resume the assessment before completing this pass.");
    const source = await loadPwqe51SourcePackage();
    const state = input.action === "end" ? endPwqe51Session(stored, source) : stored;
    if (!canCompletePwqe51Pass(state)) throw new AssessmentError("completion_blocked", "PWQE 5.1 has not reached an authored stopping condition.");
    const timestamp = now();
    const snapshotId = `pwsn_${randomUUID()}`;
    const boundary = normalCompletionBoundary(input.completedPass);
      const routerPacket = buildPwqe51RouterPacket({ snapshotId, responses: state.responses, routerResult: state.routerResult, source, pass: state.pass, controls: state.controls, comparisonDecisions: state.comparisonDecisions });
    const packetRecord = routerPacket as Record<string, unknown>;
    const canonical = {
      snapshot_id: snapshotId,
      snapshot_revision: "1",
      contract_id: PWQE51_RELEASE_IDENTITY.questionRelease,
      integrity_contract_id: "patternwork-router-evidence-v1",
      packet_version: "urn:patternwork:router-evidence:1",
      assessment_completion: { completion_mode: boundary.completionMode, last_completed_stage: boundary.lastCompletedStage, safe_resume_stage: boundary.safeResumeStage, completed_at: timestamp.toISOString() },
      source_manifest_sha256: PWQE51_SOURCE_MANIFEST_SHA256,
      router_packet: routerPacket,
      routing_state: state.routerResult,
      responses: state.responses,
      ...(state.pass === 2 ? { pass_two_context: {
        focus_occurrences: state.routerInput.focusOccurrences ?? [],
        details: state.routerInput.details ?? [],
        comparison_decisions: state.comparisonDecisions ?? [],
      } } : {}),
    };
    const canonicalString = canonicalize(canonical);
    const encrypted = encryptJson(canonical, snapshotPurpose(sessionId, input.completedPass), keyring);
    const snapshot = await tx.patternworkV31AssessmentSnapshot.create({ data: {
      id: snapshotId, assessmentSessionId: sessionId, snapshotId, snapshotRevision: "1", completedPass: input.completedPass,
      completionMode: boundary.completionMode, lastCompletedStage: boundary.lastCompletedStage, safeResumeStage: boundary.safeResumeStage,
      contractId: PWQE51_RELEASE_IDENTITY.questionRelease, integrityContractId: "patternwork-router-evidence-v1", packetVersion: "urn:patternwork:router-evidence:1",
      evidenceSha256: sha256(String(packetRecord.content_sha256)), scopeSha256: sha256(canonicalize(packetRecord.assessment_scope)), canonicalJsonSha256: sha256(canonicalString),
      canonicalJsonCiphertext: prismaBytes(encrypted.ciphertext), canonicalJsonNonce: prismaBytes(encrypted.nonce), encryptionKeyVersion: encrypted.keyVersion, completedAt: timestamp,
    } });
    const continuePass = input.completedPass === 1 && input.action === "continue";
    let next = state;
    if (continuePass) {
      const valid = new Set(Array.isArray(source.routingTargets.entry_points) ? source.routingTargets.entry_points.map((entry) => String(entry.id ?? "")) : []);
      if (input.optedInTopics?.some((topic) => !valid.has(topic))) throw new AssessmentError("invalid", "Deepening opt-in includes a topic outside the authored entry points.");
      const context = resolvePwqe51PassTwoContext(sessionId, state, input);
      next = startPwqe51Deepening(state, [...new Set(input.optedInTopics ?? [])], source, context);
    }
    const encryptedNext = encryptJson(next, statePurpose(sessionId), keyring);
    const nextStatus = input.completedPass === 2 ? "COMPLETE" : continuePass ? "PASS2_IN_PROGRESS" : "PASS1_COMPLETE";
    const updated = await tx.patternworkV31AssessmentSession.updateMany({ where: { id: sessionId, optimisticRevision: input.expectedRevision }, data: {
      status: nextStatus, currentPass: continuePass ? 2 : input.completedPass, currentStage: pwqe51Stage(next), safeResumeStage: pwqe51Stage(next),
      stateCiphertext: prismaBytes(encryptedNext.ciphertext), stateNonce: prismaBytes(encryptedNext.nonce), encryptionKeyVersion: encryptedNext.keyVersion,
      optimisticRevision: { increment: 1 }, completedAt: input.completedPass === 2 ? timestamp : null,
      expiresAt: input.completedPass === 2 ? null : abandonedRetentionExpiresAt(timestamp), retentionExpiresAt: input.completedPass === 2 ? completedRetentionExpiresAt(timestamp) : abandonedRetentionExpiresAt(timestamp),
    } });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    const workflowInput = await createReportAttemptWithClient(tx as unknown as AttemptTransaction, { snapshotDatabaseId: snapshot.id, assessmentSessionId: sessionId, snapshotId: snapshot.snapshotId, completedPass: input.completedPass, requestedBy: "COMPLETION", now: timestamp });
    const fresh = await tx.patternworkV31AssessmentSession.findUniqueOrThrow({ where: { id: sessionId } });
    return { snapshotId: snapshot.id, workflowInput, state: { state: await pwqe51StateView(tx, fresh, next, keyring) } };
  }, { isolationLevel: "Serializable" });
  if (!frozen.workflowInput) return { state: frozen.state.state, snapshotId: frozen.snapshotId };
  try {
    const workflow = await enqueueWorkflow(frozen.workflowInput);
    if (frozen.workflowInput.attemptId) await reportAttemptNotification(frozen.workflowInput.attemptId, "REPORT_STARTED");
    return { state: frozen.state.state, snapshotId: frozen.snapshotId, workflowRunId: workflow.workflowRunId, watchdogRunId: workflow.watchdogRunId };
  } catch {
    if (frozen.workflowInput.attemptId) await reportAttemptNotification(frozen.workflowInput.attemptId, "REPORT_FAILED");
    const current = await getPwqe51AssessmentState(sessionId, dependencies);
    return { state: current.state, snapshotId: frozen.snapshotId };
  }
}

export async function completeAssessmentPass(
  sessionId: string,
  input: { expectedRevision: number; completedPass: AssessmentPass; action?: "finish" | "continue" | "end"; optedInTopics?: readonly string[] } & Pwqe51PassTwoContextInput,
  dependencies: AssessmentServiceDependencies = {},
) {
  const { db, keyring, enqueueWorkflow, now, reportReadiness, reportAttemptNotification } = deps(dependencies);
  const versionedSession = await db.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
  if (versionedSession?.assessmentKey === PWQE51_ASSESSMENT_KEY) return completePwqe51AssessmentPass(sessionId, input, dependencies);
  if (input.focusOccurrenceRefs !== undefined || input.detailPermissions !== undefined || input.comparisonDecisions !== undefined) throw new AssessmentError("invalid", "Pass-two context is available only for PWQE 5.1 Mapping continuation.");
  if (!versionedSession || versionedSession.assessmentKey !== "patternwork-pwqe5") throw new AssessmentError("unauthorized", "Assessment session is unavailable.");
  const versionedState = decryptJson<unknown>(asEncrypted(versionedSession), statePurpose(sessionId), keyring);
  if (!isPwqe5SessionState(versionedState) || versionedState.sourceRelease !== PWQE5_SOURCE_RELEASE) throw new AssessmentError("unauthorized", "Assessment session is bound to an unavailable source release.");
  const alreadyFrozen = await db.patternworkV31AssessmentSnapshot.findFirst({ where: { assessmentSessionId: sessionId, completedPass: input.completedPass }, select: { id: true } });
  if (!alreadyFrozen) {
    try { await reportReadiness(); }
    catch { throw new AssessmentError("report_unavailable", "Report preparation is temporarily unavailable. Your answers remain saved; please try again later."); }
  }
  const frozen = await db.$transaction(async (tx) => {
    const session = await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new AssessmentError("invalid", "Pass does not match current assessment state.");
      const existing = await tx.patternworkV31AssessmentSnapshot.findFirst({ where: { assessmentSessionId: sessionId, completedPass: input.completedPass } });
    if (existing) {
      if (input.completedPass === 1 && input.action === "continue" && session.currentPass === 1) {
        if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
        const state = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
        if (!isPwqe5SessionState(state)) throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
        const source = await loadPwqe5SourcePackage();
        const optedInTopics = validatePwqe5OptedInTopics(source, input.optedInTopics);
        const nextState = startPwqe5Deepening(state, optedInTopics, source);
        const encryptedNext = encryptJson(nextState, statePurpose(sessionId), keyring);
        await tx.patternworkV31AssessmentSession.update({ where: { id: sessionId }, data: { status: "PASS2_IN_PROGRESS", currentPass: 2, currentStage: pwqe5StageForState(nextState), safeResumeStage: pwqe5StageForState(nextState), stateCiphertext: prismaBytes(encryptedNext.ciphertext), stateNonce: prismaBytes(encryptedNext.nonce), encryptionKeyVersion: encryptedNext.keyVersion, optimisticRevision: { increment: 1 } } });
      }
      const current = await getAssessmentStateWithClient(tx, sessionId, keyring);
      const reportAttempt = await tx.patternworkV31ReportWorkflowAttempt.findFirst({ where: { assessmentSnapshotId: existing.id }, orderBy: { attemptNumber: "desc" } });
      if (!reportAttempt) {
        const created = await createReportAttemptWithClient(tx as unknown as AttemptTransaction, { snapshotDatabaseId: existing.id, assessmentSessionId: sessionId, snapshotId: existing.snapshotId, completedPass: input.completedPass, requestedBy: "COMPLETION", now: now() });
        const queued = await getAssessmentStateWithClient(tx, sessionId, keyring);
        return { ...queued, snapshotId: existing.id, workflowInput: created };
      }
      if (["FAILED", "STALLED", "SUCCEEDED"].includes(reportAttempt.status)) {
        return { ...current, snapshotId: existing.id, workflowInput: null, existingWorkflowRunId: reportAttempt.workflowRunId };
      }
      return { ...current, snapshotId: existing.id, workflowInput: { assessmentSessionId: sessionId, snapshotId: existing.snapshotId, completedPass: input.completedPass, attemptId: reportAttempt.id, attemptNumber: reportAttempt.attemptNumber, invocationKey: reportAttempt.invocationKey } };
    }
    if (session.currentPass !== input.completedPass) throw new AssessmentError("invalid", "Pass does not match current assessment state.");
    if (session.optimisticRevision !== input.expectedRevision) throw new AssessmentError("conflict", "Assessment state has changed.");
    const stateValue = decryptJson<unknown>(asEncrypted(session), statePurpose(session.id), keyring);
    if (!isPwqe5SessionState(stateValue)) throw new AssessmentError("unauthorized", "Assessment session state is unavailable.");
    const source = await loadPwqe5SourcePackage();
    const state = input.action === "end" ? endPwqe5Session(stateValue, source) : stateValue;
    if (state.paused) throw new AssessmentError("invalid", "Resume the assessment before completing this pass.");
    if (!canCompletePwqe5Pass(state)) throw new AssessmentError("completion_blocked", "PWQE 5 has not reached an authored stopping condition.");
    const timestamp = now();
    const snapshotId = `pwsn_${randomUUID()}`;
    const completionBoundary = normalCompletionBoundary(input.completedPass);
    const routerPacket = buildPwqe6RouterPacket({ snapshotId, state, source });
    const canonical = {
      snapshot_id: snapshotId,
      snapshot_revision: "1",
      contract_id: PWQE5_SOURCE_RELEASE,
      integrity_contract_id: "patternwork-router-evidence-v1",
      packet_version: "urn:patternwork:router-evidence:1",
      assessment_completion: {
        completion_mode: completionBoundary.completionMode,
        last_completed_stage: completionBoundary.lastCompletedStage,
        safe_resume_stage: completionBoundary.safeResumeStage,
        completed_at: timestamp.toISOString(),
      },
      source_manifest_sha256: (await loadPwqe6SourcePackage()).sourceManifestSha256,
      router_packet: routerPacket,
      routing_state: state.routerResult,
      responses: state.responses,
    };
    const canonicalString = canonicalize(canonical);
    const encrypted = encryptJson(canonical, snapshotPurpose(sessionId, input.completedPass), keyring);
    const snapshot = await tx.patternworkV31AssessmentSnapshot.create({
      data: {
        id: snapshotId,
        assessmentSessionId: sessionId,
        snapshotId,
        snapshotRevision: "1",
        completedPass: input.completedPass,
        completionMode: completionBoundary.completionMode,
        lastCompletedStage: completionBoundary.lastCompletedStage,
        safeResumeStage: completionBoundary.safeResumeStage,
        contractId: PWQE5_SOURCE_RELEASE,
        integrityContractId: "patternwork-router-evidence-v1",
        packetVersion: "urn:patternwork:router-evidence:1",
        evidenceSha256: sha256(String(routerPacket.content_sha256)),
        scopeSha256: sha256(canonicalize(routerPacket.assessment_scope)),
        canonicalJsonSha256: sha256(canonicalString),
        canonicalJsonCiphertext: prismaBytes(encrypted.ciphertext),
        canonicalJsonNonce: prismaBytes(encrypted.nonce),
        encryptionKeyVersion: encrypted.keyVersion,
        completedAt: timestamp,
      },
    });
    const shouldContinue = input.completedPass === 1 && input.action === "continue";
    const optedInTopics = validatePwqe5OptedInTopics(source, input.optedInTopics);
    const nextState = shouldContinue ? startPwqe5Deepening(state, optedInTopics, source) : state;
    const encryptedNextState = encryptJson(nextState, statePurpose(sessionId), keyring);
    const nextStatus = input.completedPass === 2 ? "COMPLETE" : shouldContinue ? "PASS2_IN_PROGRESS" : "PASS1_COMPLETE";
    const updated = await tx.patternworkV31AssessmentSession.updateMany({
      where: { id: sessionId, optimisticRevision: input.expectedRevision },
      data: {
        status: nextStatus,
        currentPass: shouldContinue ? 2 : input.completedPass,
        currentStage: pwqe5StageForState(nextState),
        safeResumeStage: pwqe5StageForState(nextState),
        stateCiphertext: prismaBytes(encryptedNextState.ciphertext),
        stateNonce: prismaBytes(encryptedNextState.nonce),
        encryptionKeyVersion: encryptedNextState.keyVersion,
        optimisticRevision: { increment: 1 },
        completedAt: input.completedPass === 2 ? timestamp : null,
        expiresAt: input.completedPass === 2 ? null : abandonedRetentionExpiresAt(timestamp),
        retentionExpiresAt: input.completedPass === 2 ? completedRetentionExpiresAt(timestamp) : abandonedRetentionExpiresAt(timestamp),
      },
    });
    if (updated.count !== 1) throw new AssessmentError("conflict", "Assessment state has changed.");
    const workflowInput = await createReportAttemptWithClient(tx as unknown as AttemptTransaction, { snapshotDatabaseId: snapshot.id, assessmentSessionId: sessionId, snapshotId: snapshot.snapshotId, completedPass: input.completedPass, requestedBy: "COMPLETION", now: timestamp });
    const queued = await getAssessmentStateWithClient(tx, sessionId, keyring);
    return { ...queued, snapshotId: snapshot.id, workflowInput };
  }, { isolationLevel: "Serializable" });
  // The workflow boundary is idempotent by immutable snapshot ID. It is invoked only
  // after commit so a worker can never observe a snapshot that later rolls back.
  if (!frozen.workflowInput) {
    return { state: frozen.state, snapshotId: frozen.snapshotId, ...(frozen.existingWorkflowRunId ? { workflowRunId: frozen.existingWorkflowRunId } : {}) };
  }
  try {
    const workflow = await enqueueWorkflow(frozen.workflowInput);
    if (frozen.workflowInput.attemptId) await reportAttemptNotification(frozen.workflowInput.attemptId, "REPORT_STARTED");
    return { state: frozen.state, snapshotId: frozen.snapshotId, workflowRunId: workflow.workflowRunId, watchdogRunId: workflow.watchdogRunId };
  } catch {
    if (frozen.workflowInput.attemptId) await reportAttemptNotification(frozen.workflowInput.attemptId, "REPORT_FAILED");
    const failed = await getAssessmentState(sessionId, dependencies);
    return { state: failed.state, snapshotId: frozen.snapshotId };
  }
}

export async function purgeAssessmentSession(sessionId: string, dependencies: AssessmentServiceDependencies = {}): Promise<void> {
  const { db } = deps(dependencies);
  await db.$transaction(async (tx) => {
    const notifications = await tx.patternworkV31Notification.findMany({ where: { assessmentSessionId: sessionId }, select: { providerMessageId: true, resendMessageId: true } });
    const notificationMessageIds = notifications.flatMap((notification) => [notification.providerMessageId, notification.resendMessageId]).filter((value): value is string => Boolean(value));
    const snapshots = await tx.patternworkV31AssessmentSnapshot.findMany({ where: { assessmentSessionId: sessionId }, select: { id: true } });
    const snapshotIds = snapshots.map(({ id }) => id);
    const runs = await tx.patternworkV31ReportRun.findMany({ where: { assessmentSnapshotId: { in: snapshotIds } }, select: { id: true } });
    const runIds = runs.map(({ id }) => id);
    const artifacts = await tx.patternworkV31ReportArtifact.findMany({ where: { reportRunId: { in: runIds } }, select: { id: true } });
    const artifactIds = artifacts.map(({ id }) => id);
    const deliveries = await tx.patternworkV31ReportDelivery.findMany({ where: { reportArtifactId: { in: artifactIds } }, select: { providerMessageId: true, resendMessageId: true } });
    const deliveryMessageIds = deliveries.flatMap((delivery) => [delivery.providerMessageId, delivery.resendMessageId]).filter((value): value is string => Boolean(value));
    const webhookMessageIds = [...new Set([...notificationMessageIds, ...deliveryMessageIds])];
    if (webhookMessageIds.length > 0) await tx.patternworkV31NotificationWebhookEvent.deleteMany({ where: { providerMessageId: { in: webhookMessageIds } } });
    await tx.patternworkV31Notification.deleteMany({ where: { assessmentSessionId: sessionId } });
    await tx.patternworkV31ReportDelivery.deleteMany({ where: { reportArtifactId: { in: artifactIds } } });
    await tx.patternworkV31ReportArtifact.deleteMany({ where: { id: { in: artifactIds } } });
    await tx.patternworkV31ReportRun.deleteMany({ where: { id: { in: runIds } } });
    await tx.patternworkV31ReportWorkflowAttempt.deleteMany({ where: { assessmentSnapshotId: { in: snapshotIds } } });
    await tx.patternworkV31EvidencePacket.deleteMany({ where: { assessmentSnapshotId: { in: snapshotIds } } });
    await tx.patternworkV31AssessmentSnapshot.deleteMany({ where: { id: { in: snapshotIds } } });
    await tx.patternworkV31AssessmentResponse.deleteMany({ where: { assessmentSessionId: sessionId } });
    await tx.patternworkV31AccessToken.deleteMany({ where: { assessmentSessionId: sessionId } });
    await tx.patternworkV31AssessmentSession.delete({ where: { id: sessionId } });
  });
}

export async function purgeExpiredAssessmentSessions(dependencies: AssessmentServiceDependencies = {}) {
  const { db, now } = deps(dependencies);
  const candidates = await db.patternworkV31AssessmentSession.findMany({ select: { id: true, status: true, updatedAt: true, completedAt: true } });
  const plan = planExpiredAssessmentDeletion(candidates, now());
  for (const sessionId of [...plan.abandonedSessionIds, ...plan.completedSessionIds]) await purgeAssessmentSession(sessionId, dependencies);
  return plan;
}
