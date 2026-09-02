import { start } from "workflow/api";
import { sha256Canonical } from "../../report-contracts/delivery-validator.ts";
import { passReportWorkflow } from "../../../workflows/pass-report.ts";
import type { PassReportWorkflowInput } from "./types.ts";

export interface EnqueuePassReportWorkflowInput {
  readonly assessmentSessionId: string;
  readonly snapshotId: string;
  readonly completedPass: 1 | 2;
}

export function buildReportWorkflowInvocation(input: EnqueuePassReportWorkflowInput): PassReportWorkflowInput {
  if (!input.assessmentSessionId.trim() || !input.snapshotId.trim()) throw new TypeError("assessmentSessionId and snapshotId are required.");
  if (input.completedPass !== 1 && input.completedPass !== 2) throw new TypeError("completedPass must be 1 or 2.");
  const digest = sha256Canonical({
    assessmentSessionId: input.assessmentSessionId,
    snapshotId: input.snapshotId,
    completedPass: input.completedPass,
    contract: "PWQE3-CONTRACT-2",
    promptRelease: "4.1.0",
  });
  return { ...input, invocationKey: `pw31-report-${digest}` };
}

export async function enqueuePassReportWorkflow(
  input: EnqueuePassReportWorkflowInput,
): Promise<{ workflowRunId: string }> {
  const invocation = buildReportWorkflowInvocation(input);
  const run = await start(passReportWorkflow, [invocation]);
  return { workflowRunId: run.runId };
}
