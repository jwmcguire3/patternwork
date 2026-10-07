import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { completeAssessmentPass, getAssessmentState, saveAssessmentResponse, setAssessmentPause } from "../../lib/server/assessment/service.ts";
import { AssessmentError } from "../../lib/server/assessment/errors.ts";
import { encryptionKeyringFromEnv } from "../../lib/server/security/index.ts";

const keyring = encryptionKeyringFromEnv({
  APP_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 12).toString("base64"),
  APP_DATA_ENCRYPTION_KEY_VERSION: "test-v1",
});

function legacySessionDatabase() {
  const session = {
    id: "legacy-session",
    assessmentKey: "patternwork-v3.1",
    status: "IN_PROGRESS",
    currentPass: 1,
    optimisticRevision: 7,
  };
  const transaction = {
    patternworkV31AssessmentSession: {
      async findUnique() { return session; },
    },
  };
  const database = {
    ...transaction,
    async $transaction<T>(callback: (tx: unknown) => Promise<T>) { return callback(transaction); },
  };
  return database as unknown as PrismaClient;
}

test("PWQE5 state reads reject an assessment bound to the retired release", async () => {
  await assert.rejects(
    getAssessmentState("legacy-session", { db: legacySessionDatabase(), keyring }),
    (error: unknown) => error instanceof AssessmentError && error.code === "unauthorized",
  );
});

test("PWQE5 pause controls reject an assessment bound to the retired release", async () => {
  await assert.rejects(
    setAssessmentPause("legacy-session", { expectedRevision: 7, action: "pause" }, { db: legacySessionDatabase(), keyring }),
    (error: unknown) => error instanceof AssessmentError && error.code === "unauthorized",
  );
});

test("PWQE5 response writes reject an assessment bound to the retired release", async () => {
  const input = {
    expectedRevision: 7,
    idempotencyKey: "legacy-response",
    interactionInstanceId: "legacy-interaction",
    completionState: "COMPLETED",
    response: { schemaVersion: "PWQE5-RS-1", status: "answered", mode: "single", selectedOptionIds: ["PWQE5-OPTION-1"] },
  } as unknown as Parameters<typeof saveAssessmentResponse>[1];
  await assert.rejects(
    saveAssessmentResponse("legacy-session", input, { db: legacySessionDatabase(), keyring }),
    (error: unknown) => error instanceof AssessmentError && error.code === "unauthorized",
  );
});

for (const pass of [1, 2] as const) {
  test(`PWQE5 completion rejects an assessment bound to the retired release (Pass ${pass})`, async () => {
    let readinessCalls = 0;
    await assert.rejects(
      completeAssessmentPass("legacy-session", {
        expectedRevision: 7,
        completedPass: pass,
        action: "finish",
      }, {
        db: legacySessionDatabase(),
        keyring,
        reportReadiness: async () => { readinessCalls += 1; },
      }),
      (error: unknown) => error instanceof AssessmentError && error.code === "unauthorized",
    );
    assert.equal(readinessCalls, 0, "retired sessions must not enter the PWQE5 report pipeline");
  });
}
