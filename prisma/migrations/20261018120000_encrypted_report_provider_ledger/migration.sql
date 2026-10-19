-- Additive only. Do not infer or reset historical provider spending during migration.
CREATE TABLE "PatternworkV31ReportProviderLedger" (
  "assessmentSessionId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0,
  "ledgerCiphertext" BYTEA NOT NULL,
  "ledgerNonce" BYTEA NOT NULL,
  "encryptionKeyVersion" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PatternworkV31ReportProviderLedger_pkey" PRIMARY KEY ("assessmentSessionId"),
  CONSTRAINT "PatternworkV31ReportProviderLedger_revision_check" CHECK ("revision" >= 0),
  CONSTRAINT "PatternworkV31ReportProviderLedger_nonce_check" CHECK (octet_length("ledgerNonce") = 12),
  CONSTRAINT "PatternworkV31ReportProviderLedger_assessmentSessionId_fkey"
    FOREIGN KEY ("assessmentSessionId") REFERENCES "PatternworkV31AssessmentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
