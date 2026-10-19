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
  type OpenRouterGenerationRequest,
  type OpenRouterGenerationResult,
  type OpenRouterTransport,
  type OpenRouterUsage,
  type ProviderPrivacyIdentityContext,
} from "../openrouter/types.ts";
import { buildGenerationPrompt, buildRepairPrompt, loadPwqe6ReportPrompt, loadReportPrompt } from "./prompts.ts";
import type { GeneratedCanonicalArtifact, ReportGenerationOutcome } from "./types.ts";
import { validateCanonicalArtifact } from "./validation.ts";
import { validatePwqe6ReportDraft } from "./pwqe6-validation.ts";
import type { Pwqe5SourcePackage } from "./pwqe6-source.ts";
import { PWQE51_RELEASE_IDENTITY, loadPwqe51SourcePackage, type Pwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import { PWRP71_RELEASE_MANIFEST_SHA256, type Pwrp71SourcePackage } from "./pwrp71-source.ts";
import type { Pwrp71PreparedRequest } from "./pwrp71-adapter.ts";
import { validatePwrp71ReportDraft } from "./pwrp71-validation.ts";
import type { Pwrp71ReportArtifact } from "./pwrp71-validation.ts";
import { validatePwrp71Review } from "./pwrp71-review.ts";
import { assertNoRespondentClassification, assertNoRespondentFullName, assertNoRespondentFullNameInGeneratedDraft } from "./content-boundary.ts";
import { QualificationAttemptError } from "./qualification/attempt-store.ts";
import { derivePwrp71Citations, type Pwrp71CitationDerivation } from "./pwrp71-citation-derivation.ts";
import { constrainPwrp71ReferenceSchema } from "./pwrp71-reference-schema.ts";
import { buildPwrp71AuthoredQuestionContext } from "./pwrp71-question-context.ts";

/** Runtime input guidance; recorded separately from the pinned report-source release. */
export const PWRP71_INPUT_GUIDANCE_VERSION = "pwrp71-current-draft-feedback-v2";
/** Separately versioned construction strategy; historical source guidance remains loadable. */
export const PWRP71_REPAIR_STRATEGY_VERSION = "pwrp71-functional-recomposition-v3";
/** Budgeted structural/coverage correction after a fresh generation's semantic revision. */
export const PWRP71_GENERATION_REPAIR_VERSION = "pwrp71-review-replacement-correction-v1";
export const PWRP71_SCOPE_GUIDANCE_VERSION = "pwrp71-episode-context-guidance-v1";
export const PWRP71_SCOPE_CONSTRUCTION_GUIDANCE = {
  version: PWRP71_SCOPE_GUIDANCE_VERSION,
  scope_authority: "Derive scope contexts from packet episodes[].context, also listed in reference_inventory. Generic authored-question context, multiple occurrence IDs, and multiple episode families do not establish distinct sampled contexts. across_sampled_contexts requires at least two different episode-context values or two cited person referents. Multiple occurrences from one episode-context can remain occurrence scope when the assertion is bounded to those occurrences. Preserve valid scope levels while correcting unrelated claims.",
  evidence_scope_repair: "For evidence_scope feedback, trace each cited observation through reference_inventory to its actual occurrence and context. Correct the assertion, rationale, reader prose, citations and scope together; split conflated experiences where necessary. Adding an occurrence ID alone does not fix a false claim that requesting help and receiving help were one situation. Keep distinct episodes and their meanings intact.",
} as const;

export interface Pwrp71CitationClosureSeed {
  readonly rawDraft: JsonObject;
  readonly sourceRunBindingSha256: string;
  readonly sourceDraftAttemptId: string;
  readonly derivation: Pwrp71CitationDerivation;
  readonly previousDraft?: JsonObject;
  readonly referenceRestoration?: true;
}

export interface Pwrp71ContinuationSeed {
  readonly previousDraft: JsonObject;
  readonly previousReview: JsonObject;
  readonly sourceRunBindingSha256: string;
  readonly sourceDraftSha256: string;
  readonly sourceReviewSha256: string;
  readonly sourceDraftAttemptId: string;
  readonly sourceReviewAttemptId: string;
}

export interface Pwrp71ReviewRetrySeed {
  readonly previousDraft: JsonObject;
  readonly sourceRunBindingSha256: string;
  readonly sourceDraftSha256: string;
  readonly sourceDraftAttemptId: string;
  readonly sourceReviewAttemptId: string;
  readonly validationIssues: readonly Pick<ValidationIssue, "code" | "path">[];
}

export interface GenerateCanonicalReportOptions {
  readonly reportType: ReportType;
  readonly input: JsonObject;
  readonly packets: readonly JsonObject[];
  readonly provider: OpenRouterTransport;
  /** Local-only identity values used by the egress guard; never included in request data. */
  readonly privacyIdentityContext?: ProviderPrivacyIdentityContext;
  readonly invocationKey: string;
  readonly spentMicros: number;
  readonly costCapMicros: number;
  readonly workspaceRoot?: string;
  readonly synthesisBundle?: SynthesisBundle | JsonObject;
  readonly modelPolicy: ActivatedReportModelPolicy;
  readonly contractVersion?: "v3.1" | "v6" | "v7.1";
  /** Diagnostic-only request label for correlation IDs; it never selects a model or effort setting. */
  readonly requestIdentityLabel?: string;
  /** Fixed candidate policy: preserve the failed result and stop before another call. */
  readonly stopOnUnsuccessfulProviderResponse?: boolean;
  /** Synchronous privacy guard invoked on every final provider request. */
  readonly beforeProviderRequest?: (input: {
    readonly request: OpenRouterGenerationRequest;
    readonly phase: "initial" | "repair" | "escalation" | "review" | "review_after_repair" | "review_retry";
    readonly assessmentData: JsonObject;
    readonly previousOutput?: JsonObject;
  }) => void;
  readonly source?: Pwqe5SourcePackage;
  readonly qualificationManifestSha256?: string;
  readonly snapshotId?: string;
  readonly pwrp71?: {
    readonly request: Pwrp71PreparedRequest;
    readonly packet: JsonObject;
    readonly source: Pwrp71SourcePackage;
    readonly questionSource?: Pwqe51SourcePackage;
  };
  /** One bounded continuation from a validated, previously rejected PWRP 7.1 IFS draft. */
  readonly continuation?: Pwrp71ContinuationSeed;
  /** Explicitly budgeted one-time structural correction after the semantic replacement. */
  readonly continuationStructuralRepair?: boolean;
  /** One explicitly budgeted correction of a structurally invalid review-requested replacement. */
  readonly reviewReplacementStructuralRepair?: boolean;
  /** One review-only retry from a source-bound, structurally validated IFS draft. */
  readonly reviewRetry?: Pwrp71ReviewRetrySeed;
  /** A new review of a separately derived citation-closed draft; raw provider output stays immutable. */
  readonly citationClosure?: Pwrp71CitationClosureSeed;
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

class StoppedProviderResponse extends Error {
  constructor(readonly result: Extract<OpenRouterGenerationResult, { ok: false }>) {
    super(result.message);
    this.name = "StoppedProviderResponse";
  }
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
  let providerInput = pwrp71?.request.user_data ?? options.input;
  if (pwrp71) {
    try {
      const questionSource = pwrp71.questionSource ?? await loadPwqe51SourcePackage(options.workspaceRoot);
      providerInput = {
        ...providerInput,
        authored_question_context: buildPwrp71AuthoredQuestionContext(pwrp71.packet, questionSource),
        ...pwrp71ReferenceInventory(pwrp71.packet),
        scope_construction_guidance: PWRP71_SCOPE_CONSTRUCTION_GUIDANCE,
      };
    } catch {
      return failure(options.reportType, "pwrp71_question_context_binding",
        "Authored question context could not be resolved against the pinned evidence source.",
        [{ code: "pwrp71_question_context_binding", path: "$.pwrp71.packet.observations", message: "Question, variant, and selected option context must resolve before provider dispatch." }], []);
    }
  }
  const providerSystem = pwrp71?.request.system ?? promptPackage!.system;
  const providerSchema = pwrp71?.request.response_schema ?? promptPackage!.schema;
  const providerSchemaName = options.contractVersion === "v7.1"
    ? `patternwork_${options.reportType.toLowerCase()}_pwrp71_candidate_1`
    : promptPackage!.schemaName;
  const promptContract = options.contractVersion === "v7.1" ? "v7.1" : "legacy";
  let currentPrompt = buildGenerationPrompt(options.reportType, providerInput, promptContract);
  let previousOutput: JsonObject | undefined;
  let validationIssues: readonly ValidationIssue[] = [];
  let callOrdinal = 0;
  let lastAttemptId = "";

  const call = async (
    tierIndex: number,
    phase: "initial" | "repair" | "escalation" | "review" | "review_after_repair" | "review_retry",
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
      schema: override?.schema ?? (pwrp71 ? constrainPwrp71ReferenceSchema(providerSchema, pwrp71.packet) : providerSchema),
      maxOutputTokens: config.maxOutputTokens,
      idempotencyKey: `${options.invocationKey}:${options.reportType}:${phase}:${options.requestIdentityLabel ?? tier.name}${attemptOrdinal}`,
    };
    lastAttemptId = request.idempotencyKey;
    options.beforeProviderRequest?.({ request, phase, assessmentData: providerInput, ...(previousOutput ? { previousOutput } : {}) });
    const result = await options.provider.generate(request, options.privacyIdentityContext);
    usages.push(result.usage);
    if (options.contractVersion === "v7.1" && result.usage.model !== "offline/mock" && result.usage.model !== request.model) {
      throw new OpenRouterTransportError("protocol", `OpenRouter returned model ${result.usage.model}, but the qualification request pinned ${request.model}.`, { retryable: false });
    }
    if (options.spentMicros + usages.reduce((sum, usage) => sum + usage.costMicros, 0) > options.costCapMicros) {
      throw new ReportCostCapError(options.costCapMicros, options.spentMicros, usages.reduce((sum, usage) => sum + usage.costMicros, 0));
    }
    if (options.stopOnUnsuccessfulProviderResponse && !result.ok) throw new StoppedProviderResponse(result);
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
    phase: "review" | "review_after_repair" | "review_retry",
    validationIssues: readonly Pick<ValidationIssue, "code" | "path">[] = [],
  ): Promise<{ readonly ok: true; readonly verdict: "accept" | "revise" | "invalid_input"; readonly review: JsonObject } | { readonly ok: false; readonly outcome: ReportGenerationOutcome }> => {
    if (!pwrp71) return { ok: false, outcome: failure(options.reportType, "pwrp71_review_binding", "PWRP 7.1 review source and packet are missing.", [], usages) };
    const packet = pwrp71.packet as Record<string, unknown>;
    if (!Array.isArray(packet.observations) || packet.observations.length === 0) {
      return { ok: false, outcome: failure(options.reportType, "pwrp71_review_inventory", "PWRP 7.1 review requires a nonempty current observation inventory.", [{ code: "review_observation_inventory", path: "$.packet.observations", message: "Current observation IDs must be available before review." }], usages) };
    }
    const currentObservationIds: string[] = [];
    for (const row of packet.observations) {
      const id = typeof row === "object" && row !== null && !Array.isArray(row)
        ? (row as Record<string, unknown>).id
        : undefined;
      if (typeof id !== "string" || id.length === 0) {
        return { ok: false, outcome: failure(options.reportType, "pwrp71_review_inventory", "PWRP 7.1 review requires valid current observation IDs.", [{ code: "review_observation_inventory", path: "$.packet.observations", message: "Every current packet observation must have a nonempty ID." }], usages) };
      }
      currentObservationIds.push(id);
    }
    if (new Set(currentObservationIds).size !== currentObservationIds.length) {
      return { ok: false, outcome: failure(options.reportType, "pwrp71_review_inventory", "PWRP 7.1 review requires unique current observation IDs.", [{ code: "review_observation_inventory", path: "$.packet.observations", message: "Current packet observation IDs must be unique." }], usages) };
    }
    const reviewInput = {
      draft: artifact.draft,
      source: providerInput,
      current_observation_ids: currentObservationIds,
      current_observation_count: currentObservationIds.length,
      current_draft_references: pwrp71DraftReferences(artifact.draft),
      ...(options.citationClosure ? { citation_derivation: options.citationClosure.derivation as unknown as JsonObject } : {}),
      reviewed_draft_sha256: hashCanonical(artifact.draft),
      reviewed_evidence_sha256: String(packet.content_sha256),
    } as JsonObject;
    const reviewSystem = [
      "REVIEW TASK: The writer contracts below are evaluation criteria, not an instruction to write a report. Return only the review schema.",
      providerSystem,
      pwrp71.source.prompts.reviewer,
      "CURRENT EVIDENCE INVENTORY: The review input's current_observation_ids is the authoritative ordered list of current packet observations, and current_observation_count is its length. Partition that exact list across evidence_coverage groups so every listed ID appears exactly once and no other ID appears. Before returning, compare the union and count against the supplied list. Apply dispositions using the evidence and report; do not omit an observation to avoid evaluating it.",
      "CURRENT DRAFT REFERENCES: current_draft_references is mechanically derived from this exact draft. Check any allegation about a claim's citations or a registry label's literal use against that index and the full draft. An observation absent from the citations can still be a material omission; assess its content separately rather than claiming it is cited. Literal label matches establish text presence, not semantic adequacy.",
      ...(options.citationClosure ? ["REFERENCE DERIVATION: citation_derivation records required inheritance from declared dependencies, restoration from an unchanged prior claim, or restoration of one malformed typed reference with a unique single-character current-source match. The typed recipe restricts occurrence matches to the claim's cited evidence. Only the recorded reference array strings changed; no assertion, scope level, role, relationship or prose changed. This establishes bookkeeping lineage, not semantic support or prior acceptance. Independently assess the entire exact draft, including every dependency, interpretation, scope, omission and readable statement against the actual source. Inherited or restored references must not be presumed sufficient or treated as a direct assertion of every detail."] : []),
      ...(phase === "review_retry" ? [
        "BOUNDED REVIEW RETRY: Reassess this same draft and evidence from scratch. A previous review response failed only the listed consistency checks; that failure is not evidence that the draft passes. The prior issues are supplied as code and path only.",
        `Prior validator issues: ${validationIssues.map((issue) => `${issue.code} at ${issue.path}`).join("; ")}`,
        "If any evidence_coverage item has disposition missing, include a material_omission issue whose evidence_ids cover every ID in that item, set quality_assessment.semantic_completeness.status to revise, and set the top-level verdict to revise. If you conclude no material omission exists, do not label any item missing. Account for each observation exactly once and use only current IDs. Do not change your substantive evaluation merely to satisfy a field; return accept only if the report independently meets every acceptance criterion.",
      ] : []),
    ].join("\n\n");
    const reviewResult = await call(config.pinnedTier, phase, {
      system: reviewSystem,
      prompt: buildGenerationPrompt(options.reportType, reviewInput, "v7.1"),
      schemaName: `patternwork_${options.reportType.toLowerCase()}_pwrp71_review_candidate_3`,
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
    const feedback = pwrp71ReviewFeedback(firstReview.review);
    currentPrompt = buildPwrp71RepairPrompt(options.reportType, providerInput, feedback, artifact.draft, firstReview.review);
    const repairedResult = await call(config.pinnedTier, "repair");
    if (repairedResult.finishReason !== "stop") {
      return failure(options.reportType, "incomplete_generation", `PWRP 7.1 repair is incomplete (finish reason: ${repairedResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
    }
    if (!repairedResult.ok) return failure(options.reportType, "repair_provider_failed", repairedResult.message, [invalidJsonIssue(repairedResult)], usages);
    let replacement = await validate(repairedResult, lastAttemptId);
    if (!replacement.ok && options.reviewReplacementStructuralRepair === true) {
      const replacementIssues = replacement.issues;
      await options.onPwrp71Event?.({ type: "repair_decision", triggerAttemptId: lastAttemptId, reportType: options.reportType, reason: "draft_validation", issueCount: replacementIssues.length });
      currentPrompt = [
        buildPwrp71RepairPrompt(options.reportType, providerInput, replacementIssues, previousOutput, firstReview.review, true),
        buildGenerationPrompt(options.reportType, pwrp71ReferenceInventory(pwrp71!.packet), "v7.1"),
        "BOUNDED GRAPH AND COVERAGE CORRECTION: Correct this exact latest replacement against the validator paths, original evidence and supplied semantic review. Preserve supported facts and the reviewed corrections. A declared dependency must fit the assertion and scope: do not blindly import leaves from a different situation merely to satisfy inheritance. Remove an inappropriate dependency and retain a directly grounded contrast, or genuinely support a bounded comparison with the complete appropriate evidence and scope. For an unrepresented claim, check whether its meaning is actually in reader prose; restore any missing supported content, not only a claim ID. Audit every section's current claim_ids against what that section actually says, especially after claim IDs changed. Copy source IDs verbatim. Return one complete replacement. This is the only additional correction; full validation and a separate fresh semantic review remain mandatory. A correct claim graph does not establish adequate narrative quality.",
      ].join("\n\n");
      const correctedResult = await call(config.pinnedTier, "repair");
      if (correctedResult.finishReason !== "stop") return failure(options.reportType, "incomplete_generation", "The bounded graph and coverage correction did not finish completely.", [], usages);
      if (!correctedResult.ok) return failure(options.reportType, "repair_provider_failed", correctedResult.message, [invalidJsonIssue(correctedResult)], usages);
      replacement = await validate(correctedResult, lastAttemptId);
    }
    if (!replacement.ok) return failure(options.reportType, "artifact_validation_failed", "PWRP 7.1 repaired draft failed structural validation.", replacement.issues, usages);

    // A replacement has a new draft digest and always requires a fresh review.
    const secondReview = await reviewPwrp71Draft(replacement.artifact as Pwrp71ReportArtifact, "review_after_repair");
    if (!secondReview.ok) return secondReview.outcome;
    if (secondReview.verdict === "accept") return { ok: true, value: { reportType: options.reportType, artifact: replacement.artifact, usage: totalUsage(usages) } };
    if (secondReview.verdict === "invalid_input") return failure(options.reportType, "review_invalid_input", "PWRP 7.1 reviewer marked the repaired source invalid.", [], usages);
    return failure(options.reportType, "review_not_accepted", "PWRP 7.1 replacement draft did not receive a fresh accept review.", [], usages);
  };

  const continueFromReview = async (seed: Pwrp71ContinuationSeed): Promise<ReportGenerationOutcome> => {
    if (options.contractVersion !== "v7.1" || options.reportType !== "IFS" || !pwrp71) {
      return failure(options.reportType, "continuation_binding", "A bounded continuation is available only for a bound PWRP 7.1 IFS report.", [], usages);
    }
    if (![seed.sourceRunBindingSha256, seed.sourceDraftSha256, seed.sourceReviewSha256].every((value) => /^[a-f0-9]{64}$/u.test(value))
      || !seed.sourceDraftAttemptId || !seed.sourceReviewAttemptId) {
      return failure(options.reportType, "continuation_binding", "Continuation provenance is incomplete.", [], usages);
    }
    try {
      assertNoRespondentFullNameInGeneratedDraft(seed.previousDraft);
      assertNoRespondentFullName(seed.previousReview);
      assertNoRespondentClassification(seed.previousReview);
    } catch {
      return failure(options.reportType, "continuation_privacy", "The saved names-free draft or review does not pass the current privacy boundary.", [], usages);
    }
    const prior = validatePwrp71ReportDraft({
      value: seed.previousDraft,
      reportType: options.reportType,
      snapshotId: pwrp71.request.binding.snapshot_id,
      packet: pwrp71.packet,
      source: pwrp71.source,
    });
    if (!prior.ok || hashCanonical(prior.value.draft) !== seed.sourceDraftSha256) {
      return failure(options.reportType, "continuation_draft_binding", "The saved draft is not structurally valid for the current assessment and source.", prior.ok ? [] : prior.issues, usages);
    }
    const priorReview = validatePwrp71Review({ value: seed.previousReview, artifact: prior.value, packet: pwrp71.packet, source: pwrp71.source });
    if (!priorReview.ok || priorReview.value.verdict !== "revise" || priorReview.value.review_sha256 !== seed.sourceReviewSha256) {
      return failure(options.reportType, "continuation_review_binding", "The saved review is not a current, bound revision request for this draft.", priorReview.ok ? [] : priorReview.issues, usages);
    }

    previousOutput = prior.value.draft;
    currentPrompt = [
      buildPwrp71RepairPrompt(options.reportType, providerInput, pwrp71ReviewFeedback(priorReview.value.review), prior.value.draft, priorReview.value.review),
      buildGenerationPrompt(options.reportType, pwrp71ReferenceInventory(pwrp71.packet), "v7.1"),
      "REFERENCE AND SCOPE CHECK: Copy evidence IDs verbatim from reference_inventory and use its occurrence/context mapping. Multiple occurrence IDs alone do not establish across_sampled_contexts: that level requires at least two different authored context values or two cited person referents. Preserve valid existing claim scopes; do not broaden an ordinary occurrence claim merely because it contains multiple episodes from one context. Keep reported comparisons bounded without adding recurrence constructs.",
      "READER TEXT: Keep claim IDs and evidence IDs in their structured fields. Do not append parenthetical internal IDs to section text, headings, title or reflection questions.",
      ...(!jsonRows(priorReview.value.review.issues).some(issue => issue.category === "voice") ? [
        "LOCAL REPAIR: This review does not request a new narrative structure. Preserve the current section progression, all unaffected prose and supported claim content, references and scopes. Change only the reviewed assertions/classifications and wording that depends on them. When a reported relational or practical strategy lacks evidence of a protective purpose, retain its actual actions/aims while removing protective constructs and using an appropriate descriptive registry category or removing that label. Preserve other independently supported protective interpretations. Do not rewrite adequate material or introduce new omissions.",
      ] : []),
      "For each reviewer request, trace the original observation to the exact claim wording, evidence and scope references, reader-facing prose, and any title claim. Keep claims within the cited scope, preserve relevant counterevidence, and omit sequencing or causal links the evidence does not establish.",
      "Resolve every supplied review issue using the original evidence and exact current draft. Reconcile factual premises with current_draft_references; preserve corrections already made. For a material omission, represent any distinct supported action or qualifying context in a claim and the readable account rather than only dropping its citation. Introduce and consistently use retained registry labels in the prose, or remove unused entries while preserving their supported content.",
      "Develop the IFS portrait around the supported protective jobs, their different aims, practical conditions, consequences, and conditions of flexibility. Use a concise evidence-bound synthesis and selected examples within that account. Keep occurrence boundaries in the claims and state narrative limits where they change meaning. Support cross-occurrence synthesis with appropriately bounded claims; preserve distinct parts and situations without inventing relationships or a universal part.",
      ...(jsonRows(priorReview.value.review.issues).some(issue => issue.category === "voice") ? [
        `FUNCTIONAL RECOMPOSITION (${PWRP71_REPAIR_STRATEGY_VERSION}): The previous episode-shaped draft anchors the writing in an itinerary. Before returning the replacement JSON, internally group the source evidence by supported function, consequential condition, conflict, consequence, or flexibility. Build the claim support for that grouping first, then compose a new section progression from the grouping rather than editing the old sections in place. Return only the required report schema, not your planning notes.`,
        "Where the source explicitly reports the same condition across sampled contexts, a bounded reported claim may describe those reports with scope.level across_sampled_contexts, the exact supported occurrence/person IDs and direct_report support. Keep its wording about the sampled reports. Do not infer a recurring protector, common motive, cause, temporal relationship, universal trait or independently distinct events. Do not add the recurrence construct or recurring_within_context scope without the contract's required distinctness evidence. Different practical explanations remain attached to their situations.",
        "Lead each section and paragraph with the supported function or condition and why its distinction matters to the portrait; embed recalled situations as evidence and examples within it. Integrate the supported contrast between preparation, immediate relief, needs, repair and available choice only where present. An introductory synthesis followed by a scene itinerary does not resolve this feedback. Preserve every material detail already represented, but consolidate shared limitations once where they affect meaning instead of repeating an uncertainty disclaimer after each scene. Local exceptions that change interpretation must remain explicit. Do not manufacture links to make a smoother story.",
        "Audit every dependency after restructuring: a broad reported premise may contain details unrelated to a narrower interpretation. Split that premise or remove the inappropriate dependency, keeping the separately reported action in its own supported claim and readable account. Retain all leaves of every dependency you do declare, field for field. Copy all current observation IDs exactly from the source; do not reconstruct or shorten them. Preserve correctly scoped assertions while introducing only the support needed for the reviewed synthesis.",
        "PARAGRAPH CONSTRUCTION PLAN: Realize the following comparisons only where their source findings exist. First directly contrast anticipatory preparation, conflict-related delay, immediate relief and practical waiting by their different aims; embed the scenes within that comparison. A repeated reported contextual condition may organize a bounded account of available choice across the sampled situations, while retaining their different practical explanations. It does not by itself establish a common cause, motive, coercion, universal trait, or shared part. Next compare channels of expression: knowing a meaning, wanting to speak, accessing words, wanting or not wanting to reply, and explicit competing aims are different findings, not one event. Then contrast relief sought with effects actually reported, including later-stage activity/no-change, harsh self-response and ordinary absorbing activity without a reported relief purpose. Finally organize asking/receiving help, refusal concern, exposed need and relational direction, preserving distinct repair outcomes, contextual counterexamples and ordinary preferences where they qualify the account. This is a paragraph-level operation, not a section quota: do not resume one complete scene per paragraph after an introductory comparison. Omit a plan element absent from the source; do not invent it.",
        "PRESERVATION CHECK: Keep every supported material detail already represented in both claims and reader text. Restore all reviewer-listed missing distinctions. In any reported speech-access account, retain separately knowing what was meant, wanting to speak, first noticed difficulty answering, and the later timing of activity/no-change where those are actually reported. These do not establish order among initial actions or a causal effect of later activity. Keep the existing bounded comparison claim, counterexamples, ordinary preferences, names and scopes unless the review requires a specific correction. Add only minimal directly grounded comparison support if needed; avoid importing unrelated leaves through broad premises. Title findings as coexisting findings and conditions, not a common cause the evidence leaves open.",
      ] : []),
    ].join("\n\n");
    const repairedResult = await call(config.pinnedTier, "repair");
    if (repairedResult.finishReason !== "stop") {
      return failure(options.reportType, "incomplete_generation", `PWRP 7.1 continuation is incomplete (finish reason: ${repairedResult.finishReason ?? "missing"}).`, [{ code: "finish_reason", path: "$.finish_reason", message: "A PWRP 7.1 response requires provider finishReason 'stop'." }], usages);
    }
    if (!repairedResult.ok) return failure(options.reportType, "continuation_provider_failed", repairedResult.message, [invalidJsonIssue(repairedResult)], usages);
    let replacement = await validate(repairedResult, lastAttemptId);
    if (!replacement.ok) {
      if (!options.continuationStructuralRepair) return failure(options.reportType, "artifact_validation_failed", "PWRP 7.1 continuation draft failed structural validation.", replacement.issues, usages);
      const firstIssues = replacement.issues;
      await options.onPwrp71Event?.({ type: "repair_decision", triggerAttemptId: lastAttemptId, reportType: options.reportType, reason: "draft_validation", issueCount: firstIssues.length });
      currentPrompt = [
        buildPwrp71RepairPrompt(options.reportType, providerInput, firstIssues, previousOutput, priorReview.value.review),
        buildGenerationPrompt(options.reportType, pwrp71ReferenceInventory(pwrp71.packet), "v7.1"),
        "BOUNDED STRUCTURAL CORRECTION: Correct this exact latest replacement using the validator paths and original source. Preserve its supported functional organization and material facts; repair only what the errors require. Copy every observation ID verbatim from reference_inventory, verifying its content and occurrence. across_sampled_contexts requires two different authored context values or two cited referents, not merely two occurrence IDs. Use the narrow supported scope for a within-context account without inventing distinctness or recurrence; split claims when necessary. Retain every declared premise's evidence and counterevidence, or remove an inappropriate dependency and ground the assertion directly. Remove parenthetical internal claim/evidence IDs from reader text, retaining structured section claim_ids. Return a complete schema-valid replacement. This is the only structural correction attempt; a separate fresh reviewer still judges the entire result.",
      ].join("\n\n");
      const structuralResult = await call(config.pinnedTier, "repair");
      if (structuralResult.finishReason !== "stop") return failure(options.reportType, "incomplete_generation", "The structural correction did not finish completely.", [], usages);
      if (!structuralResult.ok) return failure(options.reportType, "continuation_provider_failed", structuralResult.message, [invalidJsonIssue(structuralResult)], usages);
      replacement = await validate(structuralResult, lastAttemptId);
      if (!replacement.ok) return failure(options.reportType, "artifact_validation_failed", "The bounded structural correction failed current validation.", replacement.issues, usages);
    }

    const freshReview = await reviewPwrp71Draft(replacement.artifact as Pwrp71ReportArtifact, "review_after_repair");
    if (!freshReview.ok) return freshReview.outcome;
    if (freshReview.verdict === "accept") return { ok: true, value: { reportType: options.reportType, artifact: replacement.artifact, usage: totalUsage(usages) } };
    if (freshReview.verdict === "invalid_input") return failure(options.reportType, "review_invalid_input", "PWRP 7.1 reviewer marked the continued source invalid.", [], usages);
    return failure(options.reportType, "review_not_accepted", "PWRP 7.1 continuation did not receive a fresh accept review.", [], usages);
  };

  const retryReviewFromValidatedDraft = async (seed: Pwrp71ReviewRetrySeed): Promise<ReportGenerationOutcome> => {
    if (options.contractVersion !== "v7.1" || options.reportType !== "IFS" || !pwrp71) {
      return failure(options.reportType, "review_retry_binding", "A bounded review retry is available only for a bound PWRP 7.1 IFS report.", [], usages);
    }
    if (![seed.sourceRunBindingSha256, seed.sourceDraftSha256].every((value) => /^[a-f0-9]{64}$/u.test(value))
      || !seed.sourceDraftAttemptId || !seed.sourceReviewAttemptId || seed.validationIssues.length === 0
      || seed.validationIssues.some((issue) => issue.code !== "review_coverage_omission" || !/^\$\.evidence_coverage\[\d+\]$/u.test(issue.path))) {
      return failure(options.reportType, "review_retry_binding", "Review retry provenance or sanitized issue codes are invalid.", [], usages);
    }
    try {
      assertNoRespondentFullNameInGeneratedDraft(seed.previousDraft);
    } catch {
      return failure(options.reportType, "review_retry_privacy", "The saved names-free draft does not pass the current privacy boundary.", [], usages);
    }
    const prior = validatePwrp71ReportDraft({
      value: seed.previousDraft,
      reportType: options.reportType,
      snapshotId: pwrp71.request.binding.snapshot_id,
      packet: pwrp71.packet,
      source: pwrp71.source,
    });
    if (!prior.ok || hashCanonical(prior.value.draft) !== seed.sourceDraftSha256) {
      return failure(options.reportType, "review_retry_draft_binding", "The saved draft is not structurally valid for the current assessment and source.", prior.ok ? [] : prior.issues, usages);
    }
    previousOutput = prior.value.draft;
    const freshReview = await reviewPwrp71Draft(prior.value, "review_retry", seed.validationIssues);
    if (!freshReview.ok) return freshReview.outcome;
    if (freshReview.verdict === "accept") {
      return { ok: true, value: { reportType: options.reportType, artifact: prior.value, usage: totalUsage(usages) } };
    }
    if (freshReview.verdict === "invalid_input") {
      return failure(options.reportType, "review_invalid_input", "The fresh reviewer marked the source invalid.", [], usages);
    }
    return failure(options.reportType, "review_retry_not_accepted", "The fresh review did not accept the validated draft; no report was released.", [
      { code: "review_not_accepted", path: "$.verdict", message: "Only a fresh validated accept review can release this development report." },
    ], usages);
  };

  try {
    if ([options.continuation, options.reviewRetry, options.citationClosure].filter(Boolean).length > 1) {
      return failure(options.reportType, "review_retry_binding", "Recovery seeds cannot be combined.", [], usages);
    }
    if (options.citationClosure) {
      const seed = options.citationClosure;
      if (!pwrp71 || options.contractVersion !== "v7.1" || options.reportType !== "IFS"
        || !/^[a-f0-9]{64}$/u.test(seed.sourceRunBindingSha256) || !seed.sourceDraftAttemptId) {
        return failure(options.reportType, "citation_closure_binding", "Citation recovery requires a bound IFS source attempt.", [], usages);
      }
      assertNoRespondentFullNameInGeneratedDraft(seed.rawDraft);
      const closed = derivePwrp71Citations({ value: seed.rawDraft, previousDraft: seed.previousDraft, referenceRestoration: seed.referenceRestoration, reportType: options.reportType, snapshotId: pwrp71.request.binding.snapshot_id, packet: pwrp71.packet, source: pwrp71.source });
      if (hashCanonical(closed.derivation) !== hashCanonical(seed.derivation)) {
        return failure(options.reportType, "citation_closure_binding", "Citation derivation differs from the current exact source.", [], usages);
      }
      previousOutput = closed.artifact.draft;
      const reviewed = await reviewPwrp71Draft(closed.artifact, "review");
      if (!reviewed.ok) return reviewed.outcome;
      if (reviewed.verdict === "accept") return { ok: true, value: { reportType: options.reportType, artifact: closed.artifact, usage: totalUsage(usages) } };
      return failure(options.reportType, reviewed.verdict === "revise" ? "review_not_accepted" : "review_invalid_input", "The derived draft requires a fresh accepted review before release.", [], usages);
    }
    if (options.continuation) return await continueFromReview(options.continuation);
    if (options.reviewRetry) return await retryReviewFromValidatedDraft(options.reviewRetry);
    const firstResult = await call(config.pinnedTier, "initial");
    if (!firstResult.ok && firstResult.kind === "provider_error") {
      return failure(options.reportType, "provider_error", firstResult.message, [invalidJsonIssue(firstResult)], usages);
    }
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
    if (error instanceof StoppedProviderResponse) return failure(options.reportType, error.result.kind, error.message, [invalidJsonIssue(error.result)], usages);
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

function jsonRows(value: unknown): JsonObject[] {
  return Array.isArray(value) ? value.filter((row): row is JsonObject => typeof row === "object" && row !== null && !Array.isArray(row)) : [];
}

function stringRows(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((row): row is string => typeof row === "string") : [];
}

/** Citation/label facts only; this index makes no materiality or support judgment. */
function pwrp71ReferenceInventory(packet: JsonObject): JsonObject {
  return { reference_inventory: {
    observations: jsonRows(packet.observations).map(row => ({ id: row.id, occurrence_id: row.occurrence_id, person_id: row.person_id ?? null })),
    occurrences: jsonRows(packet.episodes).map(row => ({ id: row.id, context: row.context })),
  } } as JsonObject;
}

function pwrp71DraftReferences(draft: JsonObject): JsonObject {
  const sections = jsonRows(draft.sections);
  const normalize = (value: string) => value.normalize("NFKC").toLocaleLowerCase("en-US");
  return {
    claims: jsonRows(draft.claims).filter((claim) => typeof claim.id === "string").map((claim) => ({
      claim_id: claim.id,
      evidence_ids: stringRows(claim.evidence_ids),
      counterevidence_ids: stringRows(claim.counterevidence_ids),
      section_ids: sections.filter((section) => stringRows(section.claim_ids).includes(String(claim.id))).map((section) => String(section.id)),
    })),
    named_entities: jsonRows(draft.name_registry).filter((entity) => typeof entity.name_id === "string").map((entity) => ({
      name_id: entity.name_id,
      supporting_claim_ids: stringRows(entity.supporting_claim_ids),
      section_ids_with_literal_label: typeof entity.name === "string" && entity.name.length > 0
        ? sections.filter((section) => normalize(`${String(section.heading ?? "")}\n${String(section.text ?? "")}`).includes(normalize(String(entity.name)))).map((section) => String(section.id))
        : [],
    })),
  } as JsonObject;
}

function pwrp71ReviewFeedback(review: JsonObject): ValidationIssue[] {
  return jsonRows(review.issues).map((item) => ({
    code: String(item.category ?? "review_issue"),
    path: `$.review.issues.${String(item.id ?? "unknown")}`,
    message: `${String(item.reason ?? "Reviewer requested revision.")} ${String(item.requested_change ?? "")}`.trim(),
  }));
}

function buildPwrp71RepairPrompt(
  reportType: ReportType, input: JsonObject, issues: readonly ValidationIssue[],
  previousOutput?: JsonObject, review?: JsonObject, includeAllIssues = false,
): string {
  const feedback = {
    validator_feedback: (includeAllIssues ? issues : issues.slice(0, 50)).map(({ code, path, message }) => ({ code, path, message })),
    rejected_output: previousOutput ?? null,
    semantic_review: review ?? null,
    ...(previousOutput ? { current_draft_references: pwrp71DraftReferences(previousOutput) } : {}),
  } as unknown as JsonObject;
  return [
    buildGenerationPrompt(reportType, input, "v7.1"),
    "Return a complete replacement. Re-derive supported assertions from the original evidence; restore material omissions and remove only unsupported assertions.",
    buildGenerationPrompt(reportType, feedback, "v7.1"),
  ].join("\n\n");
}

function validatePwrp71GenerationBinding(reportType: ReportType, input: GenerateCanonicalReportOptions["pwrp71"]): ValidationIssue[] {
  if (!input) return [{ code: "pwrp71_request_missing", path: "$.pwrp71", message: "Prepared PWRP 7.1 request and packet are required." }];
  const { request, packet, source } = input;
  const issues: ValidationIssue[] = [];
  const packetValue = packet as Record<string, unknown>;
  const userData = request.user_data as Record<string, unknown>;
  const expectedPrompt = [source.prompts.shared, source.constructGuide, source.prompts[reportType === "MAP" ? "mapping" : reportType === "IFS" ? "ifs" : reportType === "PV" ? "state" : reportType === "ATT" ? "attachment" : "synthesis"]].join("\n\n");
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
