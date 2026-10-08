import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  evaluatePwqe51CoverageGate,
  type Pwqe51CoverageAdministration,
  type Pwqe51CoverageEpisode,
  type Pwqe51CoverageGateContext,
  type Pwqe51CoverageObservation,
} from "../../lib/server/assessment/pwqe51-coverage.ts";

const sourcePromise = loadPwqe51SourcePackage();

function obs(id: string, itemId: string, optionId: string, responseId = `r-${itemId}`, capture?: string, stepId = "first"): Pwqe51CoverageObservation {
  return { id, itemId, optionId, responseId, capture, stepId };
}

function context(overrides: Partial<Pwqe51CoverageGateContext> = {}): Pwqe51CoverageGateContext {
  const episode: Pwqe51CoverageEpisode = { id: "ep-1", actual: true };
  return {
    episode,
    observations: [],
    episodes: new Map([[episode.id, episode]]),
    administrations: [],
    currentAnsweredParents: new Set(),
    flags: new Set(),
    stepId: "first",
    ...overrides,
  };
}

test("all 39 source rules can be evaluated without positional option assumptions", async () => {
  const source = await sourcePromise;
  assert.equal(source.coverageRules.rules.length, 39);
  for (const rule of source.coverageRules.rules) {
    const episode = rule.root ? null : { id: "ep-1", actual: false };
    const result = evaluatePwqe51CoverageGate(source, String(rule.id), context({ episode }));
    if (rule.root) assert.equal(result.reason, null);
    else assert.equal(result.reason, "coverage_requires_actual_episode", String(rule.id));
  }
});

test("comparison needs actual distinct episodes, matched action, and answered same-pair D56/D57 context", async () => {
  const source = await sourcePromise;
  const first: Pwqe51CoverageEpisode = { id: "ep-a", actual: true, distinctFrom: ["ep-b"] };
  const second: Pwqe51CoverageEpisode = { id: "ep-b", actual: true };
  const episodes = new Map([[first.id, first], [second.id, second]]);
  const responseContext = obs("o-d56", "D56", "D56.same", "r-d56");
  const administrations: readonly Pwqe51CoverageAdministration[] = [
    { id: "ad-d56", itemId: "D56", comparisonIds: ["ep-a", "ep-b"], response: { id: "r-d56", status: "answered" } },
  ];
  const withEvidence = context({
    episode: first,
    episodes,
    comparisonIds: ["ep-a", "ep-b"],
    observations: [obs("o-a", "M02", "M02.rehearse", "r-a", "first_action"), responseContext],
    observationsByEpisode: { "ep-b": [obs("o-b", "D54", "D54.rehearse", "r-b", "later_action")] },
    administrations,
  });
  assert.equal(evaluatePwqe51CoverageGate(source, "coverage_pattern_continuity", context({
    ...withEvidence,
    episodes: new Map([["ep-a", { id: "ep-a", actual: true }], ["ep-b", second]]),
  })).reason, "coverage_comparison_distinctness_unknown");

  const result = evaluatePwqe51CoverageGate(source, "coverage_pattern_continuity", withEvidence);
  assert.equal(result.reason, null);
  assert.deepEqual(result.anchorObservationIds, ["o-a", "o-b", "o-d56"]);

  assert.equal(evaluatePwqe51CoverageGate(source, "coverage_pattern_continuity", context({
    ...withEvidence,
    administrations: [{ ...administrations[0]!, comparisonIds: ["ep-b", "ep-a"] }],
  })).reason, "coverage_comparison_needs_context_or_job");
  assert.equal(evaluatePwqe51CoverageGate(source, "coverage_pattern_continuity", context({
    ...withEvidence,
    observationsByEpisode: { "ep-b": [obs("o-b", "D54", "D54.none", "r-b", "later_action")] },
  })).reason, "coverage_comparison_requires_matched_action");
});

test("D99 provenance is outside coverage_gate and cannot fabricate recurrence evidence", async () => {
  const source = await sourcePromise;
  const result = evaluatePwqe51CoverageGate(source, "coverage_sequence_typicality", context({
    observations: [obs("o-d08", "D08", "D08.after", "r-d08"), obs("o-d07", "D07", "D07.more", "r-d07"), obs("o-d99", "D99", "D99.often", "r-d99")],
    currentAnsweredParents: new Set(["D07", "D08"]),
  }));
  assert.equal(result.reason, null);
  assert.deepEqual(result.anchorObservationIds, ["o-d08", "o-d07"]);
  assert.ok(!result.anchorObservationIds.includes("o-d99"), "self-reported typicality is not an independent actual episode");
  assert.equal(source.questionBank.items.find((item) => item.id === "D99")?.captures, "sequence_typicality");
});

test("ordinary privacy remains an authored D73 alternative and is not gated as internal exclusion", async () => {
  const source = await sourcePromise;
  const rule = source.coverageRules.rules.find((candidate) => candidate.id === "coverage_held_back_reason")!;
  assert.ok((rule.alternative_options as readonly string[]).includes("D73.privacy"));
  const result = evaluatePwqe51CoverageGate(source, "coverage_held_back_reason", context({
    observations: [obs("o-d72", "D72", "D72.voice", "r-d72"), obs("o-d73", "D73", "D73.privacy", "r-d73")],
    currentAnsweredParents: new Set(["D72"]),
  }));
  assert.equal(result.reason, null);
});

test("non-excluded option leaves remain correction dependencies for excluded-option guards", async () => {
  const source = await sourcePromise;
  const observations = [
    obs("o-d20", "D20", "D20.difficult", "r-d20"),
    obs("o-d67", "D67", "D67.temporary", "r-d67"),
  ];
  const result = evaluatePwqe51CoverageGate(source, "coverage_internal_return", context({
    observations,
    currentAnsweredParents: new Set(["D20", "D67"]),
  }));
  assert.equal(result.reason, null);
  assert.deepEqual(result.anchorObservationIds, ["o-d20", "o-d67"]);

  const excluded = evaluatePwqe51CoverageGate(source, "coverage_internal_return", context({
    observations: [...observations, obs("o-old", "D67", "D67.not_difficult", "r-old")],
    currentAnsweredParents: new Set(["D20", "D67"]),
  }));
  assert.equal(excluded.reason, "coverage_answer_excludes_followup");
  assert.deepEqual(excluded.anchorObservationIds, []);
});

test("required context flags need the rule's literal source leaves", async () => {
  const source = await sourcePromise;
  const observations = [obs("o-m13", "M13", "M13.company", "r-m13"), obs("o-m14", "M14", "M14.choice", "r-m14")];
  assert.equal(evaluatePwqe51CoverageGate(source, "coverage_recovery_conditions", context({
    observations,
    flags: new Set(),
    currentAnsweredParents: new Set(["M13", "M14"]),
  })).reason, "coverage_required_context_missing");
  const result = evaluatePwqe51CoverageGate(source, "coverage_recovery_conditions", context({
    observations,
    flags: new Set(["actual_easing"]),
    currentAnsweredParents: new Set(["M13", "M14"]),
  }));
  assert.equal(result.reason, null);
  assert.deepEqual(result.anchorObservationIds, ["o-m14", "o-m13"]);
});
