import type { ReportType } from "../../question-engine/types.ts";
import type { DebugReportResult, DebugReportRunInput } from "./report-runner.ts";

/**
 * Workflow entrypoints. Only plain type imports are allowed at module scope:
 * Node-dependent report generation is loaded inside each durable Node step.
 * Never statically import report-runner.ts into a "use workflow" graph.
 */
export async function startDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  const { startDebugReportRunStep: run } = await import("./report-runner.ts");
  await run(runId);
}

export async function generateDebugReportStep(input: DebugReportRunInput & {
  readonly reportType: ReportType;
  readonly layerReports: readonly DebugReportResult[];
  readonly spentMicros: number;
}): Promise<DebugReportResult> {
  "use step";
  const { generateDebugReportStep: run } = await import("./report-runner.ts");
  return run(input);
}
generateDebugReportStep.maxRetries = 0;

export async function finishDebugReportRunStep(runId: string): Promise<void> {
  "use step";
  const { finishDebugReportRunStep: run } = await import("./report-runner.ts");
  await run(runId);
}

export async function failDebugReportRunStep(input: { readonly runId: string; readonly failureCode: string }): Promise<void> {
  "use step";
  const { failDebugReportRunStep: run } = await import("./report-runner.ts");
  await run(input);
}
