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
  return {
    value: typedValue,
    optionIds,
    coverageSectionCodes,
    ...(typeof semantic.referentOptionId === "string" && SEMANTIC_ID.test(semantic.referentOptionId) ? { referentOptionId: semantic.referentOptionId } : {}),
    ...(typeof semantic.windowOptionId === "string" && SEMANTIC_ID.test(semantic.windowOptionId) ? { windowOptionId: semantic.windowOptionId } : {}),
    timeHorizon,
    ...(certainty !== undefined ? { certainty } : {}),
    ...(safetyContext ? { safetyContext } : {}),
  };
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
  const completed = responses.filter((response) => response.completionState === "COMPLETED");
  if (completed.length === 0) throw new Error("Canonical snapshot contains no completed responses from which to build evidence packets.");
  const completion = object(snapshot.canonicalSnapshot.assessment_completion);
  const generatedAt = typeof completion?.completed_at === "string" && Number.isFinite(Date.parse(completion.completed_at))
    ? completion.completed_at
    : new Date(0).toISOString();
  const typedByResponse = new Map(completed.map((response) => [response.responseId, typedEvidence(response.content)]));
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
  const episodes = completed.map((response) => {
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
    const statement = (field: string, value: JsonValue) => ({ field, value, provenance });
    return {
      episode_id: episodeId,
      window_id: windowId,
      referent_id: referentId,
      relationship_context: relationshipContext,
      life_domain: `interaction_family_${item.family}`,
      trigger: statement("administered_bank_item", item.bankItemId),
      time_horizon: evidence.timeHorizon,
      actual_first_action: statement("typed_semantic_response", evidence.value),
      ...(evidence.certainty !== undefined ? { user_certainty: evidence.certainty } : {}),
      source_response_ids: [responseId],
      provenance: [provenance],
      confidence: {
        grade: "low",
        evidence_grades: ["direct_single"],
        rationale: "One attributable completed interaction; no replication or confirmation is inferred by the deterministic builder.",
        source_evidence_ids: [episodeId],
        open_contradiction_ids: [],
        limits: ["Only allowlisted typed semantics were admitted; encrypted notes and unknown fields were excluded."],
        assessed_at: generatedAt,
      },
      contradiction_ids: [],
    };
  });
  const episodeByFamily = new Map<string, string[]>();
  completed.forEach((response, index) => {
    const family = getBankItem(response.bankItemId)?.family;
    if (!family) return;
    const evidence = typedByResponse.get(response.responseId)!;
    if (evidence.optionIds.length > 0 || evidence.coverageSectionCodes.length > 0 || evidence.certainty !== undefined) {
      episodeByFamily.set(family, [...(episodeByFamily.get(family) ?? []), episodes[index].episode_id]);
    }
  });
  const cells = LAYER_SECTION_CODES.map((sectionCode) => {
    const explicitlyCovered = completed.flatMap((response, index) => typedByResponse.get(response.responseId)?.coverageSectionCodes.includes(sectionCode) ? [episodes[index].episode_id] : []);
    const supporting = [...new Set([...explicitlyCovered, ...[...episodeByFamily.entries()]
      .filter(([family]) => FAMILY_SECTION_MAP[family]?.includes(sectionCode))
      .flatMap(([, ids]) => ids)])];
    const families = [...episodeByFamily.keys()].filter((family) => FAMILY_SECTION_MAP[family]?.includes(sectionCode));
    return {
      coverage_id: `CV-${sectionCode}`,
      section_code: sectionCode,
      applicability: "undetermined",
      routing_state: supporting.length > 0 ? "amber" : "red",
      confidence: supporting.length > 0 ? "low" : "unsupported",
      confidence_rationale: supporting.length > 0 ? "Direct single-interaction evidence only." : "No source-derived interaction family mapped to this section.",
      required_fields: ["typed structured evidence with section-specific semantics"],
      satisfied_fields: supporting.length > 0 ? ["one attributable completed interaction"] : [],
      missing_fields: ["section-specific typed fields", "replication or explicit confirmation"],
      applicability_evidence_ids: [],
      applicability_response_ids: [],
      evidence_grades: supporting.length > 0 ? ["direct_single"] : [],
      independent_episode_ids: supporting,
      independent_episode_count: new Set(supporting).size,
      context_count: supporting.length > 0 ? 1 : 0,
      supporting_evidence_ids: supporting,
      open_contradiction_ids: [],
      intentional_limit: "Conservative deterministic routing; the builder never promotes generic persisted responses above low/Amber.",
      eligible_next_families: families,
      updated_at: generatedAt,
    };
  });
  const assessmentCompletion = snapshot.completedPass === 1
    ? { completion_mode: "pass1_complete", last_completed_stage: "S2", safe_resume_stage: "S3", underdetermined_section_codes: LAYER_SECTION_CODES }
    : { completion_mode: "pass2_complete", last_completed_stage: "S5", safe_resume_stage: "complete", underdetermined_section_codes: LAYER_SECTION_CODES };
  const routing = object(snapshot.canonicalSnapshot.routing_state);
  const routingCoverage = object(routing?.coverage);
  const typedStopEligible = snapshot.completedPass === 2
    && routing?.deepeningCompleted === true
    && routing?.fitCompleted === true
    && routing?.endingSatisfied === true
    && routing?.pendingBtmTransition === false
    && routing?.requiresLowIntensityAfterRre === false
    && routing?.safetyContext !== "unsafe"
    && routingCoverage?.deepeningGate === "green";
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
    part_profiles: [],
    state_signatures: [],
    attachment_patterns: [],
    contradictions: [],
    coverage_matrix: { contract_id: "PWQE3-CONTRACT-2", cells, last_updated: generatedAt, stop_eligible: typedStopEligible, stop_rationale: typedStopEligible ? "Typed Pass-2 coverage, fit, ending, and safety gates passed." : "Stop is not claimed because one or more typed Pass-2 coverage, fit, ending, or safety gates are absent." },
    selected_excerpts: [],
    prohibitions: [...PROHIBITIONS],
    assessment_completion: assessmentCompletion,
  })) as unknown as readonly ReportEvidencePacketV3_1[];
}
