import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import { buildValidatedSynthesisBundle } from "./synthesis.ts";
import { generateCanonicalReport } from "./generator.ts";
import { prepareAndValidateInputs } from "./validation.ts";
import type {
  GeneratedCanonicalArtifact,
  PassReportWorkflowInput,
  PreparedReportInputs,
  ReportGenerationFailure,
  ReportWorkflowDependencies,
} from "./types.ts";

export class ReportPipelineError extends Error {
  constructor(readonly failure: ReportGenerationFailure) {
    super(failure.message);
    this.name = "ReportPipelineError";
  }
}

function reportInput(reportType: Exclude<ReportType, "SYNTHESIS">, prepared: PreparedReportInputs): JsonObject {
  if (reportType === "MAP") return { packets: prepared.packets } as unknown as JsonObject;
  const packet = prepared.packets.find((candidate) => candidate.report_type === reportType);
  if (!packet) throw new Error(`Missing ${reportType} packet.`);
  return { packet } as unknown as JsonObject;
}

async function requireGenerated(
  reportType: ReportType,
  input: JsonObject,
  prepared: PreparedReportInputs,
  dependencies: ReportWorkflowDependencies,
  invocationKey: string,
  spentMicros: number,
  synthesisBundle?: ReturnType<typeof buildValidatedSynthesisBundle>,
): Promise<GeneratedCanonicalArtifact> {
  const outcome = await generateCanonicalReport({
    reportType,
    input,
    packets: prepared.packets,
    provider: dependencies.provider,
    invocationKey,
    spentMicros,
    costCapMicros: dependencies.costCapMicros ?? 20_000_000,
    workspaceRoot: dependencies.workspaceRoot,
    synthesisBundle,
    modelPolicy: dependencies.modelPolicy,
  });
  if (!outcome.ok) throw new ReportPipelineError(outcome.failure);
  return outcome.value;
}

export async function runPassReportPipeline(
  input: PassReportWorkflowInput,
  dependencies: ReportWorkflowDependencies,
): Promise<{ readonly status: "released" | "already_released"; readonly reportTypes: readonly ReportType[] }> {
  let prepared: PreparedReportInputs | undefined;
  try {
    const snapshot = await dependencies.snapshotBoundary.loadAndDecryptSnapshot(input);
    const packetValues = await dependencies.snapshotBoundary.buildPseudonymousPackets(snapshot);
    const validation = await prepareAndValidateInputs(snapshot, packetValues, dependencies.workspaceRoot);
    if (!validation.ok) throw new ReportPipelineError({
      code: "input_contract_invalid",
      reportType: input.completedPass === 1 ? "MAP" : "IFS",
      message: "Decrypted snapshot packet views failed the accepted input contract.",
      issues: validation.issues,
      usages: [],
      retryable: false,
    });
    prepared = validation.value;
    const initialized = await dependencies.persistence.initializeRuns(input, prepared);
    const reportTypes: readonly ReportType[] = input.completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
    if (initialized.alreadyReleased) return { status: "already_released", reportTypes };
    const generated: GeneratedCanonicalArtifact[] = [];
    let spentMicros = 0;
    if (input.completedPass === 1) {
      const mapping = await requireGenerated("MAP", reportInput("MAP", prepared), prepared, dependencies, input.invocationKey, spentMicros);
      generated.push(mapping);
      await dependencies.persistence.persistUsage(input, mapping);
    } else {
      for (const reportType of ["IFS", "PV", "ATT"] as const) {
        const layer = await requireGenerated(reportType, reportInput(reportType, prepared), prepared, dependencies, input.invocationKey, spentMicros);
        generated.push(layer);
        spentMicros += layer.usage.costMicros;
        await dependencies.persistence.persistUsage(input, layer);
      }
      const bundle = buildValidatedSynthesisBundle(prepared, generated);
      const synthesis = await requireGenerated("SYNTHESIS", { bundle } as unknown as JsonObject, prepared, dependencies, input.invocationKey, spentMicros, bundle);
      generated.push(synthesis);
      await dependencies.persistence.persistUsage(input, synthesis);
    }
    await dependencies.persistence.releaseAtomically(input, generated);
    return { status: "released", reportTypes };
  } catch (error) {
    const code = error instanceof ReportPipelineError ? error.failure.code : "report_pipeline_failed";
    const message = error instanceof Error ? error.message : String(error);
    if (prepared) {
      const failure = error instanceof ReportPipelineError ? error.failure : undefined;
      await dependencies.persistence.persistFailure(input, code, message, failure?.reportType, failure?.usages);
    }
    throw error;
  }
}
