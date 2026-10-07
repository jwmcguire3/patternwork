import type { PatternworkV31NotificationType } from "@prisma/client";
import type { EmailTransport } from "../email/types.ts";

export type NotificationType = PatternworkV31NotificationType;

export interface CreateNotificationInput {
  readonly assessmentSessionId: string;
  readonly assessmentSnapshotId?: string;
  readonly reportWorkflowAttemptId?: string;
  readonly type: NotificationType;
  readonly idempotencyKey: string;
  readonly email: string;
  readonly actionUrl: string;
}

export interface NotificationDispatchBoundary {
  create(input: CreateNotificationInput): Promise<{ readonly id: string }>;
  dispatch(notificationId: string): Promise<void>;
}

export interface NotificationDependencies {
  readonly transport?: EmailTransport;
}
