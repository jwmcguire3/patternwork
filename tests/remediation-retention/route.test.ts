import assert from "node:assert/strict";
import test from "node:test";
import { createAssessmentRetentionHandler } from "../../app/api/cron/assessment-retention/handler.ts";

const successResult = {
  abandonedPurged: 2,
  batchLimitReached: false,
  batchSize: 100,
  candidatesExamined: 3,
  completedPurged: 1,
  purged: 3,
} as const;

function request(authorization?: string) {
  return new Request("https://patternwork.test/api/cron/assessment-retention", {
    headers: authorization ? { authorization } : {},
  });
}

function testLogger() {
  const entries: { level: string; message: string }[] = [];
  return {
    entries,
    logger: {
      error: (message: string) => { entries.push({ level: "error", message }); },
      info: (message: string) => { entries.push({ level: "info", message }); },
      warn: (message: string) => { entries.push({ level: "warn", message }); },
    },
  };
}

test("cron endpoint rejects missing and incorrect bearer authorization before mutation", async () => {
  let jobCalls = 0;
  const handler = createAssessmentRetentionHandler({
    getCronSecret: () => "cron-test-secret",
    runJob: async () => { jobCalls += 1; return successResult; },
    logger: testLogger().logger,
  });

  const missing = await handler(request());
  const incorrect = await handler(request("Bearer incorrect"));

  assert.equal(missing.status, 401);
  assert.equal(incorrect.status, 401);
  assert.deepEqual(await missing.json(), await incorrect.json());
  assert.equal(jobCalls, 0);
});

test("cron endpoint requires configured CRON_SECRET", async () => {
  let jobCalls = 0;
  const handler = createAssessmentRetentionHandler({
    getCronSecret: () => undefined,
    runJob: async () => { jobCalls += 1; return successResult; },
    logger: testLogger().logger,
  });

  const response = await handler(request("Bearer anything"));

  assert.equal(response.status, 503);
  assert.equal(jobCalls, 0);
});

test("authorized cron execution returns aggregate counts and emits completion metrics", async () => {
  const logs = testLogger();
  let clock = 1_000;
  const handler = createAssessmentRetentionHandler({
    getCronSecret: () => "cron-test-secret",
    logger: logs.logger,
    now: () => { clock += 25; return clock; },
    runJob: async () => successResult,
  });

  const response = await handler(request("Bearer cron-test-secret"));

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, ...successResult });
  const completion = JSON.parse(logs.entries.at(-1)?.message ?? "{}") as Record<string, unknown>;
  assert.equal(completion.event, "assessment_retention_completed");
  assert.equal(completion.purged, 3);
  assert.equal(completion.failureCount, 0);
});

test("authorized cron execution reports a generic failure and failure metric", async () => {
  const logs = testLogger();
  const handler = createAssessmentRetentionHandler({
    getCronSecret: () => "cron-test-secret",
    logger: logs.logger,
    runJob: async () => { throw new Error("database included a sensitive identifier"); },
  });

  const response = await handler(request("Bearer cron-test-secret"));

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Retention job failed." });
  const failureLog = logs.entries.at(-1)?.message ?? "";
  assert.match(failureLog, /assessment_retention_failed/u);
  assert.doesNotMatch(failureLog, /sensitive identifier/u);
  assert.equal((JSON.parse(failureLog) as Record<string, unknown>).failureCount, 1);
});
