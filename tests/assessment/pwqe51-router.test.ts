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

test("mapping tie-breaks use the recalled episode context for attached questions", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ responses: [
    answer("overload-root", "M10", "M10.urgent", "overload-episode", undefined, { basis: "actual_recalled" }),
    answer("overload-action", "M11", "M11.push", "overload-episode"),
  ] }, source);
  assert.equal(result.next?.questionId, "M12");
  assert.equal(result.candidates.find((candidate) => candidate.questionId === "M13")?.stepId, "later");
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

test("an answered topic entry root is not reoffered in the same actual occurrence", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", optedInTopics: ["conflict"], responses: [
    answer("conflict-root", "D61", "D61.explain", "conflict-episode", undefined, {
      basis: "actual_recalled", targetIds: ["entry:conflict"],
    }),
  ] }, source);
  assert.ok(!result.candidates.some((candidate) => candidate.questionId === "D61" && candidate.targetIds.includes("entry:conflict")));
});

test("an opted-in entry point keeps focus ahead of a same-tier ordinary follow-up", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({
    phase: "deepening",
    optedInTopics: ["disclosure"],
    occurrenceBindings: { "entry:disclosure": "disclosure-episode" },
    responses: [
      answer("help-root", "M20", "M20.small", "help-episode", undefined, { basis: "actual_recalled" }),
      answer("help-context", "M21", "M21.burden", "help-episode"),
    ],
  }, source);
  const disclosureIndex = result.candidates.findIndex((candidate) => candidate.questionId === "D47");
  const helpIndex = result.candidates.findIndex((candidate) => candidate.questionId === "D21");
  assert.ok(disclosureIndex >= 0 && helpIndex >= 0);
  assert.ok(disclosureIndex < helpIndex);
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

test("ordered D36 recovery details emit explicit adjacent sequence edges", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("root", "M02", "M02.rehearse", "recovery-order", undefined, { basis: "actual_recalled" }),
    {
      responseId: "recovery-order",
      questionId: "D36",
      occurrenceId: "recovery-order",
      stepId: "recovery",
      selectedOptionIds: ["D36.input", "D36.words", "D36.think"],
      status: "answered",
      mode: "ordered",
    },
  ] }, source);

  assert.deepEqual(result.sequenceEdges.map(({ fromStep, toStep, relation, meaning }) => ({ fromStep, toStep, relation, meaning })), [
    { fromStep: "recovery/D36.input", toStep: "recovery/D36.words", relation: "before", meaning: "reported_recovery_order" },
    { fromStep: "recovery/D36.words", toStep: "recovery/D36.think", relation: "before", meaning: "reported_recovery_order" },
  ]);
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
  const relation = actualPath.candidates.find((candidate) => candidate.questionId === "D08" && candidate.occurrenceId === "A2" && candidate.stepId === "edge");
  assert.equal(relation?.priority, 1, "the relation that establishes episode order is a tier-1 clarification");
  assert.equal(actualPath.next?.questionId, "D08");
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

test("D09-D11 wait until D08 establishes that the next move belongs to the same episode", async () => {
  const source = await sourcePromise;
  const prefix = [
    answer("root", "D61", "D61.explain", "A1", "first", { basis: "actual_recalled" }),
    answer("next", "D07", "D07.leave", "A1", "next"),
  ];
  const beforeRelation = compilePwqe51Route({ phase: "deepening", responses: prefix }, source);
  assert.ok(beforeRelation.candidates.some((candidate) => candidate.questionId === "D08"));
  assert.ok(!beforeRelation.candidates.some((candidate) => ["D09", "D10", "D11"].includes(candidate.questionId)));

  const differentEpisode = compilePwqe51Route({ phase: "deepening", responses: [
    ...prefix, answer("relation", "D08", "D08.different", "A1", "edge"),
  ] }, source);
  assert.ok(!differentEpisode.candidates.some((candidate) => ["D09", "D10", "D11"].includes(candidate.questionId)));

  const sameEpisode = compilePwqe51Route({ phase: "deepening", responses: [
    ...prefix, answer("relation", "D08", "D08.after", "A1", "edge"),
  ] }, source);
  assert.ok(sameEpisode.candidates.some((candidate) => candidate.questionId === "D10"));
});

test("equal-tier routing prioritizes the authored evidence requirement before stable item ID", async () => {
  const source = await sourcePromise;
  const prefix = [
    answer("request", "M20", "M20.small", "A1", "first", { basis: "actual_recalled" }),
    answer("response", "M21", "M21.unclear", "A1", "first"),
  ];
  const evidencePriority = compilePwqe51Route({ phase: "deepening", responses: prefix }, source);
  assert.ok(evidencePriority.candidates.some((candidate) => candidate.questionId === "D91"));
  assert.ok(evidencePriority.candidates.some((candidate) => candidate.questionId === "D17"));
  assert.equal(evidencePriority.next?.questionId, "D21");

  const stableTie = compilePwqe51Route({ phase: "deepening", responses: [
    ...prefix, answer("need", "D21", "D21.none", "A1", "first"),
  ] }, source);
  assert.ok(stableTie.candidates.some((candidate) => candidate.questionId === "D91"));
  assert.equal(stableTie.next?.questionId, "D17");
});

test("respondent focus follows a linked candidate opened by the focused episode", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", focusOccurrences: ["EP1"],
    episodeLinks: [{ occurrenceId: "EP2", linkedFrom: "EP1" }],
    occurrenceBindings: { "target:known_distance:EP1:first:D42": "EP2" },
    responses: [
      answer("root", "M17", "M17.check", "EP1", "first", { basis: "actual_recalled" }),
      answer("context", "M18", "M18.upset", "EP1", "first"),
      answer("want", "D43", "D43.information", "EP1", "first"),
    ],
  }, source);
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D42" && candidate.linkedFrom === "EP1"));
  assert.equal(result.next?.questionId, "D42");
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

test("selected-step D34 eligibility uses the target's first-step actual low-response flag", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("overload-root", "M10", "M10.words", "overload-episode", undefined, { basis: "actual_recalled" }),
    answer("low-response", "M11", "M11.stop", "overload-episode", "first"),
  ] }, source);
  const target = result.targets.find((candidate) => candidate.targetId === "quiet_or_access" && candidate.occurrenceId === "overload-episode");
  assert.equal(target?.state, "open");
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D34"
    && candidate.occurrenceId === "overload-episode" && candidate.stepId === "first"));
});

test("selected-step D23 eligibility uses the coverage target's first-step feeling flag", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("self-expression-root", "D72", "D72.interest", "self-expression-episode", undefined, { basis: "actual_recalled" }),
    answer("self-stance", "D65", "D65.curious", "self-expression-episode", "self_response"),
    answer("awareness-choice", "D66", "D66.choice", "self-expression-episode", "first"),
  ] }, source);
  const target = result.targets.find((candidate) => candidate.targetId === "coverage_feeling_tolerance"
    && candidate.occurrenceId === "self-expression-episode");
  assert.equal(target?.state, "open");
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D23"
    && candidate.occurrenceId === "self-expression-episode" && candidate.stepId === "first"));
});

test("base target closure uses its target-specific discriminator set", async () => {
  const source = await sourcePromise;
  const functionResult = compilePwqe51Route({ phase: "deepening", responses: [
    answer("function-root", "M02", "M02.rehearse", "function-episode", undefined, { basis: "actual_recalled" }),
    answer("function-aim", "M03", "M03.exposure", "function-episode"),
  ] }, source);
  const functionTarget = functionResult.targets.find((target) => target.targetId === "function" && target.occurrenceId === "function-episode");
  assert.equal(functionTarget?.state, "supports_interpretation");
  assert.deepEqual(functionTarget?.resolutionObservationIds, ["function-aim:M03.exposure"]);

  const contactResult = compilePwqe51Route({ phase: "deepening", responses: [
    answer("contact-root", "M02", "M02.rehearse", "contact-episode", undefined, { basis: "actual_recalled" }),
    answer("contact-action", "M17", "M17.send", "contact-episode"),
    answer("contact-context", "M18", "M18.info", "contact-episode"),
  ] }, source);
  const contactTarget = contactResult.targets.find((target) => target.targetId === "contact_function" && target.occurrenceId === "contact-episode");
  assert.equal(contactTarget?.state, "supports_alternative");
  assert.deepEqual(contactTarget?.resolutionObservationIds, ["contact-context:M18.info"]);
});

test("recurrence closes only when matching action evidence spans confirmed distinct actual episodes", async () => {
  const source = await sourcePromise;
  const responses = [
    answer("repeat-a-root", "M02", "M02.rehearse", "repeat-a", undefined, { basis: "actual_recalled" }),
    answer("repeat-a-aim", "M03", "M03.exposure", "repeat-a"),
    answer("repeat-b-root", "M02", "M02.rehearse", "repeat-b", undefined, { basis: "actual_recalled" }),
    answer("repeat-b-aim", "M03", "M03.exposure", "repeat-b"),
  ];
  const withDistinctness = compilePwqe51Route({ phase: "deepening", responses, distinctPairs: [["repeat-a", "repeat-b"]] }, source);
  assert.equal(withDistinctness.targets.find((target) => target.targetId === "recurrence" && target.occurrenceId === "repeat-a")?.state, "resolved_descriptively");
  const withoutDistinctness = compilePwqe51Route({ phase: "deepening", responses }, source);
  assert.equal(withoutDistinctness.targets.find((target) => target.targetId === "recurrence" && target.occurrenceId === "repeat-a")?.state, "open");
});

test("comparison targets retain pair identity and close from their own administered answers", async () => {
  const source = await sourcePromise;
  const pair = ["comparison-a", "comparison-b"] as const;
  const comparisonTargetId = "contrast_context:comparison-a:comparison:comparison-a:comparison-b";
  const result = compilePwqe51Route({ phase: "deepening", distinctPairs: [pair], responses: [
    answer("comparison-root-a", "M02", "M02.rehearse", pair[0], undefined, { basis: "actual_recalled" }),
    answer("comparison-root-b", "M02", "M02.rehearse", pair[1], undefined, { basis: "actual_recalled" }),
    answer("comparison-context", "D56", "D56.same", pair[0], "comparison", { targetIds: [comparisonTargetId] }),
  ], comparisonIdsByResponseId: { "comparison-context": pair } }, source);
  const context = result.targets.find((target) => target.targetId === "contrast_context" && target.stepId === "comparison");
  assert.deepEqual(context?.comparisonIds, pair);
  assert.equal(context?.state, "resolved_descriptively");
  assert.ok(result.targets.some((target) => target.targetId === "contrast_goal" && target.stepId === "comparison" && target.comparisonIds?.join("|") === pair.join("|")));
});

test("target-bound missingness and linked actual episodes preserve their distinct closure paths", async () => {
  const source = await sourcePromise;
  const functionMissing = compilePwqe51Route({ phase: "deepening", responses: [
    answer("missing-root", "M02", "M02.rehearse", "missing-episode", undefined, { basis: "actual_recalled" }),
    { responseId: "missing-function", questionId: "D02", occurrenceId: "missing-episode", stepId: "first", status: "no_event", targetIds: ["function:missing-episode:first"] },
  ] }, source);
  assert.equal(functionMissing.targets.find((target) => target.targetId === "function" && target.occurrenceId === "missing-episode")?.state, "unavailable");

  const linked = compilePwqe51Route({ phase: "deepening", episodeLinks: [{ occurrenceId: "known-child", linkedFrom: "known-parent" }], responses: [
    answer("known-parent-root", "M02", "M02.rehearse", "known-parent", undefined, { basis: "actual_recalled" }),
    answer("known-parent-contact", "M17", "M17.send", "known-parent"),
    answer("known-parent-context", "M18", "M18.matter", "known-parent"),
    answer("known-child-discriminator", "D42", "D42.practical", "known-child", undefined, { basis: "actual_recalled" }),
  ] }, source);
  assert.equal(linked.targets.find((target) => target.targetId === "known_distance" && target.occurrenceId === "known-parent")?.state, "resolved_descriptively");
});

test("vulnerable meaning remains attached to its authored selected step", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({ phase: "deepening", responses: [
    answer("vulnerable-root", "M02", "M02.rehearse", "vulnerable-episode", undefined, { basis: "actual_recalled" }),
    answer("vulnerable-meaning", "D20", "D20.need", "vulnerable-episode"),
  ] }, source);
  const target = result.targets.find((item) => item.targetId === "vulnerable_meaning" && item.occurrenceId === "vulnerable-episode");
  assert.equal(target?.stepId, "selected");
  assert.equal(target?.state, "resolved_descriptively");
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
    // The referenced later M02 row is attached to this already established
    // episode, so it must inherit the root basis instead of supplying one.
    answer("future", "M02", "M02.rehearse", "review"),
  ] }, source), /Corrections must supersede an earlier response/u);
});

test("attached responses cannot supply their own episode basis", async () => {
  const source = await sourcePromise;
  assert.throws(() => compilePwqe51Route({ responses: [
    answer("root", "M02", "M02.rehearse", "review", undefined, { basis: "actual_recalled" }),
    answer("attached", "M03", "M03.exposure", "review", undefined, { basis: "reported_typicality" }),
  ] }, source), /Attached items inherit episode basis; client basis is not accepted/u);
});

test("a target whose first discriminator is unavailable may offer a later authored discriminator", async () => {
  const source = await sourcePromise;
  const result = compilePwqe51Route({
    phase: "deepening",
    details: ["recurrence"],
    responses: [
      answer("review", "M02", "M02.rehearse", "review-1", undefined, { basis: "actual_recalled" }),
    ],
  }, source);
  const recurrence = result.targets.find((target) => target.targetId === "recurrence" && target.occurrenceId === "review-1");
  assert.ok(recurrence, "recurrence should open on the supported evaluation action");
  assert.ok(result.candidates.some((candidate) => candidate.questionId === "D05" && candidate.occurrenceId === "review-1"),
    "D05 remains eligible when the REPLAY operator is not yet production-wired");
});
