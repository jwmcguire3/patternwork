import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../lib/server/assessment/pwqe51-router.ts";
import { createPwqe51SessionState, startPwqe51Deepening } from "../../lib/server/assessment/pwqe51-session.ts";
import { resolvePwqe51PassTwoContext } from "../../lib/server/assessment/service.ts";
import { sha256 } from "../../lib/server/security/crypto.ts";

const sourcePromise = loadPwqe51SourcePackage();
const root = (responseId: string, questionId: string, optionId: string, occurrenceId: string, extra: Partial<Pwqe51CanonicalResponse> = {}): Pwqe51CanonicalResponse => ({
  responseId, questionId, occurrenceId, selectedOptionIds: [optionId], basis: "actual_recalled", ...extra,
});

test("binding outcomes preserve uncertainty and only confirmed different occasions create distinct pairs", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const responses = [
    root("review-root-a", "M02", "M02.rehearse", "review-a"),
    root("review-root-b", "M02", "M02.rehearse", "review-b"),
    root("review-root-c", "M02", "M02.rehearse", "review-c"),
  ];
  const mappingFinished = {
    ...initial,
    phase: "finished" as const,
    responses,
    routerResult: { ...compilePwqe51Route({ phase: "mapping", responses }, source), phase: "finished" as const },
  };
  assert.throws(() => startPwqe51Deepening(initial, [], source), /Mapping must finish before Deepening starts/u);
  const sessionId = "binding-control-qualification";
  const ref = (id: string) => `focus_${sha256(`${sessionId}:${id}`).slice(0, 20)}`;
  const passTwoContext = resolvePwqe51PassTwoContext(sessionId, mappingFinished, {
    comparisonDecisions: [
      { firstRef: ref("review-a"), secondRef: ref("review-b"), relation: "different" },
      { firstRef: ref("review-a"), secondRef: ref("review-c"), relation: "same" },
      { firstRef: ref("review-b"), secondRef: ref("review-c"), relation: "cannot_tell" },
    ],
  });
  assert.deepEqual(passTwoContext.distinctPairs, [["review-a", "review-b"]]);
  const deepening = startPwqe51Deepening(mappingFinished, [], source, passTwoContext);
  assert.deepEqual(deepening.routerInput.distinctPairs, [["review-a", "review-b"]]);
  assert.deepEqual(deepening.comparisonDecisions?.map((decision) => decision.relation), ["different", "same", "cannot_tell"]);
});

test("closed binding outcomes map to distinct target states without manufacturing evidence", async () => {
  const source = await sourcePromise;
  const expected = new Map([
    ["skip", "declined"], ["no_event", "unavailable"], ["same", "resolved_descriptively"], ["unknown", "unresolved"],
  ]);
  for (const [outcome, state] of expected) {
    const episodeId = `binding-${outcome}`;
    const targetId = `recurrence:${episodeId}:first`;
    const result = compilePwqe51Route({ phase: "deepening", responses: [
      root(`root-${outcome}`, "M02", "M02.rehearse", episodeId),
    ], requestedTargetIds: [targetId], closedBindings: { [targetId]: outcome as "skip" | "no_event" | "same" | "unknown" } }, source);
    const target = result.targets.find((row) => row.targetId === "recurrence" && row.occurrenceId === episodeId);
    assert.equal(target?.state, state, `${outcome} must keep its own closure meaning`);
    assert.deepEqual(target?.resolutionObservationIds, [], `${outcome} is a control result, not evidence`);
  }
});

test("substantive budgets count selected decision cost, while corrections and stop controls remain available", async () => {
  const source = await sourcePromise;
  const twoPulls = root("two-pulls", "M26", "M26.finish", "two-pulls", { mode: "simultaneous", selectedOptionIds: ["M26.finish", "M26.contact"] });
  const extraSelection = compilePwqe51Route({ phase: "deepening", responses: [twoPulls] }, source);
  assert.equal(extraSelection.administrationCount, 1);
  assert.equal(extraSelection.decisionCount, 3, "an optional simultaneous pair consumes two extra decisions");

  const rootResponse = root("root-original", "M01", "M01.rest", "rest");
  const correction = compilePwqe51Route({ phase: "deepening", responses: [
    rootResponse,
    root("root-correction", "M01", "M01.tasks", "rest", { supersedesResponseId: "root-original" }),
  ] }, source);
  assert.equal(correction.administrationCount, 1);
  assert.equal(correction.decisionCount, 1, "a correction does not consume the remaining substantive budget");

  const stopped = compilePwqe51Route({ phase: "deepening", controls: ["end", "shorten"], responses: [twoPulls] }, source);
  assert.equal(stopped.decisionCount, 3, "user controls are separate from substantive decisions");
  assert.equal(stopped.phase, "finished");
  assert.equal(stopped.completionReason, "user_end");

  const budgetStopped = compilePwqe51Route({ phase: "deepening", decisionLimit: 2, responses: [twoPulls] }, source);
  assert.equal(budgetStopped.phase, "finished");
  assert.equal(budgetStopped.completionReason, "administration_or_decision_limit");
});

test("correction invalidates a dependent question after its authored parent gate changes", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ responses: [
    root("wants-original", "M26", "M26.finish", "wants"),
    { responseId: "sequential-child", questionId: "M27", occurrenceId: "wants", selectedOptionIds: ["M27.first"] },
    root("wants-correction", "M26", "M26.sequential", "wants", { supersedesResponseId: "wants-original" }),
  ] }, source);
  assert.deepEqual(result.supersededResponseIds, ["wants-original"]);
  assert.ok(result.invalidatedResponses.some((row) => row.responseId === "sequential-child"
    && row.reason === "authored_gate_changed_after_correction"));
  assert.ok(!result.observations.some((row) => row.responseId === "sequential-child"));
});

test("candidate rejection diagnostics distinguish permission and actual-episode gates", async () => {
  const source = await sourcePromise;
  const noPermission = compilePwqe51Route({ phase: "deepening", responses: [
    root("root", "M01", "M01.rest", "actual-rest"),
  ] }, source);
  assert.ok(noPermission.rejectedCandidates.some((row) => row.questionId === "D41" && row.reason === "topic_not_opted_in"));

  const typicalOnly = compilePwqe51Route({ phase: "deepening", optedInTopics: ["body_detail"], responses: [
    { responseId: "typical-root", questionId: "M01", occurrenceId: "typical-rest", selectedOptionIds: ["M01.rest"], basis: "reported_typicality" },
  ] }, source);
  assert.ok(typicalOnly.rejectedCandidates.some((row) => row.questionId === "D41" && row.reason === "requires_existing_actual_episode"));

  const wrongEpisodeFamily = compilePwqe51Route({ phase: "deepening", requestedTargetIds: ["vulnerable_meaning:help-episode:first"], responses: [
    root("help-root", "M20", "M20.small", "help-episode"),
  ] }, source);
  assert.ok(wrongEpisodeFamily.rejectedCandidates.some((row) => row.questionId === "D22"
    && row.reason === "requires_its_own_actual_episode_not_same_topic"),
  "the episode-family gate must explain why a same-topic parent gap cannot be answered in this occasion");
});

test("shorten suppresses tier-six optional bodily texture without changing answer history", async () => {
  const source = await sourcePromise;
  const base = {
    phase: "deepening" as const,
    optedInTopics: ["body_detail"],
    responses: [root("actual-root", "M01", "M01.rest", "actual-rest")],
  };
  const full = compilePwqe51Route(base, source);
  assert.ok(full.candidates.some((row) => row.questionId === "D41" && row.priority === 6));
  const shortened = compilePwqe51Route({ ...base, controls: ["shorten"] }, source);
  assert.ok(!shortened.candidates.some((row) => row.questionId === "D41"));
  assert.deepEqual(shortened.observations, full.observations);
});
