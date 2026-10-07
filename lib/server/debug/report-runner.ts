import { prisma } from "../../prisma.ts";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { assertCallWithinCostCap, OPENROUTER_SITE_MODEL, QUALIFICATION_MODEL_ORDER, totalUsage } from "../openrouter/policy.ts";
import { OpenRouterClient } from "../openrouter/client.ts";
import type { OpenRouterUsage } from "../openrouter/types.ts";
import { buildGenerationPrompt, buildRepairPrompt, loadPwqe6ReportPrompt } from "../reports/prompts.ts";
import { renderPwqe6ReportDraftMarkdown, validatePwqe6ReportDraftValue } from "../reports/pwqe6-validation.ts";
import { loadPwqe5SourcePackage } from "../reports/pwqe6-source.ts";
import { buildPwqe5QualificationFixtureSet, type Pwqe5ProviderQualificationFixture } from "../openrouter/pwqe5-qualification-fixtures.ts";

export type DebugReportMode = "mapping" | "deepening" | "all";
export type DebugReportPhase = "PREPARING" | "MAP" | "IFS" | "PV" | "ATT" | "SYNTHESIS" | "COMPLETE";

export interface DebugReportRunInput {
  readonly runId: string;
  readonly profileId: string;
  readonly mode: DebugReportMode;
}

export interface DebugReportResult {
  readonly reportType: ReportType;
  readonly title: string;
  readonly reportMarkdown: string;
  readonly draft: JsonObject;
  readonly usage: {
    readonly model: string;
    readonly costMicros: number;
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly reasoningTokens: number;
    readonly totalTokens: number;
    readonly attempts: number;
    readonly generationIds: readonly string[];
  };
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function strictProviderSchema(value: unknown): unknown {
  const unsupported = new Set(["$schema", "$id", "title", "description", "allOf", "if", "then", "else", "uniqueItems"]);
  if (Array.isArray(value)) return value.map(strictProviderSchema);
  const record = object(value);
  if (!record) return value;
  return Object.fromEntries(Object.entries(record)
    .filter(([key]) => !unsupported.has(key))
    .map(([key, child]) => [key, strictProviderSchema(child)]));
}

function promptInput(input: {
  readonly reportType: ReportType;
  readonly fixture: Pwqe5ProviderQualificationFixture;
  readonly sourceManifestSha256: string;
  readonly layerReports: readonly DebugReportResult[];
}): { readonly packet: JsonObject; readonly input: JsonObject } {
  const packet = input.reportType === "MAP" ? input.fixture.mappingPacket : input.fixture.reportPacket;
  if (input.reportType === "MAP") {
    return {
      packet,
      input: { release_id: "PWQE-5.0.0-design.1", snapshot_id: input.fixture.mappingSnapshotId, report_type: "MAP", packets: [packet] } as unknown as JsonObject,
    };
  }
  if (input.reportType !== "SYNTHESIS") {
    return {
      packet,
      input: { release_id: "PWQE-5.0.0-design.1", snapshot_id: input.fixture.deepeningSnapshotId, report_type: input.reportType, packet } as unknown as JsonObject,
    };
  }
  const layerReports = ["IFS", "PV", "ATT"] as const;
  const layers = layerReports.map((reportType) => {
    const layer = input.layerReports.find((entry) => entry.reportType === reportType);
    if (!layer) throw new Error(`debug_synthesis_input_missing_${reportType.toLowerCase()}`);
    return { report_type: reportType, draft: layer.draft };
  });
  return {
    packet,
    input: {
      release_id: "PWQE-5.0.0-design.1",
      snapshot_id: input.fixture.deepeningSnapshotId,
      report_type: "SYNTHESIS",
      source_manifest_sha256: input.sourceManifestSha256,
      packet,
      layer_reports: layers,
    } as unknown as JsonObject,
  };
}

function outputLimit(reportType: ReportType): number {
  return reportType === "MAP" || reportType === "SYNTHESIS" ? 16_000 : 20_000;
}

function costCapMicros(): number {
  const dollars = Number(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD);
  if (!Number.isFinite(dollars) || dollars <= 0) throw new Error("debug_cost_cap_not_configured");
  return Math.floor(dollars * 1_000_000);
}

function validationSummary(issues: readonly ValidationIssue[]): string {
  return issues.slice(0, 8).map((issue) => `${issue.code} at ${issue.path}`).join("; ") || "report draft did not pass validation";
}

async function generateDebugDraft(input: {
  readonly runId: string;
  readonly reportType: ReportType;
  readonly profile: Pwqe5ProviderQualificationFixture;
  readonly sourceManifestSha256: string;
  readonly layerReports: readonly DebugReportResult[];
  readonly spentMicros: number;
}): Promise<DebugReportResult> {
  const target = QUALIFICATION_MODEL_ORDER[0];
  if (target.model !== OPENROUTER_SITE_MODEL || target.reasoningEffort !== "max") throw new Error("debug_model_configuration_mismatch");
  const source = await loadPwqe5SourcePackage();
  const promptPackage = await loadPwqe6ReportPrompt(input.reportType);
  const { packet, input: reportInput } = promptInput({
    reportType: input.reportType,
    fixture: input.profile,
    sourceManifestSha256: input.sourceManifestSha256,
    layerReports: input.layerReports,
  });
  const providerSchema = strictProviderSchema(promptPackage.schema) as JsonObject;
  const provider = new OpenRouterClient();
  const usage: OpenRouterUsage[] = [];
  let priorOutput: JsonObject | undefined;
  let prompt = buildGenerationPrompt(input.reportType, reportInput);
  const cap = costCapMicros();
  const maxOutputTokens = outputLimit(input.reportType);

  for (const phase of ["initial", "repair"] as const) {
    assertCallWithinCostCap({ capMicros: cap, spentMicros: input.spentMicros + usage.reduce((sum, item) => sum + item.costMicros, 0) }, target, prompt, maxOutputTokens);
    const result = await provider.generate({
      model: OPENROUTER_SITE_MODEL,
      reasoningEffort: "max",
      system: promptPackage.system,
      prompt,
      schemaName: promptPackage.schemaName,
      schema: providerSchema,
      maxOutputTokens,
      idempotencyKey: `patternwork-debug:${input.runId}:${input.reportType}:${phase}`,
    });
    usage.push(result.usage);
    const totalCostMicros = usage.reduce((sum, item) => sum + item.costMicros, 0);
    if (input.spentMicros + totalCostMicros > cap) throw new Error("debug_cost_cap_exceeded");
    if (result.usage.model !== OPENROUTER_SITE_MODEL) throw new Error("debug_actual_model_mismatch");
    if (!result.ok) {
      if (result.kind !== "invalid_json" || phase === "repair") throw new Error(`debug_provider_${result.kind}`);
      priorOutput = undefined;
      prompt = buildRepairPrompt(input.reportType, reportInput, [{ code: result.kind, path: "$", message: result.message }], priorOutput);
      continue;
    }

    priorOutput = result.output;
    const validated = validatePwqe6ReportDraftValue({
      value: result.output,
      reportType: input.reportType,
      snapshotId: input.reportType === "MAP" ? input.profile.mappingSnapshotId : input.profile.deepeningSnapshotId,
      packet,
      source,
    });
    if (!validated.ok) {
      if (phase === "repair") throw new Error(`debug_validation_failed:${validationSummary(validated.issues)}`);
      prompt = buildRepairPrompt(input.reportType, reportInput, validated.issues, priorOutput);
      continue;
    }

    const aggregated = totalUsage(usage);
    return {
      reportType: input.reportType,
      title: validated.value.title,
      reportMarkdown: renderPwqe6ReportDraftMarkdown(validated.value),
      draft: validated.value as unknown as JsonObject,
      usage: {
        model: aggregated.model,
        costMicros: aggregated.costMicros,
        inputTokens: aggregated.inputTokens,
        outputTokens: aggregated.outputTokens,
        reasoningTokens: aggregated.reasoningTokens,
        totalTokens: aggregated.totalTokens,
        attempts: aggregated.attempts,
        generationIds: aggregated.generationIds,
      },
    };
  }
  throw new Error("debug_invalid_json_after_repair");
}

function reportList(value: unknown): DebugReportResult[] {
  return Array.isArray(value) ? value.filter((item): item is DebugReportResult => Boolean(object(item))) : [];
}

async function updateRunProgress(input: {
  readonly runId: string;
  readonly phase: DebugReportPhase;
  readonly progressNote: string;
  readonly status?: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  readonly resultJson?: JsonObject[];
  readonly totalCostMicros?: number;
  readonly failureCode?: string | null;
}): Promise<void> {
  await prisma.patternworkDebugReportRun.update({
    where: { id: input.runId },
    data: {
      phase: input.phase,
      progressNote: input.progressNote,
      ...(input.status ? { status: input.status } : {}),
      ...(input.resultJson ? { resultJson: input.resultJson as unknown as object } : {}),
      ...(input.totalCostMicros !== undefined ? { totalCostMicros: BigInt(input.totalCostMicros) } : {}),
      ...(input.failureCode !== undefined ? { failureCode: input.failureCode } : {}),
      heartbeatAt: new Date(),
      ...(input.status === "SUCCEEDED" || input.status === "FAILED" ? { completedAt: new Date() } : {}),
    },
  });
}

export async function startDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  await updateRunProgress({ runId, phase: "PREPARING", progressNote: "Loading the fictional profile packet.", status: "RUNNING" });
}

export async function generateDebugReportStep(input: DebugReportRunInput & {
  readonly reportType: ReportType;
  readonly layerReports: readonly DebugReportResult[];
  readonly spentMicros: number;
}): Promise<DebugReportResult> {
  "use step";
  await updateRunProgress({ runId: input.runId, phase: input.reportType, progressNote: `Generating the ${input.reportType} draft with GPT-6 Luna · max.` });
  const fixtureSet = await buildPwqe5QualificationFixtureSet();
  const profile = fixtureSet.profiles.find((entry) => entry.id === input.profileId);
  if (!profile) throw new Error("debug_profile_not_found");
  const result = await generateDebugDraft({
    runId: input.runId,
    reportType: input.reportType,
    profile,
    sourceManifestSha256: fixtureSet.sourceManifestSha256,
    layerReports: input.layerReports,
    spentMicros: input.spentMicros,
  });
  const current = await prisma.patternworkDebugReportRun.findUniqueOrThrow({ where: { id: input.runId }, select: { resultJson: true } });
  const priorResults = reportList(current.resultJson);
  const results = [...priorResults.filter((entry) => entry.reportType !== result.reportType), result];
  const totalCostMicros = results.reduce((sum, entry) => sum + entry.usage.costMicros, 0);
  await updateRunProgress({
    runId: input.runId,
    phase: input.reportType,
    progressNote: `${input.reportType} draft validated.`,
    resultJson: results as unknown as JsonObject[],
    totalCostMicros,
  });
  return result;
}
generateDebugReportStep.maxRetries = 0;

export async function finishDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  await updateRunProgress({ runId, phase: "COMPLETE", progressNote: "All selected report drafts are ready.", status: "SUCCEEDED" });
}

export async function failDebugReportRunStep(input: { readonly runId: string; readonly failureCode: string }): Promise<void> {
  "use step";
  await updateRunProgress({
    runId: input.runId,
    phase: "COMPLETE",
    progressNote: "The report run stopped. You can review completed drafts and start another run.",
    status: "FAILED",
    failureCode: input.failureCode.slice(0, 80),
  });
}
