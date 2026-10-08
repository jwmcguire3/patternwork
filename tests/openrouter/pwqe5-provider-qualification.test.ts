import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { JsonObject } from "@/lib/question-engine/types";
import { sha256Canonical } from "@/lib/report-contracts/delivery-validator";
import { activateReviewedPwqe5QualificationManifest, QUALIFICATION_MODEL_ORDER } from "@/lib/server/openrouter/policy";
import { loadPwqe6ReportPrompt } from "@/lib/server/reports/prompts";
import {
  approvePwqe5Qualification,
  runPwqe5ProviderQualification,
  type Pwqe5PendingQualificationResult,
} from "@/lib/server/openrouter/pwqe5-provider-qualification";
import type { OpenRouterGenerationRequest, OpenRouterTransport } from "@/lib/server/openrouter/types";

const TEST_SCRATCH = path.join(process.cwd(), ".codex-temp", "test-runs");

async function makeTestDirectory(prefix: string): Promise<string> {
  await mkdir(TEST_SCRATCH, { recursive: true });
  return mkdtemp(path.join(TEST_SCRATCH, prefix));
}

function requestInput(request: OpenRouterGenerationRequest): Record<string, unknown> {
  const marker = "The following object is the complete validated, pseudonymous input contract. It contains no email, direct contact data, or flat raw-answer list.\n\n";
  const markerIndex = request.prompt.indexOf(marker);
  assert.notEqual(markerIndex, -1, "generation prompt includes its JSON input");
  const start = markerIndex + marker.length;
  return JSON.parse(request.prompt.slice(start).split("\n", 1)[0]) as Record<string, unknown>;
}

function requestPacket(request: OpenRouterGenerationRequest): Record<string, unknown> {
  const input = requestInput(request);
  const reportType = request.prompt.match(/Requested report type: ([A-Z]+)/u)?.[1];
  assert.ok(reportType);
  if (reportType === "MAP") {
    assert.ok(Array.isArray(input.packets));
    return input.packets[0] as Record<string, unknown>;
  }
  return input.packet as Record<string, unknown>;
}

function validDraft(request: OpenRouterGenerationRequest): JsonObject {
  const packet = requestPacket(request);
  const reportType = request.prompt.match(/Requested report type: ([A-Z]+)/u)?.[1];
  assert.ok(reportType);
  return {
    release_id: packet.release_id,
    snapshot_id: packet.snapshot_id,
    report_type: reportType,
    title: `${reportType} from ${packet.snapshot_id}`,
    sections: [],
    claims: [],
    name_registry: [],
    reflection_questions: [],
  } as JsonObject;
}

function success(request: OpenRouterGenerationRequest, output: JsonObject, generationId: string) {
  return {
    ok: true as const,
    output,
    usage: {
      generationId,
      inputTokens: 10,
      outputTokens: 10,
      reasoningTokens: 0,
      totalTokens: 20,
      costMicros: 1,
      currency: "USD" as const,
      model: request.model,
    },
  };
}

test("qualifies all profile/report pairs, repairs once, isolates synthesis by profile, and activates reviewed pins", async () => {
  const outputDirectory = await makeTestDirectory("pwqe5-provider-qualification-");
  const requests: OpenRouterGenerationRequest[] = [];
  let firstCall = true;
  const provider: OpenRouterTransport = {
    async generate(request) {
      requests.push(request);
      if (firstCall) {
        firstCall = false;
        return success(request, { malformed: true } as JsonObject, "mock-invalid-initial");
      }
      return success(request, validDraft(request), `mock-${requests.length}`);
    },
  };
  try {
    const result = await runPwqe5ProviderQualification({
      outputDirectory,
      provider,
      costCapMicros: 1_000_000_000,
      now: () => new Date("2026-10-07T12:00:00.000Z"),
    });
    assert.equal(result.status, "pending_review");
    const pending = result as Pwqe5PendingQualificationResult;
    assert.equal(pending.run.profileIds.length, 9);
    assert.equal(pending.run.runs.length, 45);
    assert.equal(requests.length, 46, "45 profile/report runs include one repair attempt");
    assert.ok(pending.run.runs.every((run) => run.machinePassed));
    assert.equal(pending.run.runs.filter((run) => run.repairUsed).length, 1);
    const pinnedPrompt = await loadPwqe6ReportPrompt("MAP");
    assert.ok(JSON.stringify(pinnedPrompt.schema).includes("\"allOf\""), "the pinned source schema retains its full validation rules");
    const unsupportedSchemaKeys = ["\"$schema\"", "\"$id\"", "\"allOf\"", "\"if\"", "\"then\"", "\"else\"", "\"uniqueItems\""];
    assert.ok(requests.every((request) => unsupportedSchemaKeys.every((key) => !JSON.stringify(request.schema).includes(key))));
    const schema = requests[0].schema as Record<string, unknown>;
    const rootProperties = schema.properties as Record<string, unknown>;
    assert.ok(rootProperties.title, "schema sanitization preserves a data property named title");
    assert.ok(Array.isArray(schema.required) && schema.required.includes("title"), "preserved title remains required");
    const claims = rootProperties.claims as { items: { properties: Record<string, unknown> } };
    const scope = claims.items.properties.scope as { properties: Record<string, unknown>; required: string[] };
    assert.ok(scope.properties.description, "schema sanitization preserves a nested data property named description");
    assert.ok(scope.required.includes("description"), "preserved description remains required");

    const pairKeys = new Set(pending.run.runs.map((run) => `${run.profileId}:${run.reportType}`));
    assert.equal(pairKeys.size, 45);
    for (const profileId of pending.run.profileIds) {
      for (const reportType of ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const) {
        assert.ok(pairKeys.has(`${profileId}:${reportType}`));
      }
    }

    const synthesisRequests = requests.filter((request) => request.prompt.startsWith("Requested report type: SYNTHESIS"));
    assert.equal(synthesisRequests.length, 9);
    for (const request of synthesisRequests) {
      const input = requestInput(request);
      const packet = input.packet as Record<string, unknown>;
      const profileId = String(packet.snapshot_id).match(/^qualification-(P\d+)-deepening$/u)?.[1];
      assert.ok(profileId);
      const layers = input.layer_reports as Array<{ report_type: string; draft: { title: string } }>;
      assert.deepEqual(layers.map((layer) => layer.report_type), ["IFS", "PV", "ATT"]);
      assert.ok(layers.every((layer) => layer.draft.title.endsWith(`qualification-${profileId}-deepening`)));
    }

    const approval = {
      status: "approved" as const,
      qualificationRunSha256: pending.qualificationRunSha256,
      draftPinsSha256: pending.draftPinsSha256,
      reviewedBy: "Mock reviewer",
      reviewedAt: "2026-10-07T12:30:00.000Z",
      checklist: {
        allOutputsReviewed: true as const,
        prohibitedClaimsReviewed: true as const,
        traceabilityReviewed: true as const,
        fixtureComparabilityReviewed: true as const,
        pinsApproved: true as const,
      },
    };
    const reviewed = approvePwqe5Qualification(pending, approval);
    const manifestDigest = sha256Canonical(reviewed);
    const activated = activateReviewedPwqe5QualificationManifest(JSON.stringify(reviewed), manifestDigest);
    assert.equal(activated.manifestSha256, manifestDigest);
    assert.deepEqual(Object.keys(activated.policy).sort(), ["ATT", "IFS", "MAP", "PV", "SYNTHESIS"]);
    assert.equal(activated.manifest.status, "reviewed");
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("blocks a too-low cost cap before the mock transport is called", async () => {
  const outputDirectory = await makeTestDirectory("pwqe5-provider-budget-");
  let calls = 0;
  const provider: OpenRouterTransport = {
    async generate() {
      calls += 1;
      throw new Error("The transport must not be called when estimated cost exceeds the cap.");
    },
  };
  try {
    const result = await runPwqe5ProviderQualification({
      outputDirectory,
      provider,
      candidates: QUALIFICATION_MODEL_ORDER,
      costCapMicros: 1,
      now: () => new Date("2026-10-07T12:00:00.000Z"),
    });
    assert.equal(result.status, "budget_blocked");
    assert.equal(calls, 0);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test("resumes a persisted initial attempt without making the same provider call twice", async () => {
  const outputDirectory = await makeTestDirectory("pwqe5-provider-resume-");
  const requests: OpenRouterGenerationRequest[] = [];
  let nowCalls = 0;
  try {
    await assert.rejects(runPwqe5ProviderQualification({
      outputDirectory,
      provider: {
        async generate(request) {
          requests.push(request);
          return success(request, validDraft(request), "mock-first-attempt");
        },
      },
      costCapMicros: 1_000_000_000,
      now: () => {
        nowCalls += 1;
        if (nowCalls === 6) throw new Error("Simulated interruption after persisting provider usage.");
        return new Date("2026-10-07T12:00:00.000Z");
      },
    }), /Simulated interruption/u);
    assert.equal(requests.length, 1);

    const resumed = await runPwqe5ProviderQualification({
      outputDirectory,
      provider: {
        async generate(request) {
          requests.push(request);
          return success(request, validDraft(request), `mock-resumed-${requests.length}`);
        },
      },
      costCapMicros: 1_000_000_000,
      now: () => new Date("2026-10-07T12:01:00.000Z"),
    });
    assert.equal(resumed.status, "pending_review");
    assert.equal(requests.length, 45, "the persisted first request is restored locally, then the remaining pairs run once");
    const firstKey = requests[0].idempotencyKey;
    assert.equal(requests.filter((request) => request.idempotencyKey === firstKey).length, 1);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});
