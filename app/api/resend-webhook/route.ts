import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { deliveryStatusForResendEvent, verifyResendWebhook } from "@/lib/server/email";

export async function POST(request: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook unavailable." }, { status: 503 });
  const payload = await request.text();
  try {
    const event = verifyResendWebhook(payload, request.headers, secret);
    const status = deliveryStatusForResendEvent(event.type);
    const messageId = typeof event.data.email_id === "string" ? event.data.email_id : undefined;
    if (status && messageId) {
      await prisma.patternworkV31ReportDelivery.updateMany({
        where: { OR: [{ resendMessageId: messageId }, { providerMessageId: messageId }] },
        data: {
          status,
          ...(status === "DELIVERED" ? { deliveredAt: new Date(), failureCode: null, failureMessage: null } : { failureCode: event.type.slice(0, 120), failureMessage: `Verified Resend event: ${event.type}` }),
        },
      });
    }
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }
}
