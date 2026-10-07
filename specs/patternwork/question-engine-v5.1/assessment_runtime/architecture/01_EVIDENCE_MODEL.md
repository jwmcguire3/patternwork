# Evidence architecture — PWQE 5 design candidate

## The decision

Build an **episode-based, multidimensional evidence system**, not a collection of separate framework tests and not a six-response classifier. One well-described episode may inform several reports. The reports do not count as independent evidence for each other.

The original ambition survives in two separate forms:

1. **Secondary response:** another action, feeling, urge or thought later in, or simultaneous with, the same episode.
2. **Secondary interpretation:** another explanatory lens supported by some of those observations.

`secondary_response` belongs in event/sequence data. `candidate_signal` belongs in an interpretation index. Neither substitutes for the other. An optional second response is not silently treated as weaker, later, or less important.

## 1. What “observed” means here

Use `reported_observation`, not “verified behavior.” These are retrospective self-reports. An answer can establish that the respondent reported sending another message; it does not independently verify the message, the other person's intention, or the accuracy of the respondent's memory. This provenance qualification belongs in the product frame, not every sentence of a report.

Each answer retains its literal authored selection, item and option versions, presented option order, role snapshot, recall window, occurrence ID, step ID, response revision and missingness state. Never replace the literal content with a theory tag.

## 2. Five distinct records—not a single confidence ladder

| Record | Meaning | Example | Authority |
|---|---|---|---|
| Observation | What the respondent selected/reported | Checked the phone during a delayed reply | Deterministic validated answer projection |
| Candidate signal | A useful indexing annotation | Attention directed toward contact | Authored rule; cannot add facts |
| Open interpretation | A question worth distinguishing | Information seeking or reassurance seeking? | Authored evidence-gap rules |
| Supported interpretation | Explanation that fits the relevant observations and available alternatives | Checking was directed at finding out whether the relationship was okay | Report inference with a traceable claim ledger |
| Scope/robustness record | Where it holds and how it was examined | Two actual waits with the same person; one contrasting known delay | Derived provenance plus semantic review |

A supported episode-level interpretation can be very clear without being a recurring personal trait. Cross-context recurrence broadens a claim; it is not automatically more certain than a carefully distinguished context-specific pattern. Drop the proposed single “possible → supported → high-confidence person” ladder.

### Claim kinds

`reported`, `supported_interpretation`, `open_question`, `not_assessed`.

Separately store:

- `scope`: occurrence / reported tendency / recurring within context / contrasted contexts;
- `support_basis`: direct aim / inferred function / reported effect / actual sequence / comparison;
- `recurrence_basis`: none / respondent generalization / distinct occurrences;
- `alternatives_status`: unresolved / partially distinguished / materially distinguished;
- `counterevidence_ids`, `missing_fields`, `source_observation_ids`;
- `status`: draft / reviewed / rejected / superseded.

No numerical certainty, percentile, latent-state score, diagnostic cutoff, or “complexity” score is authorized. Product routing priorities are not psychometric probabilities.

## 3. Episode identity and temporal structure

An occurrence is a real recalled event, not a question ID. Two questions about one disagreement remain one occurrence. The same event described through three lenses remains one occurrence. The respondent may identify two roots as the same event. Unknown distinctness cannot be upgraded to independent recurrence.

Store `recall_mode = actual_event | usual_tendency | imagined_expectation`. Distinguish a **recalled expectation held at the time** from an imagined present counterfactual: the former is real evidence of an expectation, not proof of the predicted outcome. Typical-tendency answers can support “you describe this as usual,” not an actual chronology.

A sequence edge has `before`, `after`, `simultaneous`, `alternating`, or `order_unknown`. Source screen order is never temporal evidence. “First noticed” is not causal precedence. Same-episode observations attach to `first`, `next`, `during`, `later` or `recovery` step records. Do not attach the immediate relief of the second move to the first move.

An edge may exist without a handoff. A handoff needs a change in what the responses were doing or a change in response organization—not merely two different selected actions. A manager-to-firefighter interpretation additionally needs the role evidence at each endpoint.

## 4. Functional inference: permission, not a demand for self-analysis

Do not make respondents explain every motive before a report can be useful. A report may infer a present function when timing, situation, effect and a useful contrast discriminate it from alternatives. It must preserve whether the aim was stated or inferred.

Two permitted routes:

**Stated-function route:** an action plus context plus a reported preventive or relief-seeking aim, with scope and relevant constraints retained.

**Converging-function route:** the action, timing and consequences repeat in a discriminating way, with an actual contrast or another relevant observation supporting the inferred function. An effect alone is not enough. A pleasant consequence can be incidental; a response with no consciously intended aim can still have an inferable function.

Example: preparation occurs before two reviews; after the work meets the standard, preparation continues; stopping follows a sign of acceptance rather than task completion. A report can infer that preparation is also seeking assurance, even when the respondent never selected the words “approval-seeking manager.” The report cannot invent feared childhood rejection, a quoted inner voice, or an unreported body signature.

Multi-step reasoning is allowed. Each consequential step needs evidence and its own uncertainty status. An unresolved hypothesis cannot be promoted to a premise simply because another paragraph repeats it.

## 5. Missingness and disagreement

Keep separate: not administered, declined topic, skipped, no recalled event, not applicable, unsure, none fit, usual tendency, order unknown, and substantive no change/no cost/no fear. Unselected choices are unknown, not denials.

A correction can change the remembered action, its interpretation, context, episode grouping, or the name. Those are different revisions. Rejecting a name does not refute the action; rejecting an inferred motive does not erase an action; agreement with a summary is not a new occurrence. Do not interpret rejection as resistance, denial or a hidden protector.

## 6. Evidence dependence and selection bias

Record a shared `dependence_group` for all observations from an occurrence. Store the administrative reason a question was selected: common coverage, user-selected topic, response discriminator, comparison, or correction. Ten selectively administered attachment questions do not establish that attachment dominates someone’s life.

Do not compare raw category counts across differently routed respondents. Do not infer prevalence from “most of the answers.” Counts are used to manage coverage and provenance only. A selected easier exception is useful for comparison but is not a random sample of ordinary life.

## 7. Work split

The deterministic assessment runtime chooses authored questions, enforces eligibility, binds episodes, projects literal selections, updates structural coverage and records unresolved targets. It does not have to discover a final named protector online.

The report writer receives observations, sequences, contrasts, structural readiness and open alternatives. It may discover an interpretation not prelisted by the router, provided the evidence can support it. It creates a claim ledger and stable working names. Runtime validates references, scope, version bindings and schema; a semantic reviewer evaluates whether the interpretation is actually justified. Structural validation alone cannot certify psychological truth.

This avoids both earlier failures: a model forced to repeat sterile classifications, and a model encouraged to invent a whole inner biography from one action.
