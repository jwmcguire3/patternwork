import assert from "node:assert/strict";
import test from "node:test";
import { render } from "@react-email/render";
import { notificationIdempotencyKey } from "../../lib/server/notifications/delivery.ts";
import StatusNotification from "../../emails/status-notification.tsx";

test("notification keys are deterministic and type-scoped", () => {
  assert.equal(notificationIdempotencyKey({ type: "RESUME_LINK", subjectId: "token-1" }), notificationIdempotencyKey({ type: "RESUME_LINK", subjectId: "token-1" }));
  assert.notEqual(notificationIdempotencyKey({ type: "RESUME_LINK", subjectId: "token-1" }), notificationIdempotencyKey({ type: "EXPORT_LINK", subjectId: "token-1" }));
});

test("status templates contain only generic notification copy", async () => {
  const html = await render(StatusNotification({ type: "REPORT_FAILED", actionUrl: "https://example.test/return" }));
  assert.match(html, /unable to finish preparing your report/i);
  assert.doesNotMatch(html, /assessment response|private note|diagnostic/i);
});
