import { createHash } from "node:crypto";
import type { JsonValue, LayerReportType, LayerSectionCode } from "../../question-engine/types.ts";
import { getBankItem, LAYER_SECTION_CODES } from "../../question-engine/manifest.ts";
import type { ReportEvidencePacketV3_1 } from "../../report-contracts/types.ts";
import type { DecryptedAssessmentSnapshot } from "./types.ts";

interface CanonicalResponse {
  readonly responseId: string;
  readonly interactionInstanceId: string;
  readonly bankItemId: string;
  readonly bankItemVersion: string;
  readonly administrationSequence: number;
  readonly stage: string;
  readonly completionState: string;
  readonly responseOrder: readonly string[];
  readonly content: unknown;
}

const PROHIBITIONS = [
  "no_diagnosis",
  "no_trauma_or_developmental_origin_inference",
  "no_exile_identity_age_or_history_inference",
  "no_physiological_measurement_claim",
  "no_global_attachment_style_without_cross_context_evidence",
  "no_unattributed_quote",
  "no_raw_answer_list_inference",
  "no_unsupported_section_filler",
] as const;

/** Source-derived conservative coverage routing by interaction family; it never promotes evidence above low/Amber. */
const FAMILY_SECTION_MAP: Readonly<Record<string, readonly LayerSectionCode[]>> = {
  RL: ["IFS-01", "IFS-12", "PV-01", "PV-11", "ATT-01", "ATT-12"],
  MS: ["IFS-02", "IFS-03", "IFS-05", "PV-02", "PV-06", "ATT-02", "ATT-03", "ATT-04", "ATT-05", "ATT-06"],
  BDA: ["IFS-03", "IFS-06", "IFS-07", "IFS-09", "PV-04", "PV-05", "PV-06", "PV-07", "PV-08", "ATT-02", "ATT-07", "ATT-08"],
  BTM: ["IFS-06", "PV-02", "PV-03", "PV-04", "PV-05", "PV-06", "PV-07"],
  FSR: ["PV-04", "PV-05", "PV-06"],
  VFR: ["IFS-02", "IFS-04", "IFS-05", "ATT-03", "ATT-04"],
  RLB: ["IFS-03", "IFS-06", "IFS-07", "IFS-09", "PV-08", "PV-09"],
  BSP: ["IFS-03", "IFS-05", "IFS-07", "IFS-09"],
  PIS: ["IFS-02", "IFS-08", "IFS-12"],
  PDL: ["IFS-08", "IFS-09"],
  RMX: ["ATT-02", "ATT-05", "ATT-06", "ATT-08", "ATT-09", "ATT-11"],
  PCR: ["ATT-05", "ATT-06", "ATT-07", "ATT-10"],
  RRE: ["IFS-07", "IFS-09", "PV-08", "PV-10", "ATT-07", "ATT-08", "ATT-09"],
  WMA: ["ATT-03", "ATT-04", "ATT-07"],
  RSR: ["IFS-11", "PV-07", "PV-08", "PV-09", "PV-10"],
  SEF: ["IFS-11", "PV-02", "PV-09", "PV-10", "ATT-11"],
  FCF: ["IFS-02", "IFS-12", "PV-11", "ATT-12"],
};

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function pseudonymousId(prefix: string, value: string): string {
  return `${prefix}-${digest(value).slice(0, 24)}`;
}

const SEMANTIC_ID = /^(?:OPT-|OL-)[A-Za-z0-9._-]+$/u;
const SECTION_CODE = /^(?:IFS-(?:0[1-9]|1[0-2])|PV-(?:0[1-9]|1[01])|ATT-(?:0[1-9]|1[0-2]))$/u;
const HORIZONS = new Set(["anticipatory", "immediate", "aftermath", "multi_horizon", "uncertain"]);
const OPTION_ARRAY_FIELDS = ["choices", "rank", "zones", "relationship", "selectedOptionIds", "orderedOptionIds"] as const;
const EPISODE_OPTION_FIELDS = ["Before", "When it first hit", "What happened next", "Later / aftermath"] as const;
const PACE_FIELDS = ["Contact frequency", "Emotional disclosure", "Asking for help", "Space"] as const;

interface TypedEvidence {
  readonly value: JsonValue;
  readonly optionIds: readonly string[];
  readonly coverageSectionCodes: readonly LayerSectionCode[];
  readonly referentOptionId?: string;
  readonly windowOptionId?: string;
  readonly timeHorizon: "anticipatory" | "immediate" | "aftermath" | "multi_horizon" | "uncertain";
  readonly certainty?: number;
  readonly safetyContext?: "safe" | "mixed" | "unsafe" | "unknown";
  readonly evidenceDisposition: "observed" | "missing";
  readonly objectEvidence?: {
    readonly kind: "part_cluster" | "state_signature" | "attachment_pattern";
    readonly candidateKey: string;
    readonly identityStatus?: "confirmed" | "cluster_only" | "uncertain" | "rejected";
    readonly roleClass?: "manager" | "firefighter" | "mixed" | "uncertain";
    readonly classification?: "baseline" | "activated" | "shutdown" | "mixed" | "connected" | "uncertain";
    readonly anxietyEstimate?: "low" | "moderate" | "high" | "variable" | "underdetermined";
    readonly avoidanceEstimate?: "low" | "moderate" | "high" | "variable" | "underdetermined";
    readonly bodyRegionIds: readonly string[];
    readonly entryOptionIds: readonly string[];
    readonly exitOptionIds: readonly string[];
    readonly directFieldOptionIds: readonly string[];
    readonly cueOptionIds: readonly string[];
    readonly meaningOptionIds: readonly string[];
    readonly moveOptionIds: readonly string[];
    readonly referentOptionId?: string;
    readonly fitConfirmed: boolean;
    readonly contradicted: boolean;
  };
}

/** Project only contract-enumerated typed values. privateNote and every unknown/free-text field are ignored. */
function typedEvidence(value: unknown): TypedEvidence {
  const envelope = object(value);
  const semantic = envelope?.schemaVersion === "PWRS-1" ? object(envelope.semantic) ?? {} : {};
  const optionIds: string[] = [];
  const addOptions = (candidate: unknown) => {
    const values = Array.isArray(candidate) ? candidate : [candidate];
    for (const entry of values) if (typeof entry === "string" && SEMANTIC_ID.test(entry) && !optionIds.includes(entry)) optionIds.push(entry);
  };
  OPTION_ARRAY_FIELDS.forEach((key) => addOptions(semantic[key]));
  EPISODE_OPTION_FIELDS.forEach((key) => addOptions(semantic[key]));
  PACE_FIELDS.forEach((key) => addOptions(semantic[key]));
  addOptions(semantic["Person / role 1"]);
  addOptions(semantic["Person / role 2"]);
  const episodeFields = Object.fromEntries(EPISODE_OPTION_FIELDS.flatMap((key) => typeof semantic[key] === "string" && SEMANTIC_ID.test(semantic[key]) ? [[key === "Before" ? "before" : key === "When it first hit" ? "first_impact" : key === "What happened next" ? "next_action" : "aftermath", semantic[key]]] : []));
  const paceBands = Object.fromEntries(PACE_FIELDS.flatMap((key) => typeof semantic[key] === "string" && SEMANTIC_ID.test(semantic[key]) ? [[key.toLowerCase().replaceAll(/[^a-z]+/gu, "_"), semantic[key]]] : []));
  const coverageSectionCodes = Array.isArray(semantic.coverageSectionCodes)
    ? semantic.coverageSectionCodes.filter((entry): entry is LayerSectionCode => typeof entry === "string" && SECTION_CODE.test(entry))
    : [];
  const certainty = typeof semantic.certainty === "number" && Number.isFinite(semantic.certainty) && semantic.certainty >= 0 && semantic.certainty <= 1 ? semantic.certainty : undefined;
  const timeHorizon = typeof semantic.timeHorizon === "string" && HORIZONS.has(semantic.timeHorizon) ? semantic.timeHorizon as TypedEvidence["timeHorizon"] : "uncertain";
  const safetyContext = ["safe", "mixed", "unsafe", "unknown"].includes(String(semantic.safetyContext)) ? semantic.safetyContext as TypedEvidence["safetyContext"] : undefined;
  const rawObjectEvidence = object(semantic.objectEvidence);
  const objectKind = rawObjectEvidence && ["part_cluster", "state_signature", "attachment_pattern"].includes(String(rawObjectEvidence.kind)) ? rawObjectEvidence.kind as "part_cluster" | "state_signature" | "attachment_pattern" : undefined;
  const objectEvidence = objectKind && typeof rawObjectEvidence?.candidateKey === "string" && SEMANTIC_ID.test(rawObjectEvidence.candidateKey) ? {
    kind: objectKind,
    candidateKey: rawObjectEvidence.candidateKey,
    ...(["confirmed", "cluster_only", "uncertain", "rejected"].includes(String(rawObjectEvidence.identityStatus)) ? { identityStatus: rawObjectEvidence.identityStatus as "confirmed" | "cluster_only" | "uncertain" | "rejected" } : {}),
    ...(["manager", "firefighter", "mixed", "uncertain"].includes(String(rawObjectEvidence.roleClass)) ? { roleClass: rawObjectEvidence.roleClass as "manager" | "firefighter" | "mixed" | "uncertain" } : {}),
    ...(["baseline", "activated", "shutdown", "mixed", "connected", "uncertain"].includes(String(rawObjectEvidence.classification)) ? { classification: rawObjectEvidence.classification as "baseline" | "activated" | "shutdown" | "mixed" | "connected" | "uncertain" } : {}),
    ...(["low", "moderate", "high", "variable", "underdetermined"].includes(String(rawObjectEvidence.anxietyEstimate)) ? { anxietyEstimate: rawObjectEvidence.anxietyEstimate as "low" | "moderate" | "high" | "variable" | "underdetermined" } : {}),
    ...(["low", "moderate", "high", "variable", "underdetermined"].includes(String(rawObjectEvidence.avoidanceEstimate)) ? { avoidanceEstimate: rawObjectEvidence.avoidanceEstimate as "low" | "moderate" | "high" | "variable" | "underdetermined" } : {}),
    bodyRegionIds: Array.isArray(rawObjectEvidence.bodyRegionIds) ? rawObjectEvidence.bodyRegionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    entryOptionIds: Array.isArray(rawObjectEvidence.entryOptionIds) ? rawObjectEvidence.entryOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    exitOptionIds: Array.isArray(rawObjectEvidence.exitOptionIds) ? rawObjectEvidence.exitOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    directFieldOptionIds: Array.isArray(rawObjectEvidence.directFieldOptionIds) ? rawObjectEvidence.directFieldOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    cueOptionIds: Array.isArray(rawObjectEvidence.cueOptionIds) ? rawObjectEvidence.cueOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    meaningOptionIds: Array.isArray(rawObjectEvidence.meaningOptionIds) ? rawObjectEvidence.meaningOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    moveOptionIds: Array.isArray(rawObjectEvidence.moveOptionIds) ? rawObjectEvidence.moveOptionIds.filter((entry): entry is string => typeof entry === "string" && SEMANTIC_ID.test(entry)) : [],
    ...(typeof rawObjectEvidence.referentOptionId === "string" && SEMANTIC_ID.test(rawObjectEvidence.referentOptionId) ? { referentOptionId: rawObjectEvidence.referentOptionId } : {}),
    fitConfirmed: rawObjectEvidence.fitConfirmed === true,
    contradicted: rawObjectEvidence.contradicted === true,
  } : undefined;
  const typedValue: Record<string, JsonValue> = {
    selected_option_ids: optionIds,
    episode_fields: episodeFields,
    pace_band_ids: paceBands,
    time_horizon: timeHorizon,
    coverage_section_codes: coverageSectionCodes,
  };
  if (certainty !== undefined) typedValue.user_certainty = certainty;
  if (safetyContext !== undefined) typedValue.safety_context = safetyContext;
  if (["low", "unknown", "elevated", "high"].includes(String(semantic.userArousal))) typedValue.user_arousal = semantic.userArousal as string;
  if (typeof semantic.resourceSafetyClear === "boolean") typedValue.resource_safety_clear = semantic.resourceSafetyClear;
  if (typeof semantic.eligible === "boolean") typedValue.eligible = semantic.eligible;
  const evidenceDisposition = semantic.evidenceDisposition === "missing" ? "missing" : "observed";
  typedValue.evidence_disposition = evidenceDisposition;
  if (objectEvidence) typedValue.object_evidence = objectEvidence as unknown as JsonValue;
  return {
    value: typedValue,
    optionIds,
    coverageSectionCodes,
    ...(typeof semantic.referentOptionId === "string" && SEMANTIC_ID.test(semantic.referentOptionId) ? { referentOptionId: semantic.referentOptionId } : {}),
    ...(typeof semantic.windowOptionId === "string" && SEMANTIC_ID.test(semantic.windowOptionId) ? { windowOptionId: semantic.windowOptionId } : {}),
    timeHorizon,
    ...(certainty !== undefined ? { certainty } : {}),
    ...(safetyContext ? { safetyContext } : {}),
    ...(objectEvidence ? { objectEvidence } : {}),
    evidenceDisposition,
  };
}

function hasSubstantiveTypedEvidence(evidence: TypedEvidence): boolean {
  if (evidence.evidenceDisposition === "missing") return false;
  if (evidence.optionIds.length > 0) return true;
  const candidate = evidence.objectEvidence;
  return Boolean(candidate && (candidate.fitConfirmed || candidate.identityStatus === "confirmed" || candidate.directFieldOptionIds.length > 0 || candidate.bodyRegionIds.length > 0 || candidate.entryOptionIds.length > 0 || candidate.exitOptionIds.length > 0 || candidate.cueOptionIds.length > 0 || candidate.meaningOptionIds.length > 0 || candidate.moveOptionIds.length > 0));
}

/** Retain a provenance-only shell for legacy answered records without treating their values as typed evidence. */
function hasLegacyResponsePresence(value: unknown): boolean {
  const legacy = object(value);
  if (!legacy || legacy.schemaVersion === "PWRS-1") return false;
  const excluded = /^(?:note|notes|narrative|free_?text|private_?note|metadata|routing_?state)$/iu;
  return Object.entries(legacy).some(([key, candidate]) => {
    if (excluded.test(key) || candidate === null || candidate === undefined) return false;
    if (typeof candidate === "string") return candidate.trim().length > 0;
    if (Array.isArray(candidate)) return candidate.length > 0;
    return typeof candidate === "number" || typeof candidate === "boolean" || Object.keys(object(candidate) ?? {}).length > 0;
  });
}

function canonicalResponses(snapshot: DecryptedAssessmentSnapshot): CanonicalResponse[] {
  const values = snapshot.canonicalSnapshot.responses;
  if (!Array.isArray(values)) throw new Error("Canonical snapshot must contain ordered responses[].");
  return values.map((value, index) => {
    const response = object(value);
    if (!response || typeof response.responseId !== "string" || typeof response.interactionInstanceId !== "string" || typeof response.bankItemId !== "string") {
      throw new Error(`Canonical response ${index} lacks stable response, interaction, or bank-item identity.`);
    }
    const sequence = response.administrationSequence;
    if (typeof sequence !== "number" || !Number.isInteger(sequence) || sequence < 1) throw new Error(`Canonical response ${index} lacks deterministic administrationSequence.`);
    return {
      responseId: response.responseId,
      interactionInstanceId: response.interactionInstanceId,
      bankItemId: response.bankItemId,
      bankItemVersion: typeof response.bankItemVersion === "string" ? response.bankItemVersion : getBankItem(response.bankItemId)?.version ?? "unknown",
      administrationSequence: sequence,
      stage: typeof response.stage === "string" ? response.stage : "S0",
      completionState: typeof response.completionState === "string" ? response.completionState : "SKIPPED",
      responseOrder: Array.isArray(response.responseOrder) ? response.responseOrder.filter((item): item is string => typeof item === "string" && SEMANTIC_ID.test(item)) : [],
      content: object(response.content)?.response ?? response.content ?? null,
    };
  }).sort((left, right) => left.administrationSequence - right.administrationSequence);
}

export function buildPseudonymousPacketsFromCanonicalSnapshot(snapshot: DecryptedAssessmentSnapshot): readonly ReportEvidencePacketV3_1[] {
  const responses = canonicalResponses(snapshot);
  const completedResponses = responses.filter((response) => response.completionState === "COMPLETED");
  if (completedResponses.length === 0) throw new Error("Canonical snapshot contains no completed responses from which to build evidence packets.");
  const completion = object(snapshot.canonicalSnapshot.assessment_completion);
  const generatedAt = typeof completion?.completed_at === "string" && Number.isFinite(Date.parse(completion.completed_at))
    ? completion.completed_at
    : new Date(0).toISOString();
  const typedByResponse = new Map(completedResponses.map((response) => [response.responseId, typedEvidence(response.content)]));
  const completed = completedResponses.filter((response) => hasSubstantiveTypedEvidence(typedByResponse.get(response.responseId)!));
  const episodeResponses = completedResponses.filter((response) => hasSubstantiveTypedEvidence(typedByResponse.get(response.responseId)!) || hasLegacyResponsePresence(response.content));
  const firstReferent = completed.map((response) => typedByResponse.get(response.responseId)?.referentOptionId).find((value): value is string => Boolean(value));
  const firstWindow = completed.map((response) => typedByResponse.get(response.responseId)?.windowOptionId).find((value): value is string => Boolean(value));
  const windowId = pseudonymousId("WIN", `${snapshot.snapshotId}:${firstWindow ?? "snapshot"}`);
  const referentId = pseudonymousId("REF", `${snapshot.snapshotId}:${firstReferent ?? "unspecified"}`);
  const safetyValues = completed.map((response) => typedByResponse.get(response.responseId)?.safetyContext);
  const relationshipSafety = safetyValues.includes("unsafe") ? "coercive" : safetyValues.includes("mixed") ? "mixed" : safetyValues.includes("safe") ? "generally_safe" : "unknown";
  const certaintyValues = completed.map((response) => typedByResponse.get(response.responseId)?.certainty).filter((value): value is number => value !== undefined);
  const relationshipContext = {
    referent_id: referentId,
    relationship_type: "other",
    current_relevance: "uncertain",
    safety: relationshipSafety,
    reliability: "unknown",
    certainty: certaintyValues.length > 0 ? Math.min(...certaintyValues) : 0,
    provenance: [],
  } as const;
  const episodes = episodeResponses.map((response) => {
    const item = getBankItem(response.bankItemId);
    if (!item) throw new Error(`Canonical response references unknown bank item ${response.bankItemId}.`);
    const responseId = pseudonymousId("RR", response.responseId);
    const episodeId = pseudonymousId("EP", `${snapshot.snapshotId}:${response.interactionInstanceId}`);
    const evidence = typedByResponse.get(response.responseId)!;
    const provenance = {
      interaction_instance_id: pseudonymousId("RI", response.interactionInstanceId),
      family_code: item.family,
      bank_item_id: item.bankItemId,
      bank_item_version: response.bankItemVersion,
      response_ids: [responseId],
      signal_class: "direct",
      capture_mode: response.responseOrder.length > 0 ? "selected_option" : "derived",
      session_id: pseudonymousId("SESSION", snapshot.snapshotId),
      sequence: response.administrationSequence,
      presented_option_ids: response.responseOrder,
      recorded_at: generatedAt,
    } as const;
    const substantive = hasSubstantiveTypedEvidence(evidence);
    const statement = (field: string, value: JsonValue) => ({ field, value, provenance });
    return {
      episode_id: episodeId,
      window_id: windowId,
      referent_id: referentId,
      relationship_context: relationshipContext,
      life_domain: `interaction_family_${item.family}`,
      trigger: statement("administered_bank_item", item.bankItemId),
      time_horizon: evidence.timeHorizon,
      actual_first_action: statement("typed_semantic_response", substantive ? evidence.value : { selected_option_ids: [], evidence_disposition: "missing" }),
      ...(evidence.certainty !== undefined ? { user_certainty: evidence.certainty } : {}),
      source_response_ids: [responseId],
      provenance: [provenance],
      confidence: {
        grade: substantive ? "low" : "unsupported",
        evidence_grades: substantive ? ["direct_single"] : [],
        rationale: substantive ? "One attributable completed interaction; no replication or confirmation is inferred by the deterministic builder." : "A legacy response was present, but no supported typed semantic evidence could be admitted.",
        source_evidence_ids: [episodeId],
        open_contradiction_ids: [],
        limits: ["Only allowlisted typed semantics were admitted; encrypted notes and unknown fields were excluded."],
        assessed_at: generatedAt,
      },
      contradiction_ids: [],
    };
  });
  const episodeByResponse = new Map(episodeResponses.map((response, index) => [response.responseId, episodes[index]]));
  const episodeByFamily = new Map<string, string[]>();
  completed.forEach((response) => {
    const family = getBankItem(response.bankItemId)?.family;
    if (!family) return;
    const evidence = typedByResponse.get(response.responseId)!;
    const episode = episodeByResponse.get(response.responseId);
    if (evidence.optionIds.length > 0 || evidence.coverageSectionCodes.length > 0 || evidence.certainty !== undefined) {
      if (episode) episodeByFamily.set(family, [...(episodeByFamily.get(family) ?? []), episode.episode_id]);
    }
  });
  const objectGroups = new Map<string, { response: CanonicalResponse; evidence: TypedEvidence; episode: typeof episodes[number]; family: string }[]>();
  completed.forEach((response) => {
    const evidence = typedByResponse.get(response.responseId)!;
    const family = getBankItem(response.bankItemId)?.family;
    const episode = episodeByResponse.get(response.responseId);
    if (!family || !evidence.objectEvidence || !episode) return;
    const key = `${evidence.objectEvidence.kind}:${evidence.objectEvidence.candidateKey}`;
    objectGroups.set(key, [...(objectGroups.get(key) ?? []), { response, evidence, episode, family }]);
  });
  const partProfiles: JsonValue[] = [];
  const stateSignatures: JsonValue[] = [];
  const attachmentPatterns: JsonValue[] = [];
  const PART_DIRECT = new Set(["MS", "BDA", "VFR", "RLB", "BSP", "PIS", "PDL"]);
  const STATE_DIRECT = new Set(["BDA", "BTM", "FSR", "RSR"]);
  const ATTACHMENT_DIRECT = new Set(["MS", "BDA", "WMA", "RRE", "PCR", "RMX"]);
  for (const entries of objectGroups.values()) {
    const exemplar = entries[0]?.evidence.objectEvidence;
    if (!exemplar || entries.some((entry) => entry.evidence.objectEvidence?.contradicted)) continue;
    const fit = entries.some((entry) => entry.family === "FCF" && entry.evidence.objectEvidence?.fitConfirmed === true);
    const directFor = (families: ReadonlySet<string>) => entries.filter((entry) => families.has(entry.family) && (entry.evidence.objectEvidence?.directFieldOptionIds.length ?? 0) > 0);
    const confidence = (objectId: string, episodeIds: readonly string[]) => ({
      grade: "medium", evidence_grades: ["replicated", "user_confirmed"],
      rationale: "Two independent typed direct episode anchors and explicit fit confirmation satisfy the bounded object floor.",
      source_evidence_ids: [objectId, ...episodeIds], open_contradiction_ids: [], limits: ["Object semantics are limited to explicitly typed fields and authored family mappings."], assessed_at: generatedAt,
    });
    if (exemplar.kind === "part_cluster") {
      const direct = directFor(PART_DIRECT);
      const episodeIds = [...new Set(direct.map((entry) => entry.episode.episode_id))];
      const confirmation = entries.find((entry) => entry.family === "FCF" && entry.evidence.objectEvidence?.identityStatus === "confirmed");
      if (episodeIds.length < 2 || !confirmation || !fit) continue;
      const partId = pseudonymousId("PT", `${snapshot.snapshotId}:${exemplar.candidateKey}`);
      partProfiles.push({
        part_id: partId, status: "confirmed_part", role_class: exemplar.roleClass ?? "uncertain", supporting_episode_ids: episodeIds,
        identity_confirmation: { status: "confirmed", source_response_ids: [pseudonymousId("RR", confirmation.response.responseId)], provenance: confirmation.episode.provenance },
        confidence: confidence(partId, episodeIds), contradiction_ids: [],
      } as unknown as JsonValue);
    } else if (exemplar.kind === "state_signature") {
      const direct = directFor(STATE_DIRECT);
      const episodeIds = [...new Set(direct.map((entry) => entry.episode.episode_id))];
      const regions = [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.bodyRegionIds ?? []))];
      const entryIds = [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.entryOptionIds ?? []))];
      const exitIds = [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.exitOptionIds ?? []))];
      const classifications = [...new Set(direct.map((entry) => entry.evidence.objectEvidence?.classification).filter((value): value is NonNullable<typeof exemplar.classification> => Boolean(value) && value !== "uncertain"))];
      if (episodeIds.length < 2 || regions.length < 2 || entryIds.length + exitIds.length < 1 || classifications.length !== 1 || !fit) continue;
      const stateId = pseudonymousId("ST", `${snapshot.snapshotId}:${exemplar.candidateKey}`);
      const provenance = direct[0].episode.provenance[0];
      const statement = (field: string, value: JsonValue) => ({ field, value, provenance });
      stateSignatures.push({
        state_id: stateId, descriptive_name: `Repeated self-reported ${classifications[0]} signature`, classification: classifications[0], interpretive_limit: "self_reported_signature_not_physiological_measurement",
        supporting_episode_ids: episodeIds, body_regions: regions.map((region) => ({ region, direction: "uncertain", qualities: [] })),
        entry_paths: entryIds.map((id) => statement("typed_entry_option_id", id)), exit_paths: exitIds.map((id) => statement("typed_exit_option_id", id)),
        confidence: confidence(stateId, episodeIds), contradiction_ids: [],
      } as unknown as JsonValue);
    } else {
      const direct = entries.filter((entry) => ATTACHMENT_DIRECT.has(entry.family) && (entry.evidence.objectEvidence?.cueOptionIds.length ?? 0) > 0 && ((entry.evidence.objectEvidence?.meaningOptionIds.length ?? 0) > 0 || (entry.evidence.objectEvidence?.moveOptionIds.length ?? 0) > 0));
      const episodeIds = [...new Set(direct.map((entry) => entry.episode.episode_id))];
      const referents = [...new Set(direct.map((entry) => entry.evidence.objectEvidence?.referentOptionId).filter((value): value is string => Boolean(value)))];
      const anxieties = [...new Set(direct.map((entry) => entry.evidence.objectEvidence?.anxietyEstimate).filter((value): value is NonNullable<typeof exemplar.anxietyEstimate> => Boolean(value) && value !== "underdetermined"))];
      const avoidances = [...new Set(direct.map((entry) => entry.evidence.objectEvidence?.avoidanceEstimate).filter((value): value is NonNullable<typeof exemplar.avoidanceEstimate> => Boolean(value) && value !== "underdetermined"))];
      if (episodeIds.length < 2 || referents.length !== 1 || anxieties.length !== 1 || avoidances.length !== 1 || !fit) continue;
      const patternId = pseudonymousId("AP", `${snapshot.snapshotId}:${exemplar.candidateKey}:${referents[0]}`);
      const attachmentReferentId = pseudonymousId("REF", `${snapshot.snapshotId}:${referents[0]}`);
      const provenance = direct[0].episode.provenance[0];
      const statement = (field: string, value: JsonValue) => ({ field, value, provenance });
      attachmentPatterns.push({
        pattern_id: patternId, referent_id: attachmentReferentId, relationship_context: { ...relationshipContext, referent_id: attachmentReferentId },
        scope_limit: "relationship_specific_unless_cross_context_evidence_is_present", anxiety_estimate: anxieties[0], avoidance_estimate: avoidances[0],
        ambiguity_cues: [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.cueOptionIds ?? []))].map((id) => statement("typed_cue_option_id", id)),
        first_interpretations: [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.meaningOptionIds ?? []))].map((id) => statement("typed_meaning_option_id", id)),
        proximity_seeking_impulses: [...new Set(direct.flatMap((entry) => entry.evidence.objectEvidence?.moveOptionIds ?? []))].map((id) => statement("typed_move_option_id", id)),
        supporting_episode_ids: episodeIds, confidence: confidence(patternId, episodeIds), contradiction_ids: [],
      } as unknown as JsonValue);
    }
  }
  const objectSupportBySection: Readonly<Record<string, readonly JsonValue[]>> = {
    "IFS-02": partProfiles, "IFS-03": partProfiles, "IFS-12": partProfiles,
    "PV-03": stateSignatures, "PV-04": stateSignatures, "PV-05": stateSignatures, "PV-06": stateSignatures, "PV-07": stateSignatures, "PV-11": stateSignatures,
    "ATT-02": attachmentPatterns, "ATT-03": attachmentPatterns, "ATT-05": attachmentPatterns, "ATT-07": attachmentPatterns, "ATT-08": attachmentPatterns, "ATT-12": attachmentPatterns,
  };
  const cells = LAYER_SECTION_CODES.map((sectionCode) => {
    const explicitlyCovered = completed.flatMap((response) => {
      const episode = episodeByResponse.get(response.responseId);
      return episode && typedByResponse.get(response.responseId)?.coverageSectionCodes.includes(sectionCode) ? [episode.episode_id] : [];
    });
    const supporting = [...new Set([...explicitlyCovered, ...[...episodeByFamily.entries()]
      .filter(([family]) => FAMILY_SECTION_MAP[family]?.includes(sectionCode))
      .flatMap(([, ids]) => ids)])];
    const objectSupport = objectSupportBySection[sectionCode] ?? [];
    const objectIds = objectSupport.map((value) => object(value)?.part_id ?? object(value)?.state_id ?? object(value)?.pattern_id).filter((value): value is string => typeof value === "string");
    const objectEpisodeIds = objectSupport.flatMap((value) => Array.isArray(object(value)?.supporting_episode_ids) ? object(value)!.supporting_episode_ids as string[] : []);
    const allSupporting = [...new Set([...supporting, ...objectEpisodeIds])];
    const families = [...episodeByFamily.keys()].filter((family) => FAMILY_SECTION_MAP[family]?.includes(sectionCode));
    return {
      coverage_id: `CV-${sectionCode}`,
      section_code: sectionCode,
      applicability: "undetermined",
      routing_state: objectIds.length > 0 ? "green" : supporting.length > 0 ? "amber" : "red",
      confidence: objectIds.length > 0 ? "medium" : supporting.length > 0 ? "low" : "unsupported",
      confidence_rationale: objectIds.length > 0 ? "A schema-valid object met direct replication and confirmation floors." : supporting.length > 0 ? "Direct single-interaction evidence only." : "No source-derived interaction family mapped to this section.",
      required_fields: ["typed structured evidence with section-specific semantics"],
      satisfied_fields: objectIds.length > 0 ? ["typed direct fields", "independent replication", "explicit fit confirmation"] : supporting.length > 0 ? ["one attributable completed interaction"] : [],
      missing_fields: objectIds.length > 0 ? [] : ["section-specific typed fields", "replication or explicit confirmation"],
      applicability_evidence_ids: [],
      applicability_response_ids: [],
      evidence_grades: objectIds.length > 0 ? ["replicated", "user_confirmed"] : supporting.length > 0 ? ["direct_single"] : [],
      independent_episode_ids: allSupporting,
      independent_episode_count: allSupporting.length,
      context_count: allSupporting.length > 0 ? 1 : 0,
      supporting_evidence_ids: [...objectIds, ...allSupporting],
      open_contradiction_ids: [],
      intentional_limit: "Conservative deterministic routing; the builder never promotes generic persisted responses above low/Amber.",
      eligible_next_families: families,
      updated_at: generatedAt,
    };
  });
  const assessmentCompletion = snapshot.completedPass === 1
    ? { completion_mode: "pass1_complete", last_completed_stage: "S2", safe_resume_stage: "S3", underdetermined_section_codes: LAYER_SECTION_CODES }
    : { completion_mode: "pass2_complete", last_completed_stage: "S5", safe_resume_stage: "complete", underdetermined_section_codes: LAYER_SECTION_CODES };
  const lastCompleted = completedResponses.at(-1);
  const lastFamily = lastCompleted ? getBankItem(lastCompleted.bankItemId)?.family : undefined;
  const lastEvidence = lastCompleted ? typedByResponse.get(lastCompleted.responseId) : undefined;
  const endingFloor = (lastFamily === "RSR" || lastFamily === "SEF") && Boolean(lastEvidence && (lastEvidence.optionIds.length > 0 || object(lastEvidence.value)?.resource_safety_clear === true));
  const objectFloors = partProfiles.length > 0 && stateSignatures.length > 0 && attachmentPatterns.length > 0;
  const mandatoryCoverageFloor = cells.every((cell) => cell.routing_state === "green" || (cell.routing_state === "amber" && Boolean(cell.intentional_limit)));
  let unresolvedUnsafeContext = false;
  for (const response of completedResponses) {
    const evidence = typedByResponse.get(response.responseId);
    if (evidence?.safetyContext === "unsafe") unresolvedUnsafeContext = true;
    if (["RSR", "SEF"].includes(getBankItem(response.bankItemId)?.family ?? "") && object(evidence?.value)?.resource_safety_clear === true) unresolvedUnsafeContext = false;
  }
  const typedStopEligible = snapshot.completedPass === 2
    && objectFloors
    && mandatoryCoverageFloor
    && endingFloor
    && !unresolvedUnsafeContext;
  return (["IFS", "PV", "ATT"] as const).map((reportType: LayerReportType) => ({
    packet_id: `PKT-${reportType}-${digest(`${snapshot.snapshotId}:${reportType}`).slice(0, 24)}`,
    packet_version: "3.1.0",
    contract_id: "PWQE3-CONTRACT-2",
    integrity_contract_id: "PWQE3-INTEGRITY-1",
    report_type: reportType,
    generated_at: generatedAt,
    snapshot_binding: {
      snapshot_id: snapshot.snapshotId,
      snapshot_revision: snapshot.snapshotRevision,
      evidence_sha256: snapshot.evidenceSha256,
      scope_sha256: snapshot.scopeSha256,
    },
    window_registry: [{ window_id: windowId, label: "Immutable assessment snapshot" }],
    applicable_windows: [windowId],
    relationship_contexts: [relationshipContext],
    episode_evidence: episodes,
    part_profiles: partProfiles,
    state_signatures: stateSignatures,
    attachment_patterns: attachmentPatterns,
    contradictions: [],
    coverage_matrix: { contract_id: "PWQE3-CONTRACT-2", cells, last_updated: generatedAt, stop_eligible: typedStopEligible, stop_rationale: typedStopEligible ? "Typed Pass-2 coverage, fit, ending, and safety gates passed." : "Stop is not claimed because one or more typed Pass-2 coverage, fit, ending, or safety gates are absent." },
    selected_excerpts: [],
    prohibitions: [...PROHIBITIONS],
    assessment_completion: assessmentCompletion,
  })) as unknown as readonly ReportEvidencePacketV3_1[];
}
