import { prisma } from "../../prisma.ts";
import { decryptString, encryptionKeyringFromEnv, issueScopedAccessToken } from "../security/index.ts";
import { PrismaNotificationDelivery, notificationIdempotencyKey } from "./delivery.ts";

type ReportStatusNotificationType = "REPORT_STARTED" | "REPORT_FAILED";

export async function dispatchReportAttemptNotification(
  attemptId: string,
  type: ReportStatusNotificationType,
  boundary = new PrismaNotificationDelivery(),
): Promise<"SENT" | "FAILED"> {
  try {
    const idempotencyKey = notificationIdempotencyKey({ type, subjectId: attemptId });
    const existing = await prisma.patternworkV31Notification.findUnique({ where: { idempotencyKey }, select: { id: true } });
    if (existing) {
      await boundary.dispatch(existing.id);
      return "SENT";
    }

    const attempt = await prisma.patternworkV31ReportWorkflowAttempt.findUnique({
      where: { id: attemptId },
      include: { assessmentSnapshot: { include: { assessmentSession: true } } },
    });
    const session = attempt?.assessmentSnapshot.assessmentSession;
    if (!attempt || !session?.contactEmailCiphertext || !session.contactEmailNonce) return "FAILED";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? process.env.PATTERNWORK_APP_URL;
    if (!baseUrl) return "FAILED";

    const email = decryptString(
      { ciphertext: Buffer.from(session.contactEmailCiphertext), nonce: Buffer.from(session.contactEmailNonce), keyVersion: session.encryptionKeyVersion },
      `patternwork:assessment-email:${session.id}`,
      encryptionKeyringFromEnv(),
    );
    const issued = issueScopedAccessToken("VIEW_REPORT");
    await prisma.patternworkV31AccessToken.create({ data: { assessmentSessionId: session.id, tokenHash: issued.tokenHash, purpose: "VIEW_REPORT", expiresAt: issued.expiresAt } });
    const actionUrl = new URL("/reports", baseUrl);
    actionUrl.searchParams.set("token", issued.token);
    const created = await boundary.create({
      assessmentSessionId: session.id,
      assessmentSnapshotId: attempt.assessmentSnapshotId,
      reportWorkflowAttemptId: attempt.id,
      type,
      idempotencyKey,
      email,
      actionUrl: actionUrl.toString(),
    });
    await boundary.dispatch(created.id);
    return "SENT";
  } catch {
    return "FAILED";
  }
}
