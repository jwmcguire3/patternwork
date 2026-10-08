import { FatalError, RetryableError } from "workflow";
import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import { getReportWorkflowDependencies } from "./dependencies.ts";
import { generateCanonicalReport } from "./generator.ts";
import type {
  GeneratedCanonicalArtifact,
  PassReportWorkflowInput,
  PreparedPdfArtifact,
  PreparedReportInputs,
  ReportGenerationFailure,
} from "./types.ts";
import { preparePwqe6ReportInputs } from "./pwqe6-validation.ts";
import { assertPwqe6ReportActivationReady } from "./pwqe6-readiness.ts";
import { loadPwqe5SourcePackage } from "./pwqe6-source.ts";
import { PWQE51_RELEASE_IDENTITY, loadPwqe51SourcePackage } from "../../question-engine/pwqe51-source.ts";
import { loadPwrp71SourcePackage } from "./pwrp71-source.ts";
import { preparePwrp71Request } from "./pwrp71-adapter.ts";
import { assertPwrp71ReportActivationReady } from "./pwrp71-readiness.ts";
import { preparePwrp71ReportInputs } from "./pwrp71-inputs.ts";
import { claimReportAttempt, failReportAttempt, heartbeatReportAttempt } from "./attempts.ts";
import type { ClassifiedReportFailure } from "./types.ts";
import { dispatchReportAttemptNotification } from "../notifications/report-status.ts";

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function acceptedLayersForPwrp71Report(
  reportType: ReportType,
  generated: readonly GeneratedCanonicalArtifact[],
): Readonly<Record<string, JsonObject>> | undefined {
  if (reportType !== "SYNTHESIS") return undefined;
  return Object.fromEntries(generated
    .filter((item) => item.reportType !== "SYNTHESIS" && item.artifact.artifact_type === "pwrp71_report")
    .map((item) => [item.reportType, item.artifact.draft as JsonObject]));
}

export async function claimReportAttemptStep(input: PassReportWorkflowInput): Promise<"claimed" | "already_released"> {
  "use step";
  const claim = getReportWorkflowDependencies().claimAttempt;
  if (claim) return claim(input);
  return claimReportAttempt(input);
}
claimReportAttemptStep.maxRetries = 3;

export async function heartbeatReportAttemptStep(input: PassReportWorkflowInput, phase: "PREFLIGHT" | "GENERATION" | "PDF" | "RELEASE"): Promise<void> {
  "use step";
  await heartbeatReportAttempt(input, phase);
}

export async function persistUnexpectedReportFailureStep(input: PassReportWorkflowInput, failure: ClassifiedReportFailure): Promise<void> {
  "use step";
  await failReportAttempt(input, failure);
}
persistUnexpectedReportFailureStep.maxRetries = 3;

export async function dispatchReportFailureNotificationStep(input: PassReportWorkflowInput): Promise<void> {
  "use step";
  if (input.attemptId) await dispatchReportAttemptNotification(input.attemptId, "REPORT_FAILED");
}
dispatchReportFailureNotificationStep.maxRetries = 3;

export async function prepareReportInputsStep(input: PassReportWorkflowInput): Promise<PreparedReportInputs> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  await dependencies.preflight?.();
  const snapshot = await dependencies.snapshotBoundary.loadAndDecryptSnapshot(input);
  if (snapshot.canonicalSnapshot.contract_id === PWQE51_RELEASE_IDENTITY.questionRelease) {
    const activation = await assertPwrp71ReportActivationReady({ workspaceRoot: dependencies.workspaceRoot });
    const validation = preparePwrp71ReportInputs(snapshot, activation);
    if (!validation.ok) throw new FatalError(`input_contract_invalid:${JSON.stringify(validation.issues)}`);
    return validation.value;
  }
  const activation = await assertPwqe6ReportActivationReady({ workspaceRoot: dependencies.workspaceRoot, snapshot: snapshot.canonicalSnapshot });
  const validation = await preparePwqe6ReportInputs(snapshot, activation, dependencies.workspaceRoot);
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
  synthesisBundle?: JsonObject,
): Promise<GeneratedCanonicalArtifact | ReportGenerationFailure> {
  "use step";
  const dependencies = getReportWorkflowDependencies();
  const isPwrp71 = prepared.contractVersion === "v7.1";
  const packet = prepared.routerPacket;
  let pwrp71: Parameters<typeof generateCanonicalReport>[0]["pwrp71"];
  if (isPwrp71) {
    if (!packet || !prepared.qualificationManifestSha256 || !prepared.sourceManifestSha256 || !prepared.reportSourceManifestSha256) {
      throw new FatalError("PWRP 7.1 generation requires its activated source, packet, and qualification bindings.");
    }
    const [questionSource, reportSource] = await Promise.all([
      loadPwqe51SourcePackage(dependencies.workspaceRoot),
      loadPwrp71SourcePackage(dependencies.workspaceRoot),
    ]);
    const bundle = objectRecord(synthesisBundle);
    const acceptedLayers = objectRecord(bundle?.accepted_layers) as Readonly<Record<string, JsonObject>> | undefined;
    const preparedRequest = preparePwrp71Request({ packet, reportType, questionSource, reportSource, acceptedLayers });
    if (!preparedRequest.ok) throw new FatalError(`pwrp71_request_invalid:${JSON.stringify(preparedRequest.issues)}`);
    pwrp71 = { request: preparedRequest.value, packet, source: reportSource };
  }
  const outcome = await generateCanonicalReport({
    reportType,
    input: reportInput,
    packets: (prepared.contractVersion === "v6" || prepared.contractVersion === "v7.1") && prepared.routerPacket ? [prepared.routerPacket] : prepared.packets,
    provider: dependencies.provider,
    invocationKey: input.invocationKey,
    spentMicros,
    costCapMicros: dependencies.costCapMicros ?? 20_000_000,
    workspaceRoot: dependencies.workspaceRoot,
    synthesisBundle,
    modelPolicy: prepared.modelPolicy ?? dependencies.modelPolicy!,
    contractVersion: prepared.contractVersion,
    source: prepared.contractVersion === "v6" ? await loadPwqe5SourcePackage(dependencies.workspaceRoot) : undefined,
    qualificationManifestSha256: prepared.qualificationManifestSha256,
    snapshotId: prepared.snapshot.snapshotId,
    pwrp71,
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
): Promise<JsonObject> {
  "use step";
  try {
    const packet = prepared.routerPacket;
    if (prepared.contractVersion === "v7.1" && packet && prepared.sourceManifestSha256 && prepared.reportSourceManifestSha256 && prepared.qualificationManifestSha256) {
      const layers = generated.filter((item) => item.reportType !== "SYNTHESIS");
      if (layers.length !== 3 || layers.some((item) => item.artifact.artifact_type !== "pwrp71_report")) {
        throw new Error("PWRP 7.1 synthesis requires validated IFS, PV, and ATT layer drafts.");
      }
      const acceptedLayers = Object.fromEntries(layers.map((item) => [item.reportType, (item.artifact as JsonObject).draft as JsonObject]));
      return {
        report_release: "PWRP-7.1.0-candidate.1",
        release_id: PWQE51_RELEASE_IDENTITY.questionRelease,
        snapshot_id: prepared.snapshot.snapshotId,
        evidence_sha256: String((packet as Record<string, unknown>).content_sha256),
        source_manifest_sha256: prepared.sourceManifestSha256,
        report_source_manifest_sha256: prepared.reportSourceManifestSha256,
        qualification_manifest_sha256: prepared.qualificationManifestSha256,
        packet,
        accepted_layers: acceptedLayers,
        layer_reports: layers.map((item) => ({ report_type: item.reportType, draft: (item.artifact as JsonObject).draft })),
      } as JsonObject;
    }
    if (prepared.contractVersion !== "v6" || !packet || !prepared.sourceManifestSha256 || !prepared.qualificationManifestSha256) {
      throw new Error("PWQE6 synthesis requires a reviewed activation and a single validated router packet.");
    }
    const layers = generated.filter((item) => item.reportType !== "SYNTHESIS");
    if (layers.length !== 3 || layers.some((item) => item.artifact.artifact_type !== "pwqe6_report")) {
      throw new Error("PWQE6 synthesis requires validated IFS, PV, and ATT layer drafts.");
    }
    return {
      release_id: "PWQE-5.0.0-design.1",
      snapshot_id: prepared.snapshot.snapshotId,
      report_type: "SYNTHESIS",
      source_manifest_sha256: prepared.sourceManifestSha256,
      qualification_manifest_sha256: prepared.qualificationManifestSha256,
      packet,
      layer_reports: layers.map((item) => ({ report_type: item.reportType, draft: (item.artifact as JsonObject).draft })),
    } as JsonObject;
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
      const acceptedLayers = prepared.contractVersion === "v7.1" ? acceptedLayersForPwrp71Report(item.reportType, generated) : undefined;
      const pdf = await renderAndVerifyCanonicalPdf({ reportType: item.reportType, artifact: item.artifact, packets: prepared.packets, routerPacket: prepared.routerPacket, acceptedLayers, snapshotId: prepared.snapshot.snapshotId, contractVersion: prepared.contractVersion, workspaceRoot: dependencies.workspaceRoot, verification: dependencies.pdfVerification });
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
