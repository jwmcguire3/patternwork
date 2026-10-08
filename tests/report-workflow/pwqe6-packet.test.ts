import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe5SourcePackage } from "@/lib/question-engine";
import { advancePwqe5Session, createPwqe5SessionState, endPwqe5Session } from "@/lib/server/assessment/pwqe5-session";
import { compilePwqe5Route } from "@/lib/server/assessment/pwqe5-router";
import { buildPwqe6RouterPacket } from "@/lib/server/reports/pwqe6-packet";

test("builds a schema-valid v6 packet from server-derived canonical answers", async () => {
  const source = await loadPwqe5SourcePackage();
  const initial = createPwqe5SessionState(source);
  assert.ok(initial.currentInteraction);
  const question = source.questionBank.items.find((item) => item.id === initial.currentInteraction!.questionId)!;
  const state = advancePwqe5Session(initial, {
    responseId: "response-1",
    completionState: "COMPLETED",
    selectedOptionIds: [question.options[0].id],
    mode: "single",
  }, source);

  const packet = buildPwqe6RouterPacket({ snapshotId: "snapshot-1", state, source });
  assert.equal(packet.format, "patternwork-router-evidence-v1");
  assert.equal(packet.release_id, source.questionBank.release);
  assert.equal(packet.content_sha256 && String(packet.content_sha256).length, 64);
  assert.equal((packet.observations as unknown[]).length, 1);
  assert.equal((packet.administration_provenance as unknown[]).length, 1);
  assert.equal((packet.missingness as unknown[]).length, 0);
});

test("preserves derived router findings in schema-valid structural summaries", async () => {
  const source = await loadPwqe5SourcePackage();
  const responses = [
    { responseId: "P01-A01", questionId: "M02", occurrenceId: "E1", stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered" as const, mode: "single" as const },
    { responseId: "P01-A02", questionId: "M03", occurrenceId: "E1", stepId: "first", selectedOptionIds: ["M03.exposure"], status: "answered" as const, mode: "single" as const },
    { responseId: "P01-A03", questionId: "D04", occurrenceId: "E1", stepId: "first", selectedOptionIds: ["D04.sign"], status: "answered" as const, mode: "single" as const },
    { responseId: "P01-A04", questionId: "M02", occurrenceId: "E2", stepId: "first", selectedOptionIds: ["M02.rehearse"], status: "answered" as const, mode: "single" as const },
    { responseId: "P01-A05", questionId: "M03", occurrenceId: "E2", stepId: "first", selectedOptionIds: ["M03.exposure"], status: "answered" as const, mode: "single" as const },
    { responseId: "P01-A06", questionId: "D04", occurrenceId: "E2", stepId: "first", selectedOptionIds: ["D04.choice"], status: "answered" as const, mode: "single" as const },
  ];
  const routerResult = compilePwqe5Route({ responses, phase: "deepening" }, source);
  assert.ok(routerResult.findings.length > 0);
  const state = {
    ...createPwqe5SessionState(source),
    pass: 2 as const,
    phase: "deepening" as const,
    responses,
    routerResult,
    currentInteraction: null,
  };

  const packet = buildPwqe6RouterPacket({ snapshotId: "snapshot-findings", state, source });
  const summaries = packet.structural_evidence_summaries as Array<Record<string, unknown>>;
  assert.equal(summaries.length, routerResult.findings.length);
  assert.ok(summaries.every((summary) => summary.status === "structural_support_requires_report_semantic_review"));
  assert.ok(summaries.every((summary) => Array.isArray(summary.missing)));
  assert.ok(summaries.every((summary) => Array.isArray(summary.evidence_ids) && summary.evidence_ids.length > 0));
});

test("excludes superseded answers from observations and keeps correction lineage", async () => {
  const source = await loadPwqe5SourcePackage();
  const initial = createPwqe5SessionState(source);
  assert.ok(initial.currentInteraction);
  const question = source.questionBank.items.find((item) => item.id === initial.currentInteraction!.questionId)!;
  const originalResponse = {
    responseId: "response-old",
    questionId: question.id,
    occurrenceId: initial.currentInteraction.occurrenceId,
    stepId: initial.currentInteraction.stepId,
    selectedOptionIds: [question.options[0].id],
    status: "answered" as const,
    mode: "single" as const,
  };
  const correctionResponse = {
    responseId: "response-correction",
    questionId: question.id,
    occurrenceId: initial.currentInteraction.occurrenceId,
    stepId: initial.currentInteraction.stepId,
    selectedOptionIds: [question.options[1].id],
    status: "answered" as const,
    mode: "single" as const,
    supersedesResponseId: "response-old",
  };
  const responses = [originalResponse, correctionResponse];
  const routerResult = compilePwqe5Route({
    responses,
    phase: "mapping",
    occurrenceBindings: initial.occurrenceBindings,
  }, source);
  const corrected = {
    ...initial,
    responses,
    routerResult,
    currentInteraction: null,
  };
  const packet = buildPwqe6RouterPacket({ snapshotId: "snapshot-correction", state: corrected, source });
  assert.deepEqual(packet.superseded_response_ids, ["response-old"]);
  assert.equal((packet.observations as Array<{ response_id: string }>).some((observation) => observation.response_id === "response-old"), false);
});

test("records an explicit end control in the packet and its completion reason", async () => {
  const source = await loadPwqe5SourcePackage();
  const ended = endPwqe5Session(createPwqe5SessionState(source), source);
  const packet = buildPwqe6RouterPacket({ snapshotId: "snapshot-ended", state: ended, source });
  assert.equal((packet.assessment_scope as { completion_reason?: string }).completion_reason, "user_end");
});
