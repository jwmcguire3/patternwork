import assert from "node:assert/strict";
import test from "node:test";
import {
  dispatchDeliveryParts,
  type DeliveryDispatchPart,
  type DeliveryDispatchPersistence,
  type DeliveryDispatchRecord,
  type DeliveryDispatchStatus,
} from "../../lib/server/email/delivery.ts";
import type { EmailTransport, OutboundEmail } from "../../lib/server/email/types.ts";

const message: OutboundEmail = {
  from: "reports@example.com",
  to: "reader@example.com",
  bcc: "audit@example.com",
  subject: "Reports",
  html: "<p>Reports</p>",
  attachments: [],
};

function part(idempotencyKey: string): DeliveryDispatchPart {
  return { idempotencyKey, message };
}

class MemoryDeliveryPersistence implements DeliveryDispatchPersistence {
  readonly statuses = new Map<string, DeliveryDispatchStatus>();
  readonly keysById = new Map<string, string>();
  readonly failAcknowledgementOnce = new Set<string>();

  seed(key: string, status: DeliveryDispatchStatus): void {
    this.statuses.set(key, status);
    this.keysById.set(`record:${key}`, key);
  }

  async prepare(value: DeliveryDispatchPart): Promise<DeliveryDispatchRecord> {
    if (!this.statuses.has(value.idempotencyKey)) this.seed(value.idempotencyKey, "PENDING");
    return { id: `record:${value.idempotencyKey}`, status: this.statuses.get(value.idempotencyKey)! };
  }

  async markSending(record: DeliveryDispatchRecord): Promise<void> {
    this.statuses.set(this.key(record), "SENDING");
  }

  async markSent(record: DeliveryDispatchRecord): Promise<void> {
    const key = this.key(record);
    if (this.failAcknowledgementOnce.delete(key)) throw new Error("database acknowledgement unavailable");
    this.statuses.set(key, "SENT");
  }

  async markFailed(record: DeliveryDispatchRecord): Promise<void> {
    this.statuses.set(this.key(record), "FAILED");
  }

  private key(record: DeliveryDispatchRecord): string {
    const key = this.keysById.get(record.id);
    if (!key) throw new Error("unknown delivery record");
    return key;
  }
}

class IdempotentProvider implements EmailTransport {
  readonly attempts = new Map<string, number>();
  readonly accepted = new Map<string, string>();
  readonly failOnce = new Set<string>();

  async send(_message: OutboundEmail, idempotencyKey: string): Promise<{ readonly id: string }> {
    this.attempts.set(idempotencyKey, (this.attempts.get(idempotencyKey) ?? 0) + 1);
    if (this.failOnce.delete(idempotencyKey)) throw new Error("provider unavailable");
    const existing = this.accepted.get(idempotencyKey);
    if (existing) return { id: existing };
    const id = `provider:${idempotencyKey}`;
    this.accepted.set(idempotencyKey, id);
    return { id };
  }
}

test("delivery resumes after a total provider failure", async () => {
  const persistence = new MemoryDeliveryPersistence();
  const provider = new IdempotentProvider();
  provider.failOnce.add("part-1");

  await assert.rejects(dispatchDeliveryParts([part("part-1")], persistence, provider), /provider unavailable/u);
  assert.equal(persistence.statuses.get("part-1"), "FAILED");

  await dispatchDeliveryParts([part("part-1")], persistence, provider);
  assert.equal(persistence.statuses.get("part-1"), "SENT");
  assert.equal(provider.accepted.size, 1);
});

test("split delivery replays only the part that did not succeed", async () => {
  const persistence = new MemoryDeliveryPersistence();
  const provider = new IdempotentProvider();
  provider.failOnce.add("part-2");
  const parts = [part("part-1"), part("part-2")];

  await assert.rejects(dispatchDeliveryParts(parts, persistence, provider), /provider unavailable/u);
  assert.equal(persistence.statuses.get("part-1"), "SENT");
  assert.equal(persistence.statuses.get("part-2"), "FAILED");

  await dispatchDeliveryParts(parts, persistence, provider);
  assert.equal(provider.attempts.get("part-1"), 1);
  assert.equal(provider.attempts.get("part-2"), 2);
  assert.deepEqual([...persistence.statuses.values()], ["SENT", "SENT"]);
});

test("provider success before database acknowledgement reuses the provider idempotency key", async () => {
  const persistence = new MemoryDeliveryPersistence();
  const provider = new IdempotentProvider();
  persistence.failAcknowledgementOnce.add("part-1");

  await assert.rejects(dispatchDeliveryParts([part("part-1")], persistence, provider), /database acknowledgement unavailable/u);
  assert.equal(persistence.statuses.get("part-1"), "SENDING");
  assert.equal(provider.accepted.size, 1);

  await dispatchDeliveryParts([part("part-1")], persistence, provider);
  assert.equal(provider.attempts.get("part-1"), 2);
  assert.equal(provider.accepted.size, 1);
  assert.equal(persistence.statuses.get("part-1"), "SENT");
});

test("already sent or delivered parts short circuit without calling the provider", async () => {
  const persistence = new MemoryDeliveryPersistence();
  const provider = new IdempotentProvider();
  persistence.seed("part-1", "DELIVERED");
  persistence.seed("part-2", "SENT");

  await dispatchDeliveryParts([part("part-1"), part("part-2")], persistence, provider);
  assert.equal(provider.attempts.size, 0);
  assert.equal(persistence.statuses.get("part-1"), "DELIVERED");
  assert.equal(persistence.statuses.get("part-2"), "SENT");
});
