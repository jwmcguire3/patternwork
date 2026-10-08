import assert from "node:assert/strict";
import test from "node:test";
import { loadStructuredInstrumentManifest } from "../../lib/question-engine/renderable-manifest.ts";
import { enrichResponseFromAuthoredContract, establishedReferentFromRoutingState, normalizeTypedAssessmentResponse, trustedResponseOrderFromResponse } from "../../lib/server/assessment/service.ts";
import { createInitialRoutingState } from "../../lib/server/assessment/routing.ts";
import { deriveTrustedEvidenceForAuthoredResponse, referencedLibraries } from "../../lib/server/assessment/trusted-evidence.ts";
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
  assert.equal(derived?.referentOptionId, selected);
});

test("UI-shaped BTM and FCF selections derive evidence only from authoritative option IDs", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const rl = manifest.itemById.get("RL-101")!;
  const referent = rl.optionGroups.flatMap((group) => group.options)[0].optionId;
  const btm = manifest.itemById.get("BTM-201")!;
  const bodyLibraries = referencedLibraries(manifest, btm.responseLibraryReferences, btm.responseLibraryIds);
  assert.ok(bodyLibraries.some((library) => library.libraryId === "OL-BQ-UP-HEAD-01" && library.options.some((option) => option.optionId === "UP-H-01")));
  const normalizedBody = normalizeTypedAssessmentResponse({ schemaVersion:"PWRS-1", semantic:{ zones:["UP-H-01", "UP-TC-02"], referentOptionId:"OPT-client-forged" } }, "BTM-201");
  const body = await enrichResponseFromAuthoredContract(normalizedBody, "BTM-201", btm.version, referent);
  const bodyTrusted = body.trustedEvidence as unknown as { evidenceDisposition:string; referentOptionId:string; stateMap:{ multivariate:boolean; bodyRegions:string[] } };
  assert.equal(bodyTrusted.evidenceDisposition, "observed");
  assert.equal(bodyTrusted.referentOptionId, referent);
  assert.equal(bodyTrusted.stateMap.multivariate, true);
  assert.deepEqual(bodyTrusted.stateMap.bodyRegions.sort(), ["head", "throat_chest"]);

  const fcf = manifest.itemById.get("FCF-201")!;
  const matches = fcf.optionGroups.flatMap((group) => group.options).find((option) => option.label === "matches")!.optionId;
  const fit = await enrichResponseFromAuthoredContract(normalizeTypedAssessmentResponse({ schemaVersion:"PWRS-1", semantic:{ choices:[matches], fitConfirmed:false, contradicted:true, referentOptionId:"OPT-client-forged" } }, "FCF-201"), "FCF-201", fcf.version, referent);
  const fitTrusted = fit.trustedEvidence as unknown as { fitDisposition:string; referentOptionId:string };
  assert.equal(fitTrusted.fitDisposition, "confirmed");
  assert.equal(fitTrusted.referentOptionId, referent);
  assert.equal((fit.semantic as Record<string, unknown>).referentOptionId, referent);
});

test("later enrichment ignores a client referent unless trusted RL state supplies one", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const definition = manifest.itemById.get("FCF-201")!;
  const matches = definition.optionGroups.flatMap((group) => group.options).find((option) => option.label === "matches")!.optionId;
  const forged = manifest.itemById.get("RL-101")!.optionGroups.flatMap((group) => group.options)[1].optionId;
  const established = manifest.itemById.get("RL-101")!.optionGroups.flatMap((group) => group.options)[0].optionId;
  const response = normalizeTypedAssessmentResponse({ schemaVersion:"PWRS-1", semantic:{ choices:[matches], referentOptionId:forged } }, "FCF-201");
  const withoutState = await enrichResponseFromAuthoredContract(response, "FCF-201", definition.version);
  assert.equal((withoutState.semantic as Record<string, unknown>).referentOptionId, undefined);
  assert.equal((withoutState.trustedEvidence as unknown as { referentOptionId?:string }).referentOptionId, undefined);
  const initial = createInitialRoutingState(1);
  const state = { ...initial, completedInteractions:[{
    interactionInstanceId:"rl-established", bankItemId:"RL-101", family:"RL", stage:"S0", form:"multi_select", intensity:0,
    completionState:"COMPLETED", resourceOrOrdinary:true, evidenceEligible:true, referentId:established,
  }] } as never;
  const carried = establishedReferentFromRoutingState(state);
  assert.equal(carried, established);
  const withState = await enrichResponseFromAuthoredContract(response, "FCF-201", definition.version, carried);
  assert.equal((withState.semantic as Record<string, unknown>).referentOptionId, established);
  assert.equal((withState.trustedEvidence as unknown as { referentOptionId?:string }).referentOptionId, established);
});

test("packet promotion ignores a fully populated client objectEvidence payload", () => {
  const response = { schemaVersion:"PWRS-1", semantic:{ choices:["OPT-FCF-201-3c1c2dbecccff5a6"], objectEvidence:{
    kind:"part_cluster", candidateKey:"OPT-client-candidate", identityStatus:"confirmed", fitConfirmed:true, contradicted:false,
    directFieldOptionIds:["OPT-client-direct"], bodyRegionIds:["OPT-client-region"], cueOptionIds:["OPT-client-cue"], meaningOptionIds:["OPT-client-meaning"], moveOptionIds:["OPT-client-move"],
  } } };
  const snapshot: DecryptedAssessmentSnapshot = {
    databaseId:"db", assessmentSessionId:"session", snapshotId:"pwsn_tamper", snapshotRevision:"1", completedPass:2,
    evidenceSha256:"a".repeat(64), scopeSha256:"b".repeat(64), canonicalSnapshot:{ assessment_completion:{ completion_mode:"pass2_complete", last_completed_stage:"S5", safe_resume_stage:"complete", completed_at:"2026-09-02T12:00:00.000Z" }, responses:[{
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

test("private-note-shaped tokens never enter trusted response-order provenance", async () => {
  const manifest = await loadStructuredInstrumentManifest();
  const definition = manifest.itemById.get("BTM-201")!;
  const response = await enrichResponseFromAuthoredContract(
    normalizeTypedAssessmentResponse({ schemaVersion:"PWRS-1", privateNote:"UP-PRIVATE-SECRET", semantic:{ zones:["UP-H-01"] } }, "BTM-201"),
    "BTM-201",
    definition.version,
  );
  assert.deepEqual(trustedResponseOrderFromResponse(response), ["UP-H-01"]);
  assert.doesNotMatch(JSON.stringify(trustedResponseOrderFromResponse(response)), /PRIVATE-SECRET/u);
});
