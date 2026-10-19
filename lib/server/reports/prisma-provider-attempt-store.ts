import { prisma } from "../../prisma.ts";
import { decryptJson, encryptJson, encryptionKeyringFromEnv, type EncryptionKeyring } from "../security/index.ts";
import { QualificationAttemptError, QualificationAttemptStoreBase, type AttemptJournalMutation, type QualificationAttemptRecord } from "./qualification/attempt-store.ts";
import type { PassReportWorkflowInput, PreparedReportInputs } from "./types.ts";

export interface ProviderLedgerRow {
  assessmentSessionId: string; revision: number; ledgerCiphertext: Uint8Array; ledgerNonce: Uint8Array; encryptionKeyVersion: string;
}
export interface ProviderLedgerSnapshot {
  id: string; assessmentSessionId: string; snapshotId: string; snapshotRevision: string; completedPass: number;
  evidenceSha256: string; scopeSha256: string; currentReportAttemptNumber: number;
}
export interface ProviderLedgerWorkflowAttempt {
  id: string; assessmentSnapshotId: string; attemptNumber: number; invocationKey: string; status: string; startedAt?: Date | null;
}
export interface ProviderLedgerLegacyRun {
  reportWorkflowAttemptId: string; status: string; costMicros: bigint | number | null; costCurrency: string | null;
  provider: string | null; attemptCount: number; startedAt: Date | null; openRouterGenerationId: string | null;
}
export interface ProviderLedgerTransaction {
  patternworkV31AssessmentSession: { findUnique(args: unknown): Promise<{ id: string } | null> };
  patternworkV31AssessmentSnapshot: {
    findFirst(args: unknown): Promise<ProviderLedgerSnapshot | null>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportWorkflowAttempt: {
    findUnique(args: unknown): Promise<ProviderLedgerWorkflowAttempt | null>;
    findMany(args: unknown): Promise<ProviderLedgerWorkflowAttempt[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
  patternworkV31ReportRun: { findMany(args: unknown): Promise<ProviderLedgerLegacyRun[]> };
  patternworkV31ReportProviderLedger: {
    findUnique(args: unknown): Promise<ProviderLedgerRow | null>;
    create(args: unknown): Promise<unknown>;
    updateMany(args: unknown): Promise<{ count: number }>;
  };
}
export interface ProviderLedgerDatabase {
  $transaction<T>(fn: (tx: ProviderLedgerTransaction) => Promise<T>, options: { isolationLevel: "Serializable" }): Promise<T>;
}
interface SessionLedger {
  schemaVersion: 1;
  openingReportedCostMicros: number;
  attempts: readonly QualificationAttemptRecord[];
}
export const providerLedgerEncryptionPurpose = (sessionId: string) => `patternwork:report-provider-ledger:${sessionId}`;
const conflict = (message: string) => new QualificationAttemptError("resume_conflict", message);

/** One encrypted journal per session: every report, snapshot and workflow attempt shares its budget. */
export class PrismaProviderAttemptStore extends QualificationAttemptStoreBase {
  private readonly database: ProviderLedgerDatabase;
  private readonly keyring: EncryptionKeyring;
  constructor(private readonly context: {
    input: PassReportWorkflowInput; prepared: PreparedReportInputs; reportType: string;
    database?: ProviderLedgerDatabase; keyring?: EncryptionKeyring;
  }) {
    super();
    this.database = context.database ?? prisma as unknown as ProviderLedgerDatabase;
    this.keyring = context.keyring ?? encryptionKeyringFromEnv();
    if (!context.input.attemptId || !Number.isSafeInteger(context.input.attemptNumber) || context.input.attemptNumber! <= 0
      || context.input.assessmentSessionId !== context.prepared.snapshot.assessmentSessionId
      || context.input.snapshotId !== context.prepared.snapshot.snapshotId || context.input.completedPass !== context.prepared.snapshot.completedPass) throw conflict("Production provider journal requires an exact durable workflow and snapshot binding.");
  }
  override async begin(input: Parameters<QualificationAttemptStoreBase["begin"]>[0]) {
    if (input.usageStatus === "mock" || input.candidateAdmission
      || !input.request.idempotencyKey.startsWith(`${this.context.input.invocationKey}:${this.context.reportType}:`)
      || !input.request.schemaName.startsWith(`patternwork_${this.context.reportType.toLowerCase()}_pwrp71_`)) throw conflict("Production provider request is outside its workflow/report binding.");
    return super.begin(input);
  }
  protected async readAttempts(): Promise<readonly QualificationAttemptRecord[]> {
    return this.database.$transaction(async tx => {
      const row = await tx.patternworkV31ReportProviderLedger.findUnique({ where: { assessmentSessionId: this.context.input.assessmentSessionId } });
      return row ? this.decrypt(row).attempts : [];
    }, { isolationLevel: "Serializable" });
  }
  private decrypt(row: ProviderLedgerRow): SessionLedger {
    const value = decryptJson<SessionLedger>({ ciphertext: Buffer.from(row.ledgerCiphertext), nonce: Buffer.from(row.ledgerNonce), keyVersion: row.encryptionKeyVersion }, providerLedgerEncryptionPurpose(this.context.input.assessmentSessionId), this.keyring);
    if (value.schemaVersion !== 1 || !Array.isArray(value.attempts) || !Number.isSafeInteger(value.openingReportedCostMicros) || value.openingReportedCostMicros < 0) throw conflict("Encrypted provider ledger structure is invalid.");
    return value;
  }
  private async assertOwner(tx: ProviderLedgerTransaction): Promise<void> {
    const { input, prepared } = this.context;
    const snapshot = await tx.patternworkV31AssessmentSnapshot.findFirst({ where: { id: prepared.snapshot.databaseId, assessmentSessionId: input.assessmentSessionId, snapshotId: input.snapshotId } });
    const attempt = await tx.patternworkV31ReportWorkflowAttempt.findUnique({ where: { id: input.attemptId } });
    if (!snapshot || !attempt || snapshot.id !== prepared.snapshot.databaseId || snapshot.assessmentSessionId !== input.assessmentSessionId
      || snapshot.snapshotId !== input.snapshotId || snapshot.snapshotRevision !== prepared.snapshot.snapshotRevision
      || snapshot.completedPass !== input.completedPass || snapshot.evidenceSha256 !== prepared.snapshot.evidenceSha256 || snapshot.scopeSha256 !== prepared.snapshot.scopeSha256
      || attempt.assessmentSnapshotId !== snapshot.id || attempt.id !== input.attemptId || attempt.attemptNumber !== input.attemptNumber
      || attempt.invocationKey !== input.invocationKey || attempt.status !== "RUNNING" || snapshot.currentReportAttemptNumber !== input.attemptNumber) throw conflict("stale_report_attempt:Provider dispatch ownership was lost.");
    // These writes serialize admission with both attempt failure and snapshot owner advancement.
    const fencedSnapshot = await tx.patternworkV31AssessmentSnapshot.updateMany({ where: { id: snapshot.id, currentReportAttemptNumber: input.attemptNumber }, data: { currentReportAttemptNumber: input.attemptNumber } });
    const fencedAttempt = await tx.patternworkV31ReportWorkflowAttempt.updateMany({ where: { id: input.attemptId, attemptNumber: input.attemptNumber, status: "RUNNING" }, data: { heartbeatAt: new Date() } });
    if (fencedSnapshot.count !== 1 || fencedAttempt.count !== 1) throw conflict("stale_report_attempt:Provider dispatch ownership was lost.");
  }
  private async openingCost(tx: ProviderLedgerTransaction): Promise<number> {
    const sessionFilter = { assessmentSnapshot: { assessmentSessionId: this.context.input.assessmentSessionId } };
    const runs = await tx.patternworkV31ReportRun.findMany({ where: sessionFilter, select: { reportWorkflowAttemptId: true, status: true, costMicros: true, costCurrency: true, provider: true, attemptCount: true, startedAt: true, openRouterGenerationId: true } });
    const history = await tx.patternworkV31ReportWorkflowAttempt.findMany({ where: sessionFilter, select: { id: true, status: true, startedAt: true, assessmentSnapshotId: true, attemptNumber: true, invocationKey: true } });
    // An overwritten aggregate cannot establish the charges of an earlier unsuccessful workflow.
    for (const attempt of history) {
      if (attempt.id === this.context.input.attemptId || !attempt.startedAt) continue;
      if (attempt.status !== "SUCCEEDED" || !runs.some(run => run.reportWorkflowAttemptId === attempt.id && run.costMicros !== null)) throw new QualificationAttemptError("attempt_uncertain", "Historical report spending cannot be established safely for this assessment.");
    }
    let total = 0;
    for (const run of runs) {
      if (run.costMicros !== null) {
        const cost = Number(run.costMicros);
        if (run.costCurrency !== "USD" || !Number.isSafeInteger(cost) || cost < 0) throw conflict("Historical reported spending is invalid.");
        total += cost;
      } else {
        const pristineCurrent = run.reportWorkflowAttemptId === this.context.input.attemptId && run.status === "RUNNING" && !run.provider && run.attemptCount === 0 && !run.openRouterGenerationId;
        const neverStarted = !run.startedAt && !run.provider && run.attemptCount === 0 && !run.openRouterGenerationId;
        if (!pristineCurrent && !neverStarted) throw new QualificationAttemptError("attempt_uncertain", "Historical report usage is missing and remains unresolved.");
      }
    }
    if (!Number.isSafeInteger(total)) throw conflict("Historical report spending exceeds the supported accounting range.");
    return total;
  }
  protected async mutate<T>(fn: AttemptJournalMutation<T>, options: { readonly admission?: boolean } = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.database.$transaction(async tx => {
          const sessionId = this.context.input.assessmentSessionId;
          if (!await tx.patternworkV31AssessmentSession.findUnique({ where: { id: sessionId }, select: { id: true } })) throw conflict("Assessment was deleted; its provider ledger cannot be recreated.");
          if (options.admission) await this.assertOwner(tx);
          const row = await tx.patternworkV31ReportProviderLedger.findUnique({ where: { assessmentSessionId: sessionId } });
          if (!row && !options.admission) throw conflict("Provider settlement has no existing assessment ledger.");
          const current: SessionLedger = row ? this.decrypt(row) : { schemaVersion: 1, openingReportedCostMicros: await this.openingCost(tx), attempts: [] };
          const result = fn(current.attempts, current.openingReportedCostMicros);
          const encrypted = encryptJson({ ...current, attempts: result.next }, providerLedgerEncryptionPurpose(sessionId), this.keyring);
          const data = { ledgerCiphertext: encrypted.ciphertext, ledgerNonce: encrypted.nonce, encryptionKeyVersion: encrypted.keyVersion };
          if (row) {
            const updated = await tx.patternworkV31ReportProviderLedger.updateMany({ where: { assessmentSessionId: sessionId, revision: row.revision }, data: { ...data, revision: row.revision + 1 } });
            if (updated.count !== 1) throw Object.assign(new Error("Concurrent provider journal update."), { code: "P2034" });
          } else await tx.patternworkV31ReportProviderLedger.create({ data: { assessmentSessionId: sessionId, revision: 0, ...data } });
          return result.value;
        }, { isolationLevel: "Serializable" });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (attempt >= 3 || code !== "P2034" && code !== "P2002") throw error;
      }
    }
  }
}
