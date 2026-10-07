import type { ClassifiedReportFailure, ReportFailureCategory } from "./types.ts";

const TRANSIENT_CODES = new Set(["network", "timeout", "rate_limited", "server_error", "workflow_enqueue_failed"]);
const VALIDATION_CODES = new Set(["input_contract_invalid", "artifact_validation_failed", "synthesis_bundle_invalid"]);

export function classifyReportFailure(code: string, message: string): ClassifiedReportFailure {
  const normalized = code.trim().slice(0, 120) || "report_workflow_failed";
  void message;
  const publicMessage = (category: ReportFailureCategory) => ({
    TRANSIENT: "Report preparation was interrupted and can be retried.",
    STALLED: "Report preparation stopped before completion and can be retried.",
    CONFIGURATION: "Report preparation is temporarily unavailable pending secure review.",
    VALIDATION: "Report inputs or outputs did not pass required validation.",
    COST: "Report preparation stopped at the configured cost boundary.",
    PDF: "The report PDF did not pass required verification.",
    DELIVERY: "The report is ready, but delivery requires attention.",
    INTERNAL: "Report preparation could not be completed and requires secure review.",
  })[category];
  if (normalized === "workflow_stalled") return { category: "STALLED", retryAudience: "USER", code: normalized, message: publicMessage("STALLED") };
  if (TRANSIENT_CODES.has(normalized)) return { category: "TRANSIENT", retryAudience: "USER", code: normalized, message: publicMessage("TRANSIENT") };
  if (normalized === "cost_cap_exceeded") return { category: "COST", retryAudience: "OPERATOR", code: normalized, message: publicMessage("COST") };
  if (normalized === "pdf_verification_failed") return { category: "PDF", retryAudience: "OPERATOR", code: normalized, message: publicMessage("PDF") };
  if (VALIDATION_CODES.has(normalized) || normalized.includes("contract") || normalized.includes("validation")) return { category: "VALIDATION", retryAudience: "OPERATOR", code: normalized, message: publicMessage("VALIDATION") };
  if (["client_error", "protocol", "configuration_error", "preflight_configuration_failed"].includes(normalized)) return { category: "CONFIGURATION", retryAudience: "OPERATOR", code: normalized, message: publicMessage("CONFIGURATION") };
  return { category: "INTERNAL", retryAudience: "OPERATOR", code: normalized, message: publicMessage("INTERNAL") };
}

export function failureFromUnknown(error: unknown): ClassifiedReportFailure {
  const message = error instanceof Error ? error.message : String(error);
  const separator = message.indexOf(":");
  const code = separator > 0 ? message.slice(0, separator) : "report_workflow_failed";
  return classifyReportFailure(code, separator > 0 ? message.slice(separator + 1) : message);
}
