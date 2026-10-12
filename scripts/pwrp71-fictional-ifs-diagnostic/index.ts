import { loadEnvConfig } from "@next/env";
import { OpenRouterClient } from "../../lib/server/openrouter/client.ts";
import {
  assertOpenRouterDiagnosticRouteEligible,
  assertOpenRouterNonZdrDiagnosticRouteEligible,
  assertOpenRouterReachable,
} from "./connectivity.ts";
import {
  parseFictionalIfsDiagnosticArgs,
  runFictionalIfsDiagnostic,
} from "./diagnostic.ts";

async function main(): Promise<void> {
  const invocation = parseFictionalIfsDiagnosticArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const run = await runFictionalIfsDiagnostic(invocation, {
    workspaceRoot,
    transportFactory: async ({ fetch }) => {
      // Read the credential only after the diagnostic module has checked the
      // owner scope, approvals, current source pins, packets, pricing, and
      // exact no-dispatch request identity.
      await assertOpenRouterReachable(globalThis.fetch);
      if (invocation.allowNonZdrContinuation) await assertOpenRouterNonZdrDiagnosticRouteEligible(globalThis.fetch);
      else await assertOpenRouterDiagnosticRouteEligible(globalThis.fetch);
      loadEnvConfig(workspaceRoot);
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY is not available after local environment loading; no provider request was made.");
      // Retain the provider's bounded schema-rejection detail in attempts.json
      // for this local fictional experiment; normal provider clients keep it off.
      return new OpenRouterClient({ apiKey, fetch, captureProviderErrorDetail: true });
    },
  });
  process.stdout.write(`${JSON.stringify({
    resultKind: run.resultKind,
    status: run.status,
    routingQualification: run.routingQualification,
    productionActivationEffect: run.productionActivationEffect,
    runId: run.runId,
    providerDispatchCount: run.providerDispatchCount,
    aggregateReportedCostMicros: run.budget.aggregateReportedCostMicros,
    unknownOrInFlightReservedCostMicros: run.budget.unknownOrInFlightReservedCostMicros,
    remainingAuthorizedMicros: run.budget.remainingAuthorizedMicros,
    results: run.results.map((result) => ({ profileId: result.profileId, reportType: result.reportType, status: result.status, artifactFile: result.artifactFile, markdownFile: result.markdownFile })),
    blockers: run.blockers,
    outputDirectory: run.outputDirectory,
  }, null, 2)}\n`);
  if (run.status !== "diagnostic_complete" && run.status !== "diagnostic_complete_with_prior_unknown_cost") process.exitCode = 1;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
