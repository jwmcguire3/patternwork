# Patternwork Question Engine v3.1 — Report-Writer Contract

Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2`  
Integrity contract: `PWQE3-INTEGRITY-1`

## 1. Writer role and input boundary

The report writer turns a schema-valid `ReportEvidencePacketV3_1` into one IFS-informed, polyvagal-informed, or attachment-informed self-understanding report. The normal Pass-1 product is a separate framework-neutral `MappingSummaryArtifact` using `MAP-01`–`MAP-08`; Pass 2 deep reports are optional. Writers summarize evidence; they do not score raw answers, discover hidden causes, or complete missing profiles.

The writer may use only:

- structured `EpisodeEvidence`, `PartProfile`, `StateSignature`, and `AttachmentPattern` objects included in the packet;
- the packet's `CoverageMatrix`, section confidence, contradiction records, applicability, and limits;
- `SelectedExcerpt` records with response/evidence provenance;
- relationship context, time windows, confounds, and administrative scope present in the packet.

It must not receive or interpret a flat raw-answer list. If raw answers appear outside selected attributable excerpts, ignore them and record an input-contract violation. Every substantive sentence must be derivable from packet fields. Every substantive paragraph must end with or carry a machine-readable citation list of evidence-object IDs; exact quotations additionally cite source response IDs.

## 2. Required paragraph traceability

For each report paragraph, retain a companion trace record:

```text
paragraph_id
report_section_code
claim_ids
supporting_evidence_ids
supporting_response_ids (required for quotes)
confidence
contradiction_ids
limits_applied
writer_template_version
```

A paragraph may combine claims only when their evidence and confidence are compatible. The paragraph confidence is no higher than its least-supported contributing claim. A paragraph that mentions an unresolved contradiction carries that contradiction ID and typed `report_impact`. `omit_claim` is not rendered; `cap_low` is low confidence and synthesis-ineligible; `qualify` carries its limit. Section headings and purely navigational prose do not need evidence citations; scope and limitation statements cite coverage/packet metadata.

Evidence IDs must be visible in an appendix, footnote, hover, or equivalent audit view. The reader-facing prose may remain uncluttered, but trace records cannot be dropped during rendering or export.

## 3. Confidence-to-language contract

Confidence labels control what can be said, not merely how certain it sounds.

| Confidence | Allowed claim form | Required qualification | Disallowed |
|---|---|---|---|
| `high` | State a repeated, user-confirmed pattern within its evidenced contexts: “Across two episodes, this pattern tended to…”; “You confirmed that these moments feel like the same protective part.” | Name context, horizon, and meaningful exceptions. Use “tended to,” “in the episodes described,” or equivalent when the evidence is not universal. | “Always,” “who you are,” certainty about cause, diagnosis, physiology, or another person's motives. |
| `medium` | State an evidence-backed working pattern: “The available evidence suggests…”; “In the episode described and your later confirmation…”; “A working label for this cluster is…” | Identify whether support came from replication or confirmation and retain relationship/time boundaries. | Presenting the claim as settled, global, causal, or identity-defining. |
| `low` | Report only the observation and competing possibilities: “One episode may point to…”; “This could reflect X, although Y remains plausible”; “The evidence is mixed about…” | Name the single context, ambiguity, missing replication, or open contradiction. Prefer a question or underdetermined note to a synthesized label. | Naming a distinct part, classifying a state, assigning an attachment dimension/style, or resolving a contradiction. |
| `unsupported` | No substantive interpretation. Optional status line: “There was not enough evidence to describe this area.” If useful, name the missing evidence in ordinary language. | Preserve not-applicable versus not-asked versus skipped versus insufficient-memory distinctions. | Generic filler, population-level advice masquerading as personalization, extrapolation from adjacent sections, or invented examples. |

Confidence is not displayed as a probability. The writer cannot raise packet confidence because prose appears coherent, lower it because a pattern is unusual, or use numerical scores to bypass evidence floors. An open `cap_low` contradiction caps the affected claim at low unless the packet explicitly records a context-bounded resolution. An `omit_claim` contradiction excludes the affected claim.

## 4. Evidence-bound wording rules

### Frequency and generality

- Use “in this episode” for `direct_single` evidence.
- Use “across the episodes described” only for `replicated` evidence.
- Use “across these relationships/domains” only for `cross_context` evidence and name the contexts.
- Use “you confirmed…” only when confirmatory provenance exists.
- Do not turn `typicality`, frequency, or intensity into a universal trait. Preserve the time window.

### Identity and labels

- `confirmed_part` may be called a part only when the packet records identity confirmation and the section confidence permits it.
- `confirmed_pattern_cluster` and `tentative_cluster` are called “pattern,” “cluster,” or “possible pattern,” not parts.
- A generated name must be present in `working_label`, follow function + feared outcome + trigger domain, and be introduced as a working label. A user label may be described as the user's name for it.
- Rejected candidates are not reported as active entities. They may appear only in the confidence/limitations section when the correction itself matters.

### Protective role and function

- Manager/firefighter wording requires direct timing and function evidence. Manager language is anticipatory/preventive; firefighter language is urgent/reactive after activation breaks through; aftermath is kept separate.
- The same outward behavior may receive different descriptions across horizons. Never classify from behavior alone.
- Protective intent, feared outcomes, and protected feelings must be directly reported or explicitly confirmed. Inferred candidate functions stay conditional.

### State signatures

- Use “self-reported state signature,” “body-and-action pattern,” or “signature consistent with activation/deactivation/mixed shifting.”
- A state claim must reflect multivariate, repeated evidence and the packet's entry/exit or recovery floor. List the reported body, breath, speech, movement, orientation, social, and timing features that actually support it.
- Baseline and connected/resource evidence are described alongside distress signatures when supported.
- Never say the instrument measured vagal tone, ventral/dorsal vagal activity, sympathetic output, heart-rate variability, nervous-system damage, or biological dysregulation.

### Attachment patterns

- Attachment statements are referent-specific. Use “with `referent label/type`…” and preserve the relationship's safety/reliability context.
- Anxiety and avoidance are dimensions, not a global style or diagnosis. Report an estimate only at packet confidence and never from one cue unless explicitly confirmed, in which case keep the claim medium and referent-specific.
- Preserve the sequence: cue → first interpretation → body shift → proximity/deactivation impulse → overt move → other response → next move → residue/repair.
- Working-model attributions are the user's first meanings, not facts about the user or the other person.
- Protest, distancing, vigilance, or non-repair in unsafe, coercive, threatening, unreliable, or unstable contexts must be framed as context-linked and potentially proportionate. The writer cannot pathologize it.

### Exceptions and regulation

- Secure/resource exceptions define conditions and scope; they do not cancel the usual pattern or prove a secure attachment style.
- Regulation channels are reported as self-reported effects in specific states/contexts. “Helped the body shift,” “provided short-term distraction,” “did not help in that episode,” and “felt aggravating” are permitted when supported.
- Never issue treatment instructions or label a channel healthy/unhealthy. A useful short-term suppressive or distracting effect may be stated alongside later costs if both are reported.

## 5. Exact-quote contract

Quotation marks are allowed only when all of the following are true:

1. the text appears in a `SelectedExcerpt` or `AttributedText` record;
2. `quote_eligible` is `true`;
3. `quote_basis` is `typed`, `edited`, or `explicitly_confirmed`;
4. at least one source response ID and one supporting evidence ID are present;
5. the excerpt is allowed for the target section code;
6. the wording is reproduced exactly except disclosed redaction of identifying detail.

Selected prewritten option text is never a quote merely because the user chose it. It may be paraphrased as a categorical response without quotation marks. The writer must not clean up grammar inside quotation marks, combine fragments from different responses into one quote, convert an image/urge/blankness into invented words, or silently translate a quote. Ellipses and bracketed clarifications are allowed only when they do not alter meaning and the trace record retains the full source.

If quote provenance is incomplete, paraphrase the supported meaning and omit quotation marks. If the user's exact wording is sensitive or identifying, prefer a faithful paraphrase; provenance still stays in the audit record.

## 6. Absolute prohibitions

The writer must never:

- diagnose or imply a mental, personality, attachment, trauma, dissociative, compulsive, addictive, neurodevelopmental, or medical disorder;
- infer trauma, childhood events, developmental origin, caregiver cause, attachment history, or why a pattern first formed;
- identify an exile, infer an exile's age/history/content, or treat pressure on a protected feeling as evidence of hidden trauma;
- claim to measure autonomic/vagal physiology, biological state, or medical dysfunction;
- state that a body confound caused a pattern; confounds only limit interpretation;
- assign one global attachment style from one or multiple relationships; cross-context evidence permits a bounded similarity statement, not a total identity;
- infer the inner state, intention, diagnosis, or character of another person;
- create part biographies, voices, fears, rituals, stopping rules, payoffs, costs, body sensations, sequences, or exceptions absent from structured evidence;
- treat a strategy as a distinct part without user identity confirmation;
- treat missingness, refusal, uncertainty, low interoception, or “it depends” as evidence for a pattern;
- overwrite unsafe/reliable-context qualifications with trait language;
- give clinical, medical, safety, or treatment advice as though produced by the assessment;
- use framework jargon to add specificity the packet does not contain.

These restrictions apply at every confidence level, including high.

## 7. Contradictions, corrections, and change

User corrections outrank proposed summaries but do not erase the original evidence. When a contradiction is resolved as a person, horizon, intensity, state, safety-context, identity, or change-over-time difference, report the bounded distinction if it is useful and cite the resolution evidence. Example: “Before evaluation, the pattern was preventive; once the result arrived, the response became urgent.”

When a `cap_low` contradiction remains open:

- do not choose the more dramatic, more frequent, or more theoretically tidy side;
- cap the affected claim at low;
- state both observations in neutral language and name the unresolved discriminator, or omit the claim if the distinction would confuse or overreach;
- cite the contradiction ID in the paragraph trace;
- list the area as underdetermined in the report's confidence section.

A later correction is described as current fit or change only when the packet establishes whether the earlier report was mistaken or the pattern changed over time. Otherwise say the accounts differ.

## 8. Unsupported, not-applicable, and early-stop behavior

For `unsupported` cells, omit interpretive prose. A report template may retain the heading only when structural continuity matters, followed by one neutral sentence such as “There was not enough evidence to describe repair reception.” It may optionally say what was missing: “This would require an episode in which repair was offered and your response to it was recorded.” It must not offer a generic description of what people often experience.

For coverage `not_applicable`, state the directly established section-level reason only if relevant and user-authorized; do not frame it as a deficit. Route/domain absence is not N/A and is not rendered as a missing personal feature. For skipped or paused areas, say they were not assessed or remain open—not that the user lacks the feature. For a Pass-1 Mapping Summary, include supported `MAP-*` sections, an underdetermined-area list, and an optional safe-resume/Pass-2 note. Do not estimate a completion time or imply a fixed number of questions remains.

An intentionally Amber section may be included only with its explicit packet limitation. If the limitation cannot be stated without overreaching, omit the substantive section.

## 9. Section-specific permissions

### IFS-informed sections

- `IFS-01`, `IFS-12`: scope, counts, windows, confidence, corrections, contradictions, and missing evidence only.
- `IFS-02`–`IFS-09`: report only fields present in profile/episode objects and at the confidence allowed; preserve cluster versus part status and time horizon.
- `IFS-10`: only present-focused, user-stated or confirmed pressure on feelings/vulnerabilities. The required phrase or equivalent is “without implying when or why this began.”
- `IFS-11`: access to curiosity, calm, compassion, and choice is evidence of available conditions, not a score of Self or character.

### Polyvagal-informed sections

- `PV-01`, `PV-11`: explicitly state self-report and confound limits.
- `PV-02`–`PV-08`: describe multivariate signatures and transitions only from state/episode evidence; do not map them to measured physiology.
- `PV-09`, `PV-10`: distinguish self-regulation, co-regulation, distraction/suppression, no effect, and aggravation according to reported timing and effect.

### Attachment-informed sections

- `ATT-01`, `ATT-12`: show relationship scope, safety/reliability, confidence, contradictions, and missing directions/cues.
- `ATT-02`–`ATT-09`: stay referent- and sequence-specific; do not substitute a style label for observed moves.
- `ATT-08`: distinguish user-initiated repair from other-initiated repair. Absence of an offered repair is not evidence of rejection.
- `ATT-09`: distinguish requesting reassurance from receiving it and from its actual uptake/residue.
- `ATT-10`: include only applicable closeness dimensions; do not assume touch, dependence, commitment, or contact preferences.
- `ATT-11`: cross-relationship language requires evidence from at least two referents and must report differences as well as similarities.

## 10. Required report structure

Each report includes:

1. title and plain-language non-diagnostic/self-report statement;
2. evidence scope: relevant windows, referents/domains, and limitations;
3. applicable substantive sections in stable section-code order;
4. exceptions/resources where supported;
5. confidence, contradictions, and underdetermined areas;
6. evidence trace appendix or linked audit view.

The user-facing report need not display framework codes in headings, but the render metadata and paragraph traces must retain them. The writer does not add a section solely to reach a target length. It ends with supported resource-oriented or ordinary material when available, not with a peak-activation vignette.

## 11. Input validation and failure behavior

Before writing, validate the packet against `08_data_schemas.schema.json` and verify:

- packet ID/type matches the requested report;
- all referenced evidence, response, contradiction, and section IDs resolve;
- coverage contains exactly the 35 stable section cells and the requested report's codes;
- quote eligibility and basis are internally consistent;
- every Green section is medium/high and every Red section unsupported;
- confirmed parts have identity-confirmation provenance;
- state claims meet the packet's repeated-signature floor;
- attachment claims have referent/safety context;
- required prohibitions are present.

On a schema or referential-integrity failure, do not improvise a report. Return an error listing invalid/missing IDs and affected section codes. On an isolated invalid excerpt, omit the quote and continue only if the underlying structured claim remains valid. On a confidence mismatch, apply the lower defensible confidence and flag the packet for correction; never silently promote it.

## 12. Pre-release audit

Release only if every substantive paragraph passes all checks:

- exact section code and paragraph trace exist;
- claims are within evidence scope and confidence wording;
- evidence and response IDs resolve;
- quotes meet provenance rules;
- context, horizon, referent, and time window are preserved;
- typed contradiction impacts and exceptions are not hidden;
- no origin, trauma, exile, diagnosis, physiology, other-person-motive, or global-style inference appears;
- unsupported sections contain no personalized filler;
- generated labels are explicitly working labels;
- the closing material is resource-oriented or neutral when supported.
