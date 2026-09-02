import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import { MAX_ASSESSMENT_RETENTION_BATCH_SIZE, runAssessmentRetentionBatch } from "../../lib/server/assessment/retention-job.ts";

const NOW = new Date("2026-09-02T00:00:00.000Z");

function fakeRetentionDatabase(candidateCount: number) {
  const deletedSessionIds: string[] = [];
  let candidateQuery: Record<string, unknown> | undefined;
  const candidates = Array.from({ length: candidateCount }, (_, index) => ({
    id: `expired-${index}`,
    status: "PAUSED",
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    completedAt: null,
  }));
  const transaction = {
    patternworkV31AssessmentSnapshot: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    patternworkV31ReportRun: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    patternworkV31ReportArtifact: { findMany: async () => [], deleteMany: async () => ({ count: 0 }) },
    patternworkV31ReportDelivery: { deleteMany: async () => ({ count: 0 }) },
    patternworkV31EvidencePacket: { deleteMany: async () => ({ count: 0 }) },
    patternworkV31AssessmentResponse: { deleteMany: async () => ({ count: 0 }) },
    patternworkV31AccessToken: { deleteMany: async () => ({ count: 0 }) },
    patternworkV31AssessmentSession: {
      delete: async ({ where }: { where: { id: string } }) => {
        deletedSessionIds.push(where.id);
        return { id: where.id };
      },
    },
  };
  const database = {
    patternworkV31AssessmentSession: {
      findMany: async (args: Record<string, unknown>) => {
        candidateQuery = args;
        const take = typeof args.take === "number" ? args.take : candidateCount;
        return candidates.slice(0, take);
      },
    },
    $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
  };
  return {
    candidateQuery: () => candidateQuery,
    database: database as unknown as PrismaClient,
    deletedSessionIds,
  };
}

test("retention job bounds candidates and invokes the physical purge transaction", async () => {
  const fake = fakeRetentionDatabase(5);
  const result = await runAssessmentRetentionBatch({
    batchSize: 2,
    database: fake.database,
    dependencies: { keyring: { activeVersion: "test", keys: { test: new Uint8Array(32) } } },
    now: () => NOW,
  });

  assert.deepEqual(fake.deletedSessionIds, ["expired-0", "expired-1"]);
  assert.equal(result.candidatesExamined, 2);
  assert.equal(result.purged, 2);
  assert.equal(result.batchLimitReached, true);
  assert.equal(fake.candidateQuery()?.take, 2);
  assert.deepEqual(fake.candidateQuery()?.orderBy, [{ retentionExpiresAt: "asc" }, { id: "asc" }]);
  assert.deepEqual(fake.candidateQuery()?.where, {
    AND: [{}, { retentionExpiresAt: { lte: NOW } }],
  });
});

test("retention job clamps an oversized batch to the hard maximum", async () => {
  const fake = fakeRetentionDatabase(MAX_ASSESSMENT_RETENTION_BATCH_SIZE + 5);
  const result = await runAssessmentRetentionBatch({
    batchSize: MAX_ASSESSMENT_RETENTION_BATCH_SIZE + 500,
    database: fake.database,
    dependencies: { keyring: { activeVersion: "test", keys: { test: new Uint8Array(32) } } },
    now: () => NOW,
  });

  assert.equal(result.batchSize, MAX_ASSESSMENT_RETENTION_BATCH_SIZE);
  assert.equal(result.purged, MAX_ASSESSMENT_RETENTION_BATCH_SIZE);
  assert.equal(fake.candidateQuery()?.take, MAX_ASSESSMENT_RETENTION_BATCH_SIZE);
});
