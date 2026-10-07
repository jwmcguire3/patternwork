import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe5SourcePackage } from "../../lib/question-engine/pwqe5-source.ts";
import {
  compilePwqe5Route,
  pwqe5RouteFingerprint,
  type Pwqe5CanonicalResponse,
} from "../../lib/server/assessment/pwqe5-router.ts";

const sourcePromise = loadPwqe5SourcePackage();
function answer(responseId: string, questionId: string, optionId: string, occurrenceId = "E1", stepId = "first", extra: Partial<Pwqe5CanonicalResponse> = {}): Pwqe5CanonicalResponse {
  return { responseId, questionId, occurrenceId, stepId, selectedOptionIds: [optionId], ...extra };
}

test("practical information seeking closes contact probing with an ordinary alternative", async () => {
  const source = await sourcePromise;
  const result = compilePwqe5Route({ phase: "deepening", responses: [
    answer("r1", "M17", "M17.check"),
    answer("r2", "M18", "M18.info"),
  ] }, source);
  const contact = result.targets.find((target) => target.targetId === "contact_function" && target.occurrenceId === "E1");
  assert.equal(contact?.state, "supports_alternative");
  assert.equal(contact?.reason, "ordinary_or_contextual_explanation_recorded");
  assert.ok(!result.candidates.some((candidate) => candidate.questionId === "D43" && candidate.occurrenceId === "E1"));
});

test("the same action in distinct episodes records recurrence without merging different aims", async () => {
  const source = await sourcePromise;
  const result = compilePwqe5Route({ phase: "deepening", responses: [
    answer("a1", "M02", "M02.rehearse", "E1"),
    answer("a2", "M03", "M03.exposure", "E1"),
    answer("b1", "M02", "M02.rehearse", "E2"),
    answer("b2", "M03", "M03.requirements", "E2"),
  ] }, source);
  const recurrence = result.findings.find((finding) => finding.code === "action_recurs_in_confirmed_distinct_events");
  assert.deepEqual(recurrence?.occurrenceIds, ["E1", "E2"]);
  assert.equal(result.episodes.length, 2);
  assert.equal(result.observations.find((observation) => observation.responseId === "a2")?.reportedValue, "exposure");
  assert.equal(result.observations.find((observation) => observation.responseId === "b2")?.reportedValue, "requirements");
  assert.ok(!result.findings.some((finding) => finding.code === "same_function_across_occurrences"));
  assert.ok(result.targets.some((target) => target.targetId === "recurrence" && target.occurrenceId === "E1" && target.state === "resolved_descriptively"));
});

test("repeating an action inside one episode is not recurrence", async () => {
  const source = await sourcePromise;
  const result = compilePwqe5Route({ phase: "deepening", responses: [
    answer("a1", "M02", "M02.rehearse", "E1", "first"),
    answer("a2", "M02", "M02.rehearse", "E1", "next"),
  ] }, source);
  assert.equal(result.episodes.length, 1);
  assert.ok(!result.findings.some((finding) => finding.code === "action_recurs_in_confirmed_distinct_events"));
});

test("overlap and unknown order stay explicit and never support a handoff", async () => {
  const source = await sourcePromise;
  for (const [id, option, relation] of [
    ["overlap", "D08.overlap", "simultaneous"],
    ["unknown", "D08.uncertain", "order_unknown"],
  ] as const) {
    const result = compilePwqe5Route({ phase: "deepening", responses: [
      answer(`${id}-first`, "D61", "D61.explain", "E1", "first"),
      answer(`${id}-aim`, "D02", "D02.prevent", "E1", "first"),
      answer(`${id}-move`, "D07", "D07.leave", "E1", "next"),
      answer(`${id}-edge`, "D08", option, "E1", "edge"),
      answer(`${id}-next-aim`, "D09", "D09.relief", "E1", "next"),
      answer(`${id}-effect`, "D10", "D10.relief", "E1", "next"),
      answer(`${id}-capacity`, "D11", "D11.urgent", "E1", "next"),
    ] }, source);
    assert.equal(result.sequenceEdges.find((edge) => edge.responseId === `${id}-edge`)?.relation, relation);
    assert.ok(!result.findings.some((finding) => finding.code === "preventive_to_relief_handoff_support"));
    if (option === "D08.uncertain") assert.equal(result.targets.find((target) => target.targetId === "sequence_relation")?.state, "unresolved");
  }
});

test("a handoff needs same-episode prevention, after-failure order, and a changed relief aim", async () => {
  const source = await sourcePromise;
  const responses = [
    answer("h1", "D61", "D61.explain", "E1", "first"),
    answer("h2", "D02", "D02.prevent", "E1", "first"),
    answer("h3", "D07", "D07.leave", "E1", "next"),
    answer("h4", "D08", "D08.after_failed", "E1", "edge"),
    answer("h5", "D09", "D09.relief", "E1", "next"),
    answer("h6", "D10", "D10.relief", "E1", "next"),
    answer("h7", "D11", "D11.urgent", "E1", "next"),
  ];
  const result = compilePwqe5Route({ phase: "deepening", responses }, source);
  const handoff = result.findings.find((finding) => finding.code === "preventive_to_relief_handoff_support");
  assert.deepEqual(handoff?.occurrenceIds, ["E1"]);
  assert.ok(handoff?.responseIds.includes("h4"));
});

test("a correction recomputes the gate and invalidates a descendant that no longer applies", async () => {
  const source = await sourcePromise;
  const result = compilePwqe5Route({ phase: "deepening", responses: [
    answer("wants", "M26", "M26.contact"),
    answer("action", "M27", "M27.first"),
    answer("wants-corrected", "M26", "M26.sequential", "E1", "first", { supersedesResponseId: "wants" }),
  ] }, source);
  assert.deepEqual(result.supersededResponseIds, ["wants"]);
  assert.ok(result.invalidatedResponses.some((entry) => entry.responseId === "action" && entry.reason === "authored_gate_excluded_after_correction"));
  assert.ok(!result.observations.some((observation) => observation.responseId === "action"));
});

test("authored missingness has no selections and remains visible in the packet projection", async () => {
  const source = await sourcePromise;
  const result = compilePwqe5Route({ phase: "deepening", responses: [{ responseId: "miss", questionId: "M17", occurrenceId: "E1", status: "no_event" }] }, source);
  assert.deepEqual(result.observations, []);
  assert.deepEqual(result.missingness, [{ responseId: "miss", questionId: "M17", occurrenceId: "E1", status: "no_event" }]);
  assert.equal(result.episodes[0]?.status, "missing");
  assert.throws(() => compilePwqe5Route({ responses: [{ responseId: "bad", questionId: "M17", occurrenceId: "E1", status: "skip", selectedOptionIds: ["M17.check"] }] }, source), /Missingness cannot include selected answers/u);
});

test("explicit end and authored ceilings stop without offering another item", async () => {
  const source = await sourcePromise;
  const response = answer("one", "M01", "M01.rest");
  const ended = compilePwqe5Route({ responses: [response], controls: ["end"] }, source);
  assert.equal(ended.phase, "finished");
  assert.equal(ended.completionReason, "user_end");
  assert.equal(ended.next, null);
  const capped = compilePwqe5Route({ responses: [response], totalLimit: 1 }, source);
  assert.equal(capped.phase, "finished");
  assert.equal(capped.completionReason, "burden_ceiling");
});

test("identical answer logs compile and fingerprint deterministically", async () => {
  const source = await sourcePromise;
  const input = { phase: "deepening" as const, responses: [
    answer("r1", "M17", "M17.check"),
    answer("r2", "M18", "M18.open"),
  ] };
  const first = compilePwqe5Route(input, source);
  const second = compilePwqe5Route(structuredClone(input), source);
  assert.deepEqual(second, first);
  assert.equal(pwqe5RouteFingerprint(second), pwqe5RouteFingerprint(first));
});

test("new episodes are returned as server binding requests and become IDs only through server bindings", async () => {
  const source = await sourcePromise;
  const root = answer("root", "M02", "M02.rehearse", "server-episode-1");
  const input = { phase: "deepening" as const, responses: [root] };
  const unbound = compilePwqe5Route(input, source);
  const replay = unbound.candidates.find((candidate) => candidate.bindingKey === "replay:recurrence:server-episode-1:M02");
  assert.ok(replay, JSON.stringify(unbound.targets));
  assert.equal(replay.bindingRequest, "new_actual_occurrence");
  assert.equal(replay?.occurrenceId, null);
  const bound = compilePwqe5Route({ ...input, occurrenceBindings: { [replay!.bindingKey!]: "server-episode-2" } }, source);
  assert.equal(bound.candidates.find((candidate) => candidate.bindingKey === replay!.bindingKey)?.occurrenceId, "server-episode-2");
});

test("body detail is opt-in and attaches only to an existing actual episode", async () => {
  const source = await sourcePromise;
  const responses = [answer("event", "M17", "M17.check", "server-episode-1")];
  const declined = compilePwqe5Route({ phase: "deepening", responses }, source);
  assert.ok(!declined.candidates.some((candidate) => candidate.questionId === "D41"));
  const optedIn = compilePwqe5Route({ phase: "deepening", responses, optedInTopics: ["body_detail"] }, source);
  const body = optedIn.candidates.find((candidate) => candidate.questionId === "D41");
  assert.equal(body?.occurrenceId, "server-episode-1");
  assert.equal(body?.bindingRequest, undefined);
  assert.ok(body?.bindingKey?.startsWith("entry:body_detail"));
  const alreadyAnswered = compilePwqe5Route({
    phase: "deepening",
    responses: [...responses, answer("body-answer", "D41", "D41.none", "server-episode-1")],
    optedInTopics: ["body_detail"],
  }, source);
  assert.ok(!alreadyAnswered.candidates.some((candidate) => candidate.questionId === "D41"));
  const noActualEpisode = compilePwqe5Route({ phase: "deepening", responses: [], optedInTopics: ["body_detail"] }, source);
  assert.ok(!noActualEpisode.candidates.some((candidate) => candidate.questionId === "D41"));
});

test("entry candidates use their persisted occurrence binding and suppress an answered item there", async () => {
  const source = await sourcePromise;
  const responses = [answer("prior", "M17", "M17.check", "server-episode-1")];
  const input = { phase: "deepening" as const, responses, optedInTopics: ["disclosure"] };
  const unbound = compilePwqe5Route(input, source);
  const entry = unbound.candidates.find((candidate) => candidate.questionId === "D47");
  assert.equal(entry?.bindingRequest, "new_actual_occurrence");
  assert.equal(entry?.occurrenceId, null);
  const bound = compilePwqe5Route({ ...input, occurrenceBindings: { "entry:disclosure": "server-episode-2" } }, source);
  assert.equal(bound.candidates.find((candidate) => candidate.questionId === "D47")?.occurrenceId, "server-episode-2");
  const answeredOnBoundEpisode = compilePwqe5Route({
    ...input,
    occurrenceBindings: { "entry:disclosure": "server-episode-2" },
    responses: [...responses, answer("disclosure-answer", "D47", "D47.light", "server-episode-2")],
  }, source);
  assert.ok(!answeredOnBoundEpisode.candidates.some((candidate) => candidate.questionId === "D47"));
});

test("polarization targets require simultaneous wants and an actual move; not_sure stays unresolved", async () => {
  const source = await sourcePromise;
  const oneSided = compilePwqe5Route({ phase: "deepening", responses: [answer("wants", "M26", "M26.sequential")] }, source);
  assert.ok(!oneSided.targets.some((target) => target.targetId.startsWith("polarization_")));
  assert.ok(!oneSided.candidates.some((candidate) => ["D12", "D13", "D14"].includes(candidate.questionId)));

  const unresolved = compilePwqe5Route({ phase: "deepening", responses: [
    answer("wants", "M26", "M26.contact"),
    answer("move", "M27", "M27.first"),
    { responseId: "unknown", questionId: "D12", occurrenceId: "E1", status: "not_sure" },
  ] }, source);
  assert.equal(unresolved.targets.find((target) => target.targetId === "polarization_relation")?.state, "unresolved");
  assert.equal(unresolved.targets.find((target) => target.targetId === "polarization_relation")?.reason, "discriminator_not_sure");
});

test("all nine authored fictional paths project as partial answer segments", async () => {
  const source = await sourcePromise;
  const worked = source.workedPaths as { readonly profiles: readonly { readonly id: string; readonly answers: readonly Record<string, unknown>[] }[] };
  assert.equal(worked.profiles.length, 9);
  for (const profile of worked.profiles) {
    const responses = profile.answers.map((entry) => ({
      responseId: String(entry.id),
      questionId: String(entry.item_id),
      occurrenceId: String(entry.occurrence_id),
      stepId: String(entry.step_id ?? "first"),
      selectedOptionIds: entry.selected as readonly string[],
      status: entry.status as Pwqe5CanonicalResponse["status"],
      mode: entry.mode as Pwqe5CanonicalResponse["mode"],
    }));
    const result = compilePwqe5Route({ phase: "deepening", responses }, source);
    assert.equal(result.administrationCount, profile.answers.length, `${profile.id} is a partial segment with each authored presentation retained`);
    assert.equal(result.episodes.length, new Set(profile.answers.map((entry) => String(entry.occurrence_id))).size, `${profile.id} preserves occurrence count`);
    assert.ok(result.observations.length > 0, `${profile.id} projects literal options`);
    assert.ok(result.observations.every((observation) => responses.some((response) => response.responseId === observation.responseId && response.selectedOptionIds?.includes(observation.optionId))));
  }
});

test("negative-case table projects P01-P09 and N01-N14 as bounded counterexamples", async () => {
  const source = await sourcePromise;
  const worked = source.workedPaths as { readonly profiles: readonly { readonly id: string; readonly answers: readonly Record<string, unknown>[] }[] };
  const negativeCases = source.negativeCases as readonly { readonly id: string; readonly profile: string; readonly evidence_indices: readonly number[] }[];
  const profileById = new Map(worked.profiles.map((profile) => [profile.id, profile]));
  assert.equal(negativeCases.length, 14);
  const projectedProfileIds = new Set(negativeCases.map((entry) => entry.profile).filter((id) => profileById.has(id)));
  assert.deepEqual([...projectedProfileIds].sort(), ["P02", "P04", "P05", "P06", "P08", "P09"]);
  for (const fixture of negativeCases) {
    const profile = profileById.get(fixture.profile);
    if (profile) {
      const responses = profile.answers.map((entry) => ({
        responseId: String(entry.id), questionId: String(entry.item_id), occurrenceId: String(entry.occurrence_id),
        stepId: String(entry.step_id ?? "first"), selectedOptionIds: entry.selected as readonly string[],
        status: entry.status as Pwqe5CanonicalResponse["status"], mode: entry.mode as Pwqe5CanonicalResponse["mode"],
      }));
      const result = compilePwqe5Route({ phase: "deepening", responses }, source);
      for (const index of fixture.evidence_indices) assert.ok(index >= 1 && index <= profile.answers.length, `${fixture.id} references a present one-based branch answer`);
      if (fixture.id === "N03") assert.equal(result.episodes.length, 1, "five observations on E1 remain one event");
      if (fixture.id === "N04") assert.ok(!result.findings.some((finding) => finding.code === "reactive_relief_function_support"), "blocked speech and stopping do not establish escape function");
      if (fixture.id === "N13") assert.ok(result.findings.some((finding) => finding.code === "preventive_function_support"), "preventive purpose can remain present during conflict pressure");
      if (fixture.id === "N14") assert.ok(result.observations.some((observation) => observation.optionId === "D09.none"), "no clear conscious aim stays a literal answer beside any inferred function");
      if (fixture.id === "N01") assert.ok(result.targets.some((target) => target.targetId === "contact_function" && target.state === "supports_alternative"), "the practical account closes the relationship-probing branch");
      if (fixture.id === "N05") assert.ok(!JSON.stringify(result).toLowerCase().includes("childhood"), "current burden concern does not create historical origin evidence");
      continue;
    }
    const synthetic: Record<string, readonly Pwqe5CanonicalResponse[]> = {
      N02: [answer("first", "D61", "D61.explain"), answer("aim", "D02", "D02.prevent"), answer("next", "D07", "D07.leave", "E1", "next"), answer("edge", "D08", "D08.overlap", "E1", "edge"), answer("next-aim", "D09", "D09.relief", "E1", "next"), answer("effect", "D10", "D10.relief", "E1", "next"), answer("capacity", "D11", "D11.urgent", "E1", "next")],
      N06: [answer("wait", "M17", "M17.check"), answer("duration", "D45", "D45.return")],
      N07: [answer("first", "D61", "D61.explain"), answer("next", "D07", "D07.leave", "E1", "next"), answer("cost", "D06", "D06.none", "E1", "next")],
      N08: [answer("notice", "D33", "D33.body")],
      N09: [answer("wants", "M26", "M26.contact"), answer("move", "M27", "M27.first"), answer("relation", "D12", "D12.ordinary")],
      N10: [answer("name", "M02", "M02.rehearse")],
      N11: [answer("event", "M17", "M17.check")],
      N12: [answer("one", "M02", "M02.rehearse", "E1"), answer("two", "M02", "M02.rehearse", "E2")],
    };
    const responses = synthetic[fixture.id];
    assert.ok(responses, `${fixture.id} has a bounded synthetic counterexample branch`);
    const result = compilePwqe5Route({ phase: "deepening", responses: responses! }, source);
    if (fixture.id === "N02") assert.ok(!result.findings.some((finding) => finding.code === "preventive_to_relief_handoff_support"));
    if (fixture.id === "N06") assert.ok(!result.findings.some((finding) => finding.code.includes("reassurance_never_works")));
    if (fixture.id === "N07") assert.ok(!result.findings.some((finding) => finding.code.includes("hidden_cost")));
    if (fixture.id === "N08") assert.equal(result.sequenceEdges.length, 0, "being noticed first does not create causal sequence edges");
    if (fixture.id === "N09") assert.ok(!result.findings.some((finding) => finding.code === "opposing_wants_obstruct_each_other"));
    if (fixture.id === "N10") assert.ok(!result.findings.some((finding) => finding.code === "respondent_disputed"));
    if (fixture.id === "N11") assert.ok(!result.candidates.some((candidate) => candidate.questionId === "D41"));
    if (fixture.id === "N12") assert.ok(!("prevalence" in result) && !("rate" in result));
  }
});
