import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validatePacketCrossObject, validateReportEvidencePacket } from "../../lib/question-engine/packet-validator.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { ReportEvidencePacketV3_1 } from "../../lib/report-contracts/types.ts";

const fixtureDirectory = "specs/patternwork/question-engine-v3.1";
const packetFiles = ["12a_respondent_a_packet.json", "12b_respondent_b_packet.json", "12c_respondent_c_packet.json"] as const;

async function fixture(name: string): Promise<JsonObject> {
  return JSON.parse(await readFile(`${fixtureDirectory}/${name}`, "utf8")) as JsonObject;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

for (const name of packetFiles) {
  test(`supplied packet ${name} passes structural and cross-object validation`, async () => {
    const result = await validateReportEvidencePacket(await fixture(name));
    assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues, null, 2));
  });
}

test("rejects legacy contract identity", async () => {
  const packet = clone(await fixture(packetFiles[0]));
  packet.contract_id = "PWQE3-CONTRACT-1";
  const result = await validateReportEvidencePacket(packet);
  assert.equal(result.ok, false);
});

test("rejects independent episode count mismatch", async () => {
  const packet = clone(await fixture(packetFiles[0]));
  const matrix = packet.coverage_matrix as JsonObject;
  const cells = matrix.cells as JsonObject[];
  cells[0].independent_episode_count = 99;
  const result = await validateReportEvidencePacket(packet);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((item) => item.code === "independent_episode_count"));
});

test("rejects route absence represented as not-applicable coverage", async () => {
  const packet = clone(await fixture(packetFiles[2]));
  const matrix = packet.coverage_matrix as JsonObject;
  const cells = matrix.cells as JsonObject[];
  const target = cells.find((cell) => cell.section_code === "ATT-08")!;
  target.applicability = "not_applicable";
  target.routing_state = "not_applicable";
  target.confidence = "unsupported";
  target.not_applicable_reason = "Route was unavailable.";
  target.applicability_evidence_ids = [];
  target.applicability_response_ids = [];
  const result = await validateReportEvidencePacket(packet);
  assert.equal(result.ok, false);
  const crossObject = validatePacketCrossObject(packet as ReportEvidencePacketV3_1);
  assert.equal(crossObject.ok, false);
  if (!crossObject.ok) assert.ok(crossObject.issues.some((item) => item.code === "not_applicable_evidence"));
});

test("rejects an invalid normal Pass-1 boundary", async () => {
  const packet = clone(await fixture(packetFiles[2]));
  const completion = packet.assessment_completion as JsonObject;
  completion.safe_resume_stage = "S4";
  const result = await validateReportEvidencePacket(packet);
  assert.equal(result.ok, false);
  const crossObject = validatePacketCrossObject(packet as ReportEvidencePacketV3_1);
  assert.equal(crossObject.ok, false);
  if (!crossObject.ok) assert.ok(crossObject.issues.some((item) => item.code === "pass1_boundary"));
});

test("rejects packet ID/report type mismatch and unresolved evidence", async () => {
  const packet = clone(await fixture(packetFiles[1]));
  packet.packet_id = "PKT-IFS-wrong-type";
  const matrix = packet.coverage_matrix as JsonObject;
  (matrix.cells as JsonObject[])[0].supporting_evidence_ids = ["EP-MISSING"];
  const result = await validateReportEvidencePacket(packet);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((item) => item.code === "packet_type_identity"));
    assert.ok(result.issues.some((item) => item.code === "unresolved_evidence"));
  }
});
