import { render } from "@react-email/render";
import { createHash } from "node:crypto";
import SecureLinkEmail from "../../../emails/secure-link.tsx";
import { ResendEmailTransport } from "../email/resend.ts";

export interface ResumeLinkDelivery {
  deliver(input: { readonly email: string; readonly resumeUrl: string; readonly expiresAt: Date }): Promise<void>;
}

export class ResendResumeLinkDelivery implements ResumeLinkDelivery {
  constructor(private readonly transport = new ResendEmailTransport()) {}

  async deliver(input: { readonly email: string; readonly resumeUrl: string; readonly expiresAt: Date }): Promise<void> {
    const from = process.env.EMAIL_FROM;
    if (!from) throw new Error("EMAIL_FROM is not configured.");
    const isReport = new URL(input.resumeUrl).pathname.startsWith("/reports");
    await this.transport.send({
      from,
      to: input.email,
      subject: isReport ? "Your secure Patternwork report link" : "Resume your Patternwork assessment",
      html: await render(SecureLinkEmail({ url: input.resumeUrl, expiresAt: input.expiresAt })),
    }, `secure-link:${isReport ? "report" : "resume"}:${createHash("sha256").update(input.resumeUrl, "utf8").digest("hex")}`);
  }
}

let configuredDelivery: ResumeLinkDelivery | undefined;

export function configureResumeLinkDelivery(delivery: ResumeLinkDelivery): () => void {
  const previous = configuredDelivery;
  configuredDelivery = delivery;
  return () => { configuredDelivery = previous; };
}

export function getResumeLinkDelivery(): ResumeLinkDelivery {
  return configuredDelivery ?? new ResendResumeLinkDelivery();
}
