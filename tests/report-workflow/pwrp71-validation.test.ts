import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
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
    format: "patternwork-router-evidence-v1",
    release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
    snapshot_id: "snapshot-a",
    packet_id: "packet-a",
    source_binding: {
      question_release: PWQE51_RELEASE_IDENTITY.questionRelease,
      runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion,
      source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256,
    },
    superseded_response_ids: [],
    invalidated_response_ids: [],
    observations: [{
      id: "obs-1", response_id: "response-1", item_id: "D65", option_id: "D65.a", variant: "base",
      text: "I noticed a reaction.", displayed_text: "I noticed a reaction.", reported_value: "noticed", capture: "actual",
      occurrence_id: "occ-1", step_id: "step-1", basis: "actual_recalled", mode: "single", dependence_group: "",
      selection_reason: "fixture", source_version: "PWQE-5.1.0-candidate.1", person_id: null, signals: [], administration_id: "admin-1",
    }],
    episodes: [{ id: "occ-1", family: "event", context: "work", basis: "actual_recalled", distinct_from: [], person_id: null }],
    steps: [{ id: "step-row-1", occurrence_id: "occ-1", step_id: "step-1", observation_ids: ["obs-1"] }],
    sequence_edges: [],
    target_resolutions: [],
    structural_evidence_summaries: [],
    supported_alternatives: [], counterexamples: [], secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [],
    referent_scopes: [], context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: [{ id: "admin-1", item_id: "D65", occurrence_id: "occ-1", live_response_id: "response-1" }],
  };
  return { ...body, content_sha256: hash(body) } as JsonObject;
}

function draft(sourceRelease: string, packetValue = packet()): Record<string, unknown> {
  const p = packetValue as Record<string, unknown>;
  return {
    report_release: sourceRelease,
    release_id: p.release_id,
    snapshot_id: p.snapshot_id,
    evidence_sha256: p.content_sha256,
    report_type: "MAP",
    title: "A reported moment",
    title_claim_ids: [],
    content_status: "complete",
    sections: [{ id: "section-1", heading: "One moment", text: "The response was noticed.", claim_ids: ["claim-1"] }],
    claims: [{
      id: "claim-1", text: "The response was noticed.", kind: "reported", constructs: [],
      scope: { level: "occurrence", occurrence_ids: ["occ-1"], person_ids: [], description: "One recalled moment." },
      evidence_ids: ["obs-1"], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
      support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
    }],
    name_registry: [], relationships: [], reflection_questions: [],
  };
}

const sourcePromise = loadPwrp71SourcePackage();

test("validates a pinned PWRP 7.1 draft and deterministically renders its artifact", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const input = { value: draft(source.policy.release, currentPacket), reportType: "MAP" as const, snapshotId: "snapshot-a", packet: currentPacket, source };
  const first = validatePwrp71ReportDraft(input);
  const second = validatePwrp71ReportDraft(input);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.equal(first.value.artifact_type, "pwrp71_report");
  assert.match(first.value.report_markdown, /^# A reported moment/mu);
  assert.equal(first.value.digests.report_markdown_sha256, hash(first.value.report_markdown));
  assert.equal(first.value.digests.artifact_sha256, hash(Object.fromEntries(Object.entries(first.value).filter(([key]) => key !== "digests"))));
});

test("rejects stale, forged, and cross-scope evidence claims", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const base = draft(source.policy.release, currentPacket);
  const crossScope = structuredClone(base);
  ((crossScope.claims as Record<string, unknown>[])[0].scope as Record<string, unknown>).occurrence_ids = ["forged-occurrence"];
  const forgedEvidence = structuredClone(base);
  (forgedEvidence.claims as Record<string, unknown>[])[0].evidence_ids = ["made-up-observation"];
  const stalePacket = structuredClone(currentPacket) as Record<string, unknown>;
  stalePacket.invalidated_response_ids = ["response-1"];
  delete stalePacket.content_sha256;
  const staleContents = { ...stalePacket };
  stalePacket.content_sha256 = hash(staleContents);
  const staleDraft = draft(source.policy.release, stalePacket as JsonObject);
  const results = [
    validatePwrp71ReportDraft({ value: crossScope, reportType: "MAP", snapshotId: "snapshot-a", packet: currentPacket, source }),
    validatePwrp71ReportDraft({ value: forgedEvidence, reportType: "MAP", snapshotId: "snapshot-a", packet: currentPacket, source }),
    validatePwrp71ReportDraft({ value: staleDraft, reportType: "MAP", snapshotId: "snapshot-a", packet: stalePacket as JsonObject, source }),
  ];
  assert(results.every((result) => !result.ok));
});

test("rejects source or snapshot drift before artifact creation", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const value = draft(source.policy.release, currentPacket);
  const wrongSnapshot = validatePwrp71ReportDraft({ value, reportType: "MAP", snapshotId: "other-snapshot", packet: currentPacket, source });
  const wrongReport = validatePwrp71ReportDraft({ value: { ...value, report_release: "PWRP-6.0" }, reportType: "MAP", snapshotId: "snapshot-a", packet: currentPacket, source });
  assert.equal(wrongSnapshot.ok, false);
  assert.equal(wrongReport.ok, false);
});

test("reader prose cannot expose an internal occurrence ID", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const leaking = draft(source.policy.release, currentPacket);
  ((leaking.claims as Record<string, unknown>[])[0]!).text = "This response occurred in occ-1.";
  const result = validatePwrp71ReportDraft({ value: leaking, reportType: "MAP", snapshotId: "snapshot-a", packet: currentPacket, source });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((entry) => entry.code === "reader_internal_occurrence_id"));
});

test("repeated step names stay occurrence-scoped and temporal cycles are rejected", async () => {
  const source = await sourcePromise;
  const base = packet() as Record<string, unknown>;
  const expanded = structuredClone(base) as Record<string, unknown>;
  expanded.episodes = [...expanded.episodes as unknown[], { id: "occ-2", family: "event", context: "home", basis: "actual_recalled", distinct_from: [], person_id: null }];
  expanded.steps = [
    ...expanded.steps as unknown[],
    { id: "step-row-2", occurrence_id: "occ-1", step_id: "step-2", observation_ids: [] },
    { id: "step-row-3", occurrence_id: "occ-2", step_id: "step-1", observation_ids: [] },
  ];
  expanded.sequence_edges = [{ id: "edge-1", occurrence_id: "occ-1", from_step: "step-1", to_step: "step-2", meaning: "reported sequence", relation: "before", evidence_ids: ["obs-1"], first_not_helping: false }];
  delete expanded.content_sha256;
  expanded.content_sha256 = hash(expanded);
  const valid = validatePwrp71ReportDraft({ value: draft(source.policy.release, expanded as JsonObject), reportType: "MAP", snapshotId: "snapshot-a", packet: expanded as JsonObject, source });
  assert.equal(valid.ok, true, valid.ok ? undefined : JSON.stringify(valid.issues));

  const cyclic = structuredClone(expanded) as Record<string, unknown>;
  cyclic.sequence_edges = [
    { id: "edge-1", occurrence_id: "occ-1", from_step: "step-1", to_step: "step-2", meaning: "reported sequence", relation: "before", evidence_ids: ["obs-1"], first_not_helping: false },
    { id: "edge-2", occurrence_id: "occ-1", from_step: "step-2", to_step: "step-1", meaning: "reported sequence", relation: "before", evidence_ids: ["obs-1"], first_not_helping: false },
  ];
  delete cyclic.content_sha256;
  cyclic.content_sha256 = hash(cyclic);
  const rejected = validatePwrp71ReportDraft({ value: draft(source.policy.release, cyclic as JsonObject), reportType: "MAP", snapshotId: "snapshot-a", packet: cyclic as JsonObject, source });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.ok(rejected.issues.some((entry) => entry.code === "sequence_cycle"));
});
