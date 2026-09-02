import { createHmac } from "node:crypto";
import { render } from "@react-email/render";
import ReportDeliveryEmail from "../../../emails/report-delivery.tsx";
import { prisma } from "../../prisma.ts";
import { decryptBytes, decryptString, emailLookupHash, encryptString, encryptionKeyringFromEnv, normalizeEmail, scopedAccessTokenHash, sha256 } from "../security/index.ts";
import type { EmailAttachment, EmailTransport, ReportDeliveryBoundary } from "./types.ts";
import { ResendEmailTransport } from "./resend.ts";

const SINGLE_EMAIL_BASE64_LIMIT = 38 * 1024 * 1024;
const HARD_EMAIL_BASE64_LIMIT = 40 * 1024 * 1024;

export function reportDeliveryIdempotencyKey(input: { readonly assessmentSessionId: string; readonly completedPass: 1 | 2; readonly invocationKey: string }, partIndex: number, partCount: number): string {
  return `report:${input.assessmentSessionId}:pass-${input.completedPass}:${input.invocationKey}:part-${partIndex}-of-${partCount}`;
}

export function bccConfigurationFingerprint(value: string): string { return sha256(normalizeEmail(value)); }

interface DeliveryArtifact {
  readonly id: string;
  readonly reportType: string;
  readonly pdfCiphertext: Uint8Array;
  readonly pdfNonce: Uint8Array;
  readonly encryptionKeyVersion: string;
  readonly pdfSha256: string;
}

export function base64AttachmentSize(bytes: number): number { return Math.ceil(bytes / 3) * 4; }

export function splitAttachments(attachments: readonly EmailAttachment[]): readonly (readonly EmailAttachment[])[] {
  const total = attachments.reduce((sum, attachment) => sum + base64AttachmentSize(attachment.content.byteLength), 0);
  if (total <= SINGLE_EMAIL_BASE64_LIMIT) return [attachments];
  if (attachments.length < 2) throw new Error("A single PDF exceeds the safe Resend attachment size.");
  let bestIndex = 1;
  let bestDelta = Number.POSITIVE_INFINITY;
  for (let index = 1; index < attachments.length; index += 1) {
    const left = attachments.slice(0, index).reduce((sum, item) => sum + base64AttachmentSize(item.content.byteLength), 0);
    const delta = Math.abs(total - left * 2);
    if (delta < bestDelta) { bestDelta = delta; bestIndex = index; }
  }
  const parts = [attachments.slice(0, bestIndex), attachments.slice(bestIndex)] as const;
  if (parts.some((part) => part.reduce((sum, item) => sum + base64AttachmentSize(item.content.byteLength), 0) >= HARD_EMAIL_BASE64_LIMIT)) throw new Error("The report PDFs cannot fit within exactly two Resend messages.");
  return parts;
}

function deterministicViewToken(idempotencyKey: string): string {
  const secret = process.env.ASSESSMENT_COOKIE_SECRET;
  if (!secret || secret.length < 32) throw new Error("ASSESSMENT_COOKIE_SECRET must contain at least 32 characters.");
  return createHmac("sha256", secret).update(`patternwork:report-delivery:${idempotencyKey}`, "utf8").digest("base64url");
}

function filename(reportType: string): string {
  return ({ MAP: "patternwork-mapping-summary.pdf", IFS: "patternwork-ifs-report.pdf", PV: "patternwork-polyvagal-report.pdf", ATT: "patternwork-attachment-report.pdf", SYNTHESIS: "patternwork-synthesis-report.pdf" } as Record<string, string>)[reportType] ?? "patternwork-report.pdf";
}

export class PrismaResendReportDelivery implements ReportDeliveryBoundary {
  constructor(private readonly transport: EmailTransport = new ResendEmailTransport()) {}

  async deliverReleased(input: { readonly assessmentSessionId: string; readonly completedPass: 1 | 2; readonly invocationKey: string }): Promise<void> {
    const expected = input.completedPass === 1 ? ["MAP"] : ["IFS", "PV", "ATT", "SYNTHESIS"];
    const session = await prisma.patternworkV31AssessmentSession.findUnique({
      where: { id: input.assessmentSessionId },
      include: { snapshots: { where: { completedPass: input.completedPass }, include: { reportRuns: { include: { artifact: true } } } } },
    });
    if (!session?.contactEmailCiphertext || !session.contactEmailNonce) throw new Error("Report recipient is unavailable.");
    const snapshot = session.snapshots[0];
    const rows = snapshot?.reportRuns.filter((run) => expected.includes(run.reportType) && run.status === "SUCCEEDED" && run.artifact?.artifactStatus === "ACTIVE" && run.artifact.pdfStatus === "READY" && run.artifact.pdfCiphertext && run.artifact.pdfNonce && run.artifact.pdfSha256) ?? [];
    if (rows.length !== expected.length || expected.some((type) => !rows.some((row) => row.reportType === type))) throw new Error("Complete active PDF set is required before delivery.");
    const keyring = encryptionKeyringFromEnv();
    const email = normalizeEmail(decryptString({ ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion }, `patternwork:assessment-email:${session.id}`, keyring));
    const artifacts: DeliveryArtifact[] = rows.map((run) => ({ id: run.artifact!.id, reportType: run.reportType, pdfCiphertext: run.artifact!.pdfCiphertext!, pdfNonce: run.artifact!.pdfNonce!, encryptionKeyVersion: run.artifact!.encryptionKeyVersion, pdfSha256: run.artifact!.pdfSha256! })).sort((a, b) => expected.indexOf(a.reportType) - expected.indexOf(b.reportType));
    const attachments = artifacts.map((artifact) => {
      const content = decryptBytes({ ciphertext: Buffer.from(artifact.pdfCiphertext), nonce: Buffer.from(artifact.pdfNonce), keyVersion: artifact.encryptionKeyVersion }, `patternwork:report-pdf:${artifact.id}`, keyring);
      if (sha256(content) !== artifact.pdfSha256) throw new Error("Stored PDF digest binding failed before delivery.");
      return { filename: filename(artifact.reportType), content, contentType: "application/pdf" as const };
    });
    const parts = splitAttachments(attachments);
    const from = process.env.EMAIL_FROM;
    const bcc = process.env.REPORT_BCC_EMAIL;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!from || !bcc || !baseUrl) throw new Error("EMAIL_FROM, REPORT_BCC_EMAIL, and NEXT_PUBLIC_APP_URL are required for report delivery.");
    const bccFingerprint = bccConfigurationFingerprint(bcc);
    for (const [partIndex, part] of parts.entries()) {
      const key = reportDeliveryIdempotencyKey(input, partIndex + 1, parts.length);
      const token = deterministicViewToken(key);
      const expiresAt = new Date(Math.min(session.retentionExpiresAt?.getTime() ?? Date.now() + 30 * 86400000, Date.now() + 30 * 86400000));
      await prisma.patternworkV31AccessToken.upsert({ where: { tokenHash: scopedAccessTokenHash(token, "VIEW_REPORT") }, create: { assessmentSessionId: session.id, tokenHash: scopedAccessTokenHash(token, "VIEW_REPORT"), purpose: "VIEW_REPORT", expiresAt }, update: {} });
      const bundleUrl = new URL("/reports", baseUrl); bundleUrl.searchParams.set("token", token);
      const deliveryId = `pwrd_${sha256(key).slice(0, 28)}`;
      const recipient = encryptString(email, `patternwork:report-delivery-email:${deliveryId}`, keyring);
      const record = await prisma.patternworkV31ReportDelivery.upsert({ where: { idempotencyKey: key }, create: {
        id: deliveryId, reportArtifactId: artifacts[Math.min(partIndex, artifacts.length - 1)].id, idempotencyKey: key, status: "PENDING",
        recipientEmailHash: emailLookupHash(email), recipientEmailCiphertext: Uint8Array.from(recipient.ciphertext), emailNonce: Uint8Array.from(recipient.nonce),
        encryptionKeyVersion: recipient.keyVersion, bccConfigured: true, bccConfigurationFingerprint: bccFingerprint,
      }, update: {} });
      if (["SENT", "DELIVERED"].includes(record.status)) continue;
      await prisma.patternworkV31ReportDelivery.update({ where: { id: record.id }, data: { status: "SENDING", attemptCount: { increment: 1 }, failureCode: null, failureMessage: null } });
      try {
        const html = await render(ReportDeliveryEmail({ pass: input.completedPass, bundleUrl: bundleUrl.toString(), ...(parts.length === 2 ? { part: { index: (partIndex + 1) as 1 | 2, total: 2 as const } } : {}) }));
        const sent = await this.transport.send({ from, to: email, bcc, subject: input.completedPass === 1 ? "Your Patternwork Mapping Summary" : parts.length === 2 ? `Your Patternwork reports (${partIndex + 1} of 2)` : "Your Patternwork reports are ready", html, attachments: part }, key);
        await prisma.patternworkV31ReportDelivery.update({ where: { id: record.id }, data: { status: "SENT", providerMessageId: sent.id, resendMessageId: sent.id, sentAt: new Date() } });
      } catch (error) {
        await prisma.patternworkV31ReportDelivery.update({ where: { id: record.id }, data: { status: "FAILED", failureCode: "resend_send_failed", failureMessage: (error instanceof Error ? error.message : String(error)).slice(0, 1000) } });
        throw error;
      }
    }
  }
}

let testDelivery: ReportDeliveryBoundary | undefined;
export function setReportDeliveryBoundaryForTests(value: ReportDeliveryBoundary | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("Report delivery override is test-only.");
  testDelivery = value;
}
export function getReportDeliveryBoundary(): ReportDeliveryBoundary { return testDelivery ?? new PrismaResendReportDelivery(); }
