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

test("Pass 2 stop eligibility is asserted only when every typed routing gate passes", () => {
  const incomplete = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2));
  assert.equal(incomplete[0].coverage_matrix.stop_eligible, false);
  const gated = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2, undefined, {
    deepeningCompleted: true, fitCompleted: true, endingSatisfied: true, pendingBtmTransition: false,
    requiresLowIntensityAfterRre: false, safetyContext: "safe", coverage: { deepeningGate: "green" },
  }));
  assert.equal(gated[0].coverage_matrix.stop_eligible, true);
});
