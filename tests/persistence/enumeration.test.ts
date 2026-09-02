import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../../app/api/reports/request-link/route.ts";

test("report-link request returns the same enumeration-safe response for malformed and invalid email input", async () => {
  const malformed = await POST(new NextRequest("https://patternwork.test/api/reports/request-link", { method: "POST", body: "{" }));
  const invalid = await POST(new NextRequest("https://patternwork.test/api/reports/request-link", { method: "POST", body: JSON.stringify({ email: "not-an-email" }), headers: { "content-type": "application/json" } }));
  assert.equal(malformed.status, 202);
  assert.equal(invalid.status, 202);
  assert.deepEqual(await malformed.json(), await invalid.json());
});
