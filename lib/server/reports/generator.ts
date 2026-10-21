import { editorialSignals } from './pwrp71-portrait-quality.ts';
import { runFormulationPipeline, analystSource, providerFormulation, attachFormulation, type FormulationEnvelope } from "./pwrp71-formulation-core.ts";
import { analysisDigest, createStageChecker, stageSystem, layerKey } from "./pwrp71-formulation-integration.ts";
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
import { QualificationAttemptError } from "./qualification/attempt-store.ts";
import { type Pwrp71CitationDerivation } from "./pwrp71-citation-derivation.ts";
import { constrainPwrp71ReferenceSchema } from "./pwrp71-reference-schema.ts";
import { buildPwrp71AuthoredQuestionContext } from "./pwrp71-question-context.ts";

/** Runtime input guidance; recorded separately from the pinned report-source release. */
export const PWRP71_INPUT_GUIDANCE_VERSION = "pwrp71-formulation-input-v1";
/** Separately versioned construction strategy; historical source guidance remains loadable. */
export const PWRP71_REPAIR_STRATEGY_VERSION = "pwrp71-stage-routed-repair-v1";
/** Budgeted structural/coverage correction after a fresh generation's semantic revision. */
export const PWRP71_GENERATION_REPAIR_VERSION = "pwrp71-formulation-generation-v1";
export const PWRP71_SCOPE_GUIDANCE_VERSION = "pwrp71-episode-context-guidance-v2";
export const PWRP71_SCOPE_CONSTRUCTION_GUIDANCE = {
  version: PWRP71_SCOPE_GUIDANCE_VERSION,
  scope_authority: "Use packet episodes[].context, also listed in reference_inventory, for the structural scope classification. across_sampled_contexts requires at least two different episode-context values or two cited person referents; generic question context, episode families, or occurrence count alone do not meet that field's requirement. An occurrence-scoped claim can compare multiple cited occurrences within one context. These reference rules do not require a psychological formulation to prove a common part, cause, or actual sequence. Assess its warrant under the shared contract and keep its assertion at the supported scope.",
  evidence_scope_repair: "For evidence_scope feedback, trace the cited observations to their actual occurrences and contexts. Correct references when the assertion is already accurate; correct or split the assertion and its dependent prose when it conflates experiences. Preserve valid scopes and unaffected prose. Distinct experiences may still support a theme, tension, or relationship through reasoned formulation. Keep routine reference limits internal; surface a qualification only when it materially changes that meaning.",
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
  /** Reuse the exact source/analysis-bound interpretation for a new prose attempt. */
  readonly formulationSeed?: FormulationEnvelope;
  /** Saved after structural validation, before narrative writing; not semantic approval. */
  readonly onPwrp71Formulation?: (formulation: FormulationEnvelope) => Promise<void> | void;
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
  | { readonly type: "formulation_saved"; readonly attemptId: string; readonly reportType: ReportType; readonly formulationSha256: string; readonly analysisSha256: string }
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
  let activeFormulation: FormulationEnvelope | undefined;
  let validationIssues: readonly ValidationIssue[] = [];
  let callOrdinal = 0;
  let lastAttemptId = "";

  const call = async (
    tierIndex: number,
    phase: "initial" | "repair" | "escalation" | "review" | "review_after_repair" | "review_retry",
    override?: { readonly system?: string; readonly prompt?: string; readonly schema?: JsonObject; readonly schemaName?: string; readonly assessmentData?: JsonObject },
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
    options.beforeProviderRequest?.({ request, phase, assessmentData: override?.assessmentData ?? providerInput, ...(!override?.assessmentData && previousOutput ? { previousOutput } : {}) });
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
      editorial_signals: editorialSignals(artifact.draft).map(signal => ({ ...signal })),
      source: analystSource(providerInput),
      ...(activeFormulation ? { formulation: providerFormulation(activeFormulation.formulation), reviewed_formulation_sha256: activeFormulation.content_sha256 } : {}),
      current_observation_ids: currentObservationIds,
      current_observation_count: currentObservationIds.length,
      current_draft_references: pwrp71DraftReferences(artifact.draft),
      ...(options.citationClosure ? { citation_derivation: options.citationClosure.derivation as unknown as JsonObject } : {}),
      reviewed_draft_sha256: hashCanonical(artifact.draft),
      reviewed_evidence_sha256: String(packet.content_sha256),
    } as JsonObject;
    const reviewSystem = [
      "REVIEW TASK: The writer contracts below are evaluation criteria, not an instruction to write a report. Return only the review schema.",
      pwrp71.source.prompts.shared,
      pwrp71.source.constructGuide,
      pwrp71.source.prompts[layerKey(options.reportType)],
      pwrp71.source.prompts.voiceCompanion,
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
      schemaName: `patternwork_${options.reportType.toLowerCase()}_pwrp71_review_candidate_5`,
      schema: pwrp71.source.schemas.reportReview as JsonObject,
      assessmentData: reviewInput,
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

  try {
    if (pwrp71) {
      if (options.continuation || options.reviewRetry || options.citationClosure) {
        return failure(options.reportType, "legacy_recovery_requires_migration", "Legacy combined-writer recovery is not valid under formulation-first. Start a fresh generation or reuse a bound formulation.", [], usages);
      }
      const sourceView = analystSource(providerInput);
      const checker = createStageChecker(pwrp71.source, pwrp71.packet);
      const binding = {
        report_type: options.reportType, report_release: pwrp71.source.policy.release,
        release_id: String(pwrp71.packet.release_id), snapshot_id: pwrp71.request.binding.snapshot_id,
        evidence_sha256: pwrp71.request.binding.evidence_sha256,
        analysis_sha256: analysisDigest(pwrp71.source, options.reportType, providerInput.authored_question_context, PWRP71_SCOPE_CONSTRUCTION_GUIDANCE, sourceView.accepted_layer_graphs ?? null),
      };
      const staged = await runFormulationPipeline<Pwrp71ReportArtifact>({
        binding, manifest: pwrp71.source.manifestSha256, source: sourceView,
        ...(options.formulationSeed ? { seed: options.formulationSeed } : {}),
        check: checker,
        call: async (stage, data, repair) => {
          const rawSchema = stage === "formulation" ? pwrp71.source.schemas.reportFormulation : pwrp71.source.schemas.reportNarrative;
          const response = await call(config.pinnedTier, repair ? "repair" : "initial", {
            system: stageSystem(pwrp71.source, options.reportType, stage, repair),
            prompt: buildGenerationPrompt(options.reportType, data as JsonObject, "v7.1"),
            schema: stage === "formulation" ? constrainPwrp71ReferenceSchema(rawSchema as JsonObject, pwrp71.packet) : rawSchema as JsonObject,
            schemaName: `patternwork_${options.reportType.toLowerCase()}_pwrp71_${stage}_${stage === "formulation" ? 3 : 2}`,
            assessmentData: data as JsonObject,
          });
          return response.ok ? { ok: true, output: response.output, finishReason: response.finishReason }
            : { ok: false, message: response.message, finishReason: response.finishReason };
        },
        saveFormulation: async envelope => {
          activeFormulation = envelope;
          await options.onPwrp71Formulation?.(envelope);
          await options.onPwrp71Event?.({ type: "formulation_saved", attemptId: lastAttemptId, reportType: options.reportType,
            formulationSha256: envelope.content_sha256, analysisSha256: envelope.binding.analysis_sha256 });
        },
        validateDraft: async (draft, envelope) => {
          activeFormulation = envelope;
          const result = validatePwrp71ReportDraft({ value: draft, reportType: options.reportType,
            snapshotId: pwrp71.request.binding.snapshot_id, packet: pwrp71.packet, source: pwrp71.source });
          await options.onPwrp71Event?.({ type: "draft_validation", attemptId: lastAttemptId, reportType: options.reportType,
            ok: result.ok, issues: result.ok ? [] : result.issues, ...(result.ok ? { draftSha256: hashCanonical(draft) } : {}) });
          if (!result.ok) return { ok: false, issues: [...result.issues] };
          const artifact = attachFormulation(result.value, envelope);
          return { ok: true, artifact };
        },
        review: async (artifact, envelope, revised) => {
          activeFormulation = envelope;
          const r = await reviewPwrp71Draft(artifact, revised ? "review_after_repair" : "review");
          if (!r.ok) return { ok: false, issues: [{ code: "review_failed", path: "$", message: "Independent review was incomplete or failed structural validation; inspect the journal." }] };
          return { ok: true, verdict: r.verdict, review: r.review };
        },
      });
      if (!staged.ok) return failure(options.reportType, staged.code, "Formulation-first reporting stopped without release; inspect the saved stage artifacts and journal.", staged.issues, usages);
      return { ok: true, value: { reportType: options.reportType, artifact: staged.artifact, usage: totalUsage(usages) } };
    }
    // Older report contracts retain their original repair/escalation behavior.
    // PWRP 7.1 returned above and cannot enter the retired combined-writer path.
    if (options.continuation || options.reviewRetry || options.citationClosure) {
      return failure(options.reportType, "legacy_recovery_requires_migration", "Historical PWRP recovery seeds cannot be dispatched through an older contract.", [], usages);
    }
    const firstResult = await call(config.pinnedTier, "initial");
    if (!firstResult.ok && firstResult.kind === "provider_error") {
      return failure(options.reportType, "provider_error", firstResult.message, [invalidJsonIssue(firstResult)], usages);
    }
    let checked = await validate(firstResult, lastAttemptId);
    if (checked.ok) return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
    validationIssues = checked.issues;
    if (firstResult.ok || firstResult.kind === "invalid_json") {
      currentPrompt = buildRepairPrompt(options.reportType, providerInput, validationIssues, previousOutput);
      checked = await validate(await call(config.pinnedTier, "repair"), lastAttemptId);
      if (checked.ok) return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
      validationIssues = checked.issues;
    }
    currentPrompt = buildRepairPrompt(options.reportType, providerInput, validationIssues, previousOutput);
    checked = await validate(await call(escalationTierIndex, "escalation"), lastAttemptId);
    if (checked.ok) return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
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

function validatePwrp71GenerationBinding(reportType: ReportType, input: GenerateCanonicalReportOptions["pwrp71"]): ValidationIssue[] {
  if (!input) return [{ code: "pwrp71_request_missing", path: "$.pwrp71", message: "Prepared PWRP 7.1 request and packet are required." }];
  const { request, packet, source } = input;
  const issues: ValidationIssue[] = [];
  const packetValue = packet as Record<string, unknown>;
  const userData = request.user_data as Record<string, unknown>;
  const expectedPrompt = stageSystem(source, reportType, "formulation");
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
    || canonical(request.response_schema) !== canonical(source.schemas.reportFormulation)) {
    issues.push({ code: "pwrp71_request_source", path: "$.pwrp71.request", message: "Prepared provider prompt or response schema does not match the pinned PWRP 7.1 source." });
  }
  return issues;
}
