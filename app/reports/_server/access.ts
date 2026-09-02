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

export async function loadReportProgress(assessmentSessionId: string): Promise<{ readonly generating: boolean; readonly failed: boolean }> {
  const rows = await prisma.patternworkV31ReportRun.findMany({ where: { assessmentSnapshot: { assessmentSessionId } }, select: { status: true } });
  return { generating: rows.some((row) => ["QUEUED", "RUNNING"].includes(row.status)), failed: rows.some((row) => row.status === "FAILED") };
}

export async function loadActiveReportSets(assessmentSessionId: string): Promise<readonly ReaderArtifactSet[]> {
  const session = await prisma.patternworkV31AssessmentSession.findUnique({ where: { id: assessmentSessionId }, select: { retentionExpiresAt: true, status: true, snapshots: { orderBy: { frozenAt: "asc" }, select: { snapshotId: true, completedPass: true, reportRuns: { select: { reportType: true, status: true, id: true, artifact: true } } } } } });
  if (!session || session.status === "ABANDONED" || (session.retentionExpiresAt && session.retentionExpiresAt <= new Date())) return [];
  const keyring = encryptionKeyringFromEnv();
  const sets: ReaderArtifactSet[] = [];
  for (const snapshot of session.snapshots) {
    if (snapshot.completedPass !== 1 && snapshot.completedPass !== 2) continue;
    const expected = snapshot.completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
    const rows = snapshot.reportRuns.filter((run) => expected.includes(run.reportType) && run.status === "SUCCEEDED" && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY" && run.artifact.pdfSha256);
    if (rows.length !== expected.length || expected.some((type) => !rows.some((row) => row.reportType === type))) continue;
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
  const row = await prisma.patternworkV31ReportArtifact.findFirst({ where: { reportId, artifactStatus: "ACTIVE", pdfStatus: "READY", reportRun: { assessmentSnapshot: { assessmentSessionId } } }, include: { reportRun: true } });
  if (!row) return null;
  const artifact = decryptJson<unknown>({ ciphertext: Buffer.from(row.canonicalJsonCiphertext), nonce: Buffer.from(row.canonicalJsonNonce), keyVersion: row.encryptionKeyVersion }, artifactEncryptionPurpose(row.reportRunId), encryptionKeyringFromEnv());
  return { reportType: row.reportRun.reportType, artifact, digest: row.canonicalJsonSha256 };
}

export async function loadAuthorizedPdf(assessmentSessionId: string, reportId: string): Promise<{ readonly reportType: string; readonly pdf: Buffer; readonly digest: string } | null> {
  const row = await prisma.patternworkV31ReportArtifact.findFirst({ where: { reportId, artifactStatus: "ACTIVE", pdfStatus: "READY", reportRun: { assessmentSnapshot: { assessmentSessionId } } }, include: { reportRun: true } });
  if (!row?.pdfCiphertext || !row.pdfNonce || !row.pdfSha256) return null;
  const pdf = decryptBytes({ ciphertext: Buffer.from(row.pdfCiphertext), nonce: Buffer.from(row.pdfNonce), keyVersion: row.encryptionKeyVersion }, pdfEncryptionPurpose(row.id), encryptionKeyringFromEnv());
  if (sha256(pdf) !== row.pdfSha256) throw new Error("Stored PDF digest mismatch.");
  return { reportType: row.reportRun.reportType, pdf, digest: row.pdfSha256 };
}
