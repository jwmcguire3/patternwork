# Patternwork Question Engine v3.1 — Scoring Specification

Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2`  
Integrity contract: `PWQE3-INTEGRITY-1`

## 1. Purpose and separation

This specification governs transformation of raw interaction records into evidence objects and section coverage. It does not produce clinical scores or diagnoses. The question engine records responses; the scoring engine creates structured evidence with provenance, alternatives, and contradictions; the report writer consumes only a `ReportEvidencePacket`. It must not infer from a flat raw-answer list.

No aggregate number overrides episode detail. Dimension estimates and confidence are descriptive, evidence-bounded outputs. Missingness, skip, uncertainty, and not-applicable responses are never silently converted to zero.

## 2. Signal classes and precedence

- **Direct signal:** the user reports the relevant fact about a concrete episode, referent, threshold, or experience. Preserve source response IDs and wording provenance.
- **Inferred signal:** a reversible scoring-engine hypothesis assembled from direct fields. It must record the rule used, alternatives, and evidence IDs. It cannot alone make a section Green.
- **Confirmatory signal:** the user endorses, rejects, edits, merges, splits, or otherwise adjudicates a proposed interpretation. A correction has priority over the proposal it corrects.

Precedence is: user correction > explicit confirmation > direct episode report > structured inference > bank-option semantics. A selected prewritten phrase can be direct categorical evidence but is never a verbatim quote. Confirmation does not erase contrary direct evidence; it changes the candidate status and may create or resolve a contradiction record.

## 3. Universal raw record and scoring output

Every administered instance records `interaction_instance_id`, `family_code`, `bank_item_id`, `bank_item_version`, `session_id`, deterministic administration `sequence`, `stage`, `referent_id`, `episode_id` if assigned, structured window ID/revision, presented option IDs and order, responses by field with response IDs, typed/edited text, certainty, typicality, frequency, intensity where asked, completion state, skip/pause/uncertainty state, timestamps, burden/arousal band, and accessibility mode. Packets bind this administration provenance to an immutable snapshot ID/revision and canonical evidence/scope digests.

For every derived signal, store:

- `signal_id`, signal class, normalized field/value, source response IDs, source evidence IDs, rule/manifest version, referent, horizon, window, certainty, applicability, and quote eligibility;
- candidate target object and report-section codes;
- confidence contribution (`anchor`, `replication`, `confirmation`, `cross_context`, `contradiction`, or `limit_only`);
- competing interpretations and contradiction IDs;
- whether a human-readable claim is currently permitted.

Confidence is rule-based, not additive arithmetic. `High` normally requires replication plus confirmation and no unresolved `cap_low`/`omit_claim` contradiction; `medium` requires direct evidence plus replication or confirmation; `low` is single-context, indirect, ambiguous, or contradicted; `unsupported` has no adequate evidence. Special floors in the coverage matrix always apply.

## 4. Bank-item manifest contract

Every bank item instantiating a family supplies a versioned manifest. The manifest may narrow but never broaden the family contract. It declares:

1. stable `bank_item_id` (`{family}-{three digits}`), version, purpose, stage eligibility, burden and arousal band;
2. exact raw-field definitions, response mechanics, option IDs, quote-eligible text fields, applicability and uncertainty paths;
3. named referent requirements, episode reuse/new-episode rule, horizon, time window, trigger/domain, and safety prerequisites;
4. direct-signal mappings; separately labeled inference rules and confirmatory mappings;
5. target evidence fields and exact report-section codes;
6. prerequisites, replication/cross-item dependencies, contradiction discriminators, branches, recovery routing, and termination behavior;
7. prohibited inferences and any item-specific limits.

Unknown fields or undeclared mappings fail validation. A manifest cannot mark selected option text quote-eligible, classify physiology, create a confirmed part without identity adjudication, produce a global attachment style, or waive safety/context and replication floors.

## 5. Per-family scoring contracts

### `RL` — Referent Lock

- **Raw fields:** `referent_id`, user-facing label/role, relationship type, current relevance/applicability, contact/currentness, safety, reciprocity, predictability, coercion/threat/instability flags, context note, comparison-role designation, certainty, prefer-not-to-answer.
- **Direct signals:** named relationship context, applicable referents, safety/reliability confounds, safe comparison candidate, current versus historical relevance.
- **Inferred signals:** eligibility for relationship-specific branches; need to constrain interpretations to unsafe/unstable context; cross-context sampling gap. These are routing facts, not attachment conclusions.
- **Confirmatory signals:** user confirmation or correction of referent label, relationship type, and safety/context summary.
- **Sections:** `IFS-01`, `PV-01`, `PV-10`, `PV-11`, `ATT-01`, `ATT-02`, `ATT-11`, `ATT-12`.
- **Confidence contribution:** anchor for scope and context; confirmation for context framing; cross-context only when distinct referents later supply evidence. It never independently supports a pattern claim.
- **Dependencies:** precedes relational interpretation, `RMX`, `PCR`, `RRE`, and referent-specific `WMA`; “it depends” routes back to `RL`. Historical referents require an explicit applicable window.
- **Contradictions:** discrepant safety/currentness reports create a context contradiction; discriminate change over time, setting, or specific person rather than averaging.
- **Prohibited:** inferring attachment style, abuse, pathology, motive, or developmental cause; treating family role as biological, formative, safe, or currently relevant without the user's report.

### `MS` — Memory Snap

- **Raw fields:** concrete memory availability, referent, episode window/recency, domain, specific cue/trigger, embedded horizon, immediate selected response, typed alternative, actual behavior, certainty, typicality, intensity.
- **Direct signals:** episode anchor, cue, first noticed response/action, time horizon, recency, typicality, and uncertainty.
- **Inferred signals:** candidate protective strategy, candidate state/attachment branch, likely missing fields for deepening. All remain hypotheses.
- **Confirmatory signals:** later `FCF` confirmation that the snap belongs to a proposed sequence/profile; direct correction within the item.
- **Sections:** `IFS-02`, `IFS-03`, `IFS-05`, `IFS-07`, `PV-02`, `PV-03`, `PV-04`, `PV-06`, `ATT-02`, `ATT-03`, `ATT-04`.
- **Confidence contribution:** `direct_single` episode anchor. A separate episode with substantively similar features can contribute replication; multiple answers about the same memory cannot.
- **Dependencies:** deepen with `BDA`, `BTM`, `VFR`, `WMA`, or `RRE` according to the field gap; low memory availability routes to recognition or matrix formats without penalizing confidence.
- **Contradictions:** incompatible actions/horizons across episodes test person, horizon, intensity, or real change; do not force cluster coherence.
- **Prohibited:** inferring motive, body state, feared outcome, cost, attachment dimension, or part identity from one immediate choice; converting option prose into a quote.

### `BDA` — Before–During–After Strip

- **Raw fields:** before-state and anticipatory action; trigger; first hit; body/thought/urge; urgent response; actual first/second action; other-person response if applicable; payoff; aftermath; residue duration; repair/recovery; field-level certainty.
- **Direct signals:** temporal order, manager-like anticipation, reactive move, payoff/cost, aftermath, recovery, rupture sequence, and state transition fields actually reported.
- **Inferred signals:** candidate manager→firefighter handoff; candidate attachment cue→move→response pattern; candidate state entry/exit path.
- **Confirmatory signals:** user endorsement/edit of the rendered sequence in `FCF` or same-screen recap.
- **Sections:** `IFS-03`, `IFS-06`, `IFS-07`, `IFS-08`, `IFS-09`, `PV-03`, `PV-04`, `PV-05`, `PV-06`, `PV-07`, `PV-08`, `PV-09`, `ATT-02`, `ATT-05`, `ATT-06`, `ATT-07`, `ATT-08`.
- **Confidence contribution:** a complete sequence is a strong direct anchor but not replication. Confirmation or a separate aligned chain supports medium; two chains plus confirmation can support high subject to identity/state floors.
- **Dependencies:** `PIS` for actor identity, `BSP` for function, `BTM`/`FSR` for multivariate state signature, `RRE` for bidirectional repair, and `FCF` for final sequence fit.
- **Contradictions:** order reversals, different actors, or conflicting aftermaths trigger discriminator for horizon, intensity, referent, identity, or change over time.
- **Prohibited:** calling anticipatory behavior a manager or urgent behavior a firefighter without timing and function; diagnosing cycling; assuming blank cells mean no response.

### `BTM` — Body Topography Map

- **Raw fields:** map orientation; activated region IDs; deactivated/quiet/disappeared region IDs; qualities and intensity by region; whole-body energy direction; breath, heart awareness, muscle tone, temperature; accessibility/list alternative; low-interoception/uncertainty; episode and timing.
- **Direct signals:** self-reported region/quality map, energy direction, and body-channel features for a representative episode.
- **Inferred signals:** candidate activated, deactivated, mixed, or connected signature only when multivariate; candidate match to another episode map.
- **Confirmatory signals:** user confirmation/edit of a summarized state signature or map match.
- **Sections:** `IFS-06`, `PV-01`, `PV-02`, `PV-03`, `PV-04`, `PV-05`, `PV-06`, `PV-07`, `PV-11`.
- **Confidence contribution:** one map is `direct_single`; separate maps plus entry/exit or recovery evidence meet the normal state floor. User-confirmed repeated signature supports high absent contradiction.
- **Dependencies:** representative episode anchor; pair with `FSR` and `BDA`/`RSR`; route to a low-intensity/resource interaction after high-arousal mapping.
- **Contradictions:** activated and deactivated marks may be a valid mixed signature; test simultaneity, sequence, region, intensity, body confounds, and time rather than canceling them.
- **Prohibited:** physiological measurement claims; vagal-branch claims; classification from one region/sensation; causal claims about medication, pain, sleep, substances, or disease.

### `FSR` — First-Signal Race

- **Raw fields:** candidate modalities presented; first, second, and optional third signal; tie/simultaneous flag; latency; specific content linked to each; certainty; unavailable/blankness; episode ID.
- **Direct signals:** reported onset order among body, thought/rule, emotion, image, urge, action, or blankness; nonverbal modality availability.
- **Inferred signals:** candidate entry sequence; likely access route for later prompts; possible profile/state match.
- **Confirmatory signals:** user confirmation/edit of ordered summary.
- **Sections:** `IFS-04`, `IFS-06`, `PV-02`, `PV-03`, `PV-04`, `PV-05`, `PV-06`, `PV-07`.
- **Confidence contribution:** direct sequence anchor; repetition in a separate episode or explicit confirmation supports medium; stable repeated order plus confirmation supports high.
- **Dependencies:** episode anchor; `BTM` for regional detail, `VFR` for content, `BDA` for full transition.
- **Contradictions:** different first signals test context, state intensity, horizon, and whether signals were simultaneous; preserve legitimate variability.
- **Prohibited:** privileging verbal thought; treating blankness as shutdown by itself; inferring cause, diagnosis, or fixed processing style.

### `VFR` — Voice or Felt-Rule Capture

- **Raw fields:** selected option ID/text, modality (`words`, `felt_rule`, `image`, `body_impulse`, `action_urge`, `blankness`, `other`, `unclear`), typed text, edited option text, explicit accuracy confirmation, quote-consent/eligibility, episode, certainty.
- **Direct signals:** modality and selected semantic category; typed/edited wording; explicit confirmation status.
- **Inferred signals:** candidate rule/function/feared-outcome link and candidate cluster similarity, always reversible.
- **Confirmatory signals:** explicit endorsement of exact wording or later correction; only this or typed/edited text creates quote eligibility.
- **Sections:** `IFS-02`, `IFS-04`, `IFS-05`, `IFS-10`.
- **Confidence contribution:** direct content anchor; quote confidence is provenance-based, separate from psychological confidence. Repetition or confirmation supports medium/high section confidence.
- **Dependencies:** concrete episode and `BSP` before a feared outcome/function claim; `PIS` before attributing voice to a distinct part; `FCF` for final wording.
- **Contradictions:** competing voices may indicate different parts, horizons, or contexts; route to `PIS`/`PDL` rather than merge.
- **Prohibited:** quoting a selected prewritten option; forcing inner speech; inventing a voice, biography, exile, history, or protected vulnerability.

### `RLB` — Ritual Loop Builder

- **Raw fields:** available step IDs; ordered selected steps; custom steps; repetitions/conditions; start cue; interruption response; stopping condition; completion sense; immediate payoff; later internal/relational/functional cost; episode and certainty.
- **Direct signals:** actual ordered strategy, stopping rule, interruption effect, payoff, costs, and horizon.
- **Inferred signals:** candidate preventive/reactive function; candidate ritual cluster; possible maintenance loop.
- **Confirmatory signals:** user confirmation/edit of loop and stopping rule; later assignment to a profile.
- **Sections:** `IFS-02`, `IFS-03`, `IFS-06`, `IFS-07`, `IFS-09`.
- **Confidence contribution:** one loop is direct-single. Replicated sequence or confirmation supports medium; two episode anchors plus profile identity confirmation supports a high part dossier component.
- **Dependencies:** `BSP` for feared outcome, `PIS` for identity, `BDA` for horizon/cascade, `FCF` for fit.
- **Contradictions:** different stopping rules or payoffs test episode intensity, interruption, person/domain, and candidate split.
- **Prohibited:** labeling compulsions, addiction, disorder, or part role from the loop alone; presuming costs; treating interruption distress as diagnostic.

### `BSP` — Blocked-Strategy Probe

- **Raw fields:** usual strategy; hypothetical or remembered block; expected/remembered immediate consequence; unbearable/feared possibility; body/urge; confidence; alternative outcomes; whether safe/appropriate to imagine; skip/pause.
- **Direct signals:** consciously accessible feared outcome and stated protective function when the user supplies them; tolerance/uncertainty around strategy interruption.
- **Inferred signals:** candidate protective intent and protected vulnerability, explicitly marked inferred until confirmed.
- **Confirmatory signals:** user endorsement/edit of the proposed feared-outcome/function summary.
- **Sections:** `IFS-03`, `IFS-05`, `IFS-07`, `IFS-09`, `IFS-10`.
- **Confidence contribution:** remembered blocked episodes are stronger direct anchors than hypothetical forecasts. A direct result plus confirmation or replication supports medium; repetition plus confirmation supports high.
- **Dependencies:** an established actual strategy from `MS`/`BDA`/`RLB`; high-arousal responses require downshift routing; `PIS`/`FCF` for attribution.
- **Contradictions:** forecast differs from actual blocked episode; preserve both and prioritize direct episode evidence while testing context and timing.
- **Prohibited:** asking for or inferring exile identity, age, trauma, childhood cause, hidden content, or pathology; presenting a forecast as observed fact.

### `PIS` — Part Identity Sort

- **Raw fields:** candidate IDs and evidence summaries shown; decision (`same`, `related_allies`, `opponents`, `different`, `uncertain`, `reject`); merge/split mapping; rename/edit; rationale; profile status; certainty.
- **Direct signals:** user adjudication of candidate identity/relationship and user label.
- **Inferred signals:** resulting profile graph and redistribution of supporting episodes, subject to source preservation.
- **Confirmatory signals:** identity confirmation, rejection, correction, merge, split, and rename are first-class confirmatory evidence.
- **Sections:** `IFS-02`, `IFS-03`, `IFS-04`, `IFS-05`, `IFS-08`, `IFS-09`, `IFS-10`, `IFS-12`.
- **Confidence contribution:** required normal confirmation for a major distinct part. It cannot supply missing episode fields; a confirmed identity with one thin episode remains low/medium as appropriate.
- **Dependencies:** at least two candidates or a highly specific dossier; every shown claim traces to evidence IDs; post-split fields are reassessed rather than copied blindly.
- **Contradictions:** identity decisions conflicting with prior confirmations create a versioned correction/change record; discriminate real change versus earlier mismatch.
- **Prohibited:** coercing a parts ontology; creating identities from strategies; discarding rejected-candidate evidence; treating generated labels as discovered entities.

### `PDL` — Polarization Duel

- **Raw fields:** two user-language impulse/profile IDs; simultaneous/context condition; which arrives first; which wins; losing side's next move; alternation; cost; available third choice; certainty.
- **Direct signals:** user-reported conflict, order, dominance, losing response, and cost.
- **Inferred signals:** candidate polarization/alliance and handoff; possible mixed-state sequence.
- **Confirmatory signals:** endorsement/edit of the polarization summary or identity relation.
- **Sections:** `IFS-07`, `IFS-08`, `IFS-09`, `IFS-11`, `PV-05`.
- **Confidence contribution:** one duel is direct-single; a repeated conflict or confirmation supports medium; replicated profile-linked conflict plus confirmation supports high.
- **Dependencies:** user-language impulses from `VFR`/episodes; `PIS` for distinct identity; `BDA` for cascade; `SEF` for available-choice exceptions.
- **Contradictions:** winner/order varies; test horizon, intensity, referent, and state rather than score inconsistency.
- **Prohibited:** assuming each impulse is a distinct part; inventing motives for the losing side; interpreting internal conflict as disorder.

### `RMX` — Relationship Matrix

- **Raw fields:** concise cue ID; selected referent IDs; response per referent; not-applicable/insufficient-memory; intensity/certainty; safety/context overlay; optional explanation.
- **Direct signals:** referent-specific differences/similarities under the same cue and applicability.
- **Inferred signals:** cross-context candidate pattern, context moderation, relationship-specific attachment differences, co-regulation contrasts.
- **Confirmatory signals:** user endorsement/edit of a contrast summary.
- **Sections:** `ATT-01`, `ATT-02`, `ATT-03`, `ATT-04`, `ATT-05`, `ATT-06`, `ATT-07`, `ATT-08`, `ATT-09`, `ATT-11`, `ATT-12`, `PV-10`.
- **Confidence contribution:** separate referents can contribute `cross_context`, but each cell is not an independent episode unless tied to a concrete distinct memory. Confirmation can support medium for the contrast.
- **Dependencies:** completed `RL`; identical cue meaning and applicable context across columns; deepen cells with episodes before strong sequence claims.
- **Contradictions:** matrix contrast versus episode evidence tests cue specificity, currentness, safety, and typicality; episode evidence is not overwritten.
- **Prohibited:** global attachment style, ranking relationships as healthy/unhealthy, assuming differences are traits, or treating matrix selections as verbatim quotes.

### `PCR` — Pace Curve

- **Raw fields:** referent/context; applicable closeness dimensions; too-fast/workable/too-slow bands; current/ideal distinction if asked; uncertainty; conditional notes; threshold examples; certainty.
- **Direct signals:** self-reported pace thresholds by dimension and referent.
- **Inferred signals:** candidate proximity/deactivation sensitivity and contextual mismatch hypotheses; never trait conclusions alone.
- **Confirmatory signals:** confirmation/edit of summarized thresholds and exceptions.
- **Sections:** `ATT-02`, `ATT-06`, `ATT-10`, `ATT-11`.
- **Confidence contribution:** direct threshold anchor; multiple applicable dimensions plus confirmation or repeat support medium; stable replicated/confirmed thresholds support high.
- **Dependencies:** `RL`; dimensions rendered only when applicable; `RMX`/`SEF` to distinguish person/context; actual episodes for behavior claims.
- **Contradictions:** thresholds differ by referent or time; preserve as context-specific and test change rather than average.
- **Prohibited:** assuming touch, commitment, dependence, monogamy, cohabitation, or any closeness dimension is desired/applicable; equating preferred pace with attachment pathology.

### `RRE` — Rupture–Repair Exchange

- **Raw fields:** referent/safety; concrete rupture cue; initiator direction (`user`, `other`, `both`, `neither`); first interpretation/body shift; first and next moves; repair offer/action; reception; reassurance content and uptake latency; body/social change; residue; what helped/failed/aggravated; certainty.
- **Direct signals:** rupture response, repair initiation, repair reception, reassurance uptake, co-regulation effect, residue, and recovery sequence.
- **Inferred signals:** candidate protest/deactivation sequence; candidate state transition; candidate effective/aggravating channel.
- **Confirmatory signals:** user endorsement/edit of sequence, direction, and uptake summary.
- **Sections:** `IFS-07`, `IFS-09`, `PV-07`, `PV-08`, `PV-10`, `ATT-02`, `ATT-05`, `ATT-06`, `ATT-07`, `ATT-08`, `ATT-09`, `ATT-11`.
- **Confidence contribution:** one complete direction is direct-single. Sampling both applicable initiation directions plus repetition/confirmation supports high `ATT-08`; reassurance request and uptake are scored separately.
- **Dependencies:** `RL` safety; `WMA` for separated meanings; low-intensity/resource follow-up; `FCF` for fit. If no repair was offered, reception remains not observed, not refusal.
- **Contradictions:** offered-versus-received accounts, variable uptake, or repair differences test initiator, content, timing, safety, and state intensity.
- **Prohibited:** pathologizing non-repair in unsafe contexts; inferring intent of the other; treating requested reassurance as successful uptake; assuming touch/contact is regulating.

### `WMA` — Working-Model Attribution

- **Raw fields:** named referent; ambiguous cue; first meaning about self; first meaning about other; certainty for each; alternative interpretation; reachability/latency/conditions; next impulse/action; cue ambiguity check.
- **Direct signals:** user-reported attributions and alternative reachability in that cue/context.
- **Inferred signals:** candidate working-model pattern and anxiety/avoidance contribution, always referent- and cue-scoped.
- **Confirmatory signals:** confirmation/edit of attribution summary across cues.
- **Sections:** `ATT-02`, `ATT-03`, `ATT-04`, `ATT-05`, `ATT-06`.
- **Confidence contribution:** one cue is direct-single. Multiple cues or explicit confirmation supports medium; repeated referent-specific pattern plus confirmation supports high.
- **Dependencies:** `RL`; cue must be genuinely ambiguous; pair with actual move/response sequence (`BDA`/`RRE`) before behavioral conclusions.
- **Contradictions:** alternative meanings across cues test cue type, safety, current state, and real change; do not average self and other attributions.
- **Prohibited:** asserting attribution is true, mind-reading the other, diagnosing schemas, or generalizing beyond the referent without cross-context evidence.

### `RSR` — Regulation Sequence Ranking

- **Raw fields:** channels actually used; ordered use; timing relative to activation; body-change rating; distraction/suppression rating; immediate and later effect; state target; self- versus co-regulation actor; inaccessible/not-tried; aggravation; certainty.
- **Direct signals:** actual regulation sequence and self-reported effects, including useful distraction, failure, or aggravation.
- **Inferred signals:** candidate effective self/co-regulation channel, transition path, or channel-state match.
- **Confirmatory signals:** confirmation/edit of effective/ineffective summary across episodes.
- **Sections:** `IFS-11`, `PV-02`, `PV-03`, `PV-04`, `PV-05`, `PV-07`, `PV-08`, `PV-09`, `PV-10`, `ATT-09`.
- **Confidence contribution:** actual use plus body/social change is direct. Replication or confirmation supports medium; repeated state-specific benefit plus confirmation supports high.
- **Dependencies:** identified episode/state target; `BDA` for before/after; `SEF` for resource conditions. “Not tried” is not ineffective.
- **Contradictions:** a channel helps in one state and aggravates another; preserve state/context specificity and test timing/dose/person.
- **Prohibited:** treatment advice, efficacy claims beyond self-report, moral ranking of channels, or classifying distraction/suppression as failure automatically.

### `SEF` — Secure Exception Finder

- **Raw fields:** usual pattern reference; exception episode; referent/context/safety; what differed about person, timing, body, cue, and available choice; actions; outcome; regulation/co-regulation supports; typicality; certainty.
- **Direct signals:** concrete exception, accessible choice, baseline/resource state, secure-context difference, and helping conditions.
- **Inferred signals:** candidate conditions reducing blending, broadening regulatory range, or supporting relational security.
- **Confirmatory signals:** user endorsement/edit of exception-versus-usual contrast.
- **Sections:** `IFS-11`, `PV-02`, `PV-08`, `PV-09`, `PV-10`, `ATT-11`.
- **Confidence contribution:** one exception prevents overgeneralization and can support medium with confirmation; repeated exceptions and confirmed conditions support high resource claims.
- **Dependencies:** a defined usual pattern or section gap; `RMX` for cross-relationship contrast; suitable as low-intensity/downshift and session-ending material.
- **Contradictions:** exceptions are not automatically contradictions; they define boundary conditions. If they challenge the proposed pattern's typicality, create a discriminator and revise scope.
- **Prohibited:** calling an exception proof of secure attachment, cure, resilience trait, or causal intervention; blaming the user when conditions are absent.

### `FCF` — Fit Confirmation

- **Raw fields:** evidence-based summary ID/version; exact evidence IDs shown; rating (`accurate`, `partly_accurate`, `wrong`, `uncertain`); field-specific edits to label, voice, fear, sequence, body, referent, horizon, context; rejection; certainty; quote confirmation.
- **Direct signals:** user adjudication and corrections; confirmation of exact wording when explicitly asked; current fit.
- **Inferred signals:** updated candidate/profile/status and correction propagation; no new substantive content unless the user enters it.
- **Confirmatory signals:** the interaction is the primary confirmatory mechanism. `Wrong` is negative confirmatory evidence and must be retained.
- **Sections:** all applicable `IFS-01`–`IFS-12`, `PV-01`–`PV-11`, and `ATT-01`–`ATT-12` sections targeted by the summary manifest.
- **Confidence contribution:** confirmation can raise direct evidence to medium; high still normally requires replication. Correction supersedes the proposed field but does not erase source evidence or contradictions.
- **Dependencies:** summary must be concise, neutral, framework-invisible, and traceable; manifests list each field being confirmed; final fit is required before normal completion.
- **Contradictions:** a partial/wrong fit creates corrections and may open `CX-*`; route to discriminators or downgrade. Never coerce resolution for stop.
- **Prohibited:** leading confirmation, treating nonresponse as assent, presenting generated labels as facts, or using a blanket “accurate” to confirm undeclared details.

## 6. Cross-item synthesis rules

### Episode independence

Two records are independent episode anchors only when they refer to distinguishable occasions or an explicit typical-pattern report plus a separate concrete episode. Re-rendering, follow-ups, or multiple families on the same episode deepen one anchor; they do not replicate it.

### Part and cluster synthesis

Candidate clustering may use timing, function, feared outcome, voice/modality, body signature, strategy, payoff/cost, trigger, and context. Similar outward behavior is insufficient. `PIS`/`FCF` adjudication determines confirmed part, confirmed cluster, tentative cluster, split, merge, or rejection. Generated labels use function + feared outcome + trigger domain and are always marked working labels.

### State synthesis

State candidates require multivariate convergence across energy direction, activation/deactivation map, breath, heart awareness, muscle tone, temperature, orientation, movement, speech, social availability, action tendency, onset, and recovery. Repeated maps plus an entry/exit or recovery sequence are the normal minimum. Output wording is “self-reported state signature consistent with …”; no physiological measurement or vagal-branch claim is permitted.

### Attachment synthesis

Anxiety and avoidance estimates are ordinal/descriptive and referent-specific. They are based on multiple cue sequences or explicit confirmation, with safety/reliability context attached. Cue → interpretation → body shift → proximity/deactivation impulse → overt move → other response → next move → residue/repair is preserved. Cross-relationship synthesis is permitted only from evidence in multiple referents and must also state meaningful differences.

### Contradictions

Every deterministic contradiction creates a `CX-*` record with evidence on each side, scope (episode, referent, structured window, horizon, or explicit comparison), possible discriminator dimensions (person, horizon, intensity, state, identity, or time/change), status, and typed `report_impact`. `report_impact` is one of `omit_claim`, `cap_low`, `qualify`, or `none`, with precedence `omit_claim > cap_low > qualify > none`. Resolution requires new direct or confirmatory evidence; rule priority alone may not erase a true contradiction. `cap_low` claims are low confidence, synthesis-ineligible, and underdetermined; `omit_claim` claims are not rendered.

## 7. Coverage update and stop scoring

After each interaction, recompute target `CV-*` cells from the schema-valid objects. Record satisfied/missing evidence fields, independent episode IDs/count, referent/domain count, evidence grades, open contradictions and report impact, applicability, confidence, and eligible next families. A bank-item target is routing metadata, not proof of coverage. Route/domain absence disables only its dependent route; coverage `not_applicable` requires direct section-level inapplicability evidence with a retained reason and evidence ID, and is distinct from skipped/unknown/unsupported.

Pass 1 normally completes with a framework-neutral Mapping Summary (`MAP-01`–`MAP-08`) after its mapping/adjudication gates; Pass 2 is optional. Deep-report stop is allowed only when all applicable required cells are Green or intentionally Amber with a recorded confidence limit; candidate dispositions are resolved; state and attachment floors are met; `cap_low`/`omit_claim` contradictions are resolved or retained; final fit is complete; the next interaction's expected coverage/uncertainty benefit is lower than its burden. There is no fixed administered length. A user declining deeper work preserves the Mapping Summary and allows only supported report prose.
