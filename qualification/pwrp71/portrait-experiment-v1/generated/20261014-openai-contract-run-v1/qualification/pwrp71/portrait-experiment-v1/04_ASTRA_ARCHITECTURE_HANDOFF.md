# Astra integration handoff — all five report layers

This is a **prepared design decision packet**, not an instruction to blindly adopt it. Reason independently over results from the P02/C10 controlled run before changing production contracts.

## Present architecture and failure mode

The current PWRP v7.1 model generates `draft.claims`, `name_registry`, `relationships`, and `draft.sections[].text` in one call; `lib/server/reports/pwrp71-validation.ts` renders the draft sections to Markdown (and injects a repeated nonclinical disclaimer), and `lib/server/reports/pwrp71-review.ts` verifies structure/digests. The model favors defensible evidence narration and repeats uncertainty; accepted consumer prose can remain sterile. A name registered in JSON may never appear in sections.

Current controls are source-pinned to `reporting/contracts/report_release_manifest.json` via `lib/server/reports/pwrp71-source.ts`. Editing pinned prompts or schema bytes in place will invalidate hashes. Do not update only one side of any contract.

## Proposed permanent architecture (to test, not assume)

**Stage 1 Interpretation:** canonical `claims`, stable `name_registry`, `relationships`, role and narrative priority plus source scopes. Deterministically validate claims and evidence. No reader copy yet. Distinguish supporting user observations from synthetic test scaffolds.

**Stage 2 Composition:** model receives only accepted interpretive graph plus permitted source-grounded context. Produces narrative sections and paragraphs with claim-to-paragraph binding, selecting the dominant relational structures, rather than following questionnaire order.

**Stage 3 Independent review:** dual verdicts for structural/evidential correctness and reader experience. Source-level review checks claims. Reader-level review checks unsupported new assertions, omitted important insights, role/name mismatch, unsourced recurrence, and understandable, direct prose. A rewrite cannot inherit old digest/review.

**Rendering:** short nonclinical framing in the document chrome or footer, rather than intruding before the first personal paragraph. Reader-facing section structure varies by evidence, not by required theory categories.

## Files and likely interface changes

- `reporting/prompts/00_SHARED_REPORT_PROMPT_v7.md`: separate internal review notation from reader prose.
- `reporting/prompts/01_MAPPING_REPORT_PROMPT.md`: useful first portrait; not an impoverished placeholder and not the full theory bundle.
- `reporting/prompts/02_IFS_REPORT_PROMPT.md`: functional part portraits, interaction, vulnerable material, named functions.
- `reporting/prompts/03_STATE_REPORT_PROMPT.md`: lived conditions, attention/energy/words/function/ease/recovery, no assumed physiology.
- `reporting/prompts/04_ATTACHMENT_REPORT_PROMPT.md`: how expectations and relationship conditions change approach, boundaries, distance and repair without generic style labeling.
- `reporting/prompts/05_SYNTHESIS_REPORT_PROMPT.md`: reuse names and resolved claims across lenses; give a coherent entry portrait without treating shared leaf evidence as repeated independent confirmation.
- `reporting/prompts/06_REVIEWER_PROMPT.md` and `07_REPAIR_REPORT_PROMPT.md`: robust evidence audit **and** consumer composition checks.
- `reporting/schemas/report_draft.schema.json`: explore schema for a validated interpretation graph and composed paragraphs with nonprinted source-claim bindings, stable names, and reviewable scope. Avoid duplicating every claim in the narrative.
- `reporting/schemas/report_review.schema.json`: independent evidence and consumer verdicts; reviewer refs must resolve.
- `lib/server/reports/generator.ts`: move from generate+review to interpretation+validation+composition+review while preserving journaling, budget reservation, candidate pins, correct repair/resume and same-profile synthesis.
- `lib/server/reports/pwrp71-validation.ts`, `pwrp71-review.ts`: canonical new digest, paragraph IDs/claim bindings, identity, stale-evidence checks, reader text restriction.
- `lib/server/reports/pwrp71-adapter.ts`: make available evidence stable across stages, protect private notes/identity; do not mutate the router packet.
- `lib/server/reports/qualification/runner.ts` and `approval.ts`: versioned qualification evidence, explicit new source/run/schema/model pins and review boundary; historical v7.1 fixtures remain untouched.
- `lib/server/pdf/renderer.ts` and `app/reports/[assessmentId]/page.tsx`: move framing out of the report body and improve reader headings without hiding validity.
- Add fixture-based narrative tests across IFS, Mapping, PV, attachment and synthesis including P02/C10, C01/C02 (differential), P07 (restraint), C07 (distinctness), C08/C09 (return/no-return), C12 (expectations), and C15/C16 (permission).
  
## Safeguards

- **Never** treat experimental source overlays as active pinned PWRP source.
- Version the new report release, source package, prompt, schema, and policy pins together. Do not forge release approval.
- Existing archived reports stay immutable. Regenerate review receipts if any draft prose/claim/name changes.
- Source-to-claim and claim-to-prose validation should be separate. Source-dependent assumptions should not be “repaired” by voice polishing.
- Retain both inference specificity and positive controls: do not force a minimum number of protectors or a hidden trauma account.
- Use a few saved real provider results for offline evaluation of composition where permitted. **Do not silently authorize new paid calls.**
- Budget estimates must count extra interpretation/composition/review calls, including repairs/escalations; preserve provider-dependent monetary ceilings, run journal and unknown-cost reservations.

## Astra decision gates for the next turn

1. Read both newly generated P02/C10 reports and their full claim/relationship sets, score against `03_NARRATIVE_REVIEW.md`.
2. Decide if separate stages genuinely improve quality compared with a single v7 prompt; also test a minimal single-stage instruction variant for an architecture comparison before committing an additional inference call per report.
3. Decide whether an intermediate graph needs its own schema or can reuse v7 `claims`/`name_registry`/`relationships`.
4. Implement end-to-end for all report types and output renderer, with source/schema pin rotation and regression tests.
5. Run a controlled fixed-source matrix with P02/C10, C01/C02, P07 and selected comparator cases. Grade recognition, narrative role consistency and unsafe inference *independently*.
6. Keep qualification and activation gates distinct. Prepare new review evidence; do not declare old model or source pins current after changing contracts.

The next turn should provide Astra with this handoff, both P02/C10 outputs, the source/packet pins, source report files, and any observed reviewer failures. Astra must have authority to challenge this design before implementing it.
