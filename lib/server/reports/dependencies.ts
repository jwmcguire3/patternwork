import type { JsonObject, ReportType } from "../../question-engine/types.ts";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { prisma } from "../../prisma.ts";
import { decryptJson, encryptJson, encryptionKeyringFromEnv, sha256 } from "../security/index.ts";
import { OpenRouterClient } from "../openrouter/client.ts";
import { activateReviewedQualificationManifest, totalUsage } from "../openrouter/policy.ts";
import type { OpenRouterUsage } from "../openrouter/types.ts";
import type {
  DecryptedAssessmentSnapshot,
  GeneratedCanonicalArtifact,
  PassReportWorkflowInput,
  PreparedReportInputs,
  ReportWorkflowDependencies,
  ReportWorkflowPersistence,
  SnapshotPacketBoundary,
} from "./types.ts";
import { buildPseudonymousPacketsFromCanonicalSnapshot } from "./packet-builder.ts";

interface SnapshotRow {
  id: string;
  assessmentSessionId: string;
  snapshotId: string;
  snapshotRevision: string;
  completedPass: number;
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
  artifact?: { canonicalJsonSha256: string; artifactStatus: string } | null;
}

interface ReportPrisma {
  patternworkV31AssessmentSnapshot: {
    findFirst(args: unknown): Promise<SnapshotRow | null>;
  };
  patternworkV31ReportRun: {
    findUnique(args: unknown): Promise<RunRow | null>;
    upsert(args: unknown): Promise<RunRow>;
    update(args: unknown): Promise<RunRow>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportArtifact: {
    findUnique(args: unknown): Promise<{ canonicalJsonSha256: string; artifactStatus: string } | null>;
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
  async loadAndDecryptSnapshot(input: PassReportWorkflowInput): Promise<DecryptedAssessmentSnapshot> {
    const row = await reportPrisma.patternworkV31AssessmentSnapshot.findFirst({
      where: {
        assessmentSessionId: input.assessmentSessionId,
        snapshotId: input.snapshotId,
        completedPass: input.completedPass,
      },
      include: { evidencePackets: { orderBy: { reportType: "asc" } } },
    });
    if (!row) throw new Error("Immutable assessment snapshot was not found for this pass.");
    if (row.completedPass !== 1 && row.completedPass !== 2) throw new Error("Snapshot completedPass is invalid.");
    const keyring = encryptionKeyringFromEnv();
    const canonicalSnapshot = decryptJson<JsonObject>({
      ciphertext: Buffer.from(row.canonicalJsonCiphertext),
      nonce: Buffer.from(row.canonicalJsonNonce),
      keyVersion: row.encryptionKeyVersion,
    }, snapshotEncryptionPurpose(row.assessmentSessionId, row.completedPass), keyring);
    if (sha256Canonical(canonicalSnapshot) !== row.canonicalJsonSha256) throw new Error("Decrypted assessment snapshot digest mismatch.");
    const persistedPackets = row.evidencePackets.map((packet) => decryptJson<JsonObject>({
      ciphertext: Buffer.from(packet.canonicalJsonCiphertext),
      nonce: Buffer.from(packet.canonicalJsonNonce),
      keyVersion: packet.encryptionKeyVersion,
    }, packetEncryptionPurpose(packet.id), keyring));
    return {
      databaseId: row.id,
      assessmentSessionId: row.assessmentSessionId,
      snapshotId: row.snapshotId,
      snapshotRevision: row.snapshotRevision,
      completedPass: row.completedPass,
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
    const keyring = encryptionKeyringFromEnv();
    await Promise.all(built.map(async (packet) => {
      const databaseId = `pwep_${sha256Canonical({ snapshotId: snapshot.snapshotId, reportType: packet.report_type }).slice(0, 32)}`;
      const encrypted = encryptJson(packet, packetEncryptionPurpose(databaseId), keyring);
      const completion = packet.assessment_completion as JsonObject;
      await reportPrisma.patternworkV31EvidencePacket.upsert({
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
  return `${input.invocationKey}:${reportType}`;
}

function inputDigest(reportType: ReportType, prepared: PreparedReportInputs): string {
  if (reportType === "MAP") return sha256Canonical(prepared.packets);
  if (reportType === "SYNTHESIS") return sha256Canonical(prepared.snapshot);
  const packet = prepared.packets.find((candidate) => candidate.report_type === reportType);
  if (!packet) throw new Error(`Missing ${reportType} packet input.`);
  return sha256Canonical(packet);
}

export class PrismaReportWorkflowPersistence implements ReportWorkflowPersistence {
  async initializeRuns(input: PassReportWorkflowInput, prepared: PreparedReportInputs): Promise<{ readonly alreadyReleased: boolean }> {
    const rows = await reportPrisma.$transaction(async (tx) => Promise.all(reportTypesForPass(input.completedPass).map((reportType) => tx.patternworkV31ReportRun.upsert({
      where: { idempotencyKey: runKey(input, reportType) },
      create: {
        assessmentSnapshotId: prepared.snapshot.databaseId,
        reportType,
        idempotencyKey: runKey(input, reportType),
        status: "RUNNING",
        promptRelease: "4.1.0",
        inputSha256: inputDigest(reportType, prepared),
        startedAt: new Date(),
      },
      update: {},
      include: { artifact: { select: { canonicalJsonSha256: true } } },
    }))));
    const alreadyReleased = rows.every((row) => row.status === "SUCCEEDED" && row.artifact?.artifactStatus === "ACTIVE");
    if (!alreadyReleased) {
      await Promise.all(rows.filter((row) => row.status !== "SUCCEEDED").map((row) => reportPrisma.patternworkV31ReportRun.update({
        where: { id: row.id },
        data: { status: "RUNNING", failureCode: null, failureMessage: null, startedAt: new Date(), finishedAt: null },
      })));
    }
    return { alreadyReleased: Boolean(alreadyReleased) };
  }

  async persistUsage(input: PassReportWorkflowInput, generated: GeneratedCanonicalArtifact): Promise<void> {
    const usage = generated.usage;
    await reportPrisma.patternworkV31ReportRun.update({
      where: { idempotencyKey: runKey(input, generated.reportType) },
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
  }

  async releaseAtomically(input: PassReportWorkflowInput, generated: readonly GeneratedCanonicalArtifact[]): Promise<void> {
    const expected = reportTypesForPass(input.completedPass);
    if (generated.length !== expected.length || expected.some((type) => !generated.some((item) => item.reportType === type))) {
      throw new Error("Atomic release requires the complete pass artifact set.");
    }
    const keyring = encryptionKeyringFromEnv();
    await reportPrisma.$transaction(async (tx) => {
      const activations: Array<{ runId: string; artifactSha: string }> = [];
      for (const item of generated) {
        const run = await tx.patternworkV31ReportRun.findUnique({ where: { idempotencyKey: runKey(input, item.reportType) } });
        if (!run) throw new Error(`Report run ${item.reportType} is missing.`);
        const artifact = item.artifact;
        const markdown = artifact.artifact_type === "synthesis_audit" ? artifact.reader_markdown : artifact.report_markdown;
        const reportId = artifact.artifact_type === "synthesis_audit" ? artifact.audit_id : artifact.report_id;
        const artifactSha = artifact.artifact_type === "synthesis_audit"
          ? String((artifact.digests as JsonObject).audit_sha256)
          : String((artifact.digests as JsonObject).artifact_sha256);
        const existing = await tx.patternworkV31ReportArtifact.findUnique({ where: { reportRunId: run.id } });
        if (existing && existing.canonicalJsonSha256 !== artifactSha) throw new Error("Immutable report artifact conflict during idempotent release.");
        if (!existing) {
          const encryptedArtifact = encryptJson(artifact, artifactEncryptionPurpose(run.id), keyring);
          const encryptedMarkdown = encryptJson(markdown, markdownEncryptionPurpose(run.id), keyring);
          await tx.patternworkV31ReportArtifact.create({ data: {
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
          } });
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
    });
  }

  async persistFailure(input: PassReportWorkflowInput, code: string, message: string, reportType?: ReportType, usages: readonly OpenRouterUsage[] = []): Promise<void> {
    if (reportType && usages.length > 0) {
      const usage = totalUsage(usages);
      await reportPrisma.patternworkV31ReportRun.update({
        where: { idempotencyKey: runKey(input, reportType) },
        data: {
          provider: "openrouter", model: usage.model, attemptCount: usage.attempts,
          providerRequestId: usage.requestId ?? usage.generationId, openRouterGenerationId: usage.generationId,
          inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, reasoningTokens: usage.reasoningTokens,
          totalTokens: usage.totalTokens, costMicros: BigInt(usage.costMicros), costCurrency: usage.currency,
        },
      });
    }
    await reportPrisma.patternworkV31ReportRun.updateMany({
      where: { idempotencyKey: { in: reportTypesForPass(input.completedPass).map((type) => runKey(input, type)) }, status: { not: "SUCCEEDED" } },
      data: { status: "FAILED", failureCode: code.slice(0, 120), failureMessage: message.slice(0, 1_000), finishedAt: new Date() },
    });
  }
}

let testDependencies: ReportWorkflowDependencies | undefined;

export function setReportWorkflowDependenciesForTests(dependencies: ReportWorkflowDependencies | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Report workflow dependency override is test-only.");
  testDependencies = dependencies;
}

export function getReportWorkflowDependencies(): ReportWorkflowDependencies {
  if (testDependencies) return testDependencies;
  const activation = activateReviewedQualificationManifest(process.env.OPENROUTER_QUALIFICATION_MANIFEST_JSON);
  const rawCap = process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD;
  const capUsd = rawCap === undefined ? Number.NaN : Number(rawCap);
  if (!Number.isFinite(capUsd) || capUsd <= 0) throw new Error("OPENROUTER_MAX_COST_PER_ASSESSMENT_USD must be configured as a positive number before live report generation.");
  return {
    snapshotBoundary: new PrismaSnapshotPacketBoundary(),
    persistence: new PrismaReportWorkflowPersistence(),
    provider: new OpenRouterClient(),
    costCapMicros: Math.floor(capUsd * 1_000_000),
    modelPolicy: activation.policy,
  };
}
