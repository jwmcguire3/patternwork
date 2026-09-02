import { runReportCli } from "./run.ts";

export interface ReportCliArguments { readonly input: string; readonly output: string; readonly persistAssessmentId?: string }

export function parseReportCliArguments(argv: readonly string[]): ReportCliArguments {
  const value = (flag: string) => { const index = argv.indexOf(flag); return index >= 0 ? argv[index + 1] : undefined; };
  const input = value("--input"); const output = value("--output"); const persistAssessmentId = value("--persist-assessment");
  if (!input || !output) throw new Error("Usage: npm run reports:codex -- --input <results-or-packet.json> --output <directory> [--persist-assessment <id>]");
  return { input, output, ...(persistAssessmentId ? { persistAssessmentId } : {}) };
}

async function main() {
  const args = parseReportCliArguments(process.argv.slice(2));
  const result = await runReportCli({ inputPath: args.input, outputDirectory: args.output, persistAssessmentId: args.persistAssessmentId });
  process.stdout.write(`Generated ${result.reportTypes.join(", ")} report artifacts.\n`);
}

if (process.argv[1]?.endsWith("report-cli/index.ts") || process.argv[1]?.endsWith("report-cli\\index.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
