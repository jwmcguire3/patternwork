export const ABANDONED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
export const COMPLETED_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export interface RetentionCandidate {
  readonly id: string;
  readonly status: string;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface RetentionPlan {
  readonly abandonedSessionIds: readonly string[];
  readonly completedSessionIds: readonly string[];
}

export function abandonedRetentionExpiresAt(from: Date): Date {
  return new Date(from.getTime() + ABANDONED_RETENTION_MS);
}

export function completedRetentionExpiresAt(from: Date): Date {
  return new Date(from.getTime() + COMPLETED_RETENTION_MS);
}

export function planExpiredAssessmentDeletion(candidates: readonly RetentionCandidate[], now = new Date()): RetentionPlan {
  const abandonedCutoff = now.getTime() - ABANDONED_RETENTION_MS;
  const completedCutoff = now.getTime() - COMPLETED_RETENTION_MS;
  const abandonedSessionIds: string[] = [];
  const completedSessionIds: string[] = [];
  for (const candidate of candidates) {
    if (["IN_PROGRESS", "PASS1_COMPLETE", "PASS2_IN_PROGRESS", "PAUSED", "ABANDONED"].includes(candidate.status) && candidate.updatedAt.getTime() <= abandonedCutoff) {
      abandonedSessionIds.push(candidate.id);
    } else if (candidate.status === "COMPLETE" && candidate.completedAt && candidate.completedAt.getTime() <= completedCutoff) {
      completedSessionIds.push(candidate.id);
    }
  }
  return { abandonedSessionIds, completedSessionIds };
}
