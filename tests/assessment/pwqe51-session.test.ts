import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage, type Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  advancePwqe51Session,
  applyPwqe51ReplayBinding,
  beginPwqe51Correction,
  createPwqe51SessionState,
  endPwqe51Session,
  pausePwqe51Session,
  renderPwqe51Interaction,
  resumePwqe51Session,
  shortenPwqe51Session,
  startPwqe51Deepening,
  type Pwqe51SessionState,
} from "../../lib/server/assessment/pwqe51-session.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../lib/server/assessment/pwqe51-router.ts";

const sourcePromise = loadPwqe51SourcePackage();

interface C07Fixture {
  readonly config: { readonly topics: readonly string[]; readonly details: readonly string[]; readonly people?: Readonly<Record<string, string>>; readonly referents?: Readonly<Record<string, string>> };
  readonly answers: Readonly<Record<string, readonly { readonly selected: readonly string[] }[]>>;
  readonly episode_bindings: readonly { readonly item_id: string; readonly source_item_id: string; readonly outcome: string; readonly relation: string }[];
}

async function loadC07Fixture(): Promise<C07Fixture> {
  const raw = JSON.parse(await readFile(path.join(process.cwd(), "specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json"), "utf8")) as { plans: (C07Fixture & { id: string })[] };
  const c07 = raw.plans.find((plan) => plan.id === "C07");
  assert.ok(c07, "original C07 plan fixture must remain available");
  return c07;
}

function c07PlanAnswer(plan: C07Fixture, used: Map<string, number>, questionId: string): readonly string[] | undefined {
  const index = used.get(questionId) ?? 0;
  const response = plan.answers[questionId]?.[index];
  if (!response) return undefined;
  used.set(questionId, index + 1);
  return response.selected;
}

function c07ResponseId(index: number): string { return `c07-session-response-${index}`; }

function answerCurrentFromPlan(
  state: Pwqe51SessionState,
  source: Pwqe51SourcePackage,
  plan: C07Fixture,
  used: Map<string, number>,
  responseIndex: number,
): Pwqe51SessionState {
  const current = state.currentInteraction;
  assert.ok(current, "session must have a server-issued current interaction");
  const item = renderPwqe51Interaction(state, source);
  assert.ok(item);
  const planned = c07PlanAnswer(plan, used, current.questionId);
  const question = source.questionBank.items.find((entry) => entry.id === current.questionId);
  const slot = question?.prompt.match(/\{([a-z_]+)\}/u)?.[1];
  const personId = slot ? plan.config.referents?.[slot] : undefined;
  const declaredRole = personId ? plan.config.people?.[personId] : undefined;
  const role = item.referentSlotRequired
    ? item.referentRoleOptions?.find((option) => option.id === declaredRole)?.id
      ?? item.referentRoleOptions?.find((option) => option.id !== "no_other_person")?.id
    : undefined;
  if (planned) {
    return advancePwqe51Session(state, {
      responseId: c07ResponseId(responseIndex), completionState: "COMPLETED", selectedOptionIds: planned,
      ...(item.rootBasisRequired ? { basis: "actual_recalled" as const } : {}), ...(role ? { referentRole: role } : {}),
    }, source);
  }
  return advancePwqe51Session(state, {
    responseId: c07ResponseId(responseIndex), completionState: "SKIPPED", selectedOptionIds: [], status: "skip",
    ...(role ? { referentRole: role } : {}),
  }, source);
}

async function reachC07ReplayBinding(source: Pwqe51SourcePackage, plan: C07Fixture) {
  let state = createPwqe51SessionState(source);
  const used = new Map<string, number>();
  let responseIndex = 0;
  for (let attempts = 0; attempts < 24 && !state.responses.some((response) => response.questionId === "M03" && response.status === "answered"); attempts += 1) {
    state = answerCurrentFromPlan(state, source, plan, used, responseIndex++);
  }
  const firstRoot = state.responses.find((response) => response.questionId === "M02" && response.status === "answered");
  const firstAim = state.responses.find((response) => response.questionId === "M03" && response.status === "answered");
  assert.ok(firstRoot, "the ordinary session router must admit C07's authored M02 mapping root");
  assert.ok(firstAim, "the ordinary session router must route its authored M03 child");
  const firstOccurrenceId = firstRoot.occurrenceId;
  state = endPwqe51Session(state, source);
  state = startPwqe51Deepening(state, plan.config.topics, source, {
    focusOccurrences: [firstOccurrenceId],
    details: plan.config.details,
  });
  for (let attempts = 0; attempts < 24 && state.routerResult.next?.bindingRequest !== "confirm_replay_distinctness"; attempts += 1) {
    assert.ok(state.currentInteraction, "non-binding route selection must render a current question");
    state = answerCurrentFromPlan(state, source, plan, used, responseIndex++);
  }
  assert.equal(state.routerResult.next?.bindingRequest, "confirm_replay_distinctness", "fixture responses must reach the reference-authored replay request");
  assert.equal(state.currentInteraction, null, "no replay root is rendered before distinctness is confirmed");
  return { state, used, firstOccurrenceId, responseIndex };
}

function answer(responseId: string, questionId: string, optionId: string, occurrenceId = "E1", stepId?: string, extra: Partial<Pwqe51CanonicalResponse> = {}): Pwqe51CanonicalResponse {
  return { responseId, questionId, occurrenceId, ...(stepId ? { stepId } : {}), selectedOptionIds: [optionId], ...extra };
}

test("creation binds router-issued roots and asks for explicit root basis", async () => {
  const source = await sourcePromise;
  const state = createPwqe51SessionState(source);
  assert.ok(state.currentInteraction?.occurrenceId);
  assert.match(state.currentInteraction!.occurrenceId, /^pwep_/u);
  assert.equal(renderPwqe51Interaction(state, source)?.rootBasisRequired, true);
  assert.throws(() => advancePwqe51Session(state, {
    responseId: "root-no-basis", completionState: "COMPLETED", selectedOptionIds: ["M01.rest"],
  }, source), /explicit actual_recalled or reported_typicality basis/u);
});

test("person slots require a confirmed role and render without literal placeholders or occurrence IDs", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const state = {
    ...initial,
    currentInteraction: { interactionInstanceId: "slot-prompt", questionId: "M02", occurrenceId: "private-occurrence", stepId: "first" },
  };
  const unresolved = renderPwqe51Interaction(state, source)!;
  assert.equal(unresolved.referentSlotRequired, true);
  assert.equal(unresolved.prompt, "");
  assert.ok(unresolved.referentRoleOptions?.some((option) => option.id === "supervisor"));
  assert.doesNotMatch([unresolved.prompt, unresolved.referentSlotPrompt, unresolved.context, unresolved.title, ...unresolved.options.map((option) => option.label)].join(" "), /evaluator|private-occurrence|\{[^}]+\}/u);

  const bound = {
    ...state,
    referentRolesByOccurrenceSlot: { ...state.referentRolesByOccurrenceSlot, ["private-occurrence\u0000evaluator"]: "supervisor" },
  };
  const rendered = renderPwqe51Interaction(bound, source)!;
  assert.equal(rendered.referentSlotRequired, undefined);
  assert.match(rendered.prompt, /your supervisor/u);
  assert.doesNotMatch(rendered.prompt, /\{[^}]+\}|private-occurrence|evaluator/u);
});

test("referent role is session context, and no-other-person cannot become a substantive answer", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const state = {
    ...initial,
    currentInteraction: { interactionInstanceId: "slot-answer", questionId: "M02", occurrenceId: "E-slot", stepId: "first" },
  };
  assert.throws(() => advancePwqe51Session(state, {
    responseId: "bad-no-person", completionState: "COMPLETED", selectedOptionIds: ["M02.recheck"],
    basis: "actual_recalled", referentRole: "no_other_person",
  }, source), /not applicable or skipped/u);
  const saved = advancePwqe51Session(state, {
    responseId: "role-choice", completionState: "COMPLETED", selectedOptionIds: ["M02.recheck"],
    basis: "actual_recalled", referentRole: "supervisor",
  }, source);
  assert.equal(saved.referentRolesByOccurrenceSlot["E-slot\u0000evaluator"], "supervisor");
  assert.equal(saved.responses[0]?.selectedOptionIds?.includes("supervisor"), false);
});

test("missingness remains separate and root answers retain the supplied basis", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const missing = advancePwqe51Session(initial, {
    responseId: "root-missing", completionState: "COMPLETED", selectedOptionIds: [], status: "no_event",
  }, source);
  assert.deepEqual(missing.routerResult.observations, []);
  assert.deepEqual(missing.routerResult.missingness[0], {
    responseId: "root-missing", questionId: "M01", occurrenceId: initial.currentInteraction!.occurrenceId, status: "no_event",
  });
  assert.equal(missing.routerResult.episodes.length, 0);

  const answered = advancePwqe51Session(initial, {
    responseId: "root-actual", completionState: "COMPLETED", selectedOptionIds: ["M01.rest"], basis: "actual_recalled",
  }, source);
  assert.equal(answered.responses[0]?.basis, "actual_recalled");
  assert.equal(answered.routerResult.episodes[0]?.actual, true);
});

test("single-choice limits come from the authored selection contract", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const root = answer("root", "M01", "M01.rest", "E1", undefined, { basis: "actual_recalled" });
  const route = compilePwqe51Route({ phase: "deepening", responses: [root] }, source);
  const state = {
    ...initial,
    pass: 2 as const,
    phase: "deepening" as const,
    responses: [root],
    routerResult: route,
    currentInteraction: { interactionInstanceId: "d84", questionId: "D84", occurrenceId: "E1", stepId: "recovery" },
  };
  assert.throws(() => advancePwqe51Session(state, {
    responseId: "bad-pair", completionState: "COMPLETED", selectedOptionIds: ["D84.brief", "D84.long"], mode: "simultaneous",
  }, source), /authored for a single choice/u);
});

test("D78 is answered at the router-offered return step and keeps its later edge", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const responses = [
    answer("root", "M01", "M01.rest", "E1", undefined, { basis: "actual_recalled" }),
    answer("move", "D07", "D07.leave", "E1", "next"),
    answer("order", "D08", "D08.after_failed", "E1", "edge"),
  ];
  const route = compilePwqe51Route({ phase: "deepening", responses }, source);
  const candidate = route.candidates.find((item) => item.questionId === "D78");
  assert.equal(candidate?.stepId, "return");
  const state = {
    ...initial,
    pass: 2 as const,
    phase: "deepening" as const,
    responses,
    routerResult: route,
    currentInteraction: { interactionInstanceId: "return", questionId: "D78", occurrenceId: "E1", stepId: candidate!.stepId },
  };
  const result = advancePwqe51Session(state, {
    responseId: "return-response", completionState: "COMPLETED", selectedOptionIds: ["D78.returned"],
  }, source);
  assert.equal(result.responses.at(-1)?.stepId, "return");
  assert.equal(result.routerResult.sequenceEdges.find((edge) => edge.id === "return:return-response")?.toStep, "return");
});

test("corrections supersede an active answer and preserve its explicit root basis", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const first = advancePwqe51Session(initial, {
    responseId: "root-original", completionState: "COMPLETED", selectedOptionIds: ["M01.rest"], basis: "reported_typicality",
  }, source);
  const editing = beginPwqe51Correction(first, "root-original", source);
  const corrected = advancePwqe51Session(editing, {
    responseId: "root-corrected", completionState: "COMPLETED", selectedOptionIds: ["M01.tasks"],
  }, source);
  assert.deepEqual(corrected.routerResult.supersededResponseIds, ["root-original"]);
  assert.equal(corrected.routerResult.observations.some((item) => item.responseId === "root-original"), false);
  assert.equal(corrected.responses.at(-1)?.basis, "reported_typicality");
});

test("correcting a root to missingness drops basis and records no observation", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  const first = advancePwqe51Session(initial, {
    responseId: "root-original", completionState: "COMPLETED", selectedOptionIds: ["M01.rest"], basis: "actual_recalled",
  }, source);
  const editing = beginPwqe51Correction(first, "root-original", source);
  const corrected = advancePwqe51Session(editing, {
    responseId: "root-no-event", completionState: "COMPLETED", selectedOptionIds: [], status: "no_event",
  }, source);
  assert.equal(corrected.responses.at(-1)?.basis, undefined);
  assert.equal(corrected.routerResult.observations.some((item) => item.responseId === "root-original" || item.responseId === "root-no-event"), false);
});

test("pause/resume, end, shorten, and Mapping-to-Deepening use separate pass state", async () => {
  const source = await sourcePromise;
  const initial = createPwqe51SessionState(source);
  assert.throws(() => advancePwqe51Session(pausePwqe51Session(initial), {
    responseId: "paused", completionState: "SKIPPED", selectedOptionIds: [],
  }, source), /not accepting an answer/u);
  assert.ok(resumePwqe51Session(pausePwqe51Session(initial)).currentInteraction);
  const ended = endPwqe51Session(initial, source);
  assert.equal(ended.phase, "finished");

  const responses = [
    answer("root", "M01", "M01.rest", "E1", undefined, { basis: "actual_recalled" }),
    answer("setup", "M04", "M04.check", "E1"),
    answer("stance", "M05", "M05.attack", "E1"),
  ];
  const mappingFinished = { ...initial, phase: "finished" as const, responses, routerResult: { ...initial.routerResult, phase: "finished" as const } };
  const deepening = startPwqe51Deepening(mappingFinished, ["body_detail"], source);
  assert.equal(deepening.pass, 2);
  assert.equal(deepening.phase, "deepening");
  const shortened = shortenPwqe51Session(deepening, source);
  assert.ok(shortened.controls.includes("shorten"));
});

test("replay binding outcomes remain distinct and never create an episode without a answered actual root", async () => {
  const source = await sourcePromise;
  const plan = await loadC07Fixture();
  const { state: pending } = await reachC07ReplayBinding(source, plan);
  const targetId = pending.routerResult.next!.targetIds[0]!;
  const expectedStates = {
    different: "open",
    same: "resolved_descriptively",
    unknown: "unresolved",
    no_event: "unavailable",
    skip: "declined",
  } as const;
  let serial = 0;
  for (const outcome of ["different", "same", "unknown", "no_event", "skip"] as const) {
    serial += 1;
    const next = applyPwqe51ReplayBinding(pending, {
      decisionId: `pwrb_${String(serial).padStart(40, "0")}`,
      requestSha256: String(serial).padStart(64, "0"),
      outcome,
    }, source);
    assert.equal(next.routerResult.episodes.filter((episode) => episode.actual).length, 1, `${outcome} cannot manufacture a recalled episode before its root answer`);
    assert.equal(next.responses.length, pending.responses.length, `${outcome} is a binding control, not a questionnaire administration`);
    assert.equal(next.routerResult.targets.find((target) => target.id === targetId)?.state, expectedStates[outcome]);
    if (outcome === "different") {
      assert.equal(next.currentInteraction?.questionId, "M02");
      assert.equal(next.currentInteraction?.occurrenceId === pending.currentInteraction?.occurrenceId, false);
    }
  }
  assert.throws(() => applyPwqe51ReplayBinding(createPwqe51SessionState(source), {
    decisionId: `pwrb_${"9".repeat(40)}`, requestSha256: "9".repeat(64), outcome: "different",
  }, source), /no current server-issued replay binding/u, "a client cannot choose a target/source scope without a live router binding");
});

test("original C07 fixture traverses trusted replay, attached M03, D56/D57/D77 lineage, resume, and corrections", async () => {
  const source = await sourcePromise;
  const plan = await loadC07Fixture();
  assert.ok(plan.episode_bindings.some((binding) => binding.item_id === "M02" && binding.source_item_id === "M02"
    && binding.outcome === "confirm" && binding.relation === "different"));
  const { state: pending, used, firstOccurrenceId, responseIndex: initialResponseIndex } = await reachC07ReplayBinding(source, plan);
  const bindingDecisionId = `pwrb_${"a".repeat(40)}`;
  let state = applyPwqe51ReplayBinding(pending, {
    decisionId: bindingDecisionId, requestSha256: "b".repeat(64), outcome: "different",
  }, source);
  assert.equal(state.currentInteraction?.questionId, "M02");
  const replayOccurrenceId = state.currentInteraction!.occurrenceId;
  assert.notEqual(replayOccurrenceId, firstOccurrenceId);
  assert.equal(renderPwqe51Interaction(state, source)?.rootBasisRequired, true);

  const loaded = JSON.parse(JSON.stringify(pausePwqe51Session(state))) as Pwqe51SessionState;
  const resumed = resumePwqe51Session(loaded);
  assert.equal(resumed.currentInteraction?.occurrenceId, replayOccurrenceId, "reload and resume must keep the same server-bound occurrence");
  assert.equal(resumed.replayBindingHistory?.length, 1);
  assert.equal(resumed.routerResult.next?.bindingRequest, undefined);
  assert.throws(() => applyPwqe51ReplayBinding(resumed, {
    decisionId: bindingDecisionId, requestSha256: "b".repeat(64), outcome: "different",
  }, source), /decision already exists/u, "a replayed control key cannot create a second occurrence");
  state = resumed;

  let responseIndex = initialResponseIndex;
  state = advancePwqe51Session(state, {
    responseId: c07ResponseId(responseIndex++), completionState: "COMPLETED", selectedOptionIds: c07PlanAnswer(plan, used, "M02")!,
    basis: "actual_recalled", referentRole: "supervisor",
  }, source);
  assert.equal(state.currentInteraction?.questionId, "M03", "the second M03 must attach to the replayed M02 occurrence");
  assert.equal(state.currentInteraction?.occurrenceId, replayOccurrenceId);

  let iterations = 0;
  while (!state.responses.some((response) => response.questionId === "D77" && response.status === "answered") && iterations < 60) {
    state = answerCurrentFromPlan(state, source, plan, used, responseIndex++);
    iterations += 1;
  }
  assert.ok(state.responses.some((response) => response.questionId === "D56" && response.status === "answered"));
  assert.ok(state.responses.some((response) => response.questionId === "D57" && response.status === "answered"));
  const d77Response = state.responses.find((response) => response.questionId === "D77" && response.status === "answered");
  assert.ok(d77Response, "D77 must be reached and answered through the selected session route");

  const activeByQuestion = (questionId: string) => {
    const superseded = new Set(state.responses.flatMap((response) => response.supersedesResponseId ? [response.supersedesResponseId] : []));
    return state.responses.filter((response) => response.questionId === questionId && !superseded.has(response.responseId));
  };
  const firstRoot = activeByQuestion("M02").find((response) => response.occurrenceId === firstOccurrenceId);
  const replayRoot = activeByQuestion("M02").find((response) => response.occurrenceId === replayOccurrenceId);
  const replayAim = activeByQuestion("M03").find((response) => response.occurrenceId === replayOccurrenceId);
  assert.equal(firstRoot?.basis, "actual_recalled");
  assert.equal(replayRoot?.basis, "actual_recalled");
  assert.equal(replayRoot?.replayOfOccurrenceId, firstOccurrenceId);
  assert.equal(replayAim?.occurrenceId, replayOccurrenceId);
  assert.deepEqual(state.routerResult.episodes.find((episode) => episode.id === replayOccurrenceId)?.distinctFrom, [firstOccurrenceId]);
  const comparisonPair = state.routerInput.comparisonIdsByResponseId?.[d77Response!.responseId];
  assert.deepEqual([...comparisonPair!].sort(), [firstOccurrenceId, replayOccurrenceId].sort());
  for (const questionId of ["D56", "D57", "D77"]) {
    const response = state.responses.find((row) => row.questionId === questionId && row.status === "answered");
    assert.ok(response, `${questionId} response must be present`);
    assert.deepEqual([...state.routerInput.comparisonIdsByResponseId![response.responseId]!].sort(), [firstOccurrenceId, replayOccurrenceId].sort(), `${questionId} must retain its comparison pair after the session advances`);
  }
  const d77Target = state.routerResult.targets.find((target) => target.targetId === "coverage_pattern_continuity" && target.comparisonIds?.includes(replayOccurrenceId));
  assert.equal(d77Target?.state, "resolved_descriptively");
  assert.ok(d77Target?.sourceObservationIds.includes(`${firstRoot!.responseId}:M02.rehearse`));
  assert.ok(d77Target?.sourceObservationIds.includes(`${replayRoot!.responseId}:M02.rehearse`));
  assert.ok(d77Target?.sourceObservationIds.some((id) => id.startsWith(`${state.responses.find((response) => response.questionId === "D56")!.responseId}:D56.same`)));
  assert.ok(d77Target?.sourceObservationIds.some((id) => id.startsWith(`${state.responses.find((response) => response.questionId === "D57")!.responseId}:D57.same`)));

  const editingRoot = beginPwqe51Correction(state, replayRoot!.responseId, source);
  const rootCorrection = advancePwqe51Session(editingRoot, {
    responseId: "c07-replay-root-corrected", completionState: "COMPLETED", selectedOptionIds: ["M02.none"],
  }, source);
  assert.ok(rootCorrection.routerResult.invalidatedResponses.some((row) => row.responseId === d77Response!.responseId
    && row.reason === "comparison_support_removed"), "a changed root action must invalidate the continuity result it no longer supports");
  assert.ok(rootCorrection.routerResult.observations.some((observation) => observation.responseId === replayAim!.responseId), "an attached child with an intact answered parent remains valid");

  const currentBinding = rootCorrection.replayBindingHistory![0]!;
  const withdrawn = applyPwqe51ReplayBinding(rootCorrection, {
    decisionId: `pwrb_${"c".repeat(40)}`, requestSha256: "d".repeat(64), outcome: "same", correctsDecisionId: currentBinding.decisionId,
  }, source);
  assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.responseId === "c07-replay-root-corrected"));
  assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.responseId === replayAim!.responseId));
  assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.responseId === d77Response!.responseId));
  assert.ok(withdrawn.routerResult.invalidatedResponses.some((row) => row.responseId === "c07-session-response-8" && row.reason === "episode_root_removed"),
    "an answered but parentless follow-up cannot preserve an occurrence after its replay root is withdrawn");
  assert.equal(withdrawn.routerResult.episodes.some((episode) => episode.id === replayOccurrenceId && episode.actual), false);

  const restored = applyPwqe51ReplayBinding(withdrawn, {
    decisionId: `pwrb_${"e".repeat(40)}`, requestSha256: "f".repeat(64), outcome: "different", correctsDecisionId: withdrawn.replayBindingHistory!.at(-1)!.decisionId,
  }, source);
  assert.equal(restored.routerResult.episodes.filter((episode) => episode.id === replayOccurrenceId && episode.actual).length, 1);
  assert.equal(restored.responses.filter((response) => response.occurrenceId === replayOccurrenceId && response.questionId === "M02").length, 2,
    "correcting the binding reuses the prior occurrence and correction chain rather than administering another root");
});
