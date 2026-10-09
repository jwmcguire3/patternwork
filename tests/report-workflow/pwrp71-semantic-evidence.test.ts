import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { verifySemanticEvidencePacket, verifyAuthoredResponsePacketBinding } from "../../lib/server/reports/qualification/semantic-evidence-verifier.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { replayFictionalPwqe51Session, type FictionalHistoryV2 } from "../../lib/server/reports/qualification/session-replay.ts";

type JsonRecord = Record<string, unknown>;

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function authored(profileId: string): Promise<FictionalHistoryV2> {
  return json(`qualification/pwrp71/constructed_histories_v2/${profileId}.json`);
}

async function v5(profileId: string): Promise<JsonRecord> {
  return json(`qualification/pwrp71/route_replays_v5/${profileId}.json`);
}

test("Mapping-entry body_detail permission preserves the unchanged M10 source answer through the production route", async () => {
  const [history, questionSource, reportSource] = await Promise.all([authored("C10"), loadPwqe51SourcePackage(), loadPwrp71SourcePackage()]);
  const baseline = replayFictionalPwqe51Session({ history, questionSource, reportSource });
  const variant = replayFictionalPwqe51Session({
    history,
    questionSource,
    reportSource,
    mappingEntryTopicOptIns: [{
      controlId: "test-C10-body-detail-mapping-entry",
      topic: "body_detail",
      rationale: "Regression control for the separately versioned v5 consent-timing experiment.",
      provenance: "new_synthetic_mapping_control",
      archivedPermissionProvenance: "original_authored_configuration",
      baselineReplayApplicationBoundary: "deepening_start",
    }],
  });
  const baseM10 = variant.submitted.find((answer) => answer.sourceResponseId === "C10-SRC-M10-1");
  assert.equal(baseline.submitted.some((answer) => answer.sourceResponseId === "C10-SRC-M10-1"), false);
  assert.equal(baseline.unreachedOriginalAnswers.find((answer) => answer.responseId === "C10-SRC-M10-1")?.classification, "source_contract_mismatch");
  assert.ok(baseM10);
  assert.equal(baseM10.phase, "mapping");
  assert.equal(baseM10.variantId, undefined);
  assert.deepEqual(baseM10.selectedOptionIds, ["M10.words"]);
  const mappingObservations = variant.packets.MAP?.packet.observations as readonly JsonRecord[];
  const m10Observation = mappingObservations.find((observation) => observation.response_id === baseM10.runtimeResponseId);
  assert.equal(m10Observation?.selection_reason, "source provenance: original_authored_fictional_response; fictional qualification evidence, not real participant data");
  const syntheticM28 = variant.submitted.find((answer) => answer.sourceResponseId === "C10-SYN-M28");
  assert.ok(syntheticM28);
  const m28Observation = mappingObservations.find((observation) => observation.response_id === syntheticM28.runtimeResponseId);
  assert.equal(m28Observation?.selection_reason, "source provenance: new_synthetic_mapping_response; fictional qualification evidence, not real participant data");
  const prepared = preparePwrp71Request({ packet: variant.packets.MAP!.packet as never, reportType: "MAP", questionSource, reportSource });
  assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  if (prepared.ok) {
    const providerObservations = prepared.value.user_data.observations as JsonRecord[];
    assert.equal(providerObservations.find((observation) => observation.response_id === baseM10.runtimeResponseId)?.selection_reason,
      "source provenance: original_authored_fictional_response; fictional qualification evidence, not real participant data");
    assert.equal(providerObservations.find((observation) => observation.response_id === syntheticM28.runtimeResponseId)?.selection_reason,
      "source provenance: new_synthetic_mapping_response; fictional qualification evidence, not real participant data");
  }
  assert.equal(variant.contextDecisions.mappingEntryTopicOptIns[0]?.provenance, "new_synthetic_mapping_control");
  assert.equal(variant.contextDecisions.mappingEntryTopicOptIns[0]?.baselineReplayApplicationBoundary, "deepening_start");

  const d36 = variant.submitted.find((answer) => answer.sourceResponseId === "C10-SRC-D36-1");
  assert.ok(d36);
  assert.equal(d36.mode, "ordered");
  assert.deepEqual(d36.selectedOptionIds, ["D36.input", "D36.words", "D36.think"]);
  const recoveryEdges = variant.packets.IFS?.packet.sequence_edges as readonly JsonRecord[];
  const d36ObservationIds = new Set((variant.packets.IFS?.packet.observations as readonly JsonRecord[])
    .filter((observation) => observation.response_id === d36.runtimeResponseId).map((observation) => observation.id as string));
  const d36Edges = recoveryEdges.filter((edge) => (edge.evidence_ids as readonly string[]).some((id) => d36ObservationIds.has(id)));
  assert.equal(d36Edges.length, 2);
  assert.ok(d36Edges.every((edge) => edge.relation === "before" && edge.occurrence_id === d36.occurrenceId));
  assert.deepEqual(d36Edges.map((edge) => [edge.from_step, edge.to_step]), [
    ["recovery/D36.input", "recovery/D36.words"],
    ["recovery/D36.words", "recovery/D36.think"],
  ]);

  const control = {
    controlId: "test-C10-body-detail-resume",
    topic: "body_detail",
    rationale: "Confirm that Mapping-entry permission survives JSON serialization and resume.",
    provenance: "new_synthetic_mapping_control" as const,
    archivedPermissionProvenance: "original_authored_configuration" as const,
    baselineReplayApplicationBoundary: "deepening_start" as const,
  };
  const prefix = replayFictionalPwqe51Session({ history, questionSource, maxAdministrations: 3, startDeepening: false, mappingEntryTopicOptIns: [control] });
  const resumed = replayFictionalPwqe51Session({
    history,
    questionSource,
    initialState: JSON.parse(JSON.stringify(prefix.state)),
    initialOccurrenceReferenceToServerId: JSON.parse(JSON.stringify(prefix.occurrenceReferenceToServerId)),
    mappingEntryTopicOptIns: [control],
  });
  assert.ok(resumed.state.optedInTopics.includes("body_detail"));
  assert.deepEqual(resumed.submitted.find((answer) => answer.sourceResponseId === "C10-SRC-M10-1")?.selectedOptionIds, ["M10.words"]);
});

test("C11 retains the actual company, effect, practical support, and aftermath answers in distinct packet lineage", async () => {
  const [history, questionSource, reportSource] = await Promise.all([authored("C11"), loadPwqe51SourcePackage(), loadPwrp71SourcePackage()]);
  const replay = replayFictionalPwqe51Session({
    history,
    questionSource,
    reportSource,
    mappingEntryTopicOptIns: [{
      controlId: "test-C11-body-detail-mapping-entry",
      topic: "body_detail",
      rationale: "Regression control for the separately versioned v5 consent-timing experiment.",
      provenance: "new_synthetic_mapping_control",
      archivedPermissionProvenance: "original_authored_configuration",
      baselineReplayApplicationBoundary: "deepening_start",
    }],
  });
  for (const [responseId, questionId, optionId] of [
    ["C11-SRC-M13-1", "M13", "M13.company"],
    ["C11-SRC-D86-1", "D86", "D86.support"],
    ["C11-SRC-D87-1", "D87", "D87.settled"],
    ["C11-SRC-D88-1", "D88", "D88.held"],
  ]) {
    const response = replay.submitted.find((answer) => answer.sourceResponseId === responseId);
    assert.ok(response, `${responseId} should be issued`);
    assert.equal(response.questionId, questionId);
    assert.deepEqual(response.selectedOptionIds, [optionId]);
  }
  const effect = replay.submitted.find((answer) => answer.sourceResponseId === "C11-SRC-D87-1")!;
  const aftermath = replay.submitted.find((answer) => answer.sourceResponseId === "C11-SRC-D88-1")!;
  assert.equal(effect.occurrenceId, aftermath.occurrenceId);
  assert.ok(effect.administrationSequence < aftermath.administrationSequence);
  assert.match(questionSource.questionBank.items.find((item) => item.id === "D88")!.prompt, /on your own again after that company/iu);
});

test("the independent v5 verifier qualifies retained source-to-packet bindings and rejects tampered options or private fields", async () => {
  const questionSource = await loadPwqe51SourcePackage();
  for (const profileId of [...Array.from({ length: 9 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, i) => `C${String(i + 1).padStart(2, "0")}`)]) {
    const [history, artifact] = await Promise.all([authored(profileId), v5(profileId)]);
    const result = verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact, questionSource });
    assert.equal(result.status, "pass", `${profileId}: ${result.failures.join(", ")}`);
    assert.deepEqual(verifyAuthoredResponsePacketBinding({ history: history as unknown as JsonRecord, artifact }), []);
  }
  const [history, artifact] = await Promise.all([authored("C10"), v5("C10")]);
  const tamperedOption = structuredClone(artifact);
  const tamperedPacket = (((tamperedOption.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  (tamperedPacket.observations as JsonRecord[])[0]!.option_id = "not-in-source";
  assert.equal(verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: tamperedOption, questionSource }).status, "fail");

  const tamperedProvenance = structuredClone(artifact);
  const provenancePacket = (((tamperedProvenance.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  (provenancePacket.observations as JsonRecord[])[0]!.selection_reason = "respondent-selected authored option";
  assert.ok(verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: tamperedProvenance, questionSource }).failures
    .some((failure) => failure.includes("response_provenance_not_visible_in_packet")));

  const tamperedSyntheticProvenance = structuredClone(artifact);
  const replay = tamperedSyntheticProvenance.replay as JsonRecord;
  const submitted = replay.submittedSourceToRuntimeResponses as JsonRecord[];
  const syntheticMapResponse = submitted.find((row) => row.provenance === "new_synthetic_mapping_response")!;
  const syntheticSourceId = syntheticMapResponse.sourceResponseId as string;
  const syntheticRuntimeId = syntheticMapResponse.runtimeResponseId as string;
  const sourceBoundProvenanceTamper = structuredClone(artifact);
  const sourceBoundReplay = sourceBoundProvenanceTamper.replay as JsonRecord;
  const sourceBoundSubmitted = (sourceBoundReplay.submittedSourceToRuntimeResponses as JsonRecord[])
    .find((row) => row.runtimeResponseId === syntheticRuntimeId)!;
  sourceBoundSubmitted.provenance = "original_authored_fictional_response";
  const sourceBoundPacket = (((sourceBoundProvenanceTamper.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  (sourceBoundPacket.observations as JsonRecord[]).find((row) => row.response_id === syntheticRuntimeId)!.selection_reason =
    "source provenance: original_authored_fictional_response; fictional qualification evidence, not real participant data";
  const sourceBoundResult = verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: sourceBoundProvenanceTamper, questionSource });
  assert.ok(sourceBoundResult.failures.some((failure) => failure.includes("submitted_provenance_does_not_match_source_origin")));
  assert.ok(sourceBoundResult.failures.some((failure) => failure.includes("response_provenance_not_visible_in_packet")));

  syntheticMapResponse.provenance = "original_authored_fictional_response";
  const runtimeProvenance = replay.completeResponseProvenance as JsonRecord[];
  runtimeProvenance.find((row) => row.sourceResponseId === syntheticSourceId)!.origin = "original_authored_fictional_answer";
  const syntheticPacket = (((tamperedSyntheticProvenance.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  const syntheticObservation = (syntheticPacket.observations as JsonRecord[]).find((row) => row.response_id === syntheticRuntimeId)!;
  syntheticObservation.selection_reason = "source provenance: original_authored_fictional_response; fictional qualification evidence, not real participant data";
  const syntheticTamperResult = verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: tamperedSyntheticProvenance, questionSource });
  assert.ok(syntheticTamperResult.failures.some((failure) => failure.includes("submitted_provenance_does_not_match_source_origin")));
  assert.ok(syntheticTamperResult.failures.some((failure) => failure.includes("runtime_provenance_does_not_match_authored_source_origin")));

  const tamperedPrivacy = structuredClone(artifact);
  const privatePacket = (((tamperedPrivacy.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  privatePacket.private_notes = "must never reach a report";
  assert.ok(verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: tamperedPrivacy, questionSource }).failures
    .some((failure) => failure.includes("unauthorized_identity_or_private_field")));

  const stalePacketEvidence = structuredClone(artifact);
  const stalePacket = (((stalePacketEvidence.packets as JsonRecord).MAP as JsonRecord).packet as JsonRecord);
  stalePacket.superseded_response_ids = [((stalePacket.observations as JsonRecord[])[0]!.response_id as string)];
  assert.ok(verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact: stalePacketEvidence, questionSource }).failures
    .some((failure) => failure.includes("observation_not_current")));
});

test("the authored negative controls remain source-only and P07 remains a non-pathologizing sparse case", async () => {
  const [questionSource, c02, c09, c02Artifact, c09Artifact, p07Artifact] = await Promise.all([
    loadPwqe51SourcePackage(), authored("C02"), authored("C09"), v5("C02"), v5("C09"), v5("P07"),
  ]);
  for (const [history, artifact, expectations] of [
    [c02, c02Artifact, ["D67.not_allowed", "D68.pushed"]],
    [c09, c09Artifact, ["D79.reaction"]],
  ] as const) {
    assert.equal(verifySemanticEvidencePacket({ history: history as unknown as JsonRecord, artifact, questionSource }).status, "pass");
    const observations = Object.values(artifact.packets as JsonRecord).flatMap((value) => {
      const packet = (value as JsonRecord).packet as JsonRecord;
      return packet.observations as JsonRecord[];
    });
    for (const expected of expectations) {
      const [itemId, optionId] = expected.split(".");
      assert.equal(observations.some((observation) => observation.item_id === itemId && observation.option_id === optionId), false);
    }
  }
  const p07Core = ((p07Artifact.replay as JsonRecord).semanticCore as JsonRecord);
  assert.equal(p07Core.status, "unavailable");
  assert.equal((p07Core.requiredSourceResponseIds as readonly string[]).length, 0);
  assert.equal((p07Artifact.experimentalFixtureVariant as unknown), null);
});
