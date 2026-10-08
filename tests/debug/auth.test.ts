import assert from "node:assert/strict";
import test from "node:test";
import { authorizeDebugRequest } from "../../lib/server/debug/auth.ts";

test("debug APIs require a separately configured operator token", () => {
  const prior = process.env.PATTERNWORK_DEBUG_TOKEN;
  delete process.env.PATTERNWORK_DEBUG_TOKEN;
  try {
    assert.equal(authorizeDebugRequest(new Request("http://localhost/api/debug/overview")), "disabled");
    process.env.PATTERNWORK_DEBUG_TOKEN = "configured-debug-token-that-is-long-enough-123";
    assert.equal(authorizeDebugRequest(new Request("http://localhost/api/debug/overview")), "unauthorized");
    assert.equal(authorizeDebugRequest(new Request("http://localhost/api/debug/overview", {
      headers: { authorization: "Bearer configured-debug-token-that-is-long-enough-123" },
    })), "authorized");
  } finally {
    if (prior === undefined) delete process.env.PATTERNWORK_DEBUG_TOKEN;
    else process.env.PATTERNWORK_DEBUG_TOKEN = prior;
  }
});
