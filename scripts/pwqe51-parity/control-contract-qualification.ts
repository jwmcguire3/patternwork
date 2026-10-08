import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../lib/server/assessment/pwqe51-router.ts";
import {
  canCompletePwqe51Pass,
  advancePwqe51Session,
  createPwqe51SessionState,
  endPwqe51Session,
  startPwqe51Deepening,
} from "../../lib/server/assessment/pwqe51-session.ts";

interface ControlCase {
  readonly id: string;
  readonly passed: boolean;
  readonly expected: unknown;
  readonly observed: unknown;
}

const root = (responseId: string, questionId: string, optionId: string, occurrenceId: string, extra: Partial<Pwqe51CanonicalResponse> = {}): Pwqe51CanonicalResponse => ({
  responseId, questionId, occurrenceId, selectedOptionIds: [optionId], basis: "actual_recalled", ...extra,
});

export async function runPwqe51ControlContractQualification(workspaceRoot?: string) {
  const source = await loadPwqe51SourcePackage(workspaceRoot);
  const cases: ControlCase[] = [];

  const bindingStates = new Map([
    ["skip", "declined"], ["no_event", "unavailable"], ["same", "resolved_descriptively"], ["unknown", "unresolved"],
  ]);
  const bindingObserved = [...bindingStates].map(([outcome, expectedState]) => {
    const occurrenceId = `contract-bind-${outcome}`;
    const targetId = `recurrence:${occurrenceId}:first`;
    const result = compilePwqe51Route({ phase: "deepening", responses: [
      root(`bind-root-${outcome}`, "M02", "M02.rehearse", occurrenceId),
    ], requestedTargetIds: [targetId], closedBindings: { [targetId]: outcome as "skip" | "no_event" | "same" | "unknown" } }, source);
    const target = result.targets.find((row) => row.targetId === "recurrence" && row.occurrenceId === occurrenceId);
    return { outcome, expectedState, state: target?.state, resolutionObservationIds: target?.resolutionObservationIds };
  });
  cases.push({ id: "bind-outcomes-preserve-distinct-closure-meaning", expected: [...bindingStates].map(([outcome, state]) => ({ outcome, state, resolutionObservationIds: [] })), observed: bindingObserved,
    passed: bindingObserved.every((row) => row.state === row.expectedState && row.resolutionObservationIds?.length === 0) });

  const initial = createPwqe51SessionState(source);
  let prematureRejected = false;
  try { startPwqe51Deepening(initial, [], source); } catch (error) {
    prematureRejected = error instanceof Error && /Mapping must finish before Deepening starts/u.test(error.message);
  }
  const answeredMapping = advancePwqe51Session(initial, {
    responseId: "contract-mapping-root", completionState: "COMPLETED", selectedOptionIds: ["M01.rest"], basis: "actual_recalled",
  }, source);
  const mappingReady = endPwqe51Session(answeredMapping, source);
  const acceptedCompletion = canCompletePwqe51Pass(mappingReady);
  const deepening = startPwqe51Deepening(mappingReady, ["body_detail"], source);
  cases.push({ id: "mapping-ready-requires-completed-pass-and-allows-deepening", expected: { prematureStartRejected: true, completionAccepted: true, nextPass: 2, phase: "deepening", nextQuestion: "D41" },
    observed: { prematureStartRejected: prematureRejected, completionAccepted: acceptedCompletion, nextPass: deepening.pass, phase: deepening.phase, nextQuestion: deepening.currentInteraction?.questionId },
    passed: prematureRejected && acceptedCompletion && deepening.pass === 2 && deepening.phase === "deepening" && deepening.currentInteraction?.questionId === "D41" });

  const nonPartialRoots = source.questionBank.items.filter((question) => question.stage === "deepening"
    && question.id !== "M02" && question.eligibility.requires_answered.length === 0 && question.eligibility.topic_opt_in === null
    && question.selection.mode !== "partial_order"
    && !["D03", "D05", "D19", "D44", "D48", "D89", "D90", "D99", "M09"].includes(question.id)
    && question.options.length > 0).slice(0, 30);
  const replayPair = ["contract-replay-first", "contract-replay-second"] as const;
  const ceiling56 = compilePwqe51Route({ phase: "deepening", responses: [
    ...Array.from({ length: 24 }, (_, index) => root(`contract-map-${index}`, "M01", "M01.rest", `contract-map-episode-${index}`)),
    ...nonPartialRoots.map((question, index) => root(`contract-deep-${index}`, question.id, question.options[0]!.id, `contract-deep-episode-${index}`)),
    root("contract-replay-original", "M02", "M02.rehearse", replayPair[0]),
    root("contract-replay-confirmed", "M02", "M02.rehearse", replayPair[1], { replayOfOccurrenceId: replayPair[0], targetIds: [`recurrence:${replayPair[0]}:first`] }),
  ], distinctPairs: [[...replayPair]], episodeLinks: [{ occurrenceId: replayPair[1], linkedFrom: replayPair[0] }] }, source);
  const pairQuestions = source.questionBank.items.filter((question) => question.stage === "deepening"
    && question.eligibility.requires_answered.length === 0 && question.eligibility.topic_opt_in === null
    && !["D03", "D05", "D19", "D44", "D48", "D89", "D90", "D99", "M09"].includes(question.id)
    && question.selection.allow_simultaneous_pair === true
    && question.options.filter((option) => !option.exclusive).length >= 2).slice(0, 24);
  const ceiling72 = compilePwqe51Route({ phase: "deepening", responses: pairQuestions.map((question, index) => {
    const choices = question.options.filter((option) => !option.exclusive).slice(0, 2);
    return root(`contract-pair-${index}`, question.id, choices[0]!.id, `contract-pair-episode-${index}`, {
      selectedOptionIds: [choices[0]!.id, choices[1]!.id], mode: "simultaneous",
    });
  }) }, source);
  const textureAnswers = [
    { questionId: "D59", optionId: "D59.finished", targetId: "after_stop" },
    { questionId: "D29", optionId: "D29.narrow", targetId: "attention" },
    { questionId: "D06", optionId: "D06.energy", targetId: "cost" },
  ] as const;
  const textureResponses = (count: number) => [
    ...textureAnswers.slice(0, count).map(({ questionId, optionId, targetId }, index) => root(`contract-texture-${index}`, questionId, optionId,
      `contract-texture-episode-${index}`, { targetIds: [`${targetId}:contract-texture-episode-${index}:first`] })),
    root("contract-texture-body-root", "M01", "M01.rest", "contract-texture-body-root"),
  ];
  const textureBelowAllowance = compilePwqe51Route({ phase: "deepening", optedInTopics: ["body_detail"], responses: textureResponses(2) }, source);
  const textureAtAllowance = compilePwqe51Route({ phase: "deepening", optedInTopics: ["body_detail"], responses: textureResponses(3) }, source);
  const expectedBudget = { at56: { administrationCount: 56, decisionCount: 56, phase: "finished", completionReason: "administration_or_decision_limit" },
    at72: { administrationCount: 24, decisionCount: 72, phase: "finished", completionReason: "administration_or_decision_limit" },
    texture: { belowAllowance: 2, belowAllowancePhase: "deepening", atAllowance: 3, atAllowancePhase: "finished", stopReason: "remaining_targets_only_low_incremental_value" } };
  const observedBudget = { at56: { administrationCount: ceiling56.administrationCount, decisionCount: ceiling56.decisionCount, phase: ceiling56.phase, completionReason: ceiling56.completionReason },
    at72: { administrationCount: ceiling72.administrationCount, decisionCount: ceiling72.decisionCount, phase: ceiling72.phase, completionReason: ceiling72.completionReason },
    texture: { belowAllowance: textureBelowAllowance.scopeTextureAdministrationCount, belowAllowancePhase: textureBelowAllowance.phase,
      atAllowance: textureAtAllowance.scopeTextureAdministrationCount, atAllowancePhase: textureAtAllowance.phase, stopReason: textureAtAllowance.completionReason } };
  const budgetsPassed = nonPartialRoots.length === 30 && pairQuestions.length === 24
    && ceiling56.next === null && ceiling56.candidates.length === 0
    && ceiling72.next === null && ceiling72.candidates.length === 0
    && textureBelowAllowance.candidates.some((candidate) => candidate.questionId === "D41" && candidate.priority >= 5)
    && textureAtAllowance.next === null && textureAtAllowance.candidates.length === 0;
  cases.push({ id: "stopping-budgets-cover-56-72-and-separate-texture-allowance", expected: expectedBudget, observed: observedBudget, passed: budgetsPassed });

  const correction = compilePwqe51Route({ responses: [
    root("contract-wants-original", "M26", "M26.finish", "contract-wants"),
    { responseId: "contract-sequential-child", questionId: "M27", occurrenceId: "contract-wants", selectedOptionIds: ["M27.first"] },
    root("contract-wants-correction", "M26", "M26.sequential", "contract-wants", { supersedesResponseId: "contract-wants-original" }),
  ] }, source);
  const childInvalidation = correction.invalidatedResponses.find((row) => row.responseId === "contract-sequential-child");
  cases.push({ id: "dependency-correction-invalidates-only-withdrawn-support", expected: { superseded: ["contract-wants-original"], childInvalidation: "authored_gate_changed_after_correction" },
    observed: { superseded: correction.supersededResponseIds, childInvalidation: childInvalidation?.reason },
    passed: correction.supersededResponseIds.includes("contract-wants-original") && childInvalidation?.reason === "authored_gate_changed_after_correction"
      && !correction.observations.some((row) => row.responseId === "contract-sequential-child") });

  const noPermission = compilePwqe51Route({ phase: "deepening", responses: [root("contract-no-permission", "M01", "M01.rest", "contract-no-permission-episode")] }, source);
  const typicalOnly = compilePwqe51Route({ phase: "deepening", optedInTopics: ["body_detail"], responses: [
    { responseId: "contract-typical-root", questionId: "M01", occurrenceId: "contract-typical-episode", selectedOptionIds: ["M01.rest"], basis: "reported_typicality" },
  ] }, source);
  const rejectionReasons = {
    topic_not_opted_in: noPermission.rejectedCandidates.find((row) => row.questionId === "D41")?.reason,
    requires_existing_actual_episode: typicalOnly.rejectedCandidates.find((row) => row.questionId === "D41")?.reason,
  };
  cases.push({ id: "candidate-rejection-reasons-preserve-permission-and-basis", expected: { topic_not_opted_in: "topic_not_opted_in", requires_existing_actual_episode: "requires_existing_actual_episode" },
    observed: rejectionReasons, passed: rejectionReasons.topic_not_opted_in === "topic_not_opted_in"
      && rejectionReasons.requires_existing_actual_episode === "requires_existing_actual_episode" });

  return {
    status: cases.every((item) => item.passed) ? "passed" as const : "failed" as const,
    sourceBinding: source.manifest.source_binding,
    sourceManifestSha256: source.sourceManifestSha256,
    caseCount: cases.length,
    passedCaseCount: cases.filter((item) => item.passed).length,
    cases,
    classification: "independent contract-based qualification; not Python/TypeScript cross-engine parity",
  };
}
