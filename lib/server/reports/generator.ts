import { createHash } from "node:crypto";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import type { ReportEvidencePacketV3_1, SynthesisBundle } from "../../report-contracts/types.ts";
import {
  QUALIFICATION_MODEL_ORDER,
  type ActivatedReportModelPolicy,
  ReportCostCapError,
  assertCallWithinCostCap,
  totalUsage,
} from "../openrouter/policy.ts";
import {
  OpenRouterTransportError,
  type OpenRouterGenerationResult,
  type OpenRouterTransport,
  type OpenRouterUsage,
} from "../openrouter/types.ts";
import { buildGenerationPrompt, buildRepairPrompt, loadPwqe6ReportPrompt, loadReportPrompt } from "./prompts.ts";
import type { GeneratedCanonicalArtifact, ReportGenerationOutcome } from "./types.ts";
import { validateCanonicalArtifact } from "./validation.ts";
import { validatePwqe6ReportDraft } from "./pwqe6-validation.ts";
import type { Pwqe5SourcePackage } from "./pwqe6-source.ts";
import { PWQE51_RELEASE_IDENTITY } from "../../question-engine/pwqe51-source.ts";
import { PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";
import type { Pwrp71PreparedRequest } from "./pwrp71-adapter.ts";
import { validatePwrp71ReportDraft } from "./pwrp71-validation.ts";
import type { Pwrp71ReportArtifact } from "./pwrp71-validation.ts";
import { validatePwrp71Review } from "./pwrp71-review.ts";
import { QualificationAttemptError } from "./qualification/attempt-store.ts";

export interface GenerateCanonicalReportOptions {
  readonly reportType: ReportType;
  readonly input: JsonObject;
  readonly packets: readonly JsonObject[];
  readonly provider: OpenRouterTransport;
  readonly invocationKey: string;
  readonly spentMicros: number;
  readonly costCapMicros: number;
  readonly workspaceRoot?: string;
  readonly synthesisBundle?: SynthesisBundle | JsonObject;
  readonly modelPolicy: ActivatedReportModelPolicy;
  readonly contractVersion?: "v3.1" | "v6" | "v7.1";
  readonly source?: Pwqe5SourcePackage;
  readonly qualificationManifestSha256?: string;
  readonly snapshotId?: string;
  readonly pwrp71?: {
    readonly request: Pwrp71PreparedRequest;
    readonly packet: JsonObject;
    readonly source: Pwrp71SourcePackage;
  };
  /** Optional audit sink for qualification/debug tooling; production behavior does not depend on it. */
  readonly onPwrp71Event?: (event: Pwrp71GenerationEvent) => Promise<void> | void;
}

export type Pwrp71GenerationEvent =
  | { readonly type: "draft_validation"; readonly attemptId: string; readonly reportType: ReportType; readonly ok: boolean; readonly issues: readonly ValidationIssue[]; readonly draftSha256?: string }
  | { readonly type: "review_receipt"; readonly attemptId: string; readonly reportType: ReportType; readonly receipt: JsonObject; readonly verdict: "accept" | "revise" | "invalid_input" }
  | { readonly type: "review_validation"; readonly attemptId: string; readonly reportType: ReportType; readonly ok: false; readonly issues: readonly ValidationIssue[] }
  | { readonly type: "repair_decision"; readonly triggerAttemptId: string; readonly reportType: ReportType; readonly reason: "draft_validation" | "review_revise"; readonly issueCount: number };

function invalidJsonIssue(result: Extract<OpenRouterGenerationResult, { ok: false }>): ValidationIssue {
  return { code: result.kind, path: "$", message: result.message };
}

function failure(
  reportType: ReportType,
  code: string,
  message: string,
  issues: readonly ValidationIssue[],
  usages: readonly OpenRouterUsage[],
  retryable = false,
): ReportGenerationOutcome {
  return { ok: false, failure: { reportType, code, message, issues, usages, retryable } };
}

export async function generateCanonicalReport(options: GenerateCanonicalReportOptions): Promise<ReportGenerationOutcome> {
  const pwrp71 = options.contractVersion === "v7.1" ? options.pwrp71 : undefined;
  if (options.contractVersion === "v7.1") {
    const bindingIssues = validatePwrp71GenerationBinding(options.reportType, pwrp71);
    if (bindingIssues.length) return failure(options.reportType, "pwrp71_generation_binding", "PWRP 7.1 source, packet, and prepared request bindings are required.", bindingIssues, []);
  }
  const promptPackage = options.contractVersion === "v7.1"
    ? undefined
    : options.contractVersion === "v6"
      ? await loadPwqe6ReportPrompt(options.reportType, options.workspaceRoot)
      : await loadReportPrompt(options.reportType, options.workspaceRoot);
  const config = options.modelPolicy[options.reportType];
  const escalationTierIndex = config.escalationTier;
  const usages: OpenRouterUsage[] = [];
  const providerInput = pwrp71?.request.user_data ?? options.input;
  const providerSystem = pwrp71?.request.system ?? promptPackage!.system;
  const providerSchema = pwrp71?.request.response_schema ?? promptPackage!.schema;
  const providerSchemaName = options.contractVersion === "v7.1"
    ? `patternwork_${options.reportType.toLowerCase()}_pwrp71_candidate_1`
    : promptPackage!.schemaName;
  let currentPrompt = buildGenerationPrompt(options.reportType, providerInput);
  let previousOutput: JsonObject | undefined;
  let validationIssues: readonly ValidationIssue[] = [];
  let callOrdinal = 0;
  let lastAttemptId = "";

  const call = async (
    tierIndex: number,
    phase: "initial" | "repair" | "escalation" | "review" | "review_after_repair",
    override?: { readonly system?: string; readonly prompt?: string; readonly schema?: JsonObject; readonly schemaName?: string },
  ): Promise<OpenRouterGenerationResult> => {
    const tier = QUALIFICATION_MODEL_ORDER[tierIndex];
    // PWRP 7.1 is gated by the durable journal using the final wire payload,
    // explicit per-call limit, and aggregate reservation. The character-based
    // estimate is retained only for older contract versions.
    if (options.contractVersion !== "v7.1") {
      const spentMicros = options.spentMicros + usages.reduce((sum, usage) => sum + usage.costMicros, 0);
      assertCallWithinCostCap({ capMicros: options.costCapMicros, spentMicros }, tier, currentPrompt, config.maxOutputTokens);
    }
    const attemptOrdinal = options.contractVersion === "v7.1" ? `:attempt-${++callOrdinal}` : "";
    const request = {
      model: tierIndex === config.pinnedTier ? config.model : config.escalationModel,
      reasoningEffort: tierIndex === config.pinnedTier ? config.reasoningEffort : config.escalationReasoningEffort,
      system: override?.system ?? (options.contractVersion === "v7.1" && (phase === "repair" || phase === "escalation")
        ? `${providerSystem}\n\n${pwrp71!.source.prompts.repair}`
        : providerSystem),
      prompt: override?.prompt ?? currentPrompt,
      schemaName: override?.schemaName ?? providerSchemaName,
      schema: override?.schema ?? providerSchema,
      maxOutputTokens: config.maxOutputTokens,
      idempotencyKey: `${options.invocationKey}:${options.reportType}:${phase}:${tier.name}${attemptOrdinal}`,
    };
    lastAttemptId = request.idempotencyKey;
    const result = await options.provider.generate(request);
    usages.push(result.usage);
    if (options.contractVersion === "v7.1" && result.usage.model !== "offline/mock" && result.usage.model !== request.model) {
      throw new OpenRouterTransportError("protocol", `OpenRouter returned model ${result.usage.model}, but the qualification request pinned ${request.model}.`, { retryable: false });
    }
    if (options.spentMicros + usages.reduce((sum, usage) => sum + usage.costMicros, 0) > options.costCapMicros) {
      throw new ReportCostCapError(options.costCapMicros, options.spentMicros, usages.reduce((sum, usage) => sum + usage.costMicros, 0));
    }
    return result;
  };

  const validate = async (result: OpenRouterGenerationResult, attemptId: string) => {
    if (!result.ok) return { ok: false as const, issues: [invalidJsonIssue(result)] };
    previousOutput = result.output;
    const validation = options.contractVersion === "v7.1"
      ? pwrp71
        ? validatePwrp71ReportDraft({ value: result.output, reportType: options.reportType, snapshotId: pwrp71.request.binding.snapshot_id, packet: pwrp71.packet, source: pwrp71.source })
        : { ok: false as const, issues: [{ code: "pwrp71_generation_binding", path: "$", message: "PWRP 7.1 source, request, and packet bindings are required." }] }
      : options.contractVersion === "v6"
      ? options.source && options.qualificationManifestSha256 && options.snapshotId && options.packets.length === 1
        ? validatePwqe6ReportDraft({
            value: result.output,
            reportType: options.reportType,
            snapshotId: options.snapshotId,
            packet: options.packets[0],
            source: options.source,
            qualificationManifestSha256: options.qualificationManifestSha256,
          })
        : { ok: false as const, issues: [{ code: "pwqe6_generation_binding", path: "$", message: "PWQE6 source, activation, snapshot, and packet bindings are required." }] }
      : await validateCanonicalArtifact(
          options.reportType,
          result.output,
          options.packets as ReportEvidencePacketV3_1[],
          options.workspaceRoot,
          options.synthesisBundle as SynthesisBundle | undefined,
        );
    await options.onPwrp71Event?.({
      type: "draft_validation",
      attemptId,
      reportType: options.reportType,
      ok: validation.ok,
      issues: validation.ok ? [] : validation.issues,
      ...(validation.ok ? { draftSha256: hashCanonical(validation.value.draft) } : {}),
    });
    return validation.ok
      ? { ok: true as const, artifact: validation.value }
      : { ok: false as const, issues: validation.issues };
  };

  const reviewPwrp71Draft = async (
    artifact: Pwrp71ReportArtifact,
    phase: "review" | "review_after_repair",
  ): Promise<{ readonly ok: true; readonly verdict: "accept" | "revise" | "invalid_input"; readonly review: JsonObject } | { readonly ok: false; readonly outcome: ReportGenerationOutcome }> => {
    if (!pwrp71) return { ok: false, outcome: failure(options.reportType, "pwrp71_review_binding", "PWRP 7.1 review source and packet are missing.", [], usages) };
    const packet = pwrp71.packet as Record<string, unknown>;
    const reviewInput = {
      draft: artifact.draft,
      source: providerInput,
      reviewed_draft_sha256: hashCanonical(artifact.draft),
      reviewed_evidence_sha256: String(packet.content_sha256),
    } as JsonObject;
    const reviewSystem = [
      "REVIEW TASK: The writer contracts below are evaluation criteria, not an instruction to write a report. Return only the review schema.",
      providerSystem,
      pwrp71.source.prompts.reviewer,
    ].join("\n\n");
    const reviewResult = await call(config.pinnedTier, phase, {
      system: reviewSystem,
      prompt: buildGenerationPrompt(options.reportType, reviewInput),
      schemaName: `patternwork_${options.reportType.toLowerCase()}_pwrp71_review_candidate_1`,
      schema: pwrp71.source.schemas.reportReview as JsonObject,
    });
    if (reviewResult.finishReason !== "stop") {
      return { ok: false, outcome: failure(options.reportType, "incomplete_review", `PWRP 7.1 review is incomplete (finish reason: ${reviewResult.finishReason ?? "missing"}).`, [{ code: "review_finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 review requires provider finishReason 'stop'." }], usages) };
    }
    if (!reviewResult.ok) {
      return { ok: false, outcome: failure(options.reportType, "review_provider_failed", reviewResult.message, [invalidJsonIssue(reviewResult)], usages) };
    }
    const validatedReview = validatePwrp71Review({ value: reviewResult.output, artifact, packet: pwrp71.packet, source: pwrp71.source });
    if (!validatedReview.ok) {
      await options.onPwrp71Event?.({ type: "review_validation", attemptId: lastAttemptId, reportType: options.reportType, ok: false, issues: validatedReview.issues });
      return { ok: false, outcome: failure(options.reportType, "review_validation_failed", "PWRP 7.1 reviewer output failed schema or draft/evidence binding validation.", validatedReview.issues, usages) };
    }
    await options.onPwrp71Event?.({ type: "review_receipt", attemptId: lastAttemptId, reportType: options.reportType, receipt: validatedReview.value as unknown as JsonObject, verdict: validatedReview.value.verdict });
    return { ok: true, verdict: validatedReview.value.verdict, review: validatedReview.value.review };
  };

  const reviewAndAcceptPwrp71 = async (artifact: Pwrp71ReportArtifact): Promise<ReportGenerationOutcome> => {
    const firstReview = await reviewPwrp71Draft(artifact, "review");
    if (!firstReview.ok) return firstReview.outcome;
    if (firstReview.verdict === "accept") return { ok: true, value: { reportType: options.reportType, artifact, usage: totalUsage(usages) } };
    if (firstReview.verdict !== "revise") return failure(options.reportType, "review_invalid_input", "PWRP 7.1 reviewer marked the source invalid.", [], usages);

    const reviewIssues = Array.isArray(firstReview.review.issues) ? firstReview.review.issues as JsonObject[] : [];
    await options.onPwrp71Event?.({ type: "repair_decision", triggerAttemptId: lastAttemptId, reportType: options.reportType, reason: "review_revise", issueCount: reviewIssues.length });
    const feedback = reviewIssues.map((item) => ({
      code: String(item.category ?? "review_issue"),
      path: `$.review.issues.${String(item.id ?? "unknown")}`,
      message: `${String(item.reason ?? "Reviewer requested revision.")} ${String(item.requested_change ?? "")}`.trim(),
    }));
    currentPrompt = buildPwrp71RepairPrompt(options.reportType, providerInput, feedback, artifact.draft);
    const repairedResult = await call(config.pinnedTier, "repair");
    if (repairedResult.finishReason !== "stop") {
      return failure(options.reportType, "incomplete_generation", `PWRP 7.1 repair is incomplete (finish reason: ${repairedResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
    }
    if (!repairedResult.ok) return failure(options.reportType, "repair_provider_failed", repairedResult.message, [invalidJsonIssue(repairedResult)], usages);
    const replacement = validatePwrp71ReportDraft({ value: repairedResult.output, reportType: options.reportType, snapshotId: pwrp71!.request.binding.snapshot_id, packet: pwrp71!.packet, source: pwrp71!.source });
    if (!replacement.ok) return failure(options.reportType, "artifact_validation_failed", "PWRP 7.1 repaired draft failed structural validation.", replacement.issues, usages);

    // A replacement has a new draft digest and always requires a fresh review.
    const secondReview = await reviewPwrp71Draft(replacement.value, "review_after_repair");
    if (!secondReview.ok) return secondReview.outcome;
    if (secondReview.verdict === "accept") return { ok: true, value: { reportType: options.reportType, artifact: replacement.value, usage: totalUsage(usages) } };
    if (secondReview.verdict === "invalid_input") return failure(options.reportType, "review_invalid_input", "PWRP 7.1 reviewer marked the repaired source invalid.", [], usages);
    return failure(options.reportType, "review_not_accepted", "PWRP 7.1 replacement draft did not receive a fresh accept review.", [], usages);
  };

  try {
    const firstResult = await call(config.pinnedTier, "initial");
    if (options.contractVersion === "v7.1" && firstResult.finishReason !== "stop") {
      return failure(options.reportType, "incomplete_generation", `PWRP 7.1 provider response is not complete (finish reason: ${firstResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
    }
    let checked = await validate(firstResult, lastAttemptId);
    if (checked.ok) {
      if (options.contractVersion === "v7.1") return await reviewAndAcceptPwrp71(checked.artifact as Pwrp71ReportArtifact);
      return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
    }
    validationIssues = checked.issues;

    if (firstResult.ok || firstResult.kind === "invalid_json") {
      currentPrompt = options.contractVersion === "v7.1"
        ? buildPwrp71RepairPrompt(options.reportType, providerInput, validationIssues, previousOutput)
        : buildRepairPrompt(options.reportType, providerInput, validationIssues, previousOutput);
      if (options.contractVersion === "v7.1") await options.onPwrp71Event?.({ type: "repair_decision", triggerAttemptId: lastAttemptId, reportType: options.reportType, reason: "draft_validation", issueCount: validationIssues.length });
      const repairedResult = await call(config.pinnedTier, "repair");
      if (options.contractVersion === "v7.1" && repairedResult.finishReason !== "stop") {
        return failure(options.reportType, "incomplete_generation", `PWRP 7.1 provider response is not complete (finish reason: ${repairedResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
      }
      checked = await validate(repairedResult, lastAttemptId);
      if (checked.ok) {
        if (options.contractVersion === "v7.1") return await reviewAndAcceptPwrp71(checked.artifact as Pwrp71ReportArtifact);
        return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
      }
      validationIssues = checked.issues;
    }

    currentPrompt = options.contractVersion === "v7.1"
      ? buildPwrp71RepairPrompt(options.reportType, providerInput, validationIssues, previousOutput)
      : buildRepairPrompt(options.reportType, providerInput, validationIssues, previousOutput);
    const escalatedResult = await call(escalationTierIndex, "escalation");
    if (options.contractVersion === "v7.1" && escalatedResult.finishReason !== "stop") {
      return failure(options.reportType, "incomplete_generation", `PWRP 7.1 provider response is not complete (finish reason: ${escalatedResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
    }
    checked = await validate(escalatedResult, lastAttemptId);
    if (checked.ok) {
      if (options.contractVersion === "v7.1") return await reviewAndAcceptPwrp71(checked.artifact as Pwrp71ReportArtifact);
      return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
    }
    return failure(options.reportType, "artifact_validation_failed", "Canonical artifact failed after one repair and one-tier escalation.", checked.issues, usages);
  } catch (error) {
    if (error instanceof ReportCostCapError) return failure(options.reportType, "cost_cap_exceeded", error.message, [], usages);
    if (error instanceof QualificationAttemptError && error.code === "budget_blocked") return failure(options.reportType, "cost_cap_exceeded", error.message, [], usages);
    if (error instanceof OpenRouterTransportError) return failure(options.reportType, error.kind, error.message, [], usages, error.retryable);
    return failure(options.reportType, "generation_error", error instanceof Error ? error.message : String(error), [], usages);
  }
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(",")}}`;
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashCanonical(value: unknown): string {
  return hashText(canonical(value));
}

function buildPwrp71RepairPrompt(
  reportType: ReportType,
  input: JsonObject,
  issues: readonly ValidationIssue[],
  previousOutput?: JsonObject,
): string {
  return [
    buildGenerationPrompt(reportType, input),
    "The prior output was rejected. Return a complete replacement draft and correct the deterministic validation issues below.",
    JSON.stringify({
      validator_feedback: issues.slice(0, 50).map(({ code, path, message }) => ({ code, path, message })),
      rejected_output: previousOutput ?? null,
    }),
  ].join("\n\n");
}

function validatePwrp71GenerationBinding(reportType: ReportType, input: GenerateCanonicalReportOptions["pwrp71"]): ValidationIssue[] {
  if (!input) return [{ code: "pwrp71_request_missing", path: "$.pwrp71", message: "Prepared PWRP 7.1 request and packet are required." }];
  const { request, packet, source } = input;
  const issues: ValidationIssue[] = [];
  const packetValue = packet as Record<string, unknown>;
  const userData = request.user_data as Record<string, unknown>;
  const expectedPrompt = `${source.prompts.shared}\n\n${source.prompts[reportType === "MAP" ? "mapping" : reportType === "IFS" ? "ifs" : reportType === "PV" ? "state" : reportType === "ATT" ? "attachment" : "synthesis"]}`;
  const { content_sha256: contentDigest, ...contents } = packetValue;
  const canonicalPacketDigest = createHash("sha256").update(canonical(contents), "utf8").digest("hex");
  if (source.manifestSha256 !== PWRP71_RELEASE_MANIFEST_SHA256
    || source.manifest.report_release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || source.policy.release !== PWQE51_RELEASE_IDENTITY.reportRelease
    || source.policy.compatible_question_release !== PWQE51_RELEASE_IDENTITY.questionRelease
    || source.policy.compatible_router_source_sha256 !== PWQE51_RELEASE_IDENTITY.sourceSha256) {
    issues.push({ code: "pwrp71_source_binding", path: "$.pwrp71.source", message: "Loaded PWRP 7.1 source is not bound to PWQE 5.1." });
  }
  if (request.binding.report_release !== source.policy.release || request.binding.report_type !== reportType
    || request.binding.snapshot_id !== packetValue.snapshot_id || request.binding.evidence_sha256 !== contentDigest
    || packetValue.release_id !== PWQE51_RELEASE_IDENTITY.questionRelease
    || packetValue.content_sha256 !== canonicalPacketDigest) {
    issues.push({ code: "pwrp71_packet_binding", path: "$.pwrp71.request.binding", message: "Prepared request binding does not match the current packet and report release." });
  }
  if (userData.report_release !== source.policy.release || userData.report_type !== reportType
    || userData.snapshot_id !== packetValue.snapshot_id || userData.evidence_sha256 !== contentDigest
    || userData.release_id !== packetValue.release_id) {
    issues.push({ code: "pwrp71_user_data_binding", path: "$.pwrp71.request.user_data", message: "Provider user data does not match the packet and report binding." });
  }
  if (request.system !== expectedPrompt || request.binding.prompt_sha256 !== hashText(expectedPrompt)
    || canonical(request.response_schema) !== canonical(source.schemas.reportDraft)) {
    issues.push({ code: "pwrp71_request_source", path: "$.pwrp71.request", message: "Prepared provider prompt or response schema does not match the pinned PWRP 7.1 source." });
  }
  return issues;
}
