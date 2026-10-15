import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { assertCandidate, prepare, PROFILE_IDS } from "./prepare-system-portrait.mjs";

const root = resolve(import.meta.dirname, "../..");
test("experiment has only P02 and C10", () => assert.deepEqual(PROFILE_IDS, ["P02", "C10"]));
test("source-bound pair preparation requires complete actual fixture packets", async () => {
 for (const id of PROFILE_IDS) {
   const bundle = await prepare(root, id);
   assert.equal(bundle.interpretationInput.status, "EXPERIMENTAL_NOT_QUALIFIED");
   assert.equal(bundle.interpretationInput.mode, "no_dispatch");
   assert.equal(bundle.interpretationInput.profileId, id);
   assert.equal(bundle.interpretationInput.evidencePacket.content_sha256, bundle.compositionTemplate.packetSha256);
   assert.match(bundle.compositionTemplate.system, /functional|reader|part/i);
   assert.equal(bundle.reviewerTemplate.reviewMustCheckOriginalPacket, true);
 }
});
test("wrong profile is rejected, no dispatch", async () => { await assert.rejects(() => prepare(root, "C01"), /not selected|selected by pair|Only P02 and C10/i); });
test("tampered packets and drifted source fail closed", async () => {
 const pair = JSON.parse(await readFile(root + "/qualification/pwrp71/portrait-experiment-v1/candidate-pair.json","utf8"));
 const original = JSON.parse(await readFile(root + "/qualification/pwrp71/route_replays_v5/P02.json","utf8"));
 const profile = pair.profiles[0];
 const tampered = structuredClone(original);
 tampered.packets.IFS.packet.observations.pop();
 assert.throws(() => assertCandidate({profileId:"P02",profile,fixture:tampered}),/digest mismatch/);
 const drift = structuredClone(original);
 drift.sourceIdentity.questionSourceSha256 = "0".repeat(64);
 assert.throws(() => assertCandidate({profileId:"P02",profile,fixture:drift}),/Source pins/);
});
