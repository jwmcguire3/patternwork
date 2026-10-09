import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { loadPwqe51SourcePackage } from "@/lib/question-engine";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "@/lib/server/assessment/pwqe51-router";
import { buildPwqe51RouterPacket, verifyPwqe51PacketDigest } from "@/lib/server/reports/pwqe51-packet";
import { preparePwrp71Request } from "@/lib/server/reports/pwrp71-adapter";
import { loadPwrp71SourcePackage } from "@/lib/server/reports/pwrp71-source";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function resign(packet: Record<string, unknown>): void {
  const contents = { ...packet };
  delete contents.content_sha256;
  packet.content_sha256 = createHash("sha256").update(canonical(contents), "utf8").digest("hex");
}

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

test("confirmed recurrence evidence carries only the router-confirmed pair into target lineage", async () => {
  const source = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const pair = ["review-one", "review-two"] as const;
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "review-one-root", questionId: "M02", occurrenceId: pair[0], stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "review-one-aim", questionId: "M03", occurrenceId: pair[0], stepId: "first", selectedOptionIds: ["M03.exposure"], status: "answered", mode: "single" },
    { responseId: "review-two-root", questionId: "M02", occurrenceId: pair[1], stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered", mode: "single", basis: "actual_recalled", replayOfOccurrenceId: pair[0] },
    { responseId: "review-two-aim", questionId: "M03", occurrenceId: pair[1], stepId: "first", selectedOptionIds: ["M03.exposure"], status: "answered", mode: "single" },
  ];
  const routerResult = compilePwqe51Route({
    responses,
    phase: "deepening",
    details: ["recurrence"],
    distinctPairs: [pair],
    episodeLinks: [{ occurrenceId: pair[1], linkedFrom: pair[0] }],
  }, source);
  const packet = buildPwqe51RouterPacket({ snapshotId: "confirmed-recurrence", responses, routerResult, pass: 2, controls: [], source });
  const recurrence = (packet.target_resolutions as Array<{ target_id: string; occurrence_id: string; comparison_ids: string[] }>).find((target) => target.target_id === "recurrence");
  assert.ok(recurrence);
  assert.deepEqual(recurrence.comparison_ids, pair);
  const result = preparePwrp71Request({ packet: packet as never, reportType: "IFS", questionSource: source, reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));

});

test("packet target attempt counts exclude superseded candidate answers", async () => {
  const source = await loadPwqe51SourcePackage();
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "wait-root", questionId: "M17", occurrenceId: "wait-event", stepId: "first", selectedOptionIds: ["M17.check"], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "wait-aim", questionId: "D43", occurrenceId: "wait-event", stepId: "first", selectedOptionIds: ["D43.okay"], status: "answered", mode: "single" },
    { responseId: "history-old", questionId: "D44", occurrenceId: "wait-event", stepId: "first", selectedOptionIds: ["D44.reliable"], status: "answered", mode: "single" },
    { responseId: "history-corrected", questionId: "D44", occurrenceId: "wait-event", stepId: "first", selectedOptionIds: ["D44.variable"], status: "answered", mode: "single", supersedesResponseId: "history-old" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "deepening" }, source);
  const packet = buildPwqe51RouterPacket({ snapshotId: "corrected-history", responses, routerResult, pass: 2, controls: [], source });
  const target = (packet.target_resolutions as Array<Record<string, unknown>>).find((entry) => entry.target_id === "availability_history");
  assert.ok(target);
  assert.equal(target.attempts, 1);
  assert.deepEqual(packet.superseded_response_ids, ["history-old"]);
});

test("ordered D36 recovery details project to the real router sequence sub-steps", async () => {
  const source = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const responses: Pwqe51CanonicalResponse[] = [
    { responseId: "recovery-root", questionId: "M02", occurrenceId: "recovery-event", stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered", mode: "single", basis: "actual_recalled" },
    { responseId: "recovery-order", questionId: "D36", occurrenceId: "recovery-event", stepId: "recovery", selectedOptionIds: ["D36.input", "D36.words", "D36.think"], status: "answered", mode: "ordered" },
  ];
  const routerResult = compilePwqe51Route({ responses, phase: "deepening" }, source);
  const packet = buildPwqe51RouterPacket({ snapshotId: "ordered-recovery", responses, routerResult, pass: 2, controls: [], source });
  const steps = packet.steps as Array<{ occurrence_id: string; step_id: string; observation_ids: string[] }>;
  const edges = packet.sequence_edges as Array<{ occurrence_id: string; from_step: string; to_step: string; evidence_ids: string[] }>;
  assert.deepEqual(edges.map(({ from_step, to_step }) => [from_step, to_step]), [
    ["recovery/D36.input", "recovery/D36.words"],
    ["recovery/D36.words", "recovery/D36.think"],
  ]);
  for (const edge of edges) {
    assert.ok(steps.some((step) => step.occurrence_id === edge.occurrence_id && step.step_id === edge.from_step));
    assert.ok(steps.some((step) => step.occurrence_id === edge.occurrence_id && step.step_id === edge.to_step));
    assert.equal(edge.evidence_ids.length, 2);
  }
  const result = preparePwrp71Request({ packet: packet as never, reportType: "IFS", questionSource: source, reportSource });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues));

  const relationTamper = structuredClone(packet);
  (relationTamper.sequence_edges as Array<Record<string, unknown>>)[0]!.relation = "simultaneous";
  resign(relationTamper);
  const rejectedRelation = preparePwrp71Request({ packet: relationTamper as never, reportType: "IFS", questionSource: source, reportSource });
  assert.equal(rejectedRelation.ok, false);
  if (!rejectedRelation.ok) assert.ok(rejectedRelation.issues.some((issue) => issue.code === "recovery_sequence_semantics"));

  const directionTamper = structuredClone(packet);
  const firstEdge = (directionTamper.sequence_edges as Array<Record<string, unknown>>)[0]!;
  [firstEdge.from_step, firstEdge.to_step] = [firstEdge.to_step, firstEdge.from_step];
  resign(directionTamper);
  const rejectedDirection = preparePwrp71Request({ packet: directionTamper as never, reportType: "IFS", questionSource: source, reportSource });
  assert.equal(rejectedDirection.ok, false);
  if (!rejectedDirection.ok) assert.ok(rejectedDirection.issues.some((issue) => issue.code === "recovery_sequence_semantics"));
});
