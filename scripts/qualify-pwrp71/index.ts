import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename } from "node:fs/promises";
import { loadEnvConfig } from "@next/env";
import path from "node:path";
import type { ReportType } from "../../lib/question-engine/types.ts";
import { sha256Canonical } from "../../lib/report-contracts/delivery-validator.ts";
import type { Pwrp71ApprovalInput, Pwrp71SemanticReviewEvidence } from "../../lib/server/reports/qualification/approval.ts";
import type { Pwqe51RouterQualificationEvidence } from "../../lib/server/reports/qualification/runner.ts";

const ALL_REPORTS = ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"] as const satisfies readonly ReportType[];
const ALL_PROFILES = [...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`), ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`)];
const USAGE = `PWRP 7.1 qualification tooling

Usage:
  npm run reports:qualify:pwrp71 -- offline --profiles P01,P02 --reports MAP,IFS --cost-cap-micros 500000
  npm run reports:qualify:pwrp71 -- live --diagnostic-only --profiles P01,P02 --reports ALL --cost-cap-micros 500000 --routing-evidence route-qualification.json
  npm run reports:qualify:pwrp71 -- resume <run-id> --diagnostic-only
  npm run reports:qualify:pwrp71 -- status <run-id>
  npm run reports:qualify:pwrp71 -- review-package <run-id>
  npm run reports:qualify:pwrp71 -- semantic-digest <semantic-review-evidence.json>
  npm run reports:qualify:pwrp71 -- validate-approval <run-id> --approval approval.json --semantic-evidence semantic-review.json
  npm run reports:qualify:pwrp71 -- manifest <run-id> --approval approval.json --semantic-evidence semantic-review.json --output reviewed-manifest.json

Use --reports DEEPENING for IFS, PV, and ATT, or --reports ALL for all five layers.
The live command is fixture-only and diagnostic. It requires --diagnostic-only, an explicit positive cost cap, and matching final PWQE 5.1 routing evidence. It never delivers reports.

Approval requires a completed live qualification over P01-P09 and C01-C16, all five reports, current semantic-case evidence, and all explicit human checklist items. The manifest command only writes a reviewed manifest after those checks pass.`;

type Command = "offline" | "live" | "resume" | "status" | "review-package" | "semantic-digest" | "validate-approval" | "manifest";

interface ParsedArgs {
  readonly command: Command;
  readonly runId?: string;
  readonly flags: ReadonlyMap<string, string | true>;
}

function parseArguments(argv: readonly string[]): ParsedArgs | undefined {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) return undefined;
  const command = argv[0] as Command;
  if (!["offline", "live", "resume", "status", "review-package", "semantic-digest", "validate-approval", "manifest"].includes(command)) throw new Error(`Unknown command: ${command}`);
  let index = 1;
  const runId = ["resume", "status", "review-package", "validate-approval", "manifest"].includes(command) ? argv[index++] : undefined;
  if (["resume", "status", "review-package", "validate-approval", "manifest"].includes(command) && !runId) throw new Error(`${command} requires a run ID.`);
  const flags = new Map<string, string | true>();
  if (command === "semantic-digest") {
    if (!argv[index]) throw new Error("semantic-digest requires a JSON file path.");
    flags.set("file", argv[index++]);
  }
  while (index < argv.length) {
    const key = argv[index++];
    if (!key.startsWith("--")) throw new Error(`Unexpected argument: ${key}`);
    if (key === "--diagnostic-only") { flags.set(key, true); continue; }
    const value = argv[index++];
    if (!value || value.startsWith("--")) throw new Error(`${key} requires a value.`);
    if (flags.has(key)) throw new Error(`${key} may be specified only once.`);
    flags.set(key, value);
  }
  return { command, runId, flags };
}

function flag(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name);
  return typeof value === "string" ? value : undefined;
}

function requireFlag(args: ParsedArgs, name: string): string {
  const value = flag(args, name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function costCap(args: ParsedArgs): number {
  const value = Number(requireFlag(args, "--cost-cap-micros"));
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error("--cost-cap-micros must be a positive integer in microdollars.");
  return value;
}

function profileIds(args: ParsedArgs): string[] {
  const values = requireFlag(args, "--profiles").split(",").map((value) => value.trim().toUpperCase()).filter(Boolean);
  if (!values.length || new Set(values).size !== values.length || values.some((value) => !ALL_PROFILES.includes(value))) {
    throw new Error(`--profiles must be unique IDs from ${ALL_PROFILES.join(", ")}.`);
  }
  return values;
}

function reportTypes(args: ParsedArgs, defaultAll = false): ReportType[] {
  const raw = flag(args, "--reports");
  if (!raw && defaultAll) return [...ALL_REPORTS];
  if (!raw) throw new Error("--reports is required.");
  const values = raw.toUpperCase() === "ALL" ? [...ALL_REPORTS]
    : raw.toUpperCase() === "DEEPENING" ? ["IFS", "PV", "ATT"] as const
      : raw.split(",").map((value) => value.trim().toUpperCase());
  if (!values.length || new Set(values).size !== values.length || values.some((value) => !ALL_REPORTS.includes(value as ReportType))) {
    throw new Error(`--reports must be ALL, DEEPENING, or unique report IDs: ${ALL_REPORTS.join(", ")}.`);
  }
  return [...values] as ReportType[];
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "wx");
  try { await handle.writeFile(contents, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, file);
}

async function routeEvidence(args: ParsedArgs): Promise<Pwqe51RouterQualificationEvidence | undefined> {
  const file = flag(args, "--routing-evidence");
  return file ? readJson<Pwqe51RouterQualificationEvidence>(path.resolve(file)) : undefined;
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  if (!args) { process.stdout.write(`${USAGE}\n`); return; }
  const workspaceRoot = process.cwd();
  const outputRoot = path.resolve(flag(args, "--output-root") ?? path.join(workspaceRoot, ".qualification", "pwrp71"));

  if (args.command === "semantic-digest") {
    const evidence = await readJson<unknown>(String(args.flags.get("file")));
    process.stdout.write(`${sha256Canonical(evidence)}\n`);
    return;
  }

  // Load repository-local env before qualification modules bind candidate policy.
  loadEnvConfig(workspaceRoot);
  const qualification = await import("../../lib/server/reports/qualification/runner.ts");
  const approval = await import("../../lib/server/reports/qualification/approval.ts");

  if (args.command === "offline" || args.command === "live") {
    const isLive = args.command === "live";
    if (isLive && args.flags.get("--diagnostic-only") !== true) throw new Error("live qualification requires explicit --diagnostic-only permission.");
    const capMicros = costCap(args);
    const profiles = profileIds(args);
    const reports = reportTypes(args, !isLive);
    const routing = await routeEvidence(args);
    let transport;
    if (isLive && process.env.OPENROUTER_API_KEY) {
      const { OpenRouterClient } = await import("../../lib/server/openrouter/client.ts");
      transport = new OpenRouterClient({ apiKey: process.env.OPENROUTER_API_KEY });
    }
    const run = await qualification.runPwrp71Qualification({
      runId: flag(args, "--run-id"),
      mode: isLive ? "live" : "offline",
      profileIds: profiles,
      reportTypes: reports,
      costCapMicros: capMicros,
      workspaceRoot,
      outputRoot,
      routingEvidence: routing,
      ...(transport ? { transport } : {}),
    });
    process.stdout.write(`${JSON.stringify({ runId: run.runId, mode: run.mode, status: run.status, routeParity: run.routeParity, blockers: run.blockers, outputs: run.results.length, totalReportedCostMicros: run.totalReportedCostMicros, reservedUnknownCostMicros: run.reservedUnknownCostMicros, qualificationRunSha256: run.qualificationRunSha256, outputDirectory: run.outputDirectory }, null, 2)}\n`);
    return;
  }

  if (args.command === "resume") {
    const run = await qualification.readPwrp71QualificationRun(args.runId!, outputRoot);
    if (run.mode === "live" && args.flags.get("--diagnostic-only") !== true) throw new Error("Resuming a live run requires explicit --diagnostic-only permission.");
    let routing = await routeEvidence(args);
    if (!routing && run.routingEvidenceFile) routing = await readJson<Pwqe51RouterQualificationEvidence>(path.join(run.outputDirectory, run.routingEvidenceFile));
    if (run.sourcePins.routingQualificationSha256 && (!routing || sha256Canonical(routing) !== run.sourcePins.routingQualificationSha256)) {
      throw new Error("Resume routing evidence must exactly match the source-pinned qualification receipt.");
    }
    const resumed = await qualification.runPwrp71Qualification({
      runId: run.runId,
      mode: run.mode,
      profileIds: run.selectedProfiles,
      reportTypes: run.selectedReports,
      costCapMicros: run.costCapMicros,
      workspaceRoot,
      outputRoot,
      routingEvidence: routing,
    });
    process.stdout.write(`${JSON.stringify({ runId: resumed.runId, status: resumed.status, outputs: resumed.results.length, totalReportedCostMicros: resumed.totalReportedCostMicros, reservedUnknownCostMicros: resumed.reservedUnknownCostMicros, qualificationRunSha256: resumed.qualificationRunSha256 }, null, 2)}\n`);
    return;
  }

  if (args.command === "status") {
    const run = await qualification.readPwrp71QualificationRun(args.runId!, outputRoot);
    const attempts = await qualification.readPwrp71QualificationAttempts(run);
    process.stdout.write(`${JSON.stringify({ ...run, attempts: attempts.map(({ providerResult, ...record }) => ({ ...record, ...(providerResult ? { providerResultSha256: sha256Canonical(providerResult) } : {}) })) }, null, 2)}\n`);
    return;
  }

  if (args.command === "review-package") {
    const result = await approval.writePwrp71PendingReviewPackage({ runId: args.runId!, outputRoot, workspaceRoot });
    process.stdout.write(`${JSON.stringify({ status: result.reviewPackage.status, approvalEligible: result.reviewPackage.approvalEligible, blockers: result.reviewPackage.blockers, providerQualificationEvidenceSha256: result.reviewPackage.providerQualificationEvidenceSha256, draftPinsSha256: result.reviewPackage.draftPinsSha256, reviewPackageFile: result.reviewPackageFile, semanticEvidenceTemplateFile: result.semanticEvidenceTemplateFile }, null, 2)}\n`);
    return;
  }

  const approvalFile = path.resolve(requireFlag(args, "--approval"));
  const semanticFile = path.resolve(requireFlag(args, "--semantic-evidence"));
  const approvalInput = await readJson<Pwrp71ApprovalInput>(approvalFile);
  const semanticEvidence = await readJson<Pwrp71SemanticReviewEvidence>(semanticFile);
  const built = await approval.validatePwrp71ApprovalAndBuildManifest({ runId: args.runId!, approval: approvalInput, semanticEvidence, outputRoot, workspaceRoot });
  if (args.command === "validate-approval") {
    process.stdout.write(`${JSON.stringify({ status: "valid_for_manifest_preparation", reviewedBy: built.manifest.reviewedBy, manifestSha256: built.manifestSha256, manifest: built.manifest }, null, 2)}\n`);
    return;
  }
  const output = path.resolve(requireFlag(args, "--output"));
  await atomicWrite(output, `${JSON.stringify(built.manifest, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ status: "reviewed_manifest_written_not_activated", output, manifestSha256: built.manifestSha256 }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
