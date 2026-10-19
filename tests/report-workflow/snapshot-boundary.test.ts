import assert from "node:assert/strict";
import test from "node:test";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import {
  PrismaSnapshotPacketBoundary,
  snapshotEncryptionPurpose,
} from "../../lib/server/reports/dependencies.ts";
import { encryptJson, encryptString, encryptionKeyringFromEnv } from "../../lib/server/security/index.ts";

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

test("snapshot identity values stay local and are exposed only to the provider privacy guard", async () => {
  const email = "respondent@example.test";
  const encryptedEmail = encryptString(email, "patternwork:assessment-email:session-1", keyring);
  const snapshotRow = {
    ...row(),
    assessmentSession: {
      userId: "account-user-789",
      contactEmailHash: "f".repeat(64),
      contactEmailCiphertext: encryptedEmail.ciphertext,
      contactEmailNonce: encryptedEmail.nonce,
      encryptionKeyVersion: encryptedEmail.keyVersion,
    },
  };
  const boundary = boundaryFor(snapshotRow);
  const loaded = await boundary.loadAndDecryptSnapshot(input);
  const context = boundary.getLocalProviderIdentityContext?.(loaded);
  assert.deepEqual(context, {
    identityInventoryReviewed: true,
    respondentNames: [],
    accountIds: ["account-user-789"],
    otherIdentityTokens: ["f".repeat(64)],
    emails: [email],
  });
  const serializedSnapshot = JSON.stringify(loaded);
  assert.equal(serializedSnapshot.includes("account-user-789"), false);
  assert.equal(serializedSnapshot.includes("respondent@example.test"), false);
  assert.equal(serializedSnapshot.includes("f".repeat(64)), false);
});

test("snapshot loader extracts respondent-name values into local guard context", async () => {
  const canonicalSnapshot = {
    assessment_completion: {
      completion_mode: "pass1_complete",
      last_completed_stage: "S2",
      safe_resume_stage: "S3",
      completed_at: "2026-09-03T12:00:00.000Z",
    },
    responses: [{ respondent_name: "Mara Jones" }],
  };
  const encrypted = encryptJson(canonicalSnapshot, snapshotEncryptionPurpose("session-1", 1), keyring);
  const source = row();
  const snapshotRow = {
    ...source,
    canonicalJsonSha256: sha256Canonical(canonicalSnapshot),
    canonicalJsonCiphertext: encrypted.ciphertext,
    canonicalJsonNonce: encrypted.nonce,
    encryptionKeyVersion: encrypted.keyVersion,
  };
  const boundary = boundaryFor(snapshotRow);
  const loaded = await boundary.loadAndDecryptSnapshot(input);
  assert.deepEqual(boundary.getLocalProviderIdentityContext?.(loaded)?.respondentNames, ["Mara Jones"]);
});

test("snapshot loader rejects invalid stored or canonical boundaries before packet reuse", async () => {
  await assert.rejects(boundaryFor(row({ rowStage: "S1" })).loadAndDecryptSnapshot(input), /Stored assessment snapshot completion boundary/u);
  await assert.rejects(boundaryFor(row({ rowStage: null })).loadAndDecryptSnapshot(input), /Stored assessment snapshot completion boundary/u);
  await assert.rejects(boundaryFor(row({ canonicalStage: "S1" })).loadAndDecryptSnapshot(input), /Canonical assessment snapshot completion boundary/u);
});
