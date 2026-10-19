import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { closePwrp71CitationInheritance } from "../../lib/server/reports/pwrp71-citation-closure.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const item = value as Record<string, unknown>;
  return `{${Object.keys(item).sort().map((key) => `${JSON.stringify(key)}:${canonical(item[key])}`).join(",")}}`;
}
function hash(value: unknown): string { return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex"); }

function packet(splitScope = false): JsonObject {
  const body: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1", release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
    snapshot_id: "snapshot-closure", packet_id: "packet-closure",
    source_binding: { question_release: PWQE51_RELEASE_IDENTITY.questionRelease, runtime_version: PWQE51_RELEASE_IDENTITY.routerVersion, source_sha256: PWQE51_RELEASE_IDENTITY.sourceSha256 },
    superseded_response_ids: [], invalidated_response_ids: [],
    observations: ["obs-a", "obs-b"].map((id, i) => ({ id, response_id: `response-${i}`, item_id: "D65", option_id: "D65.a", variant: "base", text: "I noticed a reaction.", displayed_text: "I noticed a reaction.", reported_value: "noticed", capture: "actual", occurrence_id: "occ-closure", step_id: `step-${i}`, basis: "actual_recalled", mode: "single", dependence_group: "", selection_reason: "fixture", source_version: "PWQE-5.1.0-candidate.1", person_id: splitScope && i === 0 ? "person-a" : null, signals: [], administration_id: `admin-${i}` })),
    episodes: [{ id: "occ-closure", family: "event", context: "work", basis: "actual_recalled", distinct_from: [], person_id: null }],
    steps: [0, 1].map((i) => ({ id: `step-row-${i}`, occurrence_id: "occ-closure", step_id: `step-${i}`, observation_ids: [`obs-${i === 0 ? "a" : "b"}`] })),
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], supported_alternatives: [], counterexamples: [], secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [], referent_scopes: splitScope ? [{ person_id: "person-a" }] : [], context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: [0, 1].map((i) => ({ id: `admin-${i}`, item_id: "D65", occurrence_id: "occ-closure", live_response_id: `response-${i}` })),
  };
  return { ...body, content_sha256: hash(body) } as JsonObject;
}

function makeDraft(release: string, packetValue: JsonObject, options: { wrongDerivedScope?: boolean; cycle?: boolean; missing?: boolean } = {}): JsonObject {
  const p = packetValue as Record<string, unknown>;
  const claim = (id: string, evidence: string[], counter: string[], deps: string[], scopeIds = ["occ-closure"], scopePeople: string[] = []) => ({
    id, text: `Claim ${id} describes a reported moment.`, kind: "reported", constructs: [], scope: { level: "occurrence", occurrence_ids: scopeIds, person_ids: scopePeople, description: "One recalled moment." },
    evidence_ids: evidence, counterevidence_ids: counter, sequence_edge_ids: [], depends_on_claim_ids: deps, support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
  });
  const claims = [
    claim("leaf-a", ["obs-a"], [], [], ["occ-closure"], options.wrongDerivedScope ? ["person-a"] : []),
    claim("leaf-b", ["obs-b"], ["obs-b"], []),
    claim("middle", ["obs-a", "obs-b"], [], ["leaf-a", "leaf-b"], ["occ-closure"], options.wrongDerivedScope ? ["person-a"] : []),
    claim("derived", ["obs-b"], [], options.missing ? ["not-there"] : options.cycle ? ["derived"] : ["middle"], ["occ-closure"]),
  ];
  return {
    report_release: release, release_id: p.release_id as string, snapshot_id: p.snapshot_id as string, evidence_sha256: p.content_sha256 as string, report_type: "MAP", title: "A reported moment", title_claim_ids: [], content_status: "complete",
    sections: [{ id: "section-1", heading: "One moment", text: "The response was noticed.", claim_ids: ["leaf-a", "leaf-b", "middle", "derived"] }], claims,
    name_registry: [], relationships: [], reflection_questions: [],
  } as JsonObject;
}

const sourcePromise = loadPwrp71SourcePackage();

test("closes transitive citations independently by field and preserves the raw draft", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const raw = makeDraft(source.policy.release, currentPacket);
  const rawCopy = structuredClone(raw);
  const input = { value: raw, reportType: "MAP" as const, snapshotId: "snapshot-closure", packet: currentPacket, source };
  const initial = validatePwrp71ReportDraft(input);
  assert.equal(initial.ok, false);
  if (!initial.ok) assert(initial.issues.length > 0 && initial.issues.every((issue) => issue.code === "claim_leaf_evidence"));
  const first = closePwrp71CitationInheritance(input);
  const second = closePwrp71CitationInheritance(input);
  assert.deepEqual(raw, rawCopy);
  assert.deepEqual(first, second);
  assert.deepEqual(first.rawValidationIssues.map((issue) => issue.code), ["claim_leaf_evidence", "claim_leaf_evidence"]);
  const normalized = first.artifact.draft.claims as Record<string, unknown>[];
  const derived = normalized.find((row) => row.id === "derived")!;
  assert.deepEqual(derived.evidence_ids, ["obs-b", "obs-a"]);
  assert.deepEqual(derived.counterevidence_ids, ["obs-b"]);
  assert.deepEqual(first.derivation.additions.map(({ claim_id, field, evidence_id }) => `${claim_id}:${field}:${evidence_id}`), ["middle:counterevidence_ids:obs-b", "derived:evidence_ids:obs-a", "derived:counterevidence_ids:obs-b"]);
  assert.deepEqual(first.derivation.additions.find((addition) => addition.claim_id === "derived" && addition.field === "counterevidence_ids")?.dependency_path, ["derived", "middle", "leaf-b"]);
  assert.equal(validatePwrp71ReportDraft({ ...input, value: first.artifact.draft }).ok, true);
});

test("refuses valid no-op drafts and drafts with any failure beyond leaf inheritance", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  const fullyCited = makeDraft(source.policy.release, currentPacket);
  for (const claim of fullyCited.claims as Record<string, unknown>[]) {
    for (const dep of claim.depends_on_claim_ids as string[]) {
      const premise = (fullyCited.claims as Record<string, unknown>[]).find((row) => row.id === dep)!;
      for (const field of ["evidence_ids", "counterevidence_ids"] as const) claim[field] = [...new Set([...(claim[field] as string[]), ...(premise[field] as string[])])];
    }
  }
  assert.throws(() => closePwrp71CitationInheritance({ value: fullyCited, reportType: "MAP", snapshotId: "snapshot-closure", packet: currentPacket, source }));
  const malformed = structuredClone(makeDraft(source.policy.release, currentPacket));
  malformed.title = "";
  assert.throws(() => closePwrp71CitationInheritance({ value: malformed, reportType: "MAP", snapshotId: "snapshot-closure", packet: currentPacket, source }));
});

test("rejects cycles and missing dependencies before normalization", async () => {
  const source = await sourcePromise;
  const currentPacket = packet();
  for (const options of [{ cycle: true }, { missing: true }]) {
    assert.throws(() => closePwrp71CitationInheritance({ value: makeDraft(source.policy.release, currentPacket, options), reportType: "MAP", snapshotId: "snapshot-closure", packet: currentPacket, source }));
  }
});

test("rejects closure when inherited evidence falls outside the derived claim scope", async () => {
  const source = await sourcePromise;
  const currentPacket = packet(true);
  const raw = makeDraft(source.policy.release, currentPacket, { wrongDerivedScope: true });
  const initial = validatePwrp71ReportDraft({ value: raw, reportType: "MAP", snapshotId: "snapshot-closure", packet: currentPacket, source });
  assert.equal(initial.ok, false);
  if (!initial.ok) assert(initial.issues.length > 0 && initial.issues.every((issue) => issue.code === "claim_leaf_evidence"));
  assert.throws(() => closePwrp71CitationInheritance({ value: raw, reportType: "MAP", snapshotId: "snapshot-closure", packet: currentPacket, source }));
});
