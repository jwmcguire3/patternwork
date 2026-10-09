import type { Pwqe51RouteCandidate } from "../../assessment/pwqe51-router.ts";
import type { Pwqe51SessionState } from "../../assessment/pwqe51-session.ts";
import type { Pwqe51SourcePackage } from "../../../question-engine/pwqe51-source.ts";

export type FictionalRespondentProvenance =
  | "original_authored_fictional_response"
  | "new_synthetic_deepening_answer"
  | "new_fictional_control_outcome";

export interface FictionalRespondentResponse {
  readonly responseId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId?: string;
  readonly selectedOptionIds?: readonly string[];
  readonly status?: "answered" | "none_fit" | "not_sure" | "no_event" | "not_applicable" | "skip";
  readonly mode?: "single" | "simultaneous" | "ordered" | "order_unknown";
  readonly provenance?: string;
  readonly sourceRef?: string;
  readonly basis?: "actual_recalled" | "reported_typicality";
  readonly replayOfOccurrenceId?: string;
}

export interface FictionalRespondentFact {
  readonly responseId: string;
  readonly questionId: string;
  readonly occurrenceId: string;
  readonly stepId?: string;
  readonly selectedOptionIds?: readonly string[];
  readonly status: string;
  readonly evidenceKind?: "mapping_response" | "accepted_deepening_response" | "authored_source_constraint" | "episode_context";
  readonly contextRelation?: "linked_occurrence";
}

export interface FictionalDeepeningAnswerAudit {
  readonly profileId: string;
  readonly sourceQuestionId: string;
  readonly selectedOptionIds: readonly string[];
  readonly status: string;
  readonly selectionMode: string;
  readonly occurrenceReference: string;
  readonly serverOccurrenceId: string;
  readonly step: string;
  readonly existingFictionalFacts: readonly FictionalRespondentFact[];
  readonly rationale: string;
  readonly scenarioRole: "necessary_to_establish_original_scenario" | "incidental_routing";
  readonly changesIntendedSemanticTest: boolean;
  readonly provenance: "new_synthetic_deepening_answer";
  readonly outcome: "answered" | "valid_missingness";
}

export interface FictionalRespondentHistory {
  readonly profile: { readonly id: string };
  readonly episodes?: readonly { readonly occurrenceId: string; readonly episodeFamily: string }[];
  readonly mappingResponses: readonly FictionalRespondentResponse[];
  readonly deepeningResponses: readonly FictionalRespondentResponse[];
  readonly originalAuthoredResponses?: readonly FictionalRespondentResponse[];
  readonly responseProvenance?: readonly { readonly responseId: string; readonly origin?: string }[];
  readonly intendedDeepeningContext?: {
    readonly optedInTopics?: readonly string[];
    readonly focusTopics?: readonly string[];
  };
  readonly topicPermissionEvents?: readonly { readonly topic: string; readonly outcome: string }[];
  readonly distinctnessIntents?: readonly {
    readonly sourceOccurrenceId: string;
    readonly otherOccurrenceId: string;
    readonly outcome: string;
    readonly reason?: string;
  }[];
}

export type FictionalRespondentControl =
  | {
    readonly kind: "topic_opt_in";
    readonly topic: string;
    readonly sourceResponseIds: readonly string[];
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  }
  | {
    readonly kind: "replay_binding";
    readonly sourceOccurrenceReference: string;
    readonly sourceOccurrenceId: string;
    readonly questionId: string;
    readonly bindingKey: string;
    readonly outcome: "different" | "same" | "unknown" | "no_event" | "skip";
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  }
  | {
    readonly kind: "shorten_deepening";
    readonly requiredSourceResponseIds: readonly string[];
    readonly nextQuestionId: string;
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  }
  | {
    readonly kind: "end_deepening_after_semantic_core";
    readonly requiredSourceResponseIds: readonly string[];
    readonly nextQuestionId: string;
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  }
  | {
    readonly kind: "forbidden_question_discrepancy";
    readonly questionId: string;
    readonly sourceResponseIds: readonly string[];
    readonly resolution: "respondent_skip";
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  }
  | {
    readonly kind: "source_contract_mismatch";
    readonly questionId: string;
    readonly variantId: string;
    readonly sourceResponseIds: readonly string[];
    readonly resolution: "respondent_skip";
    readonly rationale: string;
    readonly provenance: "new_fictional_control_outcome";
  };

export type FictionalRespondentDecision =
  | { readonly kind: "original_authored_response"; readonly response: FictionalRespondentResponse }
  | { readonly kind: "new_synthetic_deepening_answer"; readonly response: FictionalRespondentResponse; readonly audit: FictionalDeepeningAnswerAudit }
  | { readonly kind: "valid_missingness"; readonly response: FictionalRespondentResponse; readonly audit: FictionalDeepeningAnswerAudit }
  | { readonly kind: "unresolved"; readonly reason: string };

export interface FictionalRespondentContext {
  readonly candidate: Pwqe51RouteCandidate;
  readonly history: FictionalRespondentHistory;
  readonly state: Pwqe51SessionState;
  readonly questionSource: Pwqe51SourcePackage;
  readonly occurrenceReferenceToServerId: Readonly<Record<string, string>>;
  readonly acceptedSourceResponses: readonly FictionalRespondentFact[];
  readonly matchingOriginalResponses: readonly FictionalRespondentResponse[];
}

function sourceReferenceFor(serverOccurrenceId: string, occurrenceMap: Readonly<Record<string, string>>): string {
  return Object.entries(occurrenceMap).find(([, serverId]) => serverId === serverOccurrenceId)?.[0]
    ?? `server-occurrence:${serverOccurrenceId}`;
}

function currentOccurrenceFacts(context: FictionalRespondentContext, occurrenceReference: string): FictionalRespondentFact[] {
  const mappingFacts = context.acceptedSourceResponses
    .filter((fact) => fact.evidenceKind === "mapping_response" && fact.occurrenceId === context.candidate.occurrenceId);
  const accepted = context.acceptedSourceResponses
    .filter((fact) => fact.evidenceKind === "accepted_deepening_response" && fact.occurrenceId === context.candidate.occurrenceId);
  const constraints = context.history.deepeningResponses.filter((response) => response.occurrenceId === occurrenceReference
    && !context.acceptedSourceResponses.some((fact) => fact.responseId === response.responseId))
    .map((response) => ({ responseId: response.responseId, questionId: response.questionId, occurrenceId: response.occurrenceId,
      stepId: response.stepId, selectedOptionIds: response.selectedOptionIds ?? [], status: "source_constraint", evidenceKind: "authored_source_constraint" as const }));
  return [...new Map([...mappingFacts, ...accepted, ...constraints].map((fact) => [fact.responseId, fact])).values()];
}

function hasFact(facts: readonly FictionalRespondentFact[], questionId: string, optionId: string): boolean {
  return facts.some((fact) => fact.questionId === questionId && fact.status === "answered" && fact.selectedOptionIds?.includes(optionId));
}

function decisionForQuestion(context: FictionalRespondentContext, facts: readonly FictionalRespondentFact[]): {
  readonly optionId?: string;
  readonly missingnessStatus?: "not_sure" | "no_event" | "not_applicable" | "skip";
  readonly rationale: string;
  readonly scenarioRole?: FictionalDeepeningAnswerAudit["scenarioRole"];
  readonly changesIntendedSemanticTest?: boolean;
  readonly basis?: "actual_recalled" | "reported_typicality";
  readonly replayOfOccurrenceId?: string;
} | undefined {
  const { profile } = context.history;
  const questionId = context.candidate.questionId;

  if (questionId === "M20" && profile.id === "P08"
    && facts.some((fact) => fact.questionId === "episode_family" && fact.selectedOptionIds?.includes("disclosure"))) {
    return {
      missingnessStatus: "no_event",
      rationale: "The server-bound second occurrence is the authored disclosure occasion, not a help-request occasion. The respondent reports no help-request event there instead of transplanting the E1 help request or treating the separate disclosure as the same event.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }

  if (questionId === "D16" && hasFact(facts, "M21", "M21.burden")) {
    return {
      optionId: "D16.load",
      rationale: "The same occasion includes a small request and an explicit burden response at M21; load is the concrete real-world condition established by this fiction.",
    };
  }
  if (questionId === "D02" && hasFact(facts, "D15", "D15.prevent")) {
    return {
      optionId: "D02.prevent",
      rationale: "On this same mistake occasion, the authored D15 answer says the current conclusion is being used to prevent something; the M04 fix and M05/M06 consequence answers remain compatible with that stated aim.",
    };
  }
  if (questionId === "D02" && hasFact(facts, "M10", "M10.words") && hasFact(facts, "M11", "M11.quiet")) {
    return {
      optionId: "D02.none",
      rationale: "The same overload occasion records words becoming unavailable and a quiet response. The fictional respondent reports no deliberate aim for that response, preserving the involuntary words-stuck distinction.",
    };
  }
  if (questionId === "D02" && hasFact(facts, "M10", "M10.urgent") && hasFact(facts, "M11", "M11.reduce")) {
    return {
      optionId: "D02.practical",
      rationale: "The same overload occasion records urgency followed by an attempt to reduce it, with M12 reporting continued functioning. The practical aim is bounded to reducing immediate pressure and does not imply a physiological mechanism.",
    };
  }
  if (questionId === "D02" && hasFact(facts, "M11", "M11.reduce") && hasFact(facts, "M12", "M12.clear")) {
    return {
      optionId: "D02.practical",
      rationale: "The same overload occasion records an attempt to reduce pressure and clearer practical understanding afterward. The fictional respondent describes the aim as practical load reduction, without inferring a hidden motive.",
    };
  }
  if (questionId === "D02" && hasFact(facts, "M04", "M04.fix")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same mistake occasion records an attempted fix, but not what the respondent hoped the fix would change. The respondent does not infer an aim from the fact that they corrected something.",
    };
  }
  if (questionId === "D02") {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same-occasion facts establish behavior or context but not the respondent's aim. The fictional respondent does not infer motive from an action or outcome.",
    };
  }
  if (questionId === "M17" && context.candidate.replayOfOccurrenceId && ["P03", "C12"].includes(profile.id)) {
    const sourceReference = sourceReferenceFor(context.candidate.replayOfOccurrenceId, context.occurrenceReferenceToServerId);
    const replayReference = sourceReferenceFor(context.candidate.occurrenceId!, context.occurrenceReferenceToServerId);
    const intent = context.history.distinctnessIntents?.find((entry) => entry.outcome === "different"
      && entry.sourceOccurrenceId === sourceReference && entry.otherOccurrenceId === replayReference);
    const p03PracticalWait = profile.id === "P03" && hasFact(facts, "M16", "M16.practical");
    const c12KnownDelay = profile.id === "C12" && !!intent
      && intent.reason === "D42 asks about a different wait with a known reason for the same close person."
      && context.history.deepeningResponses.some((response) => response.questionId === "D42"
        && response.occurrenceId === replayReference && response.selectedOptionIds?.includes("D42.fine"));
    if (p03PracticalWait || c12KnownDelay) {
      return {
        optionId: "M17.wait",
        rationale: p03PracticalWait
          ? "The confirmed second occurrence is the authored practical-wait case, and its same-occasion Mapping response identifies practical stakes. The fictional respondent waited without changing course, preserving the difference from the relationship-uncertainty response."
          : "The server confirmed the authored linked-but-different known-delay occasion. Its existing binding identifies a separate wait with a known reason, and the original D42 response on this occurrence says it felt fine. The respondent waited without changing course, supplying only the first action needed to continue that actual second-wait branch.",
        scenarioRole: "necessary_to_establish_original_scenario",
        changesIntendedSemanticTest: false,
        basis: "actual_recalled",
        replayOfOccurrenceId: sourceReference,
      };
    }
  }
  if (questionId === "D57" && profile.id === "P01" && context.state.currentInteraction?.comparisonIds) {
    const pairHasExposure = context.state.currentInteraction.comparisonIds.every((occurrenceId) =>
      context.state.responses.some((response) => response.occurrenceId === occurrenceId && response.questionId === "M03"
        && response.selectedOptionIds?.includes("M03.exposure")));
    const authoredStoppingConditions = context.history.deepeningResponses.some((response) => response.questionId === "D04"
      && response.occurrenceId === "fx_P01_E1" && response.selectedOptionIds?.includes("D04.sign"))
      && context.history.deepeningResponses.some((response) => response.questionId === "D04"
        && response.occurrenceId === "fx_P01_E2" && response.selectedOptionIds?.includes("D04.choice"));
    if (pairHasExposure && authoredStoppingConditions) {
      return {
        optionId: "D57.same",
      rationale: "The confirmed comparison pair contains the same authored rehearsal/exposure response on both occasions. The source case also records sign-based stopping in E1 and a chosen stop with uncertainty remaining in E2, so the respondent can report the same preventive rehearsal job without merging the two stopping conditions.",
        scenarioRole: "necessary_to_establish_original_scenario",
        changesIntendedSemanticTest: false,
      };
    }
  }
  if (questionId === "D56" && profile.id === "P01" && context.state.currentInteraction?.comparisonIds) {
    const comparisonOccurrences = context.state.currentInteraction.comparisonIds;
    const signOccurrence = context.occurrenceReferenceToServerId["fx_P01_E1"];
    const choiceOccurrence = context.occurrenceReferenceToServerId["fx_P01_E2"];
    const hasChoiceStop = context.history.deepeningResponses.some((response) => response.questionId === "D04" && response.occurrenceId === "fx_P01_E2" && response.selectedOptionIds?.includes("D04.choice"))
      && !!choiceOccurrence && comparisonOccurrences.includes(choiceOccurrence);
    const hasSignStop = context.history.deepeningResponses.some((response) => response.questionId === "D04" && response.occurrenceId === "fx_P01_E1" && response.selectedOptionIds?.includes("D04.sign"))
      && !!signOccurrence && comparisonOccurrences.includes(signOccurrence);
    if (hasChoiceStop && hasSignStop) {
    return {
      optionId: "D56.power",
      rationale: "The two actual rehearsal occasions share the authored rehearsal and exposure facts, while D04 records sign-based stopping in one and a deliberate stop with uncertainty remaining in the other. The respondent identifies that choice difference without claiming different underlying motives.",
      scenarioRole: "necessary_to_establish_original_scenario",
      changesIntendedSemanticTest: false,
    };
    }
  }
  if (questionId === "D04" && hasFact(facts, "M02", "M02.rehearse") && hasFact(facts, "M03", "M03.exposure")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same occasion establishes rehearsal before an evaluation, but the Mapping answers do not state what let the rehearsal stop. The respondent cannot supply a stopping condition from those facts alone.",
    };
  }
  if (questionId === "D12" && facts.some((fact) => fact.questionId === "M26" && fact.status === "answered")
    && facts.some((fact) => fact.questionId === "M27" && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "M26 and M27 record two wants, but do not establish what happened between the pulls. The respondent does not infer a struggle, integration, or ordinary choice from the selected options alone.",
    };
  }
  if (questionId === "D50" && hasFact(facts, "M24", "M24.helped")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The Mapping fact records that the repair helped, but not what part of the attempt made it reach the respondent. That detail belongs to this synthetic repair side target and is not inferred.",
    };
  }
  if (questionId === "D100" && facts.some((fact) => ["M12", "M14", "D35", "D36"].includes(fact.questionId) && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same-occasion facts establish a later easing or a recovery change, but do not state how the respondent understood the situation after it. The fictional respondent leaves that comparison unknown instead of inferring a change in meaning from feeling or functioning differently.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D89" && hasFact(facts, "M17", "M17.wait")
    && facts.some((fact) => fact.questionId === "M18" && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The synthetic respondent cannot recall a particular expectation of themself during this incidental actual wait. M17 and M18 establish the wait and its context, but the response does not infer an expectation from waiting or the practical information sought.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D06" && hasFact(facts, "M04", "M04.fix")
    && hasFact(facts, "M05", "M05.learn") && hasFact(facts, "M06", "M06.clear")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same mistake occasion records an attempted fix, learning from it, and clearer understanding. It does not establish whether the fix had a later downside, so the respondent does not infer cost from the fact that the event was difficult or corrective.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D81" && hasFact(facts, "M24", "M24.helped")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same repair occasion is recorded as having helped, but the Mapping response says nothing about what another person could see or how the respondent felt inside. The respondent leaves that comparison unknown rather than inferring presentation from whether the repair helped.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D85" && facts.some((fact) => ["M12", "M14", "D35", "D36"].includes(fact.questionId) && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The current fiction records a recovery response, but it does not establish the relative timing of being able to function and feeling more settled. The respondent leaves that comparison unknown rather than infer an order from a different recovery detail.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D86" && facts.some((fact) => ["M14", "D35"].includes(fact.questionId) && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same-occasion facts establish that some easing or recovery was noticed, but do not describe a change in demands, information, support, or setting around it. The respondent leaves those conditions unknown rather than attributing the easing to an unstated circumstance.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D45" && profile.id === "C12" && context.candidate.linkedFrom) {
    const linkedReference = sourceReferenceFor(context.candidate.linkedFrom, context.occurrenceReferenceToServerId);
    const sourceAnswerOnLinkedWait = context.history.deepeningResponses.some((response) => response.questionId === "D45"
      && response.occurrenceId === linkedReference && response.selectedOptionIds?.includes("D45.return"));
    if (sourceAnswerOnLinkedWait) {
      return {
        missingnessStatus: "not_sure",
        rationale: "The original D45.return answer is bound to the reply-wait occurrence, while the router has issued D45 on a separate linked reassurance occurrence. The respondent does not transplant that answer or invent what happened after this differently bound conversation.",
        scenarioRole: "incidental_routing",
        changesIntendedSemanticTest: false,
      };
    }
  }
  if (questionId === "D07" && hasFact(facts, "M10", "M10.words") && hasFact(facts, "M11", "M11.quiet")) {
    return {
      optionId: "D07.quiet",
      rationale: "On the same overload occasion, M11 records becoming quiet after the words-stuck response. The fictional answer preserves that actual sequence without adding a reason for it.",
    };
  }
  if (questionId === "D39" && context.candidate.stage === "deepening"
    && context.questionSource.questionBank.items.find((item) => item.id === questionId)?.episode_family === "help_missed"
    && !facts.some((fact) => fact.questionId === "M20" || fact.questionId === "M22")) {
    return {
      missingnessStatus: "no_event",
      rationale: "No failed-help occasion is present in this fictional history. The respondent reports no event rather than inventing a second, unrelated experience.",
    };
  }
  if (questionId === "D20" && profile.id === "P08" && hasFact(facts, "D21", "D21.visible") && hasFact(facts, "M20", "M20.small")) {
    return {
      optionId: "D20.none",
      rationale: "The same help-request case says that visibility was hard and that the request stayed small. The respondent could still acknowledge the need privately, preserving the distinction between internal permission and showing need to another person.",
      scenarioRole: "necessary_to_establish_original_scenario",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D20" && profile.id === "P08" && hasFact(facts, "D47", "D47.light")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The disclosure answer records how the fictional respondent spoke, but does not establish which private acknowledgment was hardest. The respondent leaves self-admission unknown rather than inferring an internal motive from downplaying.",
      scenarioRole: "incidental_routing",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D17" && hasFact(facts, "M20", "M20.small") && hasFact(facts, "M21", "M21.burden")) {
    return {
      optionId: "D17.help",
      rationale: "The same help-request occasion records a deliberately small request alongside burden. The respondent says they wanted help with what they were carrying, while the separate D21/D18 answers retain the visibility and need distinctions.",
    };
  }
  if (questionId === "D69" && profile.id === "P08" && hasFact(facts, "M20", "M20.small")
    && hasFact(facts, "M21", "M21.burden") && hasFact(facts, "D21", "D21.visible")) {
    return {
      optionId: "D69.hidden_only",
      rationale: "The same help-request occasion records a small request and burden, and the authored D21 response says visibility was hardest. The fictional respondent adds that the need remained known internally while less of it was shown; this supports the existing visibility distinction without changing its discrimination target.",
      scenarioRole: "necessary_to_establish_original_scenario",
      changesIntendedSemanticTest: false,
    };
  }
  if (questionId === "D38" && facts.some((fact) => fact.questionId === "M22" && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same receiving-help occasion records how receiving help felt, but does not describe what the other person did. The fictional respondent does not add an unrecorded support behavior.",
    };
  }
  if (questionId === "D91" && facts.some((fact) => fact.questionId === "M20" && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same-occasion Mapping facts record a request, but not the other person's response. The fictional respondent does not invent what that person did.",
    };
  }
  if (questionId === "D92" && facts.some((fact) => fact.questionId === "M20" && fact.status === "answered")
    && !facts.some((fact) => fact.questionId === "D91" && fact.status === "answered")) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The request's response was not established, so this fiction cannot establish what happened to the remaining need afterward.",
    };
  }
  if (questionId === "D65") {
    return {
      missingnessStatus: "not_sure",
      rationale: "The established same-occasion facts describe the event and its practical response, but do not establish how the respondent related to their own reaction. The fictional respondent cannot identify that detail for this incidental follow-up.",
    };
  }
  if (questionId === "D16") {
    return {
      missingnessStatus: "not_sure",
      rationale: "The same-occasion Mapping facts establish rehearsal or exposure, but no specific real-world condition among consequence, reliability, safety, load, or low capacity. The respondent does not infer a condition from the rehearsal itself.",
    };
  }
  if (questionId === "D23" && profile.id === "C06") {
    return {
      missingnessStatus: "not_sure",
      rationale: "The two-pulls answers establish competing concerns and room to choose, but do not establish a separate moment of noticing a feeling without acting. The respondent cannot report that experience from this episode.",
    };
  }
  if (["D05", "D18", "D35", "D41", "D78", "D82", "D04", "D07", "D08", "D11", "D56", "D57", "D77", "D80", "M18"].includes(questionId)) {
    return {
      missingnessStatus: "not_sure",
      rationale: "The current same-occasion facts do not establish the detail this follow-up asks for. The respondent leaves it unknown instead of adding an unrecorded feeling, action, comparison, or continuity claim.",
    };
  }
  return undefined;
}

/**
 * Selects only after the production router has issued `candidate`. Original
 * answers are passed in only after exact question, step, variant, occurrence,
 * replay-parent, and comparison binding checks have succeeded.
 */
export function decideFictionalRespondent(context: FictionalRespondentContext): FictionalRespondentDecision {
  const original = context.matchingOriginalResponses[0];
  if (original) return { kind: "original_authored_response", response: original };

  const current = context.state.currentInteraction;
  if (!current || current.questionId !== context.candidate.questionId || current.stepId !== context.candidate.stepId
    || current.occurrenceId !== context.candidate.occurrenceId) {
    return { kind: "unresolved", reason: "The respondent policy was not given the current router-issued interaction." };
  }
  const occurrenceReference = sourceReferenceFor(context.candidate.occurrenceId, context.occurrenceReferenceToServerId);
  const facts = currentOccurrenceFacts(context, occurrenceReference);
  const episodeFamily = context.history.episodes?.find((episode) => episode.occurrenceId === occurrenceReference)?.episodeFamily;
  if (episodeFamily) facts.push({ responseId: `source-episode:${occurrenceReference}`, questionId: "episode_family", occurrenceId: occurrenceReference,
    selectedOptionIds: [episodeFamily], status: "source_context", evidenceKind: "episode_context" });
  const planned = decisionForQuestion(context, facts);
  if (!planned) return { kind: "unresolved", reason: `No source-bound fictional respondent rule covers ${context.candidate.questionId}/${context.candidate.stepId} in ${occurrenceReference}.` };

  const question = context.questionSource.questionBank.items.find((item) => item.id === context.candidate.questionId);
  if (!question) return { kind: "unresolved", reason: `Question ${context.candidate.questionId} is absent from the pinned source.` };
  const variant = context.candidate.variantId
    ? context.questionSource.questionBank.variants.find((entry) => entry.id === context.candidate.variantId && entry.replaces === question.id)
    : undefined;
  if (context.candidate.variantId && !variant) {
    return { kind: "unresolved", reason: `Variant ${context.candidate.variantId} is absent from the pinned source for ${question.id}.` };
  }
  const options = variant?.options ?? question.options;
  if (planned.optionId && !options.some((option) => option.id === planned.optionId)) {
    return { kind: "unresolved", reason: `Policy option ${planned.optionId} is not an exact option in ${context.candidate.questionId}.` };
  }
  if (planned.missingnessStatus && !question.response_controls.some((control) => control === planned.missingnessStatus)) {
    return { kind: "unresolved", reason: `Question ${context.candidate.questionId} does not support ${planned.missingnessStatus}.` };
  }

  const responseId = `${context.history.profile.id}-SYN-D-${context.candidate.questionId}-${context.candidate.stepId}-${context.state.responses.length + 1}`;
  const authoredSelectionMode = question.selection.mode;
  const mode = authoredSelectionMode === "partial_order" ? "ordered" : authoredSelectionMode === "simultaneous" ? "simultaneous" : "single";
  const maxSelect = (question.selection as { readonly max_select?: unknown }).max_select;
  if (planned.optionId && (mode !== (authoredSelectionMode === "partial_order" ? "ordered"
    : authoredSelectionMode === "simultaneous" ? "simultaneous" : "single")
    || (typeof maxSelect === "number" && maxSelect < 1))) {
    return { kind: "unresolved", reason: `Policy selection mode or cardinality does not satisfy the current ${context.candidate.questionId} interaction.` };
  }
  const response: FictionalRespondentResponse = {
    responseId,
    questionId: context.candidate.questionId,
    occurrenceId: occurrenceReference,
    stepId: context.candidate.stepId,
    selectedOptionIds: planned.optionId ? [planned.optionId] : [],
    status: planned.optionId ? "answered" : planned.missingnessStatus!,
    mode,
    ...(planned.basis ? { basis: planned.basis } : {}),
    ...(planned.replayOfOccurrenceId ? { replayOfOccurrenceId: planned.replayOfOccurrenceId } : {}),
    provenance: "new_synthetic_deepening_answer",
    sourceRef: `router-issued:${context.candidate.questionId}/${context.candidate.stepId};occurrence:${occurrenceReference}`,
  };
  const audit: FictionalDeepeningAnswerAudit = {
    profileId: context.history.profile.id,
    sourceQuestionId: response.questionId,
    selectedOptionIds: planned.optionId ? [planned.optionId] : [],
    status: response.status ?? "answered",
    selectionMode: response.mode ?? "single",
    occurrenceReference,
    serverOccurrenceId: context.candidate.occurrenceId,
    step: context.candidate.stepId,
    existingFictionalFacts: [
      ...facts,
      ...(context.candidate.linkedFrom ? context.acceptedSourceResponses
        .filter((fact) => fact.occurrenceId === context.candidate.linkedFrom)
        .map((fact) => ({ ...fact, contextRelation: "linked_occurrence" as const })) : []),
      ...(context.candidate.linkedFrom ? context.history.deepeningResponses.filter((answer) =>
        answer.occurrenceId === sourceReferenceFor(context.candidate.linkedFrom!, context.occurrenceReferenceToServerId)
        && !context.acceptedSourceResponses.some((fact) => fact.responseId === answer.responseId))
        .map((answer) => ({ responseId: answer.responseId, questionId: answer.questionId, occurrenceId: answer.occurrenceId,
          stepId: answer.stepId, selectedOptionIds: answer.selectedOptionIds ?? [], status: answer.status ?? "answered",
          evidenceKind: "authored_source_constraint" as const, contextRelation: "linked_occurrence" as const })) : []),
    ],
    rationale: planned.rationale,
    scenarioRole: planned.scenarioRole ?? "incidental_routing",
    changesIntendedSemanticTest: planned.changesIntendedSemanticTest ?? false,
    provenance: "new_synthetic_deepening_answer",
    outcome: planned.optionId ? "answered" : "valid_missingness",
  };
  return planned.optionId
    ? { kind: "new_synthetic_deepening_answer", response, audit }
    : { kind: "valid_missingness", response, audit };
}

/** Synthetic opt-in remains distinct from focus and never creates an episode. */
export function fictionalRespondentTopicControls(history: FictionalRespondentHistory): readonly FictionalRespondentControl[] {
  const controls: FictionalRespondentControl[] = [];
  const optedInTopics = new Set([
    ...(history.intendedDeepeningContext?.optedInTopics ?? []),
    ...(history.topicPermissionEvents ?? []).filter((event) => event.outcome === "opt_in").map((event) => event.topic),
  ]);
  const disclosureAnswers = history.deepeningResponses.filter((response) => response.questionId === "D47");
  if (history.profile.id === "P08" && disclosureAnswers.length > 0 && !optedInTopics.has("disclosure")) {
    controls.push({
      kind: "topic_opt_in",
      topic: "disclosure",
      sourceResponseIds: disclosureAnswers.map((response) => response.responseId),
      rationale: "The fictional history contains a separately authored disclosure scenario and D47 response. The simulated respondent grants the supported disclosure-topic permission; the router must issue D47 to establish its actual occurrence, and no focus occurrence or episode is fabricated.",
      provenance: "new_fictional_control_outcome",
    });
  }
  const conflictAnswerIds = history.deepeningResponses
    .filter((response) => response.questionId === "D61")
    .map((response) => response.responseId);
  if (conflictAnswerIds.length > 0 && !optedInTopics.has("conflict")
    && ["P02", "P06", "P09"].includes(history.profile.id)) {
    controls.push({
      kind: "topic_opt_in",
      topic: "conflict",
      sourceResponseIds: conflictAnswerIds,
      rationale: "This fictional history contains an authored disagreement and D61 response. The simulated respondent grants the supported conflict-topic permission so the existing entry contract can ask D61; no focus occurrence or episode is fabricated.",
      provenance: "new_fictional_control_outcome",
    });
  }
  return controls;
}
