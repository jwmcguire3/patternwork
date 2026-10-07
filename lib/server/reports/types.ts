import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import type {
  ReportArtifact,
  ReportEvidencePacketV3_1,
  SynthesisAudit,
  SynthesisBundle,
} from "../../report-contracts/types.ts";
import type { OpenRouterTransport, OpenRouterUsage } from "../openrouter/types.ts";
import type { totalUsage } from "../openrouter/policy.ts";
import type { ActivatedReportModelPolicy } from "../openrouter/policy.ts";
import type { ReportDeliveryBoundary } from "../email/types.ts";
import type { PdfVerificationBoundary } from "../pdf/types.ts";

export interface PassReportWorkflowInput {
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly completedPass: 1 | 2;
  /** Required for durable workflows; optional only for the offline report CLI/test pipeline. */
  readonly attemptId?: string;
  readonly attemptNumber?: number;
  readonly invocationKey: string;
}

export type ReportAttemptPhase = "ENQUEUE" | "PREFLIGHT" | "GENERATION" | "PDF" | "RELEASE";
export type ReportFailureCategory = "TRANSIENT" | "STALLED" | "CONFIGURATION" | "VALIDATION" | "COST" | "PDF" | "DELIVERY" | "INTERNAL";
export type ReportRetryAudience = "USER" | "OPERATOR" | "NONE";

export interface ClassifiedReportFailure {
  readonly category: ReportFailureCategory;
  readonly retryAudience: ReportRetryAudience;
  readonly code: string;
  readonly message: string;
}

export interface DecryptedAssessmentSnapshot {
  readonly databaseId: string;
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly snapshotRevision: string;
  readonly completedPass: 1 | 2;
  readonly evidenceSha256: string;
  readonly scopeSha256: string;
  readonly canonicalSnapshot: JsonObject;
  readonly persistedPackets?: readonly JsonObject[];
}

export interface PreparedReportInputs {
  readonly snapshot: Omit<DecryptedAssessmentSnapshot, "canonicalSnapshot" | "persistedPackets">;
  readonly packets: readonly ReportEvidencePacketV3_1[];
  readonly routerPacket?: JsonObject;
  readonly contractVersion?: "v3.1" | "v6";
  readonly sourceManifestSha256?: string;
  readonly qualificationManifestSha256?: string;
  readonly modelPolicy?: ActivatedReportModelPolicy;
}

export interface SnapshotPacketBoundary {
  loadAndDecryptSnapshot(input: PassReportWorkflowInput): Promise<DecryptedAssessmentSnapshot>;
  buildPseudonymousPackets(snapshot: DecryptedAssessmentSnapshot): Promise<readonly JsonObject[]>;
}

export type AggregatedOpenRouterUsage = ReturnType<typeof totalUsage>;

export interface GeneratedCanonicalArtifact {
  readonly reportType: ReportType;
  readonly artifact: ReportArtifact | SynthesisAudit | Pwqe6ReportArtifact;
  readonly usage: AggregatedOpenRouterUsage;
}

export interface Pwqe6ReportDraft extends JsonObject {
  readonly release_id: string;
  readonly snapshot_id: string;
  readonly report_type: ReportType;
  readonly title: string;
  readonly sections: JsonObject[];
  readonly claims: JsonObject[];
  readonly name_registry: JsonObject[];
  readonly reflection_questions: string[];
}

export interface Pwqe6ReportArtifact extends JsonObject {
  readonly artifact_type: "pwqe6_report";
  readonly contract_id: "patternwork-report-v6-design";
  readonly integrity_contract_id: "patternwork-router-evidence-v1";
  readonly package_version: "PWQE-5.0.0-design.1";
  readonly prompt_release: "6.0";
  readonly report_id: string;
  readonly report_type: ReportType;
  readonly snapshot_id: string;
  readonly source_manifest_sha256: string;
  readonly qualification_manifest_sha256: string;
  readonly packet_id: string;
  readonly report_markdown: string;
  readonly draft: Pwqe6ReportDraft;
  readonly digests: JsonObject & { readonly artifact_sha256: string };
}

export interface PreparedPdfArtifact {
  readonly reportType: ReportType;
  readonly filename: string;
  readonly bytesBase64: string;
  readonly sha256: string;
  readonly sourceMarkdownSha256: string;
  readonly pageCount: number;
  readonly pngPageCount: number;
}

export interface ReportGenerationFailure {
  readonly reportType: ReportType;
  readonly code: string;
  readonly message: string;
  readonly issues: readonly ValidationIssue[];
  readonly usages: readonly OpenRouterUsage[];
  readonly retryable: boolean;
}

export type ReportGenerationOutcome =
  | { readonly ok: true; readonly value: GeneratedCanonicalArtifact }
  | { readonly ok: false; readonly failure: ReportGenerationFailure };

export interface ReportWorkflowPersistence {
  initializeRuns(input: PassReportWorkflowInput, prepared: PreparedReportInputs): Promise<{ readonly alreadyReleased: boolean }>;
  persistUsage(input: PassReportWorkflowInput, generated: GeneratedCanonicalArtifact): Promise<void>;
  releaseAtomically(input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[], pdfs?: readonly PreparedPdfArtifact[]): Promise<void>;
  persistFailure(input: PassReportWorkflowInput, code: string, message: string, reportType?: ReportType, usages?: readonly OpenRouterUsage[]): Promise<void>;
}

export interface ReportWorkflowDependencies {
  readonly claimAttempt?: (input: PassReportWorkflowInput) => Promise<"claimed" | "already_released">;
  readonly snapshotBoundary: SnapshotPacketBoundary;
  readonly provider: OpenRouterTransport;
  readonly persistence: ReportWorkflowPersistence;
  readonly workspaceRoot?: string;
  readonly costCapMicros?: number;
  readonly modelPolicy: ActivatedReportModelPolicy;
  readonly pdfVerification?: PdfVerificationBoundary;
  readonly delivery?: ReportDeliveryBoundary;
  readonly preflight?: () => Promise<void>;
}

export interface SynthesisInput {
  readonly bundle: SynthesisBundle;
  readonly packets: readonly ReportEvidencePacketV3_1[];
  readonly layerArtifacts: readonly GeneratedCanonicalArtifact[];
}
