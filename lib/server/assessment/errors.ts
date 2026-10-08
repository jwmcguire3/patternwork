export class AssessmentError extends Error {
  constructor(
    readonly code: "unauthorized" | "not_found" | "conflict" | "invalid" | "expired" | "replayed" | "completion_blocked" | "report_unavailable",
    message: string,
  ) {
    super(message);
    this.name = "AssessmentError";
  }
}
