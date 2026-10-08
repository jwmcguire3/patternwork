import {
  PWQE51_RELEASE_IDENTITY,
  PWQE51_SOURCE_MANIFEST_SHA256,
  type Pwqe51SourcePackage,
} from "../../question-engine/pwqe51-source.ts";

export interface Pwqe51FlagEpisode {
  readonly id: string;
  readonly family: string;
  readonly status: string;
  readonly basis: string;
  readonly distinctFrom?: readonly string[];
}

/** A current row from the server's canonical response projection, after corrections/rebinding. */
export interface Pwqe51CanonicalResponseRow {
  readonly responseId: string;
  readonly administrationId: string;
  readonly itemId: string;
  /** Effective episode after trusted server-side binding/rebinding. */
  readonly episodeId: string;
  /** Original administration episode, used to preserve the reference's rebind-to-first rule. */
  readonly administrationEpisodeId: string;
  readonly stepId: string;
  readonly status: string;
  readonly selectedOptionIds: readonly string[];
  readonly variantId?: string | null;
}

export interface Pwqe51FlagContextFact {
  readonly episodeId: string;
  readonly fact: "bothersome_comment" | "need_became_known" | "noticed_feeling_without_acting";
  readonly value: boolean | null;
}

export interface Pwqe51FlagDerivationInput {
  readonly episodes: readonly Pwqe51FlagEpisode[];
  /** Must contain only currently bound responses. Superseded/invalidated rows are omitted by the server projection. */
  readonly currentResponses: readonly Pwqe51CanonicalResponseRow[];
  /** Latest trusted context-fact value per episode/fact, after context corrections. */
  readonly currentContextFacts?: readonly Pwqe51FlagContextFact[];
  /** Server-owned participant topic settings, never client-submitted runtime flags. */
  readonly enabledTopics: readonly string[];
}

export type Pwqe51FlagsByEpisodeStep = Readonly<Record<string, readonly string[]>>;
export type Pwqe51ComparisonFlagsByPair = Readonly<Record<string, readonly string[]>>;

export interface Pwqe51DerivedFlags {
  readonly flagsByEpisodeStep: Pwqe51FlagsByEpisodeStep;
  /** Keys are JSON.stringify([earlier/source episode ID, later/linked episode ID]). */
  readonly comparisonFlagsByPair: Pwqe51ComparisonFlagsByPair;
}

export function pwqe51EpisodeStepKey(episodeId: string, stepId: string): string {
  return `${episodeId}/${stepId}`;
}

export function pwqe51ComparisonPairKey(episodeA: string, episodeB: string): string {
  return JSON.stringify([episodeA, episodeB]);
}

const ACTION_CAPTURES = new Set(["first_action", "next_action", "later_action", "during_action", "self_response"]);
const NO_ACTION_OPTIONS = new Set(["M02.none", "M13.nothing", "M23.none", "D07.nothing", "D07.changed", "D54.none", "D63.none"]);
const LOW_RESPONSE_SIGNALS = new Set([
  "low_response", "low_activity", "words_blocked", "speech_access", "chosen_silence", "chosen_quiet",
  "speech_effort", "low_access", "felt_distance",
]);
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
const RECOVERY_OPTIONS = new Set([
  "M12.relief", "M12.clear", "M14.choice", "M14.energy", "M14.settled", "M14.brief",
  "D35.clear", "D35.words", "D35.choice", "D35.contact", "D35.energy",
]);
const LATER_EFFECT_OPTIONS = new Set(["M14.choice", "M14.energy", "M14.settled", "M14.brief"]);
const FLAG_NAMES = new Set([
  "actual_first_move", "actual_selected_step", "actual_next_move", "actual_simultaneous_wants",
  "reported_exposure_concern", "actual_feeling_episode", "actual_need_disclosure", "actual_low_response",
  "actual_recovery_episode", "actual_easing", "actual_helpful_social_effect", "body_detail_allowed",
  "actual_wait_response", "actual_space_or_distance_episode", "actual_received_repair", "actual_response_stop",
  "actual_bothersome_comment", "two_distinct_actual_episodes", "matched_reported_behavior", "reported_candidate_trigger",
]);
const ROUTING_STEPS = new Set(["first", "self_response", "recovery", "return", "comparison"]);

interface LiveLeaf {
  readonly response: Pwqe51CanonicalResponseRow;
  readonly optionId: string;
  readonly capture: string;
  readonly candidateSignals: readonly string[];
}

function optionsForSource(source: Pwqe51SourcePackage, itemId: string, variantId?: string | null) {
  const variant = variantId ? source.questionBank.variants.find((candidate) => candidate.id === variantId && candidate.replaces === itemId) : undefined;
  const question = source.questionBank.items.find((candidate) => candidate.id === itemId);
  if (!question) throw new Error(`PWQE 5.1 flag input references unpinned item ${itemId}.`);
  if (variantId && !variant) throw new Error(`PWQE 5.1 flag input references unpinned variant ${variantId} for ${itemId}.`);
  return { question, capture: variant?.captures ?? question.captures, options: variant?.options ?? question.options };
}

function matchedBehavior(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if ([...left].some((option) => right.has(option))) return true;
  return BEHAVIOR_GROUPS.some((group) => [...left].some((option) => group.has(option))
    && [...right].some((option) => group.has(option)));
}

function requireKnownAuthoredFlags(source: Pwqe51SourcePackage): void {
  if (source.sourceManifestSha256 !== PWQE51_SOURCE_MANIFEST_SHA256
    || source.manifest.source_binding.question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || source.manifest.source_binding.runtime_version !== PWQE51_RELEASE_IDENTITY.routerVersion
    || source.manifest.source_binding.source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    throw new Error("PWQE 5.1 flag derivation requires the pinned candidate source package.");
  }
  const authored = new Set<string>();
  const gates = source.itemGates.gates;
  for (const gate of Object.values(gates)) {
    const required = gate.required_flags;
    if (Array.isArray(required)) for (const flag of required) if (typeof flag === "string") authored.add(flag);
  }
  for (const rule of source.coverageRules.rules) {
    const required = rule.required_flags;
    if (Array.isArray(required)) for (const flag of required) if (typeof flag === "string") authored.add(flag);
  }
  for (const question of source.questionBank.items) {
    const specific = question.eligibility.specific;
    const required = specific?.required_flags;
    if (Array.isArray(required)) for (const flag of required) if (typeof flag === "string") authored.add(flag);
  }
  const unknown = [...authored].filter((flag) => !FLAG_NAMES.has(flag));
  if (unknown.length > 0) throw new Error(`PWQE 5.1 has unsupported required flags: ${unknown.sort().join(", " )}.`);
}

/** Derive the reference runtime's current flags from trusted canonical rows and the pinned source. */
export function derivePwqe51Flags(source: Pwqe51SourcePackage, input: Pwqe51FlagDerivationInput): Pwqe51DerivedFlags {
  requireKnownAuthoredFlags(source);
  const episodes = new Map(input.episodes.map((episode) => [episode.id, episode]));
  if (episodes.size !== input.episodes.length) throw new Error("PWQE 5.1 flag input contains duplicate episode IDs.");
  for (const episode of input.episodes) {
    if ((episode.distinctFrom ?? []).some((other) => !episodes.has(other) || other === episode.id)) {
      throw new Error(`PWQE 5.1 episode ${episode.id} has invalid distinctness lineage.`);
    }
  }
  const leavesByEpisode = new Map<string, LiveLeaf[]>();
  const responseIds = new Set<string>();
  const administrationIds = new Set<string>();
  for (const response of input.currentResponses) {
    if (responseIds.has(response.responseId) || administrationIds.has(response.administrationId)) {
      throw new Error("PWQE 5.1 flag input contains duplicate canonical response or administration identities.");
    }
    responseIds.add(response.responseId);
    administrationIds.add(response.administrationId);
    const episode = episodes.get(response.episodeId);
    if (!episode || !episodes.has(response.administrationEpisodeId)) {
      throw new Error(`PWQE 5.1 response ${response.responseId} has missing episode lineage.`);
    }
    if (response.status !== "answered") {
      if (response.selectedOptionIds.length > 0) throw new Error(`Missing PWQE 5.1 response ${response.responseId} cannot contain selected options.`);
      continue;
    }
    if (new Set(response.selectedOptionIds).size !== response.selectedOptionIds.length) {
      throw new Error(`PWQE 5.1 response ${response.responseId} contains duplicate selected option IDs.`);
    }
    const boundStep = response.episodeId === response.administrationEpisodeId ? response.stepId : "first";
    const authored = optionsForSource(source, response.itemId, response.variantId);
    const optionMap = new Map(authored.options.map((option) => [option.id, option]));
    if (response.selectedOptionIds.some((optionId) => !optionMap.has(optionId))) {
      throw new Error(`PWQE 5.1 response ${response.responseId} has an option outside its pinned item/variant.`);
    }
    const episodeLeaves = leavesByEpisode.get(response.episodeId) ?? [];
    for (const optionId of response.selectedOptionIds) {
      const option = optionMap.get(optionId)!;
      episodeLeaves.push({
        response: { ...response, stepId: boundStep },
        optionId,
        capture: authored.capture,
        candidateSignals: option.candidate_signals ?? [],
      });
    }
    leavesByEpisode.set(response.episodeId, episodeLeaves);
  }

  const flagsByEpisodeStep: Record<string, readonly string[]> = {};
  const factValues = new Map<string, boolean | null>();
  for (const fact of input.currentContextFacts ?? []) {
    if (!episodes.has(fact.episodeId)) throw new Error(`PWQE 5.1 context fact has unknown episode ${fact.episodeId}.`);
    if (!["bothersome_comment", "need_became_known", "noticed_feeling_without_acting"].includes(fact.fact)) {
      throw new Error(`PWQE 5.1 context fact ${String(fact.fact)} is unsupported.`);
    }
    factValues.set(`${fact.episodeId}/${fact.fact}`, fact.value);
  }
  for (const episode of input.episodes) {
    const episodeLeaves = leavesByEpisode.get(episode.id) ?? [];
    const allOptions = new Set(episodeLeaves.map((leaf) => leaf.optionId));
    const steps = new Set([...ROUTING_STEPS, ...episodeLeaves.map((leaf) => leaf.response.stepId)]);
    if (episode.status !== "actual" || episode.basis !== "actual") {
      for (const step of steps) flagsByEpisodeStep[pwqe51EpisodeStepKey(episode.id, step)] = [];
      continue;
    }
    const hasOption = (...ids: string[]) => ids.some((id) => allOptions.has(id));
    const actionAt = (stepId: string) => episodeLeaves.filter((leaf) => leaf.response.stepId === stepId
      && ACTION_CAPTURES.has(leaf.capture) && !NO_ACTION_OPTIONS.has(leaf.optionId));
    for (const stepId of steps) {
      const stepOptions = new Set(episodeLeaves.filter((leaf) => leaf.response.stepId === stepId).map((leaf) => leaf.optionId));
      const signals = new Set(episodeLeaves.filter((leaf) => leaf.response.stepId === stepId).flatMap((leaf) => leaf.candidateSignals));
      const flags = new Set<string>();
      if (actionAt("first").length > 0) flags.add("actual_first_move");
      if (actionAt(stepId).length > 0) flags.add("actual_selected_step");
      if (hasOption("D07.more", "D07.leave", "D07.absorb", "D07.help", "D07.quiet") && !allOptions.has("D08.different")) flags.add("actual_next_move");
      if (hasOption("M26.finish", "M26.contact", "M26.speak", "M26.help", "M26.rest") && !allOptions.has("M26.sequential")) flags.add("actual_simultaneous_wants");
      if (hasOption("D18.hurt", "D18.need", "D18.anger", "D18.uncertain", "D18.want", "D21.visible")
        && !hasOption("D18.none", "D21.none")) flags.add("reported_exposure_concern");
      if (hasOption("D24.stay", "D25.remember", "D65.patient", "D66.choice")
        || factValues.get(`${episode.id}/noticed_feeling_without_acting`) === true) flags.add("actual_feeling_episode");
      if (hasOption("M20.ask", "M20.small", "M20.justify")
        || factValues.get(`${episode.id}/need_became_known`) === true) flags.add("actual_need_disclosure");
      if ([...signals].some((signal) => LOW_RESPONSE_SIGNALS.has(signal))) flags.add("actual_low_response");
      if (hasOption(...RECOVERY_OPTIONS)) flags.add("actual_recovery_episode").add("actual_easing");
      if (hasOption("M22.ease") || (allOptions.has("M13.company") && hasOption(...LATER_EFFECT_OPTIONS))) flags.add("actual_helpful_social_effect");
      if (input.enabledTopics.includes("body_detail")) flags.add("body_detail_allowed");
      if (hasOption("M17.check", "M17.send", "M17.reread")) flags.add("actual_wait_response");
      if (episode.family === "autonomy" || hasOption(...[...stepOptions].filter((option) => ["D07.leave", "D61.leave", "D61.break", "M11.quiet", "M17.stop", "M24.space"].includes(option)))) {
        flags.add("actual_space_or_distance_episode");
      }
      if (hasOption(...episodeLeaves.filter((leaf) => leaf.response.itemId === "M24").map((leaf) => leaf.optionId))) flags.add("actual_received_repair");
      if (hasOption(...episodeLeaves.filter((leaf) => leaf.response.itemId === "D04").map((leaf) => leaf.optionId)) && !allOptions.has("D04.continued")) {
        flags.add("actual_response_stop");
      }
      if (factValues.get(`${episode.id}/bothersome_comment`) === true) flags.add("actual_bothersome_comment");
      flagsByEpisodeStep[pwqe51EpisodeStepKey(episode.id, stepId)] = [...flags].sort();
    }
  }

  const comparisonFlagsByPair: Record<string, readonly string[]> = {};
  for (const second of input.episodes) {
    if (second.status !== "actual" || second.basis !== "actual") continue;
    for (const firstId of second.distinctFrom ?? []) {
      const first = episodes.get(firstId);
      if (!first || first.status !== "actual" || first.basis !== "actual") continue;
      const firstLeaves = leavesByEpisode.get(first.id) ?? [];
      const secondLeaves = leavesByEpisode.get(second.id) ?? [];
      const firstActions = firstLeaves.filter((leaf) => leaf.response.stepId === "first" && ACTION_CAPTURES.has(leaf.capture) && !NO_ACTION_OPTIONS.has(leaf.optionId));
      const secondActions = secondLeaves.filter((leaf) => leaf.response.stepId === "first" && ACTION_CAPTURES.has(leaf.capture) && !NO_ACTION_OPTIONS.has(leaf.optionId));
      const firstOptions = new Set(firstActions.map((leaf) => leaf.optionId));
      const secondOptions = new Set(secondActions.map((leaf) => leaf.optionId));
      const flags = new Set<string>(["two_distinct_actual_episodes"]);
      if (matchedBehavior(firstOptions, secondOptions)) flags.add("matched_reported_behavior");
      if (firstLeaves.some((leaf) => ["meaning", "prediction"].includes(leaf.capture) && leaf.candidateSignals.length > 0)
        && flags.has("matched_reported_behavior")) flags.add("reported_candidate_trigger");
      comparisonFlagsByPair[pwqe51ComparisonPairKey(first.id, second.id)] = [...flags].sort();
    }
  }

  return {
    flagsByEpisodeStep: Object.freeze(flagsByEpisodeStep),
    comparisonFlagsByPair: Object.freeze(comparisonFlagsByPair),
  };
}
