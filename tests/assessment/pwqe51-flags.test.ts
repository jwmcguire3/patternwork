import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  derivePwqe51Flags,
  pwqe51ComparisonPairKey,
  pwqe51EpisodeStepKey,
  type Pwqe51CanonicalResponseRow,
  type Pwqe51FlagDerivationInput,
  type Pwqe51FlagEpisode,
} from "../../lib/server/assessment/pwqe51-flags.ts";

const sourcePromise = loadPwqe51SourcePackage();

function ep(id: string, overrides: Partial<Pwqe51FlagEpisode> = {}): Pwqe51FlagEpisode {
  return { id, family: "conflict", status: "actual", basis: "actual", ...overrides };
}

function answer(itemId: string, optionId: string, episodeId = "ep-1", stepId = "first", extras: Partial<Pwqe51CanonicalResponseRow> = {}): Pwqe51CanonicalResponseRow {
  return {
    responseId: `response-${itemId}-${episodeId}-${stepId}`,
    administrationId: `admin-${itemId}-${episodeId}-${stepId}`,
    itemId,
    episodeId,
    administrationEpisodeId: episodeId,
    stepId,
    status: "answered",
    selectedOptionIds: [optionId],
    ...extras,
  };
}

function input(overrides: Partial<Pwqe51FlagDerivationInput> = {}): Pwqe51FlagDerivationInput {
  return { episodes: [ep("ep-1")], currentResponses: [], enabledTopics: [], ...overrides };
}

function flags(result: ReturnType<typeof derivePwqe51Flags>, episodeId = "ep-1", stepId = "first"): readonly string[] {
  return result.flagsByEpisodeStep[pwqe51EpisodeStepKey(episodeId, stepId)] ?? [];
}

test("all authored required_flags are recognized by the source-bound derivation", async () => {
  const source = await sourcePromise;
  const result = derivePwqe51Flags(source, input());
  assert.deepEqual(flags(result), []);
  for (const [itemId, gate] of Object.entries(source.itemGates.gates)) {
    const required = gate.required_flags;
    if (Array.isArray(required)) assert.ok(source.questionBank.items.some((item) => item.id === itemId));
  }
});

test("response facts derive per episode and step with explicit exclusions preserved", async () => {
  const source = await sourcePromise;
  const result = derivePwqe51Flags(source, input({
    currentResponses: [
      answer("M02", "M02.rehearse"),
      answer("D07", "D07.more"),
      answer("D07", "D07.more", "ep-1", "next"),
      answer("D08", "D08.different"),
      answer("M26", "M26.finish"),
      answer("D18", "D18.none"),
      answer("D21", "D21.visible"),
      answer("D34", "D34.words", "ep-1", "next"),
      answer("D04", "D04.done"),
    ],
  }));
  assert.ok(flags(result).includes("actual_first_move"));
  assert.ok(flags(result).includes("actual_simultaneous_wants"));
  assert.ok(!flags(result).includes("reported_exposure_concern"), "explicit none remains distinct from a concern leaf");
  assert.ok(!flags(result).includes("actual_next_move"), "D08.different excludes a same-episode next-move inference");
  assert.ok(flags(result, "ep-1", "next").includes("actual_selected_step"));
  assert.ok(flags(result, "ep-1", "next").includes("actual_low_response"));
  assert.ok(flags(result).includes("actual_response_stop"));
});

test("correction-sensitive current rows, trusted context facts, topic settings and actual basis are respected", async () => {
  const source = await sourcePromise;
  const result = derivePwqe51Flags(source, input({
    episodes: [ep("ep-1"), ep("typical", { status: "typical", basis: "typical" })],
    currentResponses: [
      answer("D07", "D07.more"),
      answer("D08", "D08.after", "ep-1", "next"),
      answer("D07", "D07.more", "ep-1", "next"),
      answer("D65", "D65.patient"),
      answer("M20", "M20.ask"),
      answer("M14", "M14.choice"),
      answer("M24", "M24.helped"),
      answer("D04", "D04.done"),
      answer("D18", "D18.need", "typical"),
    ],
    currentContextFacts: [
      { episodeId: "ep-1", fact: "bothersome_comment", value: true },
      { episodeId: "ep-1", fact: "need_became_known", value: false },
    ],
    enabledTopics: ["body_detail"],
  }));
  const actual = new Set(flags(result));
  assert.ok(actual.has("actual_next_move"));
  assert.ok(actual.has("actual_feeling_episode"));
  assert.ok(actual.has("actual_need_disclosure"), "false context correction does not erase independent M20 evidence");
  assert.ok(actual.has("actual_easing"));
  assert.ok(actual.has("actual_received_repair"));
  assert.ok(actual.has("actual_bothersome_comment"));
  assert.ok(actual.has("body_detail_allowed"));
  assert.deepEqual(flags(result, "typical"), [], "typical episodes cannot create actualness flags");
});

test("comparison flags are bound to ordered, explicitly distinct actual episode pairs", async () => {
  const source = await sourcePromise;
  const episodes = [ep("a"), ep("b", { distinctFrom: ["a"] }), ep("not-actual", { status: "typical", basis: "typical", distinctFrom: ["a"] })];
  const result = derivePwqe51Flags(source, input({
    episodes,
    currentResponses: [
      answer("M02", "M02.rehearse", "a"),
      answer("M09", "M09.conflict", "a"),
      answer("D54", "D54.rehearse", "b"),
    ],
  }));
  const pairFlags = new Set(result.comparisonFlagsByPair[pwqe51ComparisonPairKey("a", "b")]);
  assert.ok(pairFlags.has("two_distinct_actual_episodes"));
  assert.ok(pairFlags.has("matched_reported_behavior"));
  assert.ok(pairFlags.has("reported_candidate_trigger"));
  assert.equal(result.comparisonFlagsByPair[pwqe51ComparisonPairKey("a", "not-actual")], undefined);

  const unmatched = derivePwqe51Flags(source, input({
    episodes,
    currentResponses: [answer("M02", "M02.rehearse", "a"), answer("D54", "D54.none", "b")],
  }));
  assert.deepEqual(unmatched.comparisonFlagsByPair[pwqe51ComparisonPairKey("a", "b")], ["two_distinct_actual_episodes"]);
});

test("rebound responses use the first step and malformed or unknown evidence is rejected", async () => {
  const source = await sourcePromise;
  const rebound = derivePwqe51Flags(source, input({
    episodes: [ep("destination"), ep("origin")],
    currentResponses: [answer("D07", "D07.more", "destination", "next", { administrationEpisodeId: "origin" })],
  }));
  assert.ok(flags(rebound, "destination", "first").includes("actual_selected_step"));
  assert.ok(!flags(rebound, "destination", "next").includes("actual_selected_step"));

  assert.throws(() => derivePwqe51Flags(source, input({
    currentResponses: [answer("D34", "D34.not_an_option")],
  })), /outside its pinned item/u);
  assert.throws(() => derivePwqe51Flags(source, input({
    currentResponses: [answer("D34", "D34.words", "missing")],
  })), /missing episode lineage/u);
});

test("an authored flag without a literal server-side derivation fails closed", async () => {
  const source = await sourcePromise;
  const altered = structuredClone(source) as unknown as { itemGates: { gates: Record<string, Record<string, unknown>> } };
  altered.itemGates.gates.D34!.required_flags = ["client_supplied_flag"];
  assert.throws(() => derivePwqe51Flags(altered as unknown as typeof source, input()), /unsupported required flags: client_supplied_flag/u);
});
