import { retryOperatorReportAttempt } from "../../lib/server/reports/retry.ts";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (flag: string) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
  const attemptId = value("--attempt");
  const requestIdempotencyKey = value("--idempotency-key");
  if (!attemptId) {
    process.stderr.write("Usage: npm run reports:retry -- --attempt <attempt-id> [--idempotency-key <key>]\n");
    process.exitCode = 2;
    return;
  }
  const result = await retryOperatorReportAttempt(attemptId, requestIdempotencyKey);
  process.stdout.write(`${JSON.stringify({ status: result.status, attemptId: result.invocation.attemptId, attemptNumber: result.invocation.attemptNumber, ...( "workflowRunId" in result ? { workflowRunId: result.workflowRunId } : {}), ...( "watchdogRunId" in result ? { watchdogRunId: result.watchdogRunId } : {}) })}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`Report retry failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
