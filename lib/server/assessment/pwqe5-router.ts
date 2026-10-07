import type { Pwqe5Question, Pwqe5SourcePackage } from "../../question-engine/pwqe5-source.ts";

/** Canonical respondent input. Routing state, flags, targets and evidence are never accepted here. */
export type Pwqe5ResponseStatus = "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
export type Pwqe5SelectionMode = "single" | "simultaneous" | "order_unknown" | "ordered";
export interface Pwqe5CanonicalResponse {
  readonly responseId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId?: string;
  readonly variantId?: string;
  readonly selectedOptionIds?: readonly string[];
  readonly status?: Pwqe5ResponseStatus;
  readonly mode?: Pwqe5SelectionMode;
  /** A correction supersedes one prior response to the same presentation. */
  readonly supersedesResponseId?: string;
}

export interface Pwqe5RouterInput {
  readonly responses: readonly Pwqe5CanonicalResponse[];
  readonly phase?: "mapping" | "deepening";
  readonly controls?: readonly ("end" | "shorten")[];
  readonly optedInTopics?: readonly string[];
  /** Server-created episode IDs keyed by a prior route's bindingKey; never client input. */
  readonly occurrenceBindings?: Readonly<Record<string, string>>;
  readonly totalLimit?: number;
  readonly mappingLimit?: number;
  readonly decisionLimit?: number;
}

export interface Pwqe5Observation {
  readonly id: string;
  readonly responseId: string;
  readonly questionId: string;
  readonly optionId: string;
  readonly occurrenceId: string;
  readonly stepId: string;
  readonly capture: string;
  readonly reportedValue: string;
  readonly candidateSignals: readonly string[];
}

export interface Pwqe5Episode {
  readonly id: string;
  readonly family: string;
  readonly context: string;
  readonly status: "actual_recalled" | "missing";
  readonly responseIds: readonly string[];
}

export interface Pwqe5EpisodeStep {
  readonly id: string;
  readonly occurrenceId: string;
  readonly responseIds: readonly string[];
  readonly observationIds: readonly string[];
  readonly captures: readonly string[];
}

export interface Pwqe5SequenceEdge {
  readonly id: string;
  readonly occurrenceId: string;
  readonly fromStep: string;
  readonly toStep: string;
  readonly relation: "before" | "simultaneous" | "alternating" | "order_unknown";
  readonly firstNotHelping: boolean;
  readonly responseId: string;
}

export type Pwqe5TargetState = "open" | "supports_interpretation" | "supports_alternative" | "resolved_descriptively" | "unresolved" | "unavailable" | "declined";
export interface Pwqe5TargetResolution {
  readonly id: string;
  readonly targetId: string;
  readonly occurrenceId: string;
  readonly state: Pwqe5TargetState;
  readonly reason: string;
  readonly sourceResponseIds: readonly string[];
  readonly resolutionResponseIds: readonly string[];
  readonly candidateItems: readonly string[];
}

export interface Pwqe5RouteCandidate {
  readonly questionId: string;
  readonly variantId?: string;
  readonly occurrenceId: string | null;
  /** Present when the next question needs a new actual episode bound by the server. */
  readonly bindingKey?: string;
  readonly bindingRequest?: "new_actual_occurrence";
  readonly stepId: string;
  readonly targetIds: readonly string[];
  readonly priority: number;
  readonly stage: "mapping" | "deepening";
}

export interface Pwqe5StructuralFinding {
  readonly code: string;
  readonly occurrenceIds: readonly string[];
  readonly responseIds: readonly string[];
  readonly scope: "occurrence" | "two_distinct_occurrences";
}

export interface Pwqe5RouterResult {
  readonly sourceRelease: string;
  readonly phase: "mapping" | "deepening" | "finished";
  readonly completionReason?: string;
  readonly observations: readonly Pwqe5Observation[];
  readonly episodes: readonly Pwqe5Episode[];
  readonly steps: readonly Pwqe5EpisodeStep[];
  readonly sequenceEdges: readonly Pwqe5SequenceEdge[];
  readonly targets: readonly Pwqe5TargetResolution[];
  readonly candidates: readonly Pwqe5RouteCandidate[];
  readonly next: Pwqe5RouteCandidate | null;
  readonly findings: readonly Pwqe5StructuralFinding[];
  readonly missingness: readonly { readonly responseId: string; readonly questionId: string; readonly occurrenceId: string; readonly status: Pwqe5ResponseStatus }[];
  readonly supersededResponseIds: readonly string[];
  readonly invalidatedResponses: readonly { readonly responseId: string; readonly reason: string }[];
  readonly administrationCount: number;
  readonly decisionCount: number;
}

type R = Pwqe5CanonicalResponse & { readonly stepId: string; readonly selectedOptionIds: readonly string[]; readonly status: Pwqe5ResponseStatus; readonly mode: Pwqe5SelectionMode };
type Obj = Record<string, unknown>;
const MISSING = new Set<Pwqe5ResponseStatus>(["none_fit", "not_sure", "no_event", "not_applicable", "skip"]);
const NO_EVIDENCE = new Set<Pwqe5ResponseStatus>(["no_event", "not_applicable", "skip"]);
const PRACTICAL = new Set(["M03.requirements", "M03.no_aim", "M16.practical", "M16.loss", "M18.info", "M19.information", "M21.practical", "D02.practical", "D03.real", "D16.consequence", "D16.unsafe", "D16.load", "D21.practical", "D43.information", "D64.short", "D64.information"]);
const PREVENTIVE = new Set(["M03.exposure", "D02.prevent", "D15.prevent", "D15.before", "D49.worse"]);
const RELIEF_AIMS = new Set(["M03.relief", "D02.feel", "D09.relief", "D25.break", "D46.feeling", "D49.pressure"]);
const CAPACITY_LIMITS = new Set(["D11.words", "D11.stuck", "D30.stuck", "D30.tired", "D34.words", "D34.tired", "D34.far"]);
const ACTION_CAPTURES = new Set(["first_action", "next_action"]);
const UNCERTAIN_OPTIONS = new Set(["D05.cannot", "D06.unclear", "D11.unclear", "D16.unclear", "D19.none", "D25.unclear", "D29.unclear", "D33.uncertain", "D43.automatic", "D49.unclear", "D57.unclear", "D58.unclear", "D08.uncertain"]);

function obj(value: unknown): Obj { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Obj : {}; }
function arr(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function strings(value: unknown): string[] { return arr(value).filter((v): v is string => typeof v === "string"); }
function stableJson(value: unknown): string { return JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
function unique<T>(values: readonly T[]): T[] { return [...new Set(values)]; }
function step(r: R): string { return r.stepId; }
function byOccurrence(responses: readonly R[]): Map<string, R[]> {
  const result = new Map<string, R[]>();
  for (const response of responses) result.set(response.occurrenceId, [...(result.get(response.occurrenceId) ?? []), response]);
  return result;
}

function canonicalize(input: Pwqe5RouterInput, source: Pwqe5SourcePackage): { active: R[]; all: R[]; superseded: string[]; invalidated: { responseId: string; reason: string }[]; rawById: Map<string, R> } {
  const items = new Map(source.questionBank.items.map((item) => [item.id, item]));
  const variants = new Map(source.questionBank.variants.map((v) => [v.id, v]));
  const ids = new Set<string>();
  const rows = input.responses.map((raw): R => {
    if (!raw || typeof raw.responseId !== "string" || !raw.responseId.trim() || ids.has(raw.responseId)) throw new Error("Responses require unique nonempty responseId values.");
    ids.add(raw.responseId);
    const q = items.get(raw.questionId);
    if (!q) throw new Error(`Unknown PWQE 5 item: ${raw.questionId}`);
    if (typeof raw.occurrenceId !== "string" || !raw.occurrenceId.trim()) throw new Error("Responses require a server-bound occurrenceId.");
    const status = raw.status ?? "answered";
    const mode = raw.mode ?? "single";
    const selected = [...(raw.selectedOptionIds ?? [])];
    const variantId = raw.variantId;
    const variant = variantId ? variants.get(variantId) : undefined;
    const options = variant?.replaces === q.id ? variant.options : q.options;
    if (variantId && (!variant || variant.replaces !== q.id || !q.allowed_variants.includes(variantId))) throw new Error(`Variant ${variantId} is not authored for ${q.id}.`);
    if (status !== "answered") {
      if (!MISSING.has(status) || selected.length) throw new Error("Missingness cannot include selected answers.");
      if (!q.response_controls.includes(status)) throw new Error(`${status} is not an authored response control for ${q.id}.`);
      return { ...raw, stepId: raw.stepId ?? "first", selectedOptionIds: [], status, mode: "single" };
    }
    if (selected.length === 0 || new Set(selected).size !== selected.length) throw new Error("Answered responses require unique canonical option IDs.");
    const optionMap = new Map(options.map((option) => [option.id, option]));
    if (selected.some((id) => !optionMap.has(id))) throw new Error(`Response for ${q.id} contains an unknown authored option.`);
    const partial = obj(q.selection).mode === "partial_order";
    if (partial) {
      if (!["ordered", "simultaneous", "order_unknown"].includes(mode) || selected.length > 3) throw new Error("Partial-order responses require an explicit sequence mode and at most three choices.");
    } else if (!["single", "simultaneous", "order_unknown"].includes(mode) || (mode === "single" ? selected.length !== 1 : selected.length !== 2)) {
      throw new Error("Selection mode does not match the authored response shape.");
    }
    if (selected.length > 1 && selected.some((id) => optionMap.get(id)?.exclusive)) throw new Error("An exclusive authored option cannot be combined.");
    return { ...raw, stepId: raw.stepId ?? "first", selectedOptionIds: mode === "ordered" ? selected : selected.sort(), status, mode };
  });

  const rawById = new Map(rows.map((r) => [r.responseId, r]));
  const superseded = new Set<string>();
  for (const r of rows) if (r.supersedesResponseId) {
    const old = rawById.get(r.supersedesResponseId);
    if (!old || old.questionId !== r.questionId || old.occurrenceId !== r.occurrenceId || step(old) !== step(r)) throw new Error("A correction must supersede an existing response to the same item, episode and step.");
    superseded.add(old.responseId);
  }
  const invalidated: { responseId: string; reason: string }[] = [];
  const active: R[] = [];
  const position = (row: R): number => {
    let current = row;
    const visited = new Set<string>();
    while (current.supersedesResponseId && !visited.has(current.responseId)) {
      visited.add(current.responseId);
      const prior = rawById.get(current.supersedesResponseId);
      if (!prior) break;
      current = prior;
    }
    return rows.indexOf(current);
  };
  const logicalRows = rows.filter((r) => !superseded.has(r.responseId)).sort((a, b) => position(a) - position(b));
  const gates = obj(obj(source.itemGates).gates);
  for (const r of logicalRows) {
    const q = items.get(r.questionId)!;
    const earlier = active.filter((candidate) => candidate.occurrenceId === r.occurrenceId);
    const missingParent = strings(q.eligibility.requires_answered).find((parent) => !earlier.some((candidate) => candidate.questionId === parent && candidate.status === "answered"));
    if (missingParent) { invalidated.push({ responseId: r.responseId, reason: `prerequisite_removed:${missingParent}` }); continue; }
    const gate = obj(gates[r.questionId]);
    const required = strings(gate.required_parent_options ?? obj(q.eligibility.specific).required_parent_options);
    const excluded = strings(gate.exclude_parent_options ?? obj(q.eligibility.specific).exclude_parent_options);
    const parentOptions = earlier.flatMap((candidate) => candidate.selectedOptionIds);
    if (required.some((option) => !parentOptions.includes(option))) { invalidated.push({ responseId: r.responseId, reason: "required_parent_option_removed" }); continue; }
    if (excluded.some((option) => parentOptions.includes(option))) { invalidated.push({ responseId: r.responseId, reason: "authored_gate_excluded_after_correction" }); continue; }
    active.push(r);
  }
  return { active, all: rows, superseded: [...superseded].sort(), invalidated, rawById };
}

function targetStatus(targetId: string, responses: readonly R[], occurrenceId: string, source: Pwqe5SourcePackage): { state: Pwqe5TargetState; reason: string; resolution: string[] } | undefined {
  const own = responses.filter((r) => r.occurrenceId === occurrenceId);
  const allOptions = own.flatMap((r) => r.selectedOptionIds);
  const hasItem = (id: string) => own.some((r) => r.questionId === id && r.status === "answered");
  const hasMissing = (ids: readonly string[]) => [...own].reverse().find((r) => ids.includes(r.questionId) && r.status !== "answered");
  if (targetId === "contact_function" && allOptions.includes("M18.info") && !allOptions.some((id) => ["M18.upset", "M18.matter", "D43.okay", "D43.notice", "M19.ease"].includes(id))) return { state: "supports_alternative", reason: "ordinary_or_contextual_explanation_recorded", resolution: own.filter((r) => ["M17", "M18", "M19", "D43"].includes(r.questionId)).map((r) => r.responseId) };
  if (targetId === "practical_context" && allOptions.some((id) => PRACTICAL.has(id))) return { state: "supports_alternative", reason: "practical_context_retained", resolution: own.filter((r) => r.selectedOptionIds.some((id) => PRACTICAL.has(id))).map((r) => r.responseId) };
  if (targetId === "function" && allOptions.some((id) => PRACTICAL.has(id))) return { state: "supports_alternative", reason: "practical_account_closes_unneeded_protection_probe", resolution: own.filter((r) => r.selectedOptionIds.some((id) => PRACTICAL.has(id))).map((r) => r.responseId) };
  if (targetId === "function" && allOptions.some((id) => PREVENTIVE.has(id) || RELIEF_AIMS.has(id))) return { state: "supports_interpretation", reason: "reported_discriminating_aim_recorded", resolution: own.filter((r) => r.selectedOptionIds.some((id) => PREVENTIVE.has(id) || RELIEF_AIMS.has(id))).map((r) => r.responseId) };
  if (targetId === "sequence_relation") {
    const relation = own.find((r) => r.questionId === "D08");
    if (relation) return relation.selectedOptionIds.includes("D08.different")
      ? { state: "unresolved", reason: "different_occurrences_require_rebinding", resolution: [relation.responseId] }
      : relation.selectedOptionIds.some((id) => UNCERTAIN_OPTIONS.has(id))
        ? { state: "unresolved", reason: "discriminator_retains_uncertainty", resolution: [relation.responseId] }
        : { state: "resolved_descriptively", reason: "temporal_relation_recorded", resolution: [relation.responseId] };
  }
  if (targetId === "next_effect" && hasItem("D10")) return { state: "resolved_descriptively", reason: "immediate_effect_recorded", resolution: own.filter((r) => r.questionId === "D10").map((r) => r.responseId) };
  if (targetId === "recurrence") {
    const actionItems = new Set(source.questionBank.items.filter((q) => ACTION_CAPTURES.has(String(q.captures))).map((q) => q.id));
    const rootActions = own.filter((r) => actionItems.has(r.questionId) && r.status === "answered");
    const repeated = responses.filter((r) => r.occurrenceId !== occurrenceId && actionItems.has(r.questionId) && r.status === "answered" && rootActions.some((root) => root.selectedOptionIds.some((id) => r.selectedOptionIds.includes(id))));
    if (repeated.length) return { state: "resolved_descriptively", reason: "same_reported_action_in_confirmed_distinct_occurrences_function_scope_separate", resolution: [...rootActions, ...repeated].map((r) => r.responseId) };
  }
  const authoredDiscriminator = own.find((r) => {
    const target = source.routingTargets.targets.find((entry) => entry.id === targetId);
    return r.status === "answered" && strings(target?.candidate_items).some((item) => item === r.questionId || item === `REPLAY:${r.questionId}`);
  });
  if (authoredDiscriminator && authoredDiscriminator.selectedOptionIds.some((id) => UNCERTAIN_OPTIONS.has(id))) return { state: "unresolved", reason: "discriminator_retains_uncertainty", resolution: [authoredDiscriminator.responseId] };
  if (authoredDiscriminator && targetId !== "recurrence") return { state: "resolved_descriptively", reason: "authored_discriminator_recorded", resolution: [authoredDiscriminator.responseId] };
  const missing = hasMissing(["D02", "D03", "D08", "D09", "D10", "D12", "D43"]);
  if (missing) return { state: missing.status === "skip" ? "declined" : NO_EVIDENCE.has(missing.status) ? "unavailable" : "unresolved", reason: `discriminator_${missing.status}`, resolution: [missing.responseId] };
  return undefined;
}

function compileEvidence(responses: readonly R[], source: Pwqe5SourcePackage) {
  const itemMap = new Map(source.questionBank.items.map((q) => [q.id, q]));
  const observations: Pwqe5Observation[] = [];
  const missingness: Pwqe5RouterResult["missingness"][number][] = [];
  for (const r of responses) {
    const q = itemMap.get(r.questionId)!;
    if (r.status !== "answered") { missingness.push({ responseId: r.responseId, questionId: r.questionId, occurrenceId: r.occurrenceId, status: r.status }); continue; }
    for (const optionId of r.selectedOptionIds) {
      const option = q.options.find((o) => o.id === optionId) ?? source.questionBank.variants.flatMap((v) => v.options).find((o) => o.id === optionId);
      if (!option) continue;
      observations.push({ id: `${r.responseId}:${optionId}`, responseId: r.responseId, questionId: r.questionId, optionId, occurrenceId: r.occurrenceId, stepId: r.stepId, capture: String(q.captures ?? "experience"), reportedValue: option.reported_value, candidateSignals: option.candidate_signals });
    }
  }
  const episodeRows = byOccurrence(responses);
  const episodes: Pwqe5Episode[] = [...episodeRows.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, rows]) => {
    const root = rows.find((r) => itemMap.get(r.questionId)?.stage === "mapping") ?? rows[0];
    const q = itemMap.get(root.questionId)!;
    return { id, family: String(q.episode_family ?? q.context ?? "unknown"), context: String(q.context ?? "unknown"), status: rows.some((r) => r.status === "answered") ? "actual_recalled" : "missing", responseIds: rows.map((r) => r.responseId) };
  });
  const edges: Pwqe5SequenceEdge[] = [];
  for (const r of responses.filter((candidate) => candidate.questionId === "D08" && candidate.status === "answered")) {
    const option = r.selectedOptionIds[0];
    const relation = option === "D08.after_failed" || option === "D08.after" ? "before" : option === "D08.overlap" ? "simultaneous" : option === "D08.alternate" ? "alternating" : option === "D08.uncertain" ? "order_unknown" : undefined;
    if (relation) edges.push({ id: `edge:${r.responseId}`, occurrenceId: r.occurrenceId, fromStep: "first", toStep: "next", relation, firstNotHelping: option === "D08.after_failed", responseId: r.responseId });
  }
  for (const r of responses.filter((candidate) => candidate.questionId === "D36" && candidate.status === "answered")) {
    if (r.mode === "ordered") {
      for (let index = 0; index < r.selectedOptionIds.length - 1; index += 1) edges.push({ id: `edge:${r.responseId}:${index}`, occurrenceId: r.occurrenceId, fromStep: r.selectedOptionIds[index], toStep: r.selectedOptionIds[index + 1], relation: "before", firstNotHelping: false, responseId: r.responseId });
    } else if (r.selectedOptionIds.length > 1) {
      for (let left = 0; left < r.selectedOptionIds.length; left += 1) for (let right = left + 1; right < r.selectedOptionIds.length; right += 1) edges.push({ id: `edge:${r.responseId}:${left}:${right}`, occurrenceId: r.occurrenceId, fromStep: r.selectedOptionIds[left], toStep: r.selectedOptionIds[right], relation: r.mode === "simultaneous" ? "simultaneous" : "order_unknown", firstNotHelping: false, responseId: r.responseId });
    }
  }
  const steps: Pwqe5EpisodeStep[] = [...new Set(observations.map((o) => `${o.occurrenceId}\u0000${o.stepId}`))].sort().map((key) => {
    const [occurrenceId, stepId] = key.split("\u0000");
    const stepObservations = observations.filter((o) => o.occurrenceId === occurrenceId && o.stepId === stepId);
    return { id: `${occurrenceId}:${stepId}`, occurrenceId, responseIds: unique(stepObservations.map((o) => o.responseId)), observationIds: stepObservations.map((o) => o.id), captures: unique(stepObservations.map((o) => o.capture)).sort() };
  });
  return { observations, missingness, episodes, steps, edges };
}

function compileTargets(responses: readonly R[], source: Pwqe5SourcePackage): Pwqe5TargetResolution[] {
  const targetRows = source.routingTargets.targets;
  const byOcc = byOccurrence(responses);
  const result: Pwqe5TargetResolution[] = [];
  for (const [occurrenceId, rows] of byOcc) {
    if (!rows.some((r) => r.status === "answered")) continue;
    for (const target of targetRows) {
      const sources = rows.filter((r) => strings(target.opens_from_items).includes(r.questionId) && r.status === "answered");
      if (!sources.length) continue;
      if (!authoredTargetOpenCondition(target.id, rows)) continue;
      const resolution = targetStatus(target.id, responses, occurrenceId, source);
      const candidates = strings(target.candidate_items).filter((id) => id.startsWith("REPLAY") || !rows.some((r) => r.questionId === id));
      const maximum = Number(target.maximum_attempts ?? 2);
      const attempts = rows.filter((r) => strings(target.candidate_items).includes(r.questionId)).length;
      if (resolution || attempts >= maximum || candidates.length === 0) {
        const value = resolution ?? { state: "resolved_descriptively" as const, reason: attempts >= maximum ? "maximum_attempts_reached" : "no_eligible_authored_discriminator", resolution: rows.filter((r) => strings(target.candidate_items).includes(r.questionId)).map((r) => r.responseId) };
        result.push({ id: `${target.id}:${occurrenceId}`, targetId: target.id, occurrenceId, state: value.state, reason: value.reason, sourceResponseIds: sources.map((r) => r.responseId), resolutionResponseIds: value.resolution, candidateItems: candidates });
      } else {
        result.push({ id: `${target.id}:${occurrenceId}`, targetId: target.id, occurrenceId, state: "open", reason: "authored_evidence_gap", sourceResponseIds: sources.map((r) => r.responseId), resolutionResponseIds: [], candidateItems: candidates });
      }
    }
  }
  // Recurrence is derived only from matching behavior across respondent-confirmed distinct occurrence IDs.
  const actions = new Map<string, Set<string>>();
  for (const r of responses) if (r.status === "answered") {
    const q = source.questionBank.items.find((item) => item.id === r.questionId);
    if (!q || !ACTION_CAPTURES.has(String(q.captures))) continue;
    actions.set(r.occurrenceId, new Set([...(actions.get(r.occurrenceId) ?? []), ...r.selectedOptionIds]));
  }
  const pairs: [string, string][] = [];
  const ids = [...actions.keys()].sort();
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) if ([...actions.get(ids[i])!].some((x) => actions.get(ids[j])!.has(x))) pairs.push([ids[i], ids[j]]);
  for (const [a, b] of pairs) {
    const related = responses.filter((r) => [a, b].includes(r.occurrenceId) && ACTION_CAPTURES.has(String(source.questionBank.items.find((q) => q.id === r.questionId)?.captures)));
    result.push({ id: `recurrence:${a}:${b}`, targetId: "recurrence", occurrenceId: a, state: "resolved_descriptively", reason: "same_reported_action_in_confirmed_distinct_occurrences_function_scope_separate", sourceResponseIds: related.map((r) => r.responseId), resolutionResponseIds: related.map((r) => r.responseId), candidateItems: [] });
  }
  return result.sort((a, b) => a.id.localeCompare(b.id));
}

function authoredTargetOpenCondition(targetId: string, rows: readonly R[]): boolean {
  const options = rows.flatMap((r) => r.selectedOptionIds);
  const hasQuestion = (id: string) => rows.some((r) => r.questionId === id && r.status === "answered");
  const hasOption = (...ids: string[]) => options.some((id) => ids.includes(id));
  if (targetId === "polarization_relation") return hasQuestion("M26") && hasQuestion("M27") && hasOption("M26.contact", "M26.finish", "M26.speak", "M26.help", "M26.rest");
  if (targetId === "polarization_first") return hasOption("D12.cost", "D12.switch");
  if (targetId === "polarization_second") return hasOption("D12.cost", "D12.switch") && (hasQuestion("D13") || hasOption("D13.none"));
  return true;
}

function compileFindings(responses: readonly R[], edges: readonly Pwqe5SequenceEdge[], source: Pwqe5SourcePackage): Pwqe5StructuralFinding[] {
  const byOcc = byOccurrence(responses);
  const findings: Pwqe5StructuralFinding[] = [];
  for (const [occurrenceId, rows] of byOcc) {
    const opts = new Set(rows.flatMap((r) => r.selectedOptionIds));
    const actions = rows.filter((r) => ["D61", "D07", "M02", "M11", "M17"].includes(r.questionId) && r.status === "answered");
    const firstPreventive = rows.some((r) => r.stepId === "first" && r.selectedOptionIds.some((id) => PREVENTIVE.has(id)));
    const laterRelief = rows.some((r) => r.stepId === "next" && r.selectedOptionIds.some((id) => RELIEF_AIMS.has(id)));
    const capacityAmbiguity = [...opts].some((id) => CAPACITY_LIMITS.has(id));
    if (firstPreventive) findings.push({ code: "preventive_function_support", occurrenceIds: [occurrenceId], responseIds: rows.filter((r) => r.selectedOptionIds.some((id) => PREVENTIVE.has(id))).map((r) => r.responseId), scope: "occurrence" });
    if (laterRelief && !capacityAmbiguity) findings.push({ code: "reactive_relief_function_support", occurrenceIds: [occurrenceId], responseIds: rows.filter((r) => r.selectedOptionIds.some((id) => RELIEF_AIMS.has(id))).map((r) => r.responseId), scope: "occurrence" });
    const edge = edges.find((e) => e.occurrenceId === occurrenceId && e.toStep === "next" && e.relation === "before");
    if (firstPreventive && laterRelief && edge && edge.firstNotHelping && !opts.has("D09.same")) findings.push({ code: "preventive_to_relief_handoff_support", occurrenceIds: [occurrenceId], responseIds: unique([...actions.map((r) => r.responseId), ...rows.filter((r) => ["D08", "D09", "D10", "D11"].includes(r.questionId)).map((r) => r.responseId)]), scope: "occurrence" });
  }
  const actionByOccurrence = new Map<string, Set<string>>();
  for (const r of responses) if (r.status === "answered") {
    const item = source.questionBank.items.find((q) => q.id === r.questionId);
    if (!item || !ACTION_CAPTURES.has(String(item.captures))) continue;
    actionByOccurrence.set(r.occurrenceId, new Set([...(actionByOccurrence.get(r.occurrenceId) ?? []), ...r.selectedOptionIds]));
  }
  const occs = [...byOcc.keys()].sort();
  for (let i = 0; i < occs.length; i++) for (let j = i + 1; j < occs.length; j++) {
    const left = [...(actionByOccurrence.get(occs[i]) ?? [])];
    const right = [...(actionByOccurrence.get(occs[j]) ?? [])];
    if (left.some((x) => right.includes(x))) findings.push({ code: "action_recurs_in_confirmed_distinct_events", occurrenceIds: [occs[i], occs[j]], responseIds: responses.filter((r) => [occs[i], occs[j]].includes(r.occurrenceId) && r.selectedOptionIds.some((x) => left.includes(x) || right.includes(x))).map((r) => r.responseId), scope: "two_distinct_occurrences" });
  }
  return findings.sort((a, b) => a.code.localeCompare(b.code) || a.occurrenceIds.join().localeCompare(b.occurrenceIds.join()));
}

function candidateAllowed(q: Pwqe5Question, occurrenceId: string, responses: readonly R[], source: Pwqe5SourcePackage, optedTopics: Set<string>): boolean {
  const own = responses.filter((r) => r.occurrenceId === occurrenceId);
  if (own.some((r) => r.questionId === q.id)) return false;
  const topic = q.eligibility.topic_opt_in;
  if (typeof topic === "string" && !optedTopics.has(topic)) return false;
  if (strings(q.eligibility.requires_answered).some((id) => !own.some((r) => r.questionId === id && r.status === "answered"))) return false;
  const gates = obj(obj(source.itemGates).gates);
  const gate = obj(gates[q.id]);
  const parents = own.flatMap((r) => r.selectedOptionIds);
  const specific = obj(q.eligibility.specific);
  if (strings(gate.required_parent_options ?? specific.required_parent_options).some((id) => !parents.includes(id))) return false;
  if (strings(gate.exclude_parent_options ?? specific.exclude_parent_options).some((id) => parents.includes(id))) return false;
  const requiredFlags = strings(gate.required_flags ?? specific.required_flags);
  if (requiredFlags.some((flag) => !hasRequiredFlag(flag, own, occurrenceId, optedTopics))) return false;
  return true;
}
function hasRequiredFlag(flag: string, rows: readonly R[], occurrenceId: string, optedTopics: Set<string>): boolean {
  const options = rows.flatMap((r) => r.selectedOptionIds);
  switch (flag) {
    case "actual_first_move": return rows.some((r) => ["M11", "D61", "D28", "D24", "M02", "M04"].includes(r.questionId) && r.status === "answered");
    case "actual_next_move": return options.some((o) => o.startsWith("D07.") && !["D07.nothing", "D07.changed"].includes(o));
    case "actual_simultaneous_wants": return options.some((o) => o.startsWith("M26.") && o !== "M26.sequential");
    case "two_distinct_actual_episodes": return false; // Requires a separately bound comparison candidate, never inferred from one occurrence.
    case "matched_reported_behavior": return false;
    case "reported_candidate_trigger": return false;
    case "actual_recovery_episode": return rows.some((r) => ["M13", "M14", "M25"].includes(r.questionId));
    case "actual_low_response": return options.some((o) => ["D07.quiet", "M11.quiet"].includes(o));
    case "actual_wait_response": return rows.some((r) => r.questionId === "M17");
    case "actual_space_or_distance_episode": return rows.some((r) => ["M25", "D34"].includes(r.questionId));
    case "actual_response_stop": return rows.some((r) => r.questionId === "M25");
    case "reported_exposure_concern": return options.some((o) => ["M21.burden", "M21.refusal", "M21.owe", "D18.need", "D18.hurt"].includes(o));
    case "actual_helpful_social_effect": return options.some((o) => ["M14.company", "M14.support", "D10.relief"].includes(o));
    case "actual_received_repair": return rows.some((r) => ["M24", "D50"].includes(r.questionId));
    case "body_detail_allowed": return optedTopics.has("body_detail") && !occurrenceId.startsWith("pending:") && rows.some((r) => r.status === "answered");
    case "actual_selected_step": return rows.some((r) => r.stepId !== "first");
    case "actual_easing": return options.some((o) => ["M12.relief", "M14.brief", "D10.relief"].includes(o));
    case "actual_feeling_episode": return options.some((o) => ["M05.attack", "M05.rules", "D01.during"].includes(o));
    case "actual_need_disclosure": return rows.some((r) => ["M20", "D17", "D21"].includes(r.questionId));
    case "actual_bothersome_comment": return false; // Requires a separate same-contact confirmation, not merely an answer to family preparation.
    default: return false;
  }
}

function candidateStep(q: Pwqe5Question, occurrenceId: string | null, responses: readonly R[], source: Pwqe5SourcePackage): string {
  const binding = String(q.step_binding ?? "first");
  if (binding === "selected") {
    const priorAction = [...responses].reverse().find((r) => r.occurrenceId === occurrenceId && ACTION_CAPTURES.has(String(source.questionBank.items.find((item) => item.id === r.questionId)?.captures)));
    return priorAction?.stepId ?? "first";
  }
  if (["first", "next", "edge", "recovery", "context", "effect", "later", "inner", "prediction"].includes(binding)) return binding;
  return "first";
}

/** Synchronous pure reducer/compiler. The verified package is an explicit dependency. */
export function compilePwqe5Route(input: Pwqe5RouterInput, source: Pwqe5SourcePackage): Pwqe5RouterResult {
  const normalized = canonicalize(input, source);
  const active = normalized.active;
  const administrationCount = new Set(normalized.all.map((r) => `${r.questionId}\u0000${r.occurrenceId}\u0000${r.stepId}`)).size;
  const { observations, missingness, episodes, steps, edges } = compileEvidence(active, source);
  const targets = compileTargets(active, source);
  const findings = compileFindings(active, edges, source);
  const phase = input.phase ?? "mapping";
  const totalLimit = Math.min(input.totalLimit ?? 56, 56);
  const mappingLimit = Math.min(input.mappingLimit ?? 32, 32);
  const decisionLimit = Math.min(input.decisionLimit ?? 72, 72);
  const decisionCount = normalized.all.length + (input.controls?.length ?? 0);
  let completionReason: string | undefined;
  let routePhase: Pwqe5RouterResult["phase"] = phase;
  if (input.controls?.includes("end")) { routePhase = "finished"; completionReason = "user_end"; }
  else if (administrationCount >= totalLimit || decisionCount >= decisionLimit || (phase === "mapping" && new Set(normalized.all.filter((r) => source.questionBank.items.find((q) => q.id === r.questionId)?.stage === "mapping").map((r) => `${r.questionId}\u0000${r.occurrenceId}\u0000${r.stepId}`)).size >= mappingLimit)) {
    routePhase = "finished"; completionReason = "burden_ceiling";
  }
  const itemMap = new Map(source.questionBank.items.map((q) => [q.id, q]));
  const candidates: Pwqe5RouteCandidate[] = [];
  if (routePhase !== "finished") {
    if (phase === "mapping") {
      const seen = new Set(active.filter((r) => itemMap.get(r.questionId)?.stage === "mapping").map((r) => r.questionId));
      for (const q of source.questionBank.items.filter((item) => item.stage === "mapping" && !seen.has(item.id))) {
        if (q.eligibility.requires_answered.length && !active.some((r) => r.questionId === q.eligibility.requires_answered[0] && r.status === "answered")) continue;
        const bindingKey = q.eligibility.requires_answered.length ? undefined : `coverage:${q.id}`;
        const occurrenceId = q.eligibility.requires_answered.length
          ? [...active].reverse().find((r) => r.questionId === q.eligibility.requires_answered[0])?.occurrenceId
          : input.occurrenceBindings?.[bindingKey!];
        if (!candidateAllowed(q, occurrenceId ?? `pending:${bindingKey}`, active, source, new Set(input.optedInTopics ?? []))) continue;
        candidates.push({ questionId: q.id, occurrenceId: occurrenceId ?? null, ...(bindingKey ? { bindingKey, ...(!occurrenceId ? { bindingRequest: "new_actual_occurrence" as const } : {}) } : {}), stepId: candidateStep(q, occurrenceId ?? null, active, source), targetIds: strings(q.follow_up_targets), priority: q.eligibility.requires_answered.length ? 1 : 2, stage: "mapping" });
      }
    } else {
      for (const target of targets.filter((t) => t.state === "open")) {
        for (const authoredCandidate of target.candidateItems) {
          const replay = authoredCandidate.startsWith("REPLAY");
          const root = active.find((r) => r.occurrenceId === target.occurrenceId && itemMap.get(r.questionId)?.stage === "mapping");
          const itemId = replay ? authoredCandidate.includes(":") ? authoredCandidate.split(":")[1] : root?.questionId : authoredCandidate;
          const q = itemId ? itemMap.get(itemId) : undefined;
          if (!q) continue;
          const bindingKey = replay ? `replay:${target.targetId}:${target.occurrenceId}:${q.id}` : undefined;
          const occurrenceId = replay ? input.occurrenceBindings?.[bindingKey!] : target.occurrenceId;
          if (!candidateAllowed(q, occurrenceId ?? `pending:${bindingKey}`, active, source, new Set(input.optedInTopics ?? []))) continue;
          const stepId = candidateStep(q, occurrenceId ?? null, active, source);
          const composite = candidates.find((candidate) => candidate.questionId === itemId && candidate.occurrenceId === (occurrenceId ?? null) && candidate.stepId === stepId);
          if (composite) {
            const index = candidates.indexOf(composite);
            candidates[index] = { ...composite, targetIds: unique([...composite.targetIds, target.id]), priority: Math.min(composite.priority, Number((source.routingTargets.targets.find((t) => t.id === target.targetId) as Obj | undefined)?.default_priority ?? 4)) };
          } else candidates.push({ questionId: itemId!, occurrenceId: occurrenceId ?? null, ...(bindingKey ? { bindingKey, ...(!occurrenceId ? { bindingRequest: "new_actual_occurrence" as const } : {}) } : {}), stepId, targetIds: [target.id], priority: Number((source.routingTargets.targets.find((t) => t.id === target.targetId) as Obj | undefined)?.default_priority ?? 4), stage: "deepening" });
        }
      }
      // Entry-point candidates are authored and gated; no psychological label is inferred.
      for (const entry of arr(obj(source.routingTargets).entry_points)) {
        const e = obj(entry); const entryId = String(e.id ?? ""); const itemId = String(e.first_item ?? ""); const q = itemMap.get(itemId);
        if (!q || !(input.optedInTopics ?? []).includes(entryId)) continue;
        const bindingKey = `entry:${entryId}`;
        const optedTopics = new Set(input.optedInTopics ?? []);
        const boundOccurrence = input.occurrenceBindings?.[bindingKey];
        if (entryId === "body_detail") {
          // This gate requires an already recalled event. It cannot create a new episode merely to obtain body details.
          const episodeIds = boundOccurrence
            ? [boundOccurrence]
            : unique(active.filter((r) => r.status === "answered").map((r) => r.occurrenceId)).sort();
          const occurrenceId = episodeIds.find((id) => candidateAllowed(q, id, active, source, optedTopics));
          if (!occurrenceId) continue;
          candidates.push({ questionId: itemId, occurrenceId, bindingKey, stepId: candidateStep(q, occurrenceId, active, source), targetIds: [`entry:${entryId}`], priority: 4, stage: "deepening" });
          continue;
        }
        if (boundOccurrence) {
          if (!candidateAllowed(q, boundOccurrence, active, source, optedTopics)) continue;
          candidates.push({ questionId: itemId, occurrenceId: boundOccurrence, bindingKey, stepId: candidateStep(q, boundOccurrence, active, source), targetIds: [`entry:${entryId}`], priority: 4, stage: "deepening" });
          continue;
        }
        // A context-specific entry with authored flags must bind to an existing qualifying event.
        const gate = obj(obj(obj(source.itemGates).gates)[itemId]);
        const requiredFlags = strings(gate.required_flags ?? obj(q.eligibility.specific).required_flags);
        if (q.eligibility.requires_answered.length || requiredFlags.length > 0) {
          const occurrenceId = unique(active.filter((r) => r.status === "answered").map((r) => r.occurrenceId)).sort().find((id) => candidateAllowed(q, id, active, source, optedTopics));
          if (!occurrenceId) continue;
          candidates.push({ questionId: itemId, occurrenceId, bindingKey, stepId: candidateStep(q, occurrenceId, active, source), targetIds: [`entry:${entryId}`], priority: 4, stage: "deepening" });
          continue;
        }
        const pending = `pending:${bindingKey}`;
        if (!candidateAllowed(q, pending, active, source, optedTopics)) continue;
        candidates.push({ questionId: itemId, occurrenceId: null, bindingKey, bindingRequest: "new_actual_occurrence", stepId: candidateStep(q, null, active, source), targetIds: [`entry:${entryId}`], priority: 4, stage: "deepening" });
      }
    }
  }
  if (input.controls?.includes("shorten")) {
    for (let index = candidates.length - 1; index >= 0; index -= 1) if (candidates[index].priority >= 5) candidates.splice(index, 1);
  }
  const bodyDetailOptedIn = (input.optedInTopics ?? []).includes("body_detail");
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const variant = source.questionBank.variants.find((item) => {
      if (item.replaces !== candidate.questionId || !item.when || typeof item.when !== "object") return false;
      return Object.entries(item.when as Record<string, unknown>).every(([condition, expected]) =>
        condition === "body_detail" ? expected === bodyDetailOptedIn : false);
    });
    if (variant) candidates[index] = { ...candidate, variantId: variant.id };
  }
  candidates.sort((a, b) => a.priority - b.priority || a.questionId.localeCompare(b.questionId) || (a.occurrenceId ?? "").localeCompare(b.occurrenceId ?? "") || a.stepId.localeCompare(b.stepId));
  const next = candidates[0] ?? null;
  if (!next && routePhase !== "finished") { routePhase = "finished"; completionReason = phase === "mapping" ? "mapping_coverage_complete" : "no_eligible_material_target"; }
  return { sourceRelease: source.questionBank.release, phase: routePhase, ...(completionReason ? { completionReason } : {}), observations, episodes, steps, sequenceEdges: edges, targets, candidates, next, findings, missingness, supersededResponseIds: normalized.superseded, invalidatedResponses: normalized.invalidated, administrationCount, decisionCount };
}

/** Async entry point for production callers that want the pinned source loader included. */
export async function routePwqe5Assessment(input: Pwqe5RouterInput, workspaceRoot?: string): Promise<Pwqe5RouterResult> {
  const { loadPwqe5SourcePackage } = await import("../../question-engine/pwqe5-source.ts");
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  return compilePwqe5Route(input, source);
}

/** Stable serialized projection useful for deterministic replay receipts. */
export function pwqe5RouteFingerprint(result: Pwqe5RouterResult): string {
  return stableJson({ sourceRelease: result.sourceRelease, phase: result.phase, completionReason: result.completionReason, observations: result.observations, episodes: result.episodes, steps: result.steps, sequenceEdges: result.sequenceEdges, targets: result.targets, candidates: result.candidates, next: result.next, findings: result.findings, missingness: result.missingness, supersededResponseIds: result.supersededResponseIds, invalidatedResponses: result.invalidatedResponses, administrationCount: result.administrationCount, decisionCount: result.decisionCount });
}
