import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { deriveC10CuratedGraph, sha256 } from "./c10-curation-policy.mjs";

const runDir = new URL("../", import.meta.url);
async function json(relative) { return JSON.parse(await readFile(new URL(relative, runDir), "utf8")); }

test("C10 derivative omits synthetic-contaminated claims and dependent records without changing retained claim assertions", async () => {
  const provider = await json("outputs/C10.interpretation.json");
  const index = await json("outputs/C10.source-observation-index-v3.json");
  const result = deriveC10CuratedGraph(provider, index);
  assert.deepEqual(result.value.claims.map((claim) => claim.id), ["C10-C01", "C10-C04", "C10-C05", "C10-C06"]);
  assert.deepEqual(result.value.name_registry, []);
  for (const id of ["C10-C02", "C10-C03", "C10-C07"]) {
    assert.ok(result.removals.some((row) => row.collection === "claims" && row.recordId === id));
  }
  const authoredIds = new Set(index.observations.map((row) => row.observation_id));
  const graphRecords = [...result.value.claims, ...result.value.observed_strengths,
    ...result.value.counterexamples, ...result.value.open_questions];
  for (const record of graphRecords) {
    for (const evidenceId of [...(record.evidence_ids ?? []), ...(record.counterevidence_ids ?? [])]) {
      assert.ok(authoredIds.has(evidenceId), `unexpected non-authored evidence ${evidenceId}`);
    }
  }
  assert.ok(result.removals.some((row) => row.collection === "claim_dependencies" && row.recordId === "C10-C04"));
  assert.deepEqual(result.value.claims.find((claim) => claim.id === "C10-C04").sequence_edge_ids,
    provider.claims.find((claim) => claim.id === "C10-C04").sequence_edge_ids);
});

test("C10 derivative preserves the provider source and has no prose leakage about synthetic stopping", async () => {
  const providerBytes = await readFile(new URL("outputs/C10.interpretation.json", runDir));
  const provider = JSON.parse(providerBytes.toString("utf8"));
  const index = await json("outputs/C10.source-observation-index-v3.json");
  const { value } = deriveC10CuratedGraph(provider, index);
  assert.equal(sha256(providerBytes), sha256(Buffer.from(`${JSON.stringify(provider, null, 2)}\n`)));
  const serialized = JSON.stringify(value).toLowerCase();
  assert.equal(serialized.includes("stopping of responses"), false);
  assert.equal(serialized.includes("stopped responding"), false);
  assert.equal(serialized.includes("synthetic"), false);
  assert.equal(serialized.includes("input reducer"), false);
});
