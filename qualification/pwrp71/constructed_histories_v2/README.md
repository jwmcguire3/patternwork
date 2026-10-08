# PWQE 5.1 fictional response histories (authored v2)

**Status:** Source-consistent authored *candidate* histories. **Not** server-issued, authenticated, or routing-qualified. These are synthetic fictional stories for testing, never observations about real people.

The v2 dataset holds P01–P09 and C01–C16 from the unchanged original source files. It intentionally adds a full **30-item Mapping scaffold** to each profile, with source-authored options/modes. The original scenario answers are preserved separately as `originalAuthoredResponses`; missing Mapping answers are in `syntheticMappingResponses`. The complete proposed event sequence is in `combinedCanonicalResponses`.

## Critical provenance

- `original_authored_fictional_answer`: an option explicitly authored in P01–P09 or C01–C16.
- `new_synthetic_mapping_answer`: an additional fictional choice created solely to make a full Mapping-stage structural fixture.
- `original_authored_fictional_binding` / `original_authored_fictional_scenario`: a proposed comparison or replay supplied by the original worked path.
- `new_synthetic_mapping_control`: an explicitly fabricated consent/context control needed to make Mapping source legal.

Every response has one keyed row in `responseProvenance`, including the original source reference and translated step. The controls include a simulated M28 focus and consent for the one archived M10 body-choice case requiring it. Synthetic referent roles are listed separately. Nothing in this directory is a real user answer or a report-approved interpretation.

**Do not pool synthetic Mapping answers into a semantic-quality benchmark without review.** They can affect claims of recurrence, pattern strength, state prevalence, or attachment scope. The intended semantic contrasts are those in the preserved *original* case evidence; the newly authored Mapping scaffold is only suitable for workflow testing.

## Three intentionally withheld answers

The original coverage plans mark C02 D67 and D68, and C09 D79 as **forbidden questions**. Those hypothetical selections remain in `withheldAuthoredAnswers`, *not* `combinedCanonicalResponses`. Including them as administered would contradict their own expected routing constraints.

## Validation completed at construction

All 25 files: 30 Mapping responses, source-authorized option IDs (including `M10.observable` when not opted in), valid selection modes, canonical steps, ordered same-occurrence prerequisites, controlled-replay lineage, source topic permissions, unique administrations, and no more than 56 responses. The original accepted selected options have not been changed.

## Additional testing, outside this authored-data task

These are **not** equivalent to an actual session transcript. To make them route-qualified, drive the real PWQE 5.1 session under a fixture harness; let the server issue question/occurrence/target IDs; exercise `applyPwqe51ReplayBinding` and real page controls; produce canonical state + snapshot; then validate `buildPwqe51RouterPacket` with the actual 7.1 adapter.

Do not inject server-owned `targetIds` or claim a routed result using this file as a shortcut. The `mappingControls`, `distinctnessIntents` and `comparisonBindingIntents` describe **simulated decisions to be enacted** rather than forged router evidence.

Source commit: `e3cb96593bd232f346cb561cda98b4d4c863a4cb`. Authored bank and fixture source files were **not changed**.
