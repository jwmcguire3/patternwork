import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { compilePwqe51Route, type Pwqe51RouterInput } from "../../lib/server/assessment/pwqe51-router.ts";

interface ReferenceCase {
  readonly id: string;
  readonly input: Pwqe51RouterInput;
  readonly expected: Readonly<Record<string, unknown>>;
}

interface ReferenceExtensionFixture {
  readonly format: string;
  readonly source_binding: Readonly<Record<string, string>>;
  readonly source_manifest_sha256: string;
  readonly cases: readonly ReferenceCase[];
}

const sourcePromise = loadPwqe51SourcePackage();
const fixturePromise = readFile(path.join(process.cwd(), "scripts/pwqe51-parity/REFERENCE_EXTENSIONS.json"), "utf8")
  .then((text) => JSON.parse(text) as ReferenceExtensionFixture);

function same<T>(actual: T, expected: unknown, message: string): void {
  assert.deepEqual(actual, expected, message);
}

test("D41 independent reference extension is pinned to the unchanged PWQE 5.1 package", async () => {
  const [source, fixture] = await Promise.all([sourcePromise, fixturePromise]);
  assert.equal(fixture.format, "pwqe51-independent-reference-extension-v1");
  same(fixture.source_binding, source.manifest.source_binding, "the extension must use the manifest's immutable source binding");
  assert.equal(fixture.source_manifest_sha256, source.sourceManifestSha256);
  const d41 = source.questionBank.items.find((item) => item.id === "D41");
  const entry = source.routingTargets.entry_points.find((item) => item.id === "body_detail");
  assert.equal(entry?.first_item, "D41");
  assert.equal(d41?.eligibility.topic_opt_in, "body_detail");
  assert.equal(d41?.episode_family, "bound");
  assert.equal(d41?.eligibility.actual_episode_required, true);
});

test("D41 entry authorization, actual-episode gate, tier and answer/skip/correction effects match the independent cases", async () => {
  const [source, fixture] = await Promise.all([sourcePromise, fixturePromise]);
  const cases = new Map(fixture.cases.map((item) => [item.id, item]));
  assert.equal(cases.size, fixture.cases.length, "independent case identities must be unique");

  for (const item of fixture.cases) {
    const result = compilePwqe51Route(item.input, source);
    const expected = item.expected;
    const d41Candidates = result.candidates.filter((candidate) => candidate.questionId === "D41");

    if (expected.d41_candidate === true) {
      assert.equal(d41Candidates.length, 1, `${item.id}: one D41 candidate should be admitted`);
      const candidate = d41Candidates[0]!;
      same({
        questionId: candidate.questionId,
        occurrenceId: candidate.occurrenceId,
        targetIds: candidate.targetIds,
        priority: candidate.priority,
        stage: candidate.stage,
      }, expected.candidate, `${item.id}: D41 must remain bound and use the contract priority`);
    } else if (expected.d41_candidate === false) {
      assert.equal(d41Candidates.length, 0, `${item.id}: D41 must not be offered`);
    }
    if (typeof expected.d41_rejection_reason === "string") {
      assert.ok(result.rejectedCandidates.some((candidate) => candidate.questionId === "D41"
        && candidate.reason === expected.d41_rejection_reason), `${item.id}: the failed D41 gate must report its independent reason`);
    }

    if (typeof expected.next_question_id === "string") {
      assert.equal(result.next?.questionId, expected.next_question_id, `${item.id}: the more consequential tier must route first`);
      assert.equal(result.next?.priority, expected.next_priority);
      assert.equal(d41Candidates[0]?.priority, expected.d41_priority);
    }

    if (Array.isArray(expected.active_d41_response_ids)) {
      same(result.observations.filter((observation) => observation.itemId === "D41").map((observation) => observation.responseId),
        expected.active_d41_response_ids, `${item.id}: only current D41 answers may remain active`);
    }
    if (Array.isArray(expected.active_d41_option_ids)) {
      same(result.observations.filter((observation) => observation.itemId === "D41").map((observation) => observation.optionId),
        expected.active_d41_option_ids, `${item.id}: D41 corrections must replace the earlier option`);
    }
    if (Array.isArray(expected.missingness)) {
      same(result.missingness.map((row) => ({ responseId: row.responseId, status: row.status })),
        expected.missingness, `${item.id}: a skip remains missingness, not a substantive answer`);
    }
    if (Array.isArray(expected.superseded_response_ids)) {
      same(result.supersededResponseIds, expected.superseded_response_ids, `${item.id}: the prior response must be superseded`);
    }
  }
});

test("C07 fixture comparison answers retain actual pair lineage through D56, D57 and D77", async () => {
  const source = await sourcePromise;
  const coveragePath = path.join(process.cwd(), "specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json");
  const coverage = JSON.parse(await readFile(coveragePath, "utf8")) as { plans: any[] };
  const c07 = coverage.plans.find((plan) => plan.id === "C07");
  assert.ok(c07, "the original C07 fixture remains in the qualification corpus");
  const binding = c07.episode_bindings.find((candidate: any) => candidate.item_id === "M02" && candidate.source_item_id === "M02"
    && candidate.outcome === "confirm" && candidate.relation === "different");
  assert.ok(binding, "C07 must independently author a confirmed-different second review");
  const occurrence = (answerIndex: number) => `C07:M02:${answerIndex}`;
  const pair = [occurrence(binding.source_answer_index), occurrence(binding.answer_index)] as const;
  const d56TargetId = `contrast_context:${pair[0]}:comparison:${pair[0]}:${pair[1]}`;
  const d57TargetId = `contrast_goal:${pair[0]}:comparison:${pair[0]}:${pair[1]}`;
  const d77TargetId = `coverage_pattern_continuity:${pair[0]}:comparison:${pair[0]}:${pair[1]}`;
  const selected = (itemId: string, answerIndex = 0): string => c07.answers[itemId][answerIndex].selected[0];
  const responses = [
    { responseId: "review-root-a", questionId: "M02", occurrenceId: pair[0], selectedOptionIds: [selected("M02", 0)], basis: "actual_recalled" as const },
    { responseId: "review-aim-a", questionId: "M03", occurrenceId: pair[0], selectedOptionIds: [selected("M03", 0)] },
    { responseId: "review-root-b", questionId: "M02", occurrenceId: pair[1], selectedOptionIds: [selected("M02", 1)], basis: "actual_recalled" as const },
    { responseId: "review-aim-b", questionId: "M03", occurrenceId: pair[1], selectedOptionIds: [selected("M03", 1)] },
    { responseId: "comparison-context", questionId: "D56", occurrenceId: pair[0], stepId: "comparison", targetIds: [d56TargetId], selectedOptionIds: [selected("D56")] },
    { responseId: "comparison-goal", questionId: "D57", occurrenceId: pair[0], stepId: "comparison", targetIds: [d57TargetId], selectedOptionIds: [selected("D57")] },
    { responseId: "comparison-continuity", questionId: "D77", occurrenceId: pair[0], stepId: "comparison", targetIds: [d77TargetId], selectedOptionIds: [selected("D77")] },
  ];
  const result = compilePwqe51Route({
    phase: "deepening",
    distinctPairs: [pair],
    responses,
    comparisonIdsByResponseId: {
      "comparison-context": pair,
      "comparison-goal": pair,
      "comparison-continuity": pair,
    },
  }, source);

  const secondEpisode = result.episodes.find((episode) => episode.id === pair[1]);
  assert.equal(secondEpisode?.actual, true, "the fixture's second reviewed occasion is a genuinely recalled episode");
  assert.ok(secondEpisode?.distinctFrom?.includes(pair[0]), "distinctness must come from C07's authored binding, never the generated IDs");
  assert.deepEqual(result.episodes.find((episode) => episode.id === pair[1])?.responseIds,
    ["review-root-b", "review-aim-b"], "the second M03 answer remains attached to the second actual occurrence");
  assert.equal(result.targets.find((target) => target.id === d56TargetId)?.state, "resolved_descriptively");
  assert.equal(result.targets.find((target) => target.id === d57TargetId)?.state, "resolved_descriptively");
  const continuity = result.targets.find((target) => target.id === d77TargetId);
  assert.equal(continuity?.state, "resolved_descriptively");
  assert.deepEqual(continuity?.comparisonIds, pair);
  assert.ok(continuity?.sourceObservationIds.includes("review-root-a:M02.rehearse"), JSON.stringify(continuity));
  assert.ok(continuity?.sourceObservationIds.includes("review-root-b:M02.rehearse"), JSON.stringify(continuity));
  assert.ok(continuity?.sourceObservationIds.includes("comparison-context:D56.same"));
  assert.ok(continuity?.sourceObservationIds.includes("comparison-goal:D57.same"));
});

test("comparison missingness and uncertainty do not create distinctness or a reported outcome", async () => {
  const source = await sourcePromise;
  const pair = ["comparison-a", "comparison-b"] as const;
  const targetId = `contrast_context:${pair[0]}:comparison:${pair[0]}:${pair[1]}`;
  const roots = [
    { responseId: "root-a", questionId: "M02", occurrenceId: pair[0], selectedOptionIds: ["M02.rehearse"], basis: "actual_recalled" as const },
    { responseId: "root-b", questionId: "M02", occurrenceId: pair[1], selectedOptionIds: ["M02.rehearse"], basis: "actual_recalled" as const },
    { responseId: "aim-a", questionId: "M03", occurrenceId: pair[0], selectedOptionIds: ["M03.exposure"] },
    { responseId: "aim-b", questionId: "M03", occurrenceId: pair[1], selectedOptionIds: ["M03.exposure"] },
  ];
  const compare = (response: Pwqe51RouterInput["responses"][number], distinctPairs: readonly (readonly [string, string])[] = [pair]) =>
    compilePwqe51Route({ phase: "deepening", distinctPairs, responses: [
      ...roots,
      { ...response, stepId: "comparison", targetIds: [targetId] },
    ], comparisonIdsByResponseId: { [response.responseId]: pair } }, source);

  const same = compare({ responseId: "same", questionId: "D56", occurrenceId: pair[0], selectedOptionIds: ["D56.same"] });
  assert.equal(same.targets.find((target) => target.id === targetId)?.state, "resolved_descriptively");
  const noEvent = compare({ responseId: "no-event", questionId: "D56", occurrenceId: pair[0], status: "no_event", selectedOptionIds: [] });
  assert.equal(noEvent.targets.find((target) => target.id === targetId)?.state, "unavailable");
  assert.deepEqual(noEvent.missingness.map((row) => row.status), ["no_event"]);
  const unknown = compare({ responseId: "unknown", questionId: "D56", occurrenceId: pair[0], status: "not_sure", selectedOptionIds: [] });
  assert.equal(unknown.targets.find((target) => target.id === targetId)?.state, "unresolved");
  assert.deepEqual(unknown.missingness.map((row) => row.status), ["not_sure"]);
  const unconfirmed = compare({ responseId: "unconfirmed", questionId: "D56", occurrenceId: pair[0], selectedOptionIds: ["D56.same"] }, []);
  assert.equal(unconfirmed.episodes.find((episode) => episode.id === pair[0])?.distinctFrom?.length ?? 0, 0);
  assert.ok(!unconfirmed.targets.some((target) => target.targetId === "coverage_pattern_continuity"));
});
