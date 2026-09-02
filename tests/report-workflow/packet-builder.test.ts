import assert from "node:assert/strict";
import test from "node:test";
import { validateReportEvidencePacket } from "../../lib/question-engine/packet-validator.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import { prepareAndValidateInputs } from "../../lib/server/reports/validation.ts";
import type { DecryptedAssessmentSnapshot } from "../../lib/server/reports/types.ts";
import { buildGenerationPrompt } from "../../lib/server/reports/prompts.ts";
import type { JsonValue } from "../../lib/question-engine/types.ts";

function snapshot(completedPass: 1 | 2 = 1, response: JsonValue = { schemaVersion: "PWRS-1", semantic: { choices: ["OPT-MS-101-wait-a1b2c3d4"], timeHorizon: "immediate", certainty: 0.7, coverageSectionCodes: ["IFS-02"] } }, routingState?: JsonValue): DecryptedAssessmentSnapshot {
  return {
    databaseId: "db-snapshot-1",
    assessmentSessionId: "private-session-id",
    snapshotId: "pwsn_test",
    snapshotRevision: "1",
    completedPass,
    evidenceSha256: "a".repeat(64),
    scopeSha256: "b".repeat(64),
    canonicalSnapshot: {
      assessment_completion: { completed_at: "2026-09-02T12:00:00.000Z" },
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

function objectSnapshot(options: { oneOff?: boolean; contradicted?: boolean; omitFit?: boolean } = {}): DecryptedAssessmentSnapshot {
  const rows: Record<string, JsonValue>[] = [];
  const add = (bankItemId:string, objectEvidence:Record<string,JsonValue>, semantic:Record<string,JsonValue>={}) => rows.push({
    responseId:`response-${rows.length+1}`, interactionInstanceId:`interaction-${rows.length+1}`, bankItemId, bankItemVersion:"3.1.0",
    administrationSequence:rows.length+1, stage:bankItemId==="FCF-201"?"S5":"S3", completionState:"COMPLETED", responseOrder:["OPT-observed-aabbccdd"],
    content:{ response:{ schemaVersion:"PWRS-1", semantic:{ choices:["OPT-observed-aabbccdd"], coverageSectionCodes:[], ...semantic, objectEvidence } } },
  });
  const directCount = options.oneOff ? 1 : 2;
  for (let index=0; index<directCount; index+=1) add(index===0?"VFR-201":"RLB-201", { kind:"part_cluster", candidateKey:"OPT-part-care-aabbccdd", roleClass:"uncertain", directFieldOptionIds:[`OPT-part-field-${index}-aabbccdd`], contradicted:options.contradicted===true });
  add("FCF-201", { kind:"part_cluster", candidateKey:"OPT-part-care-aabbccdd", identityStatus:"confirmed", fitConfirmed:!options.omitFit, directFieldOptionIds:[] });
  for (let index=0; index<directCount; index+=1) add(index===0?"BTM-201":"FSR-201", { kind:"state_signature", candidateKey:"OPT-state-activated-aabbccdd", classification:"activated", bodyRegionIds:[`OPT-region-${index}-aabbccdd`], entryOptionIds:index===0?["OPT-entry-aabbccdd"]:[], exitOptionIds:index===1?["OPT-exit-aabbccdd"]:[], directFieldOptionIds:[`OPT-state-field-${index}-aabbccdd`], contradicted:options.contradicted===true });
  add("FCF-201", { kind:"state_signature", candidateKey:"OPT-state-activated-aabbccdd", classification:"activated", fitConfirmed:!options.omitFit, bodyRegionIds:[], entryOptionIds:[], exitOptionIds:[], directFieldOptionIds:[] });
  for (let index=0; index<directCount; index+=1) add(index===0?"WMA-201":"BDA-205", { kind:"attachment_pattern", candidateKey:"OPT-attachment-sequence-aabbccdd", referentOptionId:"OPT-referent-friend-aabbccdd", anxietyEstimate:"moderate", avoidanceEstimate:"low", cueOptionIds:[`OPT-cue-${index}-aabbccdd`], meaningOptionIds:[`OPT-meaning-${index}-aabbccdd`], moveOptionIds:[`OPT-move-${index}-aabbccdd`], directFieldOptionIds:[], contradicted:options.contradicted===true }, { referentOptionId:"OPT-referent-friend-aabbccdd", safetyContext:"safe" });
  add("FCF-201", { kind:"attachment_pattern", candidateKey:"OPT-attachment-sequence-aabbccdd", referentOptionId:"OPT-referent-friend-aabbccdd", anxietyEstimate:"moderate", avoidanceEstimate:"low", fitConfirmed:!options.omitFit, cueOptionIds:[], meaningOptionIds:[], moveOptionIds:[], directFieldOptionIds:[] });
  add("RSR-201", { kind:"state_signature", candidateKey:"OPT-resource-only-aabbccdd", classification:"connected", bodyRegionIds:[], entryOptionIds:[], exitOptionIds:[], directFieldOptionIds:[] }, { resourceSafetyClear:true });
  const base = snapshot(2);
  return { ...base, canonicalSnapshot:{ ...base.canonicalSnapshot, responses:rows } };
}

test("replicated typed direct evidence plus FCF confirmation creates schema-valid bounded objects", async () => {
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(objectSnapshot());
  for (const packet of packets) {
    assert.equal(packet.part_profiles.length, 1);
    assert.equal(packet.state_signatures.length, 1);
    assert.equal(packet.attachment_patterns.length, 1);
    assert.equal(packet.coverage_matrix.stop_eligible, false, "remaining red coverage cells prevent normal stop");
    const validation = await validateReportEvidencePacket(packet);
    assert.equal(validation.ok, true, validation.ok ? undefined : JSON.stringify(validation.issues));
  }
});

test("one-off, contradicted, or unconfirmed typed evidence never creates promoted objects", () => {
  for (const candidate of [objectSnapshot({oneOff:true}), objectSnapshot({contradicted:true}), objectSnapshot({omitFit:true})]) {
    const packet = buildPseudonymousPacketsFromCanonicalSnapshot(candidate)[0];
    assert.deepEqual(packet.part_profiles, []);
    assert.deepEqual(packet.state_signatures, []);
    assert.deepEqual(packet.attachment_patterns, []);
    assert.equal(packet.coverage_matrix.stop_eligible, false);
  }
});
