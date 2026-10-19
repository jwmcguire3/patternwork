import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { restorePwrp71TypedReferences } from "../../lib/server/reports/pwrp71-reference-restoration.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

const OBS_A = "O12345678901234567890";
const OBS_B = "O22345678901234567890";
const OCC_A = "pwep_11111111-2222-4333-8444-555555555555";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}
function hash(value: unknown): string { return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex"); }

function packet(options: { observationIds?: string[]; occurrenceId?: string } = {}): JsonObject {
  const observationIds = options.observationIds ?? [OBS_A, OBS_B];
  const occurrenceId = options.occurrenceId ?? OCC_A;
  const body: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1", release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
    snapshot_id: "snapshot-restore", packet_id: "packet-restore",
    source_binding: { question_release: PWQE51_RELEASE_IDENTITY.questionRelease, runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion, source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256 },
    superseded_response_ids: [], invalidated_response_ids: [],
    observations: observationIds.map((id, i) => ({ id, response_id: `response-${i}`, item_id: "D65", option_id: "D65.a", variant: "base", text: "I noticed a reaction.", displayed_text: "I noticed a reaction.", reported_value: "noticed", capture: "actual", occurrence_id: occurrenceId, step_id: `step-${i}`, basis: "actual_recalled", mode: "single", dependence_group: "", selection_reason: "fixture", source_version: "PWQE-5.1.0-candidate.1", person_id: null, signals: [], administration_id: `admin-${i}` })),
    episodes: [{ id: occurrenceId, family: "event", context: "work", basis: "actual_recalled", distinct_from: [], person_id: null }],
    steps: observationIds.map((id, i) => ({ id: `step-row-${i}`, occurrence_id: occurrenceId, step_id: `step-${i}`, observation_ids: [id] })),
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], supported_alternatives: [], counterexamples: [], secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [], referent_scopes: [], context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: observationIds.map((_, i) => ({ id: `admin-${i}`, item_id: "D65", occurrence_id: occurrenceId, live_response_id: `response-${i}` })),
  };
  return { ...body, content_sha256: hash(body) } as JsonObject;
}

function draft(release: string, packetValue: JsonObject, evidenceIds: string[], occurrenceIds?: string[], title = "A reported moment"): JsonObject {
  const p = packetValue as Record<string, unknown>;
  return {
    report_release: release, release_id: p.release_id as string, snapshot_id: p.snapshot_id as string, evidence_sha256: p.content_sha256 as string, report_type: "MAP", title,
    title_claim_ids: [], content_status: "complete",
    sections: [{ id: "section-1", heading: "One moment", text: "The response was noticed.", claim_ids: ["claim-1"] }],
    claims: [{
      id: "claim-1", text: "The response was noticed.", kind: "reported", constructs: [], scope: { level: "occurrence", occurrence_ids: occurrenceIds ?? [OCC_A], person_ids: [], description: "One recalled moment." },
      evidence_ids: evidenceIds, counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [], support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
    }],
    name_registry: [], relationships: [], reflection_questions: [],
  } as JsonObject;
}
const sourcePromise = loadPwrp71SourcePackage();

test("restores one typed observation reference, preserves raw input, and is deterministic", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const raw = draft(source.policy.release, currentPacket, ["O1234567890123456789a"]);
  const original = structuredClone(raw);
  const input = { value: raw, reportType: "MAP" as const, snapshotId: "snapshot-restore", packet: currentPacket, source };
  const first = restorePwrp71TypedReferences(input);
  const second = restorePwrp71TypedReferences(input);
  assert.deepEqual(raw, original);
  assert.deepEqual(first, second);
  const claim = (first.artifact.draft.claims as Record<string, unknown>[])[0];
  assert.deepEqual(claim.evidence_ids, [OBS_A]);
  assert.deepEqual(first.derivation.replacements, [{ path: "$.claims[0].evidence_ids[0]", field: "evidence_ids", old_id: "O1234567890123456789a", restored_id: OBS_A, candidate_count: 1, edit_distance: 1 }]);
  assert.equal(first.derivation.raw_draft_sha256, hash(original));
  assert.equal(validatePwrp71ReportDraft({ ...input, value: first.artifact.draft }).ok, true);
});

test("restores one typed occurrence scope reference from the same claim's cited observation", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const raw = draft(source.policy.release, currentPacket, [OBS_A], ["pwep_11111111-2222-4333-8444-55555555555a"]);
  const input = { value: raw, reportType: "MAP" as const, snapshotId: "snapshot-restore", packet: currentPacket, source };
  const result = restorePwrp71TypedReferences(input);
  assert.deepEqual(result.derivation.replacements, [{ path: "$.claims[0].scope.occurrence_ids[0]", field: "scope.occurrence_ids", old_id: "pwep_11111111-2222-4333-8444-55555555555a", restored_id: OCC_A, candidate_count: 1, edit_distance: 1 }]);
  assert.deepEqual((result.artifact.draft.claims as Record<string, unknown>[])[0].scope && ((result.artifact.draft.claims as Record<string, unknown>[])[0].scope as Record<string, unknown>).occurrence_ids, [OCC_A]);
});

test("refuses ambiguous, two-edit, and multiple unknown references", async () => {
  const source = await sourcePromise;
  const currentPacket = packet({ observationIds: [OBS_A, "O12345678901234567891"] });
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, currentPacket, ["O1234567890123456789a"]), reportType: "MAP", snapshotId: "snapshot-restore", packet: currentPacket, source }));

  const uniquePacket = packet();
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, uniquePacket, ["O123456789012345678aa"]), reportType: "MAP", snapshotId: "snapshot-restore", packet: uniquePacket, source }));
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, uniquePacket, ["O1234567890123456789a", "O2234567890123456789a"]), reportType: "MAP", snapshotId: "snapshot-restore", packet: uniquePacket, source }));
});

test("refuses already valid drafts, unrelated validation failures, and reference duplicates", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, currentPacket, [OBS_A]), reportType: "MAP", snapshotId: "snapshot-restore", packet: currentPacket, source }));
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, currentPacket, ["O1234567890123456789a"], undefined, ""), reportType: "MAP", snapshotId: "snapshot-restore", packet: currentPacket, source }));
  assert.throws(() => restorePwrp71TypedReferences({ value: draft(source.policy.release, currentPacket, ["O1234567890123456789a", "O1234567890123456789a"]), reportType: "MAP", snapshotId: "snapshot-restore", packet: currentPacket, source }));
});

test("never changes an existing valid scope ID and rejects global scope ambiguity or introduced duplicates", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const other = "pwep_11111111-2222-4333-8444-555555555556";
  (currentPacket.episodes as JsonObject[]).push({ ...(currentPacket.episodes as JsonObject[])[0], id: other });
  const body = {...currentPacket};delete body.content_sha256;
  currentPacket.content_sha256 = hash(body);
  const input = {reportType:"MAP" as const,snapshotId:"snapshot-restore",packet:currentPacket,source};
  assert.throws(()=>restorePwrp71TypedReferences({...input,value:draft(source.policy.release,currentPacket,[OBS_A],[other])}));
  assert.throws(()=>restorePwrp71TypedReferences({...input,value:draft(source.policy.release,currentPacket,[OBS_A],["pwep_11111111-2222-4333-8444-55555555555a"])}));
  const single = packet();
  assert.throws(()=>restorePwrp71TypedReferences({...input,packet:single,value:draft(source.policy.release,single,[OBS_A],[OCC_A,"pwep_11111111-2222-4333-8444-55555555555a"])}));
});
