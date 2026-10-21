import { stageSystem } from "./pwrp71-formulation-integration.ts";
import { assertProviderPayloadPrivacy } from "../openrouter/privacy-boundary.ts";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { JsonObject, ReportType, ValidationIssue } from "../../question-engine/types.ts";
import { loadPatternworkSchemas } from "../../report-contracts/schema-loader.ts";
import { loadPwqe5SourcePackage, type Pwqe5SourcePackage } from "./pwqe6-source.ts";
import { loadPwrp71SourcePackage, type Pwrp71SourcePackage } from "./pwrp71-source.ts";

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

const LEGACY_PRIVATE_INPUT_KEYS = new Set(["narrative", "privateNote", "private_note", "freeText", "free_text", "raw_answers", "answers", "all_responses"]);

function assertNoLegacyFreeText(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoLegacyFreeText(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (LEGACY_PRIVATE_INPUT_KEYS.has(key)) throw new Error(`Provider prompt privacy boundary rejected free text at ${path}.${key}.`);
    assertNoLegacyFreeText(child, `${path}.${key}`);
  }
}

export async function loadPwrp71ReportPrompt(
  reportType: ReportType,
  workspaceRoot = process.cwd(),
): Promise<LoadedReportPrompt & { readonly source: Pwrp71SourcePackage }> {
  const source = await loadPwrp71SourcePackage(workspaceRoot);
  return {
    source,
    system: stageSystem(source, reportType, "formulation"),
    schema: source.schemas.reportFormulation as JsonObject,
    schemaName: `patternwork_${reportType.toLowerCase()}_pwrp_7_1_formulation`,
  };
}

export async function loadPwqe6ReportPrompt(reportType: ReportType, workspaceRoot = process.cwd()): Promise<LoadedReportPrompt & { readonly source: Pwqe5SourcePackage }> {
  const source = await loadPwqe5SourcePackage(workspaceRoot);
  const specificKey = reportType === "MAP" ? "mapping" : reportType === "IFS" ? "ifs" : reportType === "PV" ? "state" : reportType === "ATT" ? "attachment" : "synthesis";
  return {
    source,
    system: [
      "You are the Patternwork v6 report writer for a design candidate release. Return only the requested JSON object.",
      source.reportPrompts.shared,
      source.reportPrompts[specificKey],
    ].join("\n\n"),
    schema: source.schemas.reportDraft as JsonObject,
    schemaName: `patternwork_${reportType.toLowerCase()}_v6_design`,
  };
}

/** Final synchronous fail-closed check immediately before prompt serialization. */
export function assertProviderPromptPrivacy(input: unknown, path = "$", contractVersion: "legacy" | "v7.1" = "legacy"): void {
  assertProviderPayloadPrivacy(input, contractVersion, path);
  if (contractVersion === "legacy") assertNoLegacyFreeText(input, path);
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

export function buildGenerationPrompt(reportType: ReportType, input: JsonObject, contractVersion: "legacy" | "v7.1" = "legacy"): string {
  assertProviderPromptPrivacy(input, "$", contractVersion);
  return [
    `Requested report type: ${reportType}`,
    contractVersion === "v7.1"
      ? "The following object is the complete PWRP 7.1 source-bound evidence contract. It may contain opaque session or snapshot identifiers; respondent name fields are prohibited."
      : "The following object is the complete validated, pseudonymous input contract. It contains no email, direct contact data, or flat raw-answer list.",
    JSON.stringify(input),
  ].join("\n\n");
}

export function buildRepairPrompt(
  reportType: ReportType,
  input: JsonObject,
  issues: readonly ValidationIssue[],
  previousOutput?: JsonObject,
): string {
  assertProviderPromptPrivacy({ previousOutput: previousOutput ?? null, issues } as unknown as JsonObject);
  const feedback = issues.slice(0, 50).map((issue) => ({ code: issue.code, path: issue.path, message: issue.message }));
  return [
    buildGenerationPrompt(reportType, input),
    "The prior output was rejected. Return a complete replacement object, not a patch, and correct every validator issue below.",
    JSON.stringify({ validator_feedback: feedback, rejected_output: previousOutput ?? null }),
  ].join("\n\n");
}
