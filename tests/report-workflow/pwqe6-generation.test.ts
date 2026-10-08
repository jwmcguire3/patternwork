import assert from "node:assert/strict";
import test from "node:test";
import { loadPwqe5SourcePackage as loadRuntimeSource } from "@/lib/question-engine";
import { createPwqe5SessionState, advancePwqe5Session } from "@/lib/server/assessment/pwqe5-session";
import { buildPwqe6RouterPacket } from "@/lib/server/reports/pwqe6-packet";
import { loadPwqe5SourcePackage } from "@/lib/server/reports/pwqe6-source";
import { preparePwqe6ReportInputs, pwqe6Sha256, validatePwqe6ReportDraft, validatePwqe6ReportDraftValue } from "@/lib/server/reports/pwqe6-validation";
import type { DecryptedAssessmentSnapshot, Pwqe6ReportDraft } from "@/lib/server/reports/types";
import type { Pwqe6ReportActivation } from "@/lib/server/reports/pwqe6-readiness";
import { generateCanonicalReport } from "@/lib/server/reports/generator";
import { UNQUALIFIED_MOCK_MODEL_POLICY } from "@/lib/server/openrouter/policy";
import type { OpenRouterGenerationRequest, OpenRouterTransport } from "@/lib/server/openrouter/types";
import type { JsonObject } from "@/lib/question-engine/types";
import { renderAndVerifyCanonicalPdf } from "@/lib/server/pdf/renderer";
import { assertProviderPromptPrivacy } from "@/lib/server/reports/prompts";

async function fixture() {
  const source = await loadRuntimeSource();
  const reportSource = await loadPwqe5SourcePackage();
  const initial = createPwqe5SessionState(source);
  assert.ok(initial.currentInteraction);
  const question = source.questionBank.items.find((item) => item.id === initial.currentInteraction!.questionId)!;
  const state = advancePwqe5Session(initial, {
    responseId: "test-response-1",
    completionState: "COMPLETED",
    selectedOptionIds: [question.options[0].id],
    mode: "single",
  }, source);
  const snapshotId = "test-snapshot-1";
  const packet = buildPwqe6RouterPacket({ snapshotId, state, source });
  const { content_sha256: packetDigest } = packet;
  const canonicalSnapshot = {
    snapshot_id: snapshotId,
    contract_id: source.questionBank.release,
    integrity_contract_id: "patternwork-router-evidence-v1",
    packet_version: "patternwork-router-evidence-v1",
    source_manifest_sha256: reportSource.sourceManifestSha256,
    router_packet: packet,
  };
  const snapshot: DecryptedAssessmentSnapshot = {
    databaseId: "test-database-snapshot",
    assessmentSessionId: "test-session",
    snapshotId,
    snapshotRevision: "1",
    completedPass: 1,
    evidenceSha256: pwqe6Sha256(String(packetDigest)),
    scopeSha256: pwqe6Sha256(packet.assessment_scope),
    canonicalSnapshot: canonicalSnapshot as unknown as JsonObject,
  };
  const activation = {
    sourceManifestSha256: reportSource.sourceManifestSha256,
    qualificationManifestSha256: "0".repeat(64), // Local test sentinel; no qualification or provider call is performed.
    modelPolicy: {} as Pwqe6ReportActivation["modelPolicy"],
  };
  const prepared = await preparePwqe6ReportInputs(snapshot, activation);
  assert.equal(prepared.ok, true);
  const observation = (packet.observations as Array<Record<string, unknown>>)[0];
  const episode = (packet.episodes as Array<Record<string, unknown>>)[0];
  const draft: Pwqe6ReportDraft = {
    release_id: source.questionBank.release,
    snapshot_id: snapshotId,
    report_type: "MAP",
    title: "A small reported pattern",
    sections: [{ id: "overview", heading: "Overview", text: "Unlinked section prose must not reach the reader.", claim_ids: ["claim-1"] }],
    claims: [{ id: "claim-1", text: "The respondent selected this authored option.", kind: "reported", scope: { occurrence_ids: [String(episode.id)], person_ids: [], description: "This occurrence only." }, evidence_ids: [String(observation.id)], counterevidence_ids: [], rationale: "Directly linked to the current observation.", remaining_uncertainty: [] }],
    name_registry: [],
    reflection_questions: [],
  };
  return { source: reportSource, snapshot, activation, packet: packet as JsonObject, draft };
}

test("validates PWQE6 drafts against the release schema and live packet lineage", async () => {
  const value = await fixture();
  const result = validatePwqe6ReportDraft({ value: value.draft, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: value.packet as never, source: value.source, qualificationManifestSha256: value.activation.qualificationManifestSha256 });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.artifact_type, "pwqe6_report");
    assert.equal(result.value.prompt_release, "6.0");
    assert.match(result.value.report_markdown, /A small reported pattern/u);
    assert.doesNotMatch(result.value.report_markdown, /Unlinked section prose/u);
    assert.equal(result.value.digests.artifact_sha256, pwqe6Sha256(Object.fromEntries(Object.entries(result.value).filter(([key]) => key !== "digests"))));
    const png = Buffer.alloc(128);
    png[0] = 0x89;
    png.write("PNG", 1, "ascii");
    const pdf = await renderAndVerifyCanonicalPdf({
      reportType: "MAP",
      artifact: result.value,
      routerPacket: value.packet,
      snapshotId: value.snapshot.snapshotId,
      contractVersion: "v6",
      verification: { async verify() { return { extractedText: result.value.report_markdown, pageCount: 1, pngPages: [png] }; } },
    });
    assert.equal(pdf.pageCount, 1);
    assert.equal(pdf.sha256.length, 64);
  }
});

test("account prose does not look like an ID, while identifier-shaped values stay blocked", async () => {
  const value = await fixture();
  const ordinary = structuredClone(value.draft);
  ordinary.claims[0].rationale = "Account records without an identifier can still clarify the sequence.";
  const accepted = validatePwqe6ReportDraftValue({ value: ordinary, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: value.packet as never, source: value.source });
  assert.equal(accepted.ok, true);
  assert.doesNotThrow(() => assertProviderPromptPrivacy({ notes: "Account records can clarify the sequence." }));
  assert.doesNotThrow(() => assertProviderPromptPrivacy({ notes: "The account without a number may be difficult to trace." }));
  assert.doesNotThrow(() => assertProviderPromptPrivacy({ notes: "The account could still be under review." }));
  assert.doesNotThrow(() => assertProviderPromptPrivacy({ notes: "The account doesn't need a code to be reviewed." }));

  const identifying = structuredClone(value.draft);
  identifying.claims[0].rationale = "The source lists account ID ZXCV-99881.";
  const rejected = validatePwqe6ReportDraftValue({ value: identifying, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: value.packet as never, source: value.source });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.ok(rejected.issues.some((issue) => issue.code === "direct_pii"));
  assert.throws(() => assertProviderPromptPrivacy({ notes: "The source lists account ID ZXCV-99881." }), /direct identifying data/u);
});

test("uses v6 prompt and draft schema through the mock generation transport", async () => {
  const value = await fixture();
  let request: OpenRouterGenerationRequest | undefined;
  const provider: OpenRouterTransport = {
    async generate(input) {
      request = input;
      return {
        ok: true,
        output: value.draft as unknown as JsonObject,
        usage: { generationId: "offline-test", inputTokens: 1, outputTokens: 1, reasoningTokens: 0, totalTokens: 2, costMicros: 0, currency: "USD", model: "offline/mock" },
      };
    },
  };
  const result = await generateCanonicalReport({
    reportType: "MAP",
    input: { packet: value.packet },
    packets: [value.packet],
    provider,
    invocationKey: "pwqe6-test",
    spentMicros: 0,
    costCapMicros: 1_000_000,
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v6",
    source: value.source,
    qualificationManifestSha256: value.activation.qualificationManifestSha256,
    snapshotId: value.snapshot.snapshotId,
  });
  assert.equal(result.ok, true);
  assert.match(request?.system ?? "", /Patternwork v6/u);
  assert.equal(request?.schemaName, "patternwork_map_v6_design");
});

test("rejects forged evidence, nonexistent occurrence scope, and stale packet digests", async () => {
  const value = await fixture();
  const forged = structuredClone(value.draft) as unknown as Record<string, unknown>;
  const claims = forged.claims as Array<Record<string, unknown>>;
  claims[0].evidence_ids = ["response-never-in-packet"];
  const forgedResult = validatePwqe6ReportDraft({ value: forged, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: value.packet as never, source: value.source, qualificationManifestSha256: value.activation.qualificationManifestSha256 });
  assert.equal(forgedResult.ok, false);
  if (!forgedResult.ok) assert.ok(forgedResult.issues.some((issue) => issue.code === "invalid_evidence_reference"));

  const wrongScope = structuredClone(value.draft) as unknown as Record<string, unknown>;
  const scopeClaims = wrongScope.claims as Array<Record<string, unknown>>;
  (scopeClaims[0].scope as Record<string, unknown>).occurrence_ids = ["occurrence-never-in-packet"];
  const scopeResult = validatePwqe6ReportDraft({ value: wrongScope, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: value.packet as never, source: value.source, qualificationManifestSha256: value.activation.qualificationManifestSha256 });
  assert.equal(scopeResult.ok, false);
  if (!scopeResult.ok) assert.ok(scopeResult.issues.some((issue) => issue.code === "invalid_occurrence_reference"));

  const staleSnapshot = { ...value.snapshot, canonicalSnapshot: { ...value.snapshot.canonicalSnapshot, router_packet: { ...value.packet, content_sha256: "f".repeat(64) } } };
  const stale = await preparePwqe6ReportInputs(staleSnapshot, value.activation);
  assert.equal(stale.ok, false);
  if (!stale.ok) assert.ok(stale.issues.some((issue) => issue.code === "router_packet_digest"));
});

test("rejects evidence from an occurrence outside the claim's declared scope", async () => {
  const value = await fixture();
  const packet = structuredClone(value.packet) as unknown as Record<string, unknown>;
  const episodes = packet.episodes as Array<Record<string, unknown>>;
  const observations = packet.observations as Array<Record<string, unknown>>;
  const episode = episodes[0];
  const observation = observations[0];
  episodes.push({ ...episode, id: "E2" });
  observations.push({ ...observation, id: "evidence-E2", response_id: "response-E2", administration_id: "response-E2", occurrence_id: "E2", dependence_group: "E2" });
  const packetContent = { ...packet };
  delete packetContent.content_sha256;
  packet.content_sha256 = pwqe6Sha256(packetContent);

  const draft = structuredClone(value.draft) as unknown as Record<string, unknown>;
  const claims = draft.claims as Array<Record<string, unknown>>;
  const claim = claims[0];
  (claim.scope as Record<string, unknown>).occurrence_ids = ["E2"];
  claim.evidence_ids = [String(observation.id)];

  const result = validatePwqe6ReportDraftValue({ value: draft, reportType: "MAP", snapshotId: value.snapshot.snapshotId, packet: packet as never, source: value.source });
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.issues.some((issue) => issue.code === "evidence_occurrence_scope" && issue.path === "$.claims[0].evidence_ids[0]"));
});
