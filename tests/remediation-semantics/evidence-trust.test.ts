import assert from "node:assert/strict";
import test from "node:test";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import { normalizeTypedAssessmentResponse } from "../../lib/server/assessment/service.ts";
import { deriveTrustedEvidenceForAuthoredResponse } from "../../lib/server/assessment/trusted-evidence.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import type { DecryptedAssessmentSnapshot } from "../../lib/server/reports/types.ts";

test("public normalization drops every client-asserted promotion field", () => {
  const normalized = normalizeTypedAssessmentResponse({
    schemaVersion:"PWRS-1",
    semantic:{
      choices:["OPT-FCF-201-3c1c2dbecccff5a6"], candidateKey:"OPT-client-candidate", fitConfirmed:true, contradicted:false,
      directFieldOptionIds:["OPT-client-direct"], bodyRegionIds:["OPT-client-region"], objectEvidence:{
        kind:"part_cluster", candidateKey:"OPT-client-candidate", identityStatus:"confirmed", fitConfirmed:true,
        contradicted:false, directFieldOptionIds:["OPT-client-direct"], bodyRegionIds:["OPT-client-region"],
      },
    },
    trustedEvidence:{ schemaVersion:"PWTE-1", fitDisposition:"confirmed" },
  }, "FCF-201");
  assert.deepEqual(normalized, { schemaVersion:"PWRS-1", bankItemId:"FCF-201", semantic:{ choices:["OPT-FCF-201-3c1c2dbecccff5a6"] } });
});

test("trusted derivation binds the administered authored item/version and ignores client fit booleans", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const definition = manifest.itemById.get("FCF-201")!;
  const match = definition.optionGroups.flatMap((group) => group.options).find((option) => option.label === "matches")!.optionId;
  const notEnough = definition.optionGroups.flatMap((group) => group.options).find((option) => option.label === "not enough evidence")!.optionId;
  const asserted = { schemaVersion:"PWRS-1", semantic:{ choices:[notEnough], fitConfirmed:true, contradicted:false, objectEvidence:{ fitConfirmed:true } } } as const;
  const derived = await deriveTrustedEvidenceForAuthoredResponse("FCF-201", definition.version, asserted as never);
  assert.equal(derived?.fitDisposition, "underdetermined");
  assert.equal(derived?.binding.bankItemId, "FCF-201");
  assert.equal(derived?.binding.bankItemVersion, definition.version);
  assert.equal(await deriveTrustedEvidenceForAuthoredResponse("FCF-201", "client-version", { schemaVersion:"PWRS-1", semantic:{ choices:[match] } }), undefined);
});

test("an RL referent must be the authored option actually selected", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const definition = manifest.itemById.get("RL-101")!;
  const options = definition.optionGroups.flatMap((group) => group.options);
  const selected = options[0].optionId;
  const forgedReferent = options[1].optionId;
  const derived = await deriveTrustedEvidenceForAuthoredResponse("RL-101", definition.version, {
    schemaVersion:"PWRS-1",
    semantic:{ choices:[selected], referentOptionId:forgedReferent },
  });
  assert.equal(derived?.referentOptionId, undefined);
});

test("packet promotion ignores a fully populated client objectEvidence payload", () => {
  const response = { schemaVersion:"PWRS-1", semantic:{ choices:["OPT-FCF-201-3c1c2dbecccff5a6"], objectEvidence:{
    kind:"part_cluster", candidateKey:"OPT-client-candidate", identityStatus:"confirmed", fitConfirmed:true, contradicted:false,
    directFieldOptionIds:["OPT-client-direct"], bodyRegionIds:["OPT-client-region"], cueOptionIds:["OPT-client-cue"], meaningOptionIds:["OPT-client-meaning"], moveOptionIds:["OPT-client-move"],
  } } };
  const snapshot: DecryptedAssessmentSnapshot = {
    databaseId:"db", assessmentSessionId:"session", snapshotId:"pwsn_tamper", snapshotRevision:"1", completedPass:2,
    evidenceSha256:"a".repeat(64), scopeSha256:"b".repeat(64), canonicalSnapshot:{ assessment_completion:{ completed_at:"2026-09-02T12:00:00.000Z" }, responses:[{
      responseId:"response", interactionInstanceId:"interaction", bankItemId:"FCF-201", bankItemVersion:"3.0.0", administrationSequence:1, stage:"S5", completionState:"COMPLETED", responseOrder:[], content:{ response },
    }] },
  };
  const packet = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot)[0];
  assert.deepEqual(packet.part_profiles, []);
  assert.deepEqual(packet.state_signatures, []);
  assert.deepEqual(packet.attachment_patterns, []);
  assert.equal(packet.coverage_matrix.stop_eligible, false);
  assert.doesNotMatch(JSON.stringify(packet), /client-candidate|client-direct|client-region|client-cue|client-meaning|client-move/u);
});
