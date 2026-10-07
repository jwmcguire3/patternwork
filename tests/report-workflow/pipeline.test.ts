import assert from "node:assert/strict";
import test from "node:test";
import type { JsonObject, LayerReportType, ReportType } from "../../lib/question-engine/types.ts";
import { sha256Canonical, sha256Text } from "../../lib/report-contracts/delivery-validator.ts";
import type { LayerReportArtifact, ReportEvidencePacketV3_1, SynthesisAudit } from "../../lib/report-contracts/types.ts";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport, OpenRouterUsage } from "../../lib/server/openrouter/types.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "../../lib/server/reports/packet-builder.ts";
import { setReportWorkflowDependenciesForTests } from "../../lib/server/reports/dependencies.ts";
import { ReportPipelineError, runPassReportPipeline } from "../../lib/server/reports/pipeline.ts";
import { buildValidatedSynthesisBundle } from "../../lib/server/reports/synthesis.ts";
import type { DecryptedAssessmentSnapshot, GeneratedCanonicalArtifact, PassReportWorkflowInput, PreparedReportInputs, ReportWorkflowDependencies, ReportWorkflowPersistence } from "../../lib/server/reports/types.ts";
import { passReportWorkflow } from "../../workflows/pass-report.ts";

function snapshot(completedPass: 1 | 2): DecryptedAssessmentSnapshot {
  const completion = completedPass === 1
    ? { completion_mode: "pass1_complete", last_completed_stage: "S2", safe_resume_stage: "S3" }
    : { completion_mode: "pass2_complete", last_completed_stage: "S5", safe_resume_stage: "complete" };
  return {
    databaseId: "db-snapshot",
    assessmentSessionId: "session",
    snapshotId: "pwsn_pipeline",
    snapshotRevision: "1",
    completedPass,
    evidenceSha256: "a".repeat(64),
    scopeSha256: "b".repeat(64),
    canonicalSnapshot: {
      assessment_completion: { ...completion, completed_at: "2026-09-02T12:00:00.000Z" },
      responses: [{ responseId: "response", interactionInstanceId: "interaction", bankItemId: "MS-101", bankItemVersion: "1.0", administrationSequence: 1, stage: "S1", completionState: "COMPLETED", responseOrder: [], content: { response: { observation: "waited" } } }],
    },
  };
}

function usage(id: string): OpenRouterUsage {
  return { generationId: id, inputTokens: 10, outputTokens: 10, reasoningTokens: 1, totalTokens: 20, costMicros: 100, currency: "USD", model: "mock/model" };
}

function layerArtifact(reportType: LayerReportType, packet: ReportEvidencePacketV3_1): LayerReportArtifact {
  const episode = packet.episode_evidence[0] as JsonObject;
  const episodeId = String(episode.episode_id);
  const binding = packet.snapshot_binding as JsonObject;
  const section = `${reportType}-01`;
  const claim = {
    claim_id: `CLM-${reportType}-scope`, report_type: reportType, section_code: section, facet_kind: "scope", object_status: "direct_observation",
    claim_text: "This report remains limited to one pseudonymous assessment interaction.", source_object_ids: [episodeId], supporting_evidence_ids: [episodeId],
    boundaries: [{ episode_id: episodeId, episode_sha256: sha256Canonical(episode), referent_id: String(episode.referent_id), window_id: String(episode.window_id), time_horizon: "uncertain" }],
    confidence: "low", contradiction_links: [], limit_links: [],
  } as JsonObject;
  const markdown = "This report remains limited to one pseudonymous assessment interaction.";
  const block = { paragraph_id: `P-${reportType}-scope`, ordinal: 1, kind: "substantive", markdown, markdown_sha256: sha256Text(markdown), trace_id: `TRC-${reportType}-scope` } as JsonObject;
  const trace = { trace_id: `TRC-${reportType}-scope`, paragraph_id: `P-${reportType}-scope`, paragraph_ordinal: 1, paragraph_sha256: sha256Text(markdown), report_section_code: section, claim_ids: [`CLM-${reportType}-scope`], supporting_evidence_ids: [episodeId], supporting_response_ids: [], contains_exact_quote: false, confidence: "low", contradiction_ids: [], limit_ids: [], writer_template_version: "PWRP-V4.1" } as JsonObject;
  const partial = {
    artifact_type: "layer_report", contract_id: "PWQE3-CONTRACT-2", integrity_contract_id: "PWQE3-INTEGRITY-1", package_version: "3.1.0", prompt_release: "4.1.0",
    report_id: `RPT-${reportType}-pipeline`, report_type: reportType, report_version: "4.1.0", writer_template_version: "PWRP-V4.1", status: "final",
    packet_binding: { report_type: reportType, packet_id: packet.packet_id, packet_sha256: sha256Canonical(packet), snapshot_id: binding.snapshot_id, snapshot_revision: binding.snapshot_revision, evidence_sha256: binding.evidence_sha256, scope_sha256: binding.scope_sha256 },
    report_markdown: markdown, markdown_blocks: [block], claims: [claim], paragraph_traces: [trace],
    digests: { markdown_sha256: sha256Text(markdown), claims_sha256: sha256Canonical([claim]), paragraph_traces_sha256: sha256Canonical([trace]) },
  } as unknown as LayerReportArtifact;
  (partial.digests as JsonObject).artifact_sha256 = sha256Canonical(partial);
  return partial;
}

function synthesisAudit(bundle: ReturnType<typeof buildValidatedSynthesisBundle>): SynthesisAudit {
  const markdown = "No cross-layer convergence is named because the validated sources contain no explicit link proof.";
  const block = { paragraph_id: "P-SYN-limit", ordinal: 1, kind: "substantive", markdown, markdown_sha256: sha256Text(markdown), trace_id: "TRC-SYN-limit" } as JsonObject;
  const trace = { trace_id: "TRC-SYN-limit", paragraph_id: "P-SYN-limit", paragraph_ordinal: 1, paragraph_sha256: sha256Text(markdown), report_section_code: "SYN-07", candidate_ids: [], source_claim_ids: [], supporting_evidence_ids: [], supporting_response_ids: [], confidence: "unsupported", contradiction_ids: [], limit_ids: [], writer_template_version: "PWRP-V4.1" } as JsonObject;
  const partial = {
    artifact_type: "synthesis_audit", audit_id: "SYN-AUDIT-pipeline", contract_id: "PWQE3-CONTRACT-2", integrity_contract_id: "PWQE3-INTEGRITY-1", package_version: "3.1.0", prompt_release: "4.1.0",
    bundle_id: bundle.bundle_id, bundle_sha256: bundle.bundle_sha256, snapshot_manifest_sha256: String((bundle.snapshot_manifest as JsonObject).manifest_sha256), reader_markdown: markdown,
    markdown_blocks: [block], candidates: [], paragraph_traces: [trace], validator_results: { input_integrity_passed: true, snapshot_compatibility_passed: true, trace_completeness_passed: true, references_passed: true, contradiction_propagation_passed: true, all_named_convergences_eligible: true, deterministic_order_passed: true, quote_prohibition_passed: true },
    digests: { markdown_sha256: sha256Text(markdown), candidate_audit_sha256: sha256Canonical([]), paragraph_traces_sha256: sha256Canonical([trace]) },
  } as unknown as SynthesisAudit;
  (partial.digests as JsonObject).audit_sha256 = sha256Canonical(partial);
  return partial;
}

class RecordingPersistence implements ReportWorkflowPersistence {
  readonly usages: ReportType[] = [];
  readonly failures: string[] = [];
  releases = 0;
  releasedTypes: ReportType[] = [];
  constructor(private readonly alreadyReleased = false) {}
  async initializeRuns() { return { alreadyReleased: this.alreadyReleased }; }
  async persistUsage(_input: PassReportWorkflowInput, generated: GeneratedCanonicalArtifact) { this.usages.push(generated.reportType); }
  async releaseAtomically(_input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[]) { this.releases += 1; this.releasedTypes = generated.map((item) => item.reportType); }
  async persistFailure(_input: PassReportWorkflowInput, code: string) { this.failures.push(code); }
}

class QueueProvider implements OpenRouterTransport {
  readonly calls: OpenRouterGenerationRequest[] = [];
  constructor(readonly queue: JsonObject[]) {}
  async generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult> {
    this.calls.push(request);
    const output = this.queue.shift();
    if (!output) return { ok: false, kind: "invalid_json", message: "missing mock", usage: usage(`gen-${this.calls.length}`) };
    return { ok: true, output, usage: usage(`gen-${this.calls.length}`) };
  }
}

function dependencies(snapshotValue: DecryptedAssessmentSnapshot, provider: OpenRouterTransport, persistence: ReportWorkflowPersistence): ReportWorkflowDependencies {
  return {
    snapshotBoundary: { async loadAndDecryptSnapshot() { return snapshotValue; }, async buildPseudonymousPackets(value) { return buildPseudonymousPacketsFromCanonicalSnapshot(value); } },
    provider, persistence, modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY, costCapMicros: 50_000_000,
  };
}

test("Pass 2 runs IFS/PV/ATT before synthesis and releases only the complete validated set", async () => {
  const snapshotValue = snapshot(2);
  const packets = buildPseudonymousPacketsFromCanonicalSnapshot(snapshotValue);
  const prepared: PreparedReportInputs = { snapshot: { databaseId: snapshotValue.databaseId, assessmentSessionId: snapshotValue.assessmentSessionId, snapshotId: snapshotValue.snapshotId, snapshotRevision: snapshotValue.snapshotRevision, completedPass: 2, evidenceSha256: snapshotValue.evidenceSha256, scopeSha256: snapshotValue.scopeSha256 }, packets };
  const layers = (["IFS", "PV", "ATT"] as const).map((type) => ({ reportType: type, artifact: layerArtifact(type, packets.find((packet) => packet.report_type === type)!), usage: { ...usage(`seed-${type}`), generationIds: [`seed-${type}`], attempts: 1 } } as GeneratedCanonicalArtifact));
  const bundle = buildValidatedSynthesisBundle(prepared, layers);
  const provider = new QueueProvider([...layers.map((item) => item.artifact as JsonObject), synthesisAudit(bundle)]);
  const persistence = new RecordingPersistence();
  const result = await runPassReportPipeline({ assessmentSessionId: "session", snapshotId: "pwsn_pipeline", completedPass: 2, invocationKey: "stable" }, dependencies(snapshotValue, provider, persistence));
  assert.equal(result.status, "released");
  assert.deepEqual(persistence.usages, ["IFS", "PV", "ATT", "SYNTHESIS"]);
  assert.deepEqual(persistence.releasedTypes, ["IFS", "PV", "ATT", "SYNTHESIS"]);
  assert.equal(persistence.releases, 1);
  assert.match(provider.calls[3].prompt, /synthesis_bundle/u);
});

test("invalid generation records failure and never releases partial artifacts", async () => {
  const snapshotValue = snapshot(2);
  const persistence = new RecordingPersistence();
  const provider = new QueueProvider([]);
  await assert.rejects(runPassReportPipeline({ assessmentSessionId: "session", snapshotId: "pwsn_pipeline", completedPass: 2, invocationKey: "stable" }, dependencies(snapshotValue, provider, persistence)), ReportPipelineError);
  assert.equal(persistence.releases, 0);
  assert.deepEqual(persistence.usages, []);
  assert.deepEqual(persistence.failures, ["artifact_validation_failed"]);
  assert.equal(provider.calls.length, 3);
});

test("an already released workflow still invokes idempotent delivery", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  Reflect.set(process.env, "NODE_ENV", "test");
  const snapshotValue = snapshot(2);
  const persistence = new RecordingPersistence(true);
  const provider = new QueueProvider([]);
  const delivered: PassReportWorkflowInput[] = [];
  const configured: ReportWorkflowDependencies = {
    ...dependencies(snapshotValue, provider, persistence),
    claimAttempt: async () => "already_released",
    delivery: { async deliverReleased(input) { delivered.push({ ...input, snapshotId: snapshotValue.snapshotId }); } },
  };
  setReportWorkflowDependenciesForTests(configured);
  const input = { assessmentSessionId: "session", snapshotId: "pwsn_pipeline", completedPass: 2, invocationKey: "stable", attemptId: "attempt-released", attemptNumber: 1 } as const;
  try {
    const result = await passReportWorkflow(input);
    assert.equal(result.status, "already_released");
    assert.deepEqual(delivered, [input]);
    assert.equal(provider.calls.length, 0);
    assert.equal(persistence.releases, 0);
  } finally {
    setReportWorkflowDependenciesForTests(undefined);
    if (previousNodeEnv === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
    else Reflect.set(process.env, "NODE_ENV", previousNodeEnv);
  }
});
