# PatternWork Mapping Summary prompt v4.1

**Writer template:** `PWRP-V4.1`  
**Prompt release:** `4.1.0`  
**Shared prompt contract:** `PWRP-V4.1-C1`  
**Engine contract:** `PWQE3-CONTRACT-2`  
**Integrity contract:** `PWQE3-INTEGRITY-1`

## Task

Create the normal Pass-1 product: one framework-neutral, final `MappingSummaryArtifact` under schema 13. Make supported episodes, observed signals, sequences, variations, resources, uncertainty, and next choices easier to recognize without introducing IFS, polyvagal, or attachment interpretations. Pass 2 is optional.

Follow `prompt_v4_1_shared_contract.md`, `08_data_schemas.schema.json`, `09_report_writer_contract.md`, and `13_report_artifact.schema.json` exactly.

## Activation gate

Accept one to three `ReportEvidencePacketV3_1` views only when all of the following are true:

1. Every packet passes the v3.1 JSON Schema and `validate_packet_v3_1.mjs` cross-object validation.
2. Every packet uses `PWQE3-CONTRACT-2`, `PWQE3-INTEGRITY-1`, and packet version `3.1.0`.
3. Every packet has `assessment_completion.completion_mode: "pass1_complete"`, `last_completed_stage: "S2"`, and `safe_resume_stage: "S3"`.
4. The packet set has unique report types and an exact shared snapshot ID/revision, evidence digest, scope digest, and window registry.
5. All evidence, episode, response, contradiction, coverage, referent, and window IDs used by the summary resolve.
6. Typed contradiction effects, coverage applicability, skipped/paused state, route absence, and limits are internally consistent.

If any check fails, stop and return only the validator's machine-readable input-contract failure. Do not create a `MappingSummaryArtifact` or summary prose.

## Framework-neutral boundary

Use only direct or confirmed facts already present in validated evidence objects. Never name parts, protectors, managers, firefighters, state classifications, vagal states, attachment dimensions/styles, or hidden architecture. Do not combine framework fields to create a new interpretation.

Never use a flat raw-answer list, response-option wording, scoring table, legacy field, unstated history, or population-level theory. Do not infer diagnosis, trauma, origin, childhood/caregiver cause, physiology, another person's motive, or a missing fact.

Mapping Summary uses no exact quotation marks. Faithfully paraphrase supported content, keep provenance in the artifact, and leave `supporting_response_ids` empty.

## Mapping claims

Create all `MappingClaim` objects before Markdown. Populate exactly `claim_id`, `section_code`, `facet_kind`, `claim_text`, `source_object_ids`, `supporting_evidence_ids`, structured `boundaries`, `confidence`, exhaustive `contradiction_links`, and exhaustive `limit_links`.

Use only these code/facet pairs:

| Code | Facet and purpose |
|---|---|
| `MAP-01` | `scope` — Pass-1 completion, administered scope, windows, available/absent routes, and limits. |
| `MAP-02` | `episode_context` — supported episodes, referents/domains, safety/reliability context, and horizons. |
| `MAP-03` | `body_action_observation` — directly observed self-reported body, attention, speech, movement, social, and action signals without classification. |
| `MAP-04` | `sequence` — supported order across cue, first noticed change, impulse/action, response, and residue/recovery without framework labels. |
| `MAP-05` | `variation_exception` — supported differences by person, context, window, horizon, intensity, and bounded exceptions. |
| `MAP-06` | `resource_support` — reported conditions or actions associated with more range, connection, clarity, or easing; no advice. |
| `MAP-07` | `uncertainty_limit` — corrections, `qualify`, `cap_low`, omitted claims, confounds, unsupported areas, and retained uncertainty. |
| `MAP-08` | `remaining_question` — directly supported open areas plus an optional Pass-2 and safe-resume note. |

Paragraph confidence is the minimum of every contributing claim. Apply contradiction precedence `omit_claim > cap_low > qualify > none`. Omitted claims do not appear in prose; capped claims remain low observations with ambiguity.

## Applicability and route handling

Apply every coverage cell independently.

- Use N/A only for a direct section-level `not_applicable` decision and preserve its reason when relevant.
- Missing optional domains, absent routes, or lack of a comparison referent are route facts, not evidence that a personal capacity is absent.
- `skipped`, `paused`, `not_assessed`, insufficient recall, insufficient evidence, and N/A remain separate.
- Do not turn Pass-1 completion into implied deep-report completion.
- Set `pass2_status` from actual state. Default to `not_requested` unless the user explicitly requested or began Pass 2.
- Present Pass 2 as an optional way to explore supported open areas. Do not promise findings, estimate duration, state a remaining question count, or pressure continuation.
- Preserve `safe_resume_stage: "S3"` for a normal Pass-1 completion.

## Reader-facing plan

Use supported `MAP-01` through `MAP-08` in stable order. Natural headings may omit codes. Begin with a concrete supported observation when one exists, then establish scope. Prefer episodes and sequences to abstractions. Keep different contexts different. End with supported resource context, or with a neutral boundary and optional Pass-2 choice.

Do not fill unsupported sections, force a fixed number of episodes, create balance across domains, or end on peak activation. Give no practices, homework, treatment, medical guidance, prediction, or change plan.

## Required output

Return exactly one JSON object validating as `MappingSummaryArtifact` in `13_report_artifact.schema.json`:

- `artifact_type: "mapping_summary"`, `contract_id: "PWQE3-CONTRACT-2"`, `integrity_contract_id: "PWQE3-INTEGRITY-1"`, `package_version: "3.1.0"`, and `prompt_release: "4.1.0"`;
- stable `report_id`, `report_type: "MAP"`, `report_version: "4.1.0"`, `writer_template_version: "PWRP-V4.1"`, and `status: "final"`;
- exact `packet_bindings` for all input packets;
- `report_markdown`, ordered `markdown_blocks`, `claims`, exact `paragraph_traces`, `pass2_status`, optional schema-valid `safe_resume_stage`, and `digests`.

Every substantive block has exactly one trace. Every Mapping claim is traced. Each trace uses a `MAP-*` code and contains `trace_id`, `paragraph_id`, `paragraph_ordinal`, `paragraph_sha256`, `report_section_code`, `claim_ids`, `supporting_evidence_ids`, empty `supporting_response_ids`, `contains_exact_quote: false`, minimum `confidence`, exhaustive `contradiction_ids`, exhaustive `limit_ids`, and `writer_template_version: "PWRP-V4.1"`.

Compute LF-normalized Markdown and RFC 8785 JSON SHA-256 values with `validate_delivery_synthesis.mjs`. Release only after `validateMappingSummaryArtifact(artifact, packets)` succeeds.
