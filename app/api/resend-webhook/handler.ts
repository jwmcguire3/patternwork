import { NextResponse } from "next/server";
import type { PatternworkV31DeliveryStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { deliveryStatusForResendEvent, verifyResendWebhook } from "@/lib/server/email";
import { sha256 } from "@/lib/server/security";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  const payload = await request.text();
  try {
    const event = verifyResendWebhook(payload, request.headers, secret);
    const status = deliveryStatusForResendEvent(event.type);
    const messageId = typeof event.data.email_id === "string" ? event.data.email_id : undefined;
    if (status && messageId) await prisma.$transaction(async (tx) => {
      try {
        await tx.patternworkV31NotificationWebhookEvent.create({ data: { id: `pnwe_${sha256(event.id).slice(0, 28)}`, providerEventId: event.id, providerMessageId: messageId, eventType: event.type, payloadSha256: sha256(payload) } });
      } catch (error) {
        if ((error as { code?: string }).code === "P2002") return;
        throw error;
      }
      const deliverableStatuses: PatternworkV31DeliveryStatus[] = ["PENDING", "SENDING", "SENT"];
      const where = { OR: [{ resendMessageId: messageId }, { providerMessageId: messageId }], status: { in: deliverableStatuses } };
      const data = status === "DELIVERED" ? { status, deliveredAt: new Date(), failureCode: null, failureMessage: null } : { status, failureCode: event.type.slice(0, 120), failureMessage: `Verified Resend event: ${event.type}` };
      await tx.patternworkV31Notification.updateMany({ where, data });
      await tx.patternworkV31ReportDelivery.updateMany({ where, data });
    });
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
}
