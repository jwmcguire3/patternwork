import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { setReportWorkflowDependenciesForTests } from "../../lib/server/reports/dependencies.ts";
import { createProductionPwrp71Provider } from "../../lib/server/reports/provider-factory.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import { REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT } from "../../lib/server/openrouter/privacy-boundary.ts";
import { TEST_PROVIDER_KEYRING, TestProviderLedgerDatabase, fakeOpenRouterResponse } from "./helpers/provider-ledger-database.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { renderPwrp71Markdown } from "../../lib/server/reports/pwrp71-render.ts";
import { structuralReviewFixture } from "../../lib/server/reports/qualification/review-fixture.ts";
import type { DecryptedAssessmentSnapshot, PreparedReportInputs, ReportWorkflowDependencies } from "../../lib/server/reports/types.ts";

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const row = value as Record<string, unknown>;
  return `{${Object.keys(row).sort().map((key) => `${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(typeof value === "string" ? value : canonical(value), "utf8").digest("hex");
}

async function fixture() {
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const question = questionSource.questionBank.items.find((item) => item.id === "D65")!;
  const option = question.options[0]!;
  const responseId = "response-customer-test";
  const occurrenceId = "occurrence-customer-test";
  const observationId = `O${hash([responseId, option.id]).slice(0, 20)}`;
  const packet: Record<string, unknown> = {
    format: "patternwork-router-evidence-v1",
    release_id: questionSource.manifest.source_binding.question_release,
    snapshot_id: "snapshot-c",
    packet_id: "packet-customer-test",
    source_binding: { ...questionSource.manifest.source_binding },
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
    observations: [{
      id: observationId, response_id: responseId, administration_id: "admin-customer-test", item_id: question.id,
      option_id: option.id, variant: "base", text: option.text, displayed_text: option.text,
      reported_value: option.reported_value, capture: "self_stance", occurrence_id: occurrenceId,
      step_id: "first", basis: "actual_recalled", mode: "single", dependence_group: occurrenceId,
      selection_reason: "server-selected authored question", source_version: question.version,
      person_id: null, signals: option.candidate_signals ?? [],
    }],
    episodes: [{ id: occurrenceId, family: "work", context: "work", root_item_id: "M01", basis: "actual_recalled", status: "actual_recalled", recall_window: "recent", person_id: null, role: null, topic: null, linked_from: null, distinct_from: [], outside_window: false }],
    steps: [{ id: "step-row-customer-test", occurrence_id: occurrenceId, step_id: "first", observation_ids: [observationId] }],
    sequence_edges: [], target_resolutions: [], structural_evidence_summaries: [], supported_alternatives: [],
    counterexamples: [], secure_capacity_examples: [], missingness: [], corrections: [], unresolved_bindings: [],
    referent_scopes: [], context_comparisons: [], reported_context_controls: [], interpretation_disputes: [], open_questions: [],
    administration_provenance: [{ id: "admin-customer-test", item_id: question.id, variant: "base", occurrence_id: occurrenceId, phase: "deepening", selection_reason: "server-selected authored question", option_order: [option.id], live_response_id: responseId }],
  };
  packet.content_sha256 = hash(packet);
  const snapshotId = String(packet.snapshot_id);
  const canonicalSnapshot = {
    snapshot_id: snapshotId,
    contract_id: questionSource.manifest.source_binding.question_release,
    integrity_contract_id: "patternwork-router-evidence-v1",
    packet_version: "urn:patternwork:router-evidence:1",
    source_manifest_sha256: questionSource.sourceManifestSha256,
    router_packet: packet,
  } as unknown as JsonObject;
  const snapshot: DecryptedAssessmentSnapshot = {
    databaseId: "snapshot-db-customer-test", assessmentSessionId: "session-customer-test", snapshotId,
    snapshotRevision: "3", completedPass: 2,
    evidenceSha256: hash(String(packet.content_sha256)),
    scopeSha256: hash((packet.assessment_scope)),
    canonicalSnapshot,
  };
  const prepared = {
    contractVersion: "v7.1", snapshot: {
      databaseId: snapshot.databaseId, assessmentSessionId: snapshot.assessmentSessionId,
      snapshotId: snapshot.snapshotId, snapshotRevision: snapshot.snapshotRevision,
      completedPass: snapshot.completedPass, evidenceSha256: snapshot.evidenceSha256, scopeSha256: snapshot.scopeSha256,
    }, packets: [], routerPacket: packet as JsonObject,
    sourceManifestSha256: questionSource.sourceManifestSha256,
    reportSourceManifestSha256: reportSource.manifestSha256,
    qualificationManifestSha256: "e".repeat(64),
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
  } as unknown as PreparedReportInputs;
  return { questionSource, reportSource, packet: packet as JsonObject, snapshot, prepared };
}

test("PWRP 7.1 customer workflow generates the complete pass, verifies PDFs, releases atomically, and replays idempotently", async (t) => {
  if (typeof t.mock.module !== "function") {
    t.skip("Run Node with --experimental-test-module-mocks to exercise the workflow with a mocked activation-preparation step.");
    return;
  }
  const value = await fixture();
  const stepModule = await import("../../lib/server/reports/steps.ts");
  const stepPath = pathToFileURL(path.resolve(process.cwd(), "lib/server/reports/steps.ts")).href;
  t.mock.module(stepPath, {
    namedExports: {
      ...stepModule,
      // External activation and lifecycle persistence are local seams; generation uses the real guarded client.
      heartbeatReportAttemptStep: async () => undefined,
      persistUnexpectedReportFailureStep: async () => undefined,
      dispatchReportFailureNotificationStep: async () => undefined,
      prepareReportInputsStep: async () => value.prepared,
    },
    cache: true,
  });
  const { layerInput, passReportWorkflow } = await import("../../workflows/pass-report.ts");

  const outputDrafts = new Map<string, JsonObject>();
  const generationRequests: string[] = [];
  let pdfVerificationCalls = 0;
  const releasedTypes: string[] = [];
  let releaseFailure = false;
  let alreadyReleased = false;
  let deliveryCalls = 0;
  let persistFailureCalls = 0;

  const workflowInput = {assessmentSessionId:value.snapshot.assessmentSessionId,snapshotId:value.snapshot.snapshotId,completedPass:2 as const,attemptId:"customer-workflow-owner",attemptNumber:1,invocationKey:"pwrp71-customer-test"};
  const database=new TestProviderLedgerDatabase({input:workflowInput,prepared:value.prepared});
  const fakeHttp: NonNullable<ConstructorParameters<typeof OpenRouterClient>[0]>["fetch"] = async (_url,init) => {
      const body=JSON.parse(String(init?.body));
      assert.equal(body.max_completion_tokens,128_000);
      assert.equal(body.model,"openai/gpt-6-luna");
      assert.equal(body.provider.data_collection,"deny");
      const request={schemaName:body.response_format.json_schema.name as string,prompt:body.messages[1].content as string};
      generationRequests.push(request.schemaName);
      const reportType = request.schemaName.match(/patternwork_(map|ifs|pv|att|synthesis)_pwrp71_/u)?.[1]?.toUpperCase();
      assert.ok(reportType, `unexpected request schema: ${request.schemaName}`);
      if (request.schemaName.includes("_review_")) {
        const draft = outputDrafts.get(reportType)!;
        return fakeOpenRouterResponse(structuralReviewFixture({ draft, packet: value.packet, source: value.reportSource }),1000);
      }
      if (reportType === "SYNTHESIS") {
        assert.match(request.prompt, /"accepted_layers"\s*:\s*\{/u);
        for (const layer of ["IFS", "PV", "ATT"]) assert.match(request.prompt, new RegExp(`"report_type":"${layer}"`, "u"));
      }
      const observation = (value.packet.observations as Array<Record<string, unknown>>)[0]!;
      const episode = (value.packet.episodes as Array<Record<string, unknown>>)[0]!;
      const draft: JsonObject = {
        report_release: value.reportSource.policy.release,
        release_id: String(value.packet.release_id),
        snapshot_id: String(value.packet.snapshot_id),
        evidence_sha256: String(value.packet.content_sha256),
        report_type: reportType,
        title: "A reported moment",
        title_claim_ids: ["claim-1"],
        content_status: "complete",
        sections: [{ id: "section-1", heading: "One moment", text: "The response was noticed.", claim_ids: ["claim-1"] }],
        claims: [{
          id: "claim-1", text: "The response was noticed.", kind: "reported", constructs: [],
          scope: { level: "occurrence", occurrence_ids: [String(episode.id)], person_ids: [], description: "One recalled moment." },
          evidence_ids: [String(observation.id)], counterevidence_ids: [], sequence_edge_ids: [], depends_on_claim_ids: [],
          support_basis: ["direct_report"], rationale: "Direct observation.", remaining_uncertainty: [],
        }],
        name_registry: [], relationships: [], reflection_questions: [],
      };
      outputDrafts.set(reportType, draft);
      return fakeOpenRouterResponse(draft,1000);
  };

  const dependencies: ReportWorkflowDependencies = {
    claimAttempt: async () => alreadyReleased ? "already_released" : "claimed",
    snapshotBoundary: {
      async loadAndDecryptSnapshot() { return value.snapshot; },
      async buildPseudonymousPackets() { return []; },
      getLocalProviderIdentityContext() { return REVIEWED_IDENTITY_FREE_FIXTURE_CONTEXT; },
    },
    provider: new OpenRouterClient({apiKey:"local-never-used",fetch:async()=>{throw new Error("v7.1 plain provider fallback is forbidden");}}),
    createPwrp71Provider:context=>createProductionPwrp71Provider(context,{aggregateCostCapMicros:20_000_000,maxCallCostMicros:500_000,database,keyring:TEST_PROVIDER_KEYRING,clientOptions:{apiKey:"local-fake-http",fetch:fakeHttp}}),
    persistence: {
      async initializeRuns() {
        if(!database.state.runs.length)for(let index=0;index<4;index++)database.state.runs.push({assessmentSessionId:workflowInput.assessmentSessionId,reportWorkflowAttemptId:workflowInput.attemptId,status:"RUNNING",costMicros:null,costCurrency:null,provider:null,attemptCount:0,startedAt:new Date(),openRouterGenerationId:null});
        return { alreadyReleased: false };
      },
      async persistUsage(_input, artifact) { assert.ok(artifact.artifact.artifact_type === "pwrp71_report"); },
      async persistFailure() { persistFailureCalls += 1; },
      async releaseAtomically(_input, generated, pdfs) {
        const expected = ["IFS", "PV", "ATT", "SYNTHESIS"];
        assert.deepEqual(generated.map((item) => item.reportType), expected);
        assert.deepEqual(pdfs?.map((item) => item.reportType), expected);
        assert.ok(pdfs?.every((item) => item.pageCount > 0 && item.pngPageCount > 0 && /^[a-f0-9]{64}$/u.test(item.sha256)));
        releasedTypes.push(...generated.map((item) => item.reportType));
        if (releaseFailure) throw new Error("atomic-release-test-failure");
      },
    },
    pdfVerification: {
      async verify(pdf) {
        pdfVerificationCalls += 1;
        assert.equal(pdf.subarray(0, 4).toString("ascii"), "%PDF");
        const png = Buffer.alloc(128);
        Buffer.from([0x89, 0x50, 0x4e, 0x47]).copy(png);
        const markdown = renderPwrp71Markdown([...outputDrafts.values()][0] as Record<string, unknown>);
        return { extractedText: markdown, pageCount: 1, pngPages: [png] };
      },
    },
    delivery: { async deliverReleased() { deliveryCalls += 1; } },
  };
  const previousNodeEnv = process.env.NODE_ENV;
  const mutableEnv = process.env as Record<string, string | undefined>;
  mutableEnv.NODE_ENV = "test";
  setReportWorkflowDependenciesForTests(dependencies);
  t.after(() => {
    setReportWorkflowDependenciesForTests(undefined);
    if (previousNodeEnv === undefined) delete mutableEnv.NODE_ENV;
    else mutableEnv.NODE_ENV = previousNodeEnv;
  });

  assert.deepEqual(layerInput("IFS", value.prepared), {
    report_release: "PWRP-7.1.0-candidate.1", release_id: value.packet.release_id,
    snapshot_id: value.snapshot.snapshotId, evidence_sha256: value.packet.content_sha256,
    report_type: "IFS", packet: value.packet,
  });
  const input = workflowInput;
  setReportWorkflowDependenciesForTests({...dependencies,createPwrp71Provider:undefined});
  await assert.rejects(stepModule.generateReportStep(input,value.prepared,"IFS",layerInput("IFS",value.prepared),0),/requires the durable production provider factory/u);
  assert.equal(generationRequests.length,0,"v7.1 must fail before plain-client fallback");
  setReportWorkflowDependenciesForTests(dependencies);
  for(const pin of["sourceManifestSha256","reportSourceManifestSha256"]as const){
    await assert.rejects(stepModule.generateReportStep(input,{...value.prepared,[pin]:"0".repeat(64)},"IFS",layerInput("IFS",value.prepared),0),/pwrp71_source_manifest_changed_since_preparation/u);
    assert.equal(generationRequests.length,0,"changed sources must be rejected before provider dispatch");
    assert.equal(database.state.ledgers.size,0,"changed sources must not create a provider reservation");
  }
  const result = await passReportWorkflow(input);
  assert.deepEqual(result, { status: "released", reportTypes: ["IFS", "PV", "ATT", "SYNTHESIS"] });
  assert.deepEqual(releasedTypes, ["IFS", "PV", "ATT", "SYNTHESIS"]);
  assert.equal(generationRequests.filter((schema) => schema.includes("_pwrp71_candidate_1")).length, 4);
  assert.ok(generationRequests.some((schema) => schema === "patternwork_synthesis_pwrp71_candidate_1"));
  assert.equal(pdfVerificationCalls, 4, "canonical PDF rendering and verification runs for all artifacts");
  assert.equal(deliveryCalls, 1);
  assert.equal(database.state.ledgers.size,1,"the complete customer pass uses one durable assessment budget");
  const paidCalls=generationRequests.length;
  await passReportWorkflow(input);
  assert.equal(generationRequests.length,paidCalls,"workflow replay reuses completed exact provider calls without HTTP");
  assert.equal(deliveryCalls,2);

  releaseFailure = true;
  database.state.owners.get(input.attemptId)!.invocationKey="pwrp71-customer-failed-release";
  await assert.rejects(passReportWorkflow({ ...input, invocationKey: "pwrp71-customer-failed-release" }), /atomic-release-test-failure/u);
  assert.equal(persistFailureCalls, 1, "atomic release failure is persisted through the real release step");

  alreadyReleased = true;
  const replay = await passReportWorkflow({ ...input, invocationKey: "pwrp71-customer-replay" });
  assert.equal(replay.status, "already_released");
  assert.equal(deliveryCalls, 3, "an idempotent replay retries delivery for the released bundle");
});
