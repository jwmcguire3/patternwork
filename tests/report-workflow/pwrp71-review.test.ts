import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { validatePwrp71Review } from "../../lib/server/reports/pwrp71-review.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex");
}

function packet(): JsonObject {
  const body: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1", release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
    snapshot_id: "snapshot-a", packet_id: "packet-a",
    source_binding: { question_release: PWQE51_RELEASE_IDENTITY.questionRelease, runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion, source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256 },
    superseded_response_ids: [], invalidated_response_ids: [],
    observations: [{ id: "obs-1", response_id: "response-1", item_id: "D65", option_id: "D65.a", occurrence_id: "occ-1", step_id: "step-1", basis: "actual_recalled", person_id: null }],
    episodes: [{ id: "occ-1", basis: "actual_recalled", context: "work", distinct_from: [] }],
    steps: [{ id: "step-row-1", occurrence_id: "occ-1", step_id: "step-1", observation_ids: ["obs-1"] }],
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], missingness: [], corrections: [],
    referent_scopes: [], administration_provenance: [{ id: "admin-1", live_response_id: "response-1" }],
  };
  return { ...body, content_sha256: hash(body) } as JsonObject;
}

function draft(sourceRelease: string, packetValue: JsonObject, text = "A reported moment."): Record<string, unknown> {
  const p = packetValue as Record<string, unknown>;
  return {
    report_release: sourceRelease, release_id: p.release_id, snapshot_id: p.snapshot_id,
    evidence_sha256: p.content_sha256, report_type: "MAP", title: "A reported moment", title_claim_ids: [], content_status: "complete",
    sections: [{ id: "section-1", heading: "One moment", text, claim_ids: ["claim-1"] }],
    claims: [{ id: "claim-1", text, kind: "reported", constructs: [], scope: { level: "occurrence", occurrence_ids: ["occ-1"], person_ids: [], description: "One moment." },
      evidence_ids: ["obs-1"], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [], support_basis: ["direct_report"], rationale: "Direct report.", remaining_uncertainty: [] }],
    name_registry: [], relationships: [], reflection_questions: [],
  };
}

const sourcePromise = loadPwrp71SourcePackage();

async function acceptedInputs() {
  const source = await sourcePromise;
  const currentPacket = packet();
  const result = validatePwrp71ReportDraft({ value: draft(source.policy.release, currentPacket), reportType: "MAP", snapshotId: "snapshot-a", packet: currentPacket, source });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Test fixture report draft failed structural validation.");
  const review = {
    review_contract: "PWRP-REVIEW-7.0.0-candidate.1", report_release: source.policy.release,
    reviewed_draft_sha256: hash(result.value.draft), reviewed_evidence_sha256: String((currentPacket as Record<string, unknown>).content_sha256),
    verdict: "accept", issues: [], summary: "Structurally bound review fixture.",
  };
  return { source, packet: currentPacket, artifact: result.value, review };
}

test("returns a structural receipt bound to the exact draft artifact and packet", async () => {
  const input = await acceptedInputs();
  const result = validatePwrp71Review({ ...input, value: input.review });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.receipt_type, "pwrp71_structural_review_receipt");
  assert.equal(result.value.report_id, input.artifact.report_id);
  assert.equal(result.value.reviewed_draft_sha256, hash(input.artifact.draft));
  assert.equal(result.value.verdict, "accept");
});

test("rejects a review after draft repair changes the canonical draft digest", async () => {
  const input = await acceptedInputs();
  const repaired = validatePwrp71ReportDraft({
    value: draft(input.source.policy.release, input.packet, "The revised report moment."), reportType: "MAP", snapshotId: "snapshot-a", packet: input.packet, source: input.source,
  });
  assert.equal(repaired.ok, true);
  if (!repaired.ok) return;
  const result = validatePwrp71Review({ ...input, artifact: repaired.value, value: input.review });
  assert.equal(result.ok, false);
  if (!result.ok) assert(result.issues.some((entry) => entry.code === "review_binding"));
});

test("rejects mismatched source, packet, and forged reviewer references", async () => {
  const input = await acceptedInputs();
  const forged = structuredClone(input.review) as Record<string, unknown>;
  forged.issues = [{ id: "issue-1", category: "overreach", claim_ids: ["not-a-claim"], section_ids: [], name_ids: [], relationship_ids: [], evidence_ids: ["not-observation"], reason: "Fixture.", requested_change: "Revise." }];
  forged.verdict = "revise";
  const refs = validatePwrp71Review({ ...input, value: forged });
  assert.equal(refs.ok, false);
  if (!refs.ok) assert(refs.issues.some((entry) => entry.code === "review_reference"));

  const otherPacket = structuredClone(input.packet) as Record<string, unknown>;
  otherPacket.snapshot_id = "snapshot-b";
  delete otherPacket.content_sha256;
  otherPacket.content_sha256 = hash(otherPacket);
  const packetResult = validatePwrp71Review({ ...input, packet: otherPacket as JsonObject, value: input.review });
  assert.equal(packetResult.ok, false);

  const wrongSource = { ...input.source, manifestSha256: "0".repeat(64) as typeof input.source.manifestSha256 };
  const sourceResult = validatePwrp71Review({ ...input, source: wrongSource, value: input.review });
  assert.equal(sourceResult.ok, false);
});
