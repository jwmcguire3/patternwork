import { render } from "@react-email/render";
import { prisma } from "../../prisma.ts";
import StatusNotification from "../../../emails/status-notification.tsx";
import { constantTimeEqual, decryptString, emailLookupHash, encryptString, encryptionKeyringFromEnv, normalizeEmail, sha256 } from "../security/index.ts";
import { ResendEmailTransport } from "../email/resend.ts";
import type { NotificationDependencies, CreateNotificationInput, NotificationDispatchBoundary } from "./types.ts";

function notificationId(key: string): string { return `pwn_${sha256(key).slice(0, 28)}`; }
function recipientPurpose(id: string): string { return `patternwork:notification-recipient:${id}`; }
function actionPurpose(id: string): string { return `patternwork:notification-action-url:${id}`; }

export class PrismaNotificationDelivery implements NotificationDispatchBoundary {
  constructor(private readonly dependencies: NotificationDependencies = {}) {}

  async create(input: CreateNotificationInput): Promise<{ readonly id: string }> {
    const id = notificationId(input.idempotencyKey);
    const keyring = encryptionKeyringFromEnv();
    const recipient = encryptString(normalizeEmail(input.email), recipientPurpose(id), keyring);
    const action = encryptString(input.actionUrl, actionPurpose(id), keyring);
    const record = await prisma.patternworkV31Notification.upsert({
      where: { idempotencyKey: input.idempotencyKey },
      create: {
        id, assessmentSessionId: input.assessmentSessionId, ...(input.assessmentSnapshotId ? { assessmentSnapshotId: input.assessmentSnapshotId } : {}), ...(input.reportWorkflowAttemptId ? { reportWorkflowAttemptId: input.reportWorkflowAttemptId } : {}),
        type: input.type, idempotencyKey: input.idempotencyKey, recipientEmailHash: emailLookupHash(input.email), recipientEmailCiphertext: Uint8Array.from(recipient.ciphertext), emailNonce: Uint8Array.from(recipient.nonce),
        actionUrlCiphertext: Uint8Array.from(action.ciphertext), actionUrlNonce: Uint8Array.from(action.nonce), encryptionKeyVersion: recipient.keyVersion,
      }, update: {},
    });
    const storedEmail = normalizeEmail(decryptString({ ciphertext: Buffer.from(record.recipientEmailCiphertext), nonce: Buffer.from(record.emailNonce), keyVersion: record.encryptionKeyVersion }, recipientPurpose(record.id), keyring));
    const storedActionUrl = decryptString({ ciphertext: Buffer.from(record.actionUrlCiphertext), nonce: Buffer.from(record.actionUrlNonce), keyVersion: record.encryptionKeyVersion }, actionPurpose(record.id), keyring);
    const matches = record.assessmentSessionId === input.assessmentSessionId
      && record.assessmentSnapshotId === (input.assessmentSnapshotId ?? null)
      && record.reportWorkflowAttemptId === (input.reportWorkflowAttemptId ?? null)
      && record.type === input.type
      && constantTimeEqual(storedEmail, normalizeEmail(input.email))
      && constantTimeEqual(storedActionUrl, input.actionUrl);
    if (!matches) throw new Error("Notification idempotency key conflicts with different input.");
    return { id: record.id };
  }

  async dispatch(notificationIdValue: string): Promise<void> {
    const record = await prisma.patternworkV31Notification.findUnique({ where: { id: notificationIdValue } });
    if (!record) throw new Error("Notification is unavailable.");
    if (record.status === "SENT" || record.status === "DELIVERED") return;
    await prisma.patternworkV31Notification.update({ where: { id: record.id }, data: { status: "SENDING", attemptCount: { increment: 1 }, failureCode: null, failureMessage: null } });
    try {
      const from = process.env.EMAIL_FROM;
      if (!from) throw new Error("EMAIL_FROM is not configured.");
      const keyring = encryptionKeyringFromEnv();
      const email = decryptString({ ciphertext: Buffer.from(record.recipientEmailCiphertext), nonce: Buffer.from(record.emailNonce), keyVersion: record.encryptionKeyVersion }, recipientPurpose(record.id), keyring);
      const actionUrl = decryptString({ ciphertext: Buffer.from(record.actionUrlCiphertext), nonce: Buffer.from(record.actionUrlNonce), keyVersion: record.encryptionKeyVersion }, actionPurpose(record.id), keyring);
      const html = await render(StatusNotification({ type: record.type, actionUrl }));
      const sent = await (this.dependencies.transport ?? new ResendEmailTransport()).send({ from, to: email, subject: notificationSubject(record.type), html }, record.idempotencyKey);
      await prisma.patternworkV31Notification.update({ where: { id: record.id }, data: { status: "SENT", providerMessageId: sent.id, resendMessageId: sent.id, sentAt: new Date() } });
    } catch (error) {
      await prisma.patternworkV31Notification.update({ where: { id: record.id }, data: { status: "FAILED", failureCode: notificationFailureCode(error), failureMessage: "Notification delivery could not be completed." } });
      throw error;
    }
  }
}

function notificationFailureCode(error: unknown): string {
  return error instanceof Error && error.message === "EMAIL_FROM is not configured."
    ? "notification_configuration_failed"
    : "notification_dispatch_failed";
}

function notificationSubject(type: CreateNotificationInput["type"]): string {
  return ({ RESUME_LINK: "Resume your Patternwork assessment", EXPORT_LINK: "Your secure Patternwork response export link", REPORT_STARTED: "Your Patternwork report is being prepared", REPORT_FAILED: "Update on your Patternwork report" })[type];
}

export function notificationIdempotencyKey(input: { readonly type: CreateNotificationInput["type"]; readonly subjectId: string }): string {
  return `notification:${input.type.toLowerCase()}:${input.subjectId}`;
}
