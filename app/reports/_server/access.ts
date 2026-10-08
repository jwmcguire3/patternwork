import { prisma } from "@/lib/prisma";
import { artifactEncryptionPurpose, markdownEncryptionPurpose, pdfEncryptionPurpose } from "@/lib/server/reports/dependencies";
import { ASSESSMENT_SESSION_COOKIE, constantTimeEqual, cookieKeyringFromEnv, decryptBytes, decryptJson, encryptJson, encryptionKeyringFromEnv, packEnvelope, readSessionCookieValue, scopedAccessTokenHash, sha256, unpackEnvelope } from "@/lib/server/security";

export const REPORT_VIEW_COOKIE = "pw_report_view";
export const reportViewCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV !== "development", sameSite: "lax" as const, path: "/", maxAge: 30 * 24 * 60 * 60 };

interface ReportViewClaim { readonly purpose: "report-view"; readonly sessionId: string; readonly expiresAt: string }

export function issueReportViewCookie(sessionId: string, expiresAt: Date): string {
  const claim: ReportViewClaim = { purpose: "report-view", sessionId, expiresAt: expiresAt.toISOString() };
  return packEnvelope(encryptJson(claim, "patternwork:report-view-cookie", cookieKeyringFromEnv()));
}

function readReportViewCookie(value: string | undefined, now = new Date()): string | null {
  if (!value) return null;
  try {
    const claim = decryptJson<ReportViewClaim>(unpackEnvelope(value), "patternwork:report-view-cookie", cookieKeyringFromEnv());
    return claim.purpose === "report-view" && claim.sessionId && new Date(claim.expiresAt) > now ? claim.sessionId : null;
  } catch { return null; }
}

export function cookieValue(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [candidate, ...value] = part.trim().split("=");
    if (candidate === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}

export function authorizedSessionFromCookies(values: { readonly assessment?: string; readonly report?: string }, now = new Date()): string | null {
  try {
    const assessment = readSessionCookieValue(values.assessment, cookieKeyringFromEnv(), now);
    if (assessment) return assessment.sessionId;
  } catch { /* The scoped report cookie remains available. */ }
  return readReportViewCookie(values.report, now);
}

export function authorizeReportRequest(request: Request, assessmentSessionId: string): boolean {
  const sessionId = authorizedSessionFromCookies({ assessment: cookieValue(request, ASSESSMENT_SESSION_COOKIE), report: cookieValue(request, REPORT_VIEW_COOKIE) });
  return Boolean(sessionId && constantTimeEqual(sessionId, assessmentSessionId));
}

export async function consumeViewReportToken(token: string, now = new Date(), database: Pick<typeof prisma, "$transaction"> = prisma): Promise<{ readonly sessionId: string; readonly expiresAt: Date }> {
  const digest = scopedAccessTokenHash(token, "VIEW_REPORT");
  return database.$transaction(async (tx) => {
    const record = await tx.patternworkV31AccessToken.findUnique({ where: { tokenHash: digest }, include: { assessmentSession: true } });
    if (!record || !constantTimeEqual(record.tokenHash, digest) || record.purpose !== "VIEW_REPORT" || record.usedAt || record.revokedAt || record.expiresAt <= now || (record.assessmentSession.retentionExpiresAt && record.assessmentSession.retentionExpiresAt <= now)) throw new Error("invalid_report_access");
    const consumed = await tx.patternworkV31AccessToken.updateMany({ where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (consumed.count !== 1) throw new Error("invalid_report_access");
    return { sessionId: record.assessmentSessionId, expiresAt: record.expiresAt };
  }, { isolationLevel: "Serializable" });
}

export interface ReaderArtifact {
  readonly reportId: string;
  readonly reportType: string;
  readonly markdown: string;
  readonly markdownSha256: string;
  readonly pdfSha256: string;
}

export interface ReaderArtifactSet { readonly completedPass: 1 | 2; readonly snapshotId: string; readonly artifacts: readonly ReaderArtifact[] }

const expectedReportTypes = (completedPass: number): readonly string[] => completedPass === 1 ? ["MAP"] : completedPass === 2 ? ["IFS", "PV", "ATT", "SYNTHESIS"] : [];

/**
 * This is deliberately stricter than artifactStatus.  An ACTIVE PDF is only
 * public after the *current* workflow attempt released the entire pass.  It
 * prevents a stale artifact from an abandoned/retried attempt becoming a
 * direct-download bypass around the bundle page.
 */
export function isCompleteReleasedReportSet(snapshot: {
  readonly completedPass: number;
  readonly currentReportAttemptNumber: number;
  readonly reportRuns: readonly {
    readonly id: string;
    readonly reportType: string;
    readonly status: string;
    readonly reportWorkflowAttemptId: string;
    readonly reportWorkflowAttempt: { readonly attemptNumber: number; readonly status: string };
    readonly artifact: { readonly artifactStatus: string; readonly pdfStatus: string; readonly pdfSha256: string | null } | null;
  }[];
}): boolean {
  const expected = expectedReportTypes(snapshot.completedPass);
  if (expected.length === 0 || snapshot.currentReportAttemptNumber < 1 || snapshot.reportRuns.length !== expected.length) return false;

  return expected.every((reportType) => {
    const run = snapshot.reportRuns.find((candidate) => candidate.reportType === reportType);
    return Boolean(
      run &&
      run.status === "SUCCEEDED" &&
      run.reportWorkflowAttempt.attemptNumber === snapshot.currentReportAttemptNumber &&
      run.reportWorkflowAttempt.status === "SUCCEEDED" &&
      run.artifact?.artifactStatus === "ACTIVE" &&
      run.artifact.pdfStatus === "READY" &&
      run.artifact.pdfSha256,
    );
  });
}

export interface ReportProgress {
  readonly generating: boolean;
  readonly failed: boolean;
  readonly reportStatus: "NOT_STARTED" | "QUEUED" | "GENERATING" | "READY" | "FAILED";
  readonly currentAttempt: { readonly attemptNumber: number; readonly status: string } | null;
}

export async function loadReportProgress(assessmentSessionId: string): Promise<ReportProgress> {
  const snapshots = await prisma.patternworkV31AssessmentSnapshot.findMany({
    where: { assessmentSessionId },
    select: {
      completedPass: true,
      currentReportAttemptNumber: true,
      reportAttempts: { orderBy: { attemptNumber: "asc" }, select: { attemptNumber: true, status: true } },
      reportRuns: { include: { artifact: true, reportWorkflowAttempt: { select: { attemptNumber: true, status: true } } } },
    },
  });
  const currentAttempts = snapshots.flatMap((snapshot) => snapshot.reportAttempts
    .filter((attempt) => attempt.attemptNumber === snapshot.currentReportAttemptNumber)
    .map((attempt) => ({ attemptNumber: attempt.attemptNumber, status: attempt.status, ready: isCompleteReleasedReportSet(snapshot) })));
  const currentAttempt = currentAttempts.at(-1) ?? null;
  const generating = currentAttempts.some((attempt) => !attempt.ready && ["QUEUED", "RUNNING"].includes(attempt.status));
  const failed = currentAttempts.some((attempt) => !attempt.ready && ["FAILED", "STALLED"].includes(attempt.status));
  const queued = currentAttempts.some((attempt) => !attempt.ready && attempt.status === "QUEUED");
  return {
    generating,
    failed,
    reportStatus: failed ? "FAILED" : currentAttempts.some((attempt) => attempt.ready) ? "READY" : queued ? "QUEUED" : generating ? "GENERATING" : "NOT_STARTED",
    currentAttempt: currentAttempt ? { attemptNumber: currentAttempt.attemptNumber, status: currentAttempt.status } : null,
  };
}

export async function loadActiveReportSets(assessmentSessionId: string): Promise<readonly ReaderArtifactSet[]> {
  const session = await prisma.patternworkV31AssessmentSession.findUnique({ where: { id: assessmentSessionId }, select: { retentionExpiresAt: true, status: true, snapshots: { orderBy: { frozenAt: "asc" }, select: { snapshotId: true, completedPass: true, currentReportAttemptNumber: true, reportRuns: { include: { artifact: true, reportWorkflowAttempt: { select: { attemptNumber: true, status: true } } } } } } } });
  if (!session || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= new Date())) return [];
  const keyring = encryptionKeyringFromEnv();
  const sets: ReaderArtifactSet[] = [];
  for (const snapshot of session.snapshots) {
    if (snapshot.completedPass !== 1 && snapshot.completedPass !== 2) continue;
    const expected = expectedReportTypes(snapshot.completedPass);
    if (!isCompleteReleasedReportSet(snapshot)) continue;
    const rows = snapshot.reportRuns;
    const artifacts = rows.sort((a, b) => expected.indexOf(a.reportType) - expected.indexOf(b.reportType)).map((run) => {
      const artifact = run.artifact!;
      const markdown = decryptJson<string>({ ciphertext: Buffer.from(artifact.markdownCiphertext), nonce: Buffer.from(artifact.markdownNonce), keyVersion: artifact.encryptionKeyVersion }, markdownEncryptionPurpose(run.id), keyring);
      if (sha256(markdown.replaceAll("\r\n", "\n").replaceAll("\r", "\n")) !== artifact.markdownSha256) throw new Error("Stored Markdown digest mismatch.");
      return { reportId: artifact.reportId, reportType: run.reportType, markdown, markdownSha256: artifact.markdownSha256, pdfSha256: artifact.pdfSha256! };
    });
    sets.push({ completedPass: snapshot.completedPass, snapshotId: snapshot.snapshotId, artifacts });
  }
  return sets;
}

export async function loadAuthorizedArtifact(assessmentSessionId: string, reportId: string): Promise<{ readonly reportType: string; readonly artifact: unknown; readonly digest: string } | null> {
  const row = await prisma.patternworkV31ReportArtifact.findFirst({ where: { reportId, artifactStatus: "ACTIVE", pdfStatus: "READY", reportRun: { assessmentSnapshot: { assessmentSessionId } } }, include: { reportRun: { include: { reportWorkflowAttempt: { select: { attemptNumber: true, status: true } }, assessmentSnapshot: { select: { completedPass: true, currentReportAttemptNumber: true, reportRuns: { include: { artifact: true, reportWorkflowAttempt: { select: { attemptNumber: true, status: true } } } } } } } } } });
  if (!row) return null;
  const snapshot = row.reportRun.assessmentSnapshot;
  if (!isCompleteReleasedReportSet(snapshot) || !snapshot.reportRuns.some((run) => run.id === row.reportRunId && run.artifact?.reportId === reportId)) return null;
  const artifact = decryptJson<unknown>({ ciphertext: Buffer.from(row.canonicalJsonCiphertext), nonce: Buffer.from(row.canonicalJsonNonce), keyVersion: row.encryptionKeyVersion }, artifactEncryptionPurpose(row.reportRunId), encryptionKeyringFromEnv());
  return { reportType: row.reportRun.reportType, artifact, digest: row.canonicalJsonSha256 };
}

export async function loadAuthorizedPdf(assessmentSessionId: string, reportId: string): Promise<{ readonly reportType: string; readonly pdf: Buffer; readonly digest: string } | null> {
  const row = await prisma.patternworkV31ReportArtifact.findFirst({ where: { reportId, artifactStatus: "ACTIVE", pdfStatus: "READY", reportRun: { assessmentSnapshot: { assessmentSessionId } } }, include: { reportRun: { include: { reportWorkflowAttempt: { select: { attemptNumber: true, status: true } }, assessmentSnapshot: { select: { completedPass: true, currentReportAttemptNumber: true, reportRuns: { include: { artifact: true, reportWorkflowAttempt: { select: { attemptNumber: true, status: true } } } } } } } } } });
  if (!row?.pdfCiphertext || !row.pdfNonce || !row.pdfSha256) return null;
  const snapshot = row.reportRun.assessmentSnapshot;
  if (!isCompleteReleasedReportSet(snapshot) || !snapshot.reportRuns.some((run) => run.id === row.reportRunId && run.artifact?.reportId === reportId)) return null;
  const pdf = decryptBytes({ ciphertext: Buffer.from(row.pdfCiphertext), nonce: Buffer.from(row.pdfNonce), keyVersion: row.encryptionKeyVersion }, pdfEncryptionPurpose(row.id), encryptionKeyringFromEnv());
  if (sha256(pdf) !== row.pdfSha256) throw new Error("Stored PDF digest mismatch.");
  return { reportType: row.reportRun.reportType, pdf, digest: row.pdfSha256 };
}
