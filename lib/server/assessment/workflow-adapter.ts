import { enqueuePassReportWorkflow } from "@/lib/server/reports/enqueue";

export interface WorkflowEnqueuer {
  (input: { assessmentSessionId: string; snapshotId: string; completedPass: 1 | 2 }): Promise<{ workflowRunId: string }>;
}

export const defaultWorkflowEnqueuer: WorkflowEnqueuer = enqueuePassReportWorkflow;
