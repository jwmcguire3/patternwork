import { sha256 } from "../../security/crypto.ts";
import type { Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";
import type { Pwqe51CanonicalResponse, Pwqe51RouteCandidate } from "../../assessment/pwqe51-router.ts";
import {
  advancePwqe51Session,
  applyPwqe51ReplayBinding,
  canCompletePwqe51Pass,
  createPwqe51SessionState,
  endPwqe51Session,
  renderPwqe51Interaction,
  startPwqe51Deepening,
  type Pwqe51ReplayBindingOutcome,
  type Pwqe51SessionState,
} from "../../assessment/pwqe51-session.ts";
import {
  decideFictionalRespondent,
  fictionalRespondentTopicControls,
  type FictionalDeepeningAnswerAudit,
  type FictionalRespondentControl,
} from "./fictional-respondent.ts";
import { buildPwqe51RouterPacket } from "../pwqe51-packet.ts";
import { preparePwrp71Request } from "../pwrp71-adapter.ts";
import type { Pwrp71SourcePackage } from "../pwrp71-source.ts";

export type FictionalAnswerProvenance = "original_authored_fictional_response" | "new_synthetic_mapping_response" | "new_synthetic_deepening_answer" | "new_fictional_control_outcome";
export interface FictionalResponse extends Pwqe51CanonicalResponse {
  readonly provenance?: FictionalAnswerProvenance;
  readonly sourceRef?: string;
}
export interface FictionalHistoryV2 {
  readonly schemaVersion: "PWQE51-FICTIONAL-HISTORY-V2";
  readonly profile: { readonly id: string; readonly title?: string };
  readonly source?: Readonly<Record<string, unknown>>;
  readonly responseProvenance?: readonly { readonly responseId: string; readonly origin: string; readonly authoredSourceRef?: string | null; readonly usage?: string; readonly note?: string }[];
  readonly episodes?: readonly { readonly occurrenceId: string; readonly episodeFamily: string; readonly basis: string; readonly origin: string; readonly archivedOccurrenceId?: string }[];
  readonly mappingResponses: readonly FictionalResponse[];
  readonly deepeningResponses: readonly FictionalResponse[];
  readonly topicPermissionEvents?: readonly { readonly topic: string; readonly outcome: string; readonly provenance?: string }[];
  readonly syntheticReferentRoles?: readonly { readonly occurrenceId: string; readonly slot: string; readonly role: string }[];
  readonly originalConfiguredReferentRoles?: readonly { readonly occurrenceId: string; readonly slot: string; readonly role: string }[];
  readonly distinctnessIntents?: readonly { readonly sourceOccurrenceId: string; readonly otherOccurrenceId: string; readonly outcome: string; readonly kind?: string; readonly reason?: string }[];
  readonly comparisonBindingIntents?: readonly { readonly responseId: string; readonly comparisonOccurrenceIds: readonly [string, string] }[];
  readonly intendedDeepeningContext?: { readonly optedInTopics?: readonly string[]; readonly focusTopics?: readonly string[]; readonly details?: readonly string[]; readonly focusOccurrenceId?: string };
  readonly mappingControls?: readonly { readonly kind: string; readonly effectiveBeforeQuestion?: string; readonly occurrenceId?: string; readonly provenance?: string }[];
  readonly withheldAuthoredAnswers?: readonly { readonly sourceAnswerRef?: string; readonly questionId: string; readonly selectedOptionIds?: readonly string[]; readonly reason?: string }[];
}

export interface FictionalSessionReplayResult {
  readonly profileId: string;
  readonly state: Pwqe51SessionState;
  readonly occurrenceReferenceToServerId: Readonly<Record<string, string>>;
  readonly submitted: readonly { readonly sourceResponseId: string; readonly runtimeResponseId: string; readonly questionId: string; readonly occurrenceId: string; readonly stepId: string; readonly variantId?: string; readonly selectedOptionIds: readonly string[]; readonly status: string; readonly mode: string; readonly basis?: string; readonly targetIds: readonly string[]; readonly replayOfOccurrenceId?: string; readonly administrationSequence: number; readonly phase: "mapping" | "deepening"; readonly provenance: FictionalAnswerProvenance }[];
  readonly routingTrace: readonly { readonly phase: "mapping" | "deepening"; readonly candidate: Pwqe51RouteCandidate; readonly renderedQuestionId: string; readonly result: "accepted" | "replay_binding" | "respondent_control" | "diverged"; readonly sourceResponseId?: string; readonly reason?: string }[];
  readonly replayDecisions: readonly { readonly decisionId: string; readonly sourceOccurrenceId: string; readonly replayOccurrenceId?: string; readonly outcome: Pwqe51ReplayBindingOutcome; readonly sourceOccurrenceReference: string }[];
  readonly responseProvenance: readonly { readonly sourceResponseId: string; readonly runtimeResponseId?: string; readonly origin: string; readonly authoredSourceRef?: string | null; readonly usage?: string; readonly accepted: boolean }[];
  readonly syntheticDeepeningAnswerAudit: readonly FictionalDeepeningAnswerAudit[];
  readonly syntheticRespondentControls: readonly FictionalRespondentControl[];
  readonly episodeRegistry: readonly { readonly fixtureOccurrenceReference: string; readonly serverOccurrenceId?: string; readonly episodeFamily?: string; readonly origin?: string }[];
  readonly missingness: Pwqe51SessionState["routerResult"]["missingness"];
  readonly sequenceGraph: Pwqe51SessionState["routerResult"]["sequenceEdges"];
  readonly finalTargetResolutions: Pwqe51SessionState["routerResult"]["targets"];
  readonly contextDecisions: { readonly optedInTopics: readonly string[]; readonly details: readonly string[]; readonly focusOccurrenceId?: string; readonly focusTopics: readonly string[]; readonly focusTopicsApplied: boolean; readonly reason?: string; readonly distinctness: readonly { readonly sourceReference: string; readonly otherReference: string; readonly outcome: string; readonly status: "applied" | "unavailable"; readonly basis: "router_replay_binding" | "pass_two_context" | "router_explicit_different_event_prompt" | "unavailable"; readonly sourceOccurrenceId?: string; readonly otherOccurrenceId?: string; readonly reason?: string }[]; readonly comparisonBindings: readonly { readonly responseId: string; readonly occurrenceIds: readonly [string, string]; readonly applied: boolean }[] };
  readonly referentRoleBindings: readonly { readonly fixtureOccurrenceReference: string; readonly serverOccurrenceId?: string; readonly slot: string; readonly role: string; readonly origin: string }[];
  readonly fictionalControlHistory: { readonly declaredMappingControls: FictionalHistoryV2["mappingControls"]; readonly runtimeControls: Pwqe51SessionState["controls"]; readonly runtimeMissingness: Pwqe51SessionState["routerResult"]["missingness"] };
  readonly unreachedOriginalAnswers: readonly { readonly responseId: string; readonly questionId: string; readonly occurrenceId: string; readonly classification: "eligible_but_not_reached" | "ineligible_in_current_context" | "intentionally_forbidden" | "source_contract_mismatch" | "implementation_defect"; readonly reason: string }[];
  readonly firstDivergence?: string;
  readonly mappingComplete: boolean;
  readonly deepeningStarted: boolean;
  readonly deepeningComplete: boolean;
  readonly semanticCore: { readonly status: "complete" | "incomplete" | "unavailable"; readonly requiredSourceResponseIds: readonly string[]; readonly acceptedSourceResponseIds: readonly string[]; readonly reason?: string };
  readonly packets: Readonly<Partial<Record<"MAP" | "IFS" | "PV" | "ATT", { readonly packet: Record<string, unknown>; readonly adapterAccepted: boolean; readonly issues: readonly unknown[] }>>>;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}
const runtimeResponseId = (profileId: string, phase: string, sourceId: string, occurrenceId: string) => `pwr_${sha256(`${profileId}:${phase}:${sourceId}:${occurrenceId}`).slice(0, 40)}`;
const roleFor = (history: FictionalHistoryV2, fixtureOccurrence: string, slot: string) =>
  [...(history.originalConfiguredReferentRoles ?? []), ...(history.syntheticReferentRoles ?? [])]
    .find((role) => role.occurrenceId === fixtureOccurrence && role.slot === slot)?.role;
const responseSlot = (prompt: string) => [...prompt.matchAll(/\{([a-z_]+)\}/gu)].map((match) => match[1]).find((slot) => ["evaluator", "boundary_person", "close_person", "support_person", "repair_person", "conflict_person", "family_person"].includes(slot));

interface SemanticCoreRow { readonly questionId: string; readonly occurrenceId: string; readonly optionIds: readonly string[] }
const SEMANTIC_CORE: Readonly<Record<string, readonly SemanticCoreRow[]>> = {
  P01: [
    { questionId: "D04", occurrenceId: "fx_P01_E1", optionIds: ["D04.sign"] },
    { questionId: "M02", occurrenceId: "fx_P01_E2", optionIds: ["M02.rehearse"] },
    { questionId: "M03", occurrenceId: "fx_P01_E2", optionIds: ["M03.exposure"] },
    { questionId: "D04", occurrenceId: "fx_P01_E2", optionIds: ["D04.choice"] },
  ],
  P02: ["D61.explain","D02.prevent","D03.connection","D07.leave","D08.after_failed","D09.relief","D10.relief"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_P02_E1", optionIds: [answer],
  })),
  P03: [
    { questionId: "D43", occurrenceId: "fx_P03_E1", optionIds: ["D43.okay"] },
    { questionId: "D44", occurrenceId: "fx_P03_E1", optionIds: ["D44.reliable"] },
    { questionId: "D42", occurrenceId: "fx_P03_E2", optionIds: ["D42.miss"] },
  ],
  P04: [
    { questionId: "D43", occurrenceId: "fx_P04_E1", optionIds: ["D43.information"] },
    { questionId: "D16", occurrenceId: "fx_P04_E1", optionIds: ["D16.consequence"] },
  ],
  P05: [
    { questionId: "D34", occurrenceId: "fx_P05_E1", optionIds: ["D34.words"] },
    { questionId: "D30", occurrenceId: "fx_P05_E1", optionIds: ["D30.stuck"] },
    { questionId: "D36", occurrenceId: "fx_P05_E1", optionIds: ["D36.input", "D36.words", "D36.think"] },
  ],
  P06: ["D61.settle","D02.prevent","D03.connection","D01.during"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_P06_E2", optionIds: [answer],
  })),
  P08: [
    { questionId: "D21", occurrenceId: "fx_P08_E1", optionIds: ["D21.visible"] },
    { questionId: "D18", occurrenceId: "fx_P08_E1", optionIds: ["D18.need"] },
    { questionId: "D19", occurrenceId: "fx_P08_E1", optionIds: ["D19.burden"] },
    { questionId: "D47", occurrenceId: "fx_P08_E2", optionIds: ["D47.light"] },
    { questionId: "D48", occurrenceId: "fx_P08_E2", optionIds: ["D48.burden"] },
  ],
  P09: [
    ...["D61.explain","D07.leave","D08.after_failed","D11.urgent","D09.none","D10.relief"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_P09_E1", optionIds: [answer] })),
    ...["D61.explain","D07.leave","D08.after_failed","D11.urgent","D10.relief"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_P09_E2", optionIds: [answer] })),
  ],
  C01: ["D17.care","D21.visible","D19.burden","D20.need","D65.judge","D66.compelled","D67.not_allowed","D68.pushed","D69.less_notice","D91.offered","D92.more_hidden"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C01_mapping_M20", optionIds: [answer],
  })),
  C02: ["D17.care","D21.visible","D19.burden","D20.none","D65.patient","D66.choice","D69.hidden_only","D91.offered","D92.more_asked","D23.stay"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C02_mapping_M20", optionIds: [answer],
  })),
  C03: ["D72.pride","D73.wrong","D74.push","D65.judge","D66.compelled"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C03_deepening_D72", optionIds: [answer],
  })),
  C04: ["D72.interest","D73.privacy","D74.allow","D65.curious","D66.choice","D23.stay"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C04_deepening_D72", optionIds: [answer],
  })),
  C05: ["D15.prevent","D22.not_enough","D70.certain","D71.discounted","D65.remove","D66.compelled"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C05_mapping_M04", optionIds: [answer],
  })),
  C06: ["D12.cost","D13.failure","D14.demand","D75.clearer","D76.different"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C06_mapping_M26", optionIds: [answer],
  })),
  C07: [
    { questionId: "M02", occurrenceId: "fx_C07_mapping_M02", optionIds: ["M02.rehearse"] },
    { questionId: "M03", occurrenceId: "fx_C07_mapping_M02", optionIds: ["M03.exposure"] },
    { questionId: "M02", occurrenceId: "fx_C07_replay_M02_2", optionIds: ["M02.rehearse"] },
    { questionId: "M03", occurrenceId: "fx_C07_replay_M02_2", optionIds: ["M03.exposure"] },
    { questionId: "D56", occurrenceId: "fx_C07_mapping_M02", optionIds: ["D56.same"] },
    { questionId: "D57", occurrenceId: "fx_C07_mapping_M02", optionIds: ["D57.same"] },
    { questionId: "D77", occurrenceId: "fx_C07_mapping_M02", optionIds: ["D77.concern"] },
  ],
  C08: [
    ...["D61.explain","D02.prevent","D03.connection","D07.leave","D08.after_failed","D09.relief","D10.relief","D11.urgent"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_C08_deepening_D61", optionIds: [answer] })),
    { questionId: "D78", occurrenceId: "fx_C08_deepening_D61", optionIds: ["D78.returned"] },
    { questionId: "D79", occurrenceId: "fx_C08_deepening_D61", optionIds: ["D79.reaction"] },
  ],
  C09: [
    ...["D61.explain","D02.prevent","D03.connection","D07.leave","D08.after_failed","D09.relief","D10.relief","D11.urgent"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_C09_deepening_D61", optionIds: [answer] })),
    { questionId: "D78", occurrenceId: "fx_C09_deepening_D61", optionIds: ["D78.no"] },
  ],
  C10: [
    ...["D34.words","D30.stuck","D80.task","D81.steady_strained","D82.gradual","D83.settle","D84.later_day","D85.function_first","D86.setting","D100.same_less"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_C10_mapping_M10", optionIds: [answer] })),
    { questionId: "D36", occurrenceId: "fx_C10_mapping_M10", optionIds: ["D36.input", "D36.words", "D36.think"] },
  ],
  C11: [
    { questionId: "D87", occurrenceId: "fx_C11_mapping_M10", optionIds: ["D87.settled"] },
    { questionId: "D88", occurrenceId: "fx_C11_mapping_M10", optionIds: ["D88.held"] },
    { questionId: "D86", occurrenceId: "fx_C11_mapping_M10", optionIds: ["D86.support"] },
  ],
  C12: [
    ...["D43.okay","D44.reliable","D45.return","D89.not_need","D90.dismiss"].map((answer) => ({ questionId: answer.split(".")[0]!, occurrenceId: "fx_C12_mapping_M17", optionIds: [answer] })),
    { questionId: "D42", occurrenceId: "fx_C12_known_delay_2", optionIds: ["D42.fine"] },
  ],
  C13: ["D52.fast","D53.small","D93.slower","D94.expectations","D95.exposed"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C13_deepening_D52", optionIds: [answer],
  })),
  C14: ["D50.time","D51.mixed","D96.consistent"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C14_mapping_M24", optionIds: [answer],
  })),
  C15: ["D97.encourage","D98.encouraged"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C15_deepening_D97", optionIds: [answer],
  })),
  C16: ["D97.approval","D98.permission"].map((answer) => ({
    questionId: answer.split(".")[0]!, occurrenceId: "fx_C16_deepening_D97", optionIds: [answer],
  })),
};

function requiredSemanticCoreResponseIds(history: FictionalHistoryV2): string[] {
  const requirements = SEMANTIC_CORE[history.profile.id];
  if (!requirements?.length) return [];
  return requirements.flatMap((requirement) => {
    const response = [...history.mappingResponses, ...history.deepeningResponses].find((candidate) => candidate.questionId === requirement.questionId
      && candidate.occurrenceId === requirement.occurrenceId
      && canonical(candidate.selectedOptionIds ?? []) === canonical(requirement.optionIds));
    return response ? [response.responseId] : [];
  });
}

function semanticCoreComplete(history: FictionalHistoryV2, submitted: FictionalSessionReplayResult["submitted"]): boolean {
  const required = requiredSemanticCoreResponseIds(history);
  if (required.length !== SEMANTIC_CORE[history.profile.id]?.length || required.length === 0) return false;
  const accepted = new Set(submitted.filter((response) => response.status === "answered").map((response) => response.sourceResponseId));
  return required.every((responseId) => accepted.has(responseId));
}

function matches(candidate: Pwqe51RouteCandidate, response: FictionalResponse, occurrence: string | undefined, sourceEpisodeFamily: string | undefined,
  occurrenceMap: Readonly<Record<string, string>>, source: Pwqe51SourcePackage, expectedComparison?: readonly [string, string],
  allowExplicitDifferentWaitRoot = false): boolean {
  if (candidate.questionId !== response.questionId || candidate.stepId !== response.stepId || (candidate.variantId ?? "") !== (response.variantId ?? "")) return false;
  if (occurrence && occurrence !== candidate.occurrenceId) return false;
  if (Boolean(response.replayOfOccurrenceId) !== Boolean(candidate.replayOfOccurrenceId)) return false;
  if (response.replayOfOccurrenceId && candidate.replayOfOccurrenceId !== occurrenceMap[response.replayOfOccurrenceId]) return false;
  if (expectedComparison && (!candidate.comparisonIds || [...candidate.comparisonIds].sort().join("\u0000") !== [...expectedComparison].sort().join("\u0000"))) return false;
  if (occurrence) return true;
  const expectedFamily = source.questionBank.items.find((question) => question.id === response.questionId)?.episode_family;
  const candidateFamily = source.questionBank.items.find((question) => question.id === candidate.questionId)?.episode_family;
  if (!expectedFamily || sourceEpisodeFamily !== expectedFamily || candidateFamily !== expectedFamily) return false;
  if (candidate.stage === "mapping") return true;
  return candidate.stage === "deepening" && (candidate.targetIds.some((targetId) => targetId.startsWith("entry:")) || allowExplicitDifferentWaitRoot);
}

function responseMatchesAuthoredSelection(candidate: Pwqe51RouteCandidate, response: FictionalResponse, source: Pwqe51SourcePackage): boolean {
  const question = source.questionBank.items.find((item) => item.id === candidate.questionId);
  const variant = candidate.variantId
    ? source.questionBank.variants.find((entry) => entry.id === candidate.variantId && entry.replaces === candidate.questionId)
    : undefined;
  if (!question || (candidate.variantId && !variant)) return false;
  const options = variant?.options ?? question.options;
  const selected = response.selectedOptionIds ?? [];
  const status = response.status ?? "answered";
  const selectionMode = question.selection.mode;
  const mode = response.mode ?? "single";
  const maxSelect = (question.selection as { readonly max_select?: unknown }).max_select;
  if (status !== "answered") {
    return selected.length === 0 && question.response_controls.includes(status);
  }
  if (selected.length === 0 || selected.length > (typeof maxSelect === "number" ? maxSelect : Number.POSITIVE_INFINITY)
    || selected.some((optionId) => !options.some((option) => option.id === optionId))) return false;
  if (selectionMode === "partial_order") return mode === "ordered" || mode === "order_unknown";
  if (selectionMode === "simultaneous") return mode === "single" || mode === "simultaneous";
  return mode === "single";
}

/** Drives a fictional v2 profile through the production session lifecycle. */
export function replayFictionalPwqe51Session(input: {
  readonly history: FictionalHistoryV2;
  readonly questionSource: Pwqe51SourcePackage;
  readonly reportSource?: Pwrp71SourcePackage;
  readonly maxAdministrations?: number;
  readonly startDeepening?: boolean;
  /** JSON-safe checkpoint inputs for a deterministic resume. */
  readonly initialState?: Pwqe51SessionState;
  readonly initialOccurrenceReferenceToServerId?: Readonly<Record<string, string>>;
}): FictionalSessionReplayResult {
  const { history, questionSource } = input;
  if (history.schemaVersion !== "PWQE51-FICTIONAL-HISTORY-V2") throw new Error("Unsupported fictional history schema.");
  const max = input.maxAdministrations ?? 160;
  const authoredFocusTopics = history.intendedDeepeningContext?.focusTopics ?? [];
  let state = input.initialState ?? createPwqe51SessionState(questionSource, { focusTopics: [...authoredFocusTopics] });
  const occurrenceMap: Record<string, string> = { ...(input.initialOccurrenceReferenceToServerId ?? {}) };
  const submitted: FictionalSessionReplayResult["submitted"] extends readonly (infer T)[] ? T[] : never = [];
  const trace: FictionalSessionReplayResult["routingTrace"] extends readonly (infer T)[] ? T[] : never = [];
  const replayDecisions: FictionalSessionReplayResult["replayDecisions"] extends readonly (infer T)[] ? T[] : never = [];
  const sourceProvenance = new Map((history.responseProvenance ?? []).map((entry) => [entry.responseId, entry]));
  const sourceContractMismatches = new Map<string, string>();
  const syntheticDeepeningAnswerAudit: FictionalDeepeningAnswerAudit[] = [];
  const syntheticRespondentControls = [...fictionalRespondentTopicControls(history)];
  const syntheticOptInTopics = syntheticRespondentControls.filter((control): control is Extract<FictionalRespondentControl, { readonly kind: "topic_opt_in" }> => control.kind === "topic_opt_in").map((control) => control.topic);
  let divergence: string | undefined;
  let attempts = 0;

  const drive = (phase: "mapping" | "deepening", rows: readonly FictionalResponse[]) => {
    while (state.phase === phase && attempts < max) {
      attempts += 1;
      const candidate = state.routerResult.next;
      if (!candidate) break;
      if (candidate.bindingRequest === "confirm_replay_distinctness") {
        const priorBinding = state.replayBindingHistory?.find((decision) => decision.bindingKey === candidate.bindingKey);
        if (priorBinding) {
          const reason = `The router reissued replay binding ${candidate.bindingKey} after the respondent already answered ${priorBinding.outcome}; the current source contract provides no second decision for this same request.`;
          trace.push({ phase, candidate, renderedQuestionId: candidate.questionId, result: "diverged", reason });
          divergence ??= reason;
          break;
        }
        const sourceRef = Object.entries(occurrenceMap).find(([, runtime]) => runtime === candidate.replayOfOccurrenceId)?.[0];
        const declaredIntent = sourceRef ? history.distinctnessIntents?.find((entry) => entry.sourceOccurrenceId === sourceRef
          && ["different", "same", "unknown", "no_event", "skip"].includes(entry.outcome)) : undefined;
        const questionFamily = questionSource.questionBank.items.find((item) => item.id === candidate.questionId)?.episode_family;
        const sameFamilyOccurrences = questionFamily ? history.episodes?.filter((episode) => episode.episodeFamily === questionFamily).length ?? 0 : 0;
        const sourceEpisodeFamily = declaredIntent ? history.episodes?.find((episode) => episode.occurrenceId === declaredIntent.sourceOccurrenceId)?.episodeFamily : undefined;
        const otherEpisodeFamily = declaredIntent ? history.episodes?.find((episode) => episode.occurrenceId === declaredIntent.otherOccurrenceId)?.episodeFamily : undefined;
        const intentFamiliesMatch = !!declaredIntent && !!questionFamily
          && sourceEpisodeFamily === questionFamily && otherEpisodeFamily === questionFamily;
        const intentHasMismatchedFamily = !!declaredIntent && !intentFamiliesMatch;
        const priorDifferent = state.replayBindingHistory?.find((decision) => decision.sourceOccurrenceId === candidate.replayOfOccurrenceId && decision.outcome === "different");
        const reusingDeclaredPair = !!declaredIntent && !!priorDifferent;
        const applicableIntent = intentFamiliesMatch && !reusingDeclaredPair ? declaredIntent : undefined;
        const outcome = (applicableIntent?.outcome ?? (reusingDeclaredPair || sameFamilyOccurrences <= 1 ? "no_event" : "unknown")) as Pwqe51ReplayBindingOutcome;
        const idempotency = `${history.profile.id}:${sourceRef ?? "unknown-source"}:${candidate.bindingKey}:${applicableIntent?.otherOccurrenceId ?? "no-extra-occurrence"}:replay:${outcome}`;
        const decisionId = `pwrb_${sha256(`fictional:${idempotency}`).slice(0, 40)}`;
        const requestSha256 = sha256(canonical({ outcome, correctionOfBindingRef: null }));
        state = applyPwqe51ReplayBinding(state, { decisionId, requestSha256, outcome }, questionSource);
        const applied = state.replayBindingHistory?.find((decision) => decision.decisionId === decisionId);
        if (applied?.replayOccurrenceId && applicableIntent?.otherOccurrenceId) occurrenceMap[applicableIntent.otherOccurrenceId] = applied.replayOccurrenceId;
        replayDecisions.push({ decisionId, sourceOccurrenceId: applied?.sourceOccurrenceId ?? candidate.replayOfOccurrenceId!, ...(applied?.replayOccurrenceId ? { replayOccurrenceId: applied.replayOccurrenceId } : {}), outcome, sourceOccurrenceReference: sourceRef ?? "unresolved-source-reference" });
        if (!applicableIntent) {
          syntheticRespondentControls.push({ kind: "replay_binding", sourceOccurrenceReference: sourceRef ?? "unresolved-source-reference",
            sourceOccurrenceId: candidate.replayOfOccurrenceId!, questionId: candidate.questionId, bindingKey: candidate.bindingKey!, outcome,
            rationale: outcome === "no_event"
              ? reusingDeclaredPair
                ? "The one source-declared different occasion has already been bound. No further occurrence is present in this fictional history, so the respondent uses no_event for this additional replay request."
                : intentHasMismatchedFamily
                  ? `The source-declared second occurrence is ${otherEpisodeFamily ?? "unclassified"}, not a second ${questionFamily ?? "matching-family"} occurrence. The respondent uses the supported no_event binding outcome; no replay occurrence is created.`
                  : `The source fiction contains no second actual ${questionFamily ?? "matching-family"} occurrence. The respondent uses the supported no_event binding outcome; no replay occurrence is created.`
              : "The source fiction does not establish a second matching-family event or its relation to this one. The respondent uses the supported unknown binding control; no occurrence is created.",
            provenance: "new_fictional_control_outcome" });
        }
        trace.push({ phase, candidate, renderedQuestionId: candidate.questionId, result: applicableIntent ? "replay_binding" : "respondent_control",
          ...(!applicableIntent ? { reason: intentHasMismatchedFamily
            ? `The authored distinctness pair crosses episode families (${sourceEpisodeFamily ?? "unclassified"} → ${otherEpisodeFamily ?? "unclassified"}); the supported ${outcome} control was applied to avoid binding a different kind of event.`
            : `No unconsumed same-family authored distinctness intent applies; the supported ${outcome} control was applied.` } : {}) });
        continue;
      }
      const rendered = renderPwqe51Interaction(state, questionSource);
      if (!state.currentInteraction || !rendered) break;
      const mapped = occurrenceMap;
      const possible = rows.filter((response) => {
        const intent = history.comparisonBindingIntents?.find((binding) => binding.responseId === response.responseId);
        if (candidate.comparisonIds && ["D56", "D57", "D77"].includes(candidate.questionId) && !intent) return false;
        const expectedComparison = intent?.comparisonOccurrenceIds.map((reference) => mapped[reference]) as [string, string] | undefined;
        if (expectedComparison?.some((occurrenceId) => !occurrenceId)) return false;
        const sourceEpisodeFamily = history.episodes?.find((episode) => episode.occurrenceId === response.occurrenceId)?.episodeFamily;
        const sourceForLinkedEvent = candidate.linkedFrom
          ? Object.entries(mapped).find(([, runtimeId]) => runtimeId === candidate.linkedFrom)?.[0]
          : undefined;
        const explicitDifferentWaitIntent = candidate.questionId === "D42" && candidate.stage === "deepening"
          && !!candidate.linkedFrom && candidate.targetIds.some((targetId) => targetId.startsWith("known_distance:"))
          && sourceEpisodeFamily === "known_delay"
          && questionSource.questionBank.items.find((item) => item.id === "D42")?.prompt.includes("different time") === true
          && history.distinctnessIntents?.some((entry) => entry.outcome === "different"
            && entry.sourceOccurrenceId === sourceForLinkedEvent && entry.otherOccurrenceId === response.occurrenceId) === true;
        return matches(candidate, response, mapped[response.occurrenceId], sourceEpisodeFamily, mapped, questionSource, expectedComparison, explicitDifferentWaitIntent)
          && responseMatchesAuthoredSelection(candidate, response, questionSource);
      });
      const withheld = phase === "deepening"
        ? history.withheldAuthoredAnswers?.filter((answer) => answer.questionId === candidate.questionId) ?? []
        : [];
      const pendingOriginal = possible.filter((item) => !state.responses.some((prior) => prior.responseId === runtimeResponseId(history.profile.id, phase, item.responseId, candidate.occurrenceId ?? "")));
      let response = withheld.length > 0 ? undefined : pendingOriginal[0];
      const preserveP01Comparison = history.profile.id === "P01" && !!candidate.comparisonIds && ["D56", "D57"].includes(candidate.questionId);
      if (!response && withheld.length === 0 && phase === "deepening" && semanticCoreComplete(history, submitted) && !preserveP01Comparison) {
        const requiredSourceResponseIds = requiredSemanticCoreResponseIds(history);
        const reason = `All ${requiredSourceResponseIds.length} source-bound semantic-core responses for ${history.profile.id} have been accepted; the next router-issued ${candidate.questionId} prompt has no matching authored case answer.`;
        state = endPwqe51Session(state, questionSource);
        syntheticRespondentControls.push({ kind: "end_deepening_after_semantic_core", requiredSourceResponseIds, nextQuestionId: candidate.questionId,
          rationale: `${reason} The fictional respondent used the supported end control; no additional scenario answer was inferred.`, provenance: "new_fictional_control_outcome" });
        trace.push({ phase, candidate, renderedQuestionId: candidate.questionId, result: "respondent_control", reason: "Respondent ended Deepening after the exact authored semantic anchors were completed." });
        break;
      }
      if (!response && withheld.length > 0) {
        const question = questionSource.questionBank.items.find((item) => item.id === candidate.questionId);
        if (!question?.response_controls.includes("skip")) {
          const reason = `Router issued forbidden ${candidate.questionId}, and the pinned question does not support a skip control.`;
          trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", reason });
          divergence ??= reason;
          break;
        }
        const responseId = `${history.profile.id}-CONTROL-SKIP-${candidate.questionId}-${candidate.stepId}-${state.responses.length + 1}`;
        state = advancePwqe51Session(state, { completionState: "SKIPPED", responseId, selectedOptionIds: [] }, questionSource);
        const runtimeId = runtimeResponseId(history.profile.id, phase, responseId, candidate.occurrenceId ?? "");
        submitted.push({ sourceResponseId: responseId, runtimeResponseId: runtimeId, questionId: candidate.questionId, occurrenceId: candidate.occurrenceId!, stepId: candidate.stepId,
          selectedOptionIds: [], status: "skip", mode: "single", targetIds: candidate.targetIds, administrationSequence: state.responses.length, phase, provenance: "new_fictional_control_outcome" });
        syntheticRespondentControls.push({ kind: "forbidden_question_discrepancy", questionId: candidate.questionId,
          sourceResponseIds: withheld.map((answer) => answer.sourceAnswerRef ?? answer.questionId), resolution: "respondent_skip",
          rationale: `The genuine router issued ${candidate.questionId}, which the fictional source plan explicitly forbids. The respondent used the supported skip control; no prohibited authored option was submitted.`,
          provenance: "new_fictional_control_outcome" });
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "respondent_control", sourceResponseId: responseId,
          reason: "Forbidden-question discrepancy recorded; the respondent skipped without selecting the withheld option." });
        continue;
      }
      if (!response && phase === "deepening") {
        const decision = decideFictionalRespondent({
          candidate,
          history,
          state,
          questionSource,
          occurrenceReferenceToServerId: occurrenceMap,
          acceptedSourceResponses: submitted.map((answer) => ({
            responseId: answer.sourceResponseId,
            questionId: answer.questionId,
            occurrenceId: answer.occurrenceId,
            stepId: answer.stepId,
            selectedOptionIds: answer.selectedOptionIds,
            status: answer.status,
            evidenceKind: answer.phase === "mapping" ? "mapping_response" as const : "accepted_deepening_response" as const,
          })),
          matchingOriginalResponses: possible,
        });
        if (decision.kind === "original_authored_response" || decision.kind === "new_synthetic_deepening_answer" || decision.kind === "valid_missingness") {
          response = decision.response as FictionalResponse;
          if (decision.kind !== "original_authored_response") syntheticDeepeningAnswerAudit.push(decision.audit);
        } else {
          const reason = decision.reason;
          trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", reason });
          divergence ??= reason;
          break;
        }
      }
      if (!response && phase === "mapping" && candidate.questionId === "M10" && candidate.variantId === "M10.observable") {
        const mismatchedRows = rows.filter((row) => row.questionId === "M10" && row.stepId === candidate.stepId
          && (!mapped[row.occurrenceId] || mapped[row.occurrenceId] === candidate.occurrenceId));
        for (const row of mismatchedRows) sourceContractMismatches.set(row.responseId,
          `The router issued M10.observable, while source response ${row.responseId} selects base M10 option ${row.selectedOptionIds?.join(", ") ?? "no option"}. The source selection is preserved; no observable-variant answer is inferred.`);
        const question = questionSource.questionBank.items.find((item) => item.id === candidate.questionId);
        if (mismatchedRows.length > 0 && candidate.occurrenceId && question?.response_controls.includes("skip")) {
          const responseId = `${history.profile.id}-CONTROL-SKIP-M10-observable-${state.responses.length + 1}`;
          state = advancePwqe51Session(state, { completionState: "SKIPPED", responseId, selectedOptionIds: [], status: "skip", mode: "single" }, questionSource);
          const runtimeId = runtimeResponseId(history.profile.id, phase, responseId, candidate.occurrenceId);
          submitted.push({ sourceResponseId: responseId, runtimeResponseId: runtimeId, questionId: candidate.questionId, occurrenceId: candidate.occurrenceId,
            stepId: candidate.stepId, variantId: candidate.variantId, selectedOptionIds: [], status: "skip", mode: "single", targetIds: candidate.targetIds,
            administrationSequence: state.responses.length, phase, provenance: "new_fictional_control_outcome" });
          syntheticRespondentControls.push({ kind: "source_contract_mismatch", questionId: candidate.questionId, variantId: candidate.variantId,
            sourceResponseIds: mismatchedRows.map((row) => row.responseId), resolution: "respondent_skip",
            rationale: `The router issued ${candidate.questionId}, but the available fictional answer uses a different base item contract. The respondent used the supported skip control and preserved the source response without translating it.`,
            provenance: "new_fictional_control_outcome" });
          trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "respondent_control", sourceResponseId: responseId,
            reason: "Source/runtime M10 contract mismatch recorded; the respondent skipped the unsupported variant." });
          continue;
        }
      }
      if (!response) {
        const m10VariantMismatch = phase === "mapping" && candidate.questionId === "M10" && candidate.variantId === "M10.observable"
          ? rows.find((row) => row.questionId === "M10" && row.stepId === candidate.stepId
            && (!mapped[row.occurrenceId] || mapped[row.occurrenceId] === candidate.occurrenceId))
          : undefined;
        if (m10VariantMismatch) sourceContractMismatches.set(m10VariantMismatch.responseId,
          `The router issued M10.observable, while source response ${m10VariantMismatch.responseId} is bound to base M10 options (${m10VariantMismatch.selectedOptionIds?.join(", ") ?? "no option"}). The source selection is preserved; no observable-variant answer is inferred.`);
        const reason = m10VariantMismatch
          ? `Source-contract mismatch: the router issued M10.observable, while source response ${m10VariantMismatch.responseId} selects base M10 option ${m10VariantMismatch.selectedOptionIds?.join(", ") ?? "no option"}. The original response remains unchanged and the variant is unresolved.`
          : `Router issued ${candidate.questionId}/${candidate.stepId}${candidate.variantId ? `/${candidate.variantId}` : ""} at ${candidate.occurrenceId}; no matching ${phase} answer with satisfied occurrence, target, and variant prerequisites.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", reason });
        divergence ??= reason;
        break;
      }
      if (!candidate.occurrenceId) break;
      const prior = occurrenceMap[response.occurrenceId];
      if (prior && prior !== candidate.occurrenceId) {
        const reason = `Fixture occurrence ${response.occurrenceId} was already bound to a different server occurrence.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      occurrenceMap[response.occurrenceId] = candidate.occurrenceId;
      const slot = responseSlot(questionSource.questionBank.items.find((item) => item.id === response.questionId)?.prompt ?? "");
      const referentRole = slot ? roleFor(history, response.occurrenceId, slot) : undefined;
      if (slot && !referentRole && (response.status === undefined || response.status === "answered")) {
        const reason = `Question ${response.questionId} requires a ${slot} role, but fixture occurrence ${response.occurrenceId} has no authored/configured role.`;
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      const provenance = response.provenance ?? (response.responseId.includes("SYN") ? "new_synthetic_mapping_response" : "original_authored_fictional_response");
      if (phase === "deepening" && provenance === "new_synthetic_mapping_response") {
        const reason = "Synthetic Mapping authorization cannot supply a Deepening answer.";
        trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "diverged", sourceResponseId: response.responseId, reason });
        divergence ??= reason;
        break;
      }
      const id = runtimeResponseId(history.profile.id, phase, response.responseId, candidate.occurrenceId);
      state = advancePwqe51Session(state, {
        completionState: response.status === "skip" ? "SKIPPED" : "COMPLETED",
        responseId: id,
        selectedOptionIds: response.selectedOptionIds ?? [],
        ...(response.status ? { status: response.status } : {}),
        ...(response.mode ? { mode: response.mode } : {}),
        ...(rendered.rootBasisRequired && response.basis ? { basis: response.basis as "actual_recalled" | "reported_typicality" } : {}),
        ...(referentRole ? { referentRole } : {}),
      }, questionSource);
      submitted.push({ sourceResponseId: response.responseId, runtimeResponseId: id, questionId: response.questionId, occurrenceId: candidate.occurrenceId, stepId: candidate.stepId,
        ...(candidate.variantId ? { variantId: candidate.variantId } : {}), selectedOptionIds: response.selectedOptionIds ?? [], status: response.status ?? "answered", mode: response.mode ?? "single",
        ...(rendered.rootBasisRequired && response.basis ? { basis: response.basis } : {}), targetIds: candidate.targetIds, ...(candidate.replayOfOccurrenceId ? { replayOfOccurrenceId: candidate.replayOfOccurrenceId } : {}),
        administrationSequence: state.responses.length, phase, provenance });
      trace.push({ phase, candidate, renderedQuestionId: rendered.questionId, result: "accepted", sourceResponseId: response.responseId });
    }
  };

  drive("mapping", history.mappingResponses);
  const mappingComplete = state.pass === 2 || canCompletePwqe51Pass(state);
  const completedMapping = state.pass === 1 && canCompletePwqe51Pass(state)
    ? { responses: state.responses, routerResult: state.routerResult, controls: state.controls }
    : undefined;
  let deepeningStarted = state.pass === 2;
  let deepeningComplete = state.pass === 2 && canCompletePwqe51Pass(state);
  if (state.pass === 1 && mappingComplete && input.startDeepening !== false) {
    const context = history.intendedDeepeningContext ?? {};
    const focusOccurrence = context.focusOccurrenceId ? occurrenceMap[context.focusOccurrenceId] : undefined;
    const topics = [...new Set([...(context.optedInTopics ?? []), ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic), ...syntheticOptInTopics])];
    const controlledReplayRefs = new Set((history.distinctnessIntents ?? []).filter((intent) => intent.kind === "controlled_replay").map((intent) => `${intent.sourceOccurrenceId}\u0000${intent.otherOccurrenceId}`));
    const distinctPairs = (history.distinctnessIntents ?? []).flatMap((intent) => {
      const first = occurrenceMap[intent.sourceOccurrenceId];
      const second = occurrenceMap[intent.otherOccurrenceId];
      if (intent.outcome !== "different" || !first || !second || controlledReplayRefs.has(`${intent.sourceOccurrenceId}\u0000${intent.otherOccurrenceId}`)) return [];
      return [[first, second] as const];
    });
    const confirmedPairKeys = new Set([
      ...(state.routerInput.distinctPairs ?? []),
      ...distinctPairs,
    ].map((pair) => [...pair].sort().join("\u0000")));
    const comparisonDecisions = (history.comparisonBindingIntents ?? []).flatMap((intent) => {
      const [firstRef, secondRef] = intent.comparisonOccurrenceIds;
      const first = occurrenceMap[firstRef];
      const second = occurrenceMap[secondRef];
      if (!first || !second || !confirmedPairKeys.has([first, second].sort().join("\u0000"))) return [];
      return [{ firstOccurrenceId: first, secondOccurrenceId: second, relation: "different" as const }];
    });
    state = startPwqe51Deepening(state, topics, questionSource, {
      ...(focusOccurrence ? { focusOccurrences: [focusOccurrence] } : {}),
      ...(context.details ? { details: context.details } : {}),
      distinctPairs,
      comparisonDecisions,
    });
    deepeningStarted = true;
    drive("deepening", history.deepeningResponses);
    deepeningComplete = canCompletePwqe51Pass(state);
  } else if (state.pass === 2 && !deepeningComplete) {
    drive("deepening", history.deepeningResponses);
    deepeningComplete = canCompletePwqe51Pass(state);
  }

  const packets: Partial<Record<"MAP" | "IFS" | "PV" | "ATT", { packet: Record<string, unknown>; adapterAccepted: boolean; issues: readonly unknown[] }>> = {};
  if (mappingComplete && completedMapping) {
    const packet = buildPwqe51RouterPacket({ snapshotId: `fictional-${history.profile.id}-mapping`, responses: completedMapping.responses, routerResult: completedMapping.routerResult, pass: 1, controls: completedMapping.controls, source: questionSource });
    const prepared = input.reportSource ? preparePwrp71Request({ packet: packet as never, reportType: "MAP", questionSource, reportSource: input.reportSource }) : undefined;
    packets.MAP = { packet, adapterAccepted: prepared?.ok ?? false, issues: prepared?.ok === false ? prepared.issues : [] };
  }
  if (deepeningComplete) {
    const packet = buildPwqe51RouterPacket({ snapshotId: `fictional-${history.profile.id}-deepening`, responses: state.responses, routerResult: state.routerResult, pass: 2, controls: state.controls, comparisonDecisions: state.comparisonDecisions, source: questionSource });
    for (const type of ["IFS", "PV", "ATT"] as const) {
      const prepared = input.reportSource ? preparePwrp71Request({ packet: packet as never, reportType: type, questionSource, reportSource: input.reportSource }) : undefined;
      packets[type] = { packet, adapterAccepted: prepared?.ok ?? false, issues: prepared?.ok === false ? prepared.issues : [] };
    }
  }

  const reachedIds = new Set(submitted.map((row) => row.sourceResponseId));
  const provenanceByResponse = sourceProvenance;
  const allSourceAnswers = [...history.mappingResponses, ...history.deepeningResponses];
  const unreachedOriginalAnswers = allSourceAnswers
    .filter((response) => !reachedIds.has(response.responseId)
      && !provenanceByResponse.get(response.responseId)?.origin.includes("synthetic_mapping_answer")
      && response.provenance !== "new_synthetic_mapping_response")
    .map((response) => {
      const rejected = state.routerResult.rejectedCandidates.find((candidate) => candidate.questionId === response.questionId);
      const phase = history.mappingResponses.some((entry) => entry.responseId === response.responseId) ? "mapping" : "deepening";
      const runtimeOccurrence = occurrenceMap[response.occurrenceId];
      const phaseRouterResult = phase === "mapping" && completedMapping ? completedMapping.routerResult : state.routerResult;
      const issued = trace.find((entry) => entry.phase === phase && entry.candidate.questionId === response.questionId
        && (!runtimeOccurrence || entry.candidate.occurrenceId === runtimeOccurrence));
      const comparisonIntent = history.comparisonBindingIntents?.find((intent) => intent.responseId === response.responseId);
       const expectedComparison = comparisonIntent?.comparisonOccurrenceIds.map((reference) => occurrenceMap[reference]) as [string, string] | undefined;
       const validUnreached = !!runtimeOccurrence && !expectedComparison?.some((occurrenceId) => !occurrenceId)
         && phaseRouterResult.candidates.some((candidate) => {
           if (candidate.comparisonIds && ["D56", "D57", "D77"].includes(response.questionId) && !comparisonIntent) return false;
           const sourceEpisodeFamily = history.episodes?.find((episode) => episode.occurrenceId === response.occurrenceId)?.episodeFamily;
           return matches(candidate, response, runtimeOccurrence, sourceEpisodeFamily, occurrenceMap, questionSource, expectedComparison)
             && responseMatchesAuthoredSelection(candidate, response, questionSource);
         });
      const mismatch = sourceContractMismatches.has(response.responseId)
        || (response.questionId === "M10" && state.routerResult.next?.questionId === "M10" && state.routerResult.next.variantId === "M10.observable"
          && sourceProvenance.get(response.responseId)?.origin === "original_authored_fictional_answer");
      const forbidden = history.mappingControls?.some((control) => /forbidden|do_not_administer|exclude/iu.test(control.kind)
        && (control as { questionId?: string }).questionId === response.questionId) ?? false;
      const classification = forbidden ? "intentionally_forbidden" as const
        : mismatch ? "source_contract_mismatch" as const
          : validUnreached ? "eligible_but_not_reached" as const
            : "ineligible_in_current_context" as const;
      return { responseId: response.responseId, questionId: response.questionId, occurrenceId: response.occurrenceId, classification,
        reason: forbidden ? "The source fixture explicitly marks this question forbidden in the current route."
          : mismatch ? (sourceContractMismatches.get(response.responseId) ?? divergence ?? "The router-selected M10.observable variant does not contain the original authored option.")
            : validUnreached ? "This authored answer matches a server-eligible candidate for the correct occurrence, but the router ranked another candidate first before the replay stopped."
              : rejected?.reason ?? (divergence ?? (issued ? "The emitted question did not match the authored occurrence, step, variant, or replay parent binding." : runtimeOccurrence ? "No route-issued candidate or explicit eligible decision supports administering this authored response in the current context." : "The fixture occurrence has no server-issued counterpart in the current session context.")) };
    });
  const responseProvenance = allSourceAnswers.map((response) => {
    const entry = provenanceByResponse.get(response.responseId);
    const origin = entry?.origin ?? response.provenance ?? (response.responseId.includes("SYN") ? "new_synthetic_mapping_answer" : "original_authored_fictional_answer");
    return { sourceResponseId: response.responseId, ...(submitted.find((answer) => answer.sourceResponseId === response.responseId) ? { runtimeResponseId: submitted.find((answer) => answer.sourceResponseId === response.responseId)!.runtimeResponseId } : {}), origin, ...(entry && "authoredSourceRef" in entry ? { authoredSourceRef: entry.authoredSourceRef } : {}), ...(entry?.usage ? { usage: entry.usage } : {}), accepted: reachedIds.has(response.responseId) };
  });
  for (const answer of submitted.filter((entry) => entry.provenance === "new_synthetic_deepening_answer")) {
    responseProvenance.push({ sourceResponseId: answer.sourceResponseId, runtimeResponseId: answer.runtimeResponseId, origin: "new_synthetic_deepening_answer", authoredSourceRef: answer.sourceResponseId, usage: "source_bound_fictional_deepening_context_only", accepted: true });
  }
  for (const answer of submitted.filter((entry) => entry.provenance === "new_fictional_control_outcome")) {
    responseProvenance.push({ sourceResponseId: answer.sourceResponseId, runtimeResponseId: answer.runtimeResponseId, origin: "new_fictional_control_outcome", authoredSourceRef: null, usage: "explicit_router_control_or_forbidden_question_skip", accepted: true });
  }
  const episodeRegistry = (history.episodes ?? []).map((episode) => ({ fixtureOccurrenceReference: episode.occurrenceId, ...(occurrenceMap[episode.occurrenceId] ? { serverOccurrenceId: occurrenceMap[episode.occurrenceId] } : {}), episodeFamily: episode.episodeFamily, origin: episode.origin }));
  const context = history.intendedDeepeningContext ?? {};
  const decisionPairs = new Set((state.routerInput.distinctPairs ?? []).map((pair) => [...pair].sort().join("\u0000")));
  const contextDecisions = {
    optedInTopics: [...new Set([...(context.optedInTopics ?? []), ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic), ...syntheticOptInTopics])],
    details: [...(context.details ?? [])], ...(context.focusOccurrenceId ? { focusOccurrenceId: context.focusOccurrenceId } : {}),
    focusTopics: [...(context.focusTopics ?? [])],
    focusTopicsApplied: (state.routerInput.focusTopics ?? []).length === (context.focusTopics ?? []).length
      && (context.focusTopics ?? []).every((topic) => (state.routerInput.focusTopics ?? []).includes(topic)),
    ...((context.focusTopics?.length ?? 0) > 0 && !(context.focusTopics ?? []).every((topic) => (state.routerInput.focusTopics ?? []).includes(topic))
      ? { reason: "An authored focus topic was not present in the production session router input." } : {}),
    distinctness: (history.distinctnessIntents ?? []).map((intent) => {
      const first = occurrenceMap[intent.sourceOccurrenceId];
      const second = occurrenceMap[intent.otherOccurrenceId];
      const controlled = replayDecisions.some((decision) => decision.sourceOccurrenceReference === intent.sourceOccurrenceId && decision.outcome === intent.outcome);
      const secondEpisode = second ? state.routerResult.episodes.find((episode) => episode.id === second) : undefined;
      const firstEpisode = first ? state.routerResult.episodes.find((episode) => episode.id === first) : undefined;
      const acceptedDifferentEventPrompt = !!first && !!second && trace.some((entry) => entry.phase === "deepening"
        && entry.result === "accepted" && entry.sourceResponseId === submitted.find((answer) => answer.questionId === "D42"
          && answer.occurrenceId === second && answer.status === "answered" && answer.basis === "actual_recalled")?.sourceResponseId
        && entry.candidate.questionId === "D42" && entry.candidate.occurrenceId === second && entry.candidate.linkedFrom === first
        && entry.candidate.targetIds.some((targetId) => targetId.startsWith(`known_distance:${first}:`)));
      const explicitDifferentEventPrompt = intent.outcome === "different" && !!first && !!second
        && secondEpisode?.linkedFrom === first
        && firstEpisode?.basis === "actual_recalled" && secondEpisode?.basis === "actual_recalled"
        && questionSource.questionBank.items.find((item) => item.id === "D42")?.prompt.includes("different time") === true
        && acceptedDifferentEventPrompt;
      const inPassContext = !!first && !!second && decisionPairs.has([first, second].sort().join("\u0000"));
      const applied = controlled || explicitDifferentEventPrompt || inPassContext;
      return { sourceReference: intent.sourceOccurrenceId, otherReference: intent.otherOccurrenceId, outcome: intent.outcome, status: applied ? "applied" as const : "unavailable" as const,
        ...(controlled ? { basis: "router_replay_binding" as const }
          : explicitDifferentEventPrompt ? { basis: "router_explicit_different_event_prompt" as const }
            : inPassContext ? { basis: "pass_two_context" as const } : { basis: "unavailable" as const }),
        ...(first ? { sourceOccurrenceId: first } : {}), ...(second ? { otherOccurrenceId: second } : {}),
        ...(!applied ? { reason: first && second ? "The intended pair was not passed through the current production distinctness binding." : "The production session could not bind both fixture references to server-issued occurrences when the pass context was established." } : {}) };
    }),
    comparisonBindings: (history.comparisonBindingIntents ?? []).map((intent) => {
      const [firstRef, secondRef] = intent.comparisonOccurrenceIds;
      const first = occurrenceMap[firstRef];
      const second = occurrenceMap[secondRef];
      const pairKey = first && second ? [first, second].sort().join("\u0000") : undefined;
      const explicitPair = !!pairKey && decisionPairs.has(pairKey);
      const confirmedReplayPair = !!first && !!second && (state.replayBindingHistory ?? []).some((decision) =>
        decision.outcome === "different" && decision.sourceOccurrenceId === first && decision.replayOccurrenceId === second
        && state.responses.some((response) => response.occurrenceId === second && response.replayOfOccurrenceId === first
          && response.status === "answered" && response.basis === "actual_recalled"));
      return { responseId: intent.responseId, occurrenceIds: [first ?? firstRef, second ?? secondRef] as [string, string], applied: !!first && !!second && (explicitPair || confirmedReplayPair) };
    }),
  };
  const referentRoleBindings = [...(history.originalConfiguredReferentRoles ?? []), ...(history.syntheticReferentRoles ?? [])].map((entry) => ({
    fixtureOccurrenceReference: entry.occurrenceId, ...(occurrenceMap[entry.occurrenceId] ? { serverOccurrenceId: occurrenceMap[entry.occurrenceId] } : {}), slot: entry.slot, role: entry.role,
    origin: (entry as { origin?: string }).origin ?? "unspecified_fixture_configuration",
  }));

  const requiredSourceResponseIds = requiredSemanticCoreResponseIds(history);
  const acceptedSourceResponseIds = requiredSourceResponseIds.filter((responseId) => submitted.some((response) => response.sourceResponseId === responseId && response.status === "answered"));
  const completeDefinition = !!SEMANTIC_CORE[history.profile.id] && requiredSourceResponseIds.length === SEMANTIC_CORE[history.profile.id]!.length;
  const coreStatus = !SEMANTIC_CORE[history.profile.id] ? "unavailable" as const
    : !completeDefinition || acceptedSourceResponseIds.length !== requiredSourceResponseIds.length ? "incomplete" as const : "complete" as const;
  const semanticCore = { status: coreStatus, requiredSourceResponseIds, acceptedSourceResponseIds,
    ...(coreStatus === "unavailable" ? { reason: "The source case contains no authored Deepening semantic anchors; a full session may not claim that Deepening semantically qualified this profile." }
      : coreStatus === "incomplete" ? { reason: `${acceptedSourceResponseIds.length} of ${requiredSourceResponseIds.length} exact source-bound semantic-core responses were accepted.` } : {}) };
  return { profileId: history.profile.id, state, occurrenceReferenceToServerId: occurrenceMap, submitted, routingTrace: trace, replayDecisions, responseProvenance, episodeRegistry,
    syntheticDeepeningAnswerAudit, syntheticRespondentControls,
    missingness: state.routerResult.missingness, sequenceGraph: state.routerResult.sequenceEdges, finalTargetResolutions: state.routerResult.targets, contextDecisions, referentRoleBindings,
    fictionalControlHistory: { declaredMappingControls: history.mappingControls ?? [], runtimeControls: state.controls, runtimeMissingness: state.routerResult.missingness },
    unreachedOriginalAnswers, ...(divergence ? { firstDivergence: divergence } : {}), mappingComplete, deepeningStarted, deepeningComplete, semanticCore, packets };
}
