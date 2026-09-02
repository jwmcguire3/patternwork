import type { JsonObject, ReportType } from "../lib/question-engine/types.ts";
import type { GeneratedCanonicalArtifact, PassReportWorkflowInput, PreparedReportInputs } from "../lib/server/reports/types.ts";
import {
  buildSynthesisBundleStep,
  generateReportStep,
  initializeReportRunsStep,
  isGeneratedArtifact,
  persistReportFailureStep,
  persistReportUsageStep,
  prepareReportInputsStep,
  raiseFatalReportFailureStep,
  releaseReportsStep,
  renderReportPdfsStep,
  deliverReleasedReportsStep,
} from "../lib/server/reports/steps.ts";

function layerInput(reportType: "IFS" | "PV" | "ATT", prepared: PreparedReportInputs): JsonObject {
  const packet = prepared.packets.find((candidate) => candidate.report_type === reportType);
  if (!packet) throw new Error(`Missing ${reportType} packet.`);
  return { packet } as unknown as JsonObject;
}

async function requireGenerated(
  input: PassReportWorkflowInput,
  prepared: PreparedReportInputs,
  reportType: ReportType,
  reportInput: JsonObject,
  spentMicros: number,
  synthesisBundle?: Awaited<ReturnType<typeof buildSynthesisBundleStep>>,
): Promise<GeneratedCanonicalArtifact> {
  const result = await generateReportStep(input, prepared, reportType, reportInput, spentMicros, synthesisBundle);
  if (!isGeneratedArtifact(result)) {
    await persistReportFailureStep(input, result);
    return await raiseFatalReportFailureStep(result);
  }
  await persistReportUsageStep(input, result);
  return result;
}

export async function passReportWorkflow(input: PassReportWorkflowInput): Promise<{ readonly status: "released" | "already_released"; readonly reportTypes: readonly ReportType[] }> {
  "use workflow";
  const prepared = await prepareReportInputsStep(input);
  const initialized = await initializeReportRunsStep(input, prepared);
  const reportTypes: readonly ReportType[] = input.completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
  if (initialized.alreadyReleased) {
    await deliverReleasedReportsStep(input);
    return { status: "already_released", reportTypes };
  }

  const generated: GeneratedCanonicalArtifact[] = [];
  let spentMicros = 0;
  if (input.completedPass === 1) {
    generated.push(await requireGenerated(input, prepared, "MAP", { packets: prepared.packets } as unknown as JsonObject, spentMicros));
  } else {
    for (const reportType of ["IFS", "PV", "ATT"] as const) {
      const layer = await requireGenerated(input, prepared, reportType, layerInput(reportType, prepared), spentMicros);
      generated.push(layer);
      spentMicros += layer.usage.costMicros;
    }
    const bundle = await buildSynthesisBundleStep(input, prepared, generated);
    generated.push(await requireGenerated(input, prepared, "SYNTHESIS", { bundle } as unknown as JsonObject, spentMicros, bundle));
  }
  const pdfs = await renderReportPdfsStep(input, prepared, generated);
  await releaseReportsStep(input, generated, pdfs);
  await deliverReleasedReportsStep(input);
  return { status: "released", reportTypes };
}
