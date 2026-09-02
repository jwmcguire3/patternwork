import { readFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { loadPatternworkSchemas } from "../../report-contracts/schema-loader.ts";

const PROMPT_DIRECTORY = "specs/patternwork/report-prompts-v4.1";
const WRITER_CONTRACT = "specs/patternwork/question-engine-v3.1/09_report_writer_contract.md";
const PROMPT_FILES: Readonly<Record<ReportType, string>> = {
  MAP: "patternwork_mapping_summary_prompt_v4_1.md",
  IFS: "patternwork_ifs_report_prompt_v4_1.md",
  PV: "patternwork_polyvagal_report_prompt_v4_1.md",
  ATT: "patternwork_attachment_report_prompt_v4_1.md",
  SYNTHESIS: "patternwork_synthesis_report_prompt_v4_1.md",
};

function objectSchemaForReport(root: JsonObject, reportType: ReportType): JsonObject {
  const definition = reportType === "MAP"
    ? "MappingSummaryArtifact"
    : reportType === "SYNTHESIS"
      ? "SynthesisAudit"
      : "LayerReportArtifact";
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $ref: `#/$defs/${definition}`,
    $defs: root.$defs,
  } as JsonObject;
}

export interface LoadedReportPrompt {
  readonly system: string;
  readonly schema: JsonObject;
  readonly schemaName: string;
}

export async function loadReportPrompt(reportType: ReportType, workspaceRoot = process.cwd()): Promise<LoadedReportPrompt> {
  const [shared, specific, writer, schemas] = await Promise.all([
    readFile(path.join(workspaceRoot, PROMPT_DIRECTORY, "prompt_v4_1_shared_contract.md"), "utf8"),
    readFile(path.join(workspaceRoot, PROMPT_DIRECTORY, PROMPT_FILES[reportType]), "utf8"),
    readFile(path.join(workspaceRoot, WRITER_CONTRACT), "utf8"),
    loadPatternworkSchemas(workspaceRoot),
  ]);
  const root = (reportType === "SYNTHESIS" ? schemas.synthesis : schemas.reportArtifact) as JsonObject;
  return {
    system: [
      "You are the Patternwork v3.1 canonical report writer. Return only the requested JSON object.",
      shared,
      specific,
      writer,
    ].join("\n\n"),
    schema: objectSchemaForReport(root, reportType),
    schemaName: `patternwork_${reportType.toLowerCase()}_v4_1`,
  };
}

export function buildGenerationPrompt(reportType: ReportType, input: JsonObject): string {
  return [
    `Requested report type: ${reportType}`,
    "The following object is the complete validated, pseudonymous input contract. It contains no email, direct contact data, or flat raw-answer list.",
    JSON.stringify(input),
  ].join("\n\n");
}

export function buildRepairPrompt(
  reportType: ReportType,
  input: JsonObject,
  issues: readonly ValidationIssue[],
  previousOutput?: JsonObject,
): string {
  const feedback = issues.slice(0, 50).map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));
  return [
    buildGenerationPrompt(reportType, input),
    "The prior output was rejected. Return a complete replacement object, not a patch, and correct every validator issue below.",
    JSON.stringify({ validator_feedback: feedback, rejected_output: previousOutput ?? null }),
  ].join("\n\n");
}
