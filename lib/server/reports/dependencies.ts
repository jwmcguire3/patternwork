import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { prisma } from "../../prisma.ts";
import { decryptJson, encryptBytes, encryptJson, encryptionKeyringFromEnv, sha256, type EncryptionKeyring } from "../security/index.ts";
import { OpenRouterClient } from "../openrouter/client.ts";
import { activateReviewedPwqe5QualificationManifest, totalUsage } from "../openrouter/policy.ts";
import type { OpenRouterUsage } from "../openrouter/types.ts";
import type {
  DecryptedAssessmentSnapshot,
  GeneratedCanonicalArtifact,
  PassReportWorkflowInput,
  PreparedPdfArtifact,
  PreparedReportInputs,
  ReportWorkflowDependencies,
  ReportWorkflowPersistence,
  SnapshotPacketBoundary,
} from "./types.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "./packet-builder.ts";
import { classifyReportFailure, failReportAttempt, isCompleteActiveReportSet } from "./attempts.ts";
import { reportGenerationReadiness, runReportPreflight } from "./preflight.ts";
import { assertCanonicalCompletionBoundary, assertNormalCompletionBoundary } from "../assessment/completion-boundary.ts";

interface SnapshotRow {
  id: string;
  assessmentSessionId: string;
  snapshotId: string;
  snapshotRevision: string;
  completedPass: number;
  completionMode: string;
  lastCompletedStage: string;
  safeResumeStage: string | null;
  evidenceSha256: string;
  scopeSha256: string;
  canonicalJsonSha256: string;
  canonicalJsonCiphertext: Uint8Array;
  canonicalJsonNonce: Uint8Array;
  encryptionKeyVersion: string;
  evidencePackets: Array<{
    id: string;
    canonicalJsonCiphertext: Uint8Array;
    canonicalJsonNonce: Uint8Array;
    encryptionKeyVersion: string;
  }>;
}

interface RunRow {
  id: string;
  status: string;
  reportType?: ReportType;
  reportWorkflowAttemptId?: string;
  artifact?: { canonicalJsonSha256: string; artifactStatus: string; pdfStatus?: string } | null;
}

interface AttemptRow {
  id: string;
  assessmentSnapshotId: string;
  attemptNumber: number;
  status: string;
  assessmentSnapshot: { currentReportAttemptNumber: number };
}

interface ReportPrisma {
  patternworkV31AssessmentSnapshot: {
    findFirst(args: unknown): Promise<SnapshotRow | null>;
  };
  patternworkV31ReportRun: {
    findUnique(args: unknown): Promise<RunRow | null>;
    findMany(args: unknown): Promise<RunRow[]>;
    upsert(args: unknown): Promise<RunRow>;
    update(args: unknown): Promise<RunRow>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportWorkflowAttempt: {
    findUnique(args: unknown): Promise<AttemptRow | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportArtifact: {
    findUnique(args: unknown): Promise<{ id: string; canonicalJsonSha256: string; artifactStatus: string } | null>;
    create(args: unknown): Promise<unknown>;
    update(args: unknown): Promise<unknown>;
  };
  patternworkV31EvidencePacket: {
    upsert(args: unknown): Promise<unknown>;
  };
  $transaction<T>(fn: (tx: ReportPrisma) => Promise<T>): Promise<T>;
}

const reportPrisma = prisma as unknown as ReportPrisma;

export const snapshotEncryptionPurpose = (assessmentSessionId: string, completedPass: number) => `patternwork:assessment-snapshot:${assessmentSessionId}:pass-${completedPass}`;
export const packetEncryptionPurpose = (packetDatabaseId: string) => `patternwork:evidence-packet:${packetDatabaseId}`;
export const artifactEncryptionPurpose = (runId: string) => `patternwork:report-artifact:${runId}`;
export const markdownEncryptionPurpose = (runId: string) => `patternwork:report-markdown:${runId}`;
export const pdfEncryptionPurpose = (artifactId: string) => `patternwork:report-pdf:${artifactId}`;

function jsonObjects(value: unknown): readonly JsonObject[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter((item): item is JsonObject => typeof item === "object" && item !== null && !Array.isArray(item));
  return values.length === value.length ? values : undefined;
}

function packetsFromSnapshot(snapshot: JsonObject): readonly JsonObject[] | undefined {
  for (const key of ["report_packets", "evidence_packets", "packet_views"] as const) {
    const packets = jsonObjects(snapshot[key]);
    if (packets) return packets;
  }
  return undefined;
}

export class PrismaSnapshotPacketBoundary implements SnapshotPacketBoundary {
  constructor(
    private readonly database: ReportPrisma = reportPrisma,
    private readonly keyring: EncryptionKeyring = encryptionKeyringFromEnv(),
  ) {}

  async loadAndDecryptSnapshot(input: PassReportWorkflowInput): Promise<DecryptedAssessmentSnapshot> {
    const row = await this.database.patternworkV31AssessmentSnapshot.findFirst({
      where: {
        assessmentSessionId: input.assessmentSessionId,
        snapshotId: input.snapshotId,
        completedPass: input.completedPass,
      },
      include: { evidencePackets: { orderBy: { reportType: "asc" } } },
    });
    if (!row) throw new Error("Immutable assessment snapshot was not found for this pass.");
    if (row.completedPass !== 1 && row.completedPass !== 2) throw new Error("Snapshot completedPass is invalid.");
    const canonicalSnapshot = decryptJson<JsonObject>({
      ciphertext: Buffer.from(row.canonicalJsonCiphertext),
      nonce: Buffer.from(row.canonicalJsonNonce),
      keyVersion: row.encryptionKeyVersion,
    }, snapshotEncryptionPurpose(row.assessmentSessionId, row.completedPass), this.keyring);
    if (sha256Canonical(canonicalSnapshot) !== row.canonicalJsonSha256) throw new Error("Decrypted assessment snapshot digest mismatch.");
    const completedPass = row.completedPass as 1 | 2;
    assertNormalCompletionBoundary(completedPass, {
      completionMode: row.completionMode,
      lastCompletedStage: row.lastCompletedStage,
      safeResumeStage: row.safeResumeStage,
    }, "Stored assessment snapshot");
    assertCanonicalCompletionBoundary(completedPass, canonicalSnapshot.assessment_completion);
    const persistedPackets = row.evidencePackets.map((packet) => decryptJson<JsonObject>({
      ciphertext: Buffer.from(packet.canonicalJsonCiphertext),
      nonce: Buffer.from(packet.canonicalJsonNonce),
      keyVersion: packet.encryptionKeyVersion,
    }, packetEncryptionPurpose(packet.id), this.keyring));
    return {
      databaseId: row.id,
      assessmentSessionId: row.assessmentSessionId,
      snapshotId: row.snapshotId,
      snapshotRevision: row.snapshotRevision,
      completedPass,
      evidenceSha256: row.evidenceSha256,
      scopeSha256: row.scopeSha256,
      canonicalSnapshot,
      persistedPackets,
    };
  }

  async buildPseudonymousPackets(snapshot: DecryptedAssessmentSnapshot): Promise<readonly JsonObject[]> {
    const embedded = packetsFromSnapshot(snapshot.canonicalSnapshot);
    const packets = snapshot.persistedPackets?.length ? snapshot.persistedPackets : embedded;
    if (packets?.length) return structuredClone(packets);
    const built = buildPseudonymousPacketsFromCanonicalSnapshot(snapshot);
    const keyring = this.keyring;
    await Promise.all(built.map(async (packet) => {
      const databaseId = `pwep_${sha256Canonical({ snapshotId: snapshot.snapshotId, reportType: packet.report_type }).slice(0, 32)}`;
      const encrypted = encryptJson(packet, packetEncryptionPurpose(databaseId), keyring);
      const completion = packet.assessment_completion as JsonObject;
      await this.database.patternworkV31EvidencePacket.upsert({
        where: { pw31_snapshot_packet_type: { assessmentSnapshotId: snapshot.databaseId, reportType: packet.report_type } },
        create: {
          id: databaseId,
          assessmentSnapshotId: snapshot.databaseId,
          packetId: packet.packet_id,
          reportType: packet.report_type,
          packetVersion: packet.packet_version,
          completionMode: completion.completion_mode,
          lastCompletedStage: completion.last_completed_stage,
          safeResumeStage: completion.safe_resume_stage,
          canonicalJsonSha256: sha256Canonical(packet),
          canonicalJsonCiphertext: encrypted.ciphertext,
          canonicalJsonNonce: encrypted.nonce,
          encryptionKeyVersion: encrypted.keyVersion,
          completedAt: new Date(packet.generated_at),
        },
        update: {},
      });
    }));
    return structuredClone(built);
  }
}

function reportTypesForPass(pass: 1 | 2): readonly ReportType[] {
  return pass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
}

function runKey(input: PassReportWorkflowInput, reportType: ReportType): string {
  return `pw31-run-${sha256Canonical({ snapshotId: input.snapshotId, completedPass: input.completedPass, reportType, promptRelease: "6.0", reportContract: "patternwork-report-v6-design" })}`;
}

function inputDigest(reportType: ReportType, prepared: PreparedReportInputs): string {
  if (prepared.contractVersion === "v6") return sha256Canonical({ snapshot: prepared.snapshot, sourceManifestSha256: prepared.sourceManifestSha256, qualificationManifestSha256: prepared.qualificationManifestSha256, reportType, packet: prepared.routerPacket });
  if (reportType === "MAP") return sha256Canonical(prepared.packets);
  if (reportType === "SYNTHESIS") return sha256Canonical(prepared.snapshot);
  const packet = prepared.packets.find((candidate) => candidate.report_type === reportType);
  if (!packet) throw new Error(`Missing ${reportType} packet input.`);
  return sha256Canonical(packet);
}

export class PrismaReportWorkflowPersistence implements ReportWorkflowPersistence {
  async initializeRuns(input: PassReportWorkflowInput, prepared: PreparedReportInputs): Promise<{ readonly alreadyReleased: boolean }> {
    return reportPrisma.$transaction(async (tx) => {
      const attempt = await tx.patternworkV31ReportWorkflowAttempt.findUnique({
        where: { id: input.attemptId },
        include: { assessmentSnapshot: { select: { currentReportAttemptNumber: true } } },
      });
      if (!attempt || attempt.status !== "RUNNING" || attempt.attemptNumber !== input.attemptNumber || attempt.assessmentSnapshot.currentReportAttemptNumber !== input.attemptNumber) {
        throw new Error("stale_report_attempt:Report workflow no longer owns this snapshot.");
      }
      const existing = await tx.patternworkV31ReportRun.findMany({
        where: { assessmentSnapshotId: prepared.snapshot.databaseId },
        include: { artifact: { select: { canonicalJsonSha256: true, artifactStatus: true, pdfStatus: true } } },
      });
      if (isCompleteActiveReportSet(input.completedPass, existing as Array<RunRow & { reportType: string; artifact?: { artifactStatus: string; pdfStatus: string } | null }>)) return { alreadyReleased: true };
      if (existing.some((row) => row.artifact?.artifactStatus === "ACTIVE")) throw new Error("partial_active_report_set:Partial active report sets cannot be retried or released.");
      const timestamp = new Date();
      await Promise.all(reportTypesForPass(input.completedPass).map((reportType) => tx.patternworkV31ReportRun.upsert({
        where: { pw31_snapshot_report_type: { assessmentSnapshotId: prepared.snapshot.databaseId, reportType } },
        create: {
          assessmentSnapshotId: prepared.snapshot.databaseId,
          reportWorkflowAttemptId: input.attemptId,
          reportType,
          idempotencyKey: runKey(input, reportType),
          status: "RUNNING",
          promptRelease: "6.0",
          inputSha256: inputDigest(reportType, prepared),
          startedAt: timestamp,
        },
        update: { reportWorkflowAttemptId: input.attemptId, status: "RUNNING", inputSha256: inputDigest(reportType, prepared), failureCode: null, failureMessage: null, startedAt: timestamp, finishedAt: null },
      })));
      return { alreadyReleased: false };
    });
  }

  async persistUsage(input: PassReportWorkflowInput, generated: GeneratedCanonicalArtifact): Promise<void> {
    const usage = generated.usage;
    const updated = await reportPrisma.patternworkV31ReportRun.updateMany({
      where: { reportType: generated.reportType, reportWorkflowAttemptId: input.attemptId, reportWorkflowAttempt: { status: "RUNNING", attemptNumber: input.attemptNumber, assessmentSnapshot: { currentReportAttemptNumber: input.attemptNumber } } },
      data: {
        provider: "openrouter",
        model: usage.model,
        attemptCount: usage.attempts,
        providerRequestId: usage.requestId ?? usage.generationId,
        openRouterGenerationId: usage.generationId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        reasoningTokens: usage.reasoningTokens,
        totalTokens: usage.totalTokens,
        costMicros: BigInt(usage.costMicros),
        costCurrency: usage.currency,
      },
    });
    if (updated.count !== 1) throw new Error("stale_report_attempt:Usage was produced by a stale report attempt.");
  }

  async releaseAtomically(input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[], pdfs: readonly PreparedPdfArtifact[] = []): Promise<void> {
    const expected = reportTypesForPass(input.completedPass);
    if (generated.length !== expected.length || expected.some((type) => !generated.some((item) => item.reportType === type))) {
      throw new Error("Atomic release requires the complete pass artifact set.");
    }
    if (pdfs.length !== expected.length || expected.some((type) => !pdfs.some((item) => item.reportType === type && item.pageCount > 0 && item.pngPageCount === item.pageCount))) {
      throw new Error("Atomic release requires the complete externally verified PDF set.");
    }
    const keyring = encryptionKeyringFromEnv();
    await reportPrisma.$transaction(async (tx) => {
      const activations: Array<{ runId: string; artifactSha: string }> = [];
      const attempt = await tx.patternworkV31ReportWorkflowAttempt.findUnique({
        where: { id: input.attemptId },
        include: { assessmentSnapshot: { select: { currentReportAttemptNumber: true } } },
      });
      if (!attempt || attempt.status !== "RUNNING" || attempt.attemptNumber !== input.attemptNumber || attempt.assessmentSnapshot.currentReportAttemptNumber !== input.attemptNumber) throw new Error("stale_report_attempt:Release ownership was lost.");
      for (const item of generated) {
        const run = await tx.patternworkV31ReportRun.findUnique({ where: { pw31_snapshot_report_type: { assessmentSnapshotId: attempt.assessmentSnapshotId, reportType: item.reportType } } });
        if (!run || run.reportWorkflowAttemptId !== input.attemptId) throw new Error(`Report run ${item.reportType} is missing or stale.`);
        const artifact = item.artifact;
        const markdown = artifact.artifact_type === "synthesis_audit" ? artifact.reader_markdown : artifact.report_markdown;
        const reportId = artifact.artifact_type === "synthesis_audit" ? artifact.audit_id : artifact.report_id;
        const artifactSha = artifact.artifact_type === "synthesis_audit"
          ? String((artifact.digests as JsonObject).audit_sha256)
          : String((artifact.digests as JsonObject).artifact_sha256);
        const existing = await tx.patternworkV31ReportArtifact.findUnique({ where: { reportRunId: run.id } });
        if (existing && existing.canonicalJsonSha256 !== artifactSha) throw new Error("Immutable report artifact conflict during idempotent release.");
        const artifactId = existing?.id ?? `pwra_${sha256(`${run.id}:${reportId}`).slice(0, 28)}`;
        const pdf = pdfs.find((candidate) => candidate.reportType === item.reportType)!;
        const pdfBytes = Buffer.from(pdf.bytesBase64, "base64");
        if (sha256(pdfBytes) !== pdf.sha256) throw new Error("Prepared PDF digest binding failed before persistence.");
        const encryptedPdf = encryptBytes(pdfBytes, pdfEncryptionPurpose(artifactId), keyring);
        if (!existing) {
          const encryptedArtifact = encryptJson(artifact, artifactEncryptionPurpose(run.id), keyring);
          const encryptedMarkdown = encryptJson(markdown, markdownEncryptionPurpose(run.id), keyring);
          await tx.patternworkV31ReportArtifact.create({ data: {
            id: artifactId,
            reportRunId: run.id,
            reportId,
            artifactType: artifact.artifact_type,
            artifactStatus: "VALIDATED",
            canonicalJsonSha256: artifactSha,
            canonicalJsonCiphertext: encryptedArtifact.ciphertext,
            canonicalJsonNonce: encryptedArtifact.nonce,
            encryptionKeyVersion: encryptedArtifact.keyVersion,
            markdownSha256: sha256(markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n")),
            markdownCiphertext: encryptedMarkdown.ciphertext,
            markdownNonce: encryptedMarkdown.nonce,
            pdfStatus: "READY",
            pdfCiphertext: encryptedPdf.ciphertext,
            pdfNonce: encryptedPdf.nonce,
            pdfSha256: pdf.sha256,
          } });
        } else {
          await tx.patternworkV31ReportArtifact.update({ where: { reportRunId: run.id }, data: { pdfStatus: "READY", pdfCiphertext: encryptedPdf.ciphertext, pdfNonce: encryptedPdf.nonce, pdfSha256: pdf.sha256 } });
        }
        activations.push({ runId: run.id, artifactSha });
      }
      // No artifact becomes reader-visible until every artifact in the pass has been created and validated.
      for (const { runId, artifactSha } of activations) {
        await tx.patternworkV31ReportArtifact.update({ where: { reportRunId: runId }, data: { artifactStatus: "ACTIVE" } });
        await tx.patternworkV31ReportRun.update({ where: { id: runId }, data: {
          status: "SUCCEEDED",
          outputSha256: artifactSha,
          failureCode: null,
          failureMessage: null,
          finishedAt: new Date(),
        } });
      }
      const completed = await tx.patternworkV31ReportWorkflowAttempt.updateMany({
        where: { id: input.attemptId, attemptNumber: input.attemptNumber, status: "RUNNING", assessmentSnapshot: { currentReportAttemptNumber: input.attemptNumber } },
        data: { status: "SUCCEEDED", phase: "RELEASE", retryAudience: "NONE", failureCategory: null, failureCode: null, failureMessage: null, reportsReleasedAt: new Date(), finishedAt: new Date(), heartbeatAt: new Date() },
      });
      if (completed.count !== 1) throw new Error("stale_report_attempt:Release ownership was lost before commit.");
    });
  }

  async persistFailure(input: PassReportWorkflowInput, code: string, message: string, reportType?: ReportType, usages: readonly OpenRouterUsage[] = []): Promise<void> {
    if (reportType && usages.length > 0) {
      const usage = totalUsage(usages);
      await reportPrisma.patternworkV31ReportRun.updateMany({
        where: { reportType, reportWorkflowAttemptId: input.attemptId },
        data: {
          provider: "openrouter", model: usage.model, attemptCount: usage.attempts,
          providerRequestId: usage.requestId ?? usage.generationId, openRouterGenerationId: usage.generationId,
          inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens,
          totalTokens: usage.totalTokens, costMicros: BigInt(usage.costMicros), costCurrency: usage.currency,
        },
      });
    }
    await failReportAttempt(input, classifyReportFailure(code, message));
  }
}

let testDependencies: ReportWorkflowDependencies | undefined;

export function setReportWorkflowDependenciesForTests(dependencies: ReportWorkflowDependencies | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Report workflow dependency override is test-only.");
  testDependencies = dependencies;
}

export function getReportWorkflowDependencies(): ReportWorkflowDependencies {
  if (testDependencies) return testDependencies;
  const activation = activateReviewedPwqe5QualificationManifest(
    process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON,
    process.env.OPENROUTER_QUALIFICATION_MANIFEST_SHA256,
  );
  const rawCap = process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD;
  const capUsd = rawCap === undefined ? Number.NaN : Number(rawCap);
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("OPENROUTER_MAX_COST_PER_ASSESSMENT_USD must be configured as a positive number before live report generation.");
  return {
    snapshotBoundary: new PrismaSnapshotPacketBoundary(),
    persistence: new PrismaReportWorkflowPersistence(),
    provider: new OpenRouterClient(),
    costCapMicros: Math.floor(capUsd * 1_000_000),
    modelPolicy: activation.policy,
    preflight: async () => {
      const result = reportGenerationReadiness(await runReportPreflight());
      if (!result.ok) throw new Error(`preflight_configuration_failed:${result.checks.filter((check) => !check.ok).map((check) => `${check.name}=${check.message}`).join("; ")}`);
    },
  };
}
