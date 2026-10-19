import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1 } from "../../lib/server/openrouter/policy.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { assertNoRespondentClassification, assertNoRespondentFullName, assertNoRespondentFullNameInGeneratedDraft, assertNoRespondentFullNameInPwrp71ModelInput } from "../../lib/server/reports/content-boundary.ts";
import { PWRP71_INPUT_GUIDANCE_VERSION, type Pwrp71ContinuationSeed } from "../../lib/server/reports/generator.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
import { validatePwrp71Review } from "../../lib/server/reports/pwrp71-review.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import type { AssessmentRecord } from "./assessment.ts";
import { loadPwrp71CitationClosureSeed } from "./citation-recovery.ts";
import { canonical, contentHash } from "./source.ts";
import { citationClosureBinding, developmentModelPolicy, prepareReport } from "./workflow.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function same(left: unknown, right: unknown, message: string): void {
  if (canonical(left) !== canonical(right)) throw new Error(message);
}
function digest(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function within(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Prove the normalized draft and its fresh revision receipt without relabeling the raw writer result. */
export async function loadPwrp71ContinuationFromCitationReview(input: {
  sourceRunDirectory: string; outputRoot: string; assessment: AssessmentRecord;
  questionSource: Pwqe51SourcePackage; reportSource: Pwrp71SourcePackage;
}): Promise<Pwrp71ContinuationSeed> {
  const root = await realpath(input.outputRoot), sourceDirectory = await realpath(input.sourceRunDirectory);
  const runsDirectory = path.join(root, "runs"), relative = path.relative(runsDirectory, sourceDirectory);
  if (!within(root, sourceDirectory) || !relative || relative === ".." || relative.includes(path.sep) || path.isAbsolute(relative)) {
    throw new Error("Citation review continuation must reference one run directly inside the selected output root.");
  }
  const readJson = async (file: string): Promise<unknown> => {
    const resolved = await realpath(path.join(sourceDirectory, file));
    if (!within(sourceDirectory, resolved)) throw new Error("Citation review source files must remain inside their run directory.");
    return JSON.parse(await readFile(resolved, "utf8")) as unknown;
  };
  const [bindingValue, summaryValue, attemptsValue, packetValue, preparedValue, eventsValue, derivationValue, draftValue] = await Promise.all([
    readJson("binding.json"), readJson("summary.json"), readJson("provider/attempts.json"), readJson("IFS/packet.json"),
    readJson("IFS/prepared.json"), readJson("IFS/events.json"), readJson("IFS/citation-derivation.json"), readJson("IFS/normalized-draft.json"),
  ]);
  const binding = object(bindingValue), summary = object(summaryValue), attemptFile = object(attemptsValue);
  if (!binding || !summary || !attemptFile || attemptFile.schemaVersion !== 1
    || !Array.isArray(attemptFile.attempts) || attemptFile.attempts.length !== 1
    || !Array.isArray(eventsValue) || eventsValue.length !== 1) {
    throw new Error("Citation review continuation requires one settled reviewer attempt and one review receipt event.");
  }
  const attempt = object(attemptFile.attempts[0]), event = object(eventsValue[0]);
  const closure = object(binding.citationClosure), ifs = object(object(summary.reports)?.IFS), failure = object(ifs?.failure);
  const policy = developmentModelPolicy(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id);
  const candidateSha256 = sha256Canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1), bindingSha256 = contentHash(canonical(binding));
  if (binding.schema !== "patternwork-report-dev-run-2" || binding.mode !== "review-closure"
    || binding.assessmentSha256 !== input.assessment.contentSha256
    || binding.questionSourceSha256 !== input.questionSource.sourceManifestSha256 || binding.reportSourceSha256 !== input.reportSource.manifestSha256
    || canonical(binding.types) !== canonical(["IFS"]) || canonical(binding.modelPolicy) !== canonical(policy)
    || canonical(binding.candidate) !== canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1) || binding.candidateSha256 !== candidateSha256
    || canonical(binding.providerPolicy) !== canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
    || binding.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256 || binding.inputGuidanceVersion !== PWRP71_INPUT_GUIDANCE_VERSION
    || binding.operationalApproval !== false || binding.continuation !== undefined || binding.reviewRetry !== undefined
    || typeof binding.aggregateMicros !== "number" || !Number.isSafeInteger(binding.aggregateMicros) || binding.aggregateMicros <= 0 || binding.aggregateMicros > 500_000
    || typeof binding.perCallMicros !== "number" || !Number.isSafeInteger(binding.perCallMicros) || binding.perCallMicros <= 0 || binding.perCallMicros > binding.aggregateMicros
    || !closure || !digest(closure.sourceRunBindingSha256) || !digest(closure.rawDraftSha256) || !digest(closure.normalizedDraftSha256) || !digest(closure.derivationSha256)
    || typeof closure.sourceDraftAttemptId !== "string" || !attempt || !event
    || summary.failed !== true || summary.providerAttempts !== 1 || !Array.isArray(summary.unknownAttempts) || summary.unknownAttempts.length !== 0
    || summary.narrativeEvaluation !== "model_review" || typeof summary.directory !== "string" || path.resolve(summary.directory) !== sourceDirectory
    || ifs?.stage !== "generation_or_review" || ifs.status !== "failed" || failure?.code !== "review_not_accepted"
    || failure.reportType !== "IFS" || failure.retryable !== false || canonical(failure.issues) !== canonical([])) {
    throw new Error("Citation review source is not a bounded current IFS run rejected only by a fresh revision review.");
  }
  for (const key of Object.keys(binding)) same(summary[key], binding[key], `Citation review summary differs from its immutable ${key} binding.`);
  same(Object.keys(summary.reports as object), ["IFS"], "Citation review summary contains unexpected reports.");

  const parents: string[] = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const directory = await realpath(path.join(runsDirectory, entry.name));
      if (!within(runsDirectory, directory)) continue;
      const parentBindingPath = await realpath(path.join(directory, "binding.json"));
      if (!within(directory, parentBindingPath)) continue;
      const parentBinding = object(JSON.parse(await readFile(parentBindingPath, "utf8")) as unknown);
      if (parentBinding && contentHash(canonical(parentBinding)) === closure.sourceRunBindingSha256) parents.push(directory);
    } catch { /* Incomplete unrelated directories cannot establish the immutable source. */ }
  }
  if (parents.length !== 1 || parents[0] === sourceDirectory) throw new Error("Citation review raw source is missing or ambiguous in the selected output root.");
  const seed = await loadPwrp71CitationClosureSeed({ ...input, outputRoot: root, sourceRunDirectory: parents[0] });
  const expectedClosure = citationClosureBinding(seed);
  same(closure, expectedClosure, "Citation review binding differs from the reconstructed raw source seed.");
  const current = prepareReport(input.assessment, "IFS", input.questionSource, input.reportSource);
  if (!current.request.ok) throw new Error("Current IFS assessment cannot be prepared for citation review continuation.");
  assertNoRespondentFullName(current.packet);
  assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
  same(packetValue, current.packet, "Citation review packet differs from current assessment evidence.");
  same(preparedValue, current.request, "Citation review prepared request differs from current input.");
  const derived = derivePwrp71Citations({ value: seed.rawDraft, previousDraft: seed.previousDraft, referenceRestoration: seed.referenceRestoration, reportType: "IFS", snapshotId: current.request.value.binding.snapshot_id, packet: current.packet, source: input.reportSource });
  same(derived.derivation, seed.derivation, "Citation review derivation differs from its reconstructed seed.");
  same(derivationValue, { ...expectedClosure, derivation: derived.derivation, structuralValidation: { ok: true }, rawValidationIssues: derived.rawValidationIssues }, "Citation review derivation artifact differs from exact recomputation.");
  same(draftValue, derived.artifact.draft, "Citation review normalized draft differs from exact recomputation.");
  assertNoRespondentFullNameInGeneratedDraft(draftValue);
  assertNoRespondentClassification(draftValue);
  const validatedDraft = validatePwrp71ReportDraft({ value: draftValue, reportType: "IFS", snapshotId: current.request.value.binding.snapshot_id, packet: current.packet, source: input.reportSource });
  if (!validatedDraft.ok || sha256Canonical(validatedDraft.value.draft) !== closure.normalizedDraftSha256) throw new Error("Citation review normalized draft fails current structural validation.");

  const usage = object(attempt.usage), request = object(attempt.request), admission = object(attempt.candidateAdmission);
  const result = object(attempt.providerResult), receipt = object(attempt.reviewReceipt), cost = usage?.costMicros;
  const attemptId = `dev:${bindingSha256}:IFS:review:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-1`;
  if (attempt.attemptId !== attemptId || attempt.status !== "completed" || attempt.usageStatus !== "reported"
    || attempt.endpoint !== "https://openrouter.ai/api/v1/chat/completions" || attempt.finishReason !== "stop"
    || usage?.model !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model || usage.currency !== "USD"
    || typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 0
    || typeof attempt.maximumCallCostMicros !== "number" || !Number.isSafeInteger(attempt.maximumCallCostMicros)
    || attempt.maximumCallCostMicros <= 0 || attempt.maximumCallCostMicros > binding.perCallMicros || cost > attempt.maximumCallCostMicros
    || attempt.aggregateCostCapMicros !== binding.aggregateMicros || attempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
    || request?.idempotencyKey !== attemptId || request.schemaName !== "patternwork_ifs_pwrp71_review_candidate_3"
    || request.requestedModel !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model || request.requestedReasoningEffort !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.reasoningEffort
    || request.maxOutputTokens !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.maxOutputTokens
    || !digest(request.systemSha256) || !digest(request.promptSha256) || !digest(attempt.requestFingerprint) || !digest(attempt.wirePayloadSha256)
    || admission?.scope !== "report-dev-experimental-v1" || admission.candidateId !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id
    || admission.candidateSha256 !== candidateSha256 || admission.runBindingSha256 !== bindingSha256
    || result?.ok !== true || result.finishReason !== "stop" || !object(result.output) || !receipt || receipt.verdict !== "revise"
    || attempt.validation !== undefined || attempt.repairDecisions !== undefined
    || event.type !== "review_receipt" || event.attemptId !== attemptId || event.reportType !== "IFS" || event.verdict !== "revise"
    || summary.settledCostMicros !== cost || cost > binding.aggregateMicros) {
    throw new Error("Citation review source contains unsettled, mismatched, or over-cap reviewer records.");
  }
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
    if (typeof usage[key] !== "number" || !Number.isSafeInteger(usage[key]) || usage[key] < 0) throw new Error("Citation review usage must be completely reported.");
  }
  same(request.localSchemaSha256, sha256Canonical(input.reportSource.schemas.reportReview), "Citation review local schema differs from current source.");
  same(request.wireSchemaSha256, sha256Canonical(projectOpenRouterStrictSchemaObject(input.reportSource.schemas.reportReview as JsonObject)), "Citation review wire schema differs from current source.");
  same(result.usage, usage, "Citation review provider usage differs from its journal.");
  same(failure.usages, [usage], "Citation review summary usage differs from its journal.");
  same(receipt.review, result.output, "Citation review receipt differs from its provider output.");
  same(event.receipt, receipt, "Citation review event differs from its journal receipt.");
  assertNoRespondentFullName(receipt.review);
  assertNoRespondentClassification(receipt.review);
  const validatedReview = validatePwrp71Review({ value: receipt.review, artifact: validatedDraft.value, packet: current.packet, source: input.reportSource });
  if (!validatedReview.ok || validatedReview.value.verdict !== "revise") throw new Error("Citation review receipt no longer validates against the exact normalized draft and current evidence.");
  same(receipt, validatedReview.value, "Citation review receipt differs from full current review validation.");
  return {
    previousDraft: validatedDraft.value.draft, previousReview: validatedReview.value.review,
    sourceRunBindingSha256: bindingSha256, sourceDraftSha256: sha256Canonical(validatedDraft.value.draft),
    sourceReviewSha256: validatedReview.value.review_sha256,
    sourceDraftAttemptId: seed.sourceDraftAttemptId, sourceReviewAttemptId: attemptId,
  };
}
