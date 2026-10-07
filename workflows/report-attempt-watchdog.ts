import { sleep } from "workflow";
import type { PassReportWorkflowInput } from "../lib/server/reports/types.ts";
import { inspectReportAttemptWatchdog } from "../lib/server/reports/attempts.ts";

export async function inspectReportAttemptWatchdogStep(input: PassReportWorkflowInput) {
  "use step";
  return inspectReportAttemptWatchdog(input);
}
inspectReportAttemptWatchdogStep.maxRetries = 3;

export async function reportAttemptWatchdogWorkflow(input: PassReportWorkflowInput): Promise<{ readonly status: "terminal" | "stalled" }> {
  "use workflow";
  for (;;) {
    const inspected = await inspectReportAttemptWatchdogStep(input);
    if (inspected.status !== "waiting") return { status: inspected.status };
    await sleep(new Date(inspected.nextCheckAt!));
  }
}
