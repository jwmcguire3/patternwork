import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateMappingSummaryArtifact } from "../../lib/report-contracts/delivery-validator.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { ReportEvidencePacketV3_1 } from "../../lib/report-contracts/types.ts";

const fixtureDirectory = "specs/patternwork/question-engine-v3.1";

async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(`${fixtureDirectory}/${name}`, "utf8")) as T;
}

test("supplied Respondent C Mapping Summary passes schema, binding, trace, and digest checks", async () => {
  const packet = await json<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await json<JsonObject>("12c_mapping_summary_artifact.json");
  const result = await validateMappingSummaryArtifact(artifact, [packet]);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issues, null, 2));
});

test("rejects an untraced mapping claim", async () => {
  const packet = await json<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await json<JsonObject>("12c_mapping_summary_artifact.json");
  const traces = artifact.paragraph_traces as JsonObject[];
  traces[0].claim_ids = [...(traces[1].claim_ids as string[])];
  const result = await validateMappingSummaryArtifact(artifact, [packet]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((item) => item.code === "untraced_claim" || item.code === "traces_digest"));
});

test("rejects quotes and response IDs in a Mapping Summary", async () => {
  const packet = await json<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await json<JsonObject>("12c_mapping_summary_artifact.json");
  const traces = artifact.paragraph_traces as JsonObject[];
  traces[0].contains_exact_quote = true;
  traces[0].supporting_response_ids = ["RR-C-003-trigger"];
  const result = await validateMappingSummaryArtifact(artifact, [packet]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((item) => item.code === "mapping_quote"));
});

test("rejects snapshot-binding drift and artifact digest drift", async () => {
  const packet = await json<ReportEvidencePacketV3_1>("12c_respondent_c_packet.json");
  const artifact = await json<JsonObject>("12c_mapping_summary_artifact.json");
  const bindings = artifact.packet_bindings as JsonObject[];
  bindings[0].scope_sha256 = "0".repeat(64);
  const digests = artifact.digests as JsonObject;
  digests.artifact_sha256 = "0".repeat(64);
  const result = await validateMappingSummaryArtifact(artifact, [packet]);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.issues.some((item) => item.code === "packet_binding_mismatch"));
    assert.ok(result.issues.some((item) => item.code === "artifact_digest"));
  }
});
