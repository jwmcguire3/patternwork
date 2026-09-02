import { readFile } from "node:fs/promises";
import path from "node:path";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import {
  CanonicalQualificationFixtures,
  NodeQualificationFilesystem,
  approveOpenRouterQualification,
  qualificationManifestDigest,
  runOpenRouterQualification,
  type PendingQualificationResult,
  type QualificationReviewApproval,
} from "../../lib/server/openrouter/qualification.ts";

const USAGE = `Usage:
  npm run reports:qualify -- --output <dir>
  npm run reports:qualify -- --output <dir> --approval <approval.json>

The first command runs live machine qualification and writes a pending-review
package. The second binds an explicit human approval to that exact run and pin
digest, then writes reviewed-activation-manifest.json.

Production activation requires both deployment variables:
  OPENROUTER_QUALIFICATION_MANIFEST_JSON=<reviewed-activation-manifest.json contents>
  OPENROUTER_QUALIFICATION_MANIFEST_SHA256=<canonical digest printed after approval>`;

interface Arguments {
  readonly outputDirectory: string;
  readonly approvalPath?: string;
}

function parseArguments(argv: readonly string[]): Arguments | undefined {
  if (argv.includes("--help") || argv.includes("-h")) return undefined;
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
  const filesystem = new NodeQualificationFilesystem();
  if (args.approvalPath) {
    const pending = await jsonFile<PendingQualificationResult>(path.join(args.outputDirectory, "pending-review.json"));
    const approval = await jsonFile<QualificationReviewApproval>(args.approvalPath);
    const reviewed = await approveOpenRouterQualification(pending, approval, args.outputDirectory, filesystem);
    process.stdout.write(`Reviewed activation manifest written for ${reviewed.reviewedBy}.\nOPENROUTER_QUALIFICATION_MANIFEST_SHA256=${qualificationManifestDigest(reviewed)}\n`);
    return;
  }
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for live qualification.");
  const result = await runOpenRouterQualification({
    outputDirectory: args.outputDirectory,
    provider: new OpenRouterClient({ apiKey }),
    fixtures: new CanonicalQualificationFixtures(),
    filesystem,
    costCapMicros: qualificationCostCapMicros(process.env.OPENROUTER_MAX_COST_PER_ASSESSMENT_USD),
  });
  process.stdout.write(`${JSON.stringify({ status: result.status, totalCostMicros: result.totalCostMicros }, null, 2)}\n`);
  if (result.status === "pending_review") {
    process.stdout.write("Machine gates passed. Independent content review is still required; no reviewed activation manifest was created.\n");
  } else {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}\n`);
  process.exitCode = 1;
});
