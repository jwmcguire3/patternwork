import { randomUUID } from "node:crypto";
import type { Pwqe51Question, Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import {
  compilePwqe51Route,
  type Pwqe51CanonicalResponse,
  type Pwqe51RouterInput,
  type Pwqe51RouterResult,
} from "./pwqe51-router.ts";

export const PWQE51_SESSION_SCHEMA = "PWQE51-AS-1" as const;

export interface Pwqe51CurrentInteraction {
  readonly interactionInstanceId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId: string;
  readonly variantId?: string;
  readonly targetIds?: readonly string[];
  readonly replayOfOccurrenceId?: string;
  readonly comparisonIds?: readonly [string, string];
}

export interface Pwqe51ComparisonDecision {
  readonly firstOccurrenceId: string;
  readonly secondOccurrenceId: string;
  readonly relation: "different" | "same" | "cannot_tell";
}

export type Pwqe51ReplayBindingOutcome = "different" | "same" | "unknown" | "no_event" | "skip";

export interface Pwqe51ReplayBindingDecision {
  readonly decisionId: string;
  readonly requestSha256: string;
  readonly targetId: string;
  readonly bindingKey: string;
  readonly questionId: string;
  readonly sourceOccurrenceId: string;
  readonly outcome: Pwqe51ReplayBindingOutcome;
  readonly replayOccurrenceId?: string;
  readonly supersedesDecisionId?: string;
}

export interface Pwqe51SessionState {
  readonly schemaVersion: typeof PWQE51_SESSION_SCHEMA;
  readonly sourceRelease: string;
  readonly pass: 1 | 2;
  readonly phase: "mapping" | "deepening" | "finished";
  readonly paused: boolean;
  readonly correctionTargetResponseId?: string;
  readonly responses: readonly Pwqe51CanonicalResponse[];
  readonly occurrenceBindings: Readonly<Record<string, string>>;
  readonly optedInTopics: readonly string[];
  /** Encrypted, user-confirmed role snapshots keyed by occurrence and authored slot. */
  readonly referentRolesByOccurrenceSlot: Readonly<Record<string, string>>;
  /** Explicit C07 relation for a pair of actual recalled occasions; never inferred from generated IDs. */
  readonly comparisonDecisions?: readonly Pwqe51ComparisonDecision[];
  /** Encrypted, append-only, correction-safe outcomes for server-issued replay requests. */
  readonly replayBindingHistory?: readonly Pwqe51ReplayBindingDecision[];
  readonly controls: readonly ("end" | "shorten")[];
  /**
   * Server-owned routing context. In particular, distinctPairs and comparison
   * mappings must only be written after an explicit respondent confirmation;
   * this adapter never infers them from its generated occurrence IDs.
   */
  readonly routerInput: Omit<Pwqe51RouterInput, "responses" | "phase" | "controls" | "occurrenceBindings" | "optedInTopics">;
  readonly routerResult: Pwqe51RouterResult;
  readonly currentInteraction: Pwqe51CurrentInteraction | null;
}

export interface Pwqe51RenderedInteraction {
  readonly interactionInstanceId: string;
  readonly questionId: string;
  readonly bankItemId: string;
  readonly bankItemVersion: string;
  readonly family: "PWQE51";
  readonly stage: "mapping" | "deepening";
  readonly pass: 1 | 2;
  readonly administrationSequence: number;
  readonly title: string;
  readonly prompt: string;
  readonly referentSlotRequired?: boolean;
  readonly referentRoleOptions?: readonly { readonly id: string; readonly label: string }[];
  readonly referentSlotPrompt?: string;
  readonly unavailableBinding?: boolean;
  readonly context: string;
  readonly episodeFamily: string;
  readonly stepId: string;
  readonly rootBasisRequired: boolean;
  readonly basisOptions: readonly ("actual_recalled" | "reported_typicality")[];
  readonly selection: Readonly<Record<string, unknown>>;
  readonly responseControls: readonly { readonly id: string; readonly text: string }[];
  readonly options: readonly { readonly id: string; readonly label: string; readonly exclusive: boolean }[];
}

function routeInput(state: Pick<Pwqe51SessionState, "pass" | "responses" | "phase" | "controls" | "optedInTopics" | "occurrenceBindings" | "routerInput"> & Partial<Pick<Pwqe51SessionState, "replayBindingHistory">>): Pwqe51RouterInput {
  const history = state.replayBindingHistory ?? [];
  const supersededDecisions = new Set(history.flatMap((decision) => decision.supersedesDecisionId ? [decision.supersedesDecisionId] : []));
  const activeDecisions = history.filter((decision) => !supersededDecisions.has(decision.decisionId));
  const allReplayOccurrences = new Set(history.flatMap((decision) => decision.replayOccurrenceId ? [decision.replayOccurrenceId] : []));
  const activeByTarget = new Map(activeDecisions.map((decision) => [decision.targetId, decision]));
  const occurrenceBindings = { ...state.occurrenceBindings };
  const closedBindings = { ...(state.routerInput.closedBindings ?? {}) };
  for (const decision of history) {
    const active = activeByTarget.get(decision.targetId);
    if (!active || active.outcome === "different") {
      delete closedBindings[decision.targetId];
    } else {
      closedBindings[decision.targetId] = active.outcome;
    }
    if (active?.outcome === "different" && active.replayOccurrenceId) occurrenceBindings[active.bindingKey] = active.replayOccurrenceId;
    else delete occurrenceBindings[decision.bindingKey];
  }
  const supersededResponses = new Set(state.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
  const replayPairs = activeDecisions.flatMap((decision) => {
    if (decision.outcome !== "different" || !decision.replayOccurrenceId) return [];
    const actualRoot = state.responses.some((response) => response.occurrenceId === decision.replayOccurrenceId
      && response.replayOfOccurrenceId === decision.sourceOccurrenceId && response.status === "answered"
      && response.basis === "actual_recalled" && !supersededResponses.has(response.responseId));
    return actualRoot ? [[decision.sourceOccurrenceId, decision.replayOccurrenceId] as const] : [];
  });
  const basePairs = (state.routerInput.distinctPairs ?? []).filter((pair) => !pair.some((occurrenceId) => allReplayOccurrences.has(occurrenceId)));
  const distinctPairs = [...new Map([...basePairs, ...replayPairs].map((pair) => {
    const identity = [...pair].sort().join("\u0000");
    return [identity, pair] as const;
  })).values()];
  const episodeLinks = [
    ...(state.routerInput.episodeLinks ?? []).filter((link) => !allReplayOccurrences.has(link.occurrenceId)),
    ...activeDecisions.flatMap((decision) => decision.outcome === "different" && decision.replayOccurrenceId
      ? [{ occurrenceId: decision.replayOccurrenceId, linkedFrom: decision.sourceOccurrenceId }]
      : []),
  ];
  const comparisonIdsByResponseId = Object.fromEntries(Object.entries(state.routerInput.comparisonIdsByResponseId ?? {})
    .filter(([, pair]) => distinctPairs.some((candidate) => candidate.length === 2 && candidate.includes(pair[0]) && candidate.includes(pair[1]))));
  return {
    ...state.routerInput,
    occurrenceBindings,
    closedBindings,
    distinctPairs,
    episodeLinks,
    comparisonIdsByResponseId,
    responses: state.responses,
    phase: state.phase === "finished" ? (state.pass === 1 ? "mapping" : "deepening") : state.phase,
    controls: state.controls,
    optedInTopics: state.optedInTopics,
  };
}

/** Replays canonical history and resolves only router-issued binding keys on the server. */
function compileBoundRoute(input: Pwqe51RouterInput, source: Pwqe51SourcePackage): {
  readonly result: Pwqe51RouterResult;
  readonly occurrenceBindings: Readonly<Record<string, string>>;
  readonly episodeLinks: NonNullable<Pwqe51RouterInput["episodeLinks"]>;
} {
  let occurrenceBindings = { ...(input.occurrenceBindings ?? {}) };
  let episodeLinks = [...(input.episodeLinks ?? [])];
  let result = compilePwqe51Route({ ...input, occurrenceBindings, episodeLinks }, source);
  // The reference router may offer several distinct, eligible roots before
  // settling on a bound current interaction. Cap at the finite authored target
  // population and still reject any repeated binding key immediately.
  const bindingLimit = source.routingTargets.targets.length + source.routingTargets.entry_points.length + source.coverageRules.rules.length + 1;
  for (let count = 0; count < bindingLimit; count += 1) {
    const candidate = result.next;
    if (!candidate?.bindingRequest) return { result, occurrenceBindings, episodeLinks };
    if (candidate.bindingRequest === "confirm_replay_distinctness") return { result, occurrenceBindings, episodeLinks };
    if (candidate.bindingRequest !== "new_actual_occurrence" || !candidate.bindingKey) {
      throw new Error("PWQE 5.1 router requested an invalid occurrence binding.");
    }
    if (occurrenceBindings[candidate.bindingKey]) {
      throw new Error("PWQE 5.1 router returned an already-bound occurrence request.");
    }
    const occurrenceId = `pwep_${randomUUID()}`;
    occurrenceBindings = { ...occurrenceBindings, [candidate.bindingKey]: occurrenceId };
    if (candidate.linkedFrom) episodeLinks = [...episodeLinks.filter((link) => link.occurrenceId !== occurrenceId), { occurrenceId, linkedFrom: candidate.linkedFrom }];
    result = compilePwqe51Route({ ...input, occurrenceBindings, episodeLinks }, source);
  }
  throw new Error("PWQE 5.1 router exceeded the authored occurrence-binding limit.");
}

function currentFor(route: Pwqe51RouterResult, prior: Pwqe51CurrentInteraction | null): Pwqe51CurrentInteraction | null {
  const candidate = route.next;
  if (!candidate) return null;
  if (candidate.bindingRequest === "confirm_replay_distinctness") return null;
  if (!candidate.occurrenceId || candidate.bindingRequest) {
    throw new Error("PWQE 5.1 candidate was not bound to a server-owned occurrence.");
  }
  const targetIds = candidate.targetIds ?? [];
  if (prior && prior.questionId === candidate.questionId && prior.occurrenceId === candidate.occurrenceId && prior.stepId === candidate.stepId
    && prior.replayOfOccurrenceId === candidate.replayOfOccurrenceId && prior.variantId === candidate.variantId
    && canonicalizeTargetIds(prior.comparisonIds ?? []) === canonicalizeTargetIds(candidate.comparisonIds ?? [])
    && canonicalizeTargetIds(prior.targetIds ?? []) === canonicalizeTargetIds(targetIds)) return prior;
  return {
    interactionInstanceId: `pwi_${randomUUID()}`,
    questionId: candidate.questionId,
    occurrenceId: candidate.occurrenceId,
    stepId: candidate.stepId,
    ...(candidate.replayOfOccurrenceId ? { replayOfOccurrenceId: candidate.replayOfOccurrenceId } : {}),
    ...(candidate.comparisonIds ? { comparisonIds: candidate.comparisonIds } : {}),
    ...(candidate.variantId ? { variantId: candidate.variantId } : {}),
    ...(targetIds.length ? { targetIds } : {}),
  };
}

function canonicalizeTargetIds(values: readonly string[]): string { return [...values].sort().join("\u0000"); }

function questionFor(source: Pwqe51SourcePackage, questionId: string): Pwqe51Question {
  const question = source.questionBank.items.find((item) => item.id === questionId);
  if (!question) throw new Error(`PWQE 5.1 question ${questionId} is not in the pinned source.`);
  return question;
}

const PERSON_SLOTS = new Set(["evaluator", "boundary_person", "close_person", "support_person", "repair_person", "conflict_person", "family_person"]);
const DETAIL_PERMISSIONS = new Set(["state", "body", "urge", "feeling", "texture", "recurrence", "contrast"]);
const ROLE_LABELS: Readonly<Record<string, string>> = {
  partner: "My partner", former_partner: "A former partner", friend: "A friend", family_member: "A family member",
  colleague: "A colleague", supervisor: "A supervisor", client: "A client", teacher: "A teacher",
  reviewer: "Another person who reviewed my work", other_person: "Someone else",
  no_other_person: "No other person / no applicable situation",
};
const ROLE_PHRASES: Readonly<Record<string, string>> = {
  partner: "your partner", former_partner: "your former partner", friend: "your friend", family_member: "your family member",
  colleague: "your colleague", supervisor: "your supervisor", client: "your client", teacher: "your teacher",
  reviewer: "the person reviewing your work", other_person: "the person you selected",
};
const SLOT_QUESTION: Readonly<Record<string, string>> = {
  evaluator: "Who actually reviewed something you had done in this situation?",
  boundary_person: "Who asked you for something in this situation?",
  close_person: "Who was the person whose contact mattered in this situation?",
  support_person: "Who was involved in the help or support in this situation?",
  repair_person: "Who was involved in the attempt to put something right?",
  conflict_person: "Who was the other person in the disagreement?",
  family_person: "Which family member was involved in this situation?",
};
const FAMILY_LABELS: Readonly<Record<string, string>> = {
  ordinary: "ordinary moment", evaluation: "review of your work", mistake: "mistake", praise: "moment of appreciation",
  boundary: "request when you were stretched", overload: "demanding day", practical_wait: "wait for practical information",
  reply_wait: "wait for a message", help_request: "help request", receiving_help: "time you received help",
  repair_offered: "attempt to put something right", repair_received: "repair attempt from the other person",
  rest: "evening you meant to stop", two_pulls: "moment of competing wants", exception: "easier occasion",
  conflict: "disagreement", autonomy: "request for your own time", disclosure: "personal conversation", loss: "reminder of loss",
  money: "expense", known_delay: "wait when you knew the reason", reassurance: "reassurance conversation",
  family_contact: "family contact", new_closeness: "new connection", help_missed: "attempted help that missed",
  ordinary_second: "other ordinary moment", disappointment: "disappointment", self_expression: "held-back reaction or wish",
  exploration: "trying something unfamiliar", comparison: "situation",
};
const FAMILY_PLURALS: Readonly<Record<string, string>> = {
  ordinary: "ordinary situations", evaluation: "reviews of your work", mistake: "mistakes", praise: "moments of appreciation",
  boundary: "requests when you were stretched", overload: "demanding days", practical_wait: "waits for practical information",
  reply_wait: "waits for a message", help_request: "help requests", receiving_help: "times you received help",
  repair_offered: "attempts to put something right", repair_received: "repair attempts from another person",
  rest: "evenings you meant to stop", two_pulls: "moments of competing wants", exception: "easier occasions",
  conflict: "disagreements", autonomy: "requests for your own time", disclosure: "personal conversations", loss: "reminders of loss",
  money: "expenses", known_delay: "waits when you knew the reason", reassurance: "reassurance conversations",
  family_contact: "family contacts", new_closeness: "new connections", help_missed: "attempts at help that missed",
  ordinary_second: "other ordinary moments", disappointment: "disappointments", self_expression: "held-back reactions or wishes",
  exploration: "times you tried something unfamiliar",
};
const NOMINAL_RESPONSE: Readonly<Record<string, string>> = {
  "M17.check": "checking again", "M17.send": "sending another message", "M17.reread": "rereading the conversation",
  "M04.explain": "explaining your point", "M08.small": "making the request smaller", "M15.pause": "pausing the exchange",
  "M11.quiet": "going somewhere quieter", "M25.stop": "stopping the exchange",
};
const WANT_PAIRS: Readonly<Record<string, readonly [string, string]>> = {
  "M26.finish": ["to get it right", "to be done"], "M26.contact": ["contact", "space"],
  "M26.speak": ["to speak plainly", "to keep the peace"], "M26.help": ["help", "to manage alone"],
  "M26.rest": ["rest", "to keep working"],
};

function roleKey(occurrenceId: string, slot: string): string { return `${occurrenceId}\u0000${slot}`; }
function promptSlots(prompt: string): string[] { return [...new Set([...prompt.matchAll(/\{([a-z_]+)\}/gu)].map((match) => match[1]))]; }
function roleOptions(slot: string): readonly { readonly id: string; readonly label: string }[] {
  const ids = slot === "evaluator"
    ? ["colleague", "supervisor", "client", "teacher", "reviewer", "other_person", "no_other_person"]
    : ["partner", "former_partner", "friend", "family_member", "colleague", "supervisor", "client", "teacher", "reviewer", "other_person", "no_other_person"];
  return ids.map((id) => ({ id, label: ROLE_LABELS[id]! }));
}

function publicEpisodeLabel(state: Pwqe51SessionState, occurrenceId: string, fallbackFamily: string): string {
  const episode = state.routerResult.episodes.find((candidate) => candidate.id === occurrenceId);
  const family = episode?.family ?? fallbackFamily;
  const label = FAMILY_LABELS[family] ?? "selected moment";
  const sameFamily = [...new Set(state.routerResult.episodes.filter((candidate) => candidate.family === family).map((candidate) => candidate.id))];
  const position = sameFamily.indexOf(occurrenceId);
  return `${label} ${position >= 0 ? position + 1 : sameFamily.length + 1}`;
}

/** Server-side chooser data; callers must replace occurrence IDs with opaque request references. */
export function pwqe51FocusChoices(state: Pwqe51SessionState): readonly { readonly occurrenceId: string; readonly label: string }[] {
  return state.routerResult.episodes
    .filter((episode) => episode.actual && episode.basis === "actual_recalled")
    .map((episode) => ({ occurrenceId: episode.id, label: publicEpisodeLabel(state, episode.id, episode.family) }));
}

function authoredOptionText(source: Pwqe51SourcePackage, questionId: string, optionId: string): string | undefined {
  const question = source.questionBank.items.find((item) => item.id === questionId);
  const variant = source.questionBank.variants.find((item) => item.replaces === questionId && item.options.some((option) => option.id === optionId));
  return (variant?.options ?? question?.options ?? []).find((option) => option.id === optionId)?.text;
}

function observationPhrase(source: Pwqe51SourcePackage, observations: readonly Pwqe51RouterResult["observations"][number][]): string | undefined {
  const parts = observations.map((observation) => NOMINAL_RESPONSE[observation.optionId] ?? authoredOptionText(source, observation.itemId, observation.optionId))
    .filter((value): value is string => Boolean(value));
  return parts.length ? `the response you selected (“${parts.join(" / ")}”)` : undefined;
}

function renderPrompt(state: Pwqe51SessionState, source: Pwqe51SourcePackage, question: Pwqe51Question, prompt: string, current: Pwqe51CurrentInteraction) {
  const required = promptSlots(prompt);
  const values: Record<string, string> = {
    episode_label: publicEpisodeLabel(state, current.occurrenceId, question.episode_family),
    context_label: FAMILY_PLURALS[question.episode_family] ?? "situations like this",
  };
  const observations = state.routerResult.observations.filter((observation) => observation.occurrenceId === current.occurrenceId);
  const actionCaptures = new Set(["first_action", "next_action", "later_action", "during_action", "self_response"]);
  const actions = observations.filter((observation) => typeof observation.capture === "string" && actionCaptures.has(observation.capture));
  const byCurrentStep = actions.filter((observation) => observation.stepId === current.stepId);
  const selected = byCurrentStep.length ? byCurrentStep : actions;
  const responseLabel = observationPhrase(source, selected);
  if (responseLabel) values.response_label = responseLabel;
  const first = actions.filter((observation) => observation.stepId === "first");
  const next = actions.filter((observation) => observation.stepId === "next");
  const firstLabel = observationPhrase(source, first);
  const nextLabel = observationPhrase(source, next);
  if (firstLabel) values.first_response_label = firstLabel;
  if (nextLabel) values.next_response_label = nextLabel;
  const contact = observations.filter((observation) => observation.itemId === "M17");
  const contactLabel = observationPhrase(source, contact);
  if (contactLabel) values.contact_response_label = contactLabel;
  const wants = observations.filter((observation) => observation.itemId === "M26");
  if (wants.length === 1) {
    const pair = WANT_PAIRS[wants[0]!.optionId];
    if (pair) [values.first_want, values.second_want] = pair;
  }
  const exposed = observations.filter((observation) => ["D18", "D21"].includes(observation.itemId)
    && !["D18.none", "D21.none", "D21.practical"].includes(observation.optionId));
  if (exposed.length) values.exposed_experience = `that experience (“${exposed.map((observation) => observation.text).join(" / ")}”)`;

  const focusIds = new Set(state.routerInput.focusOccurrences ?? []);
  const comparable = state.routerResult.episodes.filter((episode) => episode.actual
    && (state.routerResult.observations.some((observation) => observation.occurrenceId === episode.id && actionCaptures.has(observation.capture ?? ""))));
  const focusedSource = comparable.find((episode) => focusIds.has(episode.id)) ?? (comparable.length === 1 ? comparable[0] : undefined);
  if (focusedSource) values.focus_situation = `the ${FAMILY_LABELS[focusedSource.family] ?? "situation"} you chose`;

  const matchedTarget = state.routerResult.targets.find((target) => current.targetIds?.includes(target.id) && target.comparisonIds?.length === 2);
  const comparisonIds = matchedTarget?.comparisonIds;
  if (comparisonIds?.length === 2) {
    values.episode_a_label = publicEpisodeLabel(state, comparisonIds[0], "comparison");
    values.episode_b_label = publicEpisodeLabel(state, comparisonIds[1], "comparison");
    const firstEpisodeActions = state.routerResult.observations.filter((observation) => observation.occurrenceId === comparisonIds[0] && actionCaptures.has(observation.capture ?? ""));
    const secondEpisodeActions = state.routerResult.observations.filter((observation) => observation.occurrenceId === comparisonIds[1] && actionCaptures.has(observation.capture ?? ""));
    const matchedIds = new Set(firstEpisodeActions.map((observation) => observation.optionId));
    const matchedAction = secondEpisodeActions.find((observation) => matchedIds.has(observation.optionId));
    const matchedPhrase = matchedAction ? observationPhrase(source, [matchedAction]) : undefined;
    if (matchedPhrase) values.comparison_response_label = matchedPhrase;
    const candidateTrigger = state.routerResult.observations.find((observation) => comparisonIds.includes(observation.occurrenceId)
      && observation.candidateSignals.length > 0 && !actionCaptures.has(observation.capture ?? ""));
    if (candidateTrigger) values.candidate_trigger_label = `the concern you reported (“${candidateTrigger.text}”)`;
  }

  const missingPersonSlot = required.find((slot) => PERSON_SLOTS.has(slot) && !state.referentRolesByOccurrenceSlot[roleKey(current.occurrenceId, slot)]);
  if (missingPersonSlot) return {
    prompt: "",
    contextLabel: FAMILY_PLURALS[question.episode_family] ?? "this situation",
    referentSlotRequired: true as const,
    referentRoleOptions: roleOptions(missingPersonSlot),
    referentSlotPrompt: SLOT_QUESTION[missingPersonSlot] ?? "Who was involved in this situation?",
    unavailableBinding: false as const,
  };
  for (const slot of required.filter((candidate) => PERSON_SLOTS.has(candidate))) {
    const role = state.referentRolesByOccurrenceSlot[roleKey(current.occurrenceId, slot)];
    if (role === "no_other_person") return {
      prompt: "This question does not apply because no other person was involved. You can mark it not applicable or skip it.",
      contextLabel: FAMILY_PLURALS[question.episode_family] ?? "this situation", unavailableBinding: true as const,
    };
    const phrase = role ? ROLE_PHRASES[role] : undefined;
    if (phrase) values[slot] = phrase;
  }
  const missing = required.filter((slot) => !values[slot]);
  if (missing.length) return {
    prompt: "This follow-up depends on details that are not available from the answers so far. You can skip it and continue.",
    contextLabel: FAMILY_PLURALS[question.episode_family] ?? "this situation", unavailableBinding: true as const,
  };
  const rendered = prompt.replace(/\{([a-z_]+)\}/gu, (_match, slot: string) => values[slot]!);
  if (/\{[^{}]+\}/u.test(rendered)) return {
    prompt: "This follow-up cannot be shown with the available details. You can skip it and continue.",
    contextLabel: FAMILY_PLURALS[question.episode_family] ?? "this situation", unavailableBinding: true as const,
  };
  return { prompt: rendered, contextLabel: FAMILY_PLURALS[question.episode_family] ?? "situations like this", unavailableBinding: false as const };
}

function assertPinnedSource(state: Pwqe51SessionState, source: Pwqe51SourcePackage): void {
  if (state.sourceRelease !== source.questionBank.release) throw new Error("PWQE 5.1 session source release does not match the pinned source.");
}

function originalResponse(state: Pwqe51SessionState, id: string | undefined): Pwqe51CanonicalResponse | undefined {
  return id ? state.responses.find((response) => response.responseId === id) : undefined;
}

function rootBasisFor(state: Pwqe51SessionState, current: Pwqe51CurrentInteraction, correction: Pwqe51CanonicalResponse | undefined): "actual_recalled" | "reported_typicality" | undefined {
  if (correction?.basis === "actual_recalled" || correction?.basis === "reported_typicality") return correction.basis;
  if (state.responses.some((response) => response.occurrenceId === current.occurrenceId)) return undefined;
  return undefined;
}

export function createPwqe51SessionState(
  source: Pwqe51SourcePackage,
  routerInput: Pwqe51SessionState["routerInput"] = {},
  options: { readonly initialOptedInTopics?: readonly string[] } = {},
): Pwqe51SessionState {
  const initialOptedInTopics = [...new Set(options.initialOptedInTopics ?? [])];
  const availableTopics = new Set(source.routingTargets.entry_points.map((entry) => entry.id));
  if (initialOptedInTopics.some((topic) => !availableTopics.has(topic))) {
    throw new Error("PWQE 5.1 initial topic opt-in must name an authored entry topic.");
  }
  const partial = {
    schemaVersion: PWQE51_SESSION_SCHEMA,
    sourceRelease: source.questionBank.release,
    pass: 1 as const,
    phase: "mapping" as const,
    paused: false,
    responses: [] as Pwqe51CanonicalResponse[],
    occurrenceBindings: {} as Readonly<Record<string, string>>,
    referentRolesByOccurrenceSlot: {} as Readonly<Record<string, string>>,
    replayBindingHistory: [] as Pwqe51ReplayBindingDecision[],
    optedInTopics: initialOptedInTopics,
    controls: [] as ("end" | "shorten")[],
    routerInput,
  };
  const compiled = compileBoundRoute({ ...routerInput, responses: [], phase: "mapping", occurrenceBindings: {}, optedInTopics: initialOptedInTopics }, source);
  return { ...partial, routerInput: { ...routerInput, episodeLinks: compiled.episodeLinks }, occurrenceBindings: compiled.occurrenceBindings, routerResult: compiled.result, currentInteraction: currentFor(compiled.result, null) };
}

export function applyPwqe51ReplayBinding(
  state: Pwqe51SessionState,
  input: {
    readonly decisionId: string;
    readonly requestSha256: string;
    readonly outcome: Pwqe51ReplayBindingOutcome;
    readonly correctsDecisionId?: string;
  },
  source: Pwqe51SourcePackage,
): Pwqe51SessionState {
  if (state.paused || state.phase === "finished") throw new Error("PWQE 5.1 replay binding is not accepting a decision.");
  assertPinnedSource(state, source);
  if (!/^pwrb_[a-f0-9]{40}$/u.test(input.decisionId) || !/^[a-f0-9]{64}$/u.test(input.requestSha256)
    || !["different", "same", "unknown", "no_event", "skip"].includes(input.outcome)) {
    throw new Error("PWQE 5.1 replay binding decision is malformed.");
  }
  if (state.replayBindingHistory?.some((decision) => decision.decisionId === input.decisionId)) {
    throw new Error("PWQE 5.1 replay binding decision already exists.");
  }
  const priorSuperseded = new Set((state.replayBindingHistory ?? []).flatMap((decision) => decision.supersedesDecisionId ? [decision.supersedesDecisionId] : []));
  let request: { targetId: string; bindingKey: string; questionId: string; sourceOccurrenceId: string; replayOccurrenceId?: string };
  if (input.correctsDecisionId) {
    const prior = state.replayBindingHistory?.find((decision) => decision.decisionId === input.correctsDecisionId && !priorSuperseded.has(decision.decisionId));
    if (!prior) throw new Error("PWQE 5.1 replay binding correction target is not active.");
    request = prior;
  } else {
    const candidate = state.routerResult.next;
    if (!candidate || candidate.bindingRequest !== "confirm_replay_distinctness" || !candidate.bindingKey || !candidate.replayOfOccurrenceId) {
      throw new Error("PWQE 5.1 has no current server-issued replay binding request.");
    }
    request = {
      targetId: candidate.targetIds[0]!,
      bindingKey: candidate.bindingKey,
      questionId: candidate.questionId,
      sourceOccurrenceId: candidate.replayOfOccurrenceId,
    };
  }
  const previousReplayOccurrenceId = request.replayOccurrenceId
    ?? [...(state.replayBindingHistory ?? [])].reverse().find((decision) => decision.bindingKey === request.bindingKey && decision.replayOccurrenceId)?.replayOccurrenceId;
  const replayOccurrenceId = input.outcome === "different" ? previousReplayOccurrenceId ?? `pwep_${randomUUID()}` : undefined;
  const decision: Pwqe51ReplayBindingDecision = {
    decisionId: input.decisionId,
    requestSha256: input.requestSha256,
    targetId: request.targetId,
    bindingKey: request.bindingKey,
    questionId: request.questionId,
    sourceOccurrenceId: request.sourceOccurrenceId,
    outcome: input.outcome,
    ...(replayOccurrenceId ? { replayOccurrenceId } : {}),
    ...(input.correctsDecisionId ? { supersedesDecisionId: input.correctsDecisionId } : {}),
  };
  const replayBindingHistory = [...(state.replayBindingHistory ?? []), decision];
  const partial = { ...state, replayBindingHistory };
  const compiled = compileBoundRoute(routeInput(partial), source);
  return {
    ...partial,
    routerInput: { ...partial.routerInput, episodeLinks: compiled.episodeLinks },
    occurrenceBindings: compiled.occurrenceBindings,
    routerResult: compiled.result,
    phase: compiled.result.phase,
    currentInteraction: currentFor(compiled.result, null),
  };
}

export function isPwqe51SessionState(value: unknown): value is Pwqe51SessionState {
  return typeof value === "object" && value !== null && (value as { schemaVersion?: unknown }).schemaVersion === PWQE51_SESSION_SCHEMA;
}

export function getPwqe51Question(source: Pwqe51SourcePackage, questionId: string): Pwqe51Question {
  return questionFor(source, questionId);
}

export function renderPwqe51Interaction(state: Pwqe51SessionState, source: Pwqe51SourcePackage): Pwqe51RenderedInteraction | null {
  assertPinnedSource(state, source);
  const current = state.currentInteraction;
  if (!current) return null;
  const question = questionFor(source, current.questionId);
  const variant = current.variantId ? source.questionBank.variants.find((candidate) => candidate.id === current.variantId) : undefined;
  const options = variant?.replaces === question.id ? variant.options : question.options;
  const template = variant?.replaces === question.id && variant.prompt ? variant.prompt : question.prompt;
  const rendered = renderPrompt(state, source, question, template, current);
  const selection = question.selection;
  const rootBasisRequired = !state.responses.some((response) => response.occurrenceId === current.occurrenceId);
  const controls = new Map(source.questionBank.common_response_controls.map((control) => [control.id, control.text]));
  return {
    interactionInstanceId: current.interactionInstanceId,
    questionId: current.questionId,
    bankItemId: question.id,
    bankItemVersion: question.version,
    family: "PWQE51",
    stage: question.stage,
    pass: state.pass,
    administrationSequence: state.responses.length + 1,
    title: question.title,
    prompt: rendered.prompt,
    ...(rendered.referentSlotRequired ? {
      referentSlotRequired: true,
      referentRoleOptions: rendered.referentRoleOptions,
      referentSlotPrompt: rendered.referentSlotPrompt,
    } : {}),
    ...(rendered.unavailableBinding ? { unavailableBinding: true } : {}),
    context: rendered.contextLabel,
    episodeFamily: question.episode_family,
    stepId: current.stepId,
    rootBasisRequired,
    basisOptions: rootBasisRequired ? ["actual_recalled", "reported_typicality"] : [],
    selection,
    responseControls: question.response_controls.map((id) => ({ id, text: controls.get(id) ?? id })),
    options: options.map((option) => ({ id: option.id, label: option.text, exclusive: option.exclusive === true })),
  };
}

export function advancePwqe51Session(
  state: Pwqe51SessionState,
  input: {
    readonly completionState: "COMPLETED" | "SKIPPED";
    readonly responseId: string;
    readonly selectedOptionIds: readonly string[];
    readonly status?: Pwqe51CanonicalResponse["status"];
    readonly mode?: Pwqe51CanonicalResponse["mode"];
    readonly basis?: "actual_recalled" | "reported_typicality";
    readonly referentRole?: string;
    readonly supersedesResponseId?: string;
  },
  source: Pwqe51SourcePackage,
): Pwqe51SessionState {
  if (state.paused || state.phase === "finished" || !state.currentInteraction) throw new Error("PWQE 5.1 session is not accepting an answer.");
  assertPinnedSource(state, source);
  const current = state.currentInteraction;
  const question = questionFor(source, current.questionId);
  const status = input.completionState === "SKIPPED" ? "skip" : input.status ?? "answered";
  const selectedOptionIds = status === "answered" ? [...input.selectedOptionIds] : [];
  const mode = status === "answered" ? input.mode ?? "single" : "single";
  const activeVariant = current.variantId ? source.questionBank.variants.find((variant) => variant.id === current.variantId && variant.replaces === question.id) : undefined;
  const activePrompt = activeVariant?.prompt ?? question.prompt;
  const requiredPersonSlots = promptSlots(activePrompt).filter((slot) => PERSON_SLOTS.has(slot));
  if (input.referentRole !== undefined && requiredPersonSlots.length !== 1) {
    throw new Error("PWQE 5.1 referent role does not match an authored person slot.");
  }
  if (requiredPersonSlots.length === 1 && status === "answered" && !input.referentRole
    && !state.referentRolesByOccurrenceSlot[roleKey(current.occurrenceId, requiredPersonSlots[0]!)]) {
    throw new Error("PWQE 5.1 requires a confirmed role for this situation before an answer.");
  }
  if (input.referentRole !== undefined && !roleOptions(requiredPersonSlots[0]!).some((option) => option.id === input.referentRole)) {
    throw new Error("PWQE 5.1 referent role is not allowed for this authored person slot.");
  }
  if (input.referentRole === "no_other_person" && status === "answered") {
    throw new Error("A no-other-person choice must be recorded as not applicable or skipped.");
  }
  if (input.referentRole === "no_other_person" && status !== "not_applicable" && status !== "skip") {
    throw new Error("A no-other-person choice must be recorded as not applicable or skipped.");
  }
  if (status !== "answered" && input.basis) throw new Error("Missingness cannot include an episode basis.");
  if (status === "answered") {
    const maxSelect = typeof question.selection.max_select === "number" ? question.selection.max_select : 1;
    const partialOrder = question.selection.mode === "partial_order";
    if (!partialOrder && (question.selection.mode === "single" || maxSelect <= 1) && (mode !== "single" || selectedOptionIds.length !== 1)) {
      throw new Error(`PWQE 5.1 ${question.id} is authored for a single choice.`);
    }
    if (selectedOptionIds.length > maxSelect) throw new Error(`PWQE 5.1 ${question.id} exceeds its authored max_select.`);
    if (partialOrder && selectedOptionIds.length > 1 && !question.selection.allow_simultaneous_pair && mode !== "ordered") {
      throw new Error(`PWQE 5.1 ${question.id} does not allow an unordered pair.`);
    }
  }
  const correctionId = input.supersedesResponseId ?? state.correctionTargetResponseId;
  const correction = originalResponse(state, correctionId);
  const basis = status === "answered" ? input.basis ?? rootBasisFor(state, current, correction) : undefined;
  const response: Pwqe51CanonicalResponse = {
    responseId: input.responseId,
    questionId: current.questionId,
    occurrenceId: current.occurrenceId,
    stepId: current.stepId,
    selectedOptionIds,
    status,
    mode,
    ...(basis ? { basis } : {}),
    ...(current.targetIds ? { targetIds: current.targetIds } : {}),
    ...(current.replayOfOccurrenceId ? { replayOfOccurrenceId: current.replayOfOccurrenceId } : {}),
    ...(current.variantId ? { variantId: current.variantId } : {}),
    ...(correctionId ? { supersedesResponseId: correctionId } : {}),
  };
  const responses = [...state.responses, response];
  const referentRolesByOccurrenceSlot = input.referentRole
    ? { ...state.referentRolesByOccurrenceSlot, [roleKey(current.occurrenceId, requiredPersonSlots[0]!)]: input.referentRole }
    : state.referentRolesByOccurrenceSlot;
  const comparisonIdsByResponseId = current.comparisonIds
    ? { ...(state.routerInput.comparisonIdsByResponseId ?? {}), [response.responseId]: [...current.comparisonIds] as [string, string] }
    : state.routerInput.comparisonIdsByResponseId;
  const partial = {
    ...state,
    responses,
    referentRolesByOccurrenceSlot,
    routerInput: { ...state.routerInput, ...(comparisonIdsByResponseId ? { comparisonIdsByResponseId } : {}) },
  };
  const compiled = compileBoundRoute(routeInput(partial), source);
  return {
    ...partial,
    routerInput: { ...partial.routerInput, episodeLinks: compiled.episodeLinks },
    occurrenceBindings: compiled.occurrenceBindings,
    routerResult: compiled.result,
    phase: compiled.result.phase,
    currentInteraction: currentFor(compiled.result, null),
    correctionTargetResponseId: undefined,
  };
}

export function beginPwqe51Correction(state: Pwqe51SessionState, responseId: string, source: Pwqe51SourcePackage): Pwqe51SessionState {
  if (state.paused || state.phase === "finished") throw new Error("PWQE 5.1 session is not accepting a correction.");
  assertPinnedSource(state, source);
  const superseded = new Set(state.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
  const target = state.responses.find((response) => response.responseId === responseId && !superseded.has(response.responseId));
  if (!target) throw new Error("PWQE 5.1 correction target is not an active response.");
  questionFor(source, target.questionId);
  return {
    ...state,
    correctionTargetResponseId: target.responseId,
    currentInteraction: {
      interactionInstanceId: `pwi_${randomUUID()}`,
      questionId: target.questionId,
      occurrenceId: target.occurrenceId,
      stepId: target.stepId ?? questionFor(source, target.questionId).step_binding,
      ...(target.targetIds ? { targetIds: target.targetIds } : {}),
      ...(target.replayOfOccurrenceId ? { replayOfOccurrenceId: target.replayOfOccurrenceId } : {}),
      ...(state.routerInput.comparisonIdsByResponseId?.[target.responseId] ? { comparisonIds: state.routerInput.comparisonIdsByResponseId[target.responseId] } : {}),
      ...(target.variantId ? { variantId: target.variantId } : {}),
    },
  };
}

export function pausePwqe51Session(state: Pwqe51SessionState, paused = true): Pwqe51SessionState {
  return { ...state, paused };
}

export function resumePwqe51Session(state: Pwqe51SessionState): Pwqe51SessionState {
  return { ...state, paused: false };
}

export function endPwqe51Session(state: Pwqe51SessionState, source: Pwqe51SourcePackage): Pwqe51SessionState {
  assertPinnedSource(state, source);
  const controls = [...new Set([...state.controls, "end" as const])];
  const compiled = compileBoundRoute(routeInput({ ...state, controls }), source);
  return { ...state, controls, phase: compiled.result.phase, routerInput: { ...state.routerInput, episodeLinks: compiled.episodeLinks }, routerResult: compiled.result, currentInteraction: null, occurrenceBindings: compiled.occurrenceBindings };
}

export function shortenPwqe51Session(state: Pwqe51SessionState, source: Pwqe51SourcePackage): Pwqe51SessionState {
  if (state.pass !== 2 || state.phase === "finished") throw new Error("PWQE 5.1 can only shorten an active Deepening pass.");
  assertPinnedSource(state, source);
  const controls = [...new Set([...state.controls, "shorten" as const])];
  const compiled = compileBoundRoute(routeInput({ ...state, controls }), source);
  return { ...state, controls, phase: compiled.result.phase, routerInput: { ...state.routerInput, episodeLinks: compiled.episodeLinks }, routerResult: compiled.result, currentInteraction: currentFor(compiled.result, state.currentInteraction), occurrenceBindings: compiled.occurrenceBindings };
}

export function startPwqe51Deepening(
  state: Pwqe51SessionState,
  optedInTopics: readonly string[],
  source: Pwqe51SourcePackage,
  context: { readonly focusOccurrences?: readonly string[]; readonly details?: readonly string[]; readonly distinctPairs?: readonly (readonly [string, string])[]; readonly comparisonDecisions?: readonly Pwqe51ComparisonDecision[] } = {},
): Pwqe51SessionState {
  if (state.pass !== 1 || state.phase !== "finished") throw new Error("PWQE 5.1 Mapping must finish before Deepening starts.");
  assertPinnedSource(state, source);
  const actualEpisodes = new Set(pwqe51FocusChoices(state).map((choice) => choice.occurrenceId));
  if (context.focusOccurrences?.some((occurrenceId) => !actualEpisodes.has(occurrenceId))) {
    throw new Error("PWQE 5.1 focus selection must use an existing actual recalled occasion.");
  }
  if (context.details?.some((detail) => !DETAIL_PERMISSIONS.has(detail))) {
    throw new Error("PWQE 5.1 detail permission is outside the authored controls.");
  }
  if (context.distinctPairs?.some(([first, second]) => first === second || !actualEpisodes.has(first) || !actualEpisodes.has(second))) {
    throw new Error("PWQE 5.1 distinctness confirmation requires two existing actual recalled occasions.");
  }
  if (context.comparisonDecisions?.some((decision) => decision.firstOccurrenceId === decision.secondOccurrenceId
    || !actualEpisodes.has(decision.firstOccurrenceId) || !actualEpisodes.has(decision.secondOccurrenceId)
    || !["different", "same", "cannot_tell"].includes(decision.relation))) {
    throw new Error("PWQE 5.1 comparison decisions require two existing actual recalled occasions and an authored relation.");
  }
  const distinctPairs = [...new Map((context.distinctPairs ?? []).map(([first, second]) => {
    const pair = [first, second] as const;
    return [`${first}\u0000${second}`, pair];
  })).values()];
  const routerInput = {
    ...state.routerInput,
    focusOccurrences: [...new Set(context.focusOccurrences ?? [])],
    details: [...new Set(context.details ?? [])],
    distinctPairs,
  };
  const nextBase = { ...state, routerInput, comparisonDecisions: [...(context.comparisonDecisions ?? [])], pass: 2 as const, phase: "deepening" as const, paused: false, optedInTopics: [...new Set(optedInTopics)], controls: [] as ("end" | "shorten")[] };
  const compiled = compileBoundRoute(routeInput(nextBase), source);
  return { ...nextBase, routerInput: { ...nextBase.routerInput, episodeLinks: compiled.episodeLinks }, occurrenceBindings: compiled.occurrenceBindings, routerResult: compiled.result, phase: compiled.result.phase, currentInteraction: currentFor(compiled.result, null) };
}

export function canCompletePwqe51Pass(state: Pwqe51SessionState): boolean {
  return state.phase === "finished" && state.routerResult.phase === "finished";
}
