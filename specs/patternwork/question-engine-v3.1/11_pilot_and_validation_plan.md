# Patternwork Question Engine v3.1 — Pilot and Validation Plan

Status: prospective plan; the instrument is **not yet validated**  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`

## 1. Validation objective and claim boundary

The purpose of validation is to test whether the engine reliably collects, preserves, and summarizes the kinds of evidence it claims to collect: recognizable episodes, user-specific language, timing and function, repeated multichannel body-and-action signatures, relationship-specific sequences, contradictions, resources, and confidence limits.

The program will not seek diagnostic sensitivity/specificity, clinical cutoffs, a global attachment style, trauma or developmental origins, or physiological validation of vagal states. There is no assumed total score and no justification for a single internal-consistency coefficient across the package. Validation evidence must be attached to a specific version of the bank, router, scoring rules, schema, and writer.

## 2. Study governance, preregistration, and version control

Before the first participant is enrolled:

1. register the intended sample, recruitment strata, primary endpoints, exclusions, stopping rules, qualitative coding framework, missingness taxonomy, subgroup analyses, and decision gates;
2. freeze identifiers and versions for bank items, option libraries, router, scoring manifest, schema, writer templates, and model prompts;
3. create a change log that distinguishes wording-only, routing, scoring, schema, and interpretation changes;
4. treat any change to safety routing, evidence floors, user confirmation, quote provenance, typed `report_impact`, snapshot binding, or report language as a new validation version;
5. maintain a blinded holdout set for any LLM-assisted coding or adaptive-selection tuning;
6. preregister which analyses are confirmatory and label all unplanned analyses exploratory;
7. establish adverse-experience review, privacy/retention, withdrawal, redaction, and model-data-use procedures before collecting typed text.

The initial studies should use research consent language that states: self-understanding, non-diagnostic, self-report rather than physiology, optional skip/pause, fictional or identifying labels permitted, and no requirement to discuss unsafe relationships or origins.

## 3. Staged program

| Phase | Suggested sample | Main question | Advance gate |
|---|---:|---|---|
| 0. Technical preflight | synthetic cases plus 20–30 scripted edge cases | Do manifests, routing, schema, traceability, and safety invariants execute as specified? | Zero unresolved hard-invariant failures; all packets parse and validate; all IDs resolve; every high-intensity route ends safely. |
| 1. Expert content review | 8–12 reviewers | Are fields, inferential limits, safety, accessibility, cultural assumptions, and report claims content-valid? | No unresolved critical safety/overreach item; median relevance/clarity ≥3 on a 4-point scale for each required evidence field; content-validity concerns adjudicated. |
| 2. Cognitive interviews | 24–36 participants over 3 iterative rounds | Do people recognize moments, understand horizons/options, retain ownership of wording, and distinguish actual from ideal behavior? | At least 85% correct paraphrase for key instructions; no systematic framework leakage; no item-level severe burden cluster; saturation of major comprehension problems. |
| 3. Instrumented feasibility pilot | 120–200 participants | Does the adaptive engine obtain coverage without unsafe or monotonous routing, and where does missingness arise? | Hard routing invariants 100% with zero observed violations; packet/schema/referential validity 100%; interpretable missingness; acceptable burden and completion under the gates below. Any hard-invariant failure blocks advancement until corrected and replayed. |
| 4. Coding and report fidelity | 200–300 packets, enriched for typed text and contradictions | Do humans and the LLM produce stable evidence fields, abstain appropriately, and write only traceable claims? | Agreement, quote, contradiction, and unsupported-section gates met on held-out data. |
| 5. Temporal and cross-method studies | 200–400 participants; stable-context retest subset 150–250 | Are appropriate fields stable when context is stable, change-sensitive when context changes, and convergent with diaries/interviews? | Prespecified field-level stability and convergence without forcing trait interpretation. |
| 6. Adaptive stopping simulation | logs from phases 3–5; at least 1,000 replayable sessions if feasible | Does the stop rule preserve supported sections, contradictions, and safety while reducing low-value questions? | False sufficiency and lost-contradiction rates below gates; no subgroup loses required coverage. |
| 7. Later item-selection calibration | only after stable content and adequate multi-site/diverse sample | Can routing predict coverage gain and burden more accurately without changing interpretive floors? | Out-of-sample gain with unchanged safety, fairness, evidence, and confidence constraints. |

Sample sizes are planning ranges, not fixed claims of power. Final sizes should follow preregistered precision or power calculations using phase-2/3 variance and prevalence estimates.

## 4. Phase 0 — Technical and synthetic preflight

Build scripted cases for: no applicable relationship, unsafe/coercive context, low interoception, nonverbal inner mode, repeated skip, contradiction by person/horizon/intensity/time, selected supplied wording versus typed wording, single body sensation only, one mapped episode, conflicting repair directions, no repair offered, early stop, and a full high-confidence path.

Required automated tests:

- every administered field is declared by a versioned manifest and maps only to schema-valid fields;
- no bank item duplicates a stable ID;
- no quote becomes eligible from `selected_option` capture;
- confirmed parts have identity confirmation and required episode anchors;
- state signatures meet repeated multichannel plus entry/exit/recovery floors;
- attachment patterns resolve to a named referent with safety/reliability context;
- unresolved `cap_low` contradictions cap affected claims at low and `omit_claim` contradictions exclude affected claims;
- Green coverage is medium/high and Red coverage is unsupported;
- all 35 coverage cells are present in order;
- every report paragraph has section, evidence IDs, response IDs for quotes, confidence, contradictions/limits, and writer version;
- body map, rupture, high arousal, stop, pause, and “too much” routes cannot lead directly to another high-intensity item or final peak ending;
- early-stop reports contain no personalized filler for unsupported sections.

Any failure of diagnosis/origin/physiology/global-style prohibitions, quote attribution, unsafe-context handling, or resource-ending logic blocks human pilot launch.

## 5. Phase 1 — Expert content review

Recruit reviewers with complementary expertise: self-report measurement and psychometrics; qualitative/response-process methods; trauma-informed and relationship-safety practice; IFS-informed, polyvagal-informed, and attachment-informed scholarship without requiring theoretical endorsement; neurodivergent and disability accessibility; cross-cultural psychology; plain language/health literacy; data privacy; and LLM evaluation.

Each reviewer rates every report evidence field and a balanced sample of items on a 4-point relevance and clarity scale. Calculate item- and scale-level content validity indices as descriptive review aids, not proof of construct validity. Reviewers also tag:

- direct versus inferred versus confirmatory ambiguity;
- option omissions or obviously favored responses;
- context that could make the same action proportionate;
- cultural, socioeconomic, gender, family, disability, relationship-form, touch, or communication assumptions;
- unsupported framework specificity;
- possible burden or unsafe routing;
- whether the required evidence is actually sufficient for the allowed report language.

Decision rules:

- any critical safety, coercion, diagnosis, origin, physiology, or quote-provenance problem is fixed and re-reviewed before pilot;
- any evidence field with item-level content-validity index below 0.78 receives revision or documented rationale and a second review;
- disagreements about theoretical labels are resolved in favor of direct, descriptive, framework-limited language unless the user explicitly confirms the stronger term.

## 6. Phase 2 — Cognitive interviews and usability

### 6.1 Sampling

Use three rounds of approximately 8–12 participants. Purposefully vary age, education and reading comfort, culture/language background, race/ethnicity, gender and sexuality, relationship structure, disability, self-identified neurodivergence, interoceptive access, inner-speech mode, screen-reader/reduced-motion use, family applicability, employment/evaluation context, and current relationship stability. Do not recruit solely from therapy-oriented or framework-familiar communities.

### 6.2 Procedure

Use a mixture of retrospective probing and selective think-aloud. Think-aloud should not be used during the most emotionally intense recall screens because it can change the response process. Ask participants to paraphrase:

- what time horizon the item asked about;
- whether a selected phrase would be treated as their exact words;
- what “same pattern,” “different,” and “not enough access” meant;
- what a body map does and does not claim;
- why a relationship-safety question appeared;
- whether “actual behavior” felt different from an ideal-behavior question;
- what they thought would happen after skip, pause, or contradiction.

Probe recognition time, memory availability, response fit, judgment/desirability, option overload, hidden cultural assumptions, framework leakage, emotional aftereffect, and whether the ending felt sufficiently ordinary or resource-oriented.

### 6.3 Metrics and gates

- key-instruction paraphrase accuracy ≥85% overall and no subgroup below 75% without a documented accessible variant;
- ≤10% of users incorrectly believe a selected supplied phrase may be quoted as their words;
- ≤15% spontaneously perceive ordinary “part of me” wording as the assessment imposing separate inner entities; if exceeded, revise per `QA-C01`;
- median item-level burden ≤3 on a 5-point scale; any severe-burden cluster is reviewed regardless of median;
- no recurring report that skip/pause feels like failure or that a safer/direct/connected option is visibly rewarded;
- qualitative saturation: no new high-severity comprehension or safety issue in the final 6 interviews of a round.

Translations are validated separately using team translation, cognitive interviewing, and concept review. Literal back-translation alone is insufficient, especially for inner voice, felt rules, relationship roles, and body qualities.

## 7. Phase 3 — Feasibility, missingness, response distributions, safety, and burden

### 7.1 Instrumentation

Log without unnecessary content exposure: immutable snapshot ID/revision, structured window, administration order, item eligibility, presented option order, response/skip/pause, response time, edits, backtracking, accessibility mode, burden/arousal check, family/form history, coverage gain, independent episode count, contradiction opened/resolved and typed `report_impact`, route absence, coverage N/A reason, Mapping-Summary completion, optional Pass-2 uptake, route decision, resume, and ending type. Typed text must be access-controlled and redacted for analysis when possible.

### 7.2 Missingness analysis

Distinguish at minimum:

- not applicable;
- not asked because adaptive coverage was already sufficient;
- no accessible memory;
- not sure/low certainty;
- skipped topic;
- paused/stopped;
- renderer/accessibility failure;
- safety-context suppression;
- early stop;
- technical loss.

Model item-level and field-level missingness using descriptive rates and multivariable models that include burden, topic, stage, accessibility mode, referent type, safety context, and subgroup variables. Do not treat missingness as zero or as evidence of a pattern.

Decision gates:

- eligible-item completion ≥85% overall;
- no unexplained subgroup gap greater than 10 percentage points in completion or pause after adjusting for topic intensity;
- non-packet technical telemetry loss <0.5%, with a target of 0%; schema-invalid packets, broken evidence references, or loss of a completed raw response require 100% compliance and zero observed failures, and any occurrence blocks advancement until corrected and successfully replayed;
- any item with `none/unclear` >25%, skip >15%, or median response time above twice its family median receives qualitative review, not automatic deletion;
- hard routing invariants require 100% compliance and zero observed violations. Any occurrence of more than two high-arousal interactions in succession, more than two uses of one family within five completed screens, a missing mandatory low-intensity/resource recovery, an unsafe-context interpretation bypass, continued deepening after stop/pause/“too much,” or an equivalent hard-block failure stops advancement. The defect must be corrected and all affected and adjacent routes replayed successfully before the phase can continue. Empirical quality indicators such as response time, option fit, and burden retain their separately stated review thresholds; they do not weaken this zero-tolerance hard-invariant gate.

### 7.3 Response distributions and option balance

For categorical options, examine endorsement, entropy, floor/ceiling concentration, option-order effects, and differential option functioning across relevant subgroups. For ranks/maps, inspect unusable combinations, nonresponse by region/mode, and whether intensity bands are used meaningfully. For sliders or pace bands, inspect heaping and “not measurable this way.”

Rare options are not removed solely for rarity if they prevent forced misclassification or serve a safety/accessibility function. High-frequency neutral options are not treated as low-information when they define ordinary baseline or secure exceptions.

### 7.4 Safety and burden monitoring

Track distress increase, “too much,” pause, early stop, return after pause, end-state rating, and whether the mandated resource/ordinary screen was completed. A designated reviewer examines all reports of coercive/threatening context for routing compliance, without adjudicating whether abuse occurred.

Preregister descriptive distributions of completed screens and elapsed administration time by pass/stage, mapping-summary completion, optional Pass-2 uptake, coverage progression per screen, and marginal coverage/uncertainty gain against burden. These measures inform a later session policy; this release asserts no maximum session length or item count.

Advance only if:

- 100% of completed high-intensity paths end on resource, ordinary-state, user-controlled pause, or save;
- no automated report pathologizes a context-linked safety response;
- serious adverse experiences attributable to avoidable wording/routing are reviewed and mitigated before the next phase;
- median session burden is ≤3/5 and at least 80% of completers say the sequence felt understandable and under their control.

## 8. Phase 4 — Human and human–LLM coding agreement

### 8.1 Unit and codebook

The unit is an attributable text or episode field, not a whole person. The codebook covers: trigger, referent, horizon, inner modality, typed wording provenance, impulse, overt action, feared outcome, payoff, three cost domains, body direction/quality, speech/movement/orientation/social access, repair direction, reassurance uptake, contradiction type, and abstain/insufficient evidence.

Two trained human coders independently code a stratified sample of at least 300 text segments and 100 full episode chains, enriched for ambiguity, negation, correction, nonverbal modes, unsafe context, and low certainty. A third coder adjudicates after independent coding.

Report per-field:

- raw agreement;
- Cohen's kappa for two coders or Fleiss' kappa for more coders where appropriate;
- Krippendorff's alpha when missing/variable coder coverage matters;
- Gwet's AC1/AC2 when prevalence makes kappa misleading;
- macro precision, recall, and F1 for multi-class extraction;
- exact-match and span-overlap for typed excerpts;
- abstention precision and recall;
- confusion matrices, especially direct versus inferred and quote-eligible versus not eligible.

Initial gate: agreement coefficient ≥0.70 for interpretive fields and ≥0.80 for quote provenance, referent, horizon, safety context, and correction status. Fields below gate return to codebook and item revision; no aggregate average may hide a failed critical field.

### 8.2 Human–LLM evaluation

Freeze the model, system prompt, tool/schema configuration, temperature, and writer/scoring version. Evaluate on a held-out set not used in prompt or router tuning. Compare the LLM to adjudicated human labels, but also compare each human to the adjudication so model performance is not interpreted beyond human clarity.

Required LLM gates:

- quote-provenance false-positive rate = 0 on the held-out set;
- diagnosis/origin/physiology/global-style forbidden-claim rate = 0;
- unsupported personalized filler rate = 0;
- macro F1 ≥0.80 for direct field extraction and ≥0.75 for bounded candidate coding, with critical fields reported separately;
- contradiction detection recall ≥0.90 for the enriched contradiction set;
- abstention precision ≥0.90 when evidence is insufficient;
- every generated claim resolves to valid evidence IDs and every quote to response IDs.

If a model fails a critical gate, human review is mandatory for the affected function until the model/version passes a new held-out evaluation. Agreement does not establish psychological truth; it establishes reproducibility of the declared coding rules.

## 9. Phase 5 — Test–retest and cross-method convergence

### 9.1 What may be retested

Test–retest is appropriate for fields expected to be stable over a short interval when context is stable: referent relationship context, typicality, confirmed identity fit, repeated strategy sequence, pace thresholds, ordinary baseline range, and resource conditions. It is not appropriate to demand stability from one-off episode details, current arousal, a changed relationship, a new stressor, or actual repair behavior that did not recur.

Use a 7–21 day interval and ask directly whether relevant context, safety, sleep/pain/medication, relationship events, and life demands changed. Estimate:

- weighted kappa for ordinal/categorical fields;
- intraclass correlation for genuinely continuous bands, with the ICC model declared;
- percent exact and adjacent agreement for thresholds;
- Jaccard or set-overlap for multiselect body regions/channels;
- sequence similarity for ordered actions;
- identity/fit transition tables rather than forcing a stability coefficient when users split, merge, or correct a pattern.

Target gates for stable-context cases: weighted kappa/ICC ≥0.60 for contextual pattern fields and ≥0.70 for confirmed high-confidence profile fields. Lower stability triggers response-process review; it does not prove unreliability if the direct change indicators show genuine change.

### 9.2 Cross-method convergence

Use methods with different error structures:

- 7–14 day event-contingent micro-diaries for cue, first signal, first action, other response, and residue;
- a semi-structured episode interview coded blind to the engine output;
- optional user-provided behavioral records such as message timing only with explicit consent and without interpreting content or intent;
- established self-report measures only for broad, non-diagnostic convergent/divergent hypotheses, not as gold standards for parts, physiology, or a global style.

Prespecify narrow hypotheses, for example: engine-reported first action should agree with diary first action more than with a nonmatching action; relationship-specific patterns should converge more strongly within the same referent than across referents; confirmed resource conditions should predict more reported choice in comparable diary episodes. Use mixed models or generalized estimating equations to account for repeated episodes nested within people.

Report convergent and discriminant evidence with confidence intervals. Do not require perfect agreement: the engine and diary may sample different cues, and interviews may change recall. A practical advance gate is directionally correct, statistically compatible convergence on at least 75% of preregistered field-level hypotheses, with no evidence that the method collapses referent or horizon distinctions.

## 10. Subgroup fairness, accessibility, and cultural validity

Define fairness as equal opportunity to express applicable evidence, receive uncertainty/skip routes, avoid overclaiming, and obtain comparable traceable report quality—not equal distributions of psychological responses.

At each phase, compare:

- eligibility-to-completion, skip, pause, and early-stop rates;
- use and success of accessibility modes;
- “none fit,” text-edit, and correction rates;
- burden and response time;
- evidence coverage and confidence after accounting for applicability and chosen depth;
- unsafe-context suppression and false trait language;
- coding accuracy, contradiction recall, and quote-provenance errors;
- report usefulness and felt ownership.

Priority groups include screen-reader and reduced-motion users, people with low interoceptive access or nonverbal inner experience, self-identified neurodivergent users, varied literacy, multilingual users, cultures with different norms for eye contact/directness/repair, nontraditional relationship and family structures, disabled users, and people with materially constrained or unsafe contexts.

Flag any adjusted gap greater than 10 percentage points, standardized mean difference above 0.20, or critical error occurring only or disproportionately in a subgroup. Investigate item functioning and response process before considering score-based DIF. Later, if a sufficiently large sample and a defensible latent dimension exist, use ordinal logistic DIF or multigroup models; do not force measurement invariance on heterogeneous episode evidence or a nonexistent global scale.

## 11. Adaptive stopping simulations

Use logged eligible-item sets to replay each session under alternative stop policies without changing the evidence floors. Compare the production candidate to conservative and ablated policies.

Primary outcomes:

- false sufficiency: stop declared before a required floor or unresolved `cap_low`/`omit_claim` contradiction is represented;
- false continuation: additional items add no coverage or uncertainty reduction relative to burden;
- lost contradiction rate;
- unsupported section inflation;
- number of high-intensity items and recovery compliance;
- achieved Green/intentional-Amber cells by applicable section;
- user corrections that would have been missed;
- total screens as a descriptive outcome, never the optimization target;
- subgroup differences in every outcome.

Decision gates on held-out replay:

- false sufficiency <2% overall and 0% for safety, quote, part-identity, state-floor, attachment-context, and contradiction hard rules;
- lost `cap_low` or `omit_claim` contradiction <2%; target 0%;
- no increase in unsupported personalized prose;
- at least 95% of final high/medium sections match the conservative policy's defensible sections;
- median screen reduction of at least 10% only if burden ratings improve or remain noninferior and no subgroup's defensible coverage falls by more than 5 percentage points;
- 100% compliant resource/ordinary endings.

The router may stop earlier because evidence is sufficient, never because an arbitrary maximum item count was reached. A user-directed stop always remains available and produces transparent underdetermined sections.

## 12. Later calibration for item selection

Only after content, response process, safety, and coding are stable should item-selection parameters be estimated. The target is expected coverage gain and uncertainty reduction conditional on burden, not diagnosis or a single latent severity score.

Candidate methods include:

- empirical transition models for probability that an eligible item fills a specific missing field;
- multilevel models for response availability, burden, and replication gain by domain/form;
- constrained contextual bandits evaluated offline, with hard safety and evidence floors outside the learned policy;
- IRT or item-response trees only for coherent, narrow dimensions with defensible ordered responses; never for the whole engine or for inferred parts/states;
- calibration of confidence language against observed replication/confirmation and coding error, not against a diagnostic outcome.

Use nested cross-validation or temporal/site holdout. Report calibration curves, Brier score or log loss for predicted field gain, decision-curve comparisons, subgroup calibration, and policy regret under the constrained objective. Learned selection can rank only already-eligible items; it cannot waive prerequisites, route into unsafe content, promote quote eligibility, or create a report claim.

## 13. Decision ledger and release claims

At every version gate, publish a concise evidence ledger:

- artifact versions tested;
- participant and episode scope;
- preregistered versus exploratory analyses;
- all critical and noncritical gate results;
- subgroup coverage and known blind spots;
- items/modules revised or retired and why;
- unresolved contradictions in the validation evidence;
- the exact claims supported and claims still prohibited.

Allowed progression of claims:

1. **After phases 1–2:** “Content and response processes were reviewed in the sampled groups.”
2. **After phases 3–4:** “The engine executed its routing, evidence, provenance, and coding contracts with the reported performance in the pilot.”
3. **After phase 5:** “Specific fields showed the reported stability and cross-method convergence under the sampled contexts.”
4. **After phases 6–7:** “The adaptive policy reduced burden or increased evidence gain under constrained held-out evaluation.”

None permits: “validated diagnostic,” “measures vagal physiology,” “reveals trauma/origins,” “determines attachment style,” or “works equally for everyone.”
