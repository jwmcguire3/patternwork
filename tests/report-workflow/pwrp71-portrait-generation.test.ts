import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { JsonObject, ReportType } from "../../lib/question-engine/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { OpenRouterGenerationRequest, OpenRouterTransport, OpenRouterUsage } from "../../lib/server/openrouter/types.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { generateCanonicalReport } from "../../lib/server/reports/generator.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import { sealFormulation } from "../../lib/server/reports/pwrp71-formulation-core.ts";

const usage: OpenRouterUsage = { generationId: "portrait-test", inputTokens: 1, outputTokens: 1, reasoningTokens: 0,
  totalTokens: 2, costMicros: 0, currency: "USD", model: "offline/mock" };
const canonical = (value: unknown): string => value === null || typeof value !== "object" ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(",")}]`
    : `{${Object.keys(value as Record<string, unknown>).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(",")}}`;
const sha = (value: unknown): string => createHash("sha256").update(canonical(value), "utf8").digest("hex");
type Row = Record<string, any>;
let generationOrdinal = 0;
let invocationOrdinal = 0;
const requestData = (request: OpenRouterGenerationRequest): Row => JSON.parse(request.prompt.slice(request.prompt.lastIndexOf("\n\n") + 2)) as Row;

async function fixture(reportType: ReportType = "IFS") {
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const question = questionSource.questionBank.items.find(item => item.id === "D65")!;
  const option = question.options[0]!;
  const observationId = `O${sha(["portrait-response", option.id]).slice(0, 20)}`;
  const occurrenceId = "portrait-occurrence";
  const observation = { id: observationId, response_id: "portrait-response", administration_id: "portrait-admin",
    item_id: question.id, option_id: option.id, variant: "base", text: option.text, displayed_text: option.text,
    reported_value: option.reported_value, capture: "self_stance", occurrence_id: occurrenceId, step_id: "first",
    basis: "actual_recalled", mode: "single", dependence_group: occurrenceId,
    selection_reason: "server-selected authored question", source_version: question.version, person_id: null,
    signals: option.candidate_signals ?? [] };
  const packet: Row = {
    format: "patternwork-router-evidence-v1", release_id: questionSource.manifest.source_binding.question_release,
    snapshot_id: "snapshot-1", packet_id: "packet-1", source_binding: { ...questionSource.manifest.source_binding },
    superseded_response_ids: [], invalidated_response_ids: [], assessment_scope: {
      recall_window: "Per-question respondent recall.", report_language: "en", phase: "deepening",
      interpretation_authority: "Retrospective self-report.", evidence_basis: "Respondent-selected authored options.", completion_reason: null,
      readiness: { mapping_coverage_complete: false, normal_mapping_ready: true, applicable_pending_items: [], offered_mapping_items: [],
        actual_occurrence_ids: [occurrenceId], sampled_contexts: ["work"], closed_coverage: {}, usable_actual_occurrences: 1,
        unresolved_bindings: 0, administrations: 1, mapping_administrations: 0, decisions: 1, controls: 0,
        interpretive_quota: null, report_readiness: "scoped_evidence_available" } },
    observations: [observation], episodes: [{ id: occurrenceId, family: "work", context: "work", root_item_id: "M01",
      basis: "actual_recalled", status: "actual_recalled", recall_window: "recent", person_id: null, role: null,
      topic: null, linked_from: null, distinct_from: [], outside_window: false }],
    steps: [{ id: "portrait-step", occurrence_id: occurrenceId, step_id: "first", observation_ids: [observationId] }],
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], supported_alternatives: [], counterexamples: [],
    secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [], referent_scopes: [],
    context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: [{ id: "portrait-admin", item_id: question.id, variant: "base", occurrence_id: occurrenceId,
      phase: "deepening", selection_reason: "server-selected authored question", option_order: [option.id], live_response_id: "portrait-response" }],
  };
  packet.content_sha256 = sha(packet);
  const layerDraft = (type: "IFS" | "PV" | "ATT"): JsonObject => ({
    report_release: reportSource.policy.release, release_id: packet.release_id, snapshot_id: packet.snapshot_id,
    evidence_sha256: packet.content_sha256, report_type: type, formulation_sha256: sha([type, observationId]),
    title: `${type} layer`, title_claim_ids: [], content_status: "complete",
    sections: [{ id: `${type}-section`, heading: "A response", text: "A response was noticed.", claim_ids: [`${type}-claim`] }],
    claims: [{ id: `${type}-claim`, text: "A response was noticed.", kind: "reported", constructs: [],
      scope: { level: "occurrence", occurrence_ids: [occurrenceId], person_ids: [], description: "One recalled moment." },
      evidence_ids: [observationId], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
      support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [] }],
    name_registry: [], relationships: [], reflection_questions: [] });
  const acceptedLayers = reportType === "SYNTHESIS" ? { IFS: layerDraft("IFS"), PV: layerDraft("PV"), ATT: layerDraft("ATT") } : undefined;
  const prepared = preparePwrp71Request({ packet: packet as JsonObject, reportType, questionSource, reportSource,
    ...(acceptedLayers ? { acceptedLayers } : {}) });
  if (!prepared.ok) throw new Error(JSON.stringify(prepared.issues));
  const form: Row = { report_release: reportSource.policy.release, release_id: packet.release_id, snapshot_id: packet.snapshot_id,
    evidence_sha256: packet.content_sha256, report_type: reportType, formulation_contract: "PWRP-FORMULATION-3",
    claims: [{ id: "C1", text: "The respondent noticed a reaction.", kind: "reported", constructs: [],
      scope: { level: "occurrence", occurrence_ids: [occurrenceId], person_ids: [], description: "One recalled moment." },
      evidence_ids: [observationId], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
      support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [] }],
    name_registry: [], relationships: [],
    units: [{ id: "U1", kind: "pattern", statement: "A reaction is noticed while responsibility remains active.",
      applicability: "When a demand is present.", claim_ids: ["C1"], entity_ids: [], importance: "core", delivery: "develop" },
    { id: "G1", kind: "context", statement: "Do not infer intent from reduced words.", applicability: "When words are harder to reach.",
      claim_ids: ["C1"], entity_ids: [], importance: "supporting", delivery: "guardrail" }],
    organizing_unit_ids: ["U1"], development_order: [{ purpose: "Develop the lived tension.", unit_ids: ["U1"], reframes_unit_ids: [] }],
    exile_assessments: [], alternatives: [], coverage: [{ observation_ids: [observationId], disposition: "central", reason: "The response grounds the meaning." }],
    layer_references: reportType === "SYNTHESIS" ? ["IFS", "PV", "ATT"].map(type => ({ report_type: type, claim_ids: [`${type}-claim`] })) : [],
    portraits: [] };
  const narrative = (): Row => ({ title: "A reaction under demand", title_unit_ids: ["U1"], formulation_requests: [],
    sections: [{ id: "S1", heading: "What remains active", paragraphs: [{ text: "A reaction can be noticed while responsibility remains active.", unit_ids: ["U1"] }] }] });
  return { questionSource, reportSource, packet: packet as JsonObject, request: prepared.value, form, narrative, acceptedLayers, observationId };
}

function editorialAssessment(draft: Row): Row {
  const dims = ["recognizable_opening", "distinctive_throughline", "human_names", "psychological_development", "emotional_specificity", "cumulative_structure", "plain_language", "nonrepetition", "grounded_possibility"];
  return Object.fromEntries(dims.map(d => [d, { status: d === "human_names" && !draft.name_registry?.length ? "not_applicable" : "pass",
    repair_owner: "none", anchors: draft.sections.map((s: Row) => ({ section_id: s.id, quote: s.text.slice(0, 30) })), rationale: "Deterministic contract fixture." }]));
}
function reviewer(value: Awaited<ReturnType<typeof fixture>>, draft: Row, data: Row, verdict: "accept" | "revise" = "accept", route: "narrative" | "formulation" = "narrative"): JsonObject {
  const review = structuralReviewFixture({ source: value.reportSource, packet: value.packet, draft: draft as JsonObject,
    verdict, issues: verdict === "revise" ? [{ id: "I1", category: "voice", claim_ids: [], section_ids: ["S1"], name_ids: [], relationship_ids: [], evidence_ids: [], reason: "Needs development.", requested_change: "Develop the supplied meaning." }] : [] }) as Row;
  review.reviewed_formulation_sha256 = data.reviewed_formulation_sha256;
  review.revision_target = verdict === "accept" ? "none" : route;
  review.narrative_tasks = verdict === "revise" && route === "narrative" ? [{ action: "develop_logic", section_ids: ["S1"], unit_ids: ["U1"] }] : [];
  review.editorial_assessment = editorialAssessment(draft);
  if (verdict === "revise") review.quality_assessment.narrative_quality = { status: "revise", rationale: "Needs development." };
  return review as JsonObject;
}
function transport(outputs: (request: OpenRouterGenerationRequest) => JsonObject, onRequest?: (request: OpenRouterGenerationRequest) => void): OpenRouterTransport {
  return { async generate(request) { onRequest?.(request); generationOrdinal += 1;
    return { ok: true, output: outputs(request), finishReason: "stop", usage: { ...usage, generationId: `portrait-${generationOrdinal}` } }; } };
}
function opts(value: Awaited<ReturnType<typeof fixture>>, provider: OpenRouterTransport, reportType: ReportType) {
  invocationOrdinal += 1;
  return { reportType, input: {}, packets: [value.packet], provider, invocationKey: `portrait-${reportType}-${invocationOrdinal}`,
    spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    privacyIdentityContext: REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT, contractVersion: "v7.1" as const,
    pwrp71: { request: value.request, packet: value.packet, source: value.reportSource, questionSource: value.questionSource,
      ...(value.acceptedLayers ? { acceptedLayers: value.acceptedLayers } : {}) } };
}

test("shared generator accepts the v2 formulation/narrative/review contracts for all five report types", async () => {
  for (const type of ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const) {
    const value = await fixture(type);
    const provider = transport(request => {
      const data = requestData(request);
      if (request.schemaName.endsWith("formulation_3")) return value.form as JsonObject;
      if (request.schemaName.endsWith("narrative_2")) return value.narrative() as JsonObject;
      return reviewer(value, data.draft, data) as JsonObject;
    });
    const result = await generateCanonicalReport(opts(value, provider, type));
    assert.equal(result.ok, true, result.ok ? undefined : `${type}: ${JSON.stringify(result.failure)}`);
  }
});

test("writer system and payload isolate analyst instructions and keep guardrails out of reportable units", async () => {
  const value = await fixture("IFS"); const seen: OpenRouterGenerationRequest[] = [];
  const result = await generateCanonicalReport(opts(value, transport(request => {
    seen.push(request); const data = requestData(request);
    if (request.schemaName.endsWith("formulation_3")) return value.form as JsonObject;
    if (request.schemaName.endsWith("narrative_2")) return value.narrative() as JsonObject;
    return reviewer(value, data.draft, data) as JsonObject;
  }, request => seen.push(request)), "IFS"));
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
  const writer = seen.find(request => request.schemaName.endsWith("narrative_2"))!;
  assert.equal(writer.system.includes(value.reportSource.prompts.shared), false);
  assert.equal(writer.system.includes(value.reportSource.prompts.ifs), false);
  assert.equal(writer.system.includes(value.reportSource.prompts.narrative), true);
  const promptPayload = JSON.stringify(requestData(writer));
  assert.match(promptPayload, /constraints/u);
  const payload = requestData(writer);
  assert.doesNotMatch(JSON.stringify(payload.writer_view?.units ?? []), /Do not infer intent/u);
  assert.doesNotMatch(JSON.stringify(payload), /exile_assessments|rationale|evidence_ids/u);
});

test("formulation expansion drops old prose, retries once, and stops if requested again", async () => {
  for (const repeat of [false, true]) {
    const value = await fixture("IFS"); const calls: OpenRouterGenerationRequest[] = []; let narratives = 0;
    const result = await generateCanonicalReport(opts(value, transport(request => {
      calls.push(request); const data = requestData(request);
      if (request.schemaName.endsWith("formulation_3")) return value.form as JsonObject;
      if (request.schemaName.endsWith("narrative_2")) { narratives++; const n = value.narrative();
        if (narratives === 1 || repeat) n.formulation_requests = [{ unit_ids: ["U1"], aspect: "missing_logic" }];
        return n as JsonObject; }
      return reviewer(value, data.draft, data) as JsonObject;
    }), "IFS"));
    const narrativesSeen = calls.filter(request => request.schemaName.endsWith("narrative_2"));
    assert.equal(narrativesSeen.length, 2);
    if (repeat) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.failure.code, "formulation_expansion_limit");
      assert.equal(calls.some(request => request.schemaName.endsWith("review_candidate_5")), false);
    }
    else {
      assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
      assert.equal("previous_narrative" in requestData(narrativesSeen[1]!), false);
    }
  }
});

test("review repair routes to narrative or formulation and uses the current contract schema names", async () => {
  for (const route of ["narrative", "formulation"] as const) {
    const value = await fixture("IFS"); const requests: OpenRouterGenerationRequest[] = []; let reviews = 0;
    const result = await generateCanonicalReport(opts(value, transport(request => {
      requests.push(request); const data = requestData(request);
      if (request.schemaName.endsWith("formulation_3")) return value.form as JsonObject;
      if (request.schemaName.endsWith("narrative_2")) return value.narrative() as JsonObject;
      reviews++; return reviewer(value, data.draft, data, reviews === 1 ? "revise" : "accept", route);
    }), "IFS"));
    assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
    assert.ok(requests.some(request => request.schemaName === "patternwork_ifs_pwrp71_formulation_3"));
    assert.ok(requests.some(request => request.schemaName === "patternwork_ifs_pwrp71_narrative_2"));
    assert.ok(requests.some(request => request.schemaName === "patternwork_ifs_pwrp71_review_candidate_5"));
    if (route === "formulation") {
      const narratives = requests.filter(request => request.schemaName.endsWith("narrative_2"));
      assert.equal(narratives.length, 2);
      assert.equal("previous_narrative" in requestData(narratives[1]!), false);
    }
  }
});

test("a saved formulation with stale analysis binding is rejected before provider dispatch", async () => {
  const value = await fixture("IFS"); let calls = 0;
  const binding = { ...value.request.binding, analysis_sha256: "f".repeat(64) } as any;
  const seed = sealFormulation(value.form, binding, value.reportSource.manifestSha256);
  const options = { ...opts(value, transport(() => { calls++; return {} as JsonObject; }), "IFS"), formulationSeed: seed } as any;
  const result = await generateCanonicalReport(options);
  assert.equal(result.ok, false); assert.equal(calls, 0);
});

test("a prepared request with source-drifted system text fails binding before provider dispatch", async () => {
  const value = await fixture("MAP"); let calls = 0;
  const stale = { ...value.request, system: `${value.request.system}\nchanged` };
  const result = await generateCanonicalReport({ ...opts(value, transport(() => { calls++; return {} as JsonObject; }), "MAP"),
    pwrp71: { request: stale, packet: value.packet, source: value.reportSource, questionSource: value.questionSource } });
  assert.equal(result.ok, false); assert.equal(calls, 0);
  if (!result.ok) assert.equal(result.failure.code, "pwrp71_generation_binding");
});
