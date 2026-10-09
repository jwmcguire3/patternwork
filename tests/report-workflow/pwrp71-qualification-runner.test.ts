import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import type { JsonObject } from "../../lib/question-engine/types.ts";
import { loadPwqe51SourcePackage } from "../../lib/question-engine/pwqe51-source.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import { QUALIFICATION_MODEL_ORDER, UNQUALIFIED_MOCK_MODEL_POLICY } from "../../lib/server/openrouter/policy.ts";
import type { OpenRouterGenerationRequest, OpenRouterGenerationResult, OpenRouterTransport } from "../../lib/server/openrouter/types.ts";
import { generateCanonicalReport } from "../../lib/server/reports/generator.ts";
import { preparePwrp71Request } from "../../lib/server/reports/pwrp71-adapter.ts";
import { loadPwrp71SourcePackage } from "../../lib/server/reports/pwrp71-source.ts";
import { loadPwrp71QualificationFixtures } from "../../lib/server/reports/qualification/fixtures.ts";
import { loadPwrp71FixturePacket } from "../../lib/server/reports/qualification/replay.ts";
import { readPwrp71QualificationAttempts, runPwrp71Qualification } from "../../lib/server/reports/qualification/runner.ts";

const WORKSPACE_TEST_SCRATCH = path.resolve(process.cwd(), ".codex-temp");

async function createWorkspaceTestRoot(prefix: string): Promise<string> {
  await mkdir(WORKSPACE_TEST_SCRATCH, { recursive: true });
  const root = path.resolve(await mkdtemp(path.join(WORKSPACE_TEST_SCRATCH, prefix)));
  if (!root.startsWith(`${WORKSPACE_TEST_SCRATCH}${path.sep}`)) throw new Error("Test temporary directory escaped the workspace scratch root.");
  return root;
}

async function removeWorkspaceTestRoot(root: string): Promise<void> {
  const resolved = path.resolve(root);
  if (resolved === WORKSPACE_TEST_SCRATCH || !resolved.startsWith(`${WORKSPACE_TEST_SCRATCH}${path.sep}`)) {
    throw new Error("Refusing to remove a path outside the exact workspace test root.");
  }
  await rm(resolved, { recursive: true, force: true });
}

async function withOutputRoot(run: (outputRoot: string) => Promise<void>): Promise<void> {
  const parent = await createWorkspaceTestRoot("pwrp71-runner-");
  try { await run(path.join(parent, "runs")); }
  finally { await removeWorkspaceTestRoot(parent); }
}

function fileSha(text: string): string {
  return createHash("sha256").update(text.replace(/\r\n/gu, "\n"), "utf8").digest("hex");
}

function mappingScopePacket(packet: JsonObject): JsonObject {
  const value = structuredClone(packet) as Record<string, unknown>;
  const scope = value.assessment_scope as Record<string, unknown>;
  scope.phase = "mapping";
  delete value.content_sha256;
  value.content_sha256 = sha256Canonical(value);
  return value as JsonObject;
}

async function writeRouteReplayFixtureSet(fixtureRoot: string): Promise<void> {
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const legacy = await loadPwrp71QualificationFixtures();
  const mappingPacket = await loadPwrp71FixturePacket({ profileId: "C01", fixtures: legacy, questionSource });
  const v2Root = path.join(process.cwd(), "qualification", "pwrp71", "constructed_histories_v2");
  const v2ManifestText = await readFile(path.join(v2Root, "manifest.json"), "utf8");
  const v2Manifest = JSON.parse(v2ManifestText) as { sourceCommit: string };
  const inputs = {
    v2ManifestSha256: fileSha(v2ManifestText),
    sourceCommit: v2Manifest.sourceCommit,
    questionRelease: questionSource.manifest.source_binding.question_release,
    routerVersion: questionSource.manifest.source_binding.runtime_version,
    questionSourceSha256: questionSource.manifest.source_binding.source_sha256,
    questionSourceManifestSha256: questionSource.sourceManifestSha256,
    reportRelease: reportSource.policy.release,
    reportSourceManifestSha256: reportSource.manifestSha256,
  };
  const ids = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
  const profiles: Record<string, unknown>[] = [];
  await mkdir(fixtureRoot, { recursive: true });
  for (const profileId of ids) {
    const authoredFixtureText = await readFile(path.join(v2Root, `${profileId}.json`), "utf8");
    const hasMap = profileId === "C01";
    const artifact = {
      schemaVersion: "PWQE51-ROUTE-REPLAY-V3",
      profileId,
      authoredAnswerDisposition: [],
      sourceIdentity: { ...inputs, authoredFixtureFile: `${profileId}.json`, authoredFixtureSha256: fileSha(authoredFixtureText) },
      replay: { completeness: { mapping: hasMap ? "complete" : "partial", deepening: "not_applicable" }, routingDecisionTrace: [] },
      packets: hasMap ? { MAP: { packet: mappingScopePacket(mappingPacket.packet) }, IFS: { packet: mappingScopePacket(mappingPacket.packet) } } : {},
      packetValidation: hasMap ? { MAP: { accepted: true, issueCodes: [] }, IFS: { accepted: true, issueCodes: [] } } : {},
    };
    const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
    const file = `${profileId}.json`;
    await writeFile(path.join(fixtureRoot, file), artifactText, "utf8");
    const semanticResultSha256 = sha256Canonical({
      submitted: [],
      trace: [],
      completeness: [hasMap, false, false],
      packets: artifact.packetValidation,
      authoredAnswerDisposition: [],
    });
    profiles.push({
      profileId,
      file,
      artifactSha256: fileSha(artifactText),
      semanticResultSha256,
      mapping: hasMap ? "complete" : "partial",
      deepening: "not_applicable",
      originalAnswers: { issuedAndAccepted: 0, unreached: 0, intentionallyForbidden: 0 },
      replayConfirmed: false,
      mappingPacketAccepted: hasMap,
      deepeningPacketAccepted: false,
      adapterIssueCodes: [],
      firstDivergence: null,
    });
  }
  await writeFile(path.join(fixtureRoot, "manifest.json"), `${JSON.stringify({
    schemaVersion: "PWQE51-ROUTE-REPLAY-V3-MANIFEST",
    qualificationStatus: "internal_session_replay_not_independent_qualification",
    inputs,
    profiles,
  }, null, 2)}\n`, "utf8");
}

test("offline runner uses the production report/review loop and keeps output explicitly unqualified", async () => {
  await withOutputRoot(async (outputRoot) => {
    const run = await runPwrp71Qualification({
      runId: "offline-c01-all-layers",
      mode: "offline",
      profileIds: ["C01"],
      reportTypes: ["SYNTHESIS", "ATT", "PV", "IFS", "MAP"],
      costCapMicros: 1_000_000,
      outputRoot,
      workspaceRoot: process.cwd(),
    });
    assert.equal(run.status, "offline_complete");
    assert.equal(run.routeParity, "pending");
    assert.deepEqual(run.results.map(({ status }) => status), ["accepted", "accepted", "accepted", "accepted", "accepted"]);
    assert.deepEqual(run.selectedReports, ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"]);
    assert.ok(run.results.every((result) => result.usage?.status === "mock"));
    assert.equal(run.totalReportedCostMicros, 0);
    assert.equal((await readPwrp71QualificationAttempts(run)).length, 10, "each report has a generation and a reviewer call");
  });
});

test("v3 runner selects only router replay packets and blocks reports without a completed stage", async () => {
  const parent = await createWorkspaceTestRoot("pwrp71-v3-fixtures-");
  const fixtureRoot = path.join(parent, "route_replays_v3");
  await writeRouteReplayFixtureSet(fixtureRoot);
  try {
    await withOutputRoot(async (outputRoot) => {
      const run = await runPwrp71Qualification({
        runId: "offline-v3-c01-stage-eligibility",
        mode: "offline",
        fixtureSet: "route-replays-v3",
        fixtureRoot,
        profileIds: ["C01"],
        reportTypes: ["IFS", "MAP"],
        costCapMicros: 1_000_000,
        outputRoot,
        workspaceRoot: process.cwd(),
      });
      assert.equal(run.status, "blocked");
      assert.equal(run.sourcePins.fixtureSet, "route-replays-v3");
      assert.match(run.sourcePins.fixtureManifestSha256 ?? "", /^[a-f0-9]{64}$/u);
      assert.equal(run.results.find((result) => result.reportType === "MAP")?.status, "accepted");
      const deepening = run.results.find((result) => result.reportType === "IFS");
      assert.equal(deepening?.status, "blocked");
      assert.equal(deepening?.failure?.code, "route_replay_report_ineligible");
      assert.match(deepening?.failure?.message ?? "", /not eligible for IFS/u);
      assert.ok(deepening?.validationIssues?.some((issue) => issue.code === "route_replay_stage_packet_mismatch"));
    });
  } finally { await removeWorkspaceTestRoot(parent); }
});

test("explicit v3 fixture selection fails closed when its manifest is missing", async () => {
  const parent = await createWorkspaceTestRoot("pwrp71-v3-missing-");
  try {
    await withOutputRoot(async (outputRoot) => {
      await assert.rejects(runPwrp71Qualification({
        runId: "offline-v3-missing-manifest",
        mode: "offline",
        fixtureSet: "route-replays-v3",
        fixtureRoot: path.join(parent, "missing"),
        profileIds: ["C01"],
        reportTypes: ["MAP"],
        costCapMicros: 1_000_000,
        outputRoot,
        workspaceRoot: process.cwd(),
      }), /no legacy fallback/u);
    });
  } finally { await removeWorkspaceTestRoot(parent); }
});

test("live runner blocks before provider dispatch when final routing evidence is missing", async () => {
  await withOutputRoot(async (outputRoot) => {
    let providerCalls = 0;
    const transport: OpenRouterTransport = {
      async generate(): Promise<OpenRouterGenerationResult> {
        providerCalls += 1;
        throw new Error("provider must not be called without route qualification evidence");
      },
    };
    const run = await runPwrp71Qualification({
      runId: "live-no-route-evidence",
      mode: "live",
      profileIds: ["C01"],
      reportTypes: ["MAP"],
      costCapMicros: 1_000_000,
      maxCallCostMicros: 1_000_000,
      aggregateCostCapMicros: 1_000_000,
      outputRoot,
      workspaceRoot: process.cwd(),
      transport,
    });
    assert.equal(run.status, "blocked");
    assert.equal(providerCalls, 0);
    assert.match(run.blockers[0] ?? "", /router qualification evidence/u);
    assert.equal(run.results.length, 0);
  });
});

test("live runner refuses legacy aggregate-only budgets before any provider dispatch", async () => {
  await withOutputRoot(async (outputRoot) => {
    let providerCalls = 0;
    const transport: OpenRouterTransport = {
      async generate(): Promise<OpenRouterGenerationResult> {
        providerCalls += 1;
        throw new Error("provider must not be called when the per-call cap is absent");
      },
    };
    await assert.rejects(runPwrp71Qualification({
      runId: "live-missing-call-cap",
      mode: "live",
      profileIds: ["C01"],
      reportTypes: ["IFS"],
      costCapMicros: 1_000_000,
      aggregateCostCapMicros: 1_000_000,
      outputRoot,
      workspaceRoot: process.cwd(),
      transport,
    }), /explicit positive safe-integer maxCallCostMicros/u);
    assert.equal(providerCalls, 0);
  });
});

test("PWRP 7.1 generation records the requested model/effort and rejects a different returned model", async () => {
  const fixtures = await loadPwrp71QualificationFixtures();
  const questionSource = await loadPwqe51SourcePackage();
  const reportSource = await loadPwrp71SourcePackage();
  const fixture = await loadPwrp71FixturePacket({ profileId: "C01", fixtures, questionSource });
  const prepared = preparePwrp71Request({ packet: fixture.packet, reportType: "MAP", questionSource, reportSource });
  assert.equal(prepared.ok, true, prepared.ok ? undefined : JSON.stringify(prepared.issues));
  if (!prepared.ok) return;

  let captured: OpenRouterGenerationRequest | undefined;
  const transport: OpenRouterTransport = {
    async generate(request): Promise<OpenRouterGenerationResult> {
      captured = request;
      return {
        ok: true,
        output: {} as JsonObject,
        usage: {
          generationId: "wrong-model-test",
          inputTokens: 2,
          outputTokens: 1,
          reasoningTokens: 0,
          totalTokens: 3,
          costMicros: 1,
          currency: "USD",
          model: "different/provider-model",
        },
        finishReason: "stop",
      };
    },
  };
  const result = await generateCanonicalReport({
    reportType: "MAP",
    input: {},
    packets: [fixture.packet],
    provider: transport,
    invocationKey: "wrong-model-test",
    spentMicros: 0,
    costCapMicros: 1_000_000,
    modelPolicy: UNQUALIFIED_MOCK_MODEL_POLICY,
    contractVersion: "v7.1",
    pwrp71: { request: prepared.value, packet: fixture.packet, source: reportSource },
  });
  assert.equal(captured?.model, QUALIFICATION_MODEL_ORDER[0].model);
  assert.equal(captured?.reasoningEffort, "max");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failure.code, "protocol");
    assert.match(result.failure.message, /returned model .* qualification request pinned/u);
    assert.equal(result.failure.usages[0]?.model, "different/provider-model");
  }
});
