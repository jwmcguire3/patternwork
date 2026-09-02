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

export interface PassReportWorkflowInput {
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly completedPass: 1 | 2;
  readonly invocationKey: string;
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
}

export interface SnapshotPacketBoundary {
  loadAndDecryptSnapshot(input: PassReportWorkflowInput): Promise<DecryptedAssessmentSnapshot>;
  buildPseudonymousPackets(snapshot: DecryptedAssessmentSnapshot): Promise<readonly JsonObject[]>;
}

export type AggregatedOpenRouterUsage = ReturnType<typeof totalUsage>;

export interface GeneratedCanonicalArtifact {
  readonly reportType: ReportType;
  readonly artifact: ReportArtifact | SynthesisAudit;
  readonly usage: AggregatedOpenRouterUsage;
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
  releaseAtomically(input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[]): Promise<void>;
  persistFailure(input: PassReportWorkflowInput, code: string, message: string, reportType?: ReportType, usages?: readonly OpenRouterUsage[]): Promise<void>;
}

export interface ReportWorkflowDependencies {
  readonly snapshotBoundary: SnapshotPacketBoundary;
  readonly provider: OpenRouterTransport;
  readonly persistence: ReportWorkflowPersistence;
  readonly workspaceRoot?: string;
  readonly costCapMicros?: number;
  readonly modelPolicy: ActivatedReportModelPolicy;
}

export interface SynthesisInput {
  readonly bundle: SynthesisBundle;
  readonly packets: readonly ReportEvidencePacketV3_1[];
  readonly layerArtifacts: readonly GeneratedCanonicalArtifact[];
}
