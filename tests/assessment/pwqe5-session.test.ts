import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe5SourcePackage } from "@/lib/question-engine";
import {
  advancePwqe5Session,
  beginPwqe5Correction,
  createPwqe5SessionState,
  renderPwqe5Interaction,
} from "@/lib/server/assessment/pwqe5-session";
import { compilePwqe5Route } from "@/lib/server/assessment/pwqe5-router";

test("the M10 authored observable variant is selected by its body-detail condition", async () => {
  const source = await loadPwqe5SourcePackage();
  const route = compilePwqe5Route({ responses: [], phase: "mapping" }, source);
  const candidate = route.candidates.find((entry) => entry.questionId === "M10");
  assert.ok(candidate, "M10 should be in the authored Mapping candidate set");
  assert.equal(candidate.variantId, "M10.observable");
  const state = {
    ...createPwqe5SessionState(source),
    currentInteraction: {
      interactionInstanceId: "pwi_variant",
      questionId: candidate.questionId,
      occurrenceId: "pwep_variant",
      stepId: candidate.stepId,
      variantId: candidate.variantId,
    },
  };
  const rendered = renderPwqe5Interaction(state, source);
  assert.equal(rendered?.prompt, "On that demanding day, what first made the strain noticeable in what you were doing?");
  assert.equal(rendered?.options[0].id, "M10.observable.check");
});

test("a correction supersedes its active response and replays routing from canonical history", async () => {
  const source = await loadPwqe5SourcePackage();
  const initial = createPwqe5SessionState(source);
  assert.ok(initial.currentInteraction);
  const question = source.questionBank.items.find((item) => item.id === initial.currentInteraction!.questionId)!;
  assert.ok(question.options.length > 1);
  const first = advancePwqe5Session(initial, {
    responseId: "response-original",
    completionState: "COMPLETED",
    selectedOptionIds: [question.options[0].id],
    mode: "single",
  }, source);

  const editing = beginPwqe5Correction(first, "response-original", source);
  assert.equal(editing.currentInteraction?.questionId, question.id);
  const corrected = advancePwqe5Session(editing, {
    responseId: "response-correction",
    completionState: "COMPLETED",
    selectedOptionIds: [question.options[1].id],
    mode: "single",
  }, source);

  assert.deepEqual(corrected.routerResult.supersededResponseIds, ["response-original"]);
  assert.equal(corrected.routerResult.observations.some((item) => item.responseId === "response-original"), false);
  assert.equal(corrected.responses.find((item) => item.responseId === "response-correction")?.supersedesResponseId, "response-original");
});
