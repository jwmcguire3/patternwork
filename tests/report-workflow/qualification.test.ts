import assert from "node:assert/strict";
import test from "node:test";
import type { JsonObject, ReportType, ValidationIssue } from "../../lib/question-engine/types.ts";
import type { ReportArtifact } from "../../lib/report-contracts/types.ts";
import {
  CanonicalQualificationFixtures,
  StrictQualificationReviewer,
  approveOpenRouterQualification,
  runOpenRouterQualification,
  type PendingQualificationResult,
  type QualificationFilesystemBoundary,
  type QualificationFixture,
  type QualificationFixtureBoundary,
  type QualificationFixtureInput,
  type QualificationFixtureSet,
  type QualificationGateBoundary,
  type QualificationReviewApproval,
  type QualificationRunManifest,
} from "../../lib/server/openrouter/qualification.ts";
import type {
  OpenRouterGenerationRequest,
  OpenRouterGenerationResult,
  OpenRouterTransport,
} from "../../lib/server/openrouter/types.ts";
import type { ReviewedQualificationManifest } from "../../lib/server/openrouter/policy.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";

const REPORTS = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
const CANDIDATES = ["luna-low", "luna-medium", "terra-medium", "sol-high"] as const;

class MemoryFilesystem implements QualificationFilesystemBoundary {
  run?: QualificationRunManifest;
  readonly artifacts = new Map<string, JsonObject>();
  pending?: PendingQualificationResult;
  reviewed?: ReviewedQualificationManifest;

  async loadRun(): Promise<QualificationRunManifest | undefined> { return this.run; }
  async saveRun(_outputDirectory: string, manifest: QualificationRunManifest): Promise<void> { this.run = structuredClone(manifest); }
  async saveArtifact(_outputDirectory: string, relativePath: string, artifact: JsonObject): Promise<void> { this.artifacts.set(relativePath, structuredClone(artifact)); }
  async loadArtifact(_outputDirectory: string, relativePath: string): Promise<JsonObject> {
    const artifact = this.artifacts.get(relativePath);
    if (!artifact) throw new Error(`Missing test artifact ${relativePath}.`);
    return structuredClone(artifact);
  }
  async saveReviewFiles(_outputDirectory: string, pending: PendingQualificationResult): Promise<void> { this.pending = structuredClone(pending); }
  async saveReviewedManifest(_outputDirectory: string, manifest: ReviewedQualificationManifest): Promise<void> { this.reviewed = structuredClone(manifest); }
}

class TestFixtures implements QualificationFixtureBoundary {
  private readonly set: QualificationFixtureSet;

  constructor() {
    const fixtures = (["A", "B", "C"] as const).map((id) => {
      const inputs = Object.fromEntries(["MAP", "IFS", "PV", "ATT"].map((reportType) => [reportType, {
        input: { fixtureId: id, reportType },
        packets: [],
      }])) as QualificationFixture["inputs"];
      return { id, sourcePacketSha256: id.toLowerCase().repeat(64), inputs } as QualificationFixture;
    }) as [QualificationFixture, QualificationFixture, QualificationFixture];
    this.set = { fixtureSetSha256: "f".repeat(64), sourceManifestSha256: "s".repeat(64), fixtures };
  }

  async load(): Promise<QualificationFixtureSet> { return this.set; }
  async buildSynthesisInput(fixture: QualificationFixture): Promise<QualificationFixtureInput> {
    return { input: { fixtureId: fixture.id, reportType: "SYNTHESIS" }, packets: [] };
  }
}

class PassFieldGates implements QualificationGateBoundary {
  async validate(
    reportType: ReportType,
    output: JsonObject,
  ): Promise<{ readonly ok: true; readonly artifact: ReportArtifact } | { readonly ok: false; readonly issues: readonly ValidationIssue[] }> {
    return output.pass === true
      ? { ok: true, artifact: { qualified: true, reportType } as unknown as ReportArtifact }
      : { ok: false, issues: [{ code: "machine_gate", path: "$", message: "fixture failed" }] };
  }
}

function requestIdentity(request: OpenRouterGenerationRequest): { reportType: ReportType; candidate: typeof CANDIDATES[number] } {
  const parts = request.idempotencyKey.split(":");
  return { reportType: parts[2] as ReportType, candidate: parts[3] as typeof CANDIDATES[number] };
}

class TestProvider implements OpenRouterTransport {
  readonly calls: OpenRouterGenerationRequest[] = [];

  constructor(
    private readonly passes: (identity: ReturnType<typeof requestIdentity>) => boolean,
    private readonly costMicros = 100,
  ) {}

  async generate(request: OpenRouterGenerationRequest): Promise<OpenRouterGenerationResult> {
    this.calls.push(request);
    const identity = requestIdentity(request);
    const index = this.calls.length;
    return {
      ok: true,
      output: { pass: this.passes(identity) },
      usage: {
        generationId: `generation-${index}`,
        requestId: `request-${index}`,
        inputTokens: 10,
        outputTokens: 20,
        reasoningTokens: 3,
        totalTokens: 30,
        costMicros: this.costMicros,
        currency: "USD",
        model: `actual/${identity.candidate}`,
      },
    };
  }
}

async function qualify(provider: TestProvider, filesystem = new MemoryFilesystem()) {
  const result = await runOpenRouterQualification({
    outputDirectory: "memory",
    provider,
    fixtures: new TestFixtures(),
    filesystem,
    gates: new PassFieldGates(),
    costCapMicros: 100_000_000,
    now: () => new Date("2026-09-02T12:00:00Z"),
  });
  return { result, filesystem };
}

test("loads validator-clean canonical A/B/C qualification inputs without a provider", async () => {
  const fixtures = await new CanonicalQualificationFixtures().load(process.cwd());
  assert.deepEqual(fixtures.fixtures.map((fixture) => fixture.id), ["A", "B", "C"]);
  assert.match(fixtures.fixtureSetSha256, /^[a-f0-9]{64}$/u);
  assert.match(fixtures.sourceManifestSha256, /^[a-f0-9]{64}$/u);
  for (const fixture of fixtures.fixtures) {
    for (const reportType of ["MAP", "IFS", "PV", "ATT"] as const) assert.ok(fixture.inputs[reportType]);
  }
});

test("runs the canonical A/B/C set exactly three times per report and resumes without duplicate calls", async () => {
  const provider = new TestProvider(() => true);
  const { result, filesystem } = await qualify(provider);
  assert.equal(result.status, "pending_review");
  assert.equal(provider.calls.length, 15);
  for (const reportType of REPORTS) {
    const calls = provider.calls.filter((request) => requestIdentity(request).reportType === reportType);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map((request) => requestIdentity(request).candidate), ["luna-low", "luna-low", "luna-low"]);
  }
  await qualify(provider, filesystem);
  assert.equal(provider.calls.length, 15);
});

test("selects the lowest candidate passing all gates and escalates after machine failure", async () => {
  const provider = new TestProvider(({ candidate }) => candidate === "terra-medium" || candidate === "sol-high");
  const { result } = await qualify(provider);
  assert.equal(result.status, "pending_review");
  assert.equal(provider.calls.length, 45);
  if (!("run" in result)) return;
  for (const reportType of REPORTS) {
    assert.equal(result.run.selections[reportType]?.candidate, "terra-medium");
    assert.deepEqual(
      provider.calls.filter((request) => requestIdentity(request).reportType === reportType).map((request) => requestIdentity(request).candidate),
      ["luna-low", "luna-low", "luna-low", "luna-medium", "luna-medium", "luna-medium", "terra-medium", "terra-medium", "terra-medium"],
    );
  }
});

test("records a machine failure after all ordered candidates fail and does not qualify later reports", async () => {
  const provider = new TestProvider(() => false);
  const { result, filesystem } = await qualify(provider);
  assert.equal(result.status, "machine_failed");
  assert.equal(provider.calls.length, 12);
  assert.ok(provider.calls.every((request) => requestIdentity(request).reportType === "MAP"));
  assert.equal(filesystem.pending, undefined);
  assert.deepEqual(provider.calls.map((request) => requestIdentity(request).candidate), CANDIDATES.flatMap((candidate) => [candidate, candidate, candidate]));
});

test("never marks machine output reviewed and binds explicit approval to run and pin digests", async () => {
  const { result, filesystem } = await qualify(new TestProvider(() => true));
  assert.equal(result.status, "pending_review");
  assert.equal(filesystem.reviewed, undefined);
  if (!("run" in result)) return;

  const approval: QualificationReviewApproval = {
    status: "approved",
    qualificationRunSha256: result.qualificationRunSha256,
    draftPinsSha256: result.draftPinsSha256,
    reviewedBy: "independent-reviewer",
    reviewedAt: "2026-09-02T13:00:00Z",
    checklist: {
      allOutputsReviewed: true,
      prohibitedClaimsReviewed: true,
      traceabilityReviewed: true,
      fixtureComparabilityReviewed: true,
      pinsApproved: true,
    },
  };
  assert.throws(
    () => new StrictQualificationReviewer().approve(result, { ...approval, qualificationRunSha256: "wrong" }),
    /not bound/u,
  );
  const reviewed = await approveOpenRouterQualification(result, approval, "memory", filesystem);
  assert.equal(reviewed.status, "reviewed");
  assert.equal(reviewed.reviewedBy, "independent-reviewer");
  assert.equal(reviewed.sourceManifestSha256, result.sourceManifestSha256);
  assert.equal(reviewed.qualificationRunSha256, result.qualificationRunSha256);
  assert.equal(reviewed.draftPinsSha256, result.draftPinsSha256);
  assert.equal(reviewed.candidateOrderSha256, result.run.candidateOrderSha256);
  assert.equal(reviewed.approvalSha256, sha256Canonical(approval));
  assert.deepEqual(reviewed.approval, approval);
  assert.deepEqual(reviewed.pins, result.draftPins);
  assert.deepEqual(reviewed.candidates, result.run.candidates);
});

test("accounts actual provider cost and enforces the cap before a live call", async () => {
  const provider = new TestProvider(() => true, 137);
  const { result } = await qualify(provider);
  assert.equal(result.totalCostMicros, 15 * 137);
  assert.equal(result.status, "pending_review");
  if ("run" in result) {
    assert.equal(result.run.runs.reduce((sum, run) => sum + (run.costMicros ?? 0), 0), 15 * 137);
    assert.equal(result.run.runs[0].generationId, "generation-1");
    assert.equal(result.run.runs[0].actualModel, "actual/luna-low");
  }

  const blockedProvider = new TestProvider(() => true);
  await assert.rejects(runOpenRouterQualification({
    outputDirectory: "memory",
    provider: blockedProvider,
    fixtures: new TestFixtures(),
    filesystem: new MemoryFilesystem(),
    gates: new PassFieldGates(),
    costCapMicros: 1,
  }), /cost cap/u);
  assert.equal(blockedProvider.calls.length, 0);
});

test("reviewer rejects rehashed arbitrary models and unreviewed token limits", async () => {
  const { result } = await qualify(new TestProvider(() => true));
  assert.equal(result.status, "pending_review");
  if (!("run" in result)) return;
  const approvalFor = (pending: PendingQualificationResult): QualificationReviewApproval => ({
    status: "approved",
    qualificationRunSha256: pending.qualificationRunSha256,
    draftPinsSha256: pending.draftPinsSha256,
    reviewedBy: "independent-reviewer",
    reviewedAt: "2026-09-02T13:00:00Z",
    checklist: {
      allOutputsReviewed: true,
      prohibitedClaimsReviewed: true,
      traceabilityReviewed: true,
      fixtureComparabilityReviewed: true,
      pinsApproved: true,
    },
  });
  const arbitraryModelPins = { ...result.draftPins, MAP: { ...result.draftPins.MAP, model: "arbitrary/model" } };
  const arbitraryModel = { ...result, draftPins: arbitraryModelPins, draftPinsSha256: sha256Canonical(arbitraryModelPins) };
  assert.throws(() => new StrictQualificationReviewer().approve(arbitraryModel, approvalFor(arbitraryModel)), /bound three-run MAP selection/u);

  const unreviewedTokenPins = { ...result.draftPins, MAP: { ...result.draftPins.MAP, maxOutputTokens: 999_999 } };
  const unreviewedTokenLimit = { ...result, draftPins: unreviewedTokenPins, draftPinsSha256: sha256Canonical(unreviewedTokenPins) };
  assert.throws(() => new StrictQualificationReviewer().approve(unreviewedTokenLimit, approvalFor(unreviewedTokenLimit)), /invalid selected MAP evidence/u);
});
