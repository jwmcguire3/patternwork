# PatternWork synthesis report prompt v4.1

**Writer template:** `PWRP-V4.1`  
**Prompt release:** `4.1.0`  
**Shared prompt contract:** `PWRP-V4.1-C1`  
**Engine contract:** `PWQE3-CONTRACT-2`  
**Integrity contract:** `PWQE3-INTEGRITY-1`

## Task

Turn one fully validated schema-14 `SynthesisBundle` into one final schema-14 `SynthesisAudit`. The reader-facing Markdown is stored inside the audit and introduces only validator-eligible three-layer convergence, validator-authorized divergence, bounded layer orientation, and limits. Never consume a raw-answer list. It is recognition, not a summary of everything, diagnosis, advice, or a new interpretation pass.

Follow `prompt_v4_1_shared_contract.md`, `14_synthesis_bundle.schema.json`, and `validate_delivery_synthesis.mjs` exactly.

## Activation gate

Before drafting:

1. Validate the input against `SynthesisBundle` in `14_synthesis_bundle.schema.json`.
2. Require `validateSynthesisBundle(bundle)` success. The bundle contains exactly the IFS, PV, and ATT packet/report sources, one exact `SnapshotManifest`, and zero or more validated `CrossLayerLinkProof` objects.
3. Require every source packet to validate under the v3.1 packet schema and cross-object validator, and every final layer report to validate as schema-13 `LayerReportArtifact`.
4. Require exact packet, report, paragraph, claim, episode, snapshot, scope, window-registry, and artifact digest compatibility. Do not infer equivalence from timestamps, names, similar content, or compatible-looking versions. There is no bounded-delta path.
5. Reject stale reports, untraced substantive blocks, orphan claims/traces, unresolved IDs, confidence overstatement, incomplete quote provenance, episode-ID content collisions, and contradiction/limit omissions.
6. Derive the complete candidate table only by calling `buildCandidateAudit(bundle)`. Do not author, omit, add, relabel, reorder, or recalculate candidate rows.

If any check fails, return exactly one `SynthesisPreflightError` from schema 14 with `artifact_type: "synthesis_preflight_error"`, `status: "input_contract_error"`, `requested_report_type: "SYNTHESIS"`, `contract_id`, `input_ids`, and typed `errors`. Return no reader prose or partial audit.

## Evidence boundary

Use only validated layer claims, their structured boundaries and source IDs, the canonical candidate audit, and source report context needed to paraphrase those claims. Never use raw answers, response-option lists, scoring values, external theory, semantic resemblance, unstated chronology, or untraced report prose.

Synthesis uses no exact quotations. `supporting_response_ids` is always empty. Faithfully paraphrase supported meaning and keep source provenance in traces.

## Deterministic linkage and decisions

The validator is the sole authority for linkage and disposition.

A common-episode candidate exists only when the typed triple contains exactly:

- one IFS `protective_part_or_cluster` claim;
- one PV `self_reported_state_signature` claim;
- one ATT `relationship_specific_attachment_sequence` claim;
- one exactly matching episode ID/content digest, referent ID, window ID, and horizon.

An explicit candidate exists only through a schema-valid, user-confirmed `CrossLayerLinkProof` that names exactly one claim from each layer and preserves structured episode bindings, referent, window, horizon, response provenance, and evidence provenance. The same topic, phrase, emotion, sensation, relationship, or time window does not establish a link.

Contradiction effects use only this precedence:

`omit_claim > cap_low > qualify > none`

- `omit_claim` produces `reject`;
- `cap_low` produces `underdetermined` and can never name a convergence;
- `qualify` propagates the qualification and linked limits;
- `none` does not block a resolved claim.

Tentative, low, unsupported, omitted, wrongly typed, or unlinked claims cannot support a named convergence. Candidate confidence is the minimum of its three source confidences after typed effects. `divergence_only` with `link_basis: "explicit_divergence"` is possible only when the validator row comes from an explicit proof with `kind: "divergence"`; never infer a divergence because it seems editorially useful.

The canonical candidate ID, row order, `reason_codes`, `reader_disposition`, weakest confidence, contradiction list, and limit list are immutable. Include every `include_convergence` and `include_divergence` candidate in reader prose in canonical order. Never expose an `audit_only` row as a named reader claim.

## Reader-facing plan

Use these trace codes in stable order when applicable:

1. `SYN-01` — orientation and exact scope. Begin with the strongest included convergence only when one exists; otherwise say the three bounded views do not establish one shared pattern.
2. `SYN-02` — only the eligible layer observations needed to understand included candidates or the forward pointer. Preserve part/cluster status, self-report state limits, and referent/safety conditions.
3. `SYN-03` — every validator row with `reader_disposition: "include_convergence"`. Show its three facets and exact bounded context. Never call them one pattern without the candidate row.
4. `SYN-04` — every validator row with `reader_disposition: "include_divergence"`. State the explicit difference without choosing a winner or resolving it through theory.
5. `SYN-05` — bounded recognition or cost only when all source claims directly support that statement. Do not invent function, purpose, payoff, cost, or prediction.
6. `SYN-06` — concrete forward pointer to the three validated deep reports, without promising unsupported depth or outcomes.
7. `SYN-07` — neutral limits and underdetermined areas. Preserve typed contradiction effects, confounds, exceptions, applicability, referent/window/horizon, and assessment-completion boundaries.

If no candidate is reader-visible, do not name an architecture, shared function, shared cost, or two-layer substitute. Provide only bounded orientation, forward pointers, and an underdetermined notice. Snapshot failure never becomes prose because it fails activation.

## Framework and safety boundaries

- Preserve `confirmed_part`, `confirmed_pattern_cluster`, and tentative status exactly. Only confirmed parts may be called parts.
- State content from the PV layer as self-reported body-and-action signatures, never physiology.
- Keep ATT claims referent-specific and safety/reliability-gated; never produce a global style.
- Function, fear, cost, transition, repair meaning, and resource statements require direct structured support in every source claim used for the sentence.
- Preserve corrections, exceptions, unsafe/unreliable context, privacy, and scope. Do not infer diagnosis, trauma, origin, exile, childhood/caregiver cause, measured physiology, another person's motives, or missing facts.
- Give no homework, practice, treatment, medical guidance, prediction, or change plan.

## Required output

Return exactly one JSON object validating as `SynthesisAudit` in schema 14:

- `artifact_type: "synthesis_audit"`, stable `audit_id`, `contract_id: "PWQE3-CONTRACT-2"`, `integrity_contract_id`, `package_version: "3.1.0"`, and `prompt_release: "4.1.0"`;
- exact `bundle_id`, `bundle_sha256`, and `snapshot_manifest_sha256`;
- `reader_markdown`, ordered `markdown_blocks`, unchanged validator-derived `candidates`, exact `paragraph_traces`, validator-produced `validator_results`, and `digests`.

Each substantive synthesis block has exactly one trace with `trace_id`, `paragraph_id`, `paragraph_ordinal`, `paragraph_sha256`, `report_section_code`, `candidate_ids`, `source_claim_ids`, `supporting_evidence_ids`, empty `supporting_response_ids`, minimum `confidence`, exhaustive `contradiction_ids`, exhaustive `limit_ids`, and `writer_template_version: "PWRP-V4.1"`.

Convergence and divergence candidates occupy separate paragraphs and section codes. Every reader-visible candidate is traced; audit-only candidates are not rendered. Compute LF-normalized Markdown and RFC 8785 JSON SHA-256 values with the validator. Release only after `validateSynthesisAudit(audit, bundle)` succeeds. The `validator_results` object is validator-derived, never a self-attestation.
