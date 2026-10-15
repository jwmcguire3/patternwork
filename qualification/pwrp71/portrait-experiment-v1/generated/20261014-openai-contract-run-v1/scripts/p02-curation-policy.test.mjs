import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  P02_CURATED_OUTPUT, P02_CURATION_RECEIPT, P02_EDGE_EVIDENCE_ID, P02_EDGE_ID,
  P02_OCCURRENCE_ID, P02_PARENT_HASHES, P02_RETAINED_CLAIMS,
  P02_RETAINED_NAMES, P02_RETAINED_OPEN_QUESTIONS, P02_RETAINED_RELATIONSHIPS,
  deriveP02CuratedGraph, sha256, verifyP02ParentHashes,
} from "./p02-curation-policy.mjs";

const runDir = new URL("../", import.meta.url);
const read = (relative) => readFile(new URL(relative, runDir));
const json = async (relative) => JSON.parse((await read(relative)).toString("utf8"));
const parents = async () => Object.fromEntries(await Promise.all(Object.keys(P02_PARENT_HASHES)
  .map(async (file) => [file, await read(file)])));
const clone = (value) => JSON.parse(JSON.stringify(value));

test("exact P02 parent hashes reject drift and bind failed source recheck", async () => {
  const bytes = await parents();
  assert.equal(verifyP02ParentHashes(bytes), true);
  const changed = { ...bytes, "outputs/P02.interpretation.attempt-5.json": Buffer.from("{}\n") };
  assert.throws(() => verifyP02ParentHashes(changed), /parent drift/);
  const failed = JSON.parse(bytes["outputs/P02.interpretation.attempt-5.validation.source-recheck.json"]);
  assert.equal(failed.status, "source_reference_checks_failed");
  assert.equal(failed.modelOutputFileSha256, P02_PARENT_HASHES["outputs/P02.interpretation.attempt-5.json"]);
});

test("curation selects only reviewed conflict records and explicit evidence corrections", async () => {
  const provider = await json("outputs/P02.interpretation.attempt-5.json");
  const providerBefore = JSON.stringify(provider);
  const index = await json("outputs/P02.source-observation-index-v3.json");
  const prepared = await json("prepared/P02.interpretation.input.json");
  const { value, edits, removed } = deriveP02CuratedGraph(provider, index, prepared);
  assert.equal(JSON.stringify(provider), providerBefore, "provider output must remain in memory unchanged");
  assert.deepEqual(value.claims.map((row) => row.id), P02_RETAINED_CLAIMS);
  assert.deepEqual(value.name_registry.map((row) => row.name_id), P02_RETAINED_NAMES);
  assert.deepEqual(value.relationships.map((row) => row.id), P02_RETAINED_RELATIONSHIPS);
  assert.deepEqual(value.priority_claim_ids, P02_RETAINED_CLAIMS);
  assert.deepEqual(value.open_questions.map((row) => row.id), P02_RETAINED_OPEN_QUESTIONS);
  assert.deepEqual(value.observed_strengths, []);
  assert.deepEqual(value.counterexamples, []);
  assert.equal(removed.claims.length, 16);
  assert.deepEqual(edits.map((row) => [row.claimId, row.field]), [
    ["c_conflict_preventive_explaining", "support_basis"],
    ["c_conflict_exit_relief", "text"],
    ["c_conflict_exit_relief", "support_basis"],
    ["c_conflict_exit_relief", "sequence_edge_ids"],
  ]);
});

test("curated graph uses only authored same-occurrence evidence and preserves reported order", async () => {
  const provider = await json("outputs/P02.interpretation.attempt-5.json");
  const index = await json("outputs/P02.source-observation-index-v3.json");
  const prepared = await json("prepared/P02.interpretation.input.json");
  const { value } = deriveP02CuratedGraph(provider, index, prepared);
  const authored = new Set(index.observations.map((row) => row.observation_id));
  const graphRows = [...value.claims, ...value.open_questions];
  for (const row of graphRows) {
    for (const id of [...(row.evidence_ids ?? []), ...(row.counterevidence_ids ?? [])]) {
      assert.ok(authored.has(id), `synthetic or stale evidence ${id}`);
    }
    assert.deepEqual(row.scope.occurrence_ids, [P02_OCCURRENCE_ID]);
  }
  const sequence = value.claims.find((row) => row.id === "c_conflict_reported_sequence");
  const exit = value.claims.find((row) => row.id === "c_conflict_exit_relief");
  assert.deepEqual(sequence.sequence_edge_ids, [P02_EDGE_ID]);
  assert.ok(sequence.evidence_ids.includes(P02_EDGE_EVIDENCE_ID));
  assert.deepEqual(exit.sequence_edge_ids, []);
  assert.deepEqual(exit.depends_on_claim_ids, [sequence.id]);
  assert.equal(exit.text.includes("after the respondent reported"), false);
  assert.deepEqual(value.relationships[0].claim_ids, [sequence.id]);
  const mutatedIndex = clone(index);
  mutatedIndex.sequenceEdges[0].to_step = "first";
  assert.throws(() => deriveP02CuratedGraph(provider, mutatedIndex, prepared), /temporal edge/);
});

test("generated derivative is hash bound and all raw attempt-5 artifacts remain unchanged", async () => {
  const receipt = await json(P02_CURATION_RECEIPT);
  const derivativeBytes = await read(P02_CURATED_OUTPUT);
  assert.equal(sha256(derivativeBytes), receipt.curatedOutputFileSha256);
  assert.equal(receipt.providerOutputFile, "outputs/P02.interpretation.attempt-5.json");
  assert.equal(receipt.validationParentFile,
    "outputs/P02.interpretation.attempt-5.validation.source-recheck.json");
  assert.equal(receipt.sourceObservationIndexFile, "outputs/P02.source-observation-index-v3.json");
  assert.equal(receipt.curatedOutputFile, P02_CURATED_OUTPUT);
  assert.equal(verifyP02ParentHashes(await parents()), true);
  for (const [file, expected] of Object.entries(receipt.rawPreservationHashes)) {
    assert.equal(sha256(await read(file)), expected);
  }
});
