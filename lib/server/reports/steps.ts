import { FatalError, RetryableError } from "workflow";
import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import type { SynthesisBundle } from "../../report-contracts/types.ts";
import { getReportWorkflowDependencies } from "./dependencies.ts";
import { generateCanonicalReport } from "./generator.ts";
import { buildValidatedSynthesisBundle } from "./synthesis.ts";
import type {
  GeneratedCanonicalArtifact,
  PassReportWorkflowInput,
  PreparedPdfArtifact,
  PreparedReportInputs,
  ReportGenerationFailure,
} from "./types.ts";
import { prepareAndValidateInputs } from "./validation.ts";

export async function prepareReportInputsStep(input: PassReportWorkflowInput): Promise<PreparedReportInputs> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  const snapshot = await dependencies.snapshotBoundary.loadAndDecryptSnapshot(input);
  const packetValues = await dependencies.snapshotBoundary.buildPseudonymousPackets(snapshot);
  const validation = await prepareAndValidateInputs(snapshot, packetValues, dependencies.workspaceRoot);
  if (!validation.ok) throw new FatalError(`input_contract_invalid:${JSON.stringify(validation.issues)}`);
  return validation.value;
}
prepareReportInputsStep.maxRetries = 2;

export async function initializeReportRunsStep(input: PassReportWorkflowInput, prepared: PreparedReportInputs): Promise<{ readonly alreadyReleased: boolean }> {
  "use step";
  return getReportWorkflowDependencies().persistence.initializeRuns(input, prepared);
}

export async function generateReportStep(
  input: PassReportWorkflowInput,
  prepared: PreparedReportInputs,
  reportType: ReportType,
  reportInput: JsonObject,
  spentMicros: number,
  synthesisBundle?: SynthesisBundle,
): Promise<GeneratedCanonicalArtifact | ReportGenerationFailure> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  const outcome = await generateCanonicalReport({
    reportType,
    input: reportInput,
    packets: prepared.packets,
    provider: dependencies.provider,
    invocationKey: input.invocationKey,
    spentMicros,
    costCapMicros: dependencies.costCapMicros ?? 20_000_000,
    workspaceRoot: dependencies.workspaceRoot,
    synthesisBundle,
    modelPolicy: dependencies.modelPolicy,
  });
  if (!outcome.ok && outcome.failure.retryable) {
    throw new RetryableError(`${outcome.failure.code}:${outcome.failure.message}`, { retryAfter: "30s" });
  }
  return outcome.ok ? outcome.value : outcome.failure;
}
generateReportStep.maxRetries = 3;

export async function persistReportUsageStep(input: PassReportWorkflowInput, generated: GeneratedCanonicalArtifact): Promise<void> {
  "use step";
  await getReportWorkflowDependencies().persistence.persistUsage(input, generated);
}

export async function buildSynthesisBundleStep(
  input: PassReportWorkflowInput,
  prepared: PreparedReportInputs,
  generated: readonly GeneratedCanonicalArtifact[],
): Promise<SynthesisBundle> {
  "use step";
  try {
    return buildValidatedSynthesisBundle(prepared, generated);
  } catch (error) {
    await getReportWorkflowDependencies().persistence.persistFailure(input, "synthesis_bundle_invalid", error instanceof Error ? error.message : String(error), "SYNTHESIS", []);
    throw new FatalError(error instanceof Error ? error.message : String(error));
  }
}

export async function renderReportPdfsStep(input: PassReportWorkflowInput, prepared: PreparedReportInputs, generated: readonly GeneratedCanonicalArtifact[]): Promise<readonly PreparedPdfArtifact[]> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  try {
    const { renderAndVerifyCanonicalPdf } = await import("../pdf/index.ts");
    return await Promise.all(generated.map(async (item) => {
      const pdf = await renderAndVerifyCanonicalPdf({ reportType: item.reportType, artifact: item.artifact, packets: prepared.packets, workspaceRoot: dependencies.workspaceRoot, verification: dependencies.pdfVerification });
      return { reportType: item.reportType, filename: pdf.filename, bytesBase64: pdf.bytes.toString("base64"), sha256: pdf.sha256, sourceMarkdownSha256: pdf.sourceMarkdownSha256, pageCount: pdf.pageCount, pngPageCount: pdf.pngPageCount };
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await dependencies.persistence.persistFailure(input, "pdf_verification_failed", message);
    throw new FatalError(`pdf_verification_failed:${message}`);
  }
}
renderReportPdfsStep.maxRetries = 1;

export async function releaseReportsStep(input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[], pdfs: readonly PreparedPdfArtifact[]): Promise<void> {
  "use step";
  const persistence = getReportWorkflowDependencies().persistence;
  try {
    await persistence.releaseAtomically(input, generated, pdfs);
  } catch (error) {
    await persistence.persistFailure(input, "atomic_release_failed", error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function deliverReleasedReportsStep(input: PassReportWorkflowInput): Promise<void> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  const delivery = dependencies.delivery ?? (await import("../email/delivery.ts")).getReportDeliveryBoundary();
  await delivery.deliverReleased(input);
}
deliverReleasedReportsStep.maxRetries = 3;

export async function persistReportFailureStep(input: PassReportWorkflowInput, failure: ReportGenerationFailure): Promise<void> {
  "use step";
  await getReportWorkflowDependencies().persistence.persistFailure(input, failure.code, failure.message, failure.reportType, failure.usages);
}

export async function raiseFatalReportFailureStep(failure: ReportGenerationFailure): Promise<never> {
  "use step";
  throw new FatalError(`${failure.code}:${failure.message}`);
}
raiseFatalReportFailureStep.maxRetries = 0;

export function isGeneratedArtifact(value: GeneratedCanonicalArtifact | ReportGenerationFailure): value is GeneratedCanonicalArtifact {
  return "artifact" in value;
}
