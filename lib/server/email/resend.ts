import { Resend } from "resend";
import type { EmailTransport, OutboundEmail } from "./types.ts";

export class ResendEmailTransport implements EmailTransport {
  async send(message: OutboundEmail, idempotencyKey: string): Promise<{ readonly id: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY is not configured.");
    const resend = new Resend(apiKey);
    const response = await resend.emails.send({
      from: message.from,
      to: message.to,
      ...(message.bcc ? { bcc: message.bcc } : {}),
      subject: message.subject,
      html: message.html,
      attachments: message.attachments?.map((attachment) => ({ filename: attachment.filename, content: attachment.content })),
    }, { idempotencyKey });
    if (response.error || !response.data?.id) throw new Error(response.error?.message ?? "Resend did not return a message ID.");
    return { id: response.data.id };
  }
}
