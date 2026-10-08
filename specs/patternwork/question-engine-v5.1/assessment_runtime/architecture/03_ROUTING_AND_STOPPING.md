# PWQE 5.1 coverage extension — active policy

The base selection/stopping rules below are retained. The active source now has 30 Mapping and 100 conditional Deepening templates, with 92 targets. The extension is specified by `coverage_rules.json`; see the outer `coverage/ROUTING_CHANGES.md` for all new guards. No default cap was raised. Historical counts in the base design are not the active inventory.

# Deterministic evidence-gap routing

## 1. Two passes, not two fixed questionnaires

**Mapping** samples a breadth of applicable episodes and completes short action/meaning/effect blocks. It produces a useful map even when the respondent never takes Deepening. It can identify an episode-scoped manager or another supported pattern; named interpretation is not a premium feature locked behind extra questions.

**Deepening** is a bounded set of targeted discriminators selected from the optional bank and a controlled replay operator. It should improve an explanation, broaden or narrow its scope, identify a handoff, or establish a useful exception. It must not fill every field of every possible part dossier.

## 2. Coverage before confirmation

The common Mapping plan is in `routing_targets.json`. Sample ordinary experience, evaluation/standards when applicable, mistakes and self-response, boundaries, overload and recovery, practical uncertainty, close-relationship uncertainty when applicable, help/receiving help, repair, rest, competing wants and a comparable easier occasion.

These are coverage offers, not mandatory disclosures. Unavailable or declined contexts are marked unavailable; they are not deficits and do not keep a session open. No minimum number of insecure responses, named protectors, intense moments or contradictions is required.

Do not disproportionately deepen whichever context happened to come first. Before optional interpretive expansion, ensure the remaining applicable common contexts have been offered, except when the respondent explicitly selects a focused route or ends early.

## 3. Target instance, not just target name

A target is keyed by `(target_id, occurrence_id, step_id, hypothesis_family, comparison_ids)`. Knowing the aim of work preparation does not fill the aim field of relationship checking. The same target can appear for different episodes, but each administration counts toward the burden cap.

Each instance records why it opened, source answer IDs, the competing explanations, missing fields, candidate questions, priority tier, attempted item variants, outcome and closing reason.

Outcomes: `resolved_descriptively`, `supports_interpretation`, `supports_alternative`, `unresolved`, `declined`, `unavailable`, `superseded`. The first and third are successes, not failed assessment routes.

## 4. Opening and closing logic

`routing_targets.json` lists every target, its discriminator, closure criterion and candidate questions. A candidate signal **opens a question**, not a settled classification. Targets open only from literal answers or user-selected topics. Missing body data, no recalled event, and a topic opt-out cannot open psychological hypotheses.

Close a target when its discriminator is answered adequately, when it remains unresolved after its allowed attempts, when the respondent declines, or when new context makes it low-value. A practical explanation is not an invitation to keep searching for emotional fear underneath it.

One attempt per item/occurrence/step/variant. Default at most two different discriminator attempts per target; a third requires an explicit respondent request and still fits within the session ceiling. A corrected answer may legitimately reopen affected targets; the stale answer is superseded first.

## 5. Priority: deterministic lexicographic tiers

0. User stop/pause/edit requests and unresolved invalid bindings. These are controls, not questions to extract more evidence.
1. A short pending item needed to make the last answer interpretable: episode identity, actual meaning or effect, or a comparison binding. Never force it if the person stops.
2. Unoffered applicable Mapping coverage.
3. A discriminator that could reverse a material emerging claim: practical information versus reassurance, chosen quiet versus loss of words, actual consequence versus inferred fear, a same-event versus different-event conflict.
4. Missing function/timing/sequence needed for a useful explanation in a respondent-selected or clearly evidenced pattern.
5. A neutral repeat or contrast before expanding a one-event explanation to recurrence; an exception before a third confirmation of the same idea.
6. Additional texture with a clear report use: bodily detail, extra cost, private/outward pace, more emotional detail.

Within a tier: respondent-selected focus first; then target with the most **distinct evidence requirements** the item can resolve; then lower decision burden; then least recently sampled episode context; then oldest target; then stable item ID. There is no numerical psychological severity or “interestingness” boost. The reference prioritizer implements these tie-breaks from a declared target snapshot, not a psychometric estimator.

## 6. Context saturation

A sequence block may contain several adjacent questions if they belong to one recalled event. Do not scatter a short block purely to satisfy visual variety. Outside such a block, after four consecutive optional items in one context, prefer a similarly useful different-context target when one exists. This is a burden/diversity preference, not a hard ban on the respondent choosing to finish a relevant module.

No fixed IFS/attachment/polyvagal shares. Track scenario exposure separately from report-lens reuse. Relational data may serve any supported lens. Do not reward generating all three interpretations from every answer.

## 7. Controlled replay for recurrence and contrast

`REPLAY` is a deterministic operator, not a new generated question. It reuses the **exact complete options and core wording of an authored root item** with an explicitly different occurrence and, when relevant, a different actual person. Allowed roots: M01, M02, M04, M07, M08, M10, M11, M15, M17, M20, M22, M23, M24, M25, D26, D40, D47, D61, D62, D63.

The episode chip reads “A different occasion” and the user confirms distinctness before it contributes recurrence. Reuse applicable attached meaning/effect questions only when the intended broader claim needs those fields. Log every replay as another administration. A repeat source template is not another authored question, and a replay is not free burden.

No memory? Close that repeat attempt. Do not substitute imagined behavior. D05 can retain reported typicality but cannot masquerade as the missing second event. D56–D58 require two valid real occurrences; they never create the comparison themselves.

## 8. Mapping completion

Normal Mapping readiness is a coverage/evidence condition, not a score:

- every applicable common block has been offered or deliberately closed;
- at least one actual episode can be described accurately;
- missingness and any unresolved referent/sequence ambiguity are retained;
- useful action/meaning/effect pairs are complete where available;
- an ordinary or easier-context question has been offered, not forcibly answered.

The ideal first report has several coherent mini-episodes, not necessarily several protectors. One coherent event can support a narrower early-stop report. No usable event means provide a factual “not enough answered to make a personal map” result, not generic interpretation.

## 9. Deepening completion

Stop when the highest useful target is closed/unavailable, when remaining candidates add texture without changing a material description, when the respondent ends, or when the burden ceiling is reached. Unresolved questions remain named gaps. Never keep questioning until distress “stabilizes,” a special architecture appears, or the person endorses the map.

A report-ready **major claim** needs the fields appropriate to that claim, not all possible pattern fields. A shorter well-supported state description or account of competent boundary-setting is a successful result. Do not make firefighters, vulnerability, cross-context recurrence or a certain number of parts compulsory.

## 10. Counts and burden policies

The authored pool contains **30 Mapping items + 100 conditional Deepening items = 94 substantive templates**, plus one accessible variant and separate controls. Most of the 64 are alternatives or specific discriminators, not another test to complete.

Initial pilot configuration:

- Mapping planning range: approximately 24–30 answered items when most contexts apply; less is allowed with missing contexts or early stop.
- Mapping ceiling: 32 substantive administrations, including any clarifying replay. Do not fill to this number.
- Deepening planning range: approximately 8–18 additional substantive administrations, counting replays.
- Total ceiling: 56 substantive administrations in one assessment snapshot. At the ceiling, finish with remaining uncertainty; a later session is explicitly separate or a versioned extension.
- Optional multi-answer/sequence interactions have an additional decision budget. A session stops offering extra detail when it would exceed 72 substantive decisions, even below 56 screens. User correction/pause/end remains available after the budget.

These are design hypotheses to pilot, not predicted population percentiles or a validated ideal length. A likely initial target of roughly 38–48 substantive administrations follows from a usable common pass plus two or three short resolution modules—not from the previous “52” target. Setup, episode bindings, uncertainty controls, pair choices and edits are measured separately. Every rendered substantive question consumes an administration even if skipped or answered with missingness; an ineligible question never rendered does not. Only answered material supplies evidence.

For planning only: about 10–18 minutes for a broadly applicable Mapping route and 5–12 more for selected Deepening is a testable product assumption. Do not advertise these times until observed; memory retrieval and accessibility needs can change them substantially.

## 11. Fatigue, distress and optionality

Use explicit user controls, not inferred mental state from speed or skipped answers. On “shorten,” suppress lower-priority texture and conclude the current short block if the user chooses; on “end,” end immediately. On “this is too much,” offer stop, pause or a different topic without collecting reasons. A resource prompt is an offer, never a gate trapping someone in the questionnaire.

Do not add clinical crisis screening as an incidental branch of this nonclinical bank. Any separately designed service-level safety response must not reinterpret missing answers, pressure disclosure, or promise monitoring. Preserve the application's existing user-control and privacy infrastructure when integrating this authored revision.

## 12. Executable reference implementation scope

`implementation/reference_router.py` remains the low-level selection policy. The new `implementation/patternwork_router/` package derives its inputs from server-issued presentations and canonical answers: occurrence/step evidence, target lifecycle, candidates, corrections, readiness, packet compilation and authenticated resume. The nine worked branch fixtures now have public answer-driven replay outputs; old declared target snapshots are not injected into those routes.

Current APIs and the minimal implementation clarifications are documented in `ROUTER_API_AND_INTEGRATION.md` and `ROUTER_IMPLEMENTATION_AUDIT.md`. This is a standalone executable core with in-memory/SQLite adapters, not production deployment. The report writer still owns supported psychological interpretation, names and prose; structural target resolution is not clinical certification.
