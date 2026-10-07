import type { JsonObject, ReportType } from "../lib/question-engine/types.ts";
import type { GeneratedCanonicalArtifact, PassReportWorkflowInput, PreparedReportInputs } from "../lib/server/reports/types.ts";
import { failureFromUnknown } from "../lib/server/reports/failure-policy.ts";
import {
  buildSynthesisBundleStep,
  claimReportAttemptStep,
  generateReportStep,
  initializeReportRunsStep,
  isGeneratedArtifact,
  persistReportFailureStep,
  persistUnexpectedReportFailureStep,
  persistReportUsageStep,
  prepareReportInputsStep,
  raiseFatalReportFailureStep,
  releaseReportsStep,
  heartbeatReportAttemptStep,
  renderReportPdfsStep,
  deliverReleasedReportsStep,
  dispatchReportFailureNotificationStep,
} from "../lib/server/reports/steps.ts";

function layerInput(reportType: "IFS" | "PV" | "ATT", prepared: PreparedReportInputs): JsonObject {
  const packet = prepared.routerPacket;
  if (!packet || prepared.contractVersion !== "v6") throw new Error(`Missing PWQE6 router packet for ${reportType}.`);
  return { release_id: "PWQE-5.0.0-design.1", snapshot_id: prepared.snapshot.snapshotId, report_type: reportType, packet } as unknown as JsonObject;
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
  const reportTypes: readonly ReportType[] = input.completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
  const claim = await claimReportAttemptStep(input);
  if (claim === "already_released") {
    try { await deliverReleasedReportsStep(input); } catch { /* Released artifacts remain authoritative; delivery owns its failures. */ }
    return { status: "already_released", reportTypes };
  }

  try {
    await heartbeatReportAttemptStep(input, "PREFLIGHT");
    const prepared = await prepareReportInputsStep(input);
    const initialized = await initializeReportRunsStep(input, prepared);
    if (initialized.alreadyReleased) {
      try { await deliverReleasedReportsStep(input); } catch { /* Delivery owns its terminal state. */ }
      return { status: "already_released", reportTypes };
    }
    await heartbeatReportAttemptStep(input, "GENERATION");
    const generated: GeneratedCanonicalArtifact[] = [];
    let spentMicros = 0;
    if (input.completedPass === 1) {
      generated.push(await requireGenerated(input, prepared, "MAP", { release_id: "PWQE-5.0.0-design.1", snapshot_id: prepared.snapshot.snapshotId, report_type: "MAP", packets: prepared.routerPacket ? [prepared.routerPacket] : prepared.packets } as unknown as JsonObject, spentMicros));
      await heartbeatReportAttemptStep(input, "GENERATION");
    } else {
      for (const reportType of ["IFS", "PV", "ATT"] as const) {
        const layer = await requireGenerated(input, prepared, reportType, layerInput(reportType, prepared), spentMicros);
        generated.push(layer);
        spentMicros += layer.usage.costMicros;
        await heartbeatReportAttemptStep(input, "GENERATION");
      }
      const bundle = await buildSynthesisBundleStep(input, prepared, generated);
      generated.push(await requireGenerated(input, prepared, "SYNTHESIS", { bundle } as unknown as JsonObject, spentMicros, bundle));
      await heartbeatReportAttemptStep(input, "GENERATION");
    }
    await heartbeatReportAttemptStep(input, "PDF");
    const pdfs = await renderReportPdfsStep(input, prepared, generated);
    await heartbeatReportAttemptStep(input, "RELEASE");
    await releaseReportsStep(input, generated, pdfs);
  } catch (error) {
    await persistUnexpectedReportFailureStep(input, failureFromUnknown(error));
    await dispatchReportFailureNotificationStep(input);
    throw error;
  }
  try { await deliverReleasedReportsStep(input); } catch { /* Delivery retry is independent from report readiness. */ }
  return { status: "released", reportTypes };
}
