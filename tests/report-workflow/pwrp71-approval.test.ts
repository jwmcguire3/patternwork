import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  Pwrp71ApprovalError,
  preparePwrp71PendingReviewPackage,
  validatePwrp71ApprovalAndBuildManifest,
  type Pwrp71ApprovalInput,
  type Pwrp71SemanticReviewEvidence,
} from "../../lib/server/reports/qualification/approval.ts";
import { runPwrp71Qualification } from "../../lib/server/reports/qualification/runner.ts";

const timestamp = "2026-10-08T12:00:00.000Z";
const TEST_SCRATCH = path.join(process.cwd(), ".codex-temp", "test-runs");

async function withOfflineRun(run: (input: { readonly runId: string; readonly outputRoot: string }) => Promise<void>): Promise<void> {
  await mkdir(TEST_SCRATCH, { recursive: true });
  const outputRoot = await mkdtemp(path.join(TEST_SCRATCH, "pwrp71-approval-offline-"));
  const runId = `offline-${process.pid}-${Date.now()}`;
  try {
    await runPwrp71Qualification({
      runId,
      mode: "offline",
      profileIds: ["P01"],
      reportTypes: ["MAP"],
      costCapMicros: 1_000_000,
      workspaceRoot: process.cwd(),
      outputRoot,
      now: () => new Date(timestamp),
    });
    await run({ runId, outputRoot });
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
}

test("offline review package is ineligible and does not fabricate human fields", async () => {
  await withOfflineRun(async ({ runId, outputRoot }) => {
    const pending = await preparePwrp71PendingReviewPackage({ runId, outputRoot, workspaceRoot: process.cwd() });
    assert.equal(pending.status, "not_eligible_for_review");
    assert.equal(pending.approvalEligible, false);
    assert.ok(pending.blockers.some((blocker) => /Offline structural runs cannot qualify/u.test(blocker)));
    assert.equal("reviewedBy" in pending, false);
    assert.equal("reviewedAt" in pending, false);
    assert.equal("checklist" in pending, false);
    assert.ok(pending.semanticChecklist.every((item) => item.status === "pending"));

  });
});

test("approval attempts with stale run pins or false/incomplete human checklists fail closed for an offline run", async () => {
  await withOfflineRun(async ({ runId, outputRoot }) => {
    const pending = await preparePwrp71PendingReviewPackage({ runId, outputRoot, workspaceRoot: process.cwd() });
    const semanticEvidence = {
      schemaVersion: "pwrp71-semantic-review-evidence-1",
      qualificationRunSha256: pending.qualificationRunSha256 ?? "0".repeat(64),
      semanticCaseSetSha256: pending.semanticCaseSetSha256,
      fixtureSetSha256: pending.fixtureSetSha256,
      sourcePinsSha256: pending.sourcePinsSha256,
      draftPinsSha256: pending.draftPinsSha256,
      reviewedBy: "test-only-input",
      reviewedAt: timestamp,
      cases: [],
    } as Pwrp71SemanticReviewEvidence;
    const approval: Pwrp71ApprovalInput = {
      status: "approved",
      qualificationRunSha256: pending.qualificationRunSha256 ?? "0".repeat(64),
      providerQualificationEvidenceSha256: pending.providerQualificationEvidenceSha256,
      semanticApprovalEvidenceSha256: "1".repeat(64),
      draftPinsSha256: pending.draftPinsSha256,
      reviewedBy: "test-only-input",
      reviewedAt: timestamp,
      checklist: {
        allOutputsReviewed: true,
        overreachAndOmissionReviewed: true,
        sourceAndLineageReviewed: true,
        pinsApproved: true,
      },
    };
    const earlyOfflineGuard = (error: unknown) => error instanceof Pwrp71ApprovalError && /completed live run/u.test(error.message);

    await assert.rejects(validatePwrp71ApprovalAndBuildManifest({
      runId,
      outputRoot,
      workspaceRoot: process.cwd(),
      semanticEvidence,
      approval: { ...approval, qualificationRunSha256: "f".repeat(64) },
    }), earlyOfflineGuard);
    await assert.rejects(validatePwrp71ApprovalAndBuildManifest({
      runId,
      outputRoot,
      workspaceRoot: process.cwd(),
      semanticEvidence,
      approval: { ...approval, checklist: { ...approval.checklist, pinsApproved: false } } as unknown as Pwrp71ApprovalInput,
    }), earlyOfflineGuard);
    await assert.rejects(validatePwrp71ApprovalAndBuildManifest({
      runId,
      outputRoot,
      workspaceRoot: process.cwd(),
      semanticEvidence,
      approval: {
        ...approval,
        checklist: { allOutputsReviewed: true, overreachAndOmissionReviewed: true, sourceAndLineageReviewed: true },
      } as unknown as Pwrp71ApprovalInput,
    }), earlyOfflineGuard);
  });
});
