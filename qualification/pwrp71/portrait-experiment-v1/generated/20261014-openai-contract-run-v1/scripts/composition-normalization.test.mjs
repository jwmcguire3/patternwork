import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { normalizeCompositionForPwrp71 } from "./composition-normalization.mjs";

const RUN_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = path.resolve(RUN_DIR, "..", "..", "..", "..", "..");
const schema = JSON.parse(await readFile(path.join(ROOT, "reporting", "schemas", "report_draft.schema.json"), "utf8"));

function fixture() {
  const claim = {
    id: "C10-C04", text: "An ordered report.", kind: "observation",
    constructs: ["reported_recovery_order", "choice_capacity"],
    scope: { level: "occurrence", occurrence_ids: ["occ-1"], person_ids: [], description: "One occurrence." },
    evidence_ids: ["obs-1", "obs-2"], counterevidence_ids: [], sequence_edge_ids: ["edge-1"],
    depends_on_claim_ids: [], support_basis: "Direct source-indexed actual_recalled ordered report.",
    rationale: "Directly reported.", remaining_uncertainty: "No causal order is established.",
  };
  return {
    composition: {
      title: "A bounded account", title_claim_ids: ["C10-C04"],
      content_status: "Draft; structural checks remain.",
      sections: [{ id: "s1", heading: "The change", text: "Words returned before clarity.", claim_ids: ["C10-C04"] }],
      reflection_questions: [{ text: "What changed first?", claim_ids: ["C10-C04"] }],
    },
    interpretation: { claims: [claim] },
  };
}

test("projects C10 intermediate observations into schema enums without changing claim meaning or source files", () => {
  const input = fixture();
  const result = normalizeCompositionForPwrp71({ profile: "C10", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) });
  assert.equal(result.claims[0].kind, "reported");
  assert.deepEqual(result.claims[0].constructs, ["recovery", "capacity"]);
  assert.deepEqual(result.claims[0].support_basis, ["direct_report", "actual_sequence"]);
  assert.deepEqual(result.claims[0].remaining_uncertainty, ["No causal order is established."]);
  assert.deepEqual(result.reflectionQuestions, ["What changed first?"]);
  assert.deepEqual(result.receipt.reflectionQuestionBindings[0].claim_ids, ["C10-C04"]);
  assert.equal(result.contentStatus, "complete");
  assert.equal(input.interpretation.claims[0].kind, "observation");
  assert.equal(typeof input.interpretation.claims[0].support_basis, "string");
});

test("rejects an unknown construct instead of silently dropping source meaning", () => {
  const input = fixture();
  input.interpretation.claims[0].constructs.push("unreviewed_construct");
  assert.throws(() => normalizeCompositionForPwrp71({ profile: "C10", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /no pinned safe PWRP mapping/);
});

test("rejects reflection questions that cite missing or unknown claims", () => {
  const input = fixture();
  input.composition.reflection_questions[0].claim_ids = ["made-up-claim"];
  assert.throws(() => normalizeCompositionForPwrp71({ profile: "C10", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /current C10 claims/);
});

test("fails closed if the pinned schema removes a required adapter label", () => {
  const input = fixture();
  const changed = structuredClone(schema);
  changed.$defs.construct.enum = changed.$defs.construct.enum.filter((value) => value !== "description");
  assert.throws(() => normalizeCompositionForPwrp71({ profile: "C10", ...input, schema: changed,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /reviewed fictional composition adapter contract/);
});

test("projects the constrained P02 response-function graph into pinned report enums", () => {
  const input = fixture();
  input.interpretation.claims = [
    { ...input.interpretation.claims[0], id: "c_conflict_preventive_explaining", kind: "interpretation",
      evidence_ids: ["preventive-1", "preventive-2", "preventive-3"],
      constructs: ["preventive_protection", "relational_management", "anticipated_disconnection_or_uncertainty"],
      support_basis: "Original authored fictional D61 first action, D02 prevention aim, and D03 remembered expectation/prediction, all bound to the same recalled conflict occurrence." },
    { ...input.interpretation.claims[0], id: "c_conflict_reported_sequence", kind: "observation",
      evidence_ids: ["sequence-first", "sequence-next", "sequence-link"],
      constructs: ["reported_temporal_order", "response_change"], sequence_edge_ids: ["edge-1"],
      support_basis: "The recalled actions are paired with an explicit reported temporal relation." },
    { ...input.interpretation.claims[0], id: "c_conflict_exit_relief", kind: "interpretation",
      evidence_ids: ["exit-action", "exit-aim", "exit-effect"],
      constructs: ["reactive_interruption", "protective_function", "immediate_relief", "leaving_or_ending_exchange"],
      depends_on_claim_ids: ["c_conflict_reported_sequence"],
      support_basis: "Original authored fictional D07 next action, D09 next aim, and D10 reported next effect." },
  ];
  input.interpretation.name_registry = [
    { name_id: "p02-explainer", name: "Explainer", entity_kind: "candidate_response_function",
      role: "preventive relational protection", author_generated: false,
      supporting_claim_ids: ["c_conflict_preventive_explaining", "c_conflict_reported_sequence"] },
    { name_id: "p02-exit", name: "Exit", entity_kind: "candidate_response_function",
      role: "reactive immediate-relief interruption", author_generated: false,
      supporting_claim_ids: ["c_conflict_reported_sequence", "c_conflict_exit_relief"] },
  ];
  input.interpretation.relationships = [
    { id: "p02-sequence", from_name_id: "p02-explainer", to_name_id: "p02-exit",
      relation: "reported_temporal_sequence", claim_ids: ["c_conflict_reported_sequence"] },
  ];
  input.composition.reflection_questions = [];
  const original = structuredClone(input.interpretation);
  const result = normalizeCompositionForPwrp71({ profile: "P02", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) });
  assert.deepEqual(result.claims.map((claim) => claim.kind), ["supported_interpretation", "reported", "supported_interpretation"]);
  assert.deepEqual(result.claims[0].constructs, ["protective_function", "description", "working_expectation"]);
  assert.deepEqual(result.claims[0].support_basis, ["direct_report", "stated_aim", "remembered_expectation", "inferred_function"]);
  assert.deepEqual(result.claims[1].support_basis, ["direct_report", "actual_sequence"]);
  assert.deepEqual(result.claims[2].constructs, ["protective_function", "description"]);
  assert.deepEqual(result.claims[2].support_basis, ["direct_report", "stated_aim", "reported_effect", "inferred_function"]);
  assert.deepEqual(result.claims[2].evidence_ids, ["exit-action", "exit-aim", "exit-effect", "sequence-first", "sequence-next", "sequence-link"]);
  assert.deepEqual(result.receipt.dependencyEvidenceClosure, [{
    claimId: "c_conflict_exit_relief",
    dependsOnClaimIds: ["c_conflict_reported_sequence"],
    addedEvidenceIds: ["sequence-first", "sequence-next", "sequence-link"],
    addedCounterevidenceIds: [],
    rule: "transitive_premise_leaf_evidence_retained_for_report_validator",
  }]);
  assert.deepEqual(result.nameRegistry.map(({ entity_kind, role }) => ({ entity_kind, role })), [
    { entity_kind: "descriptive_pattern", role: "descriptive_pattern" },
    { entity_kind: "descriptive_pattern", role: "descriptive_pattern" },
  ]);
  assert.deepEqual(result.nameRegistry.map(({ name }) => name), ["Explainer", "Exit"]);
  assert.deepEqual(result.relationships, []);
  assert.equal(result.receipt.schemaVersion, "PATTERNWORK-P02-PWRP71-COMPOSITION-NORMALIZATION-V3");
  assert.deepEqual(result.receipt.relationshipOmissions, [{
    relationshipId: "p02-sequence",
    sourceRelation: "reported_temporal_sequence",
    claimIds: ["c_conflict_reported_sequence"],
    rule: "omitted_from_report_relationship_enum; temporal order remains in the cited claim and section prose",
  }]);
  assert.deepEqual(input.interpretation, original);
  assert.equal(result.contentStatus, "complete");
});

test("fails closed for unknown P02 name registry entity kinds, roles, or relationship types", () => {
  for (const [field, value] of [["entity_kind", "part"], ["role", "protector"]]) {
    const input = fixture();
    input.interpretation.claims = [{ ...input.interpretation.claims[0], id: "c_conflict_preventive_explaining",
      kind: "interpretation", constructs: ["preventive_protection"],
      support_basis: "Original authored fictional source-indexed support." }];
    input.composition.reflection_questions = [];
    input.interpretation.name_registry = [{ name_id: "n1", name: "Explainer", entity_kind: "candidate_response_function",
      role: "preventive relational protection", author_generated: false, supporting_claim_ids: ["c_conflict_preventive_explaining"] }];
    input.interpretation.relationships = [];
    input.interpretation.name_registry[0][field] = value;
    assert.throws(() => normalizeCompositionForPwrp71({ profile: "P02", ...input, schema,
      packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /current, bounded candidate response function/);
  }

  const input = fixture();
  input.interpretation.claims = [{ ...input.interpretation.claims[0], id: "c_conflict_preventive_explaining",
    kind: "interpretation", constructs: ["preventive_protection"],
    support_basis: "Original authored fictional source-indexed support." }];
  input.composition.reflection_questions = [];
  input.interpretation.name_registry = [
    { name_id: "n1", name: "Explainer", entity_kind: "candidate_response_function", role: "preventive relational protection",
      author_generated: false, supporting_claim_ids: ["c_conflict_preventive_explaining"] },
    { name_id: "n2", name: "Exit", entity_kind: "candidate_response_function", role: "reactive immediate-relief interruption",
      author_generated: false, supporting_claim_ids: ["c_conflict_preventive_explaining"] },
  ];
  input.interpretation.relationships = [{ id: "r1", from_name_id: "n1", to_name_id: "n2",
    relation: "contrasts_with", claim_ids: ["c_conflict_preventive_explaining"] }];
  assert.throws(() => normalizeCompositionForPwrp71({ profile: "P02", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /cannot be represented without changing its reported temporal meaning/);
});

test("rejects an unmapped P02 construct and does not drop it", () => {
  const input = fixture();
  input.interpretation.claims[0].constructs = ["unreviewed_p02_construct"];
  assert.throws(() => normalizeCompositionForPwrp71({ profile: "P02", ...input, schema,
    packetSha256: "a".repeat(64), compositionSha256: "b".repeat(64), interpretationSha256: "c".repeat(64) }), /no pinned safe PWRP mapping/);
});
