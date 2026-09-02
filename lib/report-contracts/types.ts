import type {
  Confidence,
  ContradictionImpact,
  JsonObject,
  JsonValue,
  LayerReportType,
  LayerSectionCode,
  MappingSectionCode,
  SynthesisSectionCode,
} from "../question-engine/types.ts";

export type ReportEvidencePacketV3_1 = JsonObject & {
  packet_id: string;
  packet_version: "3.1.0";
  contract_id: "PWQE3-CONTRACT-2";
  integrity_contract_id: "PWQE3-INTEGRITY-1";
  report_type: LayerReportType;
  generated_at: string;
  relationship_contexts: JsonObject[];
  episode_evidence: JsonObject[];
  part_profiles: JsonObject[];
  state_signatures: JsonObject[];
  attachment_patterns: JsonObject[];
  contradictions: JsonObject[];
  coverage_matrix: JsonObject;
  selected_excerpts: JsonObject[];
  prohibitions: JsonValue[];
  snapshot_binding: JsonObject;
  window_registry: JsonObject[];
  assessment_completion: JsonObject;
};

export interface PacketBinding {
  report_type: LayerReportType;
  packet_id: string;
  packet_sha256: string;
  snapshot_id: string;
  snapshot_revision: string;
  evidence_sha256: string;
  scope_sha256: string;
}

export interface ContradictionLink {
  contradiction_id: string;
  status: string;
  effect: ContradictionImpact;
  source_evidence_ids: string[];
}

export interface LimitLink {
  limit_id: string;
  kind: string;
  statement: string;
  source_ids: string[];
}

export interface EvidenceBoundary {
  episode_id: string;
  episode_sha256: string;
  referent_id: string;
  window_id: string;
  time_horizon: "anticipatory" | "immediate" | "aftermath" | "multi_horizon" | "uncertain";
}

export interface LayerClaim {
  claim_id: string;
  report_type: LayerReportType;
  section_code: LayerSectionCode;
  facet_kind: string;
  object_status: string;
  claim_text: string;
  source_object_ids: string[];
  supporting_evidence_ids: string[];
  boundaries: EvidenceBoundary[];
  confidence: Confidence;
  contradiction_links: ContradictionLink[];
  limit_links: LimitLink[];
}

export interface MappingClaim extends Omit<LayerClaim, "report_type" | "section_code" | "object_status"> {
  section_code: MappingSectionCode;
}

export interface MarkdownBlock {
  paragraph_id: string;
  ordinal: number;
  kind: string;
  markdown: string;
  markdown_sha256: string;
  trace_id?: string;
}

export interface ReportParagraphTrace {
  trace_id: string;
  paragraph_id: string;
  paragraph_ordinal: number;
  paragraph_sha256: string;
  report_section_code: LayerSectionCode | MappingSectionCode;
  claim_ids: string[];
  supporting_evidence_ids: string[];
  supporting_response_ids: string[];
  contains_exact_quote: boolean;
  confidence: Confidence;
  contradiction_ids: string[];
  limit_ids: string[];
  writer_template_version: "PWRP-V4.1";
}

export type LayerReportArtifact = JsonObject & {
  artifact_type: "layer_report";
  contract_id: "PWQE3-CONTRACT-2";
  integrity_contract_id: "PWQE3-INTEGRITY-1";
  package_version: "3.1.0";
  prompt_release: "4.1.0";
  report_id: string;
  report_type: LayerReportType;
  report_version: "4.1.0";
  writer_template_version: "PWRP-V4.1";
  status: "final";
  packet_binding: PacketBinding & JsonObject;
  report_markdown: string;
  markdown_blocks: (MarkdownBlock & JsonObject)[];
  claims: (LayerClaim & JsonObject)[];
  paragraph_traces: (ReportParagraphTrace & JsonObject)[];
  digests: JsonObject;
};

export type MappingSummaryArtifact = JsonObject & {
  artifact_type: "mapping_summary";
  contract_id: "PWQE3-CONTRACT-2";
  integrity_contract_id: "PWQE3-INTEGRITY-1";
  package_version: "3.1.0";
  prompt_release: "4.1.0";
  report_id: string;
  report_type: "MAP";
  report_version: "4.1.0";
  writer_template_version: "PWRP-V4.1";
  status: "final";
  packet_bindings: (PacketBinding & JsonObject)[];
  report_markdown: string;
  markdown_blocks: (MarkdownBlock & JsonObject)[];
  claims: (MappingClaim & JsonObject)[];
  paragraph_traces: (ReportParagraphTrace & JsonObject)[];
  pass2_status: string;
  digests: JsonObject;
};

export type ReportArtifact = LayerReportArtifact | MappingSummaryArtifact;

export type SynthesisBundle = JsonObject & {
  artifact_type: "synthesis_bundle";
  bundle_id: string;
  contract_id: "PWQE3-CONTRACT-2";
  integrity_contract_id: "PWQE3-INTEGRITY-1";
  package_version: "3.1.0";
  prompt_release: "4.1.0";
  snapshot_manifest: JsonObject;
  sources: JsonObject & { ifs: JsonObject; pv: JsonObject; attachment: JsonObject };
  cross_layer_link_proofs: JsonObject[];
  bundle_sha256: string;
};

export type SynthesisAudit = JsonObject & {
  artifact_type: "synthesis_audit";
  audit_id: string;
  contract_id: "PWQE3-CONTRACT-2";
  integrity_contract_id: "PWQE3-INTEGRITY-1";
  package_version: "3.1.0";
  prompt_release: "4.1.0";
  bundle_id: string;
  reader_markdown: string;
  markdown_blocks: JsonObject[];
  candidates: JsonObject[];
  paragraph_traces: JsonObject[];
  validator_results: JsonObject;
  digests: JsonObject;
};

export type SynthesisPreflightError = JsonObject & {
  artifact_type: "synthesis_preflight_error";
  status: "input_contract_error";
  requested_report_type: "SYNTHESIS";
  contract_id: "PWQE3-CONTRACT-2";
  input_ids: string[];
  errors: JsonObject[];
};

export type SynthesisArtifact = SynthesisBundle | SynthesisAudit | SynthesisPreflightError;
export type AnyReportSectionCode = LayerSectionCode | MappingSectionCode | SynthesisSectionCode;
