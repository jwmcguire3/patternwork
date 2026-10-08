import { selectDebugReports, type DebugReportResult, type DebugReportRunInput } from "../lib/server/debug/report-runner.ts";
import {
  failDebugReportRunStep,
  finishDebugReportRunStep,
  generateDebugReportStep,
  startDebugReportRunStep,
} from "../lib/server/debug/report-runner.ts";

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("router_qualification_pending")) return "ROUTER_QUALIFICATION_PENDING";
  if (message.includes("cost_cap")) return "COST_CAP";
  if (message.includes("provider_")) return "OPENROUTER";
  if (message.includes("validation")) return "VALIDATION";
  if (message.includes("model_mismatch")) return "MODEL_MISMATCH";
  if (message.includes("not_configured")) return "CONFIGURATION";
  return "GENERATION_FAILED";
}

export async function debugReportWorkflow(input: DebugReportRunInput): Promise<{ readonly status: "SUCCEEDED" }> {
  "use workflow";
  await startDebugReportRunStep(input.runId);
  const results: DebugReportResult[] = [];
  let spentMicros = 0;
  try {
    for (const reportType of selectDebugReports(input.mode)) {
      const result = await generateDebugReportStep({ ...input, reportType, layerReports: results, spentMicros });
      results.push(result);
      spentMicros += result.usage.costMicros;
    }
    await finishDebugReportRunStep(input.runId);
    return { status: "SUCCEEDED" };
  } catch (error) {
    await failDebugReportRunStep({ runId: input.runId, failureCode: failureCode(error) });
    throw error;
  }
}
