import { runReportPreflight } from "../../lib/server/reports/preflight.ts";

async function main(): Promise<void> {
  const result = await runReportPreflight(process.cwd());
  for (const check of result.checks) process.stdout.write(`${check.ok ? "PASS" : "FAIL"} ${check.name}: ${check.message}\n`);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`Report preflight failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
