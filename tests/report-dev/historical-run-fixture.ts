import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1 as candidate } from "../../lib/server/openrouter/policy.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { PWRP71_INPUT_GUIDANCE_VERSION, PWRP71_SCOPE_GUIDANCE_VERSION, PWRP71_REPAIR_STRATEGY_VERSION, type Pwrp71ContinuationSeed, type Pwrp71ReviewRetrySeed, type Pwrp71CitationClosureSeed } from "../../lib/server/reports/generator.ts";
import { PWRP71_QUESTION_CONTEXT_VERSION } from "../../lib/server/reports/pwrp71-question-context.ts";
import { PWRP71_REFERENCE_SCHEMA_VERSION, pwrp71WriterSchemaForVersion } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { validatePwrp71ReportDraft, type Pwrp71ReportArtifact } from "../../lib/server/reports/pwrp71-validation.ts";
import { validatePwrp71Review } from "../../lib/server/reports/pwrp71-review.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
import type { AssessmentRecord } from "../../scripts/report-dev/assessment.ts";
import { citationClosureBinding, developmentModelPolicy, prepareReport } from "../../scripts/report-dev/workflow.ts";
import { contentHash } from "../../scripts/report-dev/source.ts";

type Phase = "initial" | "repair" | "review" | "review_after_repair" | "review_retry";

/**
 * Synthetic historical reader fixtures, never a dispatch path. No transport or
 * generator is accepted or invoked. Hashes bind these test records, not real
 * provider requests, model judgments, approval, or authentic past run evidence.
 */
export async function writeHistoricalRunFixture(input: {
  directory: string; assessment: AssessmentRecord; questionSource: Pwqe51SourcePackage; reportSource: Pwrp71SourcePackage;
  mode: "generate" | "continue" | "review-retry" | "review-closure";
  continuation?: Pwrp71ContinuationSeed; reviewRetry?: Pwrp71ReviewRetrySeed; citationClosure?: Pwrp71CitationClosureSeed;
  structuralRepair?: boolean; steps: readonly { phase: Phase; output: JsonObject }[];
}) {
  const { directory, assessment, questionSource, reportSource, mode } = input;
  const pick = (value: object, keys: string[]) => Object.fromEntries(keys.map(key => [key, (value as Record<string, unknown>)[key]]));
  const binding = {
    schema: "patternwork-report-dev-run-2", assessmentSha256: assessment.contentSha256,
    questionSourceSha256: questionSource.sourceManifestSha256, reportSourceSha256: reportSource.manifestSha256,
    types: ["IFS"], modelPolicy: developmentModelPolicy(candidate.id), candidate, candidateSha256: sha256Canonical(candidate),
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, billingBasisSha256: GPT6_LUNA_BILLING_BASIS_SHA256,
    inputGuidanceVersion: PWRP71_INPUT_GUIDANCE_VERSION, questionContextVersion: PWRP71_QUESTION_CONTEXT_VERSION,
    scopeGuidanceVersion: PWRP71_SCOPE_GUIDANCE_VERSION, referenceSchemaVersion: PWRP71_REFERENCE_SCHEMA_VERSION,
    mode, aggregateMicros: 500_000, perCallMicros: 500_000, operationalApproval: false,
    ...(mode === "continue" ? { repairStrategyVersion: PWRP71_REPAIR_STRATEGY_VERSION, structuralRepairLimit: input.structuralRepair ? 1 : 0 } : {}),
    ...(input.continuation ? { continuation: pick(input.continuation, ["sourceRunBindingSha256", "sourceDraftSha256", "sourceReviewSha256", "sourceDraftAttemptId", "sourceReviewAttemptId"]) } : {}),
    ...(input.reviewRetry ? { reviewRetry: pick(input.reviewRetry, ["sourceRunBindingSha256", "sourceDraftSha256", "sourceDraftAttemptId", "sourceReviewAttemptId", "validationIssues"]) } : {}),
    ...(input.citationClosure ? { citationClosure: citationClosureBinding(input.citationClosure) } : {}),
  };
  const bindingSha256 = sha256Canonical(binding);
  const { packet, request } = prepareReport(assessment, "IFS", questionSource, reportSource);
  if (!request.ok) throw new Error("Historical fixture source does not prepare.");
  const writerSchema = pwrp71WriterSchemaForVersion(request.value.response_schema, packet, binding.referenceSchemaVersion);
  const events: JsonObject[] = [], attempts: JsonObject[] = [];
  let artifact: Pwrp71ReportArtifact | undefined;
  const seedDraft = input.continuation?.previousDraft ?? input.reviewRetry?.previousDraft;
  if (seedDraft) {
    const checked = validatePwrp71ReportDraft({ value: seedDraft, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: reportSource });
    if (!checked.ok) throw new Error("Historical fixture seed draft does not validate.");
    artifact = checked.value;
  }
  const put = async (relative: string, value: unknown) => {
    const file = path.join(directory, relative); await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  };
  if (input.citationClosure) {
    const seed = input.citationClosure;
    const closed = derivePwrp71Citations({ value: seed.rawDraft, previousDraft: seed.previousDraft, referenceRestoration: seed.referenceRestoration, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: reportSource });
    artifact = closed.artifact;
    await put("IFS/citation-derivation.json", { ...citationClosureBinding(seed), derivation: closed.derivation, structuralValidation: { ok: true }, rawValidationIssues: closed.rawValidationIssues });
    await put("IFS/normalized-draft.json", artifact.draft);
  }
  let lastIssues: readonly unknown[] = [], failureCode = "review_not_accepted", accepted = false;
  for (const [index, step] of input.steps.entries()) {
    const reviewing = step.phase.startsWith("review");
    const attemptId = `dev:${bindingSha256}:IFS:${step.phase}:${candidate.id}:attempt-${index + 1}`;
    const schema = reviewing ? reportSource.schemas.reportReview : writerSchema;
    const usage = { generationId: `synthetic-history-${index}`, inputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0, costMicros: 0, currency: "USD", model: candidate.model };
    const attempt: JsonObject = {
      attemptId, status: "completed", usageStatus: "reported", endpoint: "https://openrouter.ai/api/v1/chat/completions",
      startedAt: "2026-10-01T00:00:00.000Z", completedAt: "2026-10-01T00:00:00.000Z", elapsedMs: 0,
      requestFingerprint: sha256Canonical({ synthetic: true, bindingSha256, index }), wirePayloadSha256: sha256Canonical({ synthetic: true, step }),
      request: { requestedModel: candidate.model, requestedReasoningEffort: candidate.reasoningEffort, maxOutputTokens: candidate.maxOutputTokens,
        schemaName: reviewing ? "patternwork_ifs_pwrp71_review_candidate_3" : "patternwork_ifs_pwrp71_candidate_1", idempotencyKey: attemptId,
        systemSha256: contentHash(step.phase === "repair" ? `${request.value.system}\n\n${reportSource.prompts.repair}` : request.value.system),
        promptSha256: sha256Canonical({ synthetic: true, phase: step.phase }), localSchemaSha256: sha256Canonical(schema), wireSchemaSha256: sha256Canonical(projectOpenRouterStrictSchemaObject(schema as JsonObject)) },
      maximumCallCostMicros: 1, aggregateCostCapMicros: binding.aggregateMicros, billingBasisSha256: binding.billingBasisSha256,
      candidateAdmission: { scope: "report-dev-experimental-v1", candidateId: candidate.id, candidateSha256: binding.candidateSha256, runBindingSha256: bindingSha256 },
      finishReason: "stop", usage, providerResult: { ok: true, output: step.output, finishReason: "stop", usage },
    };
    if (reviewing) {
      if (!artifact) throw new Error("Historical reviewer fixture lacks a validated draft.");
      const result = validatePwrp71Review({ value: step.output, artifact, packet, source: reportSource });
      if (result.ok) {
        attempt.reviewReceipt = result.value;
        events.push({ type: "review_receipt", attemptId, reportType: "IFS", verdict: result.value.verdict, receipt: result.value });
        lastIssues = []; failureCode = "review_not_accepted"; accepted = result.value.verdict === "accept";
      } else {
        const issues = result.issues.map(({ code, path, message }) => ({ code, path, message }));
        attempt.validation = { ok: false, issues };
        events.push({ type: "review_validation", attemptId, reportType: "IFS", ok: false, issues });
        lastIssues = result.issues; failureCode = "review_validation_failed";
      }
    } else {
      const result = validatePwrp71ReportDraft({ value: step.output, reportType: "IFS", snapshotId: String(packet.snapshot_id), packet, source: reportSource });
      lastIssues = result.ok ? [] : result.issues;
      const validation = { ok: result.ok, issues: [...lastIssues], ...(result.ok ? { draftSha256: sha256Canonical(result.value.draft) } : {}) } as JsonObject;
      attempt.validation = validation;
      events.push({ type: "draft_validation", attemptId, reportType: "IFS", ...validation });
      if (result.ok) artifact = result.value;
      else failureCode = "artifact_validation_failed";
    }
    if (input.steps[index + 1]?.phase === "repair") {
      const decision = { reason: reviewing ? "review_revise" : "draft_validation", issueCount: reviewing ? (step.output.issues as JsonObject[]).length : lastIssues.length };
      attempt.repairDecisions = [decision];
      events.push({ type: "repair_decision", triggerAttemptId: attemptId, reportType: "IFS", ...decision });
    }
    attempts.push(attempt);
  }
  const failure = { reportType: "IFS", code: mode === "review-retry" && failureCode === "review_not_accepted" ? "review_retry_not_accepted" : failureCode, message: "Synthetic historical fixture outcome.", issues: [...lastIssues], usages: attempts.map(a => a.usage), retryable: false };
  const reports = { IFS: { stage: "generation_or_review", status: accepted ? "accepted_for_this_development_run" : "failed", ...(accepted ? {} : { failure }) } };
  const summary = { ...binding, reports, failed: !accepted, providerAttempts: attempts.length, settledCostMicros: 0, unknownAttempts: [], narrativeEvaluation: input.steps.some(s => s.phase.startsWith("review")) ? "model_review" : "not_reached", directory };
  await put("binding.json", binding); await put("summary.json", summary); await put("provider/attempts.json", { schemaVersion: 1, attempts });
  await put("IFS/packet.json", packet); await put("IFS/prepared.json", request); await put("IFS/events.json", events);
  await put("IFS/outcome.json", accepted ? { ok: true, value: { artifact } } : { ok: false, failure });
  // An explicit marker prevents these handcrafted records being mistaken for
  // immutable real provider evidence outside this isolated temporary directory.
  await put("SYNTHETIC_TEST_FIXTURE.json", { historicalCandidate: candidate.id, providerCalled: false, generatorCalled: false, authenticHistoricalEvidence: false });
  return summary;
}
