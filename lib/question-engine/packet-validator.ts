import type { JsonObject, ValidationIssue, ValidationResult } from "./types.ts";
import { LAYER_SECTION_CODES, PATTERNWORK_INSTRUMENT_MANIFEST } from "./manifest.ts";
import { loadPatternworkSchemas } from "../report-contracts/schema-loader.ts";
import { validateAgainstSchema } from "../report-contracts/schema-validator.ts";
import type { ReportEvidencePacketV3_1 } from "../report-contracts/types.ts";

const REQUIRED_PROHIBITIONS = [
  "no_diagnosis",
  "no_trauma_or_developmental_origin_inference",
  "no_exile_identity_age_or_history_inference",
  "no_physiological_measurement_claim",
  "no_global_attachment_style_without_cross_context_evidence",
  "no_unattributed_quote",
  "no_raw_answer_list_inference",
  "no_unsupported_section_filler",
] as const;

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function objects(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object).filter((item): item is Record<string, unknown> => item !== undefined) : [];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function add(issues: ValidationIssue[], code: string, path: string, message: string): void {
  issues.push({ code, path, message });
}

export function validatePacketCrossObject(packet: ReportEvidencePacketV3_1): ValidationResult<ReportEvidencePacketV3_1> {
  const issues: ValidationIssue[] = [];
  if (!packet.packet_id.startsWith(`PKT-${packet.report_type}-`)) add(issues, "packet_type_identity", "$.packet_id", "Packet ID must encode the packet report type.");

  const relationshipContexts = objects(packet.relationship_contexts);
  const episodes = objects(packet.episode_evidence);
  const parts = objects(packet.part_profiles);
  const states = objects(packet.state_signatures);
  const attachments = objects(packet.attachment_patterns);
  const contradictions = objects(packet.contradictions);
  const windows = objects(packet.window_registry);
  const cells = objects(object(packet.coverage_matrix)?.cells);

  const referentIds = new Set(relationshipContexts.map((item) => item.referent_id).filter((item): item is string => typeof item === "string"));
  const episodeIds = new Set(episodes.map((item) => item.episode_id).filter((item): item is string => typeof item === "string"));
  const partIds = new Set(parts.map((item) => item.part_id).filter((item): item is string => typeof item === "string"));
  const stateIds = new Set(states.map((item) => item.state_id).filter((item): item is string => typeof item === "string"));
  const attachmentIds = new Set(attachments.map((item) => item.pattern_id).filter((item): item is string => typeof item === "string"));
  const contradictionIds = new Set(contradictions.map((item) => item.contradiction_id).filter((item): item is string => typeof item === "string"));
  const windowIds = new Set(windows.map((item) => item.window_id).filter((item): item is string => typeof item === "string"));
  const evidenceIds = new Set([...episodeIds, ...partIds, ...stateIds, ...attachmentIds]);

  const checkUnique = (values: Iterable<string>, path: string) => {
    const seen = new Set<string>();
    for (const value of values) {
      if (seen.has(value)) add(issues, "duplicate_id", path, `Duplicate ID ${value}.`);
      seen.add(value);
    }
  };
  checkUnique(relationshipContexts.map((item) => String(item.referent_id)), "$.relationship_contexts");
  checkUnique([...episodeIds, ...partIds, ...stateIds, ...attachmentIds, ...contradictionIds], "$.*_evidence");
  checkUnique(windows.map((item) => String(item.window_id)), "$.window_registry");

  episodes.forEach((episode, index) => {
    if (typeof episode.referent_id === "string" && !referentIds.has(episode.referent_id)) add(issues, "unresolved_referent", `$.episode_evidence[${index}].referent_id`, `Unknown referent ${episode.referent_id}.`);
    if (typeof episode.window_id === "string" && !windowIds.has(episode.window_id)) add(issues, "unresolved_window", `$.episode_evidence[${index}].window_id`, `Unknown window ${episode.window_id}.`);
  });

  parts.forEach((part, index) => {
    for (const episodeId of strings(part.supporting_episode_ids)) if (!episodeIds.has(episodeId)) add(issues, "unresolved_episode", `$.part_profiles[${index}].supporting_episode_ids`, `Unknown episode ${episodeId}.`);
    if (part.status === "confirmed_part") {
      const confirmation = object(part.identity_confirmation);
      if (confirmation?.status !== "confirmed" || strings(confirmation.source_response_ids).length === 0) add(issues, "identity_confirmation_floor", `$.part_profiles[${index}].identity_confirmation`, "Confirmed parts require explicit identity-confirmation provenance.");
    }
  });

  states.forEach((state, index) => {
    const supporting = strings(state.supporting_episode_ids);
    for (const episodeId of supporting) if (!episodeIds.has(episodeId)) add(issues, "unresolved_episode", `$.state_signatures[${index}].supporting_episode_ids`, `Unknown episode ${episodeId}.`);
    if ((state.status === "confirmed" || state.status === "confirmed_state_signature") && new Set(supporting).size < 2) add(issues, "state_replication_floor", `$.state_signatures[${index}].supporting_episode_ids`, "A confirmed state signature requires at least two independent episode IDs.");
  });

  attachments.forEach((attachment, index) => {
    const attachmentReferents = new Set([...strings(attachment.referent_ids), ...(typeof attachment.referent_id === "string" ? [attachment.referent_id] : [])]);
    for (const referentId of attachmentReferents) if (!referentIds.has(referentId)) add(issues, "unresolved_referent", `$.attachment_patterns[${index}]`, `Unknown referent ${referentId}.`);
    if (attachmentReferents.size === 0) add(issues, "attachment_referent_floor", `$.attachment_patterns[${index}]`, "Attachment patterns must remain referent-specific.");
  });

  contradictions.forEach((contradiction, index) => {
    const impact = contradiction.report_impact;
    if (!["omit_claim","cap_low","qualify","none"].includes(String(impact))) add(issues, "contradiction_impact", `$.contradictions[${index}].report_impact`, "Contradiction report impact is not a recognized typed value.");
    for (const evidenceId of [...strings(contradiction.evidence_a_ids), ...strings(contradiction.evidence_b_ids), ...strings(contradiction.source_evidence_ids)]) {
      if (!evidenceIds.has(evidenceId)) add(issues, "unresolved_evidence", `$.contradictions[${index}]`, `Unknown evidence ${evidenceId}.`);
    }
  });

  if (cells.length !== 35) add(issues, "coverage_count", "$.coverage_matrix.cells", `Expected exactly 35 coverage cells; found ${cells.length}.`);
  const expectedCodes = new Set<string>(LAYER_SECTION_CODES);
  const observedCodes = new Set<string>();
  cells.forEach((cell, index) => {
    const code = String(cell.section_code);
    if (observedCodes.has(code)) add(issues, "duplicate_section", `$.coverage_matrix.cells[${index}].section_code`, `Duplicate section ${code}.`);
    observedCodes.add(code);
    if (!expectedCodes.has(code)) add(issues, "unknown_section", `$.coverage_matrix.cells[${index}].section_code`, `Unknown section ${code}.`);
    if (cell.coverage_id !== `CV-${code}`) add(issues, "coverage_identity", `$.coverage_matrix.cells[${index}].coverage_id`, "Coverage ID must match section code.");
    const independent = strings(cell.independent_episode_ids);
    if (cell.independent_episode_count !== new Set(independent).size) add(issues, "independent_episode_count", `$.coverage_matrix.cells[${index}].independent_episode_count`, "Independent episode count must equal the number of unique independent episode IDs.");
    for (const episodeId of independent) if (!episodeIds.has(episodeId)) add(issues, "unresolved_episode", `$.coverage_matrix.cells[${index}].independent_episode_ids`, `Unknown episode ${episodeId}.`);
    for (const evidenceId of [...strings(cell.supporting_evidence_ids), ...strings(cell.applicability_evidence_ids)]) if (!evidenceIds.has(evidenceId)) add(issues, "unresolved_evidence", `$.coverage_matrix.cells[${index}]`, `Unknown evidence ${evidenceId}.`);
    for (const contradictionId of strings(cell.open_contradiction_ids)) if (!contradictionIds.has(contradictionId)) add(issues, "unresolved_contradiction", `$.coverage_matrix.cells[${index}].open_contradiction_ids`, `Unknown contradiction ${contradictionId}.`);
    if (cell.routing_state === "green" && !["medium","high"].includes(String(cell.confidence))) add(issues, "green_confidence", `$.coverage_matrix.cells[${index}]`, "Green coverage requires medium or high confidence.");
    if (cell.routing_state === "red" && cell.confidence !== "unsupported") add(issues, "red_confidence", `$.coverage_matrix.cells[${index}]`, "Red coverage requires unsupported confidence.");
    if (cell.applicability === "not_applicable") {
      if (typeof cell.not_applicable_reason !== "string" || cell.not_applicable_reason.length === 0 || strings(cell.applicability_evidence_ids).length === 0 || strings(cell.applicability_response_ids).length === 0) add(issues, "not_applicable_evidence", `$.coverage_matrix.cells[${index}]`, "Not-applicable coverage requires a direct reason plus evidence and response IDs; route absence is insufficient.");
    }
    for (const family of strings(cell.eligible_next_families)) if (!PATTERNWORK_INSTRUMENT_MANIFEST.interactionFamilies.some((entry) => entry.code === family)) add(issues, "unknown_family", `$.coverage_matrix.cells[${index}].eligible_next_families`, `Unknown interaction family ${family}.`);
  });
  for (const missing of expectedCodes.difference(observedCodes)) add(issues, "missing_section", "$.coverage_matrix.cells", `Missing section ${missing}.`);

  const completion = object(packet.assessment_completion);
  if (completion?.completion_mode === "pass1_complete" && (completion.last_completed_stage !== "S2" || completion.safe_resume_stage !== "S3")) add(issues, "pass1_boundary", "$.assessment_completion", "Normal Pass-1 completion must end at S2 with safe resume at S3.");
  for (const prohibition of REQUIRED_PROHIBITIONS) if (!packet.prohibitions.includes(prohibition)) add(issues, "required_prohibition", "$.prohibitions", `Missing required prohibition ${prohibition}.`);

  return issues.length === 0 ? { ok: true, value: packet, issues: [] } : { ok: false, issues };
}

export async function validateReportEvidencePacket(value: unknown, workspaceRoot = process.cwd()): Promise<ValidationResult<ReportEvidencePacketV3_1>> {
  const schemas = await loadPatternworkSchemas(workspaceRoot);
  const structural = validateAgainstSchema<ReportEvidencePacketV3_1>(value, schemas.registryFor(schemas.packet));
  if (!structural.ok) return structural;
  return validatePacketCrossObject(structural.value);
}
