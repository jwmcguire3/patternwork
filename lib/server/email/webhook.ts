import { createHmac, timingSafeEqual } from "node:crypto";

export interface VerifiedResendWebhook {
  readonly id: string;
  readonly type: string;
  readonly data: { readonly email_id?: string } & Readonly<Record<string, unknown>>;
}

function secretBytes(secret: string): Buffer {
  const encoded = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength < 16) throw new Error("RESEND_WEBHOOK_SECRET is malformed.");
  return bytes;
}

export function verifyResendWebhook(payload: string, headers: Headers, secret: string, now = new Date()): VerifiedResendWebhook {
  const id = headers.get("svix-id") ?? headers.get("webhook-id");
  const timestamp = headers.get("svix-timestamp") ?? headers.get("webhook-timestamp");
  const signatureHeader = headers.get("svix-signature") ?? headers.get("webhook-signature");
  if (!id || !timestamp || !signatureHeader) throw new Error("Webhook signature headers are missing.");
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(now.getTime() / 1000) - seconds) > 300) throw new Error("Webhook timestamp is outside the allowed tolerance.");
  const expected = createHmac("sha256", secretBytes(secret)).update(`${id}.${timestamp}.${payload}`, "utf8").digest();
  const valid = signatureHeader.split(/\s+/u).some((candidate) => {
    const encoded = candidate.includes(",") ? candidate.slice(candidate.indexOf(",") + 1) : candidate;
    try {
      const received = Buffer.from(encoded, "base64");
      return received.byteLength === expected.byteLength && timingSafeEqual(received, expected);
    } catch { return false; }
  });
  if (!valid) throw new Error("Webhook signature is invalid.");
  const value: unknown = JSON.parse(payload);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Webhook payload is invalid.");
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string" || !record.data || typeof record.data !== "object" || Array.isArray(record.data)) throw new Error("Webhook event shape is invalid.");
  return { id, type: record.type, data: record.data as VerifiedResendWebhook["data"] };
}

export function deliveryStatusForResendEvent(type: string): "DELIVERED" | "BOUNCED" | "FAILED" | undefined {
  if (type === "email.delivered") return "DELIVERED";
  if (["email.bounced", "email.complained", "email.suppressed"].includes(type)) return "BOUNCED";
  if (type === "email.failed") return "FAILED";
  return undefined;
}
