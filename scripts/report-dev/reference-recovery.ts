import { pwrp71WriterSchemaForVersion } from "../../lib/server/reports/pwrp71-reference-schema.ts";
import { readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import type { Pwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1 } from "../../lib/server/openrouter/policy.ts";
import { GPT6_LUNA_BILLING_BASIS_SHA256, GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY } from "../../lib/server/openrouter/qualification-budget.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { assertNoRespondentClassification, assertNoRespondentFullName, assertNoRespondentFullNameInGeneratedDraft, assertNoRespondentFullNameInPwrp71ModelInput } from "../../lib/server/reports/content-boundary.ts";
import { PWRP71_INPUT_GUIDANCE_VERSION, PWRP71_REPAIR_STRATEGY_VERSION, type Pwrp71CitationClosureSeed } from "../../lib/server/reports/generator.ts";
import { restorePwrp71TypedReferences } from "../../lib/server/reports/pwrp71-reference-restoration.ts";
import type { Pwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { validatePwrp71ReportDraft } from "../../lib/server/reports/pwrp71-validation.ts";
import type { AssessmentRecord } from "./assessment.ts";
import { canonical, contentHash } from "./source.ts";
import { developmentModelPolicy, loadPwrp71ContinuationSeed, prepareReport } from "./workflow.ts";

export type { Pwrp71CitationClosureSeed } from "../../lib/server/reports/generator.ts";

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function same(left: unknown, right: unknown, message: string): void {
  if (canonical(left) !== canonical(right)) throw new Error(message);
}

function digest(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function within(root: string, directory: string): boolean {
  const relative = path.relative(root, directory);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Prove both failed bounded writer attempts before deriving the latest draft's one reference correction. */
export async function loadPwrp71ReferenceRecoverySeed(input: {
  sourceRunDirectory: string;
  outputRoot: string;
  assessment: AssessmentRecord;
  questionSource: Pwqe51SourcePackage;
  reportSource: Pwrp71SourcePackage;
}): Promise<Pwrp71CitationClosureSeed> {
  const root = await realpath(input.outputRoot);
  const sourceDirectory = await realpath(input.sourceRunDirectory);
  const runsDirectory = path.join(root, "runs");
  const relative = path.relative(runsDirectory, sourceDirectory);
  if (!within(root, sourceDirectory) || !relative || relative.includes(path.sep) || path.isAbsolute(relative) || relative === "..") {
    throw new Error("Reference recovery source must be one completed run directly inside the selected output root.");
  }
  const readJson = async (file: string): Promise<unknown> => {
    const resolved = await realpath(path.join(sourceDirectory, file));
    if (!within(sourceDirectory, resolved)) throw new Error("Reference recovery source files must remain inside their run directory.");
    return JSON.parse(await readFile(resolved, "utf8")) as unknown;
  };
  const [bindingValue, summaryValue, attemptValue, priorPacket, priorPrepared, eventsValue, outcomeValue] = await Promise.all([
    readJson("binding.json"), readJson("summary.json"), readJson("provider/attempts.json"),
    readJson("IFS/packet.json"), readJson("IFS/prepared.json"), readJson("IFS/events.json"), readJson("IFS/outcome.json"),
  ]);
  const binding = object(bindingValue), summary = object(summaryValue), attemptFile = object(attemptValue);
  if (!binding || !summary || !attemptFile || attemptFile.schemaVersion !== 1 || !Array.isArray(attemptFile.attempts)
    || attemptFile.attempts.length !== 2 || !Array.isArray(eventsValue) || eventsValue.length !== 3) {
    throw new Error("Reference recovery source requires two settled writer attempts and one bounded structural correction decision.");
  }
  const attempts = attemptFile.attempts.map(object), events = eventsValue.map(object);
  const continuation = object(binding.continuation);
  const ifs = object(object(summary.reports)?.IFS), failure = object(ifs?.failure);
  const policy = developmentModelPolicy(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id);
  const candidateSha256 = sha256Canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1);
  const bindingSha256 = contentHash(canonical(binding));
  if (binding.schema !== "patternwork-report-dev-run-2" || binding.mode !== "continue"
    || binding.assessmentSha256 !== input.assessment.contentSha256
    || binding.questionSourceSha256 !== input.questionSource.sourceManifestSha256
    || binding.reportSourceSha256 !== input.reportSource.manifestSha256
    || canonical(binding.types) !== canonical(["IFS"])
    || canonical(binding.modelPolicy) !== canonical(policy)
    || canonical(binding.candidate) !== canonical(REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1)
    || binding.candidateSha256 !== candidateSha256
    || canonical(binding.providerPolicy) !== canonical(GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY)
    || binding.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
    || binding.inputGuidanceVersion !== PWRP71_INPUT_GUIDANCE_VERSION || binding.operationalApproval !== false
    || ![PWRP71_REPAIR_STRATEGY_VERSION,"pwrp71-functional-recomposition-v2"].includes(String(binding.repairStrategyVersion)) || binding.structuralRepairLimit !== 1
    || binding.citationClosure !== undefined || binding.reviewRetry !== undefined
    || typeof binding.aggregateMicros !== "number" || !Number.isSafeInteger(binding.aggregateMicros) || binding.aggregateMicros <= 0 || binding.aggregateMicros > 500_000
    || typeof binding.perCallMicros !== "number" || !Number.isSafeInteger(binding.perCallMicros) || binding.perCallMicros <= 0 || binding.perCallMicros > binding.aggregateMicros
    || !continuation || !digest(continuation.sourceRunBindingSha256) || !digest(continuation.sourceDraftSha256) || !digest(continuation.sourceReviewSha256)
    || typeof continuation.sourceDraftAttemptId !== "string" || typeof continuation.sourceReviewAttemptId !== "string"
    || attempts.some(attempt => !attempt) || events.some(event => !event) || summary.failed !== true || summary.providerAttempts !== 2
    || !Array.isArray(summary.unknownAttempts) || summary.unknownAttempts.length !== 0
    || typeof summary.directory !== "string" || path.resolve(summary.directory) !== sourceDirectory
    || ifs?.stage !== "generation_or_review" || ifs.status !== "failed"
    || failure?.reportType !== "IFS" || failure.code !== "artifact_validation_failed" || failure.retryable !== false
    || summary.narrativeEvaluation !== "not_reached") {
    throw new Error("Reference recovery source is not a bounded, same-assessment IFS continuation rejected only at structural validation.");
  }
  for (const key of Object.keys(binding)) same(summary[key], binding[key], `Reference recovery summary differs from its immutable ${key} binding.`);
  same(Object.keys(summary.reports as object), ["IFS"], "Reference recovery source summary contains unexpected report results.");
  const outcome = object(outcomeValue);
  if (outcome?.ok !== false) throw new Error("Reference recovery source must retain its original failed outcome.");
  same(outcome.failure, failure, "Reference recovery failed outcome differs from its exact summary failure.");

  // The parent must resolve once by its immutable digest; the existing loader proves its complete lineage.
  const parents: string[] = [];
  for (const entry of await readdir(runsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const directory = await realpath(path.join(runsDirectory, entry.name));
      if (!within(runsDirectory, directory)) continue;
      const parentBinding = object(JSON.parse(await readFile(path.join(directory, "binding.json"), "utf8")) as unknown);
      if (parentBinding && contentHash(canonical(parentBinding)) === continuation.sourceRunBindingSha256) parents.push(directory);
    } catch { /* Unrelated or incomplete runs cannot prove parentage. */ }
  }
  if (parents.length !== 1 || parents[0] === sourceDirectory) throw new Error("Reference recovery parent is missing or ambiguous in the selected output root.");
  const parentBinding = object(JSON.parse(await readFile(path.join(parents[0], "binding.json"), "utf8")) as unknown);
  if (!["generate", "review-retry", "continue", "review-closure"].includes(String(parentBinding?.mode))) {
    throw new Error("Reference recovery source must retain an existing validated continuation parent.");
  }
  const parent = await loadPwrp71ContinuationSeed({ ...input, sourceRunDirectory: parents[0], outputRoot: root });
  same(continuation, {
    sourceRunBindingSha256: parent.sourceRunBindingSha256,
    sourceDraftSha256: parent.sourceDraftSha256,
    sourceReviewSha256: parent.sourceReviewSha256,
    sourceDraftAttemptId: parent.sourceDraftAttemptId,
    sourceReviewAttemptId: parent.sourceReviewAttemptId,
  }, "Reference recovery continuation differs from its reconstructed immutable parent.");

  const current = prepareReport(input.assessment, "IFS", input.questionSource, input.reportSource);
  if (!current.request.ok) throw new Error("Current IFS assessment cannot be prepared for reference recovery.");
  assertNoRespondentFullName(current.packet);
  assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
  same(priorPacket, current.packet, "Reference recovery packet differs from current assessment evidence.");
  same(priorPrepared, current.request, "Reference recovery prepared input differs from current report input.");

  const usages: Record<string, unknown>[] = [], rawDrafts: JsonObject[] = [];
  const validations: { code: string; path: string; message: string }[][] = [];
  let totalCost = 0;
  for (let index = 0; index < 2; index++) {
    const attempt = attempts[index]!, event = events[index === 0 ? 0 : 2]!;
    const usage = object(attempt.usage), request = object(attempt.request), admission = object(attempt.candidateAdmission);
    const result = object(attempt.providerResult), rawDraft = object(result?.output), validation = object(attempt.validation);
    const attemptId = `dev:${bindingSha256}:IFS:repair:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-${index + 1}`;
    const cost = usage?.costMicros;
    if (attempt.attemptId !== attemptId || attempt.status !== "completed" || attempt.usageStatus !== "reported"
      || attempt.endpoint !== "https://openrouter.ai/api/v1/chat/completions"
      || usage?.model !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model || usage.currency !== "USD"
      || typeof cost !== "number" || !Number.isSafeInteger(cost) || cost < 0
      || typeof attempt.maximumCallCostMicros !== "number" || !Number.isSafeInteger(attempt.maximumCallCostMicros)
      || attempt.maximumCallCostMicros <= 0 || attempt.maximumCallCostMicros > binding.perCallMicros || cost > attempt.maximumCallCostMicros
      || attempt.aggregateCostCapMicros !== binding.aggregateMicros || attempt.billingBasisSha256 !== GPT6_LUNA_BILLING_BASIS_SHA256
      || attempt.finishReason !== "stop" || request?.idempotencyKey !== attemptId
      || request.schemaName !== "patternwork_ifs_pwrp71_candidate_1"
      || request.requestedModel !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.model
      || request.requestedReasoningEffort !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.reasoningEffort
      || request.maxOutputTokens !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.maxOutputTokens
      || !digest(request.promptSha256) || !digest(attempt.requestFingerprint) || !digest(attempt.wirePayloadSha256)
      || admission?.scope !== "report-dev-experimental-v1" || admission.candidateId !== REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id
      || admission.candidateSha256 !== candidateSha256 || admission.runBindingSha256 !== bindingSha256
      || result?.ok !== true || result.finishReason !== "stop" || !rawDraft
      || validation?.ok !== false || validation.draftSha256 !== undefined || attempt.reviewReceipt !== undefined
      || event.type !== "draft_validation" || event.attemptId !== attemptId || event.reportType !== "IFS" || event.ok !== false || event.draftSha256 !== undefined
      || (index === 1 && attempt.repairDecisions !== undefined) || cost > binding.aggregateMicros) {
      throw new Error("Reference recovery source has unsettled, mismatched, or over-cap provider records.");
    }
    for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
      if (typeof usage[key] !== "number" || !Number.isSafeInteger(usage[key]) || usage[key] < 0) throw new Error("Reference recovery usage must be completely reported.");
    }
    same(request.systemSha256, contentHash(`${current.request.value.system}\n\n${input.reportSource.prompts.repair}`), "Reference recovery writer system differs from current source.");
    same(request.localSchemaSha256, sha256Canonical(pwrp71WriterSchemaForVersion(current.request.value.response_schema,current.packet,binding.referenceSchemaVersion)), "Reference recovery writer schema differs from current source.");
    same(request.wireSchemaSha256, sha256Canonical(projectOpenRouterStrictSchemaObject(pwrp71WriterSchemaForVersion(current.request.value.response_schema,current.packet,binding.referenceSchemaVersion))), "Reference recovery wire schema differs from current source.");
    same(result.usage, usage, "Reference recovery provider result usage differs from its journal.");
    assertNoRespondentFullNameInGeneratedDraft(rawDraft);
    assertNoRespondentClassification(rawDraft);
    const rawValidation = validatePwrp71ReportDraft({ value: rawDraft, reportType: "IFS", snapshotId: String(current.packet.snapshot_id), packet: current.packet, source: input.reportSource });
    if (rawValidation.ok || !rawValidation.issues.length) throw new Error("Reference recovery source must preserve two failed raw structural validations.");
    same(validation.issues, rawValidation.issues, "Reference recovery journal issues differ from full current raw validation.");
    same(event.issues, rawValidation.issues, "Reference recovery event issues differ from full current raw validation.");
    usages.push(usage); rawDrafts.push(rawDraft as JsonObject); validations.push([...rawValidation.issues]); totalCost += cost;
  }
  const decision = events[1]!;
  const firstAttemptId = `dev:${bindingSha256}:IFS:repair:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-1`;
  same(decision, { type: "repair_decision", triggerAttemptId: firstAttemptId, reportType: "IFS", reason: "draft_validation", issueCount: validations[0].length }, "Reference recovery structural correction event differs from the exact first failed validation.");
  if (attempts[0]!.repairDecisions !== undefined) same(attempts[0]!.repairDecisions, [{ reason: "draft_validation", issueCount: validations[0].length }], "Reference recovery journal correction decision differs from its event.");
  same(failure.usages, usages, "Reference recovery summary usage differs from its two writer attempts.");
  same(failure.issues, validations[1], "Reference recovery summary issues differ from the latest raw validation.");
  if (!Number.isSafeInteger(totalCost) || summary.settledCostMicros !== totalCost || totalCost > binding.aggregateMicros) throw new Error("Reference recovery spend does not reconcile to its two settled attempts.");
  const normalized = restorePwrp71TypedReferences({ value: rawDrafts[1], reportType: "IFS", snapshotId: String(current.packet.snapshot_id), packet: current.packet, source: input.reportSource });
  same(normalized.rawValidationIssues, validations[1], "Reference recovery helper raw validation differs from the final source proof.");
  return { rawDraft: rawDrafts[1], sourceRunBindingSha256: bindingSha256, sourceDraftAttemptId: `dev:${bindingSha256}:IFS:repair:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-2`, derivation: normalized.derivation, referenceRestoration: true };
}
