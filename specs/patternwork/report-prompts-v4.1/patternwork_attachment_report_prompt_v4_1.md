# PatternWork attachment-informed report prompt v4.1

**Writer template:** `PWRP-V4.1`  
**Prompt release:** `4.1.0`  
**Shared prompt contract:** `PWRP-V4.1-C1`  
**Engine contract:** `PWQE3-CONTRACT-2`  
**Integrity contract:** `PWQE3-INTEGRITY-1`

## Task

Turn one validated `ReportEvidencePacketV3_1` with `report_type: "ATT"` into one final schema-13 `LayerReportArtifact`. Describe relationship-specific moves in their named safety, reliability, episode, window, and horizon. Never consume a raw-answer list. This is a self-report recognition document, not a global attachment-style assessment, diagnosis, origin story, or advice.

Follow `prompt_v4_1_shared_contract.md`, `08_data_schemas.schema.json`, `09_report_writer_contract.md`, and `13_report_artifact.schema.json` exactly.

## Activation gate

Before drafting:

1. Validate the packet against the v3.1 packet schema and require successful cross-object validation from `validate_packet_v3_1.mjs`.
2. Require `contract_id: "PWQE3-CONTRACT-2"`, `integrity_contract_id: "PWQE3-INTEGRITY-1"`, packet version `3.1.0`, an ATT packet ID/type match, valid `snapshot_binding`, structured `window_registry`, and `assessment_completion`.
3. Resolve every episode, attachment pattern, relationship context/referent, evidence, response, contradiction, coverage, and window ID.
4. Require exactly the 35 coverage cells and `ATT-01` through `ATT-12` with confidence/routing/applicability consistency.
5. Require safety/reliability context for every interpreted referent. Keep responses in coercive, threatening, unstable, mixed, or unreliable contexts proportionate and context-linked.
6. Require direct sequence evidence for each claimed cue, interpretation, body shift, impulse, overt move, other response, next move, residue, repair, reassurance, or closeness dimension.
7. Apply `omit_claim > cap_low > qualify > none` from typed contradiction records. Do not add a separate significance test.
8. Verify exact-quote provenance and target-section permission.

If any check fails, stop and return only the validator's machine-readable input-contract failure. Do not create a `LayerReportArtifact` or prose.

## ATT claim rules

Create all `LayerClaim` objects before Markdown.

- Use `facet_kind: "relationship_specific_attachment_sequence"` only for an evidence-supported attachment sequence that the validator may evaluate for synthesis. Use `object_status: "confirmed_attachment_pattern"` only when the packet permits it.
- Every attachment claim stays referent-specific, safety/reliability-gated, window-bound, and horizon-bound.
- Anxiety and avoidance are descriptive dimensions only. Never produce a categorical or global attachment style.
- Preserve the supported chain without filling gaps: cue → first interpretation → body shift → proximity/deactivation impulse → overt move → other response → next move → residue/repair.
- A user's first meaning about self or other is an attribution, not a fact about either person.
- Distinguish repair initiated by the user, repair offered by another, repair reception, reassurance request, reassurance content, actual uptake/latency, and residue. No observed offer is not rejection.
- Cross-relationship comparison requires evidence from at least two referents and must preserve differences, exceptions, and reliability conditions.
- Closeness preferences are dimension-specific. Do not assume touch, dependence, commitment, monogamy, cohabitation, disclosure, direct asking, contact pace, or emotional language is applicable or preferable.
- Low evidence reports only a bounded observation and ambiguity; it cannot name a pattern or assign anxiety/avoidance.
- `omit_claim` content is absent. `cap_low` remains low and synthesis-ineligible. `qualify` carries its linked qualification.

## Adaptive section plan

Render supported/applicable sections in this stable order. Do not fill a missing code.

| Code | Permission |
|---|---|
| `ATT-01` | Scope, completion, referents, windows, safety/reliability, applicability, and limits. |
| `ATT-02` | Concrete cue-to-response relational sequence with named referent and context. |
| `ATT-03` | First meanings about self or the relationship as reported attributions only. |
| `ATT-04` | First meanings about the other person as reported attributions only. |
| `ATT-05` | Supported anxiety/proximity dimension and actual moves without a style label. |
| `ATT-06` | Supported avoidance/deactivation dimension and actual moves without a style label. |
| `ATT-07` | Supported approach/withdraw, protest, distancing, freezing, or mixed sequence with order intact. |
| `ATT-08` | Repair initiation and reception kept direction-specific; absent offer remains unobserved. |
| `ATT-09` | Reassurance request/content, actual uptake, latency, body/social change, and residue kept separate. |
| `ATT-10` | Only directly applicable closeness, contact, disclosure, dependence, autonomy, touch, or commitment dimensions. |
| `ATT-11` | Supported similarities and differences across at least two referents, with conditions and exceptions. |
| `ATT-12` | Confidence, corrections, typed contradiction effects, applicability, safety/reliability limits, and underdetermined areas. |

For `not_applicable`, state only a directly established section-level reason when relevant and authorized. Route absence, skipped/paused content, not-assessed directions, no repair offer, and insufficient evidence remain distinct.

## Voice and safeguards

Write in second person and present tense. Lead with a concrete relationship moment when supported. Name what changes across cue, interpretation, body/action, response, and residue without making the other person a character in a theory. Use privacy-preserving role labels.

Do not pathologize vigilance, protest, distance, or non-repair in unsafe or unreliable conditions. Do not infer origin, childhood/caregiver cause, trauma, diagnosis, physiology, another person's motive, global attachment identity, or missing sequence steps. Do not advise the reader to seek reassurance, repair, disclose, separate, stay, or change contact.

Exact quotation marks require eligible text, eligible basis, evidence/response IDs, privacy approval, and permission for the exact ATT code. Otherwise paraphrase. Never quote selected authored options.

## Required output

Return exactly one JSON object validating as `LayerReportArtifact` in `13_report_artifact.schema.json`:

- `artifact_type`, `contract_id`, `integrity_contract_id`, `package_version`, and `prompt_release`;
- `report_id`, `report_type: "ATT"`, `report_version`, `writer_template_version: "PWRP-V4.1"`, and `status: "final"`;
- exact `packet_binding`;
- `report_markdown`, ordered `markdown_blocks`, `claims`, exact `paragraph_traces`, and `digests`.

Every substantive block has exactly one trace; every claim is traced. Trace confidence is the minimum of all cited claims. Carry all supporting evidence, contradictions, limits, referent/window/horizon boundaries, and safety/reliability qualifications. Response IDs are non-empty only for an exact quote. Compute LF-normalized Markdown and RFC 8785 JSON SHA-256 values with `validate_delivery_synthesis.mjs`, then require `validateLayerReportArtifact` success before release.

End with supported ordinary/resource context or a bounded exception when available; otherwise with a neutral limit. Do not force relationship counts, dimension coverage, report length, paragraph count, or reassurance.
