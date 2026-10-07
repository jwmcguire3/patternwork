import { start } from "workflow/api";
import { passReportWorkflow } from "../../../workflows/pass-report.ts";
import { reportAttemptWatchdogWorkflow } from "../../../workflows/report-attempt-watchdog.ts";
import { bindAttemptRunIds, buildAttemptInvocationKey, markEnqueueFailure } from "./attempts.ts";
import type { PassReportWorkflowInput } from "./types.ts";

export interface EnqueuePassReportWorkflowInput {
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly completedPass: 1 | 2;
  readonly attemptId?: string;
  readonly attemptNumber?: number;
  readonly invocationKey?: string;
}

export function buildReportWorkflowInvocation(input: EnqueuePassReportWorkflowInput): PassReportWorkflowInput {
  if (!input.assessmentSessionId.trim() || !input.snapshotId.trim()) throw new TypeError("assessmentSessionId and snapshotId are required.");
  if (input.completedPass !== 1 && input.completedPass !== 2) throw new TypeError("completedPass must be 1 or 2.");
  const attemptId = input.attemptId?.trim() || `offline-${input.snapshotId}`;
  const attemptNumber = input.attemptNumber ?? 1;
  if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new TypeError("attemptNumber must be a positive integer.");
  const normalized = { ...input, attemptId, attemptNumber };
  const invocationKey = input.invocationKey ?? buildAttemptInvocationKey(normalized);
  return { ...normalized, invocationKey };
}

export async function enqueuePassReportWorkflow(
  input: EnqueuePassReportWorkflowInput,
): Promise<{ workflowRunId: string; watchdogRunId: string }> {
  const invocation = buildReportWorkflowInvocation(input);
  try {
    const watchdog = await start(reportAttemptWatchdogWorkflow, [invocation]);
    await bindAttemptRunIds(invocation, { watchdogRunId: watchdog.runId });
    const run = await start(passReportWorkflow, [invocation]);
    await bindAttemptRunIds(invocation, { workflowRunId: run.runId });
    return { workflowRunId: run.runId, watchdogRunId: watchdog.runId };
  } catch (error) {
    await markEnqueueFailure(invocation, error);
    throw error;
  }
}
