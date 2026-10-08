import assert from "node:assert/strict";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { loadPwqe51SourcePackage } from "@/lib/question-engine";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "@/lib/server/assessment/pwqe51-router";
import { buildPwqe51RouterPacket, verifyPwqe51PacketDigest } from "@/lib/server/reports/pwqe51-packet";
import { preparePwrp71Request } from "@/lib/server/reports/pwrp71-adapter";
import { loadPwrp71SourcePackage } from "@/lib/server/reports/pwrp71-source";

test("builds a source-bound PWQE 5.1 packet with schema-valid evidence and a stable digest", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "r-actual", questionId: item.id, occurrenceId: "episode-actual", stepId: "first", selectedOptionIds: [item.options[0].id], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "r-typical", questionId: item.id, occurrenceId: "episode-typical", stepId: "first", selectedOptionIds: [item.options[1].id], status: "answered", mode: "single", basis: "reported_typicality" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "mapping" }, source);
  const packet = buildPwqe51RouterPacket({ snapshotId: "snapshot-51", responses, routerResult, pass: 1, controls: [], source });

  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(source.schemas.routerPacket);
  assert.equal(validate(packet), true, JSON.stringify(validate.errors));
  assert.equal(packet.release_id, "PWQE-5.1.0-candidate.1");
  assert.deepEqual(packet.source_binding, {
    question_release: "PWQE-5.1.0-candidate.1",
    runtime_version: "PW-ROUTER-1.1.0-candidate.1",
    source_sha256: "a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832",
  });
  assert.equal(verifyPwqe51PacketDigest(packet), true);
  assert.equal((packet.administration_provenance as Array<{ live_response_id: string }>).length, 2);
  assert.deepEqual((packet.administration_provenance as Array<{ live_response_id: string }>).map((entry) => entry.live_response_id), ["r-actual", "r-typical"]);
  assert.deepEqual((packet.episodes as Array<{ id: string; basis: string }>).map(({ id, basis }) => [id, basis]), [
    ["episode-actual", "actual_recalled"],
    ["episode-typical", "reported_typicality"],
  ]);
  const tampered = { ...packet, assessment_scope: { ...(packet.assessment_scope as object), phase: "deepening" } };
  assert.equal(verifyPwqe51PacketDigest(tampered), false);

  const reportSource = await loadPwrp71SourcePackage();
  const prepared = preparePwrp71Request({ packet: packet as never, reportType: "MAP", questionSource: source, reportSource });
  assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  if (prepared.ok) assert.equal("administration_provenance" in prepared.value.user_data, false);
});

test("packet retains current response lineage and excludes superseded answers from provider evidence", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const original = item.options.find((option) => option.id === "M01.rest")!;
  const replacement = item.options.find((option) => option.id === "M01.own_pace")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "old", questionId: item.id, occurrenceId: "episode-1", stepId: "first", selectedOptionIds: [original.id], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "corrected", questionId: item.id, occurrenceId: "episode-1", stepId: "first", selectedOptionIds: [replacement.id], status: "answered", mode: "single", basis: "actual_recalled", supersedesResponseId: "old" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "mapping" }, source);
  const packet = buildPwqe51RouterPacket({ snapshotId: "snapshot-correction", responses, routerResult, pass: 1, controls: [], source });
  assert.deepEqual(packet.superseded_response_ids, ["old"]);
  assert.deepEqual((packet.administration_provenance as Array<{ live_response_id: string }>).map((entry) => entry.live_response_id), ["corrected"]);
  assert.equal((packet.observations as Array<{ response_id: string }>).some((entry) => entry.response_id === "old"), false);
  const prepared = preparePwrp71Request({
    packet: packet as never,
    reportType: "MAP",
    questionSource: source,
    reportSource: await loadPwrp71SourcePackage(),
  });
  assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  if (prepared.ok) assert.equal((prepared.value.user_data.observations as Array<{ response_id: string }>).some((entry) => entry.response_id === "old"), false);
});

test("packet preserves every respondent C07 outcome and counts only confirmed-independent pair support", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "pair-a", questionId: item.id, occurrenceId: "episode-a", stepId: "first", selectedOptionIds: ["M01.rest"], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "pair-b", questionId: item.id, occurrenceId: "episode-b", stepId: "first", selectedOptionIds: ["M01.own_pace"], status: "answered", mode: "single", basis: "actual_recalled" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "deepening" }, source);
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(source.schemas.routerPacket);
  const reportSource = await loadPwrp71SourcePackage();
  for (const relation of ["different", "same", "cannot_tell"] as const) {
    const packet = buildPwqe51RouterPacket({
      snapshotId: `snapshot-c07-${relation}`,
      responses,
      routerResult,
      pass: 2,
      controls: [],
      comparisonDecisions: [{ firstOccurrenceId: "episode-a", secondOccurrenceId: "episode-b", relation }],
      source,
    });
    assert.equal(validate(packet), true, JSON.stringify(validate.errors));
    assert.deepEqual(packet.context_comparisons, [{
      occurrence_id: "episode-b",
      distinct_from: relation === "different" ? ["episode-a"] : [],
      linked_from: "episode-a",
      basis: relation === "different" ? "respondent_confirmed_distinctness"
        : relation === "same" ? "respondent_confirmed_same_occurrence" : "respondent_cannot_tell_distinctness",
    }]);
    const readiness = (packet.assessment_scope as { readiness: { usable_actual_occurrences: number } }).readiness;
    assert.equal(readiness.usable_actual_occurrences, relation === "different" ? 2 : 1);
    const comparedEpisode = (packet.episodes as Array<{ id: string; linked_from: string | null; distinct_from: string[] }>).find((episode) => episode.id === "episode-b");
    assert.equal(comparedEpisode?.linked_from, "episode-a");
    assert.deepEqual(comparedEpisode?.distinct_from, relation === "different" ? ["episode-a"] : []);
    const prepared = preparePwrp71Request({ packet: packet as never, reportType: "MAP", questionSource: source, reportSource });
    assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  }
});

test("packet rejects C07 comparisons outside the current actual episode pair", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "pair-a", questionId: item.id, occurrenceId: "episode-a", stepId: "first", selectedOptionIds: ["M01.rest"], status: "answered", mode: "single", basis: "actual_recalled" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "mapping" }, source);
  assert.throws(() => buildPwqe51RouterPacket({
    snapshotId: "snapshot-c07-stale",
    responses,
    routerResult,
    pass: 2,
    controls: [],
    comparisonDecisions: [{ firstOccurrenceId: "episode-a", secondOccurrenceId: "deleted-episode", relation: "different" }],
    source,
  }), /current actual recalled episodes/);
});

test("rejects router results from stale question source lineage", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "r-current", questionId: item.id, occurrenceId: "episode-current", stepId: "first", selectedOptionIds: [item.options[0].id], status: "answered", mode: "single", basis: "actual_recalled" },
  ];
  const route = compilePwqe51Route({ responses, phase: "mapping" }, source);
  assert.throws(() => buildPwqe51RouterPacket({
    snapshotId: "snapshot-stale",
    responses,
    routerResult: { ...route, sourceRelease: "PWQE-5.0.0-design.1" },
    pass: 1,
    controls: [],
    source,
  }), /stale or mismatched source lineage/);
});

test("rejects observation evidence that no longer matches the canonical response log", async () => {
  const source = await loadPwqe51SourcePackage();
  const item = source.questionBank.items.find((question) => question.id === "M01")!;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "r-current", questionId: item.id, occurrenceId: "episode-current", stepId: "first", selectedOptionIds: [item.options[0].id], status: "answered", mode: "single", basis: "actual_recalled" },
  ];
  const route = compilePwqe51Route({ responses, phase: "mapping" }, source);
  const observations = route.observations.map((observation) => ({ ...observation, responseId: "r-obsolete" }));
  assert.throws(() => buildPwqe51RouterPacket({
    snapshotId: "snapshot-lineage",
    responses,
    routerResult: { ...route, observations },
    pass: 1,
    controls: [],
    source,
  }), /stale or mismatched source lineage|stale or has no canonical answer/);
});

test("current replay-derived distinctness survives packet construction and 7.1 adapter", async () => {
  const source = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "first-review", questionId: "M02", occurrenceId: "review-one", stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "second-review", questionId: "M02", occurrenceId: "review-two", stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered", mode: "single", basis: "actual_recalled", replayOfOccurrenceId: "review-one" },
  ];
  const routerResult = compilePwqe51Route({
    responses, phase: "deepening", distinctPairs: [["review-one", "review-two"]],
    episodeLinks: [{ occurrenceId: "review-two", linkedFrom: "review-one" }],
  }, source);
  const packet = buildPwqe51RouterPacket({
    snapshotId: "replayed-comparison", responses, routerResult, pass: 2, controls: [], source,
  });
  const episodes = packet.episodes as Array<{ id: string; linked_from: string | null; distinct_from: string[] }>;
  assert.equal(episodes.find((row) => row.id === "review-two")?.linked_from, "review-one");
  const comparisons = packet.context_comparisons as Array<{ occurrence_id: string; basis: string; distinct_from: string[] }>;
  assert.ok(comparisons.some((row) => row.occurrence_id === "review-two"
    && row.basis === "respondent_confirmed_distinctness" && row.distinct_from.includes("review-one")));
  const result = preparePwrp71Request({ packet: packet as never, reportType: "MAP", questionSource: source, reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));
});
