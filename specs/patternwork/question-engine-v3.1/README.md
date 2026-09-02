# Patternwork Question Engine v3.1 — Deliverable Guide

Status: complete design package; **not yet empirically validated**  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`

This package specifies an adaptive, episode-first self-assessment evidence engine for individualized IFS-informed, polyvagal-informed, and attachment-informed reports. It is a self-understanding instrument, not a diagnostic test or physiological measurement system.

## Package at a glance

- 35 report sections with explicit evidence and confidence requirements
- 17 interaction families with three fully voiced examples each (51 examples)
- 34 calibration and broad-mapping items
- 27 adaptive deep-dive modules
- 91 contextual response-option libraries
- 112 unique interaction IDs across inventory, mapping, and deepening banks
- deterministic two-pass routing, safety, contradiction, pause/resume, and marginal-value stop logic
- Draft 2020-12 schemas for evidence packets, report artifacts, and synthesis bundles; all three pass structural, cross-object, and independent acceptance verification
- three v3.1 fictional packets plus a schema-valid Pass-1 Mapping Summary artifact, including an N/A and route-absence demonstration

## Recommended reading order

1. [Architecture and conventions](00_overview_and_conventions.md)
2. [Three-report coverage matrix](01_three_report_coverage_matrix.md)
3. [Complete interaction inventory](02_complete_interaction_inventory.md)
4. [Core mapping bank](03_core_mapping_bank.md)
5. [Adaptive deep-dive banks](04_adaptive_deep_dive_banks.md)
6. [Response-option libraries](05_response_option_libraries.md)
7. [Branching and routing table](06_branching_routing_table.md)
8. [Scoring specification](07_scoring_specification.md)
9. [Machine-readable data schema](08_data_schemas.schema.json)
10. [Report-writer contract](09_report_writer_contract.md)
11. [Quality audit](10_quality_audit.md)
12. [Pilot and validation plan](11_pilot_and_validation_plan.md)
13. [Report-artifact schema](13_report_artifact.schema.json)
14. [Synthesis-bundle schema](14_synthesis_bundle.schema.json)
15. [Three-respondent acceptance demonstrations](12_acceptance_demonstrations.md)
16. [Respondent A](12a_respondent_a_packet.json), [Respondent B](12b_respondent_b_packet.json), [Respondent C](12c_respondent_c_packet.json), and [Respondent C Mapping Summary](12c_mapping_summary_artifact.json)

## Required deliverables mapped to files

| Source requirement | Package file |
|---|---|
| 1. Three-report coverage matrix | `01_three_report_coverage_matrix.md` |
| 2. Complete interaction inventory | `02_complete_interaction_inventory.md` |
| 3. Core mapping bank | `03_core_mapping_bank.md` |
| 4. Adaptive deep-dive banks | `04_adaptive_deep_dive_banks.md` |
| 5. Response-option libraries | `05_response_option_libraries.md` |
| 6. Branching and routing table | `06_branching_routing_table.md` |
| 7. Scoring specification | `07_scoring_specification.md` |
| 8. Data schema | `08_data_schemas.schema.json` |
| 9. Report-writer contract | `09_report_writer_contract.md` |
| 10. Quality audit | `10_quality_audit.md` |
| 11. Pilot and validation plan | `11_pilot_and_validation_plan.md` |
| v3.1 report-artifact release-gate schema | `13_report_artifact.schema.json` |
| v3.1 synthesis-bundle release-gate schema | `14_synthesis_bundle.schema.json` |
| A/B differentiation and C applicability/Pass-1 acceptance fixtures | `12_acceptance_demonstrations.md`, `12a_respondent_a_packet.json`, `12b_respondent_b_packet.json`, `12c_respondent_c_packet.json`, `12c_mapping_summary_artifact.json` |

## Hub-verified package properties

- All 35 canonical section codes are used; no unknown section code appears.
- All 112 interaction IDs are unique; inventory uses 0xx, broad mapping 1xx, and deepening 2xx ranges.
- Every interaction family has exactly three complete inventory examples.
- All three v3.1 fictional packets validate structurally and under the cross-object packet validator; the Mapping Summary validates structurally and behaviorally.
- Each packet contains 35 ordered, unique coverage cells.
- All bank IDs cited in the acceptance demonstration resolve to definitions in the package.
- Explicit evidence-object field paths used by the banks match the schema.
- No unfinished-draft marker remains.
- Packet validation passes 35 assertions; delivery/synthesis validation passes 15 adversarial tests; prompt-package, fixture, and fingerprint checks pass at the accepted release checkpoint.

## Release boundary and follow-ups

The v3.1 contract and report-generation package has passed integrated and independent artifact verification; this is not an empirical-validity claim. Before production use, complete the staged plan in `11_pilot_and_validation_plan.md`, including cognitive interviews, expert review, accessibility and cultural testing, option-density/burden measurement, missingness and response-distribution analysis, coding agreement, appropriate test–retest and convergence studies, and adaptive-stopping simulation/calibration.

The audit tracks three pilot follow-ups—framework-adjacent everyday wording, non-normative rendering of culturally contingent cues such as eye contact, and option density/reading burden—and one production release gate: automated validation of paragraph-level report traces. These are `QA-C01` through `QA-C04` in `10_quality_audit.md`.

The engine must never claim a fixed completion length before pilot evidence, fill unsupported report sections, infer diagnostic/developmental/trauma conclusions, treat self-report as vagal physiology, turn selected authored wording into a quotation, or generalize one relationship into a global attachment style.

## v3.1 release contract

- Packets and delivery artifacts bind to an immutable snapshot ID/revision and canonical evidence, scope, packet, report, and trace digests.
- A structured window, administration order, and independent episode IDs are required for provenance and coverage replication.
- Pass 1 normally delivers the framework-neutral Mapping Summary (`MAP-01`–`MAP-08`); Pass 2 is optional deepening, not a prerequisite for a valid Pass-1 deliverable.
- Route or domain absence only disables an unavailable route. Coverage `not_applicable` requires direct section-level inapplicability evidence and a retained reason; it is distinct from skipped, unknown, and unsupported.
- Contradiction report impact is typed and ordered: `omit_claim > cap_low > qualify > none`; `cap_low` is synthesis-ineligible and renders as underdetermined.
- `QA-C04`, acceptance of `13_report_artifact.schema.json` and `14_synthesis_bundle.schema.json`, a new frozen fingerprint, and independent review are release gates. No type generation occurs until the authoritative schemas are accepted and hub verification is complete.
