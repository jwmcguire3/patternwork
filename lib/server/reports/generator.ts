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
  readonly contractVersion?: "v3.1" | "v6";
  readonly source?: Pwqe5SourcePackage;
  readonly qualificationManifestSha256?: string;
  readonly snapshotId?: string;
}

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
  const promptPackage = options.contractVersion === "v6"
    ? await loadPwqe6ReportPrompt(options.reportType, options.workspaceRoot)
    : await loadReportPrompt(options.reportType, options.workspaceRoot);
  const config = options.modelPolicy[options.reportType];
  const escalationTierIndex = config.escalationTier;
  const usages: OpenRouterUsage[] = [];
  let currentPrompt = buildGenerationPrompt(options.reportType, options.input);
  let previousOutput: JsonObject | undefined;
  let validationIssues: readonly ValidationIssue[] = [];

  const call = async (tierIndex: number, phase: "initial" | "repair" | "escalation"): Promise<OpenRouterGenerationResult> => {
    const tier = QUALIFICATION_MODEL_ORDER[tierIndex];
    const spentMicros = options.spentMicros + usages.reduce((sum, usage) => sum + usage.costMicros, 0);
    assertCallWithinCostCap({ capMicros: options.costCapMicros, spentMicros }, tier, currentPrompt, config.maxOutputTokens);
    const result = await options.provider.generate({
      model: tierIndex === config.pinnedTier ? config.model : config.escalationModel,
      reasoningEffort: tierIndex === config.pinnedTier ? config.reasoningEffort : config.escalationReasoningEffort,
      system: promptPackage.system,
      prompt: currentPrompt,
      schemaName: promptPackage.schemaName,
      schema: promptPackage.schema,
      maxOutputTokens: config.maxOutputTokens,
      idempotencyKey: `${options.invocationKey}:${options.reportType}:${phase}:${tier.name}`,
    });
    usages.push(result.usage);
    if (options.spentMicros + usages.reduce((sum, usage) => sum + usage.costMicros, 0) > options.costCapMicros) {
      throw new ReportCostCapError(options.costCapMicros, options.spentMicros, usages.reduce((sum, usage) => sum + usage.costMicros, 0));
    }
    return result;
  };

  const validate = async (result: OpenRouterGenerationResult) => {
    if (!result.ok) return { ok: false as const, issues: [invalidJsonIssue(result)] };
    previousOutput = result.output;
    const validation = options.contractVersion === "v6"
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
    return validation.ok
      ? { ok: true as const, artifact: validation.value }
      : { ok: false as const, issues: validation.issues };
  };

  try {
    const firstResult = await call(config.pinnedTier, "initial");
    let checked = await validate(firstResult);
    if (checked.ok) {
      return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
    }
    validationIssues = checked.issues;

    if (firstResult.ok || firstResult.kind === "invalid_json") {
      currentPrompt = buildRepairPrompt(options.reportType, options.input, validationIssues, previousOutput);
      const repairedResult = await call(config.pinnedTier, "repair");
      checked = await validate(repairedResult);
      if (checked.ok) {
        return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
      }
      validationIssues = checked.issues;
    }

    currentPrompt = buildRepairPrompt(options.reportType, options.input, validationIssues, previousOutput);
    const escalatedResult = await call(escalationTierIndex, "escalation");
    checked = await validate(escalatedResult);
    if (checked.ok) {
      return { ok: true, value: { reportType: options.reportType, artifact: checked.artifact, usage: totalUsage(usages) } as GeneratedCanonicalArtifact };
    }
    return failure(options.reportType, "artifact_validation_failed", "Canonical artifact failed after one repair and one-tier escalation.", checked.issues, usages);
  } catch (error) {
    if (error instanceof ReportCostCapError) return failure(options.reportType, "cost_cap_exceeded", error.message, [], usages);
    if (error instanceof OpenRouterTransportError) return failure(options.reportType, error.kind, error.message, [], usages, error.retryable);
    return failure(options.reportType, "generation_error", error instanceof Error ? error.message : String(error), [], usages);
  }
}
