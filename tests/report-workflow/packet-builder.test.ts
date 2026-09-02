import assert from "node:assert/strict";
import test from "node:test";
import { validateReportEvidencePacket } from "../../lib/question-engine/packet-validator.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import { prepareAndValidateInputs } from "../../lib/server/reports/validation.ts";
import type { DecryptedAssessmentSnapshot } from "../../lib/server/reports/types.ts";
import type { JsonValue } from "../../lib/question-engine/types.ts";

function snapshot(completedPass: 1 | 2 = 1, response: JsonValue = { choice: "wait" }): DecryptedAssessmentSnapshot {
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
      responses: [{
        responseId: "private-response-id",
        interactionInstanceId: "p1-0001-ms-101",
        bankItemId: "MS-101",
        bankItemVersion: "1.0",
        administrationSequence: 1,
        stage: "S1",
        completionState: "COMPLETED",
        responseOrder: ["wait", "reach-out"],
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

test("builder redacts direct PII before packet construction", async () => {
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot(2, { email: "person@example.com", phone: "212-555-0100" }));
  const serialized = JSON.stringify(packets);
  assert.doesNotMatch(serialized, /person@example\.com|212-555-0100/u);
  assert.match(serialized, /\[redacted\]/u);
  for (const packet of packets) assert.equal((await validateReportEvidencePacket(packet)).ok, true);
  assert.equal((await prepareAndValidateInputs(snapshot(2, { email: "person@example.com", phone: "212-555-0100" }), packets)).ok, true);
});

test("provider-boundary validation rejects direct PII even in an otherwise valid packet", async () => {
  const snapshotValue = snapshot();
  const packets = structuredClone(buildPseudonymousPacketsFromCanonicalSnapshot(snapshotValue));
  (packets[0].relationship_contexts[0] as JsonValue as Record<string, JsonValue>).notes = "contact person@example.com";
  const result = await prepareAndValidateInputs(snapshotValue, packets);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "direct_pii"));
});
