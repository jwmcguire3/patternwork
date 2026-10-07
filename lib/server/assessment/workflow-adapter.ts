import { enqueuePassReportWorkflow } from "@/lib/server/reports/enqueue";

export interface WorkflowEnqueuer {
  (input: { assessmentSessionId: string; snapshotId: string; completedPass: 1 | 2; attemptId?: string; attemptNumber?: number; invocationKey?: string }): Promise<{ workflowRunId: string; watchdogRunId: string }>;
}

export const defaultWorkflowEnqueuer: WorkflowEnqueuer = enqueuePassReportWorkflow;
