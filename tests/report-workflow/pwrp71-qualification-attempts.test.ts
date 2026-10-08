import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import {
  FileQualificationAttemptStore,
  JournaledPwrp71Transport,
  QualificationAttemptError,
} from "../../lib/server/reports/qualification/attempt-store.ts";
import type {
  OpenRouterGenerationRequest,
  OpenRouterGenerationResult,
  OpenRouterTransport,
} from "../../lib/server/openrouter/types.ts";

const request: OpenRouterGenerationRequest = {
  model: "openai/gpt-6-luna",
  reasoningEffort: "max",
  system: "Return the requested JSON object.",
  prompt: "Summarize the bound evidence.",
  schemaName: "pwrp71_attempt_test",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["ok"],
    properties: { ok: { type: "boolean" } },
  },
  maxOutputTokens: 1_024,
  idempotencyKey: "run-1:MAP:initial:luna-low",
};

const result: OpenRouterGenerationResult = {
  ok: true,
  output: { ok: true } as JsonObject,
  usage: {
    generationId: "offline-generation-1",
    inputTokens: 12,
    outputTokens: 4,
    reasoningTokens: 1,
    totalTokens: 16,
    costMicros: 30,
    currency: "USD",
    model: "openai/gpt-6-luna",
  },
  finishReason: "stop",
};

async function withStore(run: (store: FileQualificationAttemptStore) => Promise<void>): Promise<void> {
  const runDirectory = await mkdtemp(path.join(os.tmpdir(), "pwrp71-attempts-"));
  try {
    await run(new FileQualificationAttemptStore(runDirectory));
  } finally {
    await rm(runDirectory, { recursive: true, force: true });
  }
}

function provider(generate: OpenRouterTransport["generate"]): OpenRouterTransport {
  return { generate };
}

function journal(store: FileQualificationAttemptStore, transport: OpenRouterTransport, costCapMicros = 1_000_000): JournaledPwrp71Transport {
  return new JournaledPwrp71Transport({ store, transport, costCapMicros, now: () => new Date("2026-10-08T12:00:00.000Z") });
}

test("replays a completed provider result after restart without another transport call", async () => {
  await withStore(async (store) => {
    let firstCalls = 0;
    const firstRun = journal(store, provider(async () => {
      firstCalls += 1;
      return result;
    }));
    assert.deepEqual(await firstRun.generate(request), result);
    assert.equal(firstCalls, 1);

    let resumedCalls = 0;
    const resumedRun = journal(store, provider(async () => {
      resumedCalls += 1;
      throw new Error("completed request must not reach transport");
    }));
    assert.deepEqual(await resumedRun.generate(request), result);
    assert.equal(resumedCalls, 0);
    assert.equal((await store.get(request.idempotencyKey))?.status, "completed");
  });
});

test("rejects a reused attempt key when the exact request fingerprint changes", async () => {
  await withStore(async (store) => {
    await journal(store, provider(async () => result)).generate(request);
    let calls = 0;
    const changedRequest = { ...request, prompt: `${request.prompt} Changed.` };

    await assert.rejects(
      journal(store, provider(async () => {
        calls += 1;
        return result;
      })).generate(changedRequest),
      (error: unknown) => error instanceof QualificationAttemptError && error.code === "resume_conflict",
    );
    assert.equal(calls, 0);
  });
});

test("does not retry an attempt left started or marked unknown", async () => {
  await withStore(async (store) => {
    const wireRequest = { ...request };
    await store.begin({ request, wireRequest, costCapMicros: 1_000_000, startedAt: new Date("2026-10-08T12:00:00.000Z") });
    let calls = 0;
    const transport = provider(async () => {
      calls += 1;
      return result;
    });

    await assert.rejects(journal(store, transport).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "attempt_uncertain");
    assert.equal(calls, 0);

    await store.markUnknown(request.idempotencyKey, new Error("response outcome unclear"), 10, new Date("2026-10-08T12:00:00.010Z"));
    await assert.rejects(journal(store, transport).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "attempt_uncertain");
    assert.equal(calls, 0);
    assert.equal((await store.get(request.idempotencyKey))?.status, "unknown");
  });
});

test("blocks a call above the cost cap before invoking transport", async () => {
  await withStore(async (store) => {
    let calls = 0;
    const transport = provider(async () => {
      calls += 1;
      return result;
    });

    await assert.rejects(journal(store, transport, 0).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "budget_blocked");
    assert.equal(calls, 0);
    assert.equal(await store.get(request.idempotencyKey), undefined);
  });
});
