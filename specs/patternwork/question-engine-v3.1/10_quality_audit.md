# Patternwork Question Engine v3.1 — Quality Audit

Audit status: **RELEASE GATES PENDING IMPLEMENTATION VERIFICATION**  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Audited package: `00_overview_and_conventions.md` through `09_report_writer_contract.md`  
Audit date: 2026-08-29

## 1. Release conclusion

No blocking contract violation or hard failure was found in files 00–09. The package is internally coherent enough to proceed to pilot implementation: it is episode-first, adaptive rather than fixed-length, non-diagnostic, relationship-specific, confidence-limited, correction-capable, and explicit about the separation between raw capture, evidence synthesis, and report writing.

Four bounded concerns remain for implementation and pilot testing. None changes the accepted architecture:

1. a few ordinary-language phrases are adjacent to framework language and should be tested for whether users perceive a parts ontology;
2. eye-contact and body-language options need explicitly non-normative rendering and scoring;
3. option density and reading burden need empirical testing even though reduced-choice and non-drag alternatives exist;
4. paragraph trace records are specified in the writer contract but the report-output trace object is not itself schema-validated by file 08.

The audit found no silent workaround. These concerns are recorded below as `QA-C01`–`QA-C04` with implementation tests and gates.

## 2. Audit method

### 2.1 Exhaustive surfaces

The following were read and checked in full:

- architecture, identifiers, section codes, confidence rules, stop conditions, voice, accessibility, safety, and package acceptance in file 00;
- all 35 report-section coverage cells and their evidence floors in file 01;
- all 17 interaction families and all 51 fully voiced inventory examples in file 02;
- every calibration and broad-mapping item in file 03;
- every adaptive deep-dive module in file 04;
- every contextual response-option set and selection safeguard in file 05;
- all stage gates, hard constraints, route decisions, contradiction discriminators, stop logic, and verification scenarios in file 06;
- all 17 per-family scoring contracts and cross-item synthesis rules in file 07;
- the complete draft-2020-12 JSON Schema in file 08;
- every writer permission, confidence rule, trace rule, prohibition, and failure behavior in file 09.

### 2.2 Mechanical checks

The audit also performed the following package-wide checks:

- counted three fully voiced examples for each of the 17 inventory families (`51/51` present);
- checked item-heading uniqueness across files 02–04 (`112` unique bank-item headings; no duplicate heading ID);
- parsed `08_data_schemas.schema.json` as JSON;
- scanned user-facing prompt lines for framework and prohibited terminology; the only prompt-line match for “manager” was the ordinary job-role meaning in evaluation prompts;
- checked that every stable section code appears across the coverage, scoring, and writer layers;
- traced delayed-reply, evaluation, overload, rupture/repair, exception, identity-confirmation, and quote-provenance paths end to end.

### 2.3 Sampling strategy inside exhaustive files

Some properties require close linguistic comparison rather than a simple presence check. Those comparisons sampled every family and deliberately oversampled:

- delayed response and ambiguity (`MS-001`, `MS-101`, `WMA-001`, `WMA-101`, `WMA-201`);
- conflict and rupture (`BDA-109`, `RRE-001`–`RRE-003`, `RRE-201`–`RRE-203`);
- body mapping and low-interoception routes (`BTM-001`–`BTM-003`, `BTM-109`, `BTM-201`–`BTM-202`, `MS-201`, `OL-BL-*`);
- potentially framework-adjacent identity/function items (`VFR-*`, `BSP-*`, `PIS-*`, `FCF-*`);
- culturally contingent areas such as family, money, praise, help, touch, eye contact, and closeness pace;
- high-burden memories and every required recovery route.

## 3. Coverage audit

| Audit dimension | Status | Evidence in 00–09 | Follow-up or remediation |
|---|---|---|---|
| Voice and recognition | Pass | File 00 requires a named relationship, concrete moment, embedded horizon, actual rather than ideal behavior, ordinary first-person options, and read-aloud review. Files 02–04 consistently open with recognizable scenes such as the evening after a seen message, the night before review, or the first hour after rupture. | Cognitive interviews must test recognition latency, felt judgment, and whether supplied wording crowds out the user's own language. |
| Monotony and interaction variety | Pass | File 02 implements all 17 families with recall, strip, map, rank, sort, matrix, threshold, text, and resource mechanics. File 06 hard-blocks a family used more than twice in five screens and prevents three recall screens in a row. | Instrument the rendered form sequence and flag sessions that violate the rotation state even if content is otherwise eligible. |
| Report coverage | Pass | File 01 contains exactly 35 stable cells: 12 IFS-informed, 11 state/polyvagal-informed, and 12 attachment-informed. Each cell names required fields, supplying families, replication, and confidence. Files 07 and 09 preserve these boundaries. | Before pilot release, compile a manifest report proving that every rendered bank item maps only to declared schema fields and section codes. |
| Option balance | Pass with follow-up | File 05 uses context-matched sets, includes ordinary/neutral and uncertain paths, separates direction and horizon, and prohibits treating options as scales. No single “healthy” response is consistently privileged. | See `QA-C03`: test endorsement spread, serial-position effects, wording desirability, and whether 5–9 displayed choices are too dense in any mode. |
| Framework leakage | Pass with concern | Framework names are absent from user-facing headings and prompts. Role/state/attachment terms remain in scoring and reporting. A few phrases use ordinary “part of me/another part of you” wording (`RRE-101`, `BSP-201`). | See `QA-C01`: test whether users hear these as ordinary language or as an imposed parts model; replace with “some of me” or a neutral alternative if leakage is detected. |
| Safety and relationship context | Pass | `RL-102`, files 01, 04, 06, 07, and 09 require safety/reliability context before relational inference; unsafe/coercive/threatening/currently unstable contexts suppress trait interpretation and forced repair. High arousal, stop, pause, and “too much” immediately suspend deepening. | Pilot review should audit every unsafe-context session for forbidden routing and for whether support copy is proportionate without implying a finding. |
| Neurodivergent and accessibility support | Pass with follow-up | Files 00, 03–06 include keyboard, list, screen-reader, reduced-motion, non-drag, fewer-choice, low-interoception, observable-sign, no-inner-words, and pause/save routes. Blankness and delayed access are explicitly not classified. | Test with users who prefer action-based reporting, screen readers, high contrast, reduced motion, low literacy, and one-question/fewer-choice modes. Do not infer neurotype from use of an accommodation. |
| Cultural and structural assumptions | Pass with concern | Partner, biological family, employment, touch, money stress, cohabitation, monogamy, and disclosure are optional or user-defined. Material unreliability and constraints remain context rather than bias. Spiritual/cultural practices appear as optional resources. | See `QA-C02`: ensure eye contact, direct asking, independence, repair, verbal explanation, and emotional disclosure never function as normative ideals; recruit culturally and relationally diverse interview samples. |
| Contradiction handling | Pass | Files 01, 06–09 preserve contradictions, test person/horizon/intensity/identity/time/safety discriminators, and cap unresolved claims at low. Exceptions define boundaries rather than erase patterns. | Log discriminator chosen, evidence on both sides, resolution status, and any later reopening of a Green cell. Audit that corrections do not delete source evidence. |
| Burden and stopping | Pass with follow-up | File 06 imposes arousal caps, recovery after every body map and rupture item, rotation, save/resume, marginal-value stopping, and no fixed administered length. File 03 samples rather than exhausts broad domains. | Empirically estimate item-level pause/skip, completion, perceived burden, and coverage gain. Treat the six-sample S1 floor as an evidence-design hypothesis, not a promised length. |
| Paragraph traceability | Pass with concern | File 09 requires a trace record per substantive paragraph with section, claim, evidence, response, confidence, contradiction, limit, and writer-version fields. File 08 provides attributable objects/excerpts and resolvable IDs. | See `QA-C04`: add and validate a report-output schema or an equivalent automated contract test before production export. |

## 4. Findings register

### `QA-C01` — Mild framework-adjacent phrasing

- **Severity:** low; implementation follow-up.
- **Invariant:** framework structure stays invisible in the UI and no parts ontology is forced.
- **Evidence:** `RRE-101` offers “a part of me stays braced”; `BSP-201` says “even if another part of you knew it might not.” Both are ordinary phrases, and neither names IFS, assigns an identity, or creates a part profile. `PIS-201` explicitly allows “internal presence/pattern,” uncertainty, rejection, no name, split, and undo.
- **Test:** in cognitive interviews, ask users what they thought the phrase meant before explaining anything. Failure threshold: more than 15% of interviewees spontaneously report that the assessment was telling them they have separate inner entities, or more than 10% say the wording changed their answer.
- **Follow-up:** if the threshold is crossed, test neutral variants such as “some of me stayed braced” and “even if another possibility was available.” Retain the stronger user wording only when entered or explicitly confirmed.

### `QA-C02` — Eye contact and culturally contingent social signals

- **Severity:** low; implementation follow-up.
- **Invariant:** culture, disability, and neurotype must not be scored against a normative social ideal.
- **Evidence:** `BTM-002` includes eye contact among several optional capabilities; files 00 and 04 state that social availability is multivariate and that low access is not deficit evidence. File 05 also offers observable and non-body alternatives.
- **Test:** inspect the scoring manifest and rendered summary for any rule that treats eye contact, direct disclosure, touch, rapid repair, independence, or verbal access as inherently more regulated or secure. Conduct cognitive interviews across cultural and neurodivergent groups.
- **Follow-up:** label these as context-specific access/preferences, allow “not relevant to how I connect,” and prohibit any single social signal from changing a state or attachment estimate.

### `QA-C03` — Option density and reading burden are not yet empirically established

- **Severity:** medium implementation risk, not a contract failure.
- **Invariant:** burden is minimized only after defensible evidence is collected, with cognitively simple screens and accessible alternatives.
- **Evidence:** file 05 normally renders 5–9 choices plus uncertainty/custom controls; files 03–04 include reduced-choice modes and one-screen interactions. The package contains many long but context-specific option libraries by design.
- **Test:** measure median reading time, backtracking, “none fit,” early exits, accidental selection correction, and burden ratings by mode. Review screen-reader verbosity and small-screen layouts separately.
- **Decision gate:** revise any item with median burden above 3/5, completion below 85% among eligible users, “none fit” above 25% without substantive typed alternatives, or a twofold accessibility-mode gap in abandonment after adjusting for topic intensity.
- **Follow-up:** shorten or stage the affected response set, not the evidence requirement; keep the reduced-choice and free-entry paths available.

### `QA-C04` — Report-output trace record is a v3.1 release gate

- **Severity:** blocking v3.1 release-gate failure until closed.
- **Invariant:** every substantive paragraph must remain traceable to evidence and response IDs at export.
- **Evidence:** file 09 section 2 defines the required trace fields and section 11 requires referential checks. File 08 validates input `ReportEvidencePacket` objects and `SelectedExcerpt` provenance but contains no `ReportParagraphTrace` output definition.
- **Test:** create an automated export test that fails when a substantive paragraph lacks a section code, evidence IDs, confidence, applicable contradictions/limits, writer version, or quote response IDs.
- **Release gate:** accept a report-output schema with `ReportParagraphTrace`, or an equivalent separately schema-validated artifact contract, and prove it against every v3.1 fixture/report/trace. This must not change the evidence-packet boundary. The hub must then freeze a new content fingerprint and obtain independent review; no implementation claim is a passing release result before those checks.

## 5. Hard-failure scan

| Hard failure | Status | Audit evidence |
|---|---|---|
| Fixed item count before sufficiency | Pass | Files 00, 01, 06, 07, and 09 use coverage and marginal value; no completion time is promised. |
| Mainly repeated six-option scenarios | Pass | Seventeen families and nine interaction forms are implemented; routing enforces rotation. |
| Clinical stage directions instead of memory triggers | Pass | Prompts use concrete people, moments, horizons, and actual moves. |
| Vague referents where relationships differ | Pass | `RL` precedes relational inference; “depends” routes to a named person. |
| One response carries all three frameworks | Pass | Each screen has one main introspective task; cross-framework synthesis occurs later from separate fields. |
| Part biography or identity without confirmation | Pass | Files 01, 06–09 require two independent episodes plus `PIS`/`FCF`, with a narrow one-dossier exception only when explicitly coherent and confirmed. |
| Invented voice, fear, ritual, cost, or history | Pass | Direct fields, manifest mappings, and writer prohibitions prevent invention; missing sections stay unsupported. |
| Selected supplied phrase treated as quote | Pass | Files 00, 02–05, 07–09 repeat the typed/edited/explicitly-confirmed provenance rule. |
| State classified from one sensation | Pass | Repeated multichannel maps plus entry/exit or recovery are enforced in files 01, 04, 06–09. |
| Body self-report presented as physiology | Pass | Schema constant and writer contract require self-report limitation. |
| One global attachment style | Pass | All attachment objects key to `REF-*`; cross-context comparisons retain differences and never yield a global style. |
| Missing protest, deactivation, repair directions, or reassurance uptake | Pass | Coverage cells `ATT-05`–`ATT-09`, `BDA-205`–`BDA-206`, and `RRE-201`–`RRE-203` explicitly separate them. |
| Unsafe or unreliable context ignored | Pass | Safety is a hard prerequisite and report qualifier across all layers. |
| Direct exile/age/history/trauma probing | Pass | Prohibited in prompts, scoring, schema packet prohibitions, and writer rules. |
| Verbal inner speech forced | Pass | Words, felt rules, images, body/action urges, blankness, observable signs, and no-access paths are implemented. |
| Session ends at peak activation | Pass | Body maps, rupture, loss, and high arousal force resource, ordinary-state, pause, or save routes. |
| Unsupported report filler | Pass | File 09 requires omission or a neutral missing-evidence statement; schema coverage distinguishes unsupported, not applicable, and early stop. |

## 6. Audit acceptance statement

The legacy architecture informs v3.1 implementation, but this copied release documentation is not itself a passing release checkpoint. The package may proceed through implementation and empirical pilot work only with `QA-C01`–`QA-C03` preregistered and `QA-C04` closed as a release gate, followed by a new frozen fingerprint and independent review. This audit does not claim that the instrument is psychometrically validated, clinically valid, diagnostic, physiologically measuring, or ready for unsupervised production use.

## 7. Post-audit independent-review addendum

The first frozen acceptance checkpoint, `PWQE3-CP1`, did not pass independent review. Three major findings were accepted rather than downgraded. A subsequent checkpoint, `PWQE3-CP2`, also did not pass because its two acceptance paths deepened immediately after `BTM-201` instead of taking the mandatory recovery transition. `PWQE3-CP3` also did not pass: core `BTM-109` and `BTM-114` branch text conflicted with the canonical `RSR-003`/eligible-`SEF` recovery rule, and the router pseudocode could clear pending recovery after a skipped, paused, partial, or otherwise uncompleted recovery interaction.

| Finding | Accepted problem | Remediation incorporated for the next checkpoint | Retest required |
|---|---|---|---|
| `FA-PWQE3-001` | Respondent B used a relationship-context item before creating its referent and used a two-episode comparison map before the second episode existed. | The path now creates Mika with `RL-101` before `RL-102`, anchors `EP-B-02` with `MS-106`, and only then administers `BTM-201`; packet provenance and the demonstration were regenerated. | Schema, reference resolution, bank eligibility, order, coverage, and resource-ending checks. |
| `FA-PWQE3-002` | Several rendered choices implied a preferred answer through words such as “normal,” “present enough,” or a framework label. | All 51 inventory examples, 34 mapping items, 27 deep modules, and 91 option sets received a rendered-language audit; cited and related choices were rewritten as neutral observable behavior, timing, access, expectation, or effect. | Exhaustive rendered-fragment scan plus blinded cognitive testing in the pilot. |
| `FA-PWQE3-003` | The pilot plan allowed a nonzero failure rate for routing rules defined as “never” constraints. | Hard routing, schema, reference, and completed-response-preservation gates now require 100% compliance and zero observed failure; any occurrence blocks advancement until correction and successful replay. | Synthetic route replay and pilot decision-gate inspection. |
| `FA-PWQE3-004` | `PWQE3-CP2` failed the mandatory post-body-map recovery invariant: Respondent A routed from `BTM-201` directly to `VFR-201`, and Respondent B routed from `BTM-201` directly to `PIS-201`. | Each path now administers an eligible `RSR-003` immediately after `BTM-201`, with a unique interaction/response ID, raw response, packet provenance, episode recovery evidence, state-regulation evidence, and bounded coverage rationale before any further deepening. The reported effect remains a single current observation rather than a stable efficacy claim. | Deterministic replay must show `BTM-201 → RSR-003` in both paths; both packets must remain schema-valid with all bank, RI, RR, evidence, and coverage references resolved, no ID conflicts, 35 canonical coverage cells, and a resource-oriented final item. |
| `FA-PWQE3-005` | `PWQE3-CP3` failed cross-artifact routing consistency and completion-state integrity. Core `BTM-109`/`BTM-114` routes did not consistently require the canonical immediate `RSR-003` or eligible low-intensity `SEF-*` transition, and router pseudocode could treat presentation, skip, pause, or partial entry as if recovery had completed. | Align every `BTM-*` bank route and router branch to the canonical recovery rule. Use a completion-sensitive `post_body_recovery_pending` flag: set it after a completed `BTM-*`; do not clear it when recovery is merely presented, skipped, paused, partially answered, or ineligible; clear it only after an eligible `RSR-003` or low-intensity `SEF-*` interaction is completed. While pending, prohibit deepening and retain pause/save/end as valid exits. A skipped, paused-before-completion, or ineligible `BTM-*` must not falsely create completed body evidence. | Exhaustively compare all `BTM-*` bank recovery text with the router. Deterministically replay: completed body map and completed recovery; recovery skip; pause before recovery presentation; pause on the recovery screen; partial recovery response; ineligible recovery candidate; skipped/partial/ineligible body map; save/resume while pending. Assert the flag sets only from completed eligible body evidence, persists through every uncompleted recovery outcome, clears only on completed eligible recovery, and never permits deepening while pending. |

These remediations do not retroactively turn `PWQE3-CP1`, `PWQE3-CP2`, or `PWQE3-CP3` into a passing checkpoint. In particular, documenting or implementing `FA-PWQE3-005` does not constitute retroactive acceptance of `PWQE3-CP3`. The repaired package must pass a fresh independent review against a new frozen fingerprint before final artifact acceptance. `QA-C01`–`QA-C03` remain pilot follow-ups because their empirical questions cannot be closed by document inspection alone; `QA-C04` is a production release gate requiring schema-validated report traces before release.
