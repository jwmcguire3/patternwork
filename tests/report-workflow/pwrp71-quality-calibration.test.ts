import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { EXPLANATORY_ASPECTS, PWRP71_REVIEW_CONTRACT, REVIEW_DIMENSIONS, validatePwrp71ReviewQuality } from "../../lib/server/reports/pwrp71-review-quality.ts";

// Human-authored calibration expectations. These test the review contract and
// bookkeeping, not whether a model recognizes these distinctions in new prose.
const cases = [
  {
    name: "restricted choice across sampled contexts", status: "realized",
    evidence: ["At work I did not feel free to refuse because the deadline was mine.", "With my friend I did not feel free to refuse because they needed a lift."],
    account: "In these situations, refusal did not feel available, for different practical reasons.",
    rationale: "The shared reported condition organizes limited choice; it establishes neither coercion, a common cause, nor a shared part.",
  },
  {
    name: "different preventive and relief aims", status: "realized",
    evidence: ["I checked ahead so the problem would not happen.", "I wanted help but kept managing alone.", "I finished the task but did not feel better."],
    account: "Prevention, getting through the task, and feeling relief are different aims here; managing alone coexists with wanting help.",
    rationale: "The contrast explains the portrait without asserting that every action serves one hidden motive.",
  },
  {
    name: "held-out practical route planning", status: "no_material_opportunity",
    evidence: ["I checked the route because the bridge was closed."],
    account: "You checked the route to find a way around the closure.",
    rationale: "This narrow practical explanation supports no distress-protection job, burden, exile, or wider internal relationship.",
  },
  {
    name: "held-out relief sought but not obtained", status: "realized",
    evidence: ["I felt ashamed and wanted to stop feeling it.", "I distracted myself, but it did not make the feeling easier."],
    account: "Distraction sought relief from the shame without achieving the easing you wanted.",
    rationale: "An unsuccessful outcome does not erase the reported relief-seeking function; no excluded self-state or acquisition history is supplied.",
  },
  {
    name: "borderline ordinary expectation", status: "no_material_opportunity",
    evidence: ["I expected the meeting to start late because the train was delayed."],
    account: "You expected a late start given the delay.",
    rationale: "This ordinary contextual expectation does not establish a constraining extreme belief carried by a part.",
  },
] as const;

function inputs(example: typeof cases[number]) {
  const ids = example.evidence.map((_, i) => `obs-${i}`);
  const packet: JsonObject = { observations: example.evidence.map((text, i) => ({ id: ids[i], text })) };
  const draft: JsonObject = { title_claim_ids: [], sections: [{ id: "s", text: example.account, claim_ids: ["c"] }], claims: [{ id: "c", text: example.account, evidence_ids: ids, counterevidence_ids: [] }] };
  const absent = { status: "not_supported", evidence_ids: ids, claim_ids: [] as string[], rationale: "The source does not establish further material findings for this aspect in this bounded calibration case." };
  const review = {
    review_contract: PWRP71_REVIEW_CONTRACT, report_release: "PWRP-7.1.0-candidate.1",
    reviewed_draft_sha256: "fixture-draft", reviewed_evidence_sha256: "fixture-source", verdict: "accept", issues: [] as JsonObject[], summary: example.rationale,
    quality_assessment: Object.fromEntries(REVIEW_DIMENSIONS.map(d => [d, { status: "adequate", rationale: String(example.rationale) }])),
    evidence_coverage: [{ evidence_ids: ids, claim_ids: ["c"], disposition: "represented", rationale: "The bounded account carries these observations." }],
    explanatory_assessment: Object.fromEntries(EXPLANATORY_ASPECTS.map(aspect => [aspect, { ...absent }])),
    synthesis_opportunity: { status: String(example.status), evidence_ids: ids, claim_ids: example.status === "realized" ? ["c"] : [], rationale: String(example.rationale) },
  };
  return { review, packet, draft };
}

const schema = JSON.parse(readFileSync("reporting/schemas/report_review.schema.json", "utf8"));
const validateSchema = new Ajv2020({ allErrors: true, strict: false }).compile(schema);

for (const example of cases) {
  test(`calibration receipt: ${example.name}`, () => {
    const { review, draft, packet } = inputs(example);
    assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
    assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  });
}

test("coverage and absence of invention alone cannot satisfy the expanded review schema", () => {
  const { review } = inputs(cases[0]);
  Reflect.deleteProperty(review, "explanatory_assessment");
  Reflect.deleteProperty(review, "synthesis_opportunity");
  assert.equal(validateSchema(review), false);
});

test("a positive explanation must reference evidence carried by reader-surfaced claims", () => {
  const { review, draft, packet } = inputs(cases[0]);
  review.explanatory_assessment.choice = { status: "adequate", evidence_ids: ["obs-0"], claim_ids: ["c"], rationale: cases[0].rationale };
  assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  (draft.sections as JsonObject[])[0].claim_ids = [];
  assert.ok(validatePwrp71ReviewQuality(review, draft, packet).some(i => i.code === "review_explanation_support"));
});

test("foreign explanatory references and mismatched evidence cannot make a positive judgment", () => {
  const { review, draft, packet } = inputs(cases[1]);
  review.synthesis_opportunity.evidence_ids = ["foreign-observation"];
  const issues = validatePwrp71ReviewQuality(review, draft, packet);
  assert.ok(issues.some(i => i.code === "review_explanation_reference"));
  assert.ok(issues.some(i => i.code === "review_explanation_support"));
});

test("a declared material synthesis failure needs evidence-linked revision instructions", () => {
  const { review, draft, packet } = inputs(cases[0]);
  review.synthesis_opportunity.status = "revise";
  assert.ok(validatePwrp71ReviewQuality(review, draft, packet).some(i => i.code === "review_explanation_revision"));
  review.verdict = "revise";
  review.quality_assessment.narrative_quality.status = "revise";
  review.issues = [{ id: "i", category: "voice", claim_ids: ["c"], section_ids: ["s"], name_ids: [], relationship_ids: [], evidence_ids: ["obs-0", "obs-1"], reason: "An itinerary lists both scenes but loses their shared reported restriction on choice.", requested_change: "Explain that bounded shared condition, preserving the different practical reasons and withholding common cause or part identity." }];
  assert.equal(validateSchema(review), true);
  assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
});

for (const failure of [
  { source: 0, account: "The same protector makes you comply everywhere because everyone coerces you.", reason: "Reported restricted choice in sampled situations does not establish coercion, common cause, shared part, or a universal trait." },
  { source: 1, account: "Every response hides the same fear of being abandoned.", reason: "Prevention, wanting help while managing alone, and functioning without relief support distinctions but no supplied common abandonment motive." },
  { source: 4, account: "Your Planner carries the burden that every meeting will go wrong.", reason: "An ordinary expectation about a delayed train supplies no current constraining extreme belief or feeling carried by a part." },
] as const) {
  test(`negative calibration receipt: ${failure.reason}`, () => {
    const { review, draft, packet } = inputs(cases[failure.source]);
    (draft.sections as JsonObject[])[0].text = failure.account;
    (draft.claims as JsonObject[])[0].text = failure.account;
    const ids = (packet.observations as JsonObject[]).map(o => String(o.id));
    review.verdict = "revise";
    review.quality_assessment.source_fidelity = { status: "revise", rationale: failure.reason };
    review.synthesis_opportunity = { status: "revise", evidence_ids: ids, claim_ids: ["c"], rationale: failure.reason };
    review.issues = [{ id: "i", category: "overreach", claim_ids: ["c"], section_ids: ["s"], name_ids: [], relationship_ids: [], evidence_ids: ids, reason: failure.reason, requested_change: "Re-derive the connection from the source, retaining its supported bounded meaning and removing the invented assertion." }];
    assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
    assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  });
}

test("unsupported aspects remain optional findings for every report layer", () => {
  const { review, draft, packet } = inputs(cases[2]);
  for (const report_type of ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]) {
    draft.report_type = report_type;
    assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  }
});

test("canonical construct and repair instructions preserve interpretation boundaries", async () => {
  const [guide, shared, repair, generator] = await Promise.all([
    readFile("reporting/contracts/CONSTRUCT_GUIDE.md", "utf8"),
    readFile("reporting/prompts/00_SHARED_REPORT_PROMPT_v7.md", "utf8"),
    readFile("reporting/prompts/07_REPAIR_REPORT_PROMPT.md", "utf8"), readFile("lib/server/reports/generator.ts", "utf8"),
  ]);
  // The guide owns definitions; layer/reviewer prompts need not repeat them or
  // the case-specific examples already represented by the fixtures above.
  assert.match(guide, /current constraining extreme belief\/feeling carried by a part/u);
  assert.match(guide, /not every ordinary expectation/u);
  assert.match(guide, /Ordinary problem solving is not automatically emotional protection/u);
  assert.match(shared, /strongest material connection or contrast/u);
  assert.match(repair, /Compare the before and after meanings/u);
  assert.match(repair, /function, vulnerability, context, cost, relationships, and choice/u);
  assert.ok(!generator.includes("without giving it common causal or organizing force"));
});

function mixedRevisionInputs() {
  const { review, draft, packet } = inputs(cases[1]);
  review.verdict = "revise";
  review.quality_assessment.semantic_completeness.status = "revise";
  review.explanatory_assessment.triggers = {
    status: "revise", evidence_ids: ["obs-0", "obs-1"], claim_ids: ["c"],
    rationale: "One represented condition remains sound; another material condition is omitted from the readable account.",
  };
  review.evidence_coverage = [
    { evidence_ids: ["obs-0", "obs-2"], claim_ids: ["c"], disposition: "represented", rationale: "These observations remain represented." },
    { evidence_ids: ["obs-1"], claim_ids: ["c"], disposition: "missing", rationale: "The material distinction carried by this observation is omitted." },
  ];
  review.issues = [{
    id: "mixed-omission", category: "material_omission", claim_ids: ["c"], section_ids: ["s"], name_ids: [], relationship_ids: [],
    evidence_ids: ["obs-1"], reason: "A material contextual condition is omitted from the readable account.",
    requested_change: "Restore the omitted condition while retaining the represented condition and the supported scope.",
  }];
  return { review, draft, packet };
}

test("a revised aspect may cite represented examples while its issue targets only the omitted subset", () => {
  const { review, draft, packet } = mixedRevisionInputs();
  assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
  assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  assert.equal(review.verdict, "revise", "a consistent revision receipt does not accept the report");
});

test("an unrelated evidence issue cannot support an explanatory revision", () => {
  const { review, draft, packet } = mixedRevisionInputs();
  review.issues[0].evidence_ids = ["obs-2"];
  assert.ok(validatePwrp71ReviewQuality(review, draft, packet).some(i => i.code === "review_explanation_revision"));
});

test("overlap with a represented example cannot conceal an unaddressed declared omission", () => {
  const { review, draft, packet } = mixedRevisionInputs();
  review.issues[0].evidence_ids = ["obs-0"];
  const issues = validatePwrp71ReviewQuality(review, draft, packet);
  assert.ok(issues.some(i => i.code === "review_coverage_omission"));
  assert.ok(!issues.some(i => i.code === "review_explanation_revision"), "the missing-coverage gate supplies the distinguishing evidence, not textual judgment");
});

for (const change of ["no_issue", "blank_request", "blank_reason", "no_deficient_dimension", "accept_with_deficiency"] as const) {
  test(`a mixed explanatory revision rejects ${change}`, () => {
    const { review, draft, packet } = mixedRevisionInputs();
    if (change === "no_issue") review.issues = [];
    if (change === "blank_request") review.issues[0].requested_change = " ";
    if (change === "blank_reason") review.issues[0].reason = " ";
    if (change === "no_deficient_dimension") review.quality_assessment.semantic_completeness.status = "adequate";
    if (change === "accept_with_deficiency") review.verdict = "accept";
    assert.ok(validatePwrp71ReviewQuality(review, draft, packet).some(i => i.code === "review_explanation_revision"));
  });
}

for (const change of ["no_omission_issue", "no_completeness_revision"] as const) {
  test(`declared missing coverage rejects ${change} even when explanatory evidence intersects`, () => {
    const { review, draft, packet } = mixedRevisionInputs();
    if (change === "no_omission_issue") review.issues[0].category = "voice";
    if (change === "no_completeness_revision") {
      review.quality_assessment.semantic_completeness.status = "adequate";
      review.quality_assessment.narrative_quality.status = "revise";
    }
    assert.ok(validatePwrp71ReviewQuality(review, draft, packet).some(i => i.code === "review_coverage_omission"));
  });
}

test("positive review evidence carried only by an uncited claim still fails the support guard", () => {
  const { review, draft, packet } = inputs(cases[1]);
  draft.claims = [0, 1, 2].map(index => ({ id: `c${index}`, text: `A bounded observation ${index}.`, evidence_ids: [`obs-${index}`], counterevidence_ids: [] }));
  (draft.sections as JsonObject[])[0].claim_ids = ["c0", "c1", "c2"];
  review.evidence_coverage = [0, 1, 2].map(index => ({ evidence_ids: [`obs-${index}`], claim_ids: [`c${index}`], disposition: "represented", rationale: "Each observation has its own surfaced claim." }));
  review.synthesis_opportunity = { status: "no_material_opportunity", evidence_ids: [], claim_ids: [], rationale: "This fixture isolates reference support rather than assessing further synthesis." };
  review.explanatory_assessment.triggers = { status: "adequate", evidence_ids: ["obs-0", "obs-1"], claim_ids: ["c0"], rationale: "The cited source conditions are relevant, but the second is not carried by the listed claim." };
  const before = structuredClone(draft);
  assert.equal(validateSchema(review), true, JSON.stringify(validateSchema.errors));
  const issues = validatePwrp71ReviewQuality(review, draft, packet);
  assert.deepEqual(issues.map(({ code, path }) => ({ code, path })), [{ code: "review_explanation_support", path: "$.explanatory_assessment.triggers" }]);
  review.explanatory_assessment.triggers.claim_ids = ["c0", "c1"];
  assert.deepEqual(validatePwrp71ReviewQuality(review, draft, packet), []);
  assert.deepEqual(draft, before, "repairing review references does not retrofit draft evidence or assertions");
});

test("reviewer instructions preserve visible source meaning, authored effect referents, and positive reference support", async () => {
  const reviewer = await readFile("reporting/prompts/06_REVIEWER_PROMPT.md", "utf8");
  assert.match(reviewer, /full visible authored question and selected answer/u);
  assert.match(reviewer, /Distinguish an aim to change what happens next from explicit preventive effort/u);
  assert.match(reviewer, /each effect against its actual first-response or later-attempt referent/u);
  assert.match(reviewer, /each evidence_id is actually carried in evidence_ids or counterevidence_ids of at least one cited reader-surfaced claim/u);
  assert.match(reviewer, /do not add unsupported evidence or assertions to the draft/u);
});
