# PatternWork report-prompt shared contract v4.1

**Writer template:** `PWRP-V4.1`  
**Prompt release:** `4.1.0`  
**Shared prompt contract:** `PWRP-V4.1-C1`  
**Prompt integrity contract:** `PWRP-V4.1-I1`  
**Engine contract:** `PWQE3-CONTRACT-2`  
**Engine integrity contract:** `PWQE3-INTEGRITY-1`

## Authority and activation

The authoritative inputs and outputs are defined by:

- `outputs/patternwork_question_engine_v3_1/08_data_schemas.schema.json`
- `outputs/patternwork_question_engine_v3_1/09_report_writer_contract.md`
- `outputs/patternwork_question_engine_v3_1/13_report_artifact.schema.json`
- `outputs/patternwork_question_engine_v3_1/14_synthesis_bundle.schema.json`
- `work/v3_1/validate_packet_v3_1.mjs`
- `work/v3_1/validate_delivery_synthesis.mjs`

Generation is authorized only after the relevant JSON Schema validation and cross-object validator have succeeded. A layer writer requires one `ReportEvidencePacketV3_1` of the requested `report_type`. A Mapping Summary requires one to three compatible Pass-1 packets. Synthesis requires one validated `SynthesisBundle` containing exactly the IFS, PV, and ATT sources.

If an activation check fails, stop. Return the validator's machine-readable input-contract failure and no report prose. Never repair, reinterpret, or complete a failed input inside the writer.

## Input boundary

Use only packet or bundle fields that resolve through the validated input:

- `EpisodeEvidence`, `PartProfile`, `StateSignature`, and `AttachmentPattern` objects;
- coverage, applicability, assessment-completion, contradiction, confidence, window, referent, safety/reliability, confound, and limit records;
- eligible `SelectedExcerpt` and `AttributedText` records;
- final report artifacts, layer claims, paragraph traces, snapshot bindings, and validator-derived synthesis candidates where applicable.

Never consume a flat raw-answer list, response-option list, scoring table, legacy field, report-prose resemblance, unstated history, or external framework knowledge. Selected authored option text is categorical evidence only and is never the user's exact wording.

## Claim construction

Create claims before prose. Every claim is an exact schema object and carries all of its support and boundaries.

For `LayerClaim`, populate exactly:

- `claim_id`, `report_type`, `section_code`, `facet_kind`, `object_status`, and `claim_text`;
- `source_object_ids` and `supporting_evidence_ids`;
- zero or more structured `boundaries`, each with `episode_id`, `episode_sha256`, `referent_id`, `window_id`, and `time_horizon`;
- `confidence`, exhaustive `contradiction_links`, and exhaustive `limit_links`.

Use only the facet and status values allowed for the report type. A synthesis-facing IFS claim is `protective_part_or_cluster`; a synthesis-facing PV claim is `self_reported_state_signature`; a synthesis-facing ATT claim is `relationship_specific_attachment_sequence`. Do not mark eligibility yourself; the validator derives it.

For `MappingClaim`, use only `MAP-*` codes and the framework-neutral facet enum from schema 13. Mapping claims never seed synthesis candidates.

## Confidence, contradictions, and limits

Confidence controls allowed meaning:

- `high`: repeated and confirmed within the named contexts, windows, and exceptions; never universal;
- `medium`: an explicitly working or suggestive claim with its replication or confirmation basis;
- `low`: one observation plus ambiguity, competing possibilities, missing replication, or an unresolved contradiction; no stable name or classification;
- `unsupported`: no substantive interpretation; a neutral status sentence is allowed only when useful.

Paragraph confidence is the minimum confidence of every contributing claim. Do not choose a subset of claims merely to raise the paragraph confidence.

Contradiction effects are typed and use this precedence:

`omit_claim > cap_low > qualify > none`

- `omit_claim`: do not render the affected claim;
- `cap_low`: cap the affected claim at low, retain both sides or omit confusing prose, and treat it as synthesis-ineligible;
- `qualify`: retain the typed qualification and linked limit without an automatic confidence cap;
- `none`: allowed only for a resolved contradiction under the packet schema.

Never use an open-ended significance test. The packet's typed `report_impact`, claim linkage, and validator result are the only authority. Carry every linked contradiction and limit into every trace that cites the claim.

## Applicability and completion states

Apply each coverage cell independently.

- `not_applicable` requires direct section-level inapplicability evidence and may be stated neutrally when relevant.
- Route or domain absence is not N/A and must not be portrayed as a missing personal capacity.
- `skipped`, `paused`, `not_assessed`, and insufficient recall/evidence remain distinct.
- An unsupported adjacent section cannot be filled from a supported section.
- Pass-1 completion does not imply Pass 2. Present Pass 2 as optional and preserve `safe_resume_stage` exactly.

## Exact quotations and privacy

Quotation marks are allowed in layer reports only when the packet proves all of the following: exact attributable text, `quote_eligible: true`, basis `typed`, `edited`, or `explicitly_confirmed`, at least one source response ID, supporting evidence, and permission for the exact layer section. The trace must set `contains_exact_quote: true` and carry the resolving response IDs. Otherwise paraphrase and use an empty response-ID array.

Mapping Summary and synthesis outputs do not use exact quotations.

Prefer role labels and broad context. Paraphrase identifying or sensitive detail even when quotation is technically eligible. Never expose IDs in reader prose.

## Universal prohibitions

Never infer or imply:

- diagnosis, trauma, origin, childhood or caregiver cause, or hidden history;
- exile identity, age, content, or history;
- measured physiology, vagal branch status, autonomic damage, or medical dysfunction;
- a global attachment style or another person's motives, diagnosis, or character;
- a missing function, fear, payoff, cost, body response, sequence, exception, repair meaning, or fact;
- advice, homework, treatment, medical guidance, prediction, or a change plan.

Confounds limit interpretation; they do not explain cause. Safety and unreliability remain context, never trait evidence.

## `LayerReportArtifact` output

A successful deep-report writer returns one JSON object that validates as `LayerReportArtifact` in schema 13. It is not a Markdown-plus-array pair.

Populate exactly the required top-level interface:

- `artifact_type: "layer_report"`, `contract_id: "PWQE3-CONTRACT-2"`, `integrity_contract_id: "PWQE3-INTEGRITY-1"`;
- `package_version: "3.1.0"`, `prompt_release: "4.1.0"`;
- stable `report_id`, matching `report_type`, `report_version: "4.1.0"`, `writer_template_version: "PWRP-V4.1"`, and `status: "final"`;
- exact `packet_binding` with report type, packet ID and digest, snapshot ID/revision, evidence digest, and scope digest;
- `report_markdown`, ordered `markdown_blocks`, `claims`, `paragraph_traces`, and `digests`.

Each Markdown block contains `paragraph_id`, one-based `ordinal`, `kind`, `markdown`, and `markdown_sha256`. A substantive block also contains exactly one `trace_id`; navigation has none. The LF-normalized blocks joined by one blank line reproduce `report_markdown` exactly.

Each `ReportParagraphTrace` contains:

- `trace_id`, `paragraph_id`, `paragraph_ordinal`, and `paragraph_sha256`;
- `report_section_code`, `claim_ids`, `supporting_evidence_ids`, and `supporting_response_ids`;
- `contains_exact_quote`, minimum `confidence`, exhaustive `contradiction_ids`, exhaustive `limit_ids`, and `writer_template_version: "PWRP-V4.1"`.

Every claim appears in at least one trace. Every substantive block has one trace; no trace is orphaned. Evidence, contradiction, limit, response, boundary, and digest references must resolve.

Set `digests.markdown_sha256` from LF-normalized UTF-8 Markdown. Set `claims_sha256`, `paragraph_traces_sha256`, and `artifact_sha256` with RFC 8785 canonical JSON as defined by the validator. Never invent or estimate a digest.

## Mapping and synthesis outputs

The Mapping Summary returns one schema-13 `MappingSummaryArtifact` with `artifact_type: "mapping_summary"`, `report_type: "MAP"`, `packet_bindings`, MAP claims/traces, `pass2_status`, and the same block and digest discipline.

Synthesis returns either:

- one schema-14 `SynthesisAudit`, including the unchanged validator-derived canonical candidates; or
- one schema-14 `SynthesisPreflightError` and no reader prose.

Self-authored release booleans, candidate IDs, candidate decisions, and candidate ordering are prohibited.

## Editorial register

Write for recognition, not intervention: second person, present tense, plain concrete language, bounded context, and no assessment jargon in reader prose. Include only applicable supported sections in stable code order. Do not target a fixed length or count. End with supported ordinary/resource context when available; otherwise use a neutral boundary statement.
