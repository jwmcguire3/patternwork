import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Pwqe5PendingQualificationResult, Pwqe5QualificationReviewApproval } from "../../lib/server/openrouter/pwqe5-provider-qualification.ts";

const USAGE = `Usage:
  npm run reports:qualify -- --offline-fixtures
  npm run reports:qualify -- --output <dir>
  npm run reports:qualify -- --output <dir> --approval <approval.json>

The offline command validates the PWQE5 router packets without provider calls.
The live command runs machine qualification against PWQE5/PWQE6 and writes a
pending human-review package. The approval command binds an explicit human
approval to that exact run and pin digest before writing a reviewed manifest.
Use a fresh output directory for a new run after a terminal machine or budget failure.

Production activation requires both deployment variables:
  OPENROUTER_QUALIFICATION_MANIFEST_JSON=<reviewed-activation-manifest.json contents>
  OPENROUTER_QUALIFICATION_MANIFEST_SHA256=<canonical digest printed after approval>`;

interface Arguments {
  readonly offlineFixtures?: boolean;
  readonly outputDirectory?: string;
  readonly approvalPath?: string;
}

function parseArguments(argv: readonly string[]): Arguments | undefined {
  if (argv.includes("--help") || argv.includes("-h")) return undefined;
  if (argv.length === 1 && argv[0] === "--offline-fixtures") return { offlineFixtures: true };
  let outputDirectory: string | undefined;
  let approvalPath: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--output") outputDirectory = argv[++index];
    else if (value === "--approval") approvalPath = argv[++index];
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (!outputDirectory) throw new Error("--output <dir> is required.");
  return { outputDirectory: path.resolve(outputDirectory), approvalPath: approvalPath ? path.resolve(approvalPath) : undefined };
}

function qualificationCostCapMicros(raw: string | undefined): number {
  if (!raw) throw new Error("OPENROUTER_MAX_COST_PER_ASSESSMENT_USD is required for live qualification.");
  const dollars = Number(raw);
  const micros = Math.round(dollars * 1_000_000);
  if (!Number.isFinite(dollars) || dollars <= 0 || !Number.isSafeInteger(micros) || micros <= 0) {
    throw new Error("OPENROUTER_MAX_COST_PER_ASSESSMENT_USD must be a positive finite USD amount.");
  }
  return micros;
}

async function jsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (!args) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (args.offlineFixtures) {
    const { buildPwqe5QualificationFixtureSet } = await import("../../lib/server/openrouter/pwqe5-qualification-fixtures.ts");
    const fixtures = await buildPwqe5QualificationFixtureSet(process.cwd());
    process.stdout.write(`${JSON.stringify({
      qualificationMode: fixtures.qualificationMode,
      qualificationStatus: "source-router-packet-verified",
      providerCalls: 0,
      approvalStatus: "not-reviewed",
      questionRelease: fixtures.questionRelease,
      routerVersion: fixtures.routerVersion,
      promptRelease: fixtures.promptRelease,
      reportContract: fixtures.reportContract,
      sourceSha256: fixtures.sourceSha256,
      sourceManifestSha256: fixtures.sourceManifestSha256,
      workedPathsSha256: fixtures.workedPathsSha256,
      negativeCasesSha256: fixtures.negativeCasesSha256,
      fixtureSetSha256: fixtures.fixtureSetSha256,
      profileFixtureCount: fixtures.profiles.length,
      mappingPacketCount: fixtures.profiles.length,
      pass2PacketCount: fixtures.profiles.length,
      negativeCaseCount: fixtures.negativeCases.length,
      negativeCaseIndexCount: fixtures.negativeCaseIndex.length,
      checks: [
        { id: "source-package-pinned", status: "passed", detail: "Loaded every byte-pinned PWQE5 source asset and v6 report prompt/schema." },
        { id: "canonical-worked-path-responses", status: "passed", detail: "Only authored item IDs, selected option IDs, occurrence IDs, steps, statuses, and modes were converted to responses." },
        { id: "router-packet-compilation", status: "passed", detail: `Compiled and schema-validated ${fixtures.profiles.length} Mapping and ${fixtures.profiles.length} Pass 2 packets with the production router and packet builder.` },
        { id: "editorial-reference-boundary", status: "passed", detail: "Authored claims, sample prose, and selection reasons are stored separately and excluded from provider prompt inputs." },
        { id: "provider-boundary", status: "passed", detail: "No provider transport was created or called; no output or approval was produced." },
      ],
    }, null, 2)}\n`);
    return;
  }
  if (!args.outputDirectory) throw new Error("--output <dir> is required unless --offline-fixtures is used.");
  const outputDirectory = args.outputDirectory;
  // Load .env.local before importing policy.ts, which binds configured candidate model IDs at module initialization.
  loadEnvConfig(process.cwd());
  const qualification = await import("../../lib/server/openrouter/pwqe5-provider-qualification.ts");
  if (args.approvalPath) {
    const pending = await jsonFile<Pwqe5PendingQualificationResult>(path.join(outputDirectory, "pwqe5-pending-review.json"));
    const approval = await jsonFile<Pwqe5QualificationReviewApproval>(args.approvalPath);
    const reviewed = await qualification.approveAndSavePwqe5Qualification(pending, approval, outputDirectory);
    process.stdout.write(`Reviewed PWQE5 activation manifest written for ${reviewed.manifest.reviewedBy}.\nOPENROUTER_QUALIFICATION_MANIFEST_SHA256=${reviewed.manifestSha256}\n`);
    return;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for live qualification.");
  const { OpenRouterClient } = await import("../../lib/server/openrouter/client.ts");
  const result = await qualification.runPwqe5ProviderQualification({
    outputDirectory,
    provider: new OpenRouterClient({ apiKey }),
    costCapMicros: qualificationCostCapMicros(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD),
    workspaceRoot: process.cwd(),
  });
  const pending = "qualificationRunSha256" in result;
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    totalCostMicros: result.totalCostMicros,
    ...(pending ? { qualificationRunSha256: result.qualificationRunSha256, draftPinsSha256: result.draftPinsSha256 } : {}),
    ...( "failure" in result && result.failure ? { failure: result.failure } : {}),
  }, null, 2)}\n`);
  if (pending) {
    process.stdout.write("Machine gates passed. Independent human report review is still required; no reviewed activation manifest was created.\n");
  } else {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
