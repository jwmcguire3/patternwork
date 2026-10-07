import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../lib/server/assessment/pwqe51-router.ts";

const sourcePromise = loadPwqe51SourcePackage();
function answer(responseId: string, questionId: string, optionId: string, occurrenceId = "E1", stepId?: string, extra: Partial<Pwqe51CanonicalResponse> = {}): Pwqe51CanonicalResponse {
  return { responseId, questionId, occurrenceId, ...(stepId ? { stepId } : {}), selectedOptionIds: [optionId], ...extra };
}

test("root responses require explicit basis and typicality never becomes an actual episode", async () => {
  const source = await sourcePromise;
  assert.throws(() => compilePwqe51Route({ responses: [answer("root-no-basis", "M01", "M01.rest")] }, source), /explicit actual_recalled or reported_typicality basis/u);
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M01", "M01.rest", "T1", undefined, { basis: "reported_typicality" }),
  ] }, source);
  assert.equal(result.episodes[0]?.actual, false);
  assert.equal(result.episodes[0]?.basis, "reported_typicality");
  assert.ok(!result.targets.some((target) => target.targetId === "coverage_self_stance"));
  assert.ok(!result.candidates.some((candidate) => candidate.questionId === "D65"));
});

test("a server-bound Mapping root is offered before its answer establishes episode basis", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ responses: [], occurrenceBindings: { "coverage:M01": "new-episode" } }, source);
  assert.equal(result.next?.questionId, "M01");
  assert.equal(result.next?.occurrenceId, "new-episode");
  assert.equal(result.next?.stage, "mapping");
});

test("opted-in Deepening roots are offered before basis exists, then enforce actual-basis and topic gates", async () => {
  const source = await sourcePromise;
  const cases = [
    { topic: "self_expression", questionId: "D72", optionId: "D72.pride", childId: "D73", occurrenceId: "self-expression-episode" },
    { topic: "exploration", questionId: "D97", optionId: "D97.encourage", childId: "D98", occurrenceId: "exploration-episode" },
  ] as const;

  for (const item of cases) {
    const bindingKey = `entry:${item.topic}`;
    const beforeAnswer = compilePwqe51Route({
      phase: "deepening",
      optedInTopics: [item.topic],
      occurrenceBindings: { [bindingKey]: item.occurrenceId },
      responses: [],
    }, source);
    assert.ok(beforeAnswer.candidates.some((candidate) => candidate.questionId === item.questionId && candidate.occurrenceId === item.occurrenceId));

    for (const optedInTopics of [[], ["another_topic"]]) {
      const notOptedIn = compilePwqe51Route({
        phase: "deepening",
        optedInTopics,
        occurrenceBindings: { [bindingKey]: item.occurrenceId },
        responses: [],
      }, source);
      assert.ok(!notOptedIn.candidates.some((candidate) => candidate.questionId === item.questionId));
    }

    const actual = compilePwqe51Route({
      phase: "deepening",
      optedInTopics: [item.topic],
      responses: [answer("actual-root", item.questionId, item.optionId, item.occurrenceId, undefined, { basis: "actual_recalled" })],
    }, source);
    assert.ok(actual.candidates.some((candidate) => candidate.questionId === item.childId && candidate.occurrenceId === item.occurrenceId));

    const typical = compilePwqe51Route({
      phase: "deepening",
      optedInTopics: [item.topic],
      responses: [answer("typical-root", item.questionId, item.optionId, item.occurrenceId, undefined, { basis: "reported_typicality" })],
    }, source);
    assert.ok(!typical.candidates.some((candidate) => candidate.questionId === item.childId));
  }
});

test("actual coverage rules open only from their literal same-episode anchors", async () => {
  const source = await sourcePromise;
  const open = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M01", "M01.rest", "A1", undefined, { basis: "actual_recalled" }),
    answer("setup", "M04", "M04.check", "A1"),
    answer("stance", "M05", "M05.attack", "A1"),
  ] }, source);
  const target = open.targets.find((item) => item.targetId === "coverage_self_stance");
  assert.equal(target?.state, "open");
  assert.deepEqual(target?.sourceObservationIds, ["stance:M05.attack"]);
  assert.ok(open.candidates.some((candidate) => candidate.questionId === "D65" && candidate.occurrenceId === "A1"));

  const corrected = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M01", "M01.rest", "A1", undefined, { basis: "actual_recalled" }),
    answer("setup", "M04", "M04.check", "A1"),
    answer("stance", "M05", "M05.attack", "A1"),
    answer("replace", "M05", "M05.neutral", "A1", "first", { supersedesResponseId: "stance" }),
  ] }, source);
  const correctedTarget = corrected.targets.find((item) => item.targetId === "coverage_self_stance");
  assert.ok(correctedTarget);
  assert.ok(!correctedTarget.sourceObservationIds.includes("stance:M05.attack"));
  assert.ok(correctedTarget.sourceObservationIds.includes("replace:M05.neutral"));
});

test("D99 is typicality provenance attached to an actual sequence, not a second episode", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M01", "M01.rest", "A1", undefined, { basis: "actual_recalled" }),
    answer("move", "D07", "D07.leave", "A1", "next"),
    answer("order", "D08", "D08.after", "A1", "edge"),
    answer("typicality", "D99", "D99.similar", "A1"),
  ] }, source);
  assert.equal(result.episodes.length, 1);
  assert.equal(result.episodes[0]?.actual, true);
  assert.equal(result.observations.find((o) => o.responseId === "typicality")?.basis, "reported_typicality");
  assert.equal(result.targets.find((t) => t.targetId === "coverage_sequence_typicality")?.state, "resolved_descriptively");
});

test("D78 return requires the same actual episode's next action and qualifying sequence and emits a later edge", async () => {
  const source = await sourcePromise;
  const responses = [
    answer("root", "M01", "M01.rest", "A1", undefined, { basis: "actual_recalled" }),
    answer("move", "D07", "D07.leave", "A1", "next"),
    answer("order", "D08", "D08.after_failed", "A1", "edge"),
    answer("return", "D78", "D78.returned", "A1", "return"),
  ];
  const result = compilePwqe51Route({ phase: "deepening", responses }, source);
  const edge = result.sequenceEdges.find((candidate) => candidate.id === "return:return");
  assert.equal(edge?.fromStep, "next");
  assert.equal(edge?.toStep, "return");
  assert.equal(edge?.relation, "before");
  assert.equal(edge?.meaning, "reported_earlier_response_returns_at_a_later_step_not_a_causal_loop");
  assert.deepEqual([...(edge?.observationIds ?? [])].sort(), ["move:D07.leave", "order:D08.after_failed", "return:D78.returned"].sort());

  assert.throws(() => compilePwqe51Route({ phase: "deepening", responses: [
    responses[0]!, responses[1]!, answer("not-after", "D08", "D08.overlap", "A1", "edge"), responses[3]!,
  ] }, source), /D78 return requires same-episode D08 sequence/u);
  assert.throws(() => compilePwqe51Route({ phase: "deepening", responses: [
    responses[0]!, responses[1]!, responses[2]!, answer("return-elsewhere", "D78", "D78.returned", "A2", "return"),
  ] }, source), /Root answers require an explicit/u);
});

test("D07 is offered at next only when an actual first-step action qualifies", async () => {
  const source = await sourcePromise;
  const qualifies = compilePwqe51Route({ phase: "deepening", optedInTopics: ["conflict"], responses: [
    answer("root", "D61", "D61.explain", "A1", "first", { basis: "actual_recalled" }),
  ] }, source);
  assert.ok(qualifies.targets.some((target) => target.targetId === "next_move" && target.occurrenceId === "A1" && target.state === "open"));
  assert.ok(qualifies.candidates.some((candidate) => candidate.questionId === "D07" && candidate.occurrenceId === "A1" && candidate.stepId === "next"));

  const noFirstAction = compilePwqe51Route({ phase: "deepening", responses: [
    answer("ordinary-root", "M01", "M01.rest", "A1", "first", { basis: "actual_recalled" }),
  ] }, source);
  assert.ok(!noFirstAction.candidates.some((candidate) => candidate.questionId === "D07"));

  const typical = compilePwqe51Route({ phase: "deepening", optedInTopics: ["conflict"], responses: [
    answer("typical-root", "D61", "D61.explain", "T1", "first", { basis: "reported_typicality" }),
  ] }, source);
  assert.ok(!typical.candidates.some((candidate) => candidate.questionId === "D07"));
});

test("D08 is offered at edge only after an actual same-episode D07 next action", async () => {
  const source = await sourcePromise;
  const actualPath = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root-a", "D61", "D61.explain", "A1", "first", { basis: "actual_recalled" }),
    answer("root-b", "D61", "D61.explain", "A2", "first", { basis: "actual_recalled" }),
    answer("next-a", "D07", "D07.leave", "A2", "next"),
  ] }, source);
  assert.ok(actualPath.candidates.some((candidate) => candidate.questionId === "D08" && candidate.occurrenceId === "A2" && candidate.stepId === "edge"));
  assert.ok(!actualPath.candidates.some((candidate) => candidate.questionId === "D08" && candidate.occurrenceId === "A1"));

  const noNextAction = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "D61", "D61.explain", "A1", "first", { basis: "actual_recalled" }),
    answer("no-next", "D07", "D07.nothing", "A1", "next"),
  ] }, source);
  assert.ok(!noNextAction.candidates.some((candidate) => candidate.questionId === "D08"));

  const typicalPath = compilePwqe51Route({ phase: "deepening", responses: [
    answer("typical-root", "D61", "D61.explain", "T1", "first", { basis: "reported_typicality" }),
    answer("typical-next", "D07", "D07.leave", "T1", "next"),
  ] }, source);
  assert.ok(!typicalPath.candidates.some((candidate) => candidate.questionId === "D08"));
});

test("the same item may be administered again at a distinct authored step", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M01", "M01.rest", "A1", undefined, { basis: "actual_recalled" }),
    answer("move", "D07", "D07.leave", "A1", "next"),
    answer("order", "D08", "D08.after", "A1", "edge"),
    answer("early-return", "D78", "D78.no", "A1", "first"),
  ] }, source);
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D78" && candidate.stepId === "return"));
});

test("missingness remains separate from substantive choices", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ responses: [{ responseId: "skip-root", questionId: "M01", occurrenceId: "E1", status: "skip" }] }, source);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.missingness, [{ responseId: "skip-root", questionId: "M01", occurrenceId: "E1", status: "skip" }]);
  assert.equal(result.episodes.length, 0);
});

test("base next-effect target outranks lower-priority sequence follow-ups after the relation is answered", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M10", "M10.urgent", "A1", undefined, { basis: "actual_recalled" }),
    answer("action", "M11", "M11.push", "A1"),
    answer("next", "D07", "D07.leave", "A1"),
    answer("relation", "D08", "D08.after_failed", "A1"),
  ] }, source);
  const nextEffect = result.targets.find((target) => target.targetId === "next_effect" && target.occurrenceId === "A1");
  assert.equal(nextEffect?.state, "open");
  assert.equal(nextEffect?.priority, 1);
  assert.equal(result.sequenceEdges.find((edge) => edge.responseId === "relation")?.fromStep, "first");
  assert.equal(result.sequenceEdges.find((edge) => edge.responseId === "relation")?.toStep, "next");
  assert.equal(result.next?.questionId, "D10");
});

test("recovery target and candidate require source-derived actual-easing flags", async () => {
  const source = await sourcePromise;
  const answers = [
    answer("root", "M10", "M10.urgent", "A1", undefined, { basis: "actual_recalled" }),
    answer("action", "M11", "M11.push", "A1"),
    answer("company", "M13", "M13.company", "A1"),
    answer("easing", "M14", "M14.brief", "A1"),
  ];
  const derived = compilePwqe51Route({ phase: "deepening", responses: answers }, source);
  assert.equal(derived.targets.find((target) => target.targetId === "coverage_recovery_conditions")?.state, "open");
  assert.ok(derived.candidates.some((candidate) => candidate.questionId === "D86" && candidate.stepId === "recovery"));

  const withoutEasing = compilePwqe51Route({ phase: "deepening", responses: [
    ...answers.slice(0, 3), answer("no-easing", "M14", "M14.same", "A1"),
  ], ...({ flagsByEpisodeStep: { "A1/recovery": ["actual_easing"] } } as unknown as Partial<import("../../lib/server/assessment/pwqe51-router.ts").Pwqe51RouterInput>) }, source);
  assert.ok(!withoutEasing.targets.some((target) => target.targetId === "coverage_recovery_conditions"));
  assert.ok(!withoutEasing.candidates.some((candidate) => candidate.questionId === "D86"));
});

test("C10 reference-plan answers open and route the recovery conditions target", async () => {
  const source = await sourcePromise;
  // These canonical answers are the C10 "Functioning, ease, timing and changed interpretation"
  // fixture from qualification/coverage/FICTIONAL_PLANS.json. Replay only the routing-relevant
  // prefix; the router must derive eligibility from the answers, not a prebuilt target snapshot.
  const result = compilePwqe51Route({ phase: "deepening", details: ["state", "texture"], responses: [
    answer("root", "M10", "M10.words", "C10-E1", undefined, { basis: "actual_recalled" }),
    answer("action", "M11", "M11.quiet", "C10-E1"),
    answer("function", "M12", "M12.function", "C10-E1"),
    answer("presence", "M13", "M13.quiet", "C10-E1"),
    answer("easing", "M14", "M14.choice", "C10-E1"),
    answer("slow-change", "D35", "D35.choice", "C10-E1"),
  ] }, source);

  const target = result.targets.find((candidate) => candidate.targetId === "coverage_recovery_conditions");
  assert.equal(target?.state, "open");
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D86" && candidate.stepId === "recovery"));
});

test("a corrected root retains eligible dependent evidence at its original timeline position", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ responses: [
    answer("original", "M02", "M02.rehearse", "review", undefined, { basis: "actual_recalled" }),
    answer("dependent", "M03", "M03.exposure", "review"),
    answer("corrected", "M02", "M02.recheck", "review", undefined, { supersedesResponseId: "original", basis: "actual_recalled" }),
  ] }, source);
  assert.deepEqual(result.supersededResponseIds, ["original"]);
  assert.equal(result.observations.some((o) => o.responseId === "original"), false);
  assert.equal(result.observations.some((o) => o.responseId === "corrected"), true);
  assert.equal(result.observations.some((o) => o.responseId === "dependent"), true);
  assert.equal(result.invalidatedResponses.some((r) => r.responseId === "dependent"), false);
});

test("forward corrections are rejected instead of constructing a cyclic replacement chain", async () => {
  const source = await sourcePromise;
  assert.throws(() => compilePwqe51Route({ responses: [
    answer("invalid", "M02", "M02.recheck", "review", undefined, { basis: "actual_recalled", supersedesResponseId: "future" }),
    answer("future", "M02", "M02.rehearse", "review", undefined, { basis: "actual_recalled" }),
  ] }, source), /earlier response/u);
});
