import type { Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";

/** A literal selected response leaf. These IDs are immutable response-lineage IDs. */
export interface Pwqe51CoverageObservation {
  readonly id: string;
  readonly itemId: string;
  readonly optionId: string;
  readonly responseId: string;
  readonly capture?: string;
  readonly stepId?: string;
}

export interface Pwqe51CoverageEpisode {
  readonly id: string;
  readonly actual: boolean;
  readonly distinctFrom?: readonly string[];
}

export interface Pwqe51CoverageResponse {
  readonly id: string;
  readonly status: string;
}

export interface Pwqe51CoverageAdministration {
  readonly id: string;
  readonly itemId: string;
  readonly comparisonIds?: readonly [string, string];
  readonly invalidated?: boolean;
  readonly response?: Pwqe51CoverageResponse;
}

/** Inputs are server-derived from the current assessment state and live response history. */
export interface Pwqe51CoverageGateContext {
  readonly episode: Pwqe51CoverageEpisode | null;
  /** Leaves for the episode being gated. */
  readonly observations: readonly Pwqe51CoverageObservation[];
  /** Additional leaves indexed by episode ID, needed only for two-episode comparisons. */
  readonly observationsByEpisode?: Readonly<Record<string, readonly Pwqe51CoverageObservation[]>>;
  readonly episodes: ReadonlyMap<string, Pwqe51CoverageEpisode>;
  readonly administrations: readonly Pwqe51CoverageAdministration[];
  readonly currentAnsweredParents: ReadonlySet<string>;
  readonly flags: ReadonlySet<string>;
  readonly comparisonIds?: readonly string[];
  readonly stepId: string;
}

export interface Pwqe51CoverageGateResult {
  readonly reason: string | null;
  /** Exact selected observation IDs that support this eligible gate. Empty on rejection. */
  readonly anchorObservationIds: readonly string[];
}

const ACTION_CAPTURES = new Set(["first_action", "next_action", "later_action", "during_action", "self_response"]);
const NO_ACTION_OPTIONS = new Set(["M02.none", "M13.nothing", "M23.none", "D07.nothing", "D07.changed", "D54.none", "D63.none"]);
const FLAG_SOURCE_ITEMS: Readonly<Record<string, ReadonlySet<string>>> = {
  actual_easing: new Set(["M12", "M14", "D35"]),
  actual_feeling_episode: new Set(["D24", "D25", "D65", "D66"]),
};
const BEHAVIOR_GROUPS: readonly ReadonlySet<string>[] = [
  new Set(["M02.rehearse", "D54.rehearse"]),
  new Set(["M02.recheck", "M04.check"]),
  new Set(["M15.check", "M17.check"]),
  new Set(["M04.explain", "D55.explain", "D61.explain"]),
  new Set(["D07.leave", "D55.end", "D61.leave"]),
  new Set(["D55.quiet", "D61.quiet"]),
  new Set(["M11.absorb", "M13.absorb", "M25.absorb", "D07.absorb", "D24.absorb", "D26.absorb"]),
  new Set(["M11.quiet", "M13.quiet"]),
  new Set(["M20.small"]),
  new Set(["D47.light"]),
  new Set(["M17.send"]),
];

function strings(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function text(rule: Readonly<Record<string, unknown>>, key: string): string {
  return typeof rule[key] === "string" ? rule[key] as string : "";
}

function flag(rule: Readonly<Record<string, unknown>>, key: string): boolean {
  return rule[key] === true;
}

function matchedBehavior(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  for (const option of left) if (right.has(option)) return true;
  return BEHAVIOR_GROUPS.some((group) => [...left].some((option) => group.has(option))
    && [...right].some((option) => group.has(option)));
}

function reject(reason: string): Pwqe51CoverageGateResult {
  return { reason, anchorObservationIds: [] };
}

function ruleFor(source: Pwqe51SourcePackage, id: string): Readonly<Record<string, unknown>> {
  const rule = source.coverageRules.rules.find((candidate) => candidate.id === id);
  if (!rule) throw new Error(`PWQE 5.1 coverage rule ${id} is not in the pinned source.`);
  return rule;
}

/**
 * Literal port of implementation/patternwork_router/coverage.py::coverage_gate.
 * Caller must supply only current, server-owned episode/response/observation state.
 */
export function evaluatePwqe51CoverageGate(
  source: Pwqe51SourcePackage,
  ruleId: string,
  context: Pwqe51CoverageGateContext,
): Pwqe51CoverageGateResult {
  const rule = ruleFor(source, ruleId);
  if (flag(rule, "root")) return { reason: null, anchorObservationIds: [] };
  const episode = context.episode;
  if (!episode?.actual) return reject("coverage_requires_actual_episode");

  const observations = context.observations;
  const optionIds = new Set(observations.map((observation) => observation.optionId));
  const anchors: Pwqe51CoverageObservation[] = [];

  if (text(rule, "scope") === "comparison") {
    const ids = context.comparisonIds ?? [];
    if (ids.length !== 2 || ids.some((id) => !context.episodes.get(id)?.actual)) {
      return reject("coverage_requires_distinct_comparison");
    }
    const [leftId, rightId] = ids;
    const leftEpisode = context.episodes.get(leftId)!;
    const rightEpisode = context.episodes.get(rightId)!;
    if (!leftEpisode.distinctFrom?.includes(rightId) && !rightEpisode.distinctFrom?.includes(leftId)) {
      return reject("coverage_comparison_distinctness_unknown");
    }
    const actionFor = (id: string) => observationsFor(context, id).filter((observation) =>
      (observation.stepId ?? "first") === "first"
      && ACTION_CAPTURES.has(observation.capture ?? "") && !NO_ACTION_OPTIONS.has(observation.optionId));
    const leftAction = actionFor(leftId);
    const rightAction = actionFor(rightId);
    if (!matchedBehavior(new Set(leftAction.map((observation) => observation.optionId)), new Set(rightAction.map((observation) => observation.optionId)))) {
      return reject("coverage_comparison_requires_matched_action");
    }
    const contextResponses = context.administrations.filter((administration) =>
      (administration.itemId === "D56" || administration.itemId === "D57")
      && samePair(administration.comparisonIds, ids)
      && administration.invalidated !== true
      && administration.response?.status === "answered");
    const liveIds = new Set(contextResponses.map((administration) => administration.response!.id));
    const live = observations.filter((observation) => liveIds.has(observation.responseId));
    if (live.length === 0) return reject("coverage_comparison_needs_context_or_job");
    anchors.push(...leftAction, ...rightAction, ...live);
  }

  const anyItems = strings(rule.any_items);
  if (anyItems.length > 0) {
    const matches = observations.filter((observation) => anyItems.includes(observation.itemId));
    if (matches.length === 0) return reject("coverage_anchor_item_missing");
    anchors.push(...matches);
  }
  const anyOptions = strings(rule.any_options);
  if (anyOptions.length > 0) {
    const matches = observations.filter((observation) => anyOptions.includes(observation.optionId));
    if (matches.length === 0) return reject("coverage_discriminating_selection_missing");
    anchors.push(...matches);
  }
  const allOptions = strings(rule.all_options);
  if (!allOptions.every((option) => optionIds.has(option))) return reject("coverage_required_selection_missing");
  anchors.push(...observations.filter((observation) => allOptions.includes(observation.optionId)));

  const excluded = strings(rule.exclude_options);
  if (excluded.some((option) => optionIds.has(option))) return reject("coverage_answer_excludes_followup");
  // Preserve dependency leaves for every option's source item, even when the
  // selected option is currently non-excluded. Corrections can change eligibility.
  const exclusionItems = new Set(excluded.map((option) => option.split(".")[0]));
  anchors.push(...observations.filter((observation) => exclusionItems.has(observation.itemId)));

  if (flag(rule, "requires_action")) {
    const action = observations.filter((observation) => observation.stepId === context.stepId
      && ACTION_CAPTURES.has(observation.capture ?? "") && !NO_ACTION_OPTIONS.has(observation.optionId));
    if (action.length === 0) return reject("coverage_selected_action_missing");
    anchors.push(...action);
  }
  const requiredFlags = strings(rule.required_flags);
  if (!requiredFlags.every((required) => context.flags.has(required))) return reject("coverage_required_context_missing");
  if (requiredFlags.length > 0) {
    const neededItems = new Set(requiredFlags.flatMap((required) => [...(FLAG_SOURCE_ITEMS[required] ?? [])]));
    anchors.push(...observations.filter((observation) => neededItems.has(observation.itemId)));
  }

  const question = source.questionBank.items.find((item) => item.id === text(rule, "item_id"));
  for (const parent of question?.eligibility.requires_answered ?? []) {
    if (!context.currentAnsweredParents.has(parent)) return reject("coverage_same_episode_parent_missing");
    anchors.push(...observations.filter((observation) => observation.itemId === parent));
  }

  return { reason: null, anchorObservationIds: [...new Set(anchors.map((observation) => observation.id))] };
}

function observationsFor(context: Pwqe51CoverageGateContext, episodeId: string): readonly Pwqe51CoverageObservation[] {
  // The caller may provide observations for all involved actual episodes. The
  // item leaves themselves carry no episode field in this narrow gate contract,
  // so use an episode-indexed view when comparing actions.
  return context.observationsByEpisode?.[episodeId] ?? (episodeId === context.episode?.id ? context.observations : []);
}

function samePair(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return Boolean(left && left.length === 2 && left[0] === right[0] && left[1] === right[1]);
}
