import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterTransport, OpenRouterUsage, ProviderPrivacyIdentityContext } from "../../lib/server/openrouter/types.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { generateCanonicalReport, PWRP71_REPAIR_STRATEGY_VERSION } from "../../lib/server/reports/generator.ts";
import { constrainPwrp71ReferenceSchema } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { FileQualificationAttemptStore, JournaledPwrp71Transport } from "../../lib/server/reports/qualification/attempt-store.ts";
import { maximumQuotedCallCostMicros } from "../../lib/server/openrouter/qualification-budget.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value), "utf8").digest("hex");
}

const usage: OpenRouterUsage = {
  generationId: "pwrp71-test-generation", inputTokens: 1, outputTokens: 1, reasoningTokens: 0,
  totalTokens: 2, costMicros: 0, currency: "USD", model: "offline/mock",
};

async function fixture(reportType: "MAP" | "IFS" = "MAP") {
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const question = questionSource.questionBank.items.find((item) => item.id === "D65")!;
  const option = question.options[0];
  const responseId = "response-1";
  const occurrenceId = "occurrence-1";
  const observationId = `O${hash([responseId, option.id]).slice(0, 20)}`;
  const observation = {
    id: observationId, response_id: responseId, administration_id: "admin-1", item_id: question.id,
    option_id: option.id, variant: "base", text: option.text, displayed_text: option.text,
    reported_value: option.reported_value, capture: "self_stance", occurrence_id: occurrenceId,
    step_id: "first", basis: "actual_recalled", mode: "single", dependence_group: occurrenceId,
    selection_reason: "server-selected authored question", source_version: question.version,
    person_id: null, signals: option.candidate_signals ?? [],
  };
  const packet: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1", release_id: questionSource.manifest.source_binding.question_release,
    snapshot_id: "snapshot-1", packet_id: "packet-1", source_binding: { ...questionSource.manifest.source_binding },
    superseded_response_ids: [], invalidated_response_ids: [],
    assessment_scope: {
      recall_window: "Per-question respondent recall.", report_language: "en", phase: "deepening",
      interpretation_authority: "Retrospective self-report.", evidence_basis: "Respondent-selected authored options.", completion_reason: null,
      readiness: {
        mapping_coverage_complete: false, normal_mapping_ready: true, applicable_pending_items: [], offered_mapping_items: [],
        actual_occurrence_ids: [occurrenceId], sampled_contexts: ["work"], closed_coverage: {}, usable_actual_occurrences: 1,
        unresolved_bindings: 0, administrations: 1, mapping_administrations: 0, decisions: 1, controls: 0,
        interpretive_quota: null, report_readiness: "scoped_evidence_available",
      },
    },
    observations: [observation],
    episodes: [{ id: occurrenceId, family: "work", context: "work", root_item_id: "M01", basis: "actual_recalled", status: "actual_recalled", recall_window: "recent", person_id: null, role: null, topic: null, linked_from: null, distinct_from: [], outside_window: false }],
    steps: [{ id: "step-row-1", occurrence_id: occurrenceId, step_id: "first", observation_ids: [observationId] }],
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], supported_alternatives: [],
    counterexamples: [], secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [],
    referent_scopes: [], context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: [{ id: "admin-1", item_id: question.id, variant: "base", occurrence_id: occurrenceId, phase: "deepening", selection_reason: "server-selected authored question", option_order: [option.id], live_response_id: responseId }],
  };
  packet.content_sha256 = hash(packet);
  const prepared = preparePwrp71Request({ packet: packet as JsonObject, reportType, questionSource, reportSource });
  if (prepared.ok === false) throw new Error(JSON.stringify(prepared.issues));
  const draft: JsonObject = {
    report_release: reportSource.policy.release,
    release_id: String(packet.release_id),
    snapshot_id: String(packet.snapshot_id),
    evidence_sha256: String(packet.content_sha256),
    report_type: reportType,
    title: "A reported moment",
    title_claim_ids: [],
    content_status: "complete",
    sections: [{ id: "section-1", heading: "One moment", text: "The response was noticed.", claim_ids: ["claim-1"] }],
    claims: [{
      id: "claim-1", text: "The response was noticed.", kind: "reported", constructs: [],
      scope: { level: "occurrence", occurrence_ids: [occurrenceId], person_ids: [], description: "One recalled moment." },
      evidence_ids: [observationId], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
      support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
    }],
    name_registry: [], relationships: [], reflection_questions: [],
  };
  return { questionSource, reportSource, packet: packet as JsonObject, request: prepared.value, draft };
}

function mockProvider(outputs: readonly { readonly output: JsonObject; readonly finishReason?: string }[], onCall?: (request: OpenRouterGenerationRequest, identityContext?: ProviderPrivacyIdentityContext) => void): OpenRouterTransport {
  let index = 0;
  return {
    async generate(request, identityContext) {
      onCall?.(request, identityContext);
      const next = outputs[index++];
      if (!next) throw new Error("Unexpected provider call.");
      return { ok: true, output: next.output, usage, ...(next.finishReason === undefined ? {} : { finishReason: next.finishReason }) };
    },
  };
}

function reviewerOutput(draft: JsonObject, packet: JsonObject, source: Awaited<ReturnType<typeof loadPwrp71SourcePackage>>, verdict: "accept" | "revise", issues: JsonObject[] = []): JsonObject {
  return structuralReviewFixture({draft,packet,source,verdict,issues});
}

function reviseIssue(): JsonObject {
  return {
    id: "review-issue-1", category: "voice", claim_ids: ["claim-1"], section_ids: ["section-1"],
    name_ids: [], relationship_ids: [], evidence_ids: [], reason: "The wording overstates certainty.",
    requested_change: "Keep the reported scope explicit.",
  };
}

test("PWRP 7.1 uses the prepared prompt/schema and validates a complete stop response", async () => {
  const value = await fixture();
  const requests: OpenRouterGenerationRequest[] = [];
  const localIdentityContext: ProviderPrivacyIdentityContext = { identityInventoryReviewed: true, accountIds: ["local-account-123"], emails: ["local@example.test"] };
  const observedIdentityContexts: Array<ProviderPrivacyIdentityContext | undefined> = [];
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider([
      { output: value.draft, finishReason: "stop" },
      { output: reviewerOutput(value.draft, value.packet, value.reportSource, "accept"), finishReason: "stop" },
    ], (request, identityContext) => { requests.push(request); observedIdentityContexts.push(identityContext); }),
    invocationKey: "pwrp71-stop", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", privacyIdentityContext: localIdentityContext,
    workspaceRoot: path.join(process.cwd(), ".codex-temp", "not-a-question-source-root"),
    pwrp71: { request: value.request, packet: value.packet, source: value.reportSource, questionSource: value.questionSource },
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
  if (!result.ok) return;
  assert.equal(result.value.artifact.artifact_type, "pwrp71_report");
  assert.equal(requests.length, 2);
  assert.deepEqual(observedIdentityContexts, [localIdentityContext, localIdentityContext]);
  assert.equal(JSON.stringify(requests).includes("local-account-123"), false);
  assert.equal(JSON.stringify(requests).includes("local@example.test"), false);
  assert.equal(requests[0].system, value.request.system);
  assert.ok(requests.every(request => request.system.includes(value.reportSource.constructGuide)), "the active construct guide must reach writer and reviewer");
  assert.equal(requests[1].schemaName, "patternwork_map_pwrp71_review_candidate_3");
  assert.ok((requests[1].schema.required as string[]).includes("explanatory_assessment"));
  assert.ok((requests[1].schema.required as string[]).includes("synthesis_opportunity"));
  assert.deepEqual(requests[0].schema, constrainPwrp71ReferenceSchema(value.request.response_schema, value.packet));
  assert.equal(requests[0].schemaName, "patternwork_map_pwrp71_candidate_1");
  assert.match(requests[0].prompt, /PWRP-7\.1\.0-candidate\.1/u);
  for (const request of requests) {
    assert.match(request.prompt, /authored_question_context/u);
    assert.match(request.prompt, /pwrp71-authored-question-context-v5/u);
    assert.match(request.prompt, /visible authored question and selected option text govern/u);
    const question = value.questionSource.questionBank.items.find((item) => item.id === "D65")!;
    assert.ok(request.prompt.includes(JSON.stringify(question.prompt)), "Writer and reviewer receive the full authored question wording.");
  }
  assert.ok(requests[1].system.includes(value.reportSource.prompts.reviewer));
  assert.deepEqual(requests[1].schema, value.reportSource.schemas.reportReview);
  assert.equal(requests[1].schemaName, "patternwork_map_pwrp71_review_candidate_3");
});

test("PWRP 7.1 fails closed on a length finish reason without attempting repair", async () => {
  const value = await fixture();
  let calls = 0;
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider([{ output: value.draft, finishReason: "length" }], () => { calls += 1; }),
    invocationKey: "pwrp71-length", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "incomplete_generation");
  assert.equal(calls, 1);
});

test("PWRP 7.1 rejects unresolved authored question context before transport", async () => {
  const value = await fixture();
  let calls = 0;
  const invalidSource = { ...value.questionSource, sourceManifestSha256: "0".repeat(64) } as typeof value.questionSource;
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet],
    provider: mockProvider([], () => { calls += 1; }),
    invocationKey: "pwrp71-bad-question-context", spentMicros: 0, costCapMicros: 1_000_000,
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, contractVersion: "v7.1",
    pwrp71: { request: value.request, packet: value.packet, source: value.reportSource, questionSource: invalidSource },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "pwrp71_question_context_binding");
  assert.equal(calls, 0);
});

test("PWRP 7.1 repair uses its authored repair contract and keeps the prepared source view", async () => {
  const value = await fixture();
  const requests: OpenRouterGenerationRequest[] = [];
  let calls = 0;
  const provider: OpenRouterTransport = {
    async generate(request) {
      requests.push(request);
      calls += 1;
      const outputs = [
        {},
        value.draft,
        reviewerOutput(value.draft, value.packet, value.reportSource, "accept"),
      ];
      return { ok: true, output: outputs[calls - 1], usage, finishReason: "stop" };
    },
  };
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider,
    invocationKey: "pwrp71-repair", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.prompt.includes("pwrp71-authored-question-context-v5") && request.prompt.includes("Keep each outcome with its own response and stage")), "initial generation, structural repair, and reviewer receive the same source-reading rules");
  assert.equal(requests[0].system, value.request.system);
  assert.equal(requests[1].system, `${value.request.system}\n\n${value.reportSource.prompts.repair}`);
  assert.match(requests[1].prompt, /validator_feedback/u);
  assert.match(requests[1].prompt, /PWRP-7\.1\.0-candidate\.1/u);
  assert.ok(requests[2].system.includes(value.reportSource.prompts.reviewer));
});

test("PWRP 7.1 reviewer revise gets one repair and a fresh review bound to the replacement", async () => {
  const value = await fixture();
  const replacement = structuredClone(value.draft) as Record<string, unknown>;
  (replacement.sections as Record<string, unknown>[])[0].text = "The respondent reported noticing a reaction.";
  const revisedDraft = replacement as JsonObject;
  const outputs = [
    { output: value.draft, finishReason: "stop" },
    { output: reviewerOutput(value.draft, value.packet, value.reportSource, "revise", [reviseIssue()]), finishReason: "stop" },
    { output: revisedDraft, finishReason: "stop" },
    { output: reviewerOutput(revisedDraft, value.packet, value.reportSource, "accept"), finishReason: "stop" },
  ];
  const requests: OpenRouterGenerationRequest[] = [];
  const validations: { readonly attemptId: string; readonly ok: boolean }[] = [];
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider(outputs, (request) => { requests.push(request); }),
    invocationKey: "pwrp71-revise-fresh-review", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
    onPwrp71Event: (event) => { if (event.type === "draft_validation") validations.push({ attemptId: event.attemptId, ok: event.ok }); },
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
  if (!result.ok) return;
  const acceptedDraft = (result.value.artifact as Record<string, unknown>).draft as Record<string, unknown>;
  assert.equal(((acceptedDraft.sections as Record<string, unknown>[])[0]).text, ((revisedDraft.sections as Record<string, unknown>[])[0]).text);
  assert.equal(requests.length, 4);
  assert.ok(requests.every(request => request.prompt.includes("pwrp71-authored-question-context-v5") && request.prompt.includes("visible authored question and selected option text govern")), "semantic repair and its fresh review retain the current source-reading rules");
  assert.equal(validations.length, 2, "both initial and reviewer-requested replacement drafts retain their validation receipts");
  assert.deepEqual(validations.map((entry) => [entry.attemptId.split(":").at(-3), entry.ok]), [["initial", true], ["repair", true]]);
  assert.equal(requests[2].system, `${value.request.system}\n\n${value.reportSource.prompts.repair}`);
  assert.ok(requests[3].system.includes(value.reportSource.prompts.reviewer));
  assert.deepEqual(requests[3].schema, value.reportSource.schemas.reportReview);
});

test("PWRP 7.1 rejects a stale review after the draft has been repaired", async () => {
  const value = await fixture();
  const replacement = structuredClone(value.draft) as Record<string, unknown>;
  (replacement.sections as Record<string, unknown>[])[0].text = "Replacement wording bound to a new draft hash.";
  const revisedDraft = replacement as JsonObject;
  const outputs = [
    { output: value.draft, finishReason: "stop" },
    { output: reviewerOutput(value.draft, value.packet, value.reportSource, "revise", [reviseIssue()]), finishReason: "stop" },
    { output: revisedDraft, finishReason: "stop" },
    { output: reviewerOutput(value.draft, value.packet, value.reportSource, "accept"), finishReason: "stop" },
  ];
  let calls = 0;
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider(outputs, () => { calls += 1; }),
    invocationKey: "pwrp71-stale-review", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "review_validation_failed");
    assert.ok(result.failure.issues.some((entry) => entry.code === "review_binding"));
  }
  assert.equal(calls, 4);
});

test("IFS continuation supplies actionable feedback and current references to repair and fresh review", async () => {
  const value = await fixture("IFS");
  const previousDraft = structuredClone(value.draft);
  previousDraft.name_registry = [{ name_id: "N1", name: "Signal checker", entity_kind: "descriptive_pattern", role: "descriptive_pattern", author_generated: true, supporting_claim_ids: ["claim-1"] }];
  const issue = { ...reviseIssue(), name_ids: ["N1"], requested_change: "Introduce the retained Signal checker label in the bounded narrative." };
  const priorReview = reviewerOutput(previousDraft, value.packet, value.reportSource, "revise", [issue]);
  const replacement = structuredClone(previousDraft);
  (replacement.sections as JsonObject[])[0].text = "Signal checker: the response was noticed within one recalled moment.";
  const requests: OpenRouterGenerationRequest[] = [];
  const result = await generateCanonicalReport({
    reportType: "IFS", input: {}, packets: [value.packet], provider: mockProvider([
      { output: replacement, finishReason: "stop" },
      { output: reviewerOutput(replacement, value.packet, value.reportSource, "accept"), finishReason: "stop" },
    ], request => { requests.push(request); }),
    invocationKey: "ifs-current-feedback", spentMicros: 0, costCapMicros: 500_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
    continuation: { previousDraft, previousReview: priorReview, sourceRunBindingSha256: "a".repeat(64), sourceDraftSha256: hash(previousDraft), sourceReviewSha256: hash(priorReview), sourceDraftAttemptId: "source-draft", sourceReviewAttemptId: "source-review" },
  });
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.failure));
  assert.equal(requests.length, 2, "one repair and a separate fresh review are required");
  assert.ok(requests[0].prompt.includes(PWRP71_REPAIR_STRATEGY_VERSION));
  assert.match(requests[0].prompt, /across_sampled_contexts/u);
  assert.match(requests[0].prompt, /Build the claim support for that grouping first/u);
  assert.match(requests[0].prompt, /may organize a bounded account of available choice/u);
  assert.ok(!requests[0].prompt.includes("without giving it common causal or organizing force"));
  assert.match(requests[0].system, /Compare the before and after meanings/u);
  assert.match(requests[0].prompt, /Split that premise or remove the inappropriate dependency/u);
  const constrained = requests[0].schema as {
    properties: { claims: { items: { properties: {
      evidence_ids: { items: { enum: string[] } };
      scope: { properties: { person_ids: { maxItems: number } } };
    } } } };
  };
  assert.deepEqual(constrained.properties.claims.items.properties.evidence_ids.items.enum, (value.packet.observations as JsonObject[]).map(row=>row.id));
  assert.equal(constrained.properties.claims.items.properties.scope.properties.person_ids.maxItems,0);
  const repairPayloads = requests[0].prompt.split("\n\n").filter(part => part.startsWith("{")).map(part => JSON.parse(part));
  const feedback = repairPayloads.find(payload => Array.isArray(payload.validator_feedback));
  assert.equal(feedback.validator_feedback.length, 1);
  assert.equal(feedback.validator_feedback[0].code, "voice");
  assert.ok(feedback.validator_feedback[0].message.includes(String(issue.requested_change)));
  assert.deepEqual(feedback.semantic_review, priorReview, "the saved review is supplied unchanged");
  assert.deepEqual(feedback.current_draft_references.claims[0].evidence_ids, (previousDraft.claims as JsonObject[])[0].evidence_ids);
  assert.deepEqual(feedback.current_draft_references.named_entities[0].section_ids_with_literal_label, []);
  const freshInput = JSON.parse(requests[1].prompt.split("\n\n").at(-1)!);
  assert.equal(freshInput.reviewed_draft_sha256, hash(replacement));
  assert.deepEqual(freshInput.current_draft_references.named_entities[0].section_ids_with_literal_label, ["section-1"]);
  assert.equal(freshInput.current_observation_count, 1);
});

test("IFS continuation refuses a mismatched review seed before transport", async () => {
  const value = await fixture("IFS");
  const priorReview = reviewerOutput(value.draft, value.packet, value.reportSource, "revise", [reviseIssue()]);
  let calls = 0;
  const result = await generateCanonicalReport({
    reportType: "IFS", input: {}, packets: [value.packet], provider: mockProvider([], () => { calls += 1; }),
    invocationKey: "ifs-stale-seed", spentMicros: 0, costCapMicros: 500_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
    continuation: { previousDraft: value.draft, previousReview: priorReview, sourceRunBindingSha256: "a".repeat(64), sourceDraftSha256: hash(value.draft), sourceReviewSha256: "b".repeat(64), sourceDraftAttemptId: "source-draft", sourceReviewAttemptId: "source-review" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "continuation_review_binding");
  assert.equal(calls, 0);
});

test("a non-voice continuation requests a local repair while preserving adequate narrative", async () => {
  const value=await fixture("IFS");
  const priorReview=reviewerOutput(value.draft,value.packet,value.reportSource,"revise",[{...reviseIssue(),category:"overreach",requested_change:"Narrow the reviewed assertion."}]);
  const requests:OpenRouterGenerationRequest[]=[];
  const result=await generateCanonicalReport({reportType:"IFS",input:{},packets:[value.packet],contractVersion:"v7.1",pwrp71:{request:value.request,packet:value.packet,source:value.reportSource},modelPolicy:UNQUALIFIED_MOCK_MODEL_POLICY,invocationKey:"local-repair",spentMicros:0,costCapMicros:450000,continuation:{previousDraft:value.draft,previousReview:priorReview,sourceRunBindingSha256:"a".repeat(64),sourceDraftSha256:hash(value.draft),sourceReviewSha256:hash(priorReview),sourceDraftAttemptId:"source-draft",sourceReviewAttemptId:"source-review"},provider:mockProvider([{output:value.draft,finishReason:"stop"},{output:reviewerOutput(value.draft,value.packet,value.reportSource,"accept"),finishReason:"stop"}],request=>{requests.push(request);})});
  assert.equal(result.ok,true,result.ok?undefined:JSON.stringify(result.failure));
  assert.match(requests[0].prompt,/LOCAL REPAIR:/u);
  assert.ok(!requests[0].prompt.includes("PARAGRAPH CONSTRUCTION PLAN"));
  assert.equal(requests.length,2);
});

test("continuation gets at most one structural correction before a fresh review", async () => {
  const value = await fixture("IFS");
  const review = reviewerOutput(value.draft,value.packet,value.reportSource,"revise",[reviseIssue()]);
  const continuation = {previousDraft:value.draft,previousReview:review,sourceRunBindingSha256:"a".repeat(64),sourceDraftSha256:hash(value.draft),sourceReviewSha256:hash(review),sourceDraftAttemptId:"saved-draft",sourceReviewAttemptId:"saved-review"};
  const invalid = {...value.draft, report_type:"MAP"} as JsonObject;
  for(const succeeds of [true,false]) {
    const requests:OpenRouterGenerationRequest[]=[];
    const events:unknown[]=[];
    const generated=await generateCanonicalReport({reportType:"IFS",input:{},packets:[value.packet],contractVersion:"v7.1",pwrp71:{request:value.request,packet:value.packet,source:value.reportSource},modelPolicy:UNQUALIFIED_MOCK_MODEL_POLICY,invocationKey:`bounded-structure-${succeeds}`,spentMicros:0,costCapMicros:450000,continuation,continuationStructuralRepair:true,onPwrp71Event:event=>{events.push(event);},provider:mockProvider([{output:invalid,finishReason:"stop"},{output:succeeds?value.draft:invalid,finishReason:"stop"},...(succeeds?[{output:reviewerOutput(value.draft,value.packet,value.reportSource,"accept"),finishReason:"stop"}]:[])],request=>{requests.push(request);})});
    assert.equal(generated.ok,succeeds);
    assert.equal(requests.length,succeeds?3:2);
    assert.match(requests[1].prompt,/BOUNDED STRUCTURAL CORRECTION/u);
    assert.match(requests[1].prompt,/reference_inventory/u);
    assert.match(requests[1].prompt,/Remove parenthetical internal claim/u);
    assert.equal(events.filter(event=>(event as {type:string}).type==="repair_decision").length,1);
    if(succeeds)assert.match(requests[2].idempotencyKey,/:review_after_repair:.*:attempt-3$/u);
    else assert.ok(requests.every(request=>!request.schemaName.includes("_review_")));
  }
});

test("citation derivation makes exactly one fresh review and withholds non-accepts", async () => {
  const value = await fixture("IFS");
  const raw = structuredClone(value.draft);
  const leaf = (raw.claims as JsonObject[])[0];
  leaf.counterevidence_ids = [...leaf.evidence_ids as string[]];
  const derived = structuredClone(leaf);
  derived.id = "derived";
  derived.depends_on_claim_ids = [String(leaf.id)];
  derived.counterevidence_ids = [];
  (raw.claims as JsonObject[]).push(derived);
  (raw.sections as JsonObject[])[0].claim_ids = [String(leaf.id), "derived"];
  const closed = derivePwrp71Citations({ value: raw, reportType: "IFS", snapshotId: "snapshot-1", packet: value.packet, source: value.reportSource });
  const seed = { rawDraft: raw, sourceRunBindingSha256: "a".repeat(64), sourceDraftAttemptId: "saved-writer", derivation: closed.derivation };
  for (const verdict of ["accept", "revise"] as const) {
    let calls = 0;
    const result = await generateCanonicalReport({
      reportType: "IFS", input: {}, packets: [value.packet], contractVersion: "v7.1",
      pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
      modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, invocationKey: `closure-${verdict}`, spentMicros: 0, costCapMicros: 150_000, citationClosure: seed,
      provider: mockProvider([{ output: reviewerOutput(closed.artifact.draft, value.packet, value.reportSource, verdict, verdict === "revise" ? [reviseIssue()] : []), finishReason: "stop" }], request => {
        calls++;
        assert.match(request.schemaName, /_review_/u);
        assert.match(request.prompt, /citation_derivation/u);
        assert.match(request.system, /not semantic support/u);
      }),
    });
    assert.equal(calls, 1);
    assert.equal(result.ok, verdict === "accept");
    if (result.ok) assert.deepEqual((result.value.artifact as { draft: JsonObject }).draft, closed.artifact.draft);
  }
  let calls = 0;
  const changed = { ...seed, derivation: { ...seed.derivation, normalized_draft_sha256: "f".repeat(64) } };
  const refused = await generateCanonicalReport({ reportType: "IFS", input: {}, packets: [value.packet], contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: value.reportSource }, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, invocationKey: "tampered-closure", spentMicros: 0, costCapMicros: 150_000, citationClosure: changed, provider: mockProvider([], () => { calls++; }) });
  assert.equal(refused.ok, false);
  assert.equal(calls, 0);
});

test("prior citation restoration requires one unique character loss in an unchanged prior assertion", async () => {
  const value = await fixture("IFS");
  const prior = structuredClone(value.draft);
  const claim = (prior.claims as JsonObject[])[0];
  claim.counterevidence_ids = [...claim.evidence_ids as string[]];
  const raw = structuredClone(prior), rawClaim = (raw.claims as JsonObject[])[0];
  const correct = (claim.evidence_ids as string[])[0];
  rawClaim.evidence_ids = [correct.slice(0, 5) + correct.slice(6)];
  const input = { value: raw, previousDraft: prior, reportType: "IFS" as const, snapshotId: "snapshot-1", packet: value.packet, source: value.reportSource };
  const saved = structuredClone(raw), restored = derivePwrp71Citations(input);
  assert.deepEqual(raw, saved);
  assert.deepEqual(restored.artifact.draft, prior);
  assert.equal(restored.derivation.normalization_version, "pwrp71-prior-citation-restoration-v1");
  assert.deepEqual(derivePwrp71Citations(input), restored);
  rawClaim.text = "Changed assertion.";
  assert.throws(() => derivePwrp71Citations(input));
  rawClaim.text = claim.text;
  rawClaim.evidence_ids = ["unresolvable"];
  assert.throws(() => derivePwrp71Citations(input));
});

test("PWRP 7.1 rejects mismatched source or packet bindings before provider call", async () => {
  const value = await fixture();
  let calls = 0;
  const badRequest = {
    ...value.request,
    binding: { ...value.request.binding, evidence_sha256: "f".repeat(64) },
  };
  const result = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider([{ output: value.draft, finishReason: "stop" }], () => { calls += 1; }),
    invocationKey: "pwrp71-bad-binding", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: badRequest, packet: value.packet, source: value.reportSource },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.failure.code, "pwrp71_generation_binding");
  assert.equal(calls, 0);

  const forgedSource = { ...value.reportSource, manifestSha256: "0".repeat(64) } as unknown as Pwrp71SourcePackage;
  const badSource = await generateCanonicalReport({
    reportType: "MAP", input: {}, packets: [value.packet], provider: mockProvider([{ output: value.draft, finishReason: "stop" }], () => { calls += 1; }),
    invocationKey: "pwrp71-bad-source", spentMicros: 0, costCapMicros: 1_000_000, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1", pwrp71: { request: value.request, packet: value.packet, source: forgedSource },
  });
  assert.equal(badSource.ok, false);
  if (!badSource.ok) assert.equal(badSource.failure.code, "pwrp71_generation_binding");
  assert.equal(calls, 0);
});

test("journal budget preflights initial, reviewer, and repair calls and blocks the unaffordable post-repair review", async () => {
  const value = await fixture();
  const replacementRecord = structuredClone(value.draft) as Record<string, unknown>;
  (replacementRecord.sections as Record<string, unknown>[])[0].text = "The respondent described a bounded reaction.";
  const replacement = replacementRecord as JsonObject;
  const quote = maximumQuotedCallCostMicros({
    model: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.model,
    reasoningEffort: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.reasoningEffort,
    system: value.request.system,
    prompt: "budget bound sample",
    schemaName: "budget_test",
    schema: value.request.response_schema,
    maxOutputTokens: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.maxOutputTokens,
    idempotencyKey: "budget-bound-sample",
  });
  const chargedUsage: OpenRouterUsage = {
    ...usage,
    model: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.model,
    costMicros: quote,
  };
  const responses = [
    value.draft,
    reviewerOutput(value.draft, value.packet, value.reportSource, "revise", [reviseIssue()]),
    replacement,
    reviewerOutput(replacement, value.packet, value.reportSource, "accept"),
  ];
  let dispatched = 0;
  const transport: OpenRouterTransport = {
    async generate() {
      const output = responses[dispatched++];
      if (!output) throw new Error("Unexpected mock dispatch.");
      return { ok: true, output, usage: chargedUsage, finishReason: "stop" };
    },
  };
  const scratch = path.join(process.cwd(), ".codex-temp", "test-runs");
  await mkdir(scratch, { recursive: true });
  const runDirectory = await mkdtemp(path.join(scratch, "pwrp71-budget-generator-"));
  try {
    const store = new FileQualificationAttemptStore(runDirectory);
    const journal = new JournaledPwrp71Transport({
      store,
      transport,
      maxCallCostMicros: quote,
      aggregateCostCapMicros: quote * 3,
      usageStatus: "reported",
      privacyIdentityContext: REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT,
    });
    const generated = await generateCanonicalReport({
      reportType: "MAP", input: {}, packets: [value.packet], provider: journal,
      invocationKey: "pwrp71-budgeted-full-loop", spentMicros: 0, costCapMicros: quote * 3,
      modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, contractVersion: "v7.1",
      pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
    });
    assert.equal(generated.ok, false);
    if (!generated.ok) assert.equal(generated.failure.code, "cost_cap_exceeded");
    assert.equal(dispatched, 3, "initial, first review, and repair fit; the fresh post-repair review has zero dispatches");
    const records = await store.list();
    assert.equal(records.length, 3);
    assert.deepEqual(records.map((record) => record.status), ["completed", "completed", "completed"]);
    assert.deepEqual(records.map((record) => record.attemptId.split(":").slice(-3, -2)[0]), ["initial", "review", "repair"]);
    assert.equal(new Set(records.map((record) => record.wirePayloadSha256)).size, 3, "initial, reviewer, and repair wire requests have distinct exact-body fingerprints");
    assert.equal(new Set(records.map((record) => record.request.systemSha256)).size, 3, "writer, reviewer, and repair instructions are separately pinned");
    assert.equal(records.reduce((sum, record) => sum + (record.usage?.costMicros ?? 0), 0), quote * 3);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});

test("a failed draft cannot use escalation after earlier attempts consume the aggregate allowance", async () => {
  const value = await fixture();
  const quote = maximumQuotedCallCostMicros({
    model: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.model,
    reasoningEffort: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.reasoningEffort,
    system: value.request.system,
    prompt: "budget bound sample",
    schemaName: "budget_test",
    schema: value.request.response_schema,
    maxOutputTokens: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.maxOutputTokens,
    idempotencyKey: "budget-bound-escalation",
  });
  const chargedUsage: OpenRouterUsage = { ...usage, model: UNQUALIFIED_MOCK_MODEL_POLICY.MAP.model, costMicros: quote };
  let dispatched = 0;
  const transport: OpenRouterTransport = {
    async generate() {
      dispatched += 1;
      return { ok: true, output: {} as JsonObject, usage: chargedUsage, finishReason: "stop" };
    },
  };
  const scratch = path.join(process.cwd(), ".codex-temp", "test-runs");
  await mkdir(scratch, { recursive: true });
  const runDirectory = await mkdtemp(path.join(scratch, "pwrp71-budget-escalation-"));
  try {
    const store = new FileQualificationAttemptStore(runDirectory);
    const provider = new JournaledPwrp71Transport({ store, transport, maxCallCostMicros: quote, aggregateCostCapMicros: quote * 2, usageStatus: "reported", privacyIdentityContext: REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT });
    const generated = await generateCanonicalReport({
      reportType: "MAP", input: {}, packets: [value.packet], provider,
      invocationKey: "pwrp71-budgeted-escalation", spentMicros: 0, costCapMicros: quote * 2,
      modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, contractVersion: "v7.1",
      pwrp71: { request: value.request, packet: value.packet, source: value.reportSource },
    });
    assert.equal(generated.ok, false);
    if (!generated.ok) assert.equal(generated.failure.code, "cost_cap_exceeded");
    assert.equal(dispatched, 2, "initial and repair calls consume the aggregate cap; escalation is rejected before dispatch");
    const records = await store.list();
    assert.equal(records.length, 2);
    assert.ok(records.every((record) => record.status === "completed"));
    assert.equal(records.some((record) => record.attemptId.includes(":escalation:")), false);
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
});
