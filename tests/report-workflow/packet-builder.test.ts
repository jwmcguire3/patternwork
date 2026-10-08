import assert from "node:assert/strict";
import test from "node:test";
import { validateReportEvidencePacket } from "../../lib/question-engine/packet-validator.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import { prepareAndValidateInputs } from "../../lib/server/reports/validation.ts";
import type { DecryptedAssessmentSnapshot } from "../../lib/server/reports/types.ts";
import { buildGenerationPrompt } from "../../lib/server/reports/prompts.ts";
import type { JsonValue } from "../../lib/question-engine/types.ts";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import { enrichResponseFromAuthoredContract, normalizeTypedAssessmentResponse } from "../../lib/server/assessment/service.ts";

function snapshot(completedPass: 1 | 2 = 1, response: JsonValue = { schemaVersion: "PWRS-1", semantic: { choices: ["OPT-MS-101-wait-a1b2c3d4"], timeHorizon: "immediate", certainty: 0.7, coverageSectionCodes: ["IFS-02"] } }, routingState?: JsonValue): DecryptedAssessmentSnapshot {
  const completion = completedPass === 1
    ? { completion_mode: "pass1_complete", last_completed_stage: "S2", safe_resume_stage: "S3" }
    : { completion_mode: "pass2_complete", last_completed_stage: "S5", safe_resume_stage: "complete" };
  return {
    databaseId: "db-snapshot-1",
    assessmentSessionId: "private-session-id",
    snapshotId: "pwsn_test",
    snapshotRevision: "1",
    completedPass,
    evidenceSha256: "a".repeat(64),
    scopeSha256: "b".repeat(64),
    canonicalSnapshot: {
      assessment_completion: { ...completion, completed_at: "2026-09-02T12:00:00.000Z" },
      ...(routingState ? { routing_state: routingState } : {}),
      responses: [{
        responseId: "private-response-id",
        interactionInstanceId: "p1-0001-ms-101",
        bankItemId: "MS-101",
        bankItemVersion: "1.0",
        administrationSequence: 1,
        stage: "S1",
        completionState: "COMPLETED",
        responseOrder: ["OPT-MS-101-wait-a1b2c3d4", "María Chen", "+44 20 7946 0958"],
        content: { response },
      }],
    },
  };
}

test("deterministic builder creates validator-clean IFS/PV/ATT packets from ordered canonical responses", async () => {
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot());
  assert.deepEqual(packets.map((packet) => packet.report_type), ["IFS", "PV", "ATT"]);
  for (const packet of packets) {
    const validation = await validateReportEvidencePacket(packet);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
    assert.equal(packet.assessment_completion.completion_mode, "pass1_complete");
  }
});

test("builder propagates canonical normal-completion boundaries and rejects drift", () => {
  const passOne = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(1));
  assert.deepEqual(passOne[0].assessment_completion, {
    completion_mode: "pass1_complete",
    last_completed_stage: "S2",
    safe_resume_stage: "S3",
    underdetermined_section_codes: passOne[0].assessment_completion.underdetermined_section_codes,
  });

  const passTwo = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2));
  assert.equal(passTwo[0].assessment_completion.completion_mode, "pass2_complete");
  assert.equal(passTwo[0].assessment_completion.last_completed_stage, "S5");
  assert.equal(passTwo[0].assessment_completion.safe_resume_stage, "complete");

  const invalid = structuredClone(snapshot(1));
  invalid.canonicalSnapshot.assessment_completion = {
    completion_mode: "pass1_complete",
    last_completed_stage: "S1",
    safe_resume_stage: "S1",
    completed_at: "2026-09-02T12:00:00.000Z",
  };
  assert.throws(() => buildPseudonymousPacketsFromCanonicalSnapshot(invalid), /completion boundary does not match completed Pass 1/u);
});

test("builder default-denies adversarial names, addresses, international phones, account IDs, and mixed narrative", async () => {
  const response = { schemaVersion: "PWRS-1", semantic: { choices: ["OPT-MS-101-wait-a1b2c3d4"], timeHorizon: "aftermath", certainty: 0.8, injected: "María Chen at 44 King Street should be called" }, privateNote: "María Chen, 44 King Street, +44 20 7946 0958, account ID ZXCV-99881; first I froze, then I called Jules." } as JsonValue;
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2, response));
  const serialized = JSON.stringify(packets);
  assert.doesNotMatch(serialized, /María|Chen|King Street|7946|ZXCV|froze|Jules|injected|privateNote/u);
  assert.match(serialized, /OPT-MS-101-wait-a1b2c3d4/u);
  assert.doesNotMatch(buildGenerationPrompt("IFS", { packet: packets[0] } as unknown as Record<string, JsonValue>), /María|Chen|King Street|7946|ZXCV|froze|Jules/u);
  for (const packet of packets) assert.equal((await validateReportEvidencePacket(packet)).ok, true);
  assert.equal((await prepareAndValidateInputs(snapshot(2, response), packets)).ok, true);
});

test("provider-boundary validation rejects direct PII even in an otherwise valid packet", async () => {
  const snapshotValue = snapshot();
  const packets = structuredClone(buildPseudonymousPacketsFromCanonicalSnapshot(snapshotValue));
  (packets[0].relationship_contexts[0] as JsonValue as Record<string, JsonValue>).notes = "contact person@example.com";
  const result = await prepareAndValidateInputs(snapshotValue, packets);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "direct_pii" || issue.code === "free_text_boundary"));
});

test("provider and prompt boundaries reject mixed narrative even without a recognizable PII pattern", async () => {
  const snapshotValue = snapshot();
  const packets = structuredClone(buildPseudonymousPacketsFromCanonicalSnapshot(snapshotValue));
  const action = packets[0].episode_evidence[0].actual_first_action as JsonValue as Record<string, JsonValue>;
  action.value = { selected_option_ids:["OPT-MS-101-wait-a1b2c3d4"], story:"I waited outside and then explained everything" };
  const result = await prepareAndValidateInputs(snapshotValue, packets);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "raw_answer_boundary"));
  assert.throws(() => buildGenerationPrompt("IFS", { packet:{ privateNote:"mixed narrative" } } as unknown as Record<string, JsonValue>), /free text/u);
});

test("Pass 2 routing flags alone never assert stop eligibility", () => {
  const incomplete = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2));
  assert.equal(incomplete[0].coverage_matrix.stop_eligible, false);
  const gated = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2, undefined, {
    deepeningCompleted: true, fitCompleted: true, endingSatisfied: true, pendingBtmTransition: false,
    requiresLowIntensityAfterRre: false, safetyContext: "safe", coverage: { deepeningGate: "green" },
  }));
  assert.equal(gated[0].coverage_matrix.stop_eligible, false);
});

async function objectSnapshot(options: { omitFit?: boolean; contradicted?: boolean } = {}): Promise<DecryptedAssessmentSnapshot> {
  const manifest = await loadStructuredInstrumentManifest();
  const option = (bankItemId:string, label:RegExp) => manifest.itemById.get(bankItemId)!.optionGroups.flatMap((group) => group.options).find((candidate) => label.test(candidate.label))!.optionId;
  const referent = option("RL-101", /^A close friend$/iu);
  const rows: Record<string, JsonValue>[] = [];
  const add = async (bankItemId:string, choices:string[]) => {
    const definition = manifest.itemById.get(bankItemId)!;
    const response = await enrichResponseFromAuthoredContract(
      normalizeTypedAssessmentResponse({ schemaVersion:"PWRS-1", semantic:{ choices, referentOptionId:"OPT-client-tamper", safetyContext:"safe" } }, bankItemId),
      bankItemId, definition.version, bankItemId.startsWith("RL-") ? undefined : referent,
    );
    rows.push({
      responseId:`response-${rows.length+1}`, interactionInstanceId:`interaction-${rows.length+1}`, bankItemId, bankItemVersion:definition.version,
      administrationSequence:rows.length+1, stage:bankItemId==="FCF-201"?"S5":"S3", completionState:"COMPLETED", responseOrder:choices,
      content:{ response:response as unknown as JsonValue },
    });
  };
  await add("RL-101", [referent]);
  await add("VFR-201", [option("VFR-201", /^Words or a sentence$/iu)]);
  await add("RLB-201", [option("RLB-201", /^restart$/iu)]);
  await add("BTM-201", ["UP-H-01", "UP-TC-02", option("BTM-201", /^mostly the same signature$/iu)]);
  await add("BTM-201", ["UP-GP-01", "UP-AH-01", option("BTM-201", /^same core with different intensity$/iu)]);
  await add("FSR-201", [option("FSR-201", /^body region\/quality$/iu)]);
  await add("MS-101", [option("MS-101", /I send another message/iu)]);
  await add("WMA-101", [option("WMA-101", /I am not important enough/iu)]);
  await add("BDA-205", ["AU-RT-01", "OM-RP-01"]);
  await add("PIS-201", [option("PIS-201", /^same internal presence\/pattern$/iu)]);
  if (!options.omitFit) await add("FCF-201", [option("FCF-201", options.contradicted ? /^does not match$/iu : /^matches$/iu)]);
  await add("RSR-201", [option("RSR-201", /^available now$/iu)]);
  const base = snapshot(2);
  return { ...base, canonicalSnapshot:{ ...base.canonicalSnapshot, responses:rows } };
}

test("replicated typed direct evidence plus FCF confirmation creates schema-valid bounded objects", async () => {
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(await objectSnapshot());
  for (const packet of packets) {
    assert.equal(packet.part_profiles.length, 1);
    assert.equal(packet.state_signatures.length, 1);
    assert.equal(packet.attachment_patterns.length, 1);
    assert.equal(packet.coverage_matrix.stop_eligible, false, "remaining red coverage cells prevent normal stop");
    const validation = await validateReportEvidencePacket(packet);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
  }
});

test("contradicted or unconfirmed authored evidence never creates promoted objects", async () => {
  for (const candidate of [await objectSnapshot({contradicted:true}), await objectSnapshot({omitFit:true})]) {
    const packet = buildPseudonymousPacketsFromCanonicalSnapshot(candidate)[0];
    assert.deepEqual(packet.part_profiles, []);
    assert.deepEqual(packet.state_signatures, []);
    assert.deepEqual(packet.attachment_patterns, []);
    assert.equal(packet.coverage_matrix.stop_eligible, false);
  }
});
