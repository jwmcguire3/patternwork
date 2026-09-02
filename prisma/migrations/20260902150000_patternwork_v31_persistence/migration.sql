-- Patternwork v3.1 persistence is additive. Legacy tables are intentionally untouched.
CREATE TYPE "PatternworkV31SessionStatus" AS ENUM ('IN_PROGRESS', 'PASS1_COMPLETE', 'PASS2_IN_PROGRESS', 'COMPLETE', 'PAUSED', 'ABANDONED');
CREATE TYPE "PatternworkV31ReportType" AS ENUM ('MAP', 'IFS', 'PV', 'ATT', 'SYNTHESIS');
CREATE TYPE "PatternworkV31RunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED');
CREATE TYPE "PatternworkV31DeliveryStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'DELIVERED', 'BOUNCED', 'FAILED');
CREATE TYPE "PatternworkV31AccessTokenPurpose" AS ENUM ('RESUME_ASSESSMENT', 'VIEW_REPORT');
CREATE TYPE "PatternworkV31PdfStatus" AS ENUM ('NOT_REQUESTED', 'PENDING', 'READY', 'FAILED');
CREATE TYPE "PatternworkV31ArtifactStatus" AS ENUM ('PENDING', 'VALIDATED', 'ACTIVE', 'FAILED');

CREATE TABLE "PatternworkV31SourceRelease" (
  "id" TEXT NOT NULL,
  "contractId" TEXT NOT NULL,
  "integrityContractId" TEXT NOT NULL,
  "packageVersion" TEXT NOT NULL,
  "promptRelease" TEXT NOT NULL,
  "sourceManifestSha256" TEXT NOT NULL,
  "sourceManifestJson" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31SourceRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31AssessmentSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "contactEmailHash" TEXT,
  "contactEmailCiphertext" BYTEA,
  "contactEmailNonce" BYTEA,
  "sourceReleaseId" TEXT NOT NULL,
  "assessmentKey" TEXT NOT NULL DEFAULT 'patternwork-v3.1',
  "consentVersion" TEXT NOT NULL,
  "consentedAt" TIMESTAMP(3) NOT NULL,
  "status" "PatternworkV31SessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
  "currentPass" INTEGER NOT NULL DEFAULT 1,
  "currentStage" TEXT NOT NULL DEFAULT 'S0',
  "safeResumeStage" TEXT,
  "stateCiphertext" BYTEA NOT NULL,
  "stateNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "optimisticRevision" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3),
  "retentionExpiresAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31AssessmentSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31AccessToken" (
  "id" TEXT NOT NULL,
  "assessmentSessionId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "purpose" "PatternworkV31AccessTokenPurpose" NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31AccessToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31AssessmentResponse" (
  "id" TEXT NOT NULL,
  "assessmentSessionId" TEXT NOT NULL,
  "responseId" TEXT NOT NULL,
  "interactionInstanceId" TEXT NOT NULL,
  "bankItemId" TEXT NOT NULL,
  "bankItemVersion" TEXT NOT NULL,
  "administrationSequence" INTEGER NOT NULL,
  "stage" TEXT NOT NULL,
  "completionState" TEXT NOT NULL,
  "requestSha256" TEXT NOT NULL,
  "responseOrderJson" JSONB NOT NULL,
  "responseCiphertext" BYTEA NOT NULL,
  "responseNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "answeredAt" TIMESTAMP(3),
  "skippedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31AssessmentResponse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31AssessmentSnapshot" (
  "id" TEXT NOT NULL,
  "assessmentSessionId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "snapshotRevision" TEXT NOT NULL,
  "completedPass" INTEGER NOT NULL,
  "completionMode" TEXT NOT NULL,
  "lastCompletedStage" TEXT NOT NULL,
  "safeResumeStage" TEXT,
  "contractId" TEXT NOT NULL,
  "integrityContractId" TEXT NOT NULL,
  "packetVersion" TEXT NOT NULL,
  "evidenceSha256" TEXT NOT NULL,
  "scopeSha256" TEXT NOT NULL,
  "canonicalJsonSha256" TEXT NOT NULL,
  "canonicalJsonCiphertext" BYTEA NOT NULL,
  "canonicalJsonNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "frozenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31AssessmentSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31EvidencePacket" (
  "id" TEXT NOT NULL,
  "assessmentSnapshotId" TEXT NOT NULL,
  "packetId" TEXT NOT NULL,
  "reportType" "PatternworkV31ReportType" NOT NULL,
  "packetVersion" TEXT NOT NULL,
  "completionMode" TEXT NOT NULL,
  "lastCompletedStage" TEXT NOT NULL,
  "safeResumeStage" TEXT,
  "canonicalJsonSha256" TEXT NOT NULL,
  "canonicalJsonCiphertext" BYTEA NOT NULL,
  "canonicalJsonNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31EvidencePacket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31ReportRun" (
  "id" TEXT NOT NULL,
  "assessmentSnapshotId" TEXT NOT NULL,
  "reportType" "PatternworkV31ReportType" NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PatternworkV31RunStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT,
  "model" TEXT,
  "promptRelease" TEXT NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "providerRequestId" TEXT,
  "openRouterGenerationId" TEXT,
  "inputSha256" TEXT NOT NULL,
  "outputSha256" TEXT,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "reasoningTokens" INTEGER,
  "totalTokens" INTEGER,
  "costMicros" BIGINT,
  "costCurrency" TEXT,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31ReportRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31ReportArtifact" (
  "id" TEXT NOT NULL,
  "reportRunId" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "artifactType" TEXT NOT NULL,
  "artifactStatus" "PatternworkV31ArtifactStatus" NOT NULL DEFAULT 'PENDING',
  "canonicalJsonSha256" TEXT NOT NULL,
  "canonicalJsonCiphertext" BYTEA NOT NULL,
  "canonicalJsonNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "markdownSha256" TEXT NOT NULL,
  "markdownCiphertext" BYTEA NOT NULL,
  "markdownNonce" BYTEA NOT NULL,
  "pdfStatus" "PatternworkV31PdfStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "pdfCiphertext" BYTEA,
  "pdfNonce" BYTEA,
  "pdfStorageKey" TEXT,
  "pdfSha256" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatternworkV31ReportArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PatternworkV31ReportDelivery" (
  "id" TEXT NOT NULL,
  "reportArtifactId" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "status" "PatternworkV31DeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "recipientEmailHash" TEXT NOT NULL,
  "recipientEmailCiphertext" BYTEA NOT NULL,
  "emailNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "bccConfigured" BOOLEAN NOT NULL DEFAULT false,
  "bccConfigurationFingerprint" TEXT,
  "providerMessageId" TEXT,
  "resendMessageId" TEXT,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "failureCode" TEXT,
  "failureMessage" TEXT,
  "sentAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31ReportDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PatternworkV31SourceRelease_sourceManifestSha256_key" ON "PatternworkV31SourceRelease"("sourceManifestSha256");
CREATE UNIQUE INDEX "PatternworkV31SourceRelease_contractId_integrityContractId__key" ON "PatternworkV31SourceRelease"("contractId", "integrityContractId", "packageVersion", "promptRelease");
CREATE INDEX "PatternworkV31AssessmentSession_userId_idx" ON "PatternworkV31AssessmentSession"("userId");
CREATE INDEX "PatternworkV31AssessmentSession_contactEmailHash_idx" ON "PatternworkV31AssessmentSession"("contactEmailHash");
CREATE INDEX "PatternworkV31AssessmentSession_sourceReleaseId_status_idx" ON "PatternworkV31AssessmentSession"("sourceReleaseId", "status");
CREATE INDEX "PatternworkV31AssessmentSession_expiresAt_idx" ON "PatternworkV31AssessmentSession"("expiresAt");
CREATE INDEX "PatternworkV31AssessmentSession_retentionExpiresAt_idx" ON "PatternworkV31AssessmentSession"("retentionExpiresAt");
CREATE UNIQUE INDEX "PatternworkV31AccessToken_tokenHash_key" ON "PatternworkV31AccessToken"("tokenHash");
CREATE INDEX "PatternworkV31AccessToken_assessmentSessionId_purpose_idx" ON "PatternworkV31AccessToken"("assessmentSessionId", "purpose");
CREATE INDEX "PatternworkV31AccessToken_expiresAt_idx" ON "PatternworkV31AccessToken"("expiresAt");
CREATE INDEX "PatternworkV31AssessmentResponse_assessmentSessionId_admini_idx" ON "PatternworkV31AssessmentResponse"("assessmentSessionId", "administrationSequence");
CREATE INDEX "PatternworkV31AssessmentResponse_bankItemId_bankItemVersion_idx" ON "PatternworkV31AssessmentResponse"("bankItemId", "bankItemVersion");
CREATE UNIQUE INDEX "PatternworkV31AssessmentResponse_assessmentSessionId_respon_key" ON "PatternworkV31AssessmentResponse"("assessmentSessionId", "responseId");
CREATE UNIQUE INDEX "PatternworkV31AssessmentResponse_assessmentSessionId_intera_key" ON "PatternworkV31AssessmentResponse"("assessmentSessionId", "interactionInstanceId");
CREATE INDEX "PatternworkV31AssessmentSnapshot_assessmentSessionId_frozen_idx" ON "PatternworkV31AssessmentSnapshot"("assessmentSessionId", "frozenAt");
CREATE UNIQUE INDEX "PatternworkV31AssessmentSnapshot_snapshotId_snapshotRevisio_key" ON "PatternworkV31AssessmentSnapshot"("snapshotId", "snapshotRevision");
CREATE UNIQUE INDEX "PatternworkV31AssessmentSnapshot_assessmentSessionId_comple_key" ON "PatternworkV31AssessmentSnapshot"("assessmentSessionId", "completedPass");
CREATE UNIQUE INDEX "PatternworkV31EvidencePacket_packetId_key" ON "PatternworkV31EvidencePacket"("packetId");
CREATE INDEX "PatternworkV31EvidencePacket_canonicalJsonSha256_idx" ON "PatternworkV31EvidencePacket"("canonicalJsonSha256");
CREATE UNIQUE INDEX "PatternworkV31EvidencePacket_assessmentSnapshotId_reportTyp_key" ON "PatternworkV31EvidencePacket"("assessmentSnapshotId", "reportType");
CREATE UNIQUE INDEX "PatternworkV31ReportRun_idempotencyKey_key" ON "PatternworkV31ReportRun"("idempotencyKey");
CREATE UNIQUE INDEX "PatternworkV31ReportRun_openRouterGenerationId_key" ON "PatternworkV31ReportRun"("openRouterGenerationId");
CREATE INDEX "PatternworkV31ReportRun_status_createdAt_idx" ON "PatternworkV31ReportRun"("status", "createdAt");
CREATE UNIQUE INDEX "PatternworkV31ReportRun_assessmentSnapshotId_reportType_key" ON "PatternworkV31ReportRun"("assessmentSnapshotId", "reportType");
CREATE UNIQUE INDEX "PatternworkV31ReportArtifact_reportRunId_key" ON "PatternworkV31ReportArtifact"("reportRunId");
CREATE UNIQUE INDEX "PatternworkV31ReportArtifact_reportId_key" ON "PatternworkV31ReportArtifact"("reportId");
CREATE INDEX "PatternworkV31ReportArtifact_canonicalJsonSha256_idx" ON "PatternworkV31ReportArtifact"("canonicalJsonSha256");
CREATE UNIQUE INDEX "PatternworkV31ReportDelivery_idempotencyKey_key" ON "PatternworkV31ReportDelivery"("idempotencyKey");
CREATE UNIQUE INDEX "PatternworkV31ReportDelivery_providerMessageId_key" ON "PatternworkV31ReportDelivery"("providerMessageId");
CREATE UNIQUE INDEX "PatternworkV31ReportDelivery_resendMessageId_key" ON "PatternworkV31ReportDelivery"("resendMessageId");
CREATE INDEX "PatternworkV31ReportDelivery_reportArtifactId_status_idx" ON "PatternworkV31ReportDelivery"("reportArtifactId", "status");
CREATE INDEX "PatternworkV31ReportDelivery_recipientEmailHash_idx" ON "PatternworkV31ReportDelivery"("recipientEmailHash");

ALTER TABLE "PatternworkV31AssessmentSession" ADD CONSTRAINT "PatternworkV31AssessmentSession_sourceReleaseId_fkey" FOREIGN KEY ("sourceReleaseId") REFERENCES "PatternworkV31SourceRelease"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31AccessToken" ADD CONSTRAINT "PatternworkV31AccessToken_assessmentSessionId_fkey" FOREIGN KEY ("assessmentSessionId") REFERENCES "PatternworkV31AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31AssessmentResponse" ADD CONSTRAINT "PatternworkV31AssessmentResponse_assessmentSessionId_fkey" FOREIGN KEY ("assessmentSessionId") REFERENCES "PatternworkV31AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31AssessmentSnapshot" ADD CONSTRAINT "PatternworkV31AssessmentSnapshot_assessmentSessionId_fkey" FOREIGN KEY ("assessmentSessionId") REFERENCES "PatternworkV31AssessmentSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31EvidencePacket" ADD CONSTRAINT "PatternworkV31EvidencePacket_assessmentSnapshotId_fkey" FOREIGN KEY ("assessmentSnapshotId") REFERENCES "PatternworkV31AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31ReportRun" ADD CONSTRAINT "PatternworkV31ReportRun_assessmentSnapshotId_fkey" FOREIGN KEY ("assessmentSnapshotId") REFERENCES "PatternworkV31AssessmentSnapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31ReportArtifact" ADD CONSTRAINT "PatternworkV31ReportArtifact_reportRunId_fkey" FOREIGN KEY ("reportRunId") REFERENCES "PatternworkV31ReportRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PatternworkV31ReportDelivery" ADD CONSTRAINT "PatternworkV31ReportDelivery_reportArtifactId_fkey" FOREIGN KEY ("reportArtifactId") REFERENCES "PatternworkV31ReportArtifact"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
