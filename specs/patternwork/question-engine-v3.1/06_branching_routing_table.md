# Patternwork Question Engine v3.1 — Branching and Routing Table

Status: executable-style routing specification  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Applies to inventory bank version: `v3.1.0`

## 1. Routing state and deterministic measures

The router chooses one simple-screen item; it never chooses a report conclusion. It records the candidate list and reason for every choice in `RI-*`.

```text
RouterState {
  stage: S0|S1|S2|S3|S4|S5
  pass: 1|2
  active_referent_ids[]
  episode_ids[]; cluster_ids[]; state_ids[]; attachment_ids[]
  coverage[section_code]: unsupported|not_applicable|amber|green
  section_confidence[section_code]: unsupported|low|medium|high
  evidence_counts[section_code]: direct, replicated, confirmed, cross_context
  contradictions[]: {code, sections, candidate_a, candidate_b, scope, report_impact, discriminator_status}
  recent_families[5]; recent_forms[5]; consecutive_high_arousal
  intensity_budget: 0..4; user_arousal: low|unknown|elevated|high
  skipped_families[]; pause_state; resume_token
  pending_btm_transition: true|false
  last_item_id; last_referent_id; last_horizon
  mapping_completed; deepening_completed; fit_completed
}
```

### Coverage and value calculations

Each item definition declares `section_codes`, `signal_class`, prerequisites, `burden` (1–3), `intensity` (0–3), form (`recall`, `map`, `sort`, `rank`, `threshold`, `text`, `resource`), and candidate field gain.

```text
coverage_gain(item) = count(section in item.sections where coverage[section] != green)
                       + 0.5 * count(section where confidence[section] == low)

uncertainty_gain(item) = 2 if it resolves an open contradiction it is designed for
                         1 if it supplies a missing prerequisite for a candidate
                         0 otherwise

replication_gain(item) = 1.5 if it can independently replicate a required signature
                         1 if it adds a second relationship/context
                         0 otherwise

burden_cost(item) = item.burden + item.intensity + (1 if user_arousal in {elevated, high} else 0)
rotation_penalty(item) = 100 if family_count(item.family, recent_families) >= 2
                         20 if item.form == most_recent_form
                         10 if item.form appears twice in recent_forms
                         0 otherwise

hard_block(item) is true if any invariant in section 3 fails.

marginal_value(item) = coverage_gain + uncertainty_gain + replication_gain
                       + memory_availability(item) - burden_cost - rotation_penalty
```

`memory_availability` = 1 for a recent, named episode or selected `usual pattern`; 0 for unknown; -2 when user explicitly cannot access that topic. Ties break in this order: lower intensity, lower burden, different form, named referent, smallest stable bank ID. Selection never uses randomization.

## 2. Stage gate table

| Stage / pass | Entry condition | Required minimum evidence | Preferred next families | Exit condition | Save/resume behavior |
|---|---|---|---|---|---|
| `S0 Calibration` / 1 | fresh session or missing calibration | one relevant referent or documented absence; safety/reliability for each active relational referent; recent/typical window; modality; pause permission | `RL` | active pathway selected; body/relationship confounds captured if volunteered | save `S0` token after every RL; resume begins with “continue, change person, or choose another area?” |
| `S1 Mapping` / 1 | S0 adequate | at least 6 concrete/typical samples across 4+ domains, 2+ relationship contexts when available, and anticipatory/immediate/aftermath horizons represented | `MS`, `BDA`, `FSR`, limited `BTM`, `RMX` | candidate coverage covers relation, evaluation, overload, and one resource/ordinary moment; absent domains explicitly logged | save after each episode; resume selects the highest-value unsampled domain, never repeats the last topic |
| `S2 Adjudication` / 1 | at least two candidate clusters or state/relationship patterns | user has opportunity to merge/split/reject/rename; unresolved candidates kept tentative | `PIS`, `PDL`, `FCF` (early only) | each major candidate is confirmed, retained as tentative, split, merged, or rejected; deepening gaps enumerated | save candidate cards and cited episode IDs; resume begins with card review, not recollection |
| `S3 Deepening` / 2 | S1/S2 saved or completed | gap-directed part fields, repeated maps, relationship sequences, pace and repair evidence | `VFR`, `RLB`, `BSP`, `BTM`, `RRE`, `WMA`, `PCR`, `RSR` | major dossier/state/attachment prerequisites green or intentionally amber | save at every family transition and any pause; resume offers the smallest green-making gap |
| `S4 Chains` / 2 | enough direct components to test a chain | at least one candidate cascade, one state transition/recovery path, and one relational cue→move→response sequence where applicable | `BDA`, `PIS`, `PDL`, `RRE`, `RSR`, `RMX` | causal-looking chains remain evidence-bounded; contradictions resolved or carried forward | save all chain links as separate fields; resume never asks for the same rupture twice |
| `S5 Resources and fit` / 2 | no mandatory direct gap outranks resource/fit | at least one resource/exception or explicitly unavailable; final correction opportunity | `SEF`, `RSR`, `FCF`, `RL` comparison if needed | fit confirmation finished; stopping test passes; ending is resource/ordinary/connected | final resume token preserves completed sections and only offers optional amber-gap work |

## 3. Non-negotiable hard constraints

These are evaluated before marginal value. An item failing any rule is excluded, not merely penalized.

1. Present one item only; it collects one main kind of introspection.
2. No more than two `intensity >= 2` items consecutively. If the last two are high-arousal, the next item must be `RSR-003`, `SEF-*`, `BTM-002`, a pause, or an ordinary/connected low-intensity item.
3. Immediately after **every completed `BTM-*` map**, including comparative `BTM-201` and ordinary-baseline `BTM-202`, the only next rendered screen is `RSR-003` or an eligible `SEF-*`. No `VFR`, `PIS`, `BSP`, `FCF`, other `BTM`, or any other deepening may intervene. A user-controlled pause/save/end may terminate that immediate path without rendering a next screen; it satisfies the transition safety constraint because no further content is shown, but it does **not** count as a completed resource interaction or a resource-oriented ending. On resume, `pending_btm_transition` remains true and the first rendered screen is again restricted to `RSR-003` or eligible `SEF-*`. A standard completion cannot occur while this flag is true.
4. `RRE-*` always requires a subsequent low-intensity/resource item before another high-arousal item.
5. A family cannot appear more than twice in the last five completed screens.
6. Rotate form: do not repeat the same form when an eligible different-form item has equal or greater marginal value; never use recall form three times in a row.
7. Do not place mirrored probes adjacent: `RLB` versus `BSP`, manager versus firefighter, contact versus withdrawal, and repair-initiation versus repair-reception require at least one intervening different-form item.
8. A relational inference candidate requires a named `REF-*` and its safety/reliability context. When context is `controlling, threatening, unsafe`, or current instability is material, do not route to trait/global attachment interpretation; retain contextual evidence and offer control, pause, `RSR-003`, or `SEF`.
9. A state signature cannot be created from one map, one sensation, or no entry/exit/recovery information. A major part profile cannot be created from a strategy without two independent episode anchors plus identity confirmation. An attachment pattern cannot become cross-context without at least two relationship contexts.
10. Do not ask for developmental origin, trauma history, exile identity, medical explanation, diagnosis, or verbatim voice unless wording is user typed/edited and confirmed.
11. A skip never counts as “no”; an uncertainty response never counts as a negative endorsement. Preserve it as `unknown`, reason only if volunteered.
12. Do not end after a high-arousal interaction; route to resource, ordinary baseline, pause, or explicit user-controlled save. A standard completion requires a completed resource/ordinary/connected item, not merely a pause after a map.
13. If user says “pause,” “stop,” “too much,” or user arousal is high, stop deepening immediately. Save raw evidence and surface only pause/resume/resource choices.

## 4. Response-to-route decision table

| Observed condition | Deterministic next choice(s), in order | Expected coverage / uncertainty gain | Intensity control and dependencies |
|---|---|---|---|
| No active named referent, but relational item selected | `RL-001`; if family context is salient use `RL-002`; if safer comparison is needed use `RL-003` | Enables `ATT-01` and valid relationship-specific evidence | Low intensity; blocks all ATT interpretation until complete |
| Safety/reliability is unsafe, coercive, threatening, or materially unstable | `RSR-003` or pause; then optional `SEF-003` only for a genuinely workable/safe example | Preserves `ATT-01` context and prevents false trait attribution | No `RMX` global scoring, no forced RRE/BSP; condition remains a confound |
| “It depends on the person” | `RL-*` for one named person, then re-ask the same narrow cue once | Resolves referent ambiguity | Does not mark missing; no repeated generic question |
| “It depends on time / it was different before” | ask a time discriminator: recent window vs broader typicality using the original family’s lightest version | Separates state/trait and `ATT-12`/`IFS-12` ambiguity | Low intensity, form may be a threshold/text follow-up |
| Recent concrete memory available but only first action known | `FSR-*` if onset is missing; `BDA-*` if horizon/aftermath missing | Adds episode sequence and cross-framework fields without a conclusion | BDA intensity follows scene; resource next if high |
| Anticipatory preparation before evaluation | `VFR-001`, then nonadjacent `RLB-001`, then `BSP-001` if still needed | Fills `IFS-03–07`; tests manager candidate function | Separate VFR/RLB/BSP with a different form; role remains candidate until replication |
| Acute urgent avoidance, numbing, attacking, consuming, or shutdown after activation | `BDA` for timing if absent; `RLB` for actual loop; `RSR` after | Fills `IFS-06–09`, PV recovery | Do not call firefighter without post-activation timing and user-confirmed function |
| Any `BTM-*` map completed, including `BTM-201` comparative or `BTM-202` ordinary-baseline | Set `pending_btm_transition`; next rendered screen is only `RSR-003` or an eligible `SEF-*`; user may instead pause/save/end the path | `PV-08–10` resource/recovery and arousal reduction | Absolute immediate gate: no fit, sort, voice, blocked-strategy, another map, or other deepening. Pause/save/end renders no next screen and leaves the flag pending on resume; it is not a resource completion |
| Two independent mapped episodes have convergent multi-field data | After the required `RSR-003`/eligible `SEF-*` transition, use `FCF-002`; if user says different states, use `PIS-003`; if accurate, obtain any missing recovery via `RSR` | Can turn PV sections amber→green; resolves same-vs-different state uncertainty | Requires maps + breath/speech/orientation/action or equivalent + entry/exit/recovery; no physiology claim |
| One mapped episode only | After the required `RSR-003`/eligible `SEF-*` transition, select a distinct trigger/context for another `BTM` | Replication for PV signatures | Must be independent episode; no consecutive high-arousal maps |
| Delayed reply / ambiguous cue with named referent | `WMA-001` if meaning unknown; otherwise BDA/RLB according to action | Fills `ATT-03–05`, distinguishes interpretation from action | If elevated, RSR before another relational probe |
| Direct protest/contact move recorded | `RRE-001` when a manageable rupture exists; otherwise `PCR-001` | Adds response, repair, pace; distinguishes contact from unresolved urgency | RRE requires safety and later low-intensity screen |
| Direct withdrawal/deactivation move recorded | `RRE-002` when other reached out; `PCR-003` if timing threshold is the gap | Adds `ATT-06–09`; separates need for space from global avoidance | Unsafe context blocks expectation of repair |
| User says repair does not land / residue long | `RRE-003`; if person-specific uncertainty remains, `RMX-003` | `ATT-08–11`, PV recovery/co-regulation uncertainty reduction | Do not treat “needs proof” as pathology; follow RRE with SEF/RSR |
| Same cue produces different moves | Select discriminator in order: `different referent` → `different horizon` → `different intensity` → `same/different inner pattern` → `change over time` | Resolves `CX-*`, avoids averaging contradictions | Use only one discriminator per screen; retain contradiction if user remains unsure |
| Two candidate clusters share strategy but differ in timing/function/voice | `PIS-*` based on domain; if opponents, interpose a different form then `PDL-*` | Resolves whether profile, allies, or separate clusters | No merge without user decision; no identity assumption |
| RLB reveals no clear stop or interruption sharply worsens distress | `BSP-*` only if user chooses “safe enough”; otherwise `RSR-003`/pause | Adds feared-outcome evidence or reduces burden | Never infer compulsion/diagnosis; no BSP after high arousal without resource interleave |
| User cannot access words | choose `FSR` action/body mode, `BTM` list alternative, or `RLB`; never repeat VFR | Preserves nonverbal evidence for IFS/PV | Supplied options remain categories, not quotes |
| User cannot access body signals | choose `BDA`, `RLB`, `WMA`, or `RSR` without interoception demand | Keeps sequence/relationship coverage | Record body access `unknown`; never treat as absence of state change |
| User has a safer/connected exception | `BTM-002`, `SEF-*`, or `RMX` comparison | Fills PV baseline, ATT exceptions, IFS choice access | Prefer near final or immediately after distress |
| High user arousal, “too much,” or two high-arousal screens | `RSR-003` → `save and come back`/`SEF` only by consent | Protects safety; may add PV/IFS resource evidence | Suspend deepening; no override by coverage deficit |
| Skip or no clear memory | mark `unknown` and choose the highest-value eligible item in a different domain/form; after two skips in one family, suppress that family for this pass | Broadens mapping without coercion | Save at each skip; never loop on same content |
| Two skips in one relational topic | move to neutral evaluation/overload/ordinary resource or offer end-pass save | Preserves coverage diversity; limits burden | No substitute inference from skip |
| Candidate summary has evidence but no confirmation | `FCF-*` matching candidate | User adjudication / correction | Must list episode IDs and state scope; rejection removes claim |

## 5. Contradiction discriminator protocol

Create `CX-*` when direct answers cannot both be true under the same candidate interpretation, for example “I always reach out” versus “I always disappear,” or two incompatible state groupings. Do not create a contradiction for different people, epochs, or explicitly different contexts until a discriminator shows they are comparable.

```text
function resolveContradiction(cx):
  if referent differs or safety context differs: ask named-referent discriminator; label relationship-specific
  else if horizon differs: ask before/during/after discriminator; label timing-specific
  else if intensity differs: ask “when it is mild vs overwhelming” threshold; label intensity-specific
  else if voice/function/urge differs: run PIS; label separate clusters if user says different
  else if recency differs: ask recent vs typical; label change-over-time if endorsed
  else: retain CX as unresolved; cap affected report sections at low and route to FCF
```

Discriminator prompts are concrete and single-purpose:

- **Person:** “With your close friend you wait, while with your parent you go quiet. Keep one person in view: which response fits your close friend when the reply is late?”
- **Horizon:** “The night before the review and the hour after criticism may be different. Which move happens before it starts, and which after the pressure has already hit?”
- **Intensity:** “When the disagreement is mild versus when it feels overwhelming, which first move changes?”
- **Identity:** “Do the ‘check for contact’ and ‘go silent’ moves feel like one pattern changing tactics, allies, opponents, or different patterns?”
- **Time:** “In the last month compared with the years that feel typical, which response fits each period?”

## 6. Family rotation and selection matrix

| Family | Use when | Do not use when | Typical gain | Required follow-up / dependency |
|---|---|---|---|---|
| `RL` | referent, safety, or comparison context absent | current user requests no relationship content | validates ATT context | must precede relational interpretation |
| `MS` | domain needs broad concrete sample | two recall items just occurred and nonrecall eligible | direct cue/action | BDA/FSR only if memory concrete |
| `BDA` | timing/aftermath/cascade missing | no bounded episode, user high arousal | manager/firefighter/repair sequence | high strip → resource |
| `BTM` | representative body signature gap | one map already used without recovery, user cannot/does not want body focus | PV map, IFS body | immediately next screen is only `RSR-003` or eligible `SEF-*`; pause/save/end renders no screen and preserves the pending gate for resume |
| `FSR` | onset modality/order unknown | same cue already ranked with high certainty | entry sequence | route according to first signal |
| `VFR` | user-directed rule/voice/urge unknown | verbal mode inaccessible or another text capture was last and equal option exists | IFS voice/modalities | selected phrase cannot quote; needs edit confirmation |
| `RLB` | action strategy/stop/payoff unknown | loop is not concrete, or adjacent BSP mirror | ritual and costs | BSP only after form interleave |
| `BSP` | protective feared outcome gap | safety/imagining not tolerable | protective function | no origin/exile inference; resource after high burden |
| `PIS` | 2+ evidence-backed candidates need user adjudication | fewer than two cards or cards not evidence-bound | identity/cluster uncertainty | opponent → interleave → PDL |
| `PDL` | user acknowledges competing moves | conflict is model-invented or user says no | polarization/cost | resource after high intensity |
| `RMX` | 2+ active, comparable referents | unsafe rows would be averaged, only one referent | cross-relationship specificity | retain each row separately |
| `PCR` | pace threshold or space/contact condition missing | not applicable context | ATT pace | no touch assumption; may feed RRE |
| `RRE` | concrete manageable rupture/repair exists | unsafe, too much, no relevant interaction | repair/reassurance sequence | mandatory resource next |
| `WMA` | ambiguous cue's self/other meanings missing | user high arousal, other meaning is not accessible | ATT working-model evidence | must precede inference from move |
| `RSR` | recovery/channel or low-intensity transition needed | never blocked by incomplete coverage | PV/IFS resources | effective claim requires repetition |
| `SEF` | ordinary/secure exception/resource gap, post-distress | user says none and prefers not to search | exceptions and choice | suitable near ending |
| `FCF` | summary candidate is evidence-bound and report-impact eligible | raw evidence not yet present | confirmation/correction | corrections override candidate labels |

## 7. Two-pass save/resume contract

### Pass 1: mapping and candidate adjudication

Pass 1 stops when S0–S2 exit gates are satisfied or the user elects to stop. It normally produces the framework-neutral Mapping Summary with `MAP-01`–`MAP-08`; it is a supported-only deliverable, not an exceptional early-stop report. Persist: all raw response IDs; rendered bank version; immutable snapshot/window binding; administration order; referents/safety; episode fragments; candidates with supporting IDs; skipped domains; route absences; coverage cells; contradictions and typed `report_impact`; arousal/last-form state; and a short neutral resume cue. Never persist an unconfirmed inferred label as a fact.

On resume, present:

> “Your first pass saved the moments you chose and a few working patterns to check. You can continue with the smallest missing area, change the person or topic, review a working description, or finish with what is already supported.”

Selection priority on pass-1 resume: unresolved safety/context → unsampled horizon/domain → missing resource/ordinary sample → candidate adjudication. Do not re-ask a completed item unless the user selects “change/correct.”

### Pass 2: gap-driven deepening, chains, and fit

Pass 2 is optional gap-driven deepening from a ranked gap list. The first screen must be low or moderate intensity unless the user explicitly chooses a saved high-intensity topic. Persist each stage boundary and after every pause. On resume, show up to three choices generated deterministically:

1. `Continue the smallest evidence gap: {neutral cue}`.
2. `Check a working description before going deeper.` (only when an FCF candidate is eligible)
3. `End with what is already supported.`

If the user takes option 3, run `RSR-003` or an applicable `SEF` unless the immediately preceding completed screen was already resource-oriented, then run relevant `FCF` and produce only supported sections.

## 8. Stage completion and marginal-value stop logic

### Section status algorithm

```text
for each section:
  if direct section-level inapplicability evidence exists: coverage = not_applicable
  else if required direct fields absent: coverage = unsupported
  else if special-floor unmet or anyOpenCXImpactIn({cap_low, omit_claim}): coverage = amber; confidence = low
  else if direct + (replicated or user_confirmed): coverage = green; confidence = medium
  else if replicated + user_confirmed and noOpenCXImpactIn({cap_low, omit_claim}): coverage = green; confidence = high
  else: coverage = amber; confidence = low
```

Special floors:

- `IFS-02–09` major profile: two independent episodes + PIS/FCF user identity confirmation; otherwise retain only a tentative cluster observation.
- `PV-03–05`: two independent multivariate maps plus entry/exit or recovery evidence; one sensation never suffices.
- `ATT-02–10`: direct relationship-specific cue→meaning/move evidence plus a second cue or user confirmation; cross-context language additionally requires RMX evidence from another relationship.
- Any section with unsafe/unreliable context must state the context and cannot be reduced to a trait interpretation.

### Stop decision

```text
function shouldStop(state):
  mandatory = allRequiredSectionsGreenOrExplicitAmberWithLimit(state)
  candidates = everyMajorCandidateResolvedConfirmedDowngradedOrRejected(state)
  states = everyStateClaimMeetsRepetitionFloorOrIsOmitted(state)
  attachments = relationshipSpecificityPreserved(state)
  contradictions = everyCXResolvedOrExplicitlyRetained(state)
  fit = state.fit_completed
  no_pending_btm_transition = !state.pending_btm_transition
  resource_end = lastCompletedIsResourceOrdinaryOrConnected(state)
  best = max(marginal_value(item) for eligible items)
  low_value = best <= 0 or (best <= 1 and user_arousal != low)
  return mandatory and candidates and states and attachments and contradictions and fit and no_pending_btm_transition and resource_end and low_value
```

If `best > 0` but the user declines further questions, terminate safely, label remaining sections `amber`/`unsupported`, save unresolved gaps, and never fill them with generic prose. If `shouldStop` is false because a final fit check is missing, FCF has priority over all other non-safety work.

## 9. Deterministic router pseudocode

```text
function nextInteraction(state):
  if state.pending_btm_transition:
    if userRequestedPauseSaveOrEnd(state):
      return USER_CONTROLLED_TERMINATION  // no next screen; persist pending flag on pause/save
    return chooseFirstEligible([RSR-003, eligibleSEFItems(state)], state)

  if state.pause_state or state.user_arousal == high:
    return chooseFirstEligible([RSR-003, SAVE_RESUME], state)

  if missingCalibration(state):
    return chooseCalibration(state)  // RL-001, RL-002, or RL-003 by required referent

  if lastWasHighArousal(state) and state.consecutive_high_arousal >= 2:
    return chooseFirstEligible([RSR-003, SEF-001, SEF-003, BTM-002, SAVE_RESUME], state)

  if mustFollowRuptureWithResource(state):
    return chooseFirstEligible([RSR-003, RSR-001, RSR-002, SEF-001, SEF-003, BTM-002], state)

  if openContradiction(state):
    return discriminatorFor(oldestHighestImpactCX(state))

  if state.stage == S0: return highestValueEligible(RL_items, state)
  if state.stage == S1: return highestValueEligible(mappingCandidates(state), state)
  if state.stage == S2: return highestValueEligible(adjudicationCandidates(state), state)
  if state.stage in [S3, S4]:
    if finalFitRequiredBeforeMoreDepth(state): return eligibleFitItem(state)
    return highestValueEligible(deepeningAndChainCandidates(state), state)
  if state.stage == S5:
    if not hasResourceEnding(state): return highestValueEligible(resourceCandidates(state), state)
    if eligibleFitItem(state): return eligibleFitItem(state)
    if shouldStop(state): return COMPLETE
    return highestValueEligible(optionalAmberGapCandidates(state), state)

function highestValueEligible(candidates, state):
  eligible = filter(candidates, item => prerequisitesMet(item,state) && !hard_block(item,state))
  if eligible empty: return SAVE_RESUME_OR_COMPLETE_WITH_LIMITS
  return argmax(eligible, [marginal_value, lower_intensity, lower_burden,
                           different_form, named_referent, bank_id_ascending])

function isCompletedEligibleBTMRecovery(response, stateBeforeResponse):
  return stateBeforeResponse.pending_btm_transition
     && response.status == completed
     && !response.skip
     && !response.pause
     && !response.abandoned
     && (
          (isItem(response, RSR-003) && wasEligibleWhenRendered(response, stateBeforeResponse))
          || isEligibleSEFCompletion(response, stateBeforeResponse)
        )

function onResponse(state, response):
  stateBeforeResponse = snapshot(state)
  persistRaw(response)
  updateEvidenceObjectsOnlyFromDeclaredDirectFields(response)
  if isCompletedBTM(response): state.pending_btm_transition = true
  if response.skip or response.pause or response.abandoned:
    recordUnknownAndSafeResume(state,response)  // never clears pending_btm_transition
  else if isCompletedEligibleBTMRecovery(response, stateBeforeResponse):
    state.pending_btm_transition = false
  if response.depends_on_person: enqueue(RL_for_named_person)
  if response.corrects_summary: supersedeCandidateFields(response)
  updateCoverageConfidenceContradictions(state)
  updateRecentFamilyFormArousal(state,response)
  advanceStageWhenGateMet(state)
  return nextInteraction(state)
```

## 10. Report-claim guardrails wired to routing

- The router may send `candidate_cluster` to FCF/PIS; only the scoring engine may upgrade it after explicit confirmation and the stated evidence floor.
- `manager` and `firefighter` are temporal-function labels: anticipatory/preventive versus urgent/post-activation. Identical behavior in another horizon is routed as a contradiction/discriminator, never auto-classified.
- `PV` language is always “self-reported signature consistent with” and must retain body-confound/context data. The router never emits a physiological status.
- `ATT` output is indexed by `REF-*`; no aggregation function produces a global attachment style. Comparisons are only permitted when RMX has comparable rows and safety conditions are visibly retained.
- User corrections, rejections, and typed confirmed language have higher priority than item-bank options or model-proposed labels.

## 11. Routing verification scenarios

| Scenario | Required routing result | Gate evidence |
|---|---|---|
| User checks phone after a close friend’s delay, but goes silent with a parent | `RL`/`RMX` then person discriminator; retain two relationship-specific sequences | no global ATT score; `CX` resolves as referent-specific |
| User rechecks work before review then scrolls/numbs after criticism | `BDA` establishes horizons; VFR/RLB/BSP and nonadjacent resource; PIS only after anchors | manager/firefighter candidate separated by timing, no automatic part |
| User reports chest tightness once | no state profile; collect recovery then a distinct mapped episode only if appropriate | PV section stays amber/low |
| User completes `BTM-201` comparative map | only `RSR-003` or eligible `SEF-*` may render next; pause/save/end may terminate without another screen | `pending_btm_transition` blocks VFR, PIS, BSP, FCF, every other BTM, and all deepening; resume remains restricted until completed resource item |
| User completes `BTM-202` ordinary-baseline map | same immediate gate: only `RSR-003` or eligible `SEF-*`; pause/save/end may terminate without another screen | ordinary-baseline status does not relax the gate; pause/end is user-controlled termination, not a completed resource-oriented ending |
| User says conflict withdrawal is necessary because the person is threatening | no RRE pressure; resource/pause; safety context attached to all evidence | no avoidance/attachment inference |
| User finishes a rupture exchange elevated | `RSR-003` or `SEF` must occur before any further deepening or completion | ending is not peak activation |
| User stops at end of pass 1 | save candidate/evidence state and produce supported-only mapping output | pass 2 remains optional; uncovered sections transparent |

### BTM recovery replay matrix

All rows begin immediately after a completed `BTM-*`, with `pending_btm_transition = true`. “Eligible” means the recovery item was one the pending-gate branch could legally render for that state; imported, stale, or otherwise out-of-band resource responses are not eligible.

| Recovery event | Completion-sensitive predicate | Expected pending flag / next route |
|---|---|---|
| Fully completed, eligible `RSR-003` | true | `false`; normal routing may consider deepening or standard completion, subject to all other gates |
| Fully completed, eligible `SEF-*` | true | `false`; normal routing may consider deepening or standard completion, subject to all other gates |
| `RSR-003` is skipped | false (`skip`) | `true`; save state and next rendered screen on resume remains only `RSR-003` or eligible `SEF-*` |
| `RSR-003` is paused | false (`pause`) | `true`; pause/save path renders no next screen and resume remains restricted |
| User pauses/saves/ends before any recovery screen | false (no recovery response) | `true` for pause/save; no further screen for an end path; neither constitutes a completed resource-oriented ending |
| Eligible `RSR-003` or `SEF-*` is abandoned or partially completed | false (`abandoned` or `status != completed`) | `true`; return/resume may render only `RSR-003` or eligible `SEF-*` |
| `RSR-001`, `RSR-002`, `BTM-002`, or an ineligible/stale `SEF-*` is received | false (not an eligible pending-gate recovery) | `true`; no deepening/fit/completion; router reasserts `RSR-003` or eligible `SEF-*` |
| A later eligible `RSR-003` or `SEF-*` is fully completed after any retained-gate row | true | `false`; only now may deepening, fit, or standard completion proceed if independently eligible |

## 12. Verification checklist

- Router excludes any family repeated more than twice within its five-screen history.
- Immediately after every completed `BTM-*` map, including `BTM-201` and `BTM-202`, router state sets `pending_btm_transition` and permits only `RSR-003` or eligible `SEF-*` as the next rendered screen. No deepening, fit, sort, or additional map may intervene.
- A user-controlled pause/save/end directly after a BTM renders no screen and therefore satisfies the immediate-transition safety constraint; it does not satisfy the standard resource-oriented-ending requirement. Pause/save preserves `pending_btm_transition`, which is enforced before the next rendered screen on resume; standard completion is blocked until a resource/ordinary/connected item completes.
- `pending_btm_transition` clears only when `isCompletedEligibleBTMRecovery` is true: the response is completed, not skipped/paused/abandoned, and is eligible `RSR-003` or eligible `SEF-*`. Skips, pauses, partial/abandoned responses, and ineligible resource events retain the gate.
- Router forces a low-intensity/resource transition after every rupture sequence and after two high-arousal items.
- Every “depends,” skip, pause, safety flag, and contradiction has an explicit deterministic branch.
- All 17 family codes are routable and have at least one stated selection condition.
- Stage exit, two-pass persistence, final confirmation, and marginal-value stop contain no fixed item-count rule.
- Every emitted report section is bounded by direct fields, confidence floors, and referent/context requirements.
