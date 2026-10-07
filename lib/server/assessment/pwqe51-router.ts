import type { Pwqe51Question, Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import { evaluatePwqe51CoverageGate, type Pwqe51CoverageEpisode, type Pwqe51CoverageObservation, type Pwqe51CoverageAdministration } from "./pwqe51-coverage.ts";
import { derivePwqe51Flags, pwqe51ComparisonPairKey, pwqe51EpisodeStepKey, type Pwqe51FlagContextFact } from "./pwqe51-flags.ts";

export type Pwqe51ResponseStatus = "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
export type Pwqe51Basis = "actual_recalled" | "reported_typicality" | "remembered_expectation" | "missing";
export type Pwqe51SelectionMode = "single" | "simultaneous" | "order_unknown" | "ordered";

export interface Pwqe51CanonicalResponse {
  readonly responseId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId?: string;
  readonly variantId?: string;
  readonly selectedOptionIds?: readonly string[];
  readonly status?: Pwqe51ResponseStatus;
  readonly mode?: Pwqe51SelectionMode;
  /** Root-only recall basis. Child items inherit the episode basis. */
  readonly basis?: "actual_recalled" | "reported_typicality";
  readonly supersedesResponseId?: string;
}

export interface Pwqe51RouterInput {
  readonly responses: readonly Pwqe51CanonicalResponse[];
  readonly phase?: "mapping" | "deepening";
  readonly controls?: readonly ("end" | "shorten")[];
  readonly optedInTopics?: readonly string[];
  readonly occurrenceBindings?: Readonly<Record<string, string>>;
  /** Explicit, respondent-confirmed distinctness. Never inferred from IDs. */
  readonly distinctPairs?: readonly (readonly [string, string])[];
  /** Server-owned comparison pair keyed by response ID for D56/D57 comparison answers. */
  readonly comparisonIdsByResponseId?: Readonly<Record<string, readonly [string, string]>>;
  readonly requestedTargetIds?: readonly string[];
  readonly focusOccurrences?: readonly string[];
  readonly details?: readonly string[];
  /** Server-owned contextual facts; browser responses cannot submit derived flags. */
  readonly contextFacts?: readonly Pwqe51FlagContextFact[];
  readonly closedBindings?: Readonly<Record<string, "skip" | "no_event" | "same" | "unknown">>;
  readonly rejectedTargetIds?: readonly string[];
  readonly totalLimit?: number;
  readonly mappingLimit?: number;
  readonly decisionLimit?: number;
}

export interface Pwqe51Observation extends Pwqe51CoverageObservation {
  readonly occurrenceId: string;
  readonly stepId: string;
  readonly variantId?: string;
  readonly text: string;
  readonly reportedValue: string;
  readonly basis: Pwqe51Basis;
  readonly mode: Pwqe51SelectionMode;
  readonly version: string;
  readonly candidateSignals: readonly string[];
}
export interface Pwqe51Episode extends Pwqe51CoverageEpisode {
  readonly family: string;
  readonly context: string;
  readonly basis: "actual_recalled" | "reported_typicality";
  readonly responseIds: readonly string[];
}
export interface Pwqe51Step {
  readonly id: string;
  readonly occurrenceId: string;
  readonly responseIds: readonly string[];
  readonly observationIds: readonly string[];
}
export type Pwqe51TargetState = "open" | "supports_interpretation" | "supports_alternative" | "resolved_descriptively" | "unresolved" | "unavailable" | "declined" | "abandoned_low_value";
export interface Pwqe51TargetResolution {
  readonly id: string;
  readonly targetId: string;
  readonly occurrenceId: string;
  readonly stepId: string;
  readonly comparisonIds?: readonly [string, string];
  readonly state: Pwqe51TargetState;
  readonly reason: string;
  readonly sourceObservationIds: readonly string[];
  readonly resolutionObservationIds: readonly string[];
  readonly candidateItems: readonly string[];
  readonly priority: number;
}
export interface Pwqe51SequenceEdge {
  readonly id: string;
  readonly occurrenceId: string;
  readonly fromStep: string;
  readonly toStep: string;
  readonly relation: "before" | "simultaneous" | "alternating" | "order_unknown";
  readonly responseId: string;
  readonly observationIds: readonly string[];
  readonly meaning: string;
}
export interface Pwqe51RouteCandidate {
  readonly questionId: string;
  readonly occurrenceId: string | null;
  readonly bindingKey?: string;
  readonly bindingRequest?: "new_actual_occurrence";
  readonly stepId: string;
  readonly targetIds: readonly string[];
  readonly priority: number;
  readonly stage: "mapping" | "deepening";
}
export interface Pwqe51RouterResult {
  readonly sourceRelease: string;
  readonly phase: "mapping" | "deepening" | "finished";
  readonly completionReason?: string;
  readonly observations: readonly Pwqe51Observation[];
  readonly episodes: readonly Pwqe51Episode[];
  readonly steps: readonly Pwqe51Step[];
  readonly targets: readonly Pwqe51TargetResolution[];
  readonly candidates: readonly Pwqe51RouteCandidate[];
  readonly next: Pwqe51RouteCandidate | null;
  readonly sequenceEdges: readonly Pwqe51SequenceEdge[];
  readonly missingness: readonly { readonly responseId: string; readonly questionId: string; readonly occurrenceId: string; readonly status: Pwqe51ResponseStatus }[];
  readonly supersededResponseIds: readonly string[];
  readonly invalidatedResponses: readonly { readonly responseId: string; readonly reason: string }[];
  readonly administrationCount: number;
  readonly decisionCount: number;
}

type Normalized = Omit<Pwqe51CanonicalResponse, "basis"> & { readonly stepId: string; readonly selectedOptionIds: readonly string[]; readonly status: Pwqe51ResponseStatus; readonly mode: Pwqe51SelectionMode; readonly basis: Pwqe51Basis };
type Rule = Readonly<Record<string, unknown>>;
const missingStatuses = new Set<Pwqe51ResponseStatus>(["none_fit", "not_sure", "no_event", "not_applicable", "skip"]);
const expectationItems = new Set(["M09", "D03", "D19", "D48", "D89", "D90"]);
const typicalityItems = new Set(["D05", "D44", "D99"]);
const keyFor = (target: string, occurrence: string, step: string, pair?: readonly string[]) => `${target}:${occurrence}:${step}${pair ? `:${pair.join(":")}` : ""}`;
const strings = (value: unknown): string[] => Array.isArray(value) ? value.filter((x): x is string => typeof x === "string") : [];
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const answered = (r: Normalized) => r.status === "answered";

function normalize(input: Pwqe51RouterInput, source: Pwqe51SourcePackage) {
  const questions = new Map(source.questionBank.items.map((q) => [q.id, q]));
  const variants = new Map(source.questionBank.variants.map((v) => [v.id, v]));
  const ids = new Set<string>();
  const all: Normalized[] = input.responses.map((raw, index) => {
    if (!raw.responseId?.trim() || ids.has(raw.responseId)) throw new Error("Responses require unique nonempty responseId values.");
    ids.add(raw.responseId);
    const q = questions.get(raw.questionId);
    if (!q || !raw.occurrenceId?.trim()) throw new Error("Response item or server-bound occurrence is unavailable.");
    const status = raw.status ?? "answered";
    const mode = raw.mode ?? "single";
    const selected = [...(raw.selectedOptionIds ?? [])];
    const variant = raw.variantId ? variants.get(raw.variantId) : undefined;
    if (raw.variantId && (!variant || variant.replaces !== q.id)) throw new Error("Response variant is not authored for this item.");
    const options = variant?.options ?? q.options;
    let basis: Pwqe51Basis;
    if (status !== "answered") {
      if (!missingStatuses.has(status) || selected.length || raw.basis) throw new Error("Missingness is separate from answers and episode basis.");
      if (!q.response_controls.includes(status)) throw new Error(`${status} is not an authored response control for ${q.id}.`);
      basis = "missing";
    } else {
      if (!selected.length || new Set(selected).size !== selected.length || selected.some((id) => !options.some((o) => o.id === id))) throw new Error("Answer must use unique authored option IDs.");
      const partial = q.selection.mode === "partial_order";
      if (partial ? !["ordered", "simultaneous", "order_unknown"].includes(mode) || selected.length > 3
        : !["single", "simultaneous", "order_unknown"].includes(mode) || (mode === "single" ? selected.length !== 1 : selected.length !== 2)) throw new Error("Selection mode does not match authored response shape.");
      if (selected.length > 1 && selected.some((id) => options.find((o) => o.id === id)?.exclusive)) throw new Error("Exclusive choices cannot be combined.");
      const priorForEpisode = input.responses.slice(0, index).filter((prior) => prior.occurrenceId === raw.occurrenceId);
      const inheritedRootBasis = priorForEpisode.find((prior) => prior.responseId === raw.supersedesResponseId)?.basis;
      const isRoot = priorForEpisode.length === 0 || inheritedRootBasis !== undefined;
      if (isRoot) {
        if (raw.basis !== "actual_recalled" && raw.basis !== "reported_typicality" && inheritedRootBasis !== "actual_recalled" && inheritedRootBasis !== "reported_typicality") throw new Error("Root answers require an explicit actual_recalled or reported_typicality basis.");
        basis = raw.basis ?? inheritedRootBasis!;
      } else {
        if (raw.basis) throw new Error("Attached items inherit episode basis; client basis is not accepted.");
        const inherited = episodeBasisFromRaw(input.responses.slice(0, index), raw.occurrenceId);
        if (!inherited) throw new Error("Attached response requires an established root basis.");
        basis = inherited;
      }
      basis = expectationItems.has(q.id) && basis === "actual_recalled" ? "remembered_expectation" : typicalityItems.has(q.id) ? "reported_typicality" : basis;
    }
    return { ...raw, stepId: raw.stepId ?? questions.get(raw.questionId)?.step_binding ?? "first", selectedOptionIds: mode === "ordered" ? selected : selected.sort(), status, mode, basis };
  });
  const byId = new Map(all.map((r) => [r.responseId, r]));
  const superseded = new Set<string>();
  const chronologicalIndex = new Map(all.map((row, index) => [row.responseId, index]));
  for (const row of all) if (row.supersedesResponseId) {
    const old = byId.get(row.supersedesResponseId);
    if (!old || old.questionId !== row.questionId || old.occurrenceId !== row.occurrenceId || old.stepId !== row.stepId) throw new Error("A correction must supersede the same item, episode and step.");
    if (chronologicalIndex.get(old.responseId)! >= chronologicalIndex.get(row.responseId)!) throw new Error("Corrections must supersede an earlier response.");
    superseded.add(old.responseId);
  }
  // A correction replaces the observation at its original position in the
  // episode timeline. Appending it to the end would falsely invalidate every
  // intervening dependent question simply because its parent was superseded.
  const originalPosition = (row: Normalized): number => {
    let original = row;
    while (original.supersedesResponseId) original = byId.get(original.supersedesResponseId)!;
    return chronologicalIndex.get(original.responseId)!;
  };
  const currentInEpisodeOrder = all.filter((row) => !superseded.has(row.responseId))
    .sort((left, right) => originalPosition(left) - originalPosition(right));
  const active: Normalized[] = [];
  const invalidated: { responseId: string; reason: string }[] = [];
  for (const row of currentInEpisodeOrder) {
    const q = questions.get(row.questionId)!;
    const earlier = active.filter((r) => r.occurrenceId === row.occurrenceId);
    const missingParent = q.eligibility.requires_answered.find((id) => !earlier.some((r) => r.questionId === id && answered(r)));
    if (missingParent) { invalidated.push({ responseId: row.responseId, reason: `prerequisite_removed:${missingParent}` }); continue; }
    const gate = obj(source.itemGates.gates[row.questionId]);
    const required = strings(gate.required_parent_options ?? obj(q.eligibility.specific).required_parent_options);
    const excluded = strings(gate.exclude_parent_options ?? obj(q.eligibility.specific).exclude_parent_options);
    const parentOptions = earlier.flatMap((r) => r.selectedOptionIds);
    if (required.some((x) => !parentOptions.includes(x)) || excluded.some((x) => parentOptions.includes(x))) {
      invalidated.push({ responseId: row.responseId, reason: "authored_gate_changed_after_correction" }); continue;
    }
    active.push(row);
  }
  return { all, active, superseded: [...superseded].sort(), invalidated, questions };
}

function episodeBasisFromRaw(rows: readonly Pwqe51CanonicalResponse[], id: string): "actual_recalled" | "reported_typicality" | undefined {
  return rows.find((r) => r.occurrenceId === id && (r.basis === "actual_recalled" || r.basis === "reported_typicality"))?.basis;
}

function responseLeaves(responses: readonly Normalized[], source: Pwqe51SourcePackage) {
  const observations: Pwqe51Observation[] = [];
  const missingness: Pwqe51RouterResult["missingness"][number][] = [];
  for (const r of responses) {
    const q = source.questionBank.items.find((item) => item.id === r.questionId)!;
    if (!answered(r)) { missingness.push({ responseId: r.responseId, questionId: r.questionId, occurrenceId: r.occurrenceId, status: r.status }); continue; }
    const variant = r.variantId ? source.questionBank.variants.find((v) => v.id === r.variantId) : undefined;
    const options = variant?.options ?? q.options;
    for (const optionId of r.selectedOptionIds) {
      const option = options.find((o) => o.id === optionId)!;
      observations.push({ id: `${r.responseId}:${optionId}`, responseId: r.responseId, itemId: q.id, optionId, occurrenceId: r.occurrenceId, stepId: r.stepId, capture: variant?.captures ?? q.captures, text: option.text, reportedValue: option.reported_value ?? option.text, basis: r.basis, mode: r.mode, version: q.version, candidateSignals: option.candidate_signals ?? [], ...(r.variantId ? { variantId: r.variantId } : {}) });
    }
  }
  return { observations, missingness };
}

function samePair(a: readonly string[] | undefined, b: readonly string[]) { return Boolean(a && a.length === 2 && a[0] === b[0] && a[1] === b[1]); }

const NEXT_TARGETS = new Set(["access_before_change", "sequence_relation", "goal_change", "next_effect"]);
const RECOVERY_TARGETS = new Set(["recovery_duration", "recovery_marker", "recovery_sequence"]);
const SELF_TARGETS = new Set(["self_pressure", "vulnerable_meaning"]);
const RELATIONAL_OPTIONS = new Set(["M18.upset", "M18.matter", "M18.depend", "M19.ease", "M19.inspect", "D43.okay", "D43.notice", "D45.return", "D45.words", "D45.disbelieve"]);
const PRACTICAL_OPTIONS = new Set(["M03.requirements", "M03.no_aim", "M09.practical", "M09.status", "M16.practical", "M16.loss", "M18.info", "M19.information", "M21.practical", "M25.deadline", "D02.practical", "D03.real", "D16.consequence", "D16.unsafe", "D16.load", "D21.practical", "D43.information", "D46.own", "D46.control", "D48.privacy", "D48.timing", "D64.short", "D64.information"]);
const PREVENTIVE_OPTIONS = new Set(["M03.exposure", "D02.prevent", "D15.prevent", "D15.before", "D49.worse"]);
const UNKNOWN_OPTIONS = new Set(["D05.cannot", "D06.unclear", "D11.unclear", "D16.unclear", "D19.none", "D25.unclear", "D29.unclear", "D33.uncertain", "D43.automatic", "D49.unclear", "D57.unclear", "D58.unclear"]);
const ORDINARY_ACTIONS = new Set(["M02.bounded", "M02.none", "M04.fix", "M04.tell", "M04.continue", "M07.accept", "M08.limit", "M08.no", "M08.reduce", "M11.reduce", "M15.pause", "M15.other", "M17.other", "M17.wait", "M20.ask", "M23.apology", "M23.practical", "M25.stop", "M25.deadline", "D62.ask", "D62.later", "D62.mix"]);

function baseTargetOpens(targetId: string, ep: string, step: string, observations: readonly Pwqe51Observation[], focus: ReadonlySet<string>, details: ReadonlySet<string>, flags: ReadonlySet<string>, allOptions: ReadonlySet<string>, signals: ReadonlySet<string>): boolean {
  const has = (...ids: string[]) => ids.some((id) => allOptions.has(id));
  const action = observations.some((o) => o.occurrenceId === ep && o.stepId === step && ["first_action", "next_action", "later_action", "during_action", "self_response"].includes(o.capture ?? "") && !["M02.none", "M13.nothing", "M23.none", "D07.nothing", "D07.changed", "D54.none", "D63.none"].includes(o.optionId));
  const focused = focus.has(ep);
  if (["attachment_meaning", "help_function", "uncertainty_meaning", "money_context", "loss_want", "expressed_pace"].includes(targetId)) return true;
  if (NEXT_TARGETS.has(targetId)) return has("D07.more", "D07.leave", "D07.absorb", "D07.help", "D07.quiet", "D07.changed", "D07.nothing");
  if (targetId === "attention") return details.has("state") || ["attention_difficulty", "attention_scattered", "processing_slow"].some((x) => signals.has(x));
  if (targetId === "words") return details.has("state") || ["speech_access", "words_blocked", "low_access"].some((x) => signals.has(x));
  if (targetId === "energy") return details.has("state") || ["energy_drop", "mixed_energy", "energy_shift"].some((x) => signals.has(x));
  if (targetId === "noticed_order") return details.has("state") || details.has("body");
  if (targetId === "availability_history") return [...allOptions].some((x) => RELATIONAL_OPTIONS.has(x));
  if (targetId === "contact_function") return has("M17.check", "M17.send", "M17.reread") && [...allOptions].some((x) => RELATIONAL_OPTIONS.has(x) || ["M18.info", "M18.open"].includes(x));
  if (targetId === "known_distance") return has("M18.upset", "M18.matter", "M19.ease", "M19.inspect", "D44.variable", "D44.strained");
  if (targetId === "reassurance_duration") return has("M19.ease", "D43.okay");
  if (targetId === "care_scope") return focused || details.has("recurrence") || details.has("contrast");
  if (targetId === "contrast_context") return focused || details.has("contrast");
  if (targetId === "contrast_goal") return true;
  if (targetId === "cost") return focused || details.has("texture");
  if (targetId === "disclosure_prediction") return has("D47.piece", "D47.light", "D47.wait", "D47.change", "D47.none");
  if (targetId === "distance_function") return has("D62.ask", "D62.agree", "D62.later", "D62.less", "D62.explain", "D62.mix");
  if (targetId === "feeling_access") return flags.has("actual_feeling_episode") && (focused || details.has("feeling"));
  if (targetId === "function") {
    if (!action) return false;
    if ([...allOptions].some((x) => ["M03", "D02", "D15", "D49"].some((q) => x.startsWith(`${q}.`)))) return true;
    return focused || observations.some((o) => o.occurrenceId === ep && ["first_action", "next_action", "later_action", "during_action", "self_response"].includes(o.capture ?? "") && o.candidateSignals.length > 0 && !ORDINARY_ACTIONS.has(o.optionId));
  }
  if (targetId === "hidden_want") return [...allOptions].some((x) => ["D02.visible", "D17.none", "M20.small", "M20.hint", "M20.justify", "M20.wait", "M20.none", "M22.minimize"].includes(x)) && !has("M21.practical", "M21.clear");
  if (targetId === "need_exposure") return [...allOptions].some((x) => ["M20.small", "M20.hint", "M20.justify", "M20.wait", "M20.none", "M22.minimize", "M21.burden", "M21.refusal", "M21.owe", "M22.mixed", "D02.visible", "D18.need", "D18.hurt", "D18.anger", "D18.uncertain", "D18.want", "D21.visible", "D21.need", "D21.no", "D21.receive", "D17.help", "D17.care", "D17.none", "D18.none", "D21.none"].includes(x)) && !has("M21.practical", "M21.clear");
  if (targetId === "predicted_response") return flags.has("reported_exposure_concern");
  if (targetId === "next_move") return observations.some((o) => o.occurrenceId === ep && ["first", "during"].includes(o.stepId) && ["first_action", "next_action", "later_action", "during_action", "self_response"].includes(o.capture ?? "")) && (focused || has("M11.push", "M11.absorb", "M11.stop", "M12.function", "M12.same", "M12.worse", "D55.quiet", "D55.end", "D59.other", "D59.urge", "D61.explain", "D61.sharp", "D61.settle", "D61.quiet", "D61.leave"));
  if (targetId === "ordinary_contrast") return details.has("contrast") || (focused && has("M01.tasks", "M01.restless", "D60.tasks", "D60.guilt"));
  if (targetId.startsWith("polarization_")) return flags.has("actual_simultaneous_wants") && observations.some((o) => o.occurrenceId === ep && o.itemId === "M27") && (targetId === "polarization_relation" || has("D12.cost", "D12.switch"));
  if (targetId === "practical_context") return [...allOptions].some((x) => ["M03.exposure", "M03.error", "M03.approval", "M09.disappointed", "M09.conflict", "M09.practical", "M09.status", "M16.mistake", "M16.unprepared", "M16.unclear", "M21.burden", "M21.owe", "M21.refusal", "D02.prevent", "D02.visible", "D02.feel", "D03.judged", "D03.connection", "D03.upset", "D19.reject", "D19.judge", "D19.control", "D34.unsafe", "D46.feeling", "D48.trust", "D49.pressure", "D49.worse", "D60.guilt", "D61.leave", "D61.quiet"].includes(x));
  if (targetId === "praise_experience") return has("M07.flaw", "M07.credit", "M07.joke", "M07.move_on", "M07.ask");
  if (targetId === "prediction") return has("D02.prevent", "D02.visible", "M08.yes", "M08.explain", "M08.delay");
  if (targetId === "quiet_or_access") return flags.has("actual_low_response");
  if (targetId === "recovery_marker") return focused || has("M12.function", "M12.same", "M12.worse", "D30.stuck", "D30.tired", "D34.words", "D34.tired");
  if (targetId === "recovery_sequence") return flags.has("actual_recovery_episode") && (details.has("state") || focused);
  if (targetId === "recovery_duration") return flags.has("actual_easing") && (focused || details.has("state") || has("M14.brief"));
  if (targetId === "recurrence") return has("M03.exposure", "M03.approval", "D04.sign", "D05.usual") || details.has("recurrence");
  if (targetId === "repair_aim") return focused || has("M23.explain", "M23.invite", "M23.wait", "M23.none");
  if (targetId === "repair_feature") return observations.some((o) => o.occurrenceId === ep && o.itemId === "M24");
  if (targetId === "return_after_repair") return observations.some((o) => o.occurrenceId === ep && o.itemId === "M24") && (focused || has("M24.space", "M24.outward", "M24.missed"));
  if (targetId === "rest_access") return has("M25.one_more", "M25.alternate", "M25.absorb", "M25.exhaust", "M25.deadline") || (focused && observations.some((o) => o.occurrenceId === ep && o.itemId === "M25"));
  if (targetId === "self_pressure") return has("M05.attack", "M05.rules", "M06.worse", "D22.careless", "D22.incapable", "D22.not_enough");
  if (targetId === "social_feature") return flags.has("actual_helpful_social_effect") || has("M22.unhelpful");
  if (targetId === "stand_down") return has("M02.recheck", "M02.rehearse", "M03.approval", "M25.one_more", "M25.alternate", "D15.prevent", "D15.before", "D60.tasks", "D60.guilt") && !has("M03.requirements", "M03.no_aim");
  if (targetId === "timing") return has("M03.relief");
  if (targetId === "after_stop") return flags.has("actual_response_stop");
  if (targetId === "urge_action_difference") return true;
  if (targetId === "vulnerable_meaning") return has("M05.attack", "D03.judged", "D03.connection", "D15.before", "D15.pay", "D20.need", "D20.hurt", "D20.want", "D20.anger");
  return false;
}

function buildBaseTargets(input: Pwqe51RouterInput, source: Pwqe51SourcePackage, active: readonly Normalized[], observations: readonly Pwqe51Observation[], episodes: readonly Pwqe51Episode[], derivedFlags: ReturnType<typeof derivePwqe51Flags>): Pwqe51TargetResolution[] {
  const output: Pwqe51TargetResolution[] = [];
  const coverageIds = new Set(source.coverageRules.rules.map((r) => String(r.id)));
  const definitions = source.routingTargets.targets.filter((t) => !coverageIds.has(String(t.id)));
  const focused = new Set(input.focusOccurrences ?? []);
  const details = new Set(input.details ?? []);
  for (const episode of episodes.filter((e) => e.actual)) {
    const own = observations.filter((o) => o.occurrenceId === episode.id);
    const optionIds = new Set(own.map((o) => o.optionId));
    const signals = new Set(own.flatMap((o) => o.candidateSignals));
    const ids = new Set([...own.map((o) => o.itemId)]);
    for (const def of definitions) {
      const targetId = String(def.id);
      const origins = own.filter((o) => strings(def.opens_from_items).includes(o.itemId));
      if (targetId === "recurrence" && details.has("recurrence") && origins.length === 0 && own.some((o) => ["first_action", "next_action"].includes(o.capture ?? ""))) origins.push(...own.filter((o) => ["first_action", "next_action"].includes(o.capture ?? "")));
      const steps = new Set(origins.map((o) => o.stepId));
      if (NEXT_TARGETS.has(targetId)) { steps.clear(); steps.add("next"); }
      else if (RECOVERY_TARGETS.has(targetId)) { steps.clear(); steps.add("recovery"); }
      else if (SELF_TARGETS.has(targetId)) { steps.clear(); steps.add("self_response"); }
      else if (["function", "stand_down", "prediction", "practical_context", "hidden_want", "need_exposure", "vulnerable_meaning", "cost", "predicted_response", "timing", "after_stop"].includes(targetId)) {
        const relevant = [...steps].filter((s) => !["edge", "comparison", "recovery"].includes(s)); steps.clear(); for (const s of relevant.length ? relevant : ["first"]) steps.add(s);
      } else if (episode.family !== "bound") { steps.clear(); steps.add("first"); }
      for (const stepId of steps.size ? steps : ["first"]) {
        const id = keyFor(targetId, episode.id, stepId);
        const requested = (input.requestedTargetIds ?? []).includes(id);
        if (!origins.length && !requested) continue;
        const flags = new Set(derivedFlags.flagsByEpisodeStep[pwqe51EpisodeStepKey(episode.id, stepId)] ?? []);
        if (!requested && !baseTargetOpens(targetId, episode.id, stepId, observations, focused, details, flags, optionIds, signals)) continue;
        const candidateItems = strings(def.candidate_items);
        let relevantItems = candidateItems.filter((item) => !item.startsWith("REPLAY")).filter((item) => ids.has(item));
        if (targetId === "function") relevantItems = ["M03", "D02", "D15", "D49"].filter((item) => ids.has(item));
        if (targetId === "prediction" && ids.has("M09")) relevantItems = ["M09"];
        if (targetId === "contact_function" && optionIds.has("M18.info")) relevantItems = ["M18"];
        if (targetId === "need_exposure" && optionIds.has("D17.none")) relevantItems = ["D17"];
        if (targetId === "hidden_want") relevantItems = ["D17", "D20"].filter((item) => ids.has(item));
        if (targetId === "practical_context" && [...optionIds].some((x) => ["M09.practical", "M09.status", "M16.practical", "M16.loss", "M21.practical", "D64.short", "D64.adjust", "D64.information"].includes(x))) relevantItems = ["M09", "M16", "M21", "D64"].filter((item) => ids.has(item));
        const answers = own.filter((o) => relevantItems.includes(o.itemId) && (!["function", "stand_down", "prediction", "cost", "timing"].includes(targetId) || o.stepId === stepId));
        let state: Pwqe51TargetState = "open";
        let reason = "authored_evidence_gap";
        let resolutionIds = answers.map((o) => o.id);
        if (NEXT_TARGETS.has(targetId) && ["D07.nothing", "D07.changed"].some((x) => optionIds.has(x))) { state = "resolved_descriptively"; reason = "no_actual_later_action"; resolutionIds = own.filter((o) => o.itemId === "D07").map((o) => o.id); }
        else if (NEXT_TARGETS.has(targetId) && optionIds.has("D08.different")) { state = "unresolved"; reason = "different_occurrences_require_rebinding"; resolutionIds = own.filter((o) => o.itemId === "D08").map((o) => o.id); }
        else if (targetId === "need_exposure" && ["D18.none", "D21.none", "D21.practical", "D17.none"].some((x) => optionIds.has(x))) { state = "supports_alternative"; reason = "reported_no_exposure_difficulty_or_practical_barrier"; resolutionIds = own.filter((o) => ["D18.none", "D21.none", "D21.practical", "D17.none"].includes(o.optionId)).map((o) => o.id); }
        else if (answers.length) {
          const values = new Set(answers.map((o) => o.optionId));
          const hasPractical = [...values].some((x) => PRACTICAL_OPTIONS.has(x));
          const hasPreventive = [...values].some((x) => PREVENTIVE_OPTIONS.has(x));
          const hasRelief = [...values].some((x) => ["D02.feel", "D09.relief", "D43.okay", "D21.visible", "D18.need", "D48.burden"].includes(x));
          if ([...values].some((x) => UNKNOWN_OPTIONS.has(x))) { state = "unresolved"; reason = "discriminator_retains_uncertainty"; }
          else if (hasPractical && (hasPreventive || hasRelief)) { state = "resolved_descriptively"; reason = "multiple_meanings_retained_without_choosing_one"; }
          else if (hasPractical) { state = "supports_alternative"; reason = "ordinary_or_contextual_explanation_recorded"; }
          else if (hasPreventive || hasRelief) { state = "supports_interpretation"; reason = "explicit_discriminating_evidence_recorded_not_a_final_report_claim"; }
          else { state = "resolved_descriptively"; reason = "discriminator_answered_descriptively"; }
        }
        const attempts = active.filter((r) => candidateItems.includes(r.questionId) && r.occurrenceId === episode.id && r.stepId === stepId).length;
        const max = requested ? Number(def.explicitly_requested_maximum_attempts ?? 1) : Number(def.maximum_attempts ?? 1);
        if (state === "open" && attempts >= max) { state = "unresolved"; reason = "attempt_limit"; }
        if (state === "open" && Number(def.default_priority) === 6 && !requested && !focused.has(episode.id) && details.size === 0) { state = "abandoned_low_value"; reason = "texture_not_requested"; }
        const missing = [...active].reverse().find((r) => candidateItems.includes(r.questionId) && r.occurrenceId === episode.id && r.stepId === stepId && r.status !== "answered");
        if (state === "open" && missing) { state = missing.status === "skip" ? "declined" : missing.status === "no_event" || missing.status === "not_applicable" ? "unavailable" : "unresolved"; reason = `discriminator_${missing.status}`; }
        output.push({ id, targetId, occurrenceId: episode.id, stepId, state, reason, sourceObservationIds: [...new Set(origins.map((o) => o.id))], resolutionObservationIds: resolutionIds, candidateItems: state === "open" ? candidateItems : [], priority: Number(def.default_priority ?? 4) });
      }
    }
  }
  return output;
}

function coverageTargets(input: Pwqe51RouterInput, source: Pwqe51SourcePackage, active: readonly Normalized[], observations: readonly Pwqe51Observation[], episodes: readonly Pwqe51Episode[], derivedFlags: ReturnType<typeof derivePwqe51Flags>): Pwqe51TargetResolution[] {
  const targets: Pwqe51TargetResolution[] = [];
  const episodesById = new Map(episodes.map((e) => [e.id, e]));
  const requested = new Set(input.requestedTargetIds ?? []);
  const focus = new Set(input.focusOccurrences ?? []);
  const details = new Set(input.details ?? []);
  const administrative: Pwqe51CoverageAdministration[] = active.map((r) => ({ id: r.responseId, itemId: r.questionId, comparisonIds: input.comparisonIdsByResponseId?.[r.responseId], response: { id: r.responseId, status: r.status } }));
  for (const rule of source.coverageRules.rules) {
    const ruleId = String(rule.id);
    const itemId = String(rule.item_id);
    const scope = String(rule.scope);
    if (rule.root === true) {
      for (const episode of episodes) if (episode.actual && active.some((r) => r.occurrenceId === episode.id && r.questionId === itemId)) {
        const id = keyFor(ruleId, episode.id, "first");
        const leaves = observations.filter((o) => o.occurrenceId === episode.id && o.itemId === itemId);
        const result = closeTarget(rule, leaves, active, episode.id, "first", id);
        targets.push({ id, targetId: ruleId, occurrenceId: episode.id, stepId: "first", state: result.state, reason: result.reason, sourceObservationIds: leaves.map((o) => o.id), resolutionObservationIds: result.ids, candidateItems: [itemId], priority: Number(rule.priority ?? 4) });
      }
      continue;
    }
    for (const episode of episodes) {
      if (!episode.actual) continue;
      const comparisonPairs: (readonly string[] | undefined)[] = scope === "comparison" ? (input.distinctPairs ?? []).filter((p) => p[0] === episode.id) : [undefined];
      for (const comparisonIds of comparisonPairs) {
        const stepId = scope;
        const id = keyFor(ruleId, episode.id, stepId, comparisonIds);
        const alreadyRequested = requested.has(id);
        const own = observations.filter((o) => o.occurrenceId === episode.id);
        const origins = own.filter((o) => strings(rule.opens_from_items).includes(o.itemId));
        if (scope !== "comparison" && origins.length === 0 && !alreadyRequested) continue;
        if (rule.automatic !== true && !alreadyRequested) continue;
        const parents = new Set(active.filter((r) => r.occurrenceId === episode.id && r.status === "answered").map((r) => r.questionId));
        const flags = new Set(derivedFlags.flagsByEpisodeStep[pwqe51EpisodeStepKey(episode.id, stepId)] ?? []);
        if (comparisonIds) {
          for (const flag of derivedFlags.comparisonFlagsByPair[pwqe51ComparisonPairKey(comparisonIds[0], comparisonIds[1])] ?? []) flags.add(flag);
        }
        const gate = evaluatePwqe51CoverageGate(source, ruleId, {
          episode, observations: own, observationsByEpisode: Object.fromEntries(episodes.map((e) => [e.id, observations.filter((o) => o.occurrenceId === e.id)])),
          episodes: episodesById, administrations: administrative, currentAnsweredParents: parents, flags, stepId,
          ...(comparisonIds ? { comparisonIds } : {}),
        });
        if (gate.reason) continue;
        const sourceIds = [...new Set([...origins.map((o) => o.id), ...gate.anchorObservationIds])];
        const openedOrder = Math.min(...sourceIds.map((oid) => observations.findIndex((o) => o.id === oid)).filter((i) => i >= 0), 99999);
        void openedOrder;
        const output = closeTarget(rule, own, active, episode.id, stepId, id, comparisonIds, input.comparisonIdsByResponseId);
        let state: Pwqe51TargetState = output.state;
        let reason = output.reason;
        const attempts = active.filter((r) => r.questionId === itemId && r.occurrenceId === episode.id && r.stepId === stepId && (!comparisonIds || samePair(input.comparisonIdsByResponseId?.[r.responseId], comparisonIds))).length;
        const targetDef = source.routingTargets.targets.find((t) => t.id === ruleId);
        const maxAttempts = Number(targetDef?.maximum_attempts ?? 1);
        if (state === "open" && attempts >= maxAttempts) { state = "unresolved"; reason = "coverage_attempt_limit"; }
        const detailsNeeded = strings(rule.details);
        if (state === "open" && rule.focus_or_details_only === true && !(alreadyRequested || focus.has(episode.id) || detailsNeeded.some((d) => details.has(d)))) { state = "abandoned_low_value"; reason = "coverage_optional_precision_not_requested"; }
        if (input.rejectedTargetIds?.includes(id)) { state = "unresolved"; reason = "respondent_rejected_interpretation"; }
        const closed = input.closedBindings?.[id];
        if (closed) { state = "unavailable"; reason = "coverage_binding_closed"; }
        targets.push({ id, targetId: ruleId, occurrenceId: episode.id, stepId, ...(comparisonIds ? { comparisonIds: comparisonIds as [string, string] } : {}), state, reason, sourceObservationIds: sourceIds, resolutionObservationIds: output.ids, candidateItems: state === "open" ? [itemId] : [], priority: Number(rule.priority ?? 4) });
      }
    }
  }
  return targets.sort((a, b) => a.id.localeCompare(b.id));
}

function closeTarget(rule: Rule, leaves: readonly Pwqe51Observation[], active: readonly Normalized[], episodeId: string, stepId: string, targetInstanceId: string, comparisonIds?: readonly string[], comparisonIdsByResponseId?: Readonly<Record<string, readonly [string, string]>>) {
  const itemId = String(rule.item_id);
  let answers = leaves.filter((o) => o.itemId === itemId && o.stepId === stepId);
  if (comparisonIds) {
    const relevant = active.filter((r) => r.questionId === itemId && samePair(comparisonIdsByResponseId?.[r.responseId], comparisonIds)).map((r) => r.responseId);
    answers = answers.filter((o) => relevant.includes(o.responseId));
  }
  if (answers.length) {
    const values = new Set(answers.map((o) => o.optionId));
    const unknown = strings(rule.unknown_options);
    const alternatives = strings(rule.alternative_options);
    const state: Pwqe51TargetState = [...values].some((v) => unknown.includes(v)) ? "unresolved"
      : [...values].every((v) => alternatives.includes(v)) ? "supports_alternative" : "resolved_descriptively";
    const reason = state === "unresolved" ? "coverage_uncertainty_retained" : state === "supports_alternative" ? "coverage_ordinary_or_competing_account" : "coverage_description_recorded_not_theory_classification";
    return { state, reason, ids: answers.map((o) => o.id) };
  }
  const attempted = [...active].reverse().find((r) => r.questionId === itemId && r.occurrenceId === episodeId && r.stepId === stepId && (!comparisonIds || samePair(comparisonIdsByResponseId?.[r.responseId], comparisonIds)));
  if (attempted && attempted.status !== "answered") {
    return { state: attempted.status === "skip" ? "declined" as const : attempted.status === "no_event" || attempted.status === "not_applicable" ? "unavailable" as const : "unresolved" as const, reason: `coverage_${attempted.status}`, ids: [] as string[] };
  }
  return { state: "open" as const, reason: "coverage_gate_open", ids: [] as string[] };
}

function sequenceEdges(active: readonly Normalized[], observations: readonly Pwqe51Observation[]): Pwqe51SequenceEdge[] {
  const edges: Pwqe51SequenceEdge[] = [];
  for (const response of active.filter((r) => r.questionId === "D08" && answered(r))) {
    for (const selected of response.selectedOptionIds) {
      const relation = selected === "D08.after_failed" || selected === "D08.after" ? "before" : selected === "D08.overlap" ? "simultaneous" : selected === "D08.alternate" ? "alternating" : selected === "D08.uncertain" ? "order_unknown" : undefined;
      if (relation) edges.push({ id: `edge:${response.responseId}:${selected}`, occurrenceId: response.occurrenceId, fromStep: "first", toStep: "next", relation, responseId: response.responseId, observationIds: [`${response.responseId}:${selected}`], meaning: "reported_temporal_relation_not_causality" });
    }
  }
  for (const response of active.filter((r) => r.questionId === "D78" && answered(r) && r.selectedOptionIds.includes("D78.returned"))) {
    const same = observations.filter((o) => o.occurrenceId === response.occurrenceId);
    const order = same.filter((o) => ["D08.after_failed", "D08.after", "D08.alternate"].includes(o.optionId));
    const next = same.filter((o) => o.itemId === "D07" && !["D07.nothing", "D07.changed"].includes(o.optionId));
    if (response.basis !== "actual_recalled" || !order.length || !next.length || [...order, ...next].some((o) => o.basis !== "actual_recalled")) throw new Error("D78 return requires same-episode D08 sequence and actual D07 next response.");
    edges.push({ id: `return:${response.responseId}`, occurrenceId: response.occurrenceId, fromStep: "next", toStep: response.stepId, relation: "before", responseId: response.responseId, observationIds: [...new Set([`${response.responseId}:D78.returned`, ...order.map((o) => o.id), ...next.map((o) => o.id)])].sort(), meaning: "reported_earlier_response_returns_at_a_later_step_not_a_causal_loop" });
  }
  return edges;
}

function candidateAllowed(q: Pwqe51Question, episodeId: string, active: readonly Normalized[], source: Pwqe51SourcePackage, opted: Set<string>, derivedFlags: ReturnType<typeof derivePwqe51Flags>, comparisonIds?: readonly [string, string]): boolean {
  const own = active.filter((r) => r.occurrenceId === episodeId);
  if (own.some((r) => r.questionId === q.id && r.stepId === q.step_binding)) return false;
  if (q.eligibility.topic_opt_in && !opted.has(q.eligibility.topic_opt_in)) return false;
  if (q.eligibility.requires_answered.some((id) => !own.some((r) => r.questionId === id && answered(r)))) return false;
  const gate = obj(source.itemGates.gates[q.id]);
  const parents = own.flatMap((r) => r.selectedOptionIds);
  const specific = obj(q.eligibility.specific);
  if (strings(gate.required_parent_options ?? specific.required_parent_options).some((x) => !parents.includes(x))) return false;
  if (strings(gate.exclude_parent_options ?? specific.exclude_parent_options).some((x) => parents.includes(x))) return false;
  if (q.eligibility.actual_episode_required && !own.some((r) => r.basis === "actual_recalled")) return false;
  const requiredFlags = strings(gate.required_flags ?? specific.required_flags);
  // These sequence questions are administered at a future step, while their
  // eligibility is established by an earlier step. Check the authored flag
  // at its evidence step without moving the administration off its authored
  // step binding: D07 follows a qualifying first move; D08 follows an actual
  // next move. Other items remain bound to their own step's flags.
  const evidenceStep = q.id === "D07" ? "first" : q.id === "D08" ? "next" : q.step_binding;
  const flags = new Set(derivedFlags.flagsByEpisodeStep[pwqe51EpisodeStepKey(episodeId, evidenceStep)] ?? []);
  if (comparisonIds) for (const flag of derivedFlags.comparisonFlagsByPair[pwqe51ComparisonPairKey(comparisonIds[0], comparisonIds[1])] ?? []) flags.add(flag);
  if (requiredFlags.some((required) => !flags.has(required))) return false;
  return true;
}

function makeCandidates(input: Pwqe51RouterInput, source: Pwqe51SourcePackage, active: readonly Normalized[], targets: readonly Pwqe51TargetResolution[], episodes: readonly Pwqe51Episode[], observations: readonly Pwqe51Observation[], derivedFlags: ReturnType<typeof derivePwqe51Flags>) {
  const phase = input.phase ?? "mapping";
  const candidates: Pwqe51RouteCandidate[] = [];
  if (phase === "mapping") {
    const mapping = source.questionBank.items.filter((item) => item.stage === "mapping");
    const offered = new Set(active.filter((r) => mapping.some((q) => q.id === r.questionId)).map((r) => r.questionId));
    const pending = mapping.filter((q) => !offered.has(q.id));
    const topics = new Set(input.optedInTopics ?? []);
    for (const q of pending) {
      const parents = q.eligibility.requires_answered;
      const parentRows = active.filter((r) => parents.length > 0 && r.questionId === parents[0] && answered(r));
      if (parents.length > 0 && parentRows.length === 0) continue;
      // M28 is a distinct comparison screen. It must wait until the rest of Mapping
      // is covered and an actual comparison source exists.
      if (q.id === "M28") {
        const otherPending = pending.some((item) => !["M28", "M29", "M30"].includes(item.id));
        const comparable = episodes.some((ep) => ep.actual && observations.some((o) => o.occurrenceId === ep.id && ["first_action", "next_action"].includes(o.capture ?? "")));
        if (otherPending || !comparable) continue;
      }
      const bindingKey = `coverage:${q.id}`;
      const parentEpisode = parentRows.at(-1)?.occurrenceId;
      const boundEpisode = parentEpisode ?? input.occurrenceBindings?.[bindingKey];
      if (boundEpisode) {
        // A root Mapping item creates its actual/typicality episode. Before it
        // is answered there cannot yet be response-derived basis/flags, so do
        // not apply post-answer eligibility to this first administration.
        // Parent-bound items still require their normal answer, topic, option,
        // basis, and derived-flag guards.
        if (parents.length > 0 && !candidateAllowed(q, boundEpisode, active, source, topics, derivedFlags)) continue;
        candidates.push({ questionId: q.id, occurrenceId: boundEpisode, stepId: q.step_binding, targetIds: [`coverage:${q.id}`], priority: parents.length ? 1 : 2, stage: "mapping" });
      } else if (!parents.length) {
        candidates.push({ questionId: q.id, occurrenceId: null, bindingKey, bindingRequest: "new_actual_occurrence", stepId: q.step_binding, targetIds: [`coverage:${q.id}`], priority: 2, stage: "mapping" });
      }
    }
  } else {
    for (const target of targets.filter((t) => t.state === "open")) {
      // A target may have several discriminators. Trying only candidateItems[0]
      // silently strands valid follow-ups when the first one is unavailable.
      // REPLAY is intentionally excluded until explicit second-occurrence
      // confirmation has an end-to-end trusted session/API implementation.
      for (const itemId of target.candidateItems.filter((id) => !id.startsWith("REPLAY"))) {
        const q = source.questionBank.items.find((item) => item.id === itemId);
        if (!q || !candidateAllowed(q, target.occurrenceId, active, source, new Set(input.optedInTopics ?? []), derivedFlags, target.comparisonIds)) continue;
        candidates.push({ questionId: q.id, occurrenceId: target.occurrenceId, stepId: q.step_binding, targetIds: [target.id], priority: target.priority, stage: "deepening" });
      }
    }
    for (const entry of source.routingTargets.entry_points) {
      if (!(input.optedInTopics ?? []).includes(String(entry.id))) continue;
      const itemId = String(entry.first_item);
      const q = source.questionBank.items.find((item) => item.id === itemId);
      if (!q) continue;
      const bindingKey = `entry:${entry.id}`;
      const bound = input.occurrenceBindings?.[bindingKey];
      const occurrenceId = bound ?? (q.eligibility.requires_answered.length ? active.find((r) => answered(r))?.occurrenceId : undefined);
      if (occurrenceId) {
        // An entry root establishes its own episode basis. Its server-bound
        // occurrence is necessarily unanswered at first, so actual-basis and
        // response-derived flag guards cannot be evaluated until the response
        // is recorded. The explicit topic opt-in above remains mandatory.
        const unansweredRoot = q.eligibility.requires_answered.length === 0
          && !active.some((response) => response.occurrenceId === occurrenceId);
        if (unansweredRoot || candidateAllowed(q, occurrenceId, active, source, new Set(input.optedInTopics ?? []), derivedFlags)) candidates.push({ questionId: itemId, occurrenceId, stepId: "first", targetIds: [`entry:${entry.id}`], priority: 4, stage: "deepening" });
      } else if (!q.eligibility.requires_answered.length) candidates.push({ questionId: itemId, occurrenceId: null, bindingKey, bindingRequest: "new_actual_occurrence", stepId: "first", targetIds: [`entry:${entry.id}`], priority: 4, stage: "deepening" });
    }
  }
  const contextLast = new Map<string, number>();
  active.forEach((response, index) => contextLast.set(source.questionBank.items.find((q) => q.id === response.questionId)?.context ?? "", index));
  const focused = new Set(input.focusOccurrences ?? []);
  const questions = new Map(source.questionBank.items.map((q) => [q.id, q]));
  return candidates.sort((a, b) => {
    const aq = questions.get(a.questionId)!; const bq = questions.get(b.questionId)!;
    const af = a.occurrenceId !== null && focused.has(a.occurrenceId); const bf = b.occurrenceId !== null && focused.has(b.occurrenceId);
    const ar = aq.eligibility.requires_answered.length; const br = bq.eligibility.requires_answered.length;
    const ad = aq.selection.mode === "partial_order" ? Number(aq.selection.max_select ?? 1) + 1 : aq.selection.mode === "single" ? 1 : 3;
    const bd = bq.selection.mode === "partial_order" ? Number(bq.selection.max_select ?? 1) + 1 : bq.selection.mode === "single" ? 1 : 3;
    return a.priority - b.priority || Number(bf) - Number(af) || br - ar || ad - bd
      || (contextLast.get(aq.context) ?? -1) - (contextLast.get(bq.context) ?? -1)
      || a.questionId.localeCompare(b.questionId) || (a.occurrenceId ?? "").localeCompare(b.occurrenceId ?? "") || a.stepId.localeCompare(b.stepId);
  });
}

export function compilePwqe51Route(input: Pwqe51RouterInput, source: Pwqe51SourcePackage): Pwqe51RouterResult {
  const normalized = normalize(input, source);
  const active = normalized.active;
  const { observations, missingness } = responseLeaves(active, source);
  const roots = new Map<string, Normalized>();
  for (const r of active) if (r.basis === "actual_recalled" || r.basis === "reported_typicality") roots.set(r.occurrenceId, roots.get(r.occurrenceId) ?? r);
  const distinct = new Map<string, Set<string>>();
  for (const [a, b] of input.distinctPairs ?? []) { distinct.set(a, new Set([...(distinct.get(a) ?? []), b])); distinct.set(b, new Set([...(distinct.get(b) ?? []), a])); }
  for (const r of active.filter((x) => x.questionId === "D08" && x.selectedOptionIds.includes("D08.different"))) {
    // Such a response marks binding unresolved; it does not confirm or create another episode.
    void r;
  }
  const episodes: Pwqe51Episode[] = [...roots.entries()].map(([id, root]) => {
    const q = source.questionBank.items.find((item) => item.id === root.questionId)!;
    const basis = root.basis as "actual_recalled" | "reported_typicality";
    return { id, family: q.episode_family, context: q.context, basis, actual: basis === "actual_recalled", distinctFrom: [...(distinct.get(id) ?? [])].sort(), responseIds: active.filter((r) => r.occurrenceId === id).map((r) => r.responseId) };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const actualEpisodeIds = new Set(episodes.filter((episode) => episode.actual).map((episode) => episode.id));
  for (const pair of input.distinctPairs ?? []) {
    if (pair.length !== 2 || pair[0] === pair[1] || !actualEpisodeIds.has(pair[0]) || !actualEpisodeIds.has(pair[1])) {
      throw new Error("Confirmed distinctness requires two different, existing actual episodes.");
    }
  }
  const steps: Pwqe51Step[] = [...new Set(observations.map((o) => `${o.occurrenceId}\u0000${o.stepId}`))].sort().map((key) => {
    const [occurrenceId, stepId] = key.split("\u0000");
    const rows = observations.filter((o) => o.occurrenceId === occurrenceId && o.stepId === stepId);
    return { id: `${occurrenceId}:${stepId}`, occurrenceId, responseIds: [...new Set(rows.map((o) => o.responseId))], observationIds: rows.map((o) => o.id) };
  });
  const priorOccurrencesByLaterOccurrence = new Map<string, Set<string>>();
  for (const [priorOccurrenceId, laterOccurrenceId] of input.distinctPairs ?? []) {
    const prior = priorOccurrencesByLaterOccurrence.get(laterOccurrenceId) ?? new Set<string>();
    prior.add(priorOccurrenceId);
    priorOccurrencesByLaterOccurrence.set(laterOccurrenceId, prior);
  }
  const derivedFlags = derivePwqe51Flags(source, {
    episodes: episodes.map((episode) => ({
      id: episode.id,
      family: episode.family,
      status: "actual",
      basis: episode.actual ? "actual" : "reported_typicality",
      distinctFrom: [...(priorOccurrencesByLaterOccurrence.get(episode.id) ?? [])],
    })),
    currentResponses: active.filter((response) => response.status === "answered").map((response) => ({
      responseId: response.responseId,
      administrationId: response.responseId,
      itemId: response.questionId,
      episodeId: response.occurrenceId,
      administrationEpisodeId: response.occurrenceId,
      stepId: response.stepId,
      status: response.status,
      selectedOptionIds: response.selectedOptionIds,
      variantId: response.variantId,
    })),
    currentContextFacts: input.contextFacts,
    enabledTopics: input.optedInTopics ?? [],
  });
  const targets = [...buildBaseTargets(input, source, active, observations, episodes, derivedFlags), ...coverageTargets(input, source, active, observations, episodes, derivedFlags)].sort((a, b) => a.id.localeCompare(b.id));
  const sequence = sequenceEdges(active, observations);
  const administrationCount = new Set(normalized.all.map((r) => `${r.questionId}\u0000${r.occurrenceId}\u0000${r.stepId}`)).size;
  const totalLimit = Math.min(input.totalLimit ?? 56, 56);
  const mappingLimit = Math.min(input.mappingLimit ?? 32, 32);
  const decisionLimit = Math.min(input.decisionLimit ?? 72, 72);
  const decisionCount = normalized.all.length + (input.controls?.length ?? 0);
  const mappingAdministrationCount = new Set(normalized.all.filter((r) => source.questionBank.items.find((q) => q.id === r.questionId)?.stage === "mapping").map((r) => `${r.questionId}\u0000${r.occurrenceId}\u0000${r.stepId}`)).size;
  let phase: Pwqe51RouterResult["phase"] = input.phase ?? "mapping";
  let completionReason: string | undefined;
  if (input.controls?.includes("end")) { phase = "finished"; completionReason = "user_end"; }
  else if (administrationCount >= totalLimit || decisionCount >= decisionLimit || (phase === "mapping" && mappingAdministrationCount >= mappingLimit)) {
    phase = "finished"; completionReason = "administration_or_decision_limit";
  }
  const candidates = phase === "finished" ? [] : makeCandidates(input, source, active, targets, episodes, observations, derivedFlags).filter((c) => c.stage === phase);
  if (input.controls?.includes("shorten")) candidates.splice(0, candidates.length, ...candidates.filter((c) => c.priority < 5));
  const next = candidates[0] ?? null;
  if (!next && phase !== "finished") { const completed = phase; phase = "finished"; completionReason = completed === "mapping" ? "mapping_coverage_complete" : "no_eligible_material_target"; }
  return { sourceRelease: source.questionBank.release, phase, ...(completionReason ? { completionReason } : {}), observations, episodes, steps, targets, candidates, next, sequenceEdges: sequence, missingness, supersededResponseIds: normalized.superseded, invalidatedResponses: normalized.invalidated, administrationCount, decisionCount };
}

export async function routePwqe51Assessment(input: Pwqe51RouterInput, workspaceRoot?: string): Promise<Pwqe51RouterResult> {
  const { loadPwqe51SourcePackage } = await import("../../question-engine/pwqe51-source.ts");
  return compilePwqe51Route(input, await loadPwqe51SourcePackage(workspaceRoot));
}
