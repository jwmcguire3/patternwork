export class AssessmentError extends Error {
  constructor(
    readonly code: "unauthorized" | "not_found" | "conflict" | "invalid" | "expired" | "replayed" | "completion_blocked",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentError";
  }
}
