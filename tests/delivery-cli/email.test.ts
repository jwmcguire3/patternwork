import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { bccConfigurationFingerprint, reportDeliveryIdempotencyKey, splitAttachments } from "../../lib/server/email/delivery.ts";
import { deliveryStatusForResendEvent, verifyResendWebhook } from "../../lib/server/email/webhook.ts";

test("report delivery keys and BCC fingerprints are deterministic", () => {
  const input = { assessmentSessionId: "session-1", completedPass: 2 as const, invocationKey: "snapshot-7" };
  assert.equal(reportDeliveryIdempotencyKey(input, 1, 2), reportDeliveryIdempotencyKey(input, 1, 2));
  assert.notEqual(reportDeliveryIdempotencyKey(input, 1, 2), reportDeliveryIdempotencyKey(input, 2, 2));
  assert.equal(bccConfigurationFingerprint(" Audit@Example.com "), bccConfigurationFingerprint("audit@example.com"));
});

test("attachments approaching 40 MB split into exactly two messages", () => {
  const attachments = Array.from({ length: 4 }, (_, index) => ({ filename: `${index}.pdf`, content: Buffer.alloc(8 * 1024 * 1024), contentType: "application/pdf" as const }));
  const parts = splitAttachments(attachments);
  assert.equal(parts.length, 2);
  assert.deepEqual(parts.flat().map((item) => item.filename), attachments.map((item) => item.filename));
});

test("webhook state changes require a valid timestamped signature", () => {
  const secretBytes = Buffer.alloc(32, 7); const secret = `whsec_${secretBytes.toString("base64")}`;
  const payload = JSON.stringify({ type: "email.delivered", data: { email_id: "em_123" } });
  const id = "msg_1"; const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${payload}`).digest("base64");
  const event = verifyResendWebhook(payload, new Headers({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}` }), secret);
  assert.equal(deliveryStatusForResendEvent(event.type), "DELIVERED");
  assert.throws(() => verifyResendWebhook(payload, new Headers({ "svix-id": id, "svix-timestamp": timestamp, "svix-signature": "v1,bad" }), secret), /invalid/u);
});
