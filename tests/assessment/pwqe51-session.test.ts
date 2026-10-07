import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import {
  advancePwqe51Session,
  beginPwqe51Correction,
  createPwqe51SessionState,
  endPwqe51Session,
  pausePwqe51Session,
  renderPwqe51Interaction,
  resumePwqe51Session,
  shortenPwqe51Session,
  startPwqe51Deepening,
} from "../../lib/server/assessment/pwqe51-session.ts";
import { compilePwqe51Route, type Pwqe51CanonicalResponse } from "../../lib/server/assessment/pwqe51-router.ts";

const sourcePromise = loadPwqe51SourcePackage();

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
