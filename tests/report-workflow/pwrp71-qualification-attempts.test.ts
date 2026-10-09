import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import {
  FileQualificationAttemptStore,
  JournaledPwrp71Transport,
  QualificationAttemptError,
  qualificationAttemptFingerprint,
} from "../../lib/server/reports/qualification/attempt-store.ts";
import { renameFileWithTransientRetry } from "../../lib/server/reports/qualification/atomic-file.ts";
import type {
  OpenRouterGenerationRequest,
  OpenRouterGenerationResult,
  OpenRouterTransport,
} from "../../lib/server/openrouter/types.ts";
import { GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, maximumQuotedCallCostMicros } from "../../lib/server/openrouter/qualification-budget.ts";
import { projectOpenRouterStrictSchemaObject } from "../../lib/server/openrouter/schema-projection.ts";
import { OpenRouterTransportError } from "../../lib/server/openrouter/types.ts";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";

const TEST_SCRATCH = path.join(process.cwd(), ".codex-temp", "test-runs");

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
  await mkdir(TEST_SCRATCH, { recursive: true });
  const runDirectory = await mkdtemp(path.join(TEST_SCRATCH, "pwrp71-attempts-"));
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
  return new JournaledPwrp71Transport({ store, transport, maxCallCostMicros: costCapMicros, aggregateCostCapMicros: costCapMicros, now: () => new Date("2026-10-08T12:00:00.000Z") });
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

test("atomic qualification file replacement retries transient Windows locks and bounds the retry", async () => {
  const delays: number[] = [];
  let renameCalls = 0;
  await renameFileWithTransientRetry("from.tmp", "attempts.json", async () => {
    renameCalls += 1;
    if (renameCalls <= 2) throw Object.assign(new Error("destination is temporarily busy"), { code: "EPERM" });
  }, async (milliseconds) => { delays.push(milliseconds); });
  assert.equal(renameCalls, 3);
  assert.deepEqual(delays, [15, 30]);

  const boundedDelays: number[] = [];
  let boundedCalls = 0;
  await assert.rejects(renameFileWithTransientRetry("from.tmp", "attempts.json", async () => {
    boundedCalls += 1;
    throw Object.assign(new Error("destination remains busy"), { code: "EBUSY" });
  }, async (milliseconds) => { boundedDelays.push(milliseconds); }), /destination remains busy/u);
  assert.equal(boundedCalls, 9);
  assert.equal(boundedDelays.length, 8);

  let permanentCalls = 0;
  await assert.rejects(renameFileWithTransientRetry("from.tmp", "attempts.json", async () => {
    permanentCalls += 1;
    throw Object.assign(new Error("invalid destination"), { code: "EINVAL" });
  }, async () => { assert.fail("permanent rename failures must not be retried"); }), /invalid destination/u);
  assert.equal(permanentCalls, 1);
});

test("exhausted journal replacement retries preserve the old ledger and block dispatch", async () => {
  await withStore(async (store) => {
    const priorRequest = { ...request, idempotencyKey: "run-prior" };
    await journal(store, provider(async () => result)).generate(priorRequest);
    const before = await readFile(store.attemptsPath, "utf8");
    let replacementAttempts = 0;
    const failingStore = new FileQualificationAttemptStore(store.runDirectory, (from, to) => renameFileWithTransientRetry(
      from,
      to,
      async () => {
        replacementAttempts += 1;
        throw Object.assign(new Error("destination remains busy"), { code: "EPERM" });
      },
      async () => undefined,
    ));
    let dispatches = 0;
    const blockedRequest = { ...request, idempotencyKey: "run-write-blocked" };

    await assert.rejects(journal(failingStore, provider(async () => {
      dispatches += 1;
      return result;
    })).generate(blockedRequest), /destination remains busy/u);

    assert.equal(replacementAttempts, 9);
    assert.equal(dispatches, 0);
    assert.equal(await readFile(store.attemptsPath, "utf8"), before);
    assert.deepEqual((await store.list()).map((attempt) => attempt.attemptId), ["run-prior"]);
    await assert.rejects(access(`${store.attemptsPath}.lock`), { code: "ENOENT" });
    assert.deepEqual(await readdir(store.runDirectory), ["attempts.json"]);
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
    const wireRequest = {
      ...request,
      schema: projectOpenRouterStrictSchemaObject(request.schema),
      providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
      promptCacheOptions: { mode: "explicit" as const },
      includeUsage: true,
    };
    await store.begin({ request, wireRequest, maxCallCostMicros: 1_000_000, aggregateCostCapMicros: 1_000_000, usageStatus: "reported", startedAt: new Date("2026-10-08T12:00:00.000Z") });
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

test("reserves the exact conservative price ceiling and admits a call at the per-call cap", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    await journal(store, provider(async () => { calls += 1; return result; }), ceiling).generate(request);
    const record = await store.get(request.idempotencyKey);
    assert.equal(calls, 1);
    assert.equal(record?.reservedCostMicros, ceiling);
    assert.equal(record?.maximumCallCostMicros, ceiling);
    assert.match(record?.wirePayloadSha256 ?? "", /^[a-f0-9]{64}$/u);
  });
});

test("blocks a call one microdollar over its conservative per-call ceiling without dispatch", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; }), ceiling - 1).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "budget_blocked");
    assert.equal(calls, 0);
    assert.equal(await store.get(request.idempotencyKey), undefined);
  });
});

test("an aggregate budget below one-call reservation rejects before provider dispatch", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    const constrained = new JournaledPwrp71Transport({
      store, transport: provider(async () => { calls += 1; return result; }),
      maxCallCostMicros: ceiling + 1, aggregateCostCapMicros: ceiling - 1,
    });
    await assert.rejects(constrained.generate(request), (error: unknown) => error instanceof QualificationAttemptError && error.code === "budget_blocked");
    assert.equal(calls, 0);
  });
});

test("concurrent calls cannot reserve the same aggregate remainder", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const transport = provider(async () => { calls += 1; await waiting; return result; });
    const first = journal(store, transport, ceiling).generate(request);
    for (let attempt = 0; attempt < 100 && calls === 0; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 1));
    assert.equal(calls, 1, "first call should dispatch only after its reservation is durable");
    const secondRequest = { ...request, idempotencyKey: `${request.idempotencyKey}:second` };
    await assert.rejects(journal(store, transport, ceiling).generate(secondRequest), (error: unknown) => error instanceof QualificationAttemptError && error.code === "budget_blocked");
    assert.equal(calls, 1);
    release();
    await first;
    assert.equal((await store.list()).reduce((sum, row) => sum + (row.reservedCostMicros ?? 0), 0), ceiling);
  });
});

test("unknown attempts retain their reservation and block a new billable attempt", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    const pending = await store.begin({
      request,
      wireRequest: {
        ...request,
        schema: projectOpenRouterStrictSchemaObject(request.schema),
        providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
        promptCacheOptions: { mode: "explicit" },
      },
      maxCallCostMicros: ceiling,
      aggregateCostCapMicros: ceiling,
      usageStatus: "reported",
      startedAt: new Date("2026-10-08T12:00:00.000Z"),
    });
    await store.markUnknown(request.idempotencyKey, new Error("timeout after dispatch"), 5, new Date("2026-10-08T12:00:00.005Z"));
    assert.equal((await store.get(request.idempotencyKey))?.reservedCostMicros, pending.record.reservedCostMicros);
    const next = { ...request, idempotencyKey: `${request.idempotencyKey}:next` };
    let calls = 0;
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; }), ceiling).generate(next), (error: unknown) => error instanceof QualificationAttemptError && error.code === "budget_blocked");
    assert.equal(calls, 0);
  });
});

test("attempt identity pins the per-call and aggregate caps", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    await journal(store, provider(async () => result), ceiling + 1).generate(request);
    let calls = 0;
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; }), ceiling + 2).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "resume_conflict");
    assert.equal(calls, 0);
  });
});

test("a changed published price-basis digest changes the replay fingerprint", () => {
  const wireRequest = {
    ...request,
    schema: projectOpenRouterStrictSchemaObject(request.schema),
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" as const },
  };
  const pinned = qualificationAttemptFingerprint({ request, wireRequest, maxCallCostMicros: 500_000, aggregateCostCapMicros: 1_000_000 });
  const changedBasis = qualificationAttemptFingerprint({
    request, wireRequest, maxCallCostMicros: 500_000, aggregateCostCapMicros: 1_000_000,
    billingBasisSha256: "f".repeat(64),
  });
  assert.notEqual(pinned, changedBasis);
  assert.notEqual(pinned, qualificationAttemptFingerprint({
    request, wireRequest, endpoint: "https://openrouter.ai/alternate/chat/completions",
    maxCallCostMicros: 500_000, aggregateCostCapMicros: 1_000_000,
  }), "the exact provider endpoint is part of the durable request fingerprint");
});

test("attempt identity rejects changed model, schema, or provider price envelope without dispatch", async () => {
  for (const mutate of [
    (value: OpenRouterGenerationRequest) => ({ ...value, model: "openai/gpt-6-sol" }),
    (value: OpenRouterGenerationRequest) => ({ ...value, schema: { ...value.schema, title: "changed schema" } as JsonObject }),
  ]) {
    await withStore(async (store) => {
      await journal(store, provider(async () => result)).generate(request);
      let calls = 0;
      await assert.rejects(journal(store, provider(async () => { calls += 1; return result; })).generate(mutate(request)), (error: unknown) =>
        error instanceof QualificationAttemptError && error.code === "resume_conflict");
      assert.equal(calls, 0);
    });
  }
  await withStore(async (store) => {
    const requestWithDifferentPriceEnvelope = {
      ...request,
      schema: projectOpenRouterStrictSchemaObject(request.schema),
      providerPolicy: { ...GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, max_price: { prompt: 0.09, completion: 0.45 } },
      promptCacheOptions: { mode: "explicit" as const },
    };
    await store.begin({
      request,
      wireRequest: requestWithDifferentPriceEnvelope,
      maxCallCostMicros: 1_000_000,
      aggregateCostCapMicros: 1_000_000,
      usageStatus: "reported",
      startedAt: new Date("2026-10-08T12:00:00.000Z"),
    });
    let calls = 0;
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; })).generate(request), (error: unknown) =>
      error instanceof QualificationAttemptError && error.code === "resume_conflict");
    assert.equal(calls, 0);
  });
});

test("provider cost or model outside the reserved request is durably recorded and rejected", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    const overcharged: OpenRouterGenerationResult = { ...result, usage: { ...result.usage, costMicros: ceiling + 1 } };
    await assert.rejects(journal(store, provider(async () => overcharged), ceiling).generate(request), /exceeded the pre-dispatch reservation/u);
    assert.equal((await store.get(request.idempotencyKey))?.status, "completed");
  });
  await withStore(async (store) => {
    const otherModel: OpenRouterGenerationResult = { ...result, usage: { ...result.usage, model: "different/provider-model" } };
    await assert.rejects(journal(store, provider(async () => otherModel)).generate(request), /pinned/u);
    assert.equal((await store.get(request.idempotencyKey))?.status, "completed");
  });
});

test("timeouts after dispatch keep the full reservation and never auto-retry", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    const transport = provider(async () => {
      calls += 1;
      throw new OpenRouterTransportError("timeout", "timed out after dispatch", { retryable: true });
    });
    await assert.rejects(journal(store, transport, ceiling).generate(request));
    const row = await store.get(request.idempotencyKey);
    assert.equal(calls, 1);
    assert.equal(row?.status, "unknown");
    assert.equal(row?.reservedCostMicros, ceiling);
    await assert.rejects(journal(store, transport, ceiling).generate(request), (error: unknown) => error instanceof QualificationAttemptError && error.code === "attempt_uncertain");
    assert.equal(calls, 1);
  });
});

test("a response followed by a durable receipt failure remains reserved and cannot be re-dispatched", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let calls = 0;
    const complete = store.complete.bind(store);
    store.complete = async () => { throw new Error("simulated receipt-write interruption after provider response"); };
    const transport = provider(async () => { calls += 1; return result; });
    await assert.rejects(journal(store, transport, ceiling).generate(request), /ended without a durable response/u);
    assert.equal(calls, 1);
    const interrupted = await store.get(request.idempotencyKey);
    assert.equal(interrupted?.status, "unknown");
    assert.equal(interrupted?.reservedCostMicros, ceiling);

    store.complete = complete;
    await assert.rejects(journal(store, transport, ceiling).generate(request),
      (error: unknown) => error instanceof QualificationAttemptError && error.code === "attempt_uncertain");
    assert.equal(calls, 1, "recovery must not issue a second provider call for uncertain billing");
  });
});

test("an ambiguous HTTP server error keeps its reservation and blocks automatic retry", async () => {
  await withStore(async (store) => {
    const ceiling = maximumQuotedCallCostMicros(request);
    let dispatches = 0;
    const client = new OpenRouterClient({ apiKey: "offline-test-key", fetch: async () => {
      dispatches += 1;
      return Response.json({ error: { message: "upstream unavailable" } }, { status: 503 });
    } });
    const transport = journal(store, client, ceiling);
    await assert.rejects(transport.generate(request), (error: unknown) => error instanceof OpenRouterTransportError && error.kind === "server_error");
    assert.equal(dispatches, 1);
    assert.equal((await store.get(request.idempotencyKey))?.status, "unknown");
    assert.equal((await store.get(request.idempotencyKey))?.reservedCostMicros, ceiling);
    await assert.rejects(transport.generate(request), (error: unknown) => error instanceof QualificationAttemptError && error.code === "attempt_uncertain");
    assert.equal(dispatches, 1);
  });
});

test("a full-context quote covers prompt and schema size while the exact wire fingerprint distinguishes them", () => {
  const wireRequest = {
    ...request,
    schema: projectOpenRouterStrictSchemaObject(request.schema),
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" as const },
  };
  const baseQuote = maximumQuotedCallCostMicros(wireRequest);
  const expanded: OpenRouterGenerationRequest = {
    ...request,
    system: `${request.system} ${"system".repeat(2_000)}`,
    prompt: `${request.prompt} ${"prompt".repeat(2_000)}`,
    schema: { ...request.schema, description: "schema text ".repeat(2_000) } as JsonObject,
  };
  const expandedWire = {
    ...expanded,
    schema: projectOpenRouterStrictSchemaObject(expanded.schema),
    providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY,
    promptCacheOptions: { mode: "explicit" as const },
  };
  assert.equal(maximumQuotedCallCostMicros(expandedWire), baseQuote, "the quote reserves the complete published context regardless of serialized text/schema length");
  assert.notEqual(
    qualificationAttemptFingerprint({ request, wireRequest, maxCallCostMicros: baseQuote, aggregateCostCapMicros: baseQuote }),
    qualificationAttemptFingerprint({ request: expanded, wireRequest: expandedWire, maxCallCostMicros: baseQuote, aggregateCostCapMicros: baseQuote }),
    "the reserved price basis may be equal while the exact serialized request identity must change",
  );
  assert.notEqual(
    qualificationAttemptFingerprint({ request, wireRequest, maxCallCostMicros: baseQuote, aggregateCostCapMicros: baseQuote }),
    qualificationAttemptFingerprint({ request: { ...request, reasoningEffort: "low" }, wireRequest: { ...wireRequest, reasoningEffort: "low" }, maxCallCostMicros: baseQuote, aggregateCostCapMicros: baseQuote }),
    "reasoning settings change the exact charged request identity even under the same conservative ceiling",
  );
  assert.ok(maximumQuotedCallCostMicros({ ...wireRequest, maxOutputTokens: request.maxOutputTokens + 1 }) > baseQuote);
});

test("malformed and missing live caps fail closed before dispatch", async () => {
  await withStore(async (store) => {
    let calls = 0;
    const transport = provider(async () => { calls += 1; return result; });
    const badCaps: unknown[] = [undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1];
    for (const badCap of badCaps) {
      const invalid = new JournaledPwrp71Transport({
        store,
        transport,
        maxCallCostMicros: badCap as number,
        aggregateCostCapMicros: 1_000_000,
      });
      await assert.rejects(invalid.generate({ ...request, idempotencyKey: `${request.idempotencyKey}:bad:${String(badCap)}` }), (error: unknown) =>
        error instanceof QualificationAttemptError && error.code === "budget_blocked");
    }
    assert.equal(calls, 0);
    assert.equal((await store.list()).length, 0);
  });
});

test("an existing writer lock and a corrupt attempt ledger fail closed without dispatch", async () => {
  await withStore(async (store) => {
    const fs = await import("node:fs/promises");
    await fs.writeFile(`${store.attemptsPath}.lock`, "manual-lock\n", "utf8");
    let calls = 0;
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; })).generate(request), (error: unknown) => error instanceof QualificationAttemptError && error.code === "run_locked");
    assert.equal(calls, 0);
    await fs.rm(`${store.attemptsPath}.lock`, { force: true });
    await fs.writeFile(store.attemptsPath, "{not json", "utf8");
    await assert.rejects(journal(store, provider(async () => { calls += 1; return result; })).generate(request));
    assert.equal(calls, 0);
  });
});

test("a cross-process lock contender cannot unlink the active writer lock", async () => {
  await withStore(async (store) => {
    const lockPath = `${store.attemptsPath}.lock`;
    const ownerCode = `
      import { open } from "node:fs/promises";
      const lockPath = ${JSON.stringify(lockPath)};
      const handle = await open(lockPath, "wx");
      await handle.writeFile("active-owner\\n", "utf8");
      process.stdout.write("LOCK_HELD\\n");
      await new Promise((resolve) => process.stdin.once("data", resolve));
      await handle.close();
    `;
    const owner = spawn(process.execPath, ["--input-type=module", "-e", ownerCode], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    owner.stdout.setEncoding("utf8");
    owner.stderr.setEncoding("utf8");
    owner.stdout.on("data", (chunk: string) => { stdout += chunk; });
    owner.stderr.on("data", (chunk: string) => { stderr += chunk; });
    try {
      await new Promise<void>((resolve, reject) => {
        const onData = () => {
          if (!stdout.includes("LOCK_HELD")) return;
          clearTimeout(timer);
          owner.stdout.off("data", onData);
          owner.off("error", onError);
          resolve();
        };
        const onError = (error: Error) => {
          clearTimeout(timer);
          owner.stdout.off("data", onData);
          reject(error);
        };
        const timer = setTimeout(() => {
          owner.stdout.off("data", onData);
          owner.off("error", onError);
          reject(new Error(`lock owner did not start: ${stderr}`));
        }, 5_000);
        owner.stdout.on("data", onData);
        owner.once("error", onError);
        onData();
      });
      let dispatches = 0;
      await assert.rejects(journal(store, provider(async () => { dispatches += 1; return result; })).generate(request),
        (error: unknown) => error instanceof QualificationAttemptError && error.code === "run_locked");
      assert.equal(dispatches, 0);
      assert.equal(await (await import("node:fs/promises")).readFile(lockPath, "utf8"), "active-owner\n");
    } finally {
      owner.stdin.end("release");
      if (owner.exitCode === null) await new Promise<void>((resolve) => owner.once("exit", () => resolve()));
    }
    assert.equal(owner.exitCode, 0, stderr);
  });
});

test("independent journal processes cannot both reserve the same aggregate remainder", async () => {
  await withStore(async (store) => {
    const runDirectory = store.runDirectory;
    const ceiling = maximumQuotedCallCostMicros(request);
    const storeModule = pathToFileURL(path.join(process.cwd(), "lib/server/reports/qualification/attempt-store.ts")).href;
    const budgetModule = pathToFileURL(path.join(process.cwd(), "lib/server/openrouter/qualification-budget.ts")).href;
    const schemaModule = pathToFileURL(path.join(process.cwd(), "lib/server/openrouter/schema-projection.ts")).href;
    const children = ["race-process-a", "race-process-b"].map((key) => {
      const childRequest = { ...request, idempotencyKey: key };
      const code = `
        const [{ FileQualificationAttemptStore }, { GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY }, { projectOpenRouterStrictSchemaObject }] = await Promise.all([
          import(${JSON.stringify(storeModule)}), import(${JSON.stringify(budgetModule)}), import(${JSON.stringify(schemaModule)})
        ]);
        const store = new FileQualificationAttemptStore(${JSON.stringify(runDirectory)});
        const request = ${JSON.stringify(childRequest)};
        const wireRequest = { ...request, schema: projectOpenRouterStrictSchemaObject(request.schema), providerPolicy: GPT6_LUNA_QUALIFICATION_PROVIDER_POLICY, promptCacheOptions: { mode: "explicit" } };
        process.stdout.write("READY\\n");
        await new Promise((resolve) => process.stdin.once("data", resolve));
        let outcome;
        for (let attempt = 0; attempt < 100; attempt += 1) {
          try {
            await store.begin({ request, wireRequest, maxCallCostMicros: ${ceiling}, aggregateCostCapMicros: ${ceiling}, startedAt: new Date() });
            outcome = "reserved";
            break;
          } catch (error) {
            if (error?.code === "run_locked") { await new Promise((resolve) => setTimeout(resolve, 5)); continue; }
            outcome = error?.code ?? "unexpected_error";
            break;
          }
        }
        process.stdout.write("RESULT:" + (outcome ?? "lock_retry_exhausted") + "\\n");
      `;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
      const record = { child, stdout: "", stderr: "" };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => { record.stdout += chunk; });
      child.stderr.on("data", (chunk: string) => { record.stderr += chunk; });
      return record;
    });

    const waitForReady = (record: typeof children[number]) => new Promise<void>((resolve, reject) => {
      const check = () => { if (record.stdout.includes("READY\n")) { clearTimeout(timer); resolve(); } };
      const timer = setTimeout(() => reject(new Error(`reservation process did not become ready: ${record.stderr}`)), 10_000);
      record.child.stdout.on("data", check);
      record.child.once("exit", (code) => {
        if (code !== 0) reject(new Error(`reservation process exited before barrier (${code}): ${record.stderr}`));
      });
      check();
    });
    try {
      await Promise.all(children.map(waitForReady));
      for (const record of children) record.child.stdin.end("GO\n");
      await Promise.all(children.map((record) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`reservation process timed out: ${record.stderr}`)), 10_000);
        record.child.once("exit", (code) => {
          clearTimeout(timer);
          if (code === 0) resolve(); else reject(new Error(`reservation process failed (${code}): ${record.stderr}`));
        });
      })));
      const outcomes = children.flatMap((record) => [...record.stdout.matchAll(/RESULT:([^\r\n]+)/gu)].map((match) => match[1]));
      assert.deepEqual(outcomes.sort(), ["budget_blocked", "reserved"]);
      const attempts = await store.list();
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0]?.reservedCostMicros, ceiling);
      assert.ok(["race-process-a", "race-process-b"].includes(attempts[0]!.attemptId));
    } finally {
      for (const record of children) {
        if (record.child.exitCode === null) {
          record.child.stdin.end("STOP\\n");
          record.child.kill();
        }
      }
    }
  });
});
