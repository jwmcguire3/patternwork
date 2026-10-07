import assert from "node:assert/strict";
import test from "node:test";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import {
  PrismaSnapshotPacketBoundary,
  snapshotEncryptionPurpose,
} from "../../lib/server/reports/dependencies.ts";
import { encryptJson, encryptionKeyringFromEnv } from "../../lib/server/security/index.ts";

const keyring = encryptionKeyringFromEnv({
  APP_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 15).toString("base64"),
  APP_DATA_ENCRYPTION_KEY_VERSION: "test-v1",
});

function row(options: { rowStage?: string | null; canonicalStage?: string } = {}) {
  const canonicalSnapshot = {
    assessment_completion: {
      completion_mode: "pass1_complete",
      last_completed_stage: options.canonicalStage ?? "S2",
      safe_resume_stage: options.canonicalStage === "S1" ? "S1" : "S3",
      completed_at: "2026-09-03T12:00:00.000Z",
    },
    responses: [],
  };
  const encrypted = encryptJson(canonicalSnapshot, snapshotEncryptionPurpose("session-1", 1), keyring);
  return {
    id: "database-snapshot-1",
    assessmentSessionId: "session-1",
    snapshotId: "snapshot-1",
    snapshotRevision: "1",
    completedPass: 1,
    completionMode: "pass1_complete",
    lastCompletedStage: options.rowStage ?? "S2",
    safeResumeStage: options.rowStage === null ? null : options.rowStage === "S1" ? "S1" : "S3",
    evidenceSha256: "a".repeat(64),
    scopeSha256: "b".repeat(64),
    canonicalJsonSha256: sha256Canonical(canonicalSnapshot),
    canonicalJsonCiphertext: encrypted.ciphertext,
    canonicalJsonNonce: encrypted.nonce,
    encryptionKeyVersion: encrypted.keyVersion,
    evidencePackets: [],
  };
}

function boundaryFor(snapshotRow: ReturnType<typeof row>) {
  const database = {
    patternworkV31AssessmentSnapshot: { async findFirst() { return snapshotRow; } },
    patternworkV31EvidencePacket: { async upsert() {} },
  };
  return new PrismaSnapshotPacketBoundary(database as never, keyring);
}

const input = {
  assessmentSessionId: "session-1",
  snapshotId: "snapshot-1",
  completedPass: 1 as const,
  invocationKey: "test",
};

test("snapshot loader accepts matching row and canonical completion boundaries", async () => {
  const loaded = await boundaryFor(row()).loadAndDecryptSnapshot(input);
  assert.equal(loaded.completedPass, 1);
  assert.equal((loaded.canonicalSnapshot.assessment_completion as Record<string, unknown>).safe_resume_stage, "S3");
});

test("snapshot loader rejects invalid stored or canonical boundaries before packet reuse", async () => {
  await assert.rejects(boundaryFor(row({ rowStage: "S1" })).loadAndDecryptSnapshot(input), /Stored assessment snapshot completion boundary/u);
  await assert.rejects(boundaryFor(row({ rowStage: null })).loadAndDecryptSnapshot(input), /Stored assessment snapshot completion boundary/u);
  await assert.rejects(boundaryFor(row({ canonicalStage: "S1" })).loadAndDecryptSnapshot(input), /Canonical assessment snapshot completion boundary/u);
});
