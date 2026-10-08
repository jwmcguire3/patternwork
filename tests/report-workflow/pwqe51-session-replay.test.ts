import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPwqe51SourcePackage } from "@/lib/question-engine";
import { loadPwrp71SourcePackage } from "@/lib/server/reports/pwrp71-source";
import { replayFictionalPwqe51Session, type FictionalHistoryV2 } from "@/lib/server/reports/qualification/session-replay";
import { verifyPwqe51PacketDigest } from "@/lib/server/reports/pwqe51-packet";
import {
  advancePwqe51Session,
  applyPwqe51ReplayBinding,
  createPwqe51SessionState,
  endPwqe51Session,
  renderPwqe51Interaction,
  startPwqe51Deepening,
  type Pwqe51SessionState,
} from "@/lib/server/assessment/pwqe51-session";

interface C07Plan {
  readonly config: { readonly topics: readonly string[]; readonly details: readonly string[]; readonly people?: Readonly<Record<string, string>>; readonly referents?: Readonly<Record<string, string>> };
  readonly answers: Readonly<Record<string, readonly { readonly selected: readonly string[] }[]>>;
}

interface V3Manifest {
  readonly profiles: readonly { readonly profileId: string; readonly mapping: string; readonly deepening: string; readonly mappingPacketAccepted: boolean; readonly firstDivergence: string | null }[];
}
interface V3Artifact {
  readonly profileId: string;
  readonly replay: {
    readonly state: {
      readonly referentRolesByOccurrenceSlot?: Readonly<Record<string, string>>;
      readonly routerResult?: { readonly episodes: readonly { readonly id: string; readonly linkedFrom?: string; readonly distinctFrom?: readonly string[] }[] };
    };
    readonly completeness: { readonly mapping: string; readonly deepening: string; readonly sessionPhase: string };
    readonly occurrenceReferenceToServerId: Readonly<Record<string, string>>;
    readonly submittedSourceToRuntimeResponses: readonly { readonly sourceResponseId: string; readonly questionId: string; readonly occurrenceId: string }[];
    readonly routingDecisionTrace: readonly { readonly phase: string; readonly candidate: { readonly questionId: string; readonly occurrenceId: string | null }; readonly result: string }[];
    readonly replayAndDistinctnessDecisions: readonly { readonly sourceOccurrenceId?: string; readonly replayOccurrenceId?: string; readonly outcome?: string }[];
    readonly unreachedOriginalAnswers: readonly { readonly responseId: string; readonly questionId: string; readonly classification: string; readonly reason: string }[];
    readonly episodeRegistry: readonly { readonly fixtureOccurrenceReference: string; readonly serverOccurrenceId?: string; readonly linkedFrom?: string; readonly distinctFrom?: readonly string[] }[];
    readonly sequenceGraph: readonly { readonly occurrenceId: string; readonly fromStep: string; readonly toStep: string }[];
    readonly comparisonDecisions: readonly { readonly firstOccurrenceId: string; readonly secondOccurrenceId: string; readonly relation: string }[];
  };
  readonly declaredFictionalDecisions: {
    readonly comparisonBindingIntents: readonly { readonly responseId: string; readonly comparisonOccurrenceIds: readonly [string, string] }[];
  };
  readonly authoredAnswerDisposition: readonly { readonly responseId: string; readonly questionId: string; readonly classification: string; readonly reason: string }[];
}

async function p01(): Promise<FictionalHistoryV2> {
  return JSON.parse(await readFile("qualification/pwrp71/constructed_histories_v2/P01.json", "utf8")) as FictionalHistoryV2;
}

async function fixture(profileId: string): Promise<FictionalHistoryV2> {
  return JSON.parse(await readFile(`qualification/pwrp71/constructed_histories_v2/${profileId}.json`, "utf8")) as FictionalHistoryV2;
}

async function routeArtifact(profileId: string): Promise<V3Artifact> {
  return JSON.parse(await readFile(`qualification/pwrp71/route_replays_v3/${profileId}.json`, "utf8")) as V3Artifact;
}

async function routeManifest(): Promise<V3Manifest> {
  return JSON.parse(await readFile("qualification/pwrp71/route_replays_v3/manifest.json", "utf8")) as V3Manifest;
}

async function c07ReplayPending(questionSource: Awaited<ReturnType<typeof loadPwqe51SourcePackage>>) {
  const raw = JSON.parse(await readFile("specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json", "utf8")) as { plans: readonly (C07Plan & { readonly id: string })[] };
  const plan = raw.plans.find((entry) => entry.id === "C07");
  assert.ok(plan);
  const used = new Map<string, number>();
  let serial = 0;
  let state = createPwqe51SessionState(questionSource);
  const answerCurrent = () => {
    const current = renderPwqe51Interaction(state, questionSource);
    assert.ok(current);
    const question = questionSource.questionBank.items.find((item) => item.id === current.questionId)!;
    const slot = question.prompt.match(/\{([a-z_]+)\}/u)?.[1];
    const personId = slot ? plan.config.referents?.[slot] : undefined;
    const personRole = personId ? plan.config.people?.[personId] : undefined;
    const role = current.referentSlotRequired ? current.referentRoleOptions?.find((option) => option.id === personRole)?.id : undefined;
    const index = used.get(current.questionId) ?? 0;
    const selected = plan.answers[current.questionId]?.[index]?.selected;
    if (selected) used.set(current.questionId, index + 1);
    state = advancePwqe51Session(state, {
      responseId: `session-replay-c07-${serial++}`,
      completionState: selected ? "COMPLETED" : "SKIPPED",
      selectedOptionIds: selected ?? [],
      ...(selected && current.rootBasisRequired ? { basis: "actual_recalled" as const } : {}),
      ...(role ? { referentRole: role } : {}),
    }, questionSource);
  };
  for (let count = 0; count < 24 && !state.responses.some((response) => response.questionId === "M03" && response.status === "answered"); count += 1) answerCurrent();
  const firstRoot = state.responses.find((response) => response.questionId === "M02" && response.status === "answered");
  assert.ok(firstRoot);
  state = endPwqe51Session(state, questionSource);
  state = startPwqe51Deepening(state, plan.config.topics, questionSource, { focusOccurrences: [firstRoot.occurrenceId], details: plan.config.details });
  for (let count = 0; count < 24 && state.routerResult.next?.bindingRequest !== "confirm_replay_distinctness"; count += 1) answerCurrent();
  assert.equal(state.routerResult.next?.bindingRequest, "confirm_replay_distinctness");
  assert.equal(state.currentInteraction, null);
  const firstOccurrenceId = state.responses.find((response) => response.questionId === "M02" && response.status === "answered")!.occurrenceId;
  return {
    get state() { return state; },
    firstOccurrenceId,
    setState(next: Pwqe51SessionState) { state = next; },
    answerNext() { answerCurrent(); return state; },
  };
}

test("fictional replay issues and accepts Mapping responses through the session lifecycle and resumes from JSON", async () => {
  const [history, questionSource, reportSource] = await Promise.all([
    p01(), loadPwqe51SourcePackage(), loadPwrp71SourcePackage(),
  ]);
  const uninterrupted = replayFictionalPwqe51Session({ history, questionSource, reportSource });

  assert.equal(uninterrupted.mappingComplete, true);
  assert.equal(uninterrupted.state.responses.length, 30);
  assert.equal(uninterrupted.routingTrace.filter((entry) => entry.phase === "mapping" && entry.result === "accepted").length, 30);
  assert.ok(uninterrupted.routingTrace.every((entry) => entry.renderedQuestionId === entry.candidate.questionId));
  assert.equal(uninterrupted.submitted.some((answer) => answer.provenance === "new_synthetic_mapping_response"), true);
  assert.equal(uninterrupted.submitted.some((answer) => answer.provenance === "original_authored_fictional_response"), true);
  assert.equal(uninterrupted.packets.MAP?.adapterAccepted, true, JSON.stringify(uninterrupted.packets.MAP?.issues));
  assert.equal(verifyPwqe51PacketDigest(uninterrupted.packets.MAP!.packet), true);

  const prefix = replayFictionalPwqe51Session({ history, questionSource, maxAdministrations: 10, startDeepening: false });
  assert.equal(prefix.mappingComplete, false);
  const serialized = JSON.parse(JSON.stringify(prefix.state));
  const resumed = replayFictionalPwqe51Session({
    history,
    questionSource,
    reportSource,
    initialState: serialized,
    initialOccurrenceReferenceToServerId: JSON.parse(JSON.stringify(prefix.occurrenceReferenceToServerId)),
  });
  const semanticSequence = (rows: readonly { sourceResponseId: string; questionId: string; phase: string }[]) =>
    rows.map(({ sourceResponseId, questionId, phase }) => [sourceResponseId, questionId, phase]);
  assert.deepEqual(semanticSequence([...prefix.submitted, ...resumed.submitted]), semanticSequence(uninterrupted.submitted));
  assert.equal(resumed.mappingComplete, true);
  assert.equal(resumed.packets.MAP?.adapterAccepted, true);
});

test("unreached authored answers distinguish an eligible alternate candidate from an ineligible occurrence", async () => {
  const [history, questionSource] = await Promise.all([p01(), loadPwqe51SourcePackage()]);
  const replay = replayFictionalPwqe51Session({ history, questionSource });
  const eligibleBranch = replay.unreachedOriginalAnswers.find((answer) => answer.questionId === "D04" && answer.occurrenceId === "fx_P01_E1");
  const wrongOccurrence = replay.unreachedOriginalAnswers.find((answer) => answer.questionId === "D04" && answer.occurrenceId === "fx_P01_E2");

  assert.equal(eligibleBranch?.classification, "eligible_but_not_reached");
  assert.match(eligibleBranch?.reason ?? "", /server-eligible candidate for the correct occurrence/u);
  assert.equal(wrongOccurrence?.classification, "ineligible_in_current_context");
});

test("router-selected M10 variant receives a separate synthetic Mapping response", async () => {
  const [c01, questionSource, reportSource] = await Promise.all([fixture("C01"), loadPwqe51SourcePackage(), loadPwrp71SourcePackage()]);
  const synthetic = replayFictionalPwqe51Session({ history: c01, questionSource, startDeepening: false });
  assert.equal(synthetic.mappingComplete, true);
  const syntheticM10 = synthetic.submitted.find((answer) => answer.questionId === "M10");
  assert.equal(syntheticM10?.variantId, "M10.observable");
  assert.equal(syntheticM10?.provenance, "new_synthetic_mapping_response");
  assert.match(syntheticM10?.sourceResponseId ?? "", /-ROUTER-M10\.observable$/u);
  assert.equal(synthetic.responseProvenance.find((answer) => answer.sourceResponseId === syntheticM10?.sourceResponseId)?.accepted, true);

  for (const profileId of ["P05", "C10", "C11"]) {
    const history = await fixture(profileId);
    const authored = replayFictionalPwqe51Session({ history, questionSource, reportSource, startDeepening: false });
    assert.equal(authored.mappingComplete, true, `${profileId} must structurally complete Mapping`);
    const authoredM10 = history.mappingResponses.find((response) => response.questionId === "M10");
    assert.ok(authoredM10);
    assert.equal(authored.submitted.some((answer) => answer.sourceResponseId === authoredM10.responseId), false, `${profileId} original M10 must remain unreached`);
    const replacement = authored.submitted.find((answer) => answer.questionId === "M10");
    assert.equal(replacement?.variantId, "M10.observable");
    assert.equal(replacement?.provenance, "new_synthetic_mapping_response");
    assert.notEqual(replacement?.sourceResponseId, authoredM10.responseId);
    assert.equal(authored.unreachedOriginalAnswers.find((answer) => answer.responseId === authoredM10.responseId)?.classification, "source_contract_mismatch");
    assert.equal(authored.packets.MAP?.adapterAccepted, true, `${profileId}: ${JSON.stringify(authored.packets.MAP?.issues)}`);
  }
});

test("driver applies the actual router-issued C07 replay request and preserves distinct episode lineage", async () => {
  const [history, questionSource] = await Promise.all([fixture("C07"), loadPwqe51SourcePackage()]);
  const pending = await c07ReplayPending(questionSource);
  const firstOccurrence = pending.firstOccurrenceId;
  const resumed = replayFictionalPwqe51Session({
    history,
    questionSource,
    initialState: JSON.parse(JSON.stringify(pending.state)),
    initialOccurrenceReferenceToServerId: { fx_C07_mapping_M02: firstOccurrence },
    maxAdministrations: 20,
  });
  assert.equal(resumed.replayDecisions.length, 1);
  assert.equal(resumed.replayDecisions[0]?.outcome, "different");
  assert.ok(resumed.replayDecisions[0]?.replayOccurrenceId);
  assert.equal(resumed.occurrenceReferenceToServerId.fx_C07_replay_M02_2, resumed.replayDecisions[0]?.replayOccurrenceId);
  assert.ok(resumed.state.responses.some((response) => response.questionId === "M02" && response.occurrenceId === resumed.replayDecisions[0]?.replayOccurrenceId));
});

test("C07 real session keeps replay source first and routes comparison rows on the exact confirmed pair", async () => {
  const [history, questionSource, artifact] = await Promise.all([fixture("C07"), loadPwqe51SourcePackage(), routeArtifact("C07")]);
  const route = await c07ReplayPending(questionSource);
  const decisionId = `pwrb_${"a".repeat(40)}`;
  let state = applyPwqe51ReplayBinding(route.state, {
    decisionId,
    requestSha256: "b".repeat(64),
    outcome: "different",
  }, questionSource);
  const replayOccurrenceId = state.currentInteraction?.occurrenceId;
  assert.equal(state.currentInteraction?.questionId, "M02");
  assert.ok(replayOccurrenceId);
  assert.equal(state.replayBindingHistory?.[0]?.sourceOccurrenceId, route.firstOccurrenceId);
  assert.equal(state.replayBindingHistory?.[0]?.outcome, "different");
  assert.equal(state.replayBindingHistory?.[0]?.replayOccurrenceId, replayOccurrenceId);
  route.setState(state);
  state = route.answerNext();
  assert.equal(state.currentInteraction?.questionId, "M03");
  assert.equal(state.currentInteraction?.occurrenceId, replayOccurrenceId);

  let attempts = 0;
  while (!state.responses.some((response) => response.questionId === "D77" && response.status === "answered") && attempts < 60) {
    state = route.answerNext();
    attempts += 1;
  }
  assert.ok(state.responses.some((response) => response.questionId === "D56" && response.status === "answered"));
  assert.ok(state.responses.some((response) => response.questionId === "D57" && response.status === "answered"));
  assert.ok(state.responses.some((response) => response.questionId === "D77" && response.status === "answered"));
  const expectedPair = [route.firstOccurrenceId, replayOccurrenceId].sort();
  for (const questionId of ["D56", "D57", "D77"]) {
    const response = state.responses.find((candidate) => candidate.questionId === questionId && candidate.status === "answered")!;
    assert.deepEqual([...(state.routerInput.comparisonIdsByResponseId?.[response.responseId] ?? [])].sort(), expectedPair, `${questionId} must reference the exact replay pair`);
  }
  const sourceIntentPairs = new Map(artifact.declaredFictionalDecisions.comparisonBindingIntents.map((intent) => [intent.responseId, intent.comparisonOccurrenceIds]));
  for (const responseId of ["C07-SRC-D56-1", "C07-SRC-D57-1", "C07-SRC-D77-1"]) {
    assert.deepEqual(sourceIntentPairs.get(responseId), ["fx_C07_mapping_M02", "fx_C07_replay_M02_2"]);
  }
  assert.deepEqual(history.comparisonBindingIntents?.map((intent) => intent.responseId), ["C07-SRC-D56-1", "C07-SRC-D57-1", "C07-SRC-D77-1"]);
});

test("P09 and C12 preserve distinct authored episode references and never infer a merge from IDs", async () => {
  const [p09, c12, questionSource] = await Promise.all([fixture("P09"), fixture("C12"), loadPwqe51SourcePackage()]);
  const conflictReplay = replayFictionalPwqe51Session({ history: p09, questionSource });
  const d61 = p09.deepeningResponses.filter((response) => response.questionId === "D61");
  assert.equal(d61.length, 2);
  assert.notEqual(d61[0]?.occurrenceId, d61[1]?.occurrenceId);
  assert.equal(conflictReplay.submitted.some((response) => response.questionId === "D61"), false);
  assert.ok(d61.every((response) => conflictReplay.unreachedOriginalAnswers.some((row) => row.responseId === response.responseId && row.classification === "ineligible_in_current_context")));
  assert.ok(conflictReplay.state.routerResult.sequenceEdges.every((edge) => !d61.some((response) => conflictReplay.occurrenceReferenceToServerId[response.occurrenceId] === edge.occurrenceId)));

  const delayReplay = replayFictionalPwqe51Session({ history: c12, questionSource });
  const firstWait = delayReplay.occurrenceReferenceToServerId.fx_C12_mapping_M17;
  const knownDelay = delayReplay.occurrenceReferenceToServerId.fx_C12_known_delay_2;
  const d42 = delayReplay.submitted.find((response) => response.questionId === "D42");
  assert.ok(firstWait && knownDelay);
  assert.notEqual(firstWait, knownDelay);
  assert.equal(d42?.occurrenceId, knownDelay);
  assert.equal(delayReplay.state.routerResult.episodes.find((episode) => episode.id === knownDelay)?.linkedFrom, firstWait);
  assert.equal(delayReplay.referentRoleBindings.find((binding) => binding.fixtureOccurrenceReference === "fx_C12_known_delay_2" && binding.slot === "close_person")?.role, "partner");
  assert.equal(delayReplay.contextDecisions.distinctness.find((intent) => intent.otherReference === "fx_C12_known_delay_2")?.status, "unavailable");
});

test("authored focus topics reach the real Deepening router without adding answers to sparse cases", async () => {
  const questionSource = await loadPwqe51SourcePackage();
  for (const profileId of ["C03", "C04", "C13", "C15", "C16"]) {
    const history = await fixture(profileId);
    const replay = replayFictionalPwqe51Session({ history, questionSource });
    const expected = history.intendedDeepeningContext?.focusTopics ?? [];
    assert.equal(replay.mappingComplete, true, `${profileId} must reach the actual Deepening start`);
    assert.deepEqual(replay.state.routerInput.focusTopics, expected, `${profileId} must preserve authored router focus topics`);
    assert.deepEqual(replay.contextDecisions.focusTopics, expected);
    assert.equal(replay.contextDecisions.focusTopicsApplied, true);
    if (profileId === "C15" || profileId === "C16") {
      assert.ok(replay.submitted.filter((answer) => answer.phase === "deepening").every((answer) => answer.provenance === "original_authored_fictional_response"), `${profileId} must not gain invented Deepening depth`);
      const authoredDeepeningIds = new Set(history.deepeningResponses.map((answer) => answer.responseId));
      assert.ok(replay.submitted.filter((answer) => answer.phase === "deepening").every((answer) => authoredDeepeningIds.has(answer.sourceResponseId)), `${profileId} may submit only its authored Deepening rows`);
    }
  }
});

test("v3 artifacts preserve the P01/P09/C07/C12 routing and occurrence boundaries", async () => {
  const [manifest, p01, p09, c07, c12] = await Promise.all([
    routeManifest(), routeArtifact("P01"), routeArtifact("P09"), routeArtifact("C07"), routeArtifact("C12"),
  ]);
  const manifestProfile = (id: string) => manifest.profiles.find((profile) => profile.profileId === id);

  const p01Manifest = manifestProfile("P01");
  assert.equal(p01Manifest?.mapping, "complete");
  assert.equal(p01Manifest?.deepening, "partial");
  assert.equal(p01Manifest?.mappingPacketAccepted, true);
  assert.match(p01Manifest?.firstDivergence ?? "", /D16/u);
  assert.equal(p01.replay.completeness.sessionPhase, "deepening");
  assert.equal(p01.replay.completeness.deepening, "partial");
  for (const id of ["P01-A04", "P01-A05", "P01-A06"]) {
    assert.ok(p01.authoredAnswerDisposition.some((answer) => answer.responseId === id && answer.classification === "ineligible_in_current_context"));
    assert.equal(p01.replay.submittedSourceToRuntimeResponses.some((answer) => answer.sourceResponseId === id), false);
  }
  assert.ok(p01.replay.routingDecisionTrace.some((entry) => entry.phase === "deepening" && entry.candidate.questionId === "D16" && entry.result === "diverged"));

  const p09Manifest = manifestProfile("P09");
  assert.equal(p09Manifest?.mapping, "complete");
  const p09D61 = p09.replay.unreachedOriginalAnswers.filter((answer) => answer.questionId === "D61");
  assert.deepEqual(p09D61.map((answer) => answer.responseId).sort(), ["P09-A01", "P09-A07"]);
  assert.ok(p09D61.every((answer) => answer.classification === "ineligible_in_current_context" && /topic_not_opted_in/u.test(answer.reason)));
  assert.equal(p09.replay.submittedSourceToRuntimeResponses.some((answer) => answer.questionId === "D61"), false);
  assert.ok(p09.replay.episodeRegistry.some((episode) => episode.fixtureOccurrenceReference === "fx_P09_E1" && !episode.serverOccurrenceId));
  assert.ok(p09.replay.episodeRegistry.some((episode) => episode.fixtureOccurrenceReference === "fx_P09_E2" && !episode.serverOccurrenceId));
  assert.equal(p09.replay.occurrenceReferenceToServerId["fx_P09_E1"], undefined);
  assert.equal(p09.replay.occurrenceReferenceToServerId["fx_P09_E2"], undefined);
  assert.ok(p09.replay.sequenceGraph.every((edge) => edge.occurrenceId !== p09.replay.occurrenceReferenceToServerId["fx_P09_E1"] && edge.occurrenceId !== p09.replay.occurrenceReferenceToServerId["fx_P09_E2"]));

  const c07IntentByResponse = new Map(c07.declaredFictionalDecisions.comparisonBindingIntents.map((intent) => [intent.responseId, intent.comparisonOccurrenceIds]));
  const expectedPair = ["fx_C07_mapping_M02", "fx_C07_replay_M02_2"];
  for (const responseId of ["C07-SRC-D56-1", "C07-SRC-D57-1", "C07-SRC-D77-1"]) {
    assert.deepEqual(c07IntentByResponse.get(responseId), expectedPair, `${responseId} must retain the exact source-first pair`);
    assert.ok(c07.replay.unreachedOriginalAnswers.some((answer) => answer.responseId === responseId && answer.classification === "ineligible_in_current_context"));
    assert.equal(c07.replay.submittedSourceToRuntimeResponses.some((answer) => answer.sourceResponseId === responseId), false);
  }
  assert.equal(c07.replay.replayAndDistinctnessDecisions.length, 0, "the v3 profile route stops at D16 before the intended replay request");
  assert.ok(c07.replay.routingDecisionTrace.some((entry) => entry.candidate.questionId === "D16" && entry.result === "diverged"));

  const c12OriginalWait = c12.replay.occurrenceReferenceToServerId["fx_C12_mapping_M17"];
  const c12KnownDelay = c12.replay.occurrenceReferenceToServerId["fx_C12_known_delay_2"];
  assert.ok(c12OriginalWait && c12KnownDelay);
  assert.notEqual(c12OriginalWait, c12KnownDelay);
  const d42 = c12.replay.submittedSourceToRuntimeResponses.find((answer) => answer.sourceResponseId === "C12-SRC-D42-1");
  assert.equal(d42?.occurrenceId, c12KnownDelay);
  assert.equal(c12.replay.state.routerResult?.episodes.find((episode) => episode.id === c12KnownDelay)?.linkedFrom, c12OriginalWait);
  assert.equal(c12.replay.state.referentRolesByOccurrenceSlot?.[`${c12KnownDelay}\u0000close_person`], "partner");
  assert.ok(!c12.replay.state.routerResult?.episodes.find((episode) => episode.id === c12KnownDelay)?.distinctFrom?.includes(c12OriginalWait), "the v3 packet must preserve linkage without claiming unconfirmed distinctness");
});
