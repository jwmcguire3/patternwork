import type { ReportType } from "../../question-engine/types.ts";

/**
 * Serializable workflow selection policy. Keep this module free of server
 * storage, crypto, filesystem and provider dependencies: workflow functions
 * are sandboxed; only "use step" functions can execute Node.js code.
 */
export type DebugReportMode = "mapping" | "ifs" | "pv" | "att" | "deepening" | "all";
export const DEBUG_REPORT_MODES: readonly DebugReportMode[] = ["mapping", "ifs", "pv", "att", "deepening", "all"];
export const DEBUG_PROFILE_IDS: readonly string[] = [
  ...Array.from({ length: 9 }, (_, index) => `P${String(index + 1).padStart(2, "0")}`),
  ...Array.from({ length: 16 }, (_, index) => `C${String(index + 1).padStart(2, "0")}`),
];

export function selectDebugReports(mode: DebugReportMode): readonly ReportType[] {
  if (mode === "mapping") return ["MAP"];
  if (mode === "ifs") return ["IFS"];
  if (mode === "pv") return ["PV"];
  if (mode === "att") return ["ATT"];
  if (mode === "deepening") return ["IFS", "PV", "ATT"];
  return ["MAP", "IFS", "PV", "ATT", "SYNTHESIS"];
}
