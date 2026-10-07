export interface Pwre1AnswerGroup {
  readonly fieldLabel: string;
  readonly selections: readonly string[];
}

export interface Pwre1Response {
  readonly administrationSequence: number;
  readonly bankItem: {
    readonly title: string;
    readonly prompt: string;
  };
  readonly completion: {
    readonly state: "PARTIAL" | "COMPLETED" | "SKIPPED";
    readonly answeredAt: string | null;
    readonly skippedAt: string | null;
    readonly lastSavedAt: string;
  };
  readonly answerGroups: readonly Pwre1AnswerGroup[];
  readonly responseOrder: readonly string[];
  readonly privateNote: string | null;
}

export interface Pwre1Content {
  readonly snapshot: {
    readonly completedPass: 1 | 2;
    readonly completionMode: string;
    readonly completedAt: string;
    readonly frozenAt: string;
  };
  readonly responses: readonly Pwre1Response[];
}

export interface Pwre1Envelope {
  readonly schemaVersion: "PWRE-1";
  readonly contentSha256: string;
  readonly content: Pwre1Content;
}

export interface ResponseExportGrant {
  readonly sessionId: string;
  readonly snapshotId: string;
  readonly snapshotRevision: string;
  readonly expiresAt: Date;
}
