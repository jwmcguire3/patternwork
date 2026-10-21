import assert from "node:assert/strict";
import test from "node:test";
import { validateFormulationMeaning, type Binding, type Row } from "../../lib/server/reports/pwrp71-formulation-core.ts";

const binding: Binding = { report_type: "IFS", report_release: "PWRP_7.1", release_id: "PWQE_5.1",
  snapshot_id: "snapshot", evidence_sha256: "a".repeat(64), analysis_sha256: "b".repeat(64) };

function formulation(field?: string, reference = "support_relationship"): Row {
  return { ...binding, formulation_contract: "PWRP-FORMULATION-3",
    claims: [{ id: "support_relationship", kind: "supported_interpretation", constructs: ["vulnerable_part", "part_relationship"] }],
    units: [{ id: "U1", kind: "need", statement: "Support can matter while asking feels difficult.",
      applicability: "When support is needed.", claim_ids: ["support_relationship"], entity_ids: [],
      importance: "core", delivery: "develop" }],
    organizing_unit_ids: ["U1"], development_order: [{ purpose: "Develop the tension", unit_ids: ["U1"], reframes_unit_ids: [] }],
    portraits: [], name_registry: [], relationships: [], coverage: [], alternatives: [], layer_references: [],
    exile_assessments: field ? [{ decision: "vulnerable_part", examined_claim_ids: [reference], affect_claim_ids: [], exclusion_claim_ids: [],
      relationship_claim_ids: [], protector_name_ids: [], [field]: [reference] }] : [],
  };
}

test("an explicit vulnerability decision examines its cited relationship claim", () => {
  assert.deepEqual(validateFormulationMeaning(formulation("relationship_claim_ids"), binding, { observations: [] }), []);
});

test("vulnerability decisions retain affect and exclusion reference coverage", () => {
  for (const field of ["affect_claim_ids", "exclusion_claim_ids"]) {
    assert.deepEqual(validateFormulationMeaning(formulation(field), binding, { observations: [] }), []);
  }
});

test("an uncited vulnerable relationship still requires an explicit decision", () => {
  const issues = validateFormulationMeaning(formulation(), binding, { observations: [] });
  assert.ok(issues.some(issue => issue.code === "unexamined_vulnerability"));
});

test("an unknown relationship reference does not satisfy examination of an existing claim", () => {
  const issues = validateFormulationMeaning(formulation("relationship_claim_ids", "missing_claim"), binding, { observations: [] });
  assert.ok(issues.some(issue => issue.code === "exile_reference"));
  assert.ok(issues.some(issue => issue.code === "unexamined_vulnerability"));
});
