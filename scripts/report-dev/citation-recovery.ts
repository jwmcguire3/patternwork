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
import { PWRP71_INPUT_GUIDANCE_VERSION, type Pwrp71CitationClosureSeed } from "../../lib/server/reports/generator.ts";
import { derivePwrp71Citations } from "../../lib/server/reports/pwrp71-citation-derivation.ts";
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

/** Recover provenance only; a normalized draft still requires a fresh independent review. */
export async function loadPwrp71CitationClosureSeed(input: {
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
    throw new Error("Citation closure source must be one completed run directly inside the selected output root.");
  }
  const readJson = async (file: string): Promise<unknown> => {
    const resolved = await realpath(path.join(sourceDirectory, file));
    if (!within(sourceDirectory, resolved)) throw new Error("Citation closure source files must remain inside their run directory.");
    return JSON.parse(await readFile(resolved, "utf8")) as unknown;
  };
  const [bindingValue, summaryValue, attemptValue, priorPacket, priorPrepared, eventsValue] = await Promise.all([
    readJson("binding.json"), readJson("summary.json"), readJson("provider/attempts.json"),
    readJson("IFS/packet.json"), readJson("IFS/prepared.json"), readJson("IFS/events.json"),
  ]);
  const binding = object(bindingValue), summary = object(summaryValue), attemptFile = object(attemptValue);
  if (binding?.mode === "continue" && Array.isArray(attemptFile?.attempts) && attemptFile.attempts.length === 2) {
    const { loadPwrp71ReferenceRecoverySeed } = await import("./reference-recovery.ts");
    return loadPwrp71ReferenceRecoverySeed(input);
  }
  if (!binding || !summary || !attemptFile || attemptFile.schemaVersion !== 1 || !Array.isArray(attemptFile.attempts)
    || attemptFile.attempts.length !== 1 || !Array.isArray(eventsValue) || eventsValue.length !== 1) {
    throw new Error("Citation closure source requires one completed writer attempt and one failed validation event.");
  }
  const attempt = object(attemptFile.attempts[0]), event = object(eventsValue[0]);
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
    || typeof binding.aggregateMicros !== "number" || !Number.isSafeInteger(binding.aggregateMicros) || binding.aggregateMicros <= 0 || binding.aggregateMicros > 500_000
    || typeof binding.perCallMicros !== "number" || !Number.isSafeInteger(binding.perCallMicros) || binding.perCallMicros <= 0 || binding.perCallMicros > binding.aggregateMicros
    || !continuation || !digest(continuation.sourceRunBindingSha256) || !digest(continuation.sourceDraftSha256) || !digest(continuation.sourceReviewSha256)
    || typeof continuation.sourceDraftAttemptId !== "string" || typeof continuation.sourceReviewAttemptId !== "string"
    || !attempt || !event || summary.failed !== true || summary.providerAttempts !== 1
    || !Array.isArray(summary.unknownAttempts) || summary.unknownAttempts.length !== 0
    || typeof summary.directory !== "string" || path.resolve(summary.directory) !== sourceDirectory
    || ifs?.stage !== "generation_or_review" || ifs.status !== "failed"
    || failure?.reportType !== "IFS" || failure.code !== "artifact_validation_failed" || failure.retryable !== false
    || summary.narrativeEvaluation !== "not_reached") {
    throw new Error("Citation closure source is not a bounded, same-assessment IFS continuation rejected only at structural validation.");
  }
  for (const key of Object.keys(binding)) same(summary[key], binding[key], `Citation closure summary differs from its immutable ${key} binding.`);
  same(Object.keys(summary.reports as object), ["IFS"], "Citation closure source summary contains unexpected report results.");

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
  if (parents.length !== 1 || parents[0] === sourceDirectory) throw new Error("Citation closure parent is missing or ambiguous in the selected output root.");
  const parentBinding = object(JSON.parse(await readFile(path.join(parents[0], "binding.json"), "utf8")) as unknown);
  if (!["generate", "review-retry", "continue"].includes(String(parentBinding?.mode))) {
    throw new Error("Citation closure parent cannot be another citation closure run.");
  }
  const parent = await loadPwrp71ContinuationSeed({ ...input, sourceRunDirectory: parents[0], outputRoot: root });
  same(continuation, {
    sourceRunBindingSha256: parent.sourceRunBindingSha256,
    sourceDraftSha256: parent.sourceDraftSha256,
    sourceReviewSha256: parent.sourceReviewSha256,
    sourceDraftAttemptId: parent.sourceDraftAttemptId,
    sourceReviewAttemptId: parent.sourceReviewAttemptId,
  }, "Citation closure continuation differs from its reconstructed immutable parent.");

  const current = prepareReport(input.assessment, "IFS", input.questionSource, input.reportSource);
  if (!current.request.ok) throw new Error("Current IFS assessment cannot be prepared for citation closure.");
  assertNoRespondentFullName(current.packet);
  assertNoRespondentFullNameInPwrp71ModelInput(current.request.value.user_data);
  same(priorPacket, current.packet, "Citation closure packet differs from current assessment evidence.");
  same(priorPrepared, current.request, "Citation closure prepared input differs from current report input.");

  const usage = object(attempt.usage), request = object(attempt.request), admission = object(attempt.candidateAdmission);
  const result = object(attempt.providerResult), rawDraft = object(result?.output), validation = object(attempt.validation);
  const attemptId = `dev:${bindingSha256}:IFS:repair:${REPORT_DEV_EXPERIMENTAL_CANDIDATE_V1.id}:attempt-1`;
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
    || summary.settledCostMicros !== cost || cost > binding.aggregateMicros) {
    throw new Error("Citation closure source has unsettled, mismatched, or over-cap provider records.");
  }
  for (const key of ["inputTokens", "outputTokens", "reasoningTokens", "totalTokens"]) {
    if (typeof usage[key] !== "number" || !Number.isSafeInteger(usage[key]) || usage[key] < 0) throw new Error("Citation closure usage must be completely reported.");
  }
  same(request.systemSha256, contentHash(`${current.request.value.system}\n\n${input.reportSource.prompts.repair}`), "Citation closure writer system differs from current source.");
  same(request.localSchemaSha256, sha256Canonical(pwrp71WriterSchemaForVersion(current.request.value.response_schema,current.packet,binding.referenceSchemaVersion)), "Citation closure writer schema differs from current source.");
  same(request.wireSchemaSha256, sha256Canonical(projectOpenRouterStrictSchemaObject(pwrp71WriterSchemaForVersion(current.request.value.response_schema,current.packet,binding.referenceSchemaVersion))), "Citation closure wire schema differs from current source.");
  same(result.usage, usage, "Citation closure provider result usage differs from its journal.");
  same(failure.usages, [usage], "Citation closure summary usage differs from its journal.");
  assertNoRespondentFullNameInGeneratedDraft(rawDraft);
  assertNoRespondentClassification(rawDraft);
  const rawValidation = validatePwrp71ReportDraft({ value: rawDraft, reportType: "IFS", snapshotId: String(current.packet.snapshot_id), packet: current.packet, source: input.reportSource });
  if (rawValidation.ok || !rawValidation.issues.length
    || !(rawValidation.issues.every(issue => issue.code === "claim_leaf_evidence")
      || (rawValidation.issues.length === 1 && rawValidation.issues[0].code === "current_observation"))) {
    throw new Error("Citation closure source must fail the unchanged validator only for leaf inheritance or one prior observation citation.");
  }
  same(validation.issues, rawValidation.issues, "Citation closure journal issues differ from full current raw validation.");
  same(event.issues, rawValidation.issues, "Citation closure event issues differ from full current raw validation.");
  same(failure.issues, rawValidation.issues, "Citation closure summary issues differ from full current raw validation.");
  const previousDraft = rawValidation.issues[0].code === "current_observation" ? parent.previousDraft : undefined;
  const normalized = derivePwrp71Citations({ value: rawDraft as JsonObject, ...(previousDraft ? { previousDraft } : {}), reportType: "IFS", snapshotId: String(current.packet.snapshot_id), packet: current.packet, source: input.reportSource });
  same(normalized.rawValidationIssues, rawValidation.issues, "Citation closure helper raw validation differs from the source proof.");
  return { rawDraft: rawDraft as JsonObject, sourceRunBindingSha256: bindingSha256, sourceDraftAttemptId: attemptId, derivation: normalized.derivation, ...(previousDraft ? { previousDraft } : {}) };
}
