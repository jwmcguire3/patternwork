# Patternwork Question Engine v3.1 — Complete Interaction Inventory

Status: implementation-ready bank  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Bank version: `v3.1.0`

## How to read an item

Each rendered item carries its ID/version, named referent, structured window ID/revision, administration sequence, certainty, response IDs, option order, and accessibility alternative. A selected supplied phrase is a category signal, never a quote; only typed, edited, or explicitly confirmed wording may be quoted. `D` = direct report, `I` = bounded candidate signal, `C` = user confirmation. `DS`, `R`, `UC`, and `CC` mean direct-single, replicated, user-confirmed, and cross-context contribution. “No inference” is a hard scoring boundary.

An unavailable route or domain is recorded as route absence and suppresses only its dependent item(s). It must not be emitted as coverage N/A. A completed item can establish coverage `not_applicable` only when it directly records section-level inapplicability and its reason/evidence ID.

All prompts are one screen. “Not sure,” “none fit,” “it depends on the person,” skip, and pause preserve current evidence; `depends` branches to Referent Lock, while skip asks only whether to save or resume later. Body-map items have a list/keyboard alternative; ranks have tap-order alternatives; sliders have discrete bands.

---

## RL — Referent Lock

**Purpose.** Assign a concrete relationship and its safety/reliability context before any relationship interpretation.  
**Mechanics.** Search/select a role, optionally give a private label, then choose context cards.  
**Direct signals.** Relationship type, relevance, safety, predictability, reciprocity, current instability.  
**Inferential limits.** Context is a confound, not a diagnosis or a trait score.  
**Scoring fields.** `referent_id`, `relationship_type`, `safety_context`, `reliability_context`, `current_relevance`, `touch_applicability`.  
**Branching.** Unsafe/coercive/volatile flags suppress pathologizing attachment claims and route to choice/control or resource material; inactive referents are not selected for recent episodes.

### RL-001 — closest current relationship
- **Prompt:** “For the person you are most likely to turn toward or think about when something important happens this month, who should we keep in view?”
- **Options/mechanics:** `a partner or dating person`; `a close friend`; `a family member`; `a housemate or chosen-family person`; `another person — name their role privately`; `no one fits right now`. Then: “With this person lately, contact feels: I can usually say what I mean and get a response / I am often unsure what response I will get / I watch what I say or do / I need distance or control to feel safer / too mixed to say.”
- **Uncertainty/skip:** `It depends on the day` opens a “recently vs usually” pair; skip/pause saves no label.
- **Target fields / sections / class:** `REF`, safety, relevance; `ATT-01, ATT-02, ATT-11`; D.
- **Prerequisites/branches:** S0; unsafe → no global attachment estimate, route `SEF-003` or pause; no person → friendship/authority sampling later.
- **Confidence/dependencies:** DS for context; must accompany every `ATT-*` episode for this referent.
- **No inference:** no attachment style, abuse finding, or family-origin claim.

### RL-002 — family comparison referent
- **Prompt:** “When you think of a parent, caregiver, or other formative family relationship, whose reactions are easiest to picture in a specific moment?”
- **Options/mechanics:** `a parent/caregiver`; `a sibling`; `an elder or extended-family person`; `a former caregiver`; `family is not a useful category for me`; `another role`. Choose: “Their response was usually: fairly predictable / hard to predict / rarely available to me / often crossed limits or felt unsafe / different at different times.”
- **Uncertainty/skip:** `I cannot picture one moment` records unavailable memory and routes away from history probing; skip/pause available.
- **Target fields / sections / class:** `REF`, relationship context, memory availability; `ATT-01, ATT-11`; D.
- **Prerequisites/branches:** S0; only route to present-oriented matrix if memory is available; unsafe → choice-preserving resource branch.
- **Confidence/dependencies:** DS only; comparison requires an additional current referent.
- **No inference:** no developmental cause, trauma history, or obligation to discuss family.

### RL-003 — reliably safer comparison
- **Prompt:** “Is there a person with whom being imperfect, slow to answer, or needing space usually feels a little less risky?”
- **Options/mechanics:** `a close friend`; `a partner/dating person`; `a colleague or mentor`; `a family person`; `I have had this person in the past, not now`; `not really`. Choose one context: “What makes them different: they are consistent / I can say no / repair happens / I do not depend on them much / something else.”
- **Uncertainty/skip:** `It varies` permits two labels; skip/pause does not imply lack of support.
- **Target fields / sections / class:** secure-comparison `REF`, safety/reliability, resource context; `ATT-11, PV-02, PV-10, IFS-11`; D.
- **Prerequisites/branches:** S0/S5; available person → later `SEF`; none → do not force an exception.
- **Confidence/dependencies:** DS; CC requires concrete exception episode.
- **No inference:** no conclusion that this person is objectively safe or that the user lacks resilience.

---

## MS — Memory Snap

**Purpose.** Rapidly sample a recognizable, bounded episode.  
**Mechanics.** One scene and one first-move choice, followed by optional certainty.  
**Direct signals.** Cue, referent, horizon, actual first move.  
**Inferential limits.** A single choice is not a part, state, or attachment classification.  
**Scoring fields.** `episode_id`, cue, horizon, first_action, certainty, recency, typicality.  
**Branching.** Concrete memory opens BDA/FSR; uncertain memory samples another domain.

### MS-001 — delayed reply
- **Prompt:** “When your close friend has read your message and the evening passes without a reply, what do you usually do first, even when you wish you did something else?”
- **Options/mechanics:** `send another message`; `check the thread or their status`; `decide to wait and see`; `go quiet and hold back from needing an answer`; `get absorbed in something else`; `something else — type it`. Certainty: `clear memory / usual pattern / not sure`.
- **Uncertainty/skip:** `It depends on which friend` → `RL-001`; `I cannot find a moment`, skip, and pause offered.
- **Target fields / sections / class:** relational ambiguity, first action, immediate horizon; `ATT-04, ATT-05, ATT-06`, `IFS-03`; D.
- **Prerequisites/branches:** named close-friend `REF`; message/check → `WMA-001`; quiet → `BDA-002`; wait → compare secure exception.
- **Confidence/dependencies:** DS; needs interpretation + body + response sequence before attachment claim.
- **No inference:** no anxiety score, rejection sensitivity, or manager/firefighter role from this alone.

### MS-002 — anticipated evaluation
- **Prompt:** “The night before your manager, client, instructor, or other evaluator will see your work, what is the first thing you actually do?”
- **Options/mechanics:** `recheck and improve it`; `make a detailed plan`; `put it off until I cannot avoid it`; `ask someone to look at it`; `tell myself it does not matter`; `something else — type it`. Add `happened this week / this month / typical longer-term`.
- **Uncertainty/skip:** `No evaluator applies` reroutes to being-seen-success/failure; uncertainty/skip/pause offered.
- **Target fields / sections / class:** anticipation, protective move, recency/typicality; `IFS-03, IFS-05, IFS-09, PV-06`; D.
- **Prerequisites/branches:** S1; plan/recheck → `RLB-001`; delay → `BSP-002`; detached response → `BTM-003` only if concrete.
- **Confidence/dependencies:** DS; role requires function/timing plus replication.
- **No inference:** no perfectionism label, ADHD inference, or state classification.

### MS-003 — conflict heat
- **Prompt:** “While you and your partner, close friend, or family person are still in a disagreement and their tone changes, what is your first move?”
- **Options/mechanics:** `explain harder`; `raise my voice or push back`; `freeze and lose words`; `leave, end the call, or go silent`; `try to smooth it over`; `something else — type it`.
- **Uncertainty/skip:** `Different people bring out different moves` → lock one referent; no current relationship/skip/pause accepted.
- **Target fields / sections / class:** rupture cue, immediate action; `ATT-07, IFS-03, PV-07`; D.
- **Prerequisites/branches:** named `REF` plus safety context; high intensity → low-intensity `RSR-003` next; smoothing → `RRE-001`; leave/silence → `RRE-002`.
- **Confidence/dependencies:** DS; needs body, interpretation, other’s response, and aftermath to form a sequence.
- **No inference:** no anger disorder, dissociation, or unsafe-relationship responsibility claim.

---

## BDA — Before–During–After Strip

**Purpose.** Separate prevention, acute reaction, and residue/repair.  
**Mechanics.** Choose or type one action per strip position; optional reorder.  
**Direct signals.** Horizon-specific sequence, payoff, residue.  
**Inferential limits.** Timing suggests a candidate role only after function confirmation.  
**Scoring fields.** `before_action`, `first_hit`, `urgent_action`, `aftermath`, `payoff`, `residue`.  
**Branching.** Manager/firefighter candidate requires VFR+BSP; rupture strips route to RRE.

### BDA-001 — evaluation cascade
- **Prompt:** “Use one time your work was about to be reviewed. Fill the strip with what really happened: the night before / when you saw a possible problem / when the pressure peaked / later that night.”
- **Options/mechanics:** Each slot offers `rechecked or prepared`; `could not settle`; `worked frantically`; `avoided it`; `asked for help`; `numbed out or scrolled`; `felt relieved for a while`; `could not sleep`; `something else — type`. User may drag/tap order and leave any slot blank.
- **Uncertainty/skip:** `I only remember one part` saves partial strip; skip/pause available.
- **Target fields / sections / class:** manager/firefighter timing, escalation, payoff/cost; `IFS-03, IFS-06, IFS-07, IFS-09`, `PV-06, PV-08`; D/I.
- **Prerequisites/branches:** concrete `MS-002`; frantic/numbing after peak → `RLB-001` or `RSR-001`; recheck alone → VFR+BSP.
- **Confidence/dependencies:** DS sequence; role is I pending feared outcome and replication.
- **No inference:** no distinct part, compulsion, or physiological state claim.

### BDA-002 — unanswered message aftermath
- **Prompt:** “Think of the last time a named close person did not answer when you hoped they would. While waiting / when it started to sting / what you did next / the next morning.”
- **Options/mechanics:** per slot: `checked again`; `made up an explanation`; `sent something`; `withdrew`; `kept busy`; `slept badly`; `felt embarrassed`; `brought it up`; `something else — type`. Then choose relief: `it settled / it only hid it / it got bigger / not sure`.
- **Uncertainty/skip:** different-person branch; no clear memory, skip, pause allowed.
- **Target fields / sections / class:** ambiguity sequence, protest/deactivation, residue; `ATT-04–09`, `IFS-09`, `PV-08`; D.
- **Prerequisites/branches:** RL safety context; send → `WMA-001`; withdraw → `RRE-002`; two intense items means route resource.
- **Confidence/dependencies:** DS; attachment sequence needs response from other person or confirmation.
- **No inference:** no global attachment label or intent attributed to the other person.

### BDA-003 — overload and recovery
- **Prompt:** “On a day when your body or mind had too much input, trace: before the load built / first sign you were past your limit / what you did to get through / what was left the next day.”
- **Options/mechanics:** choose/type: `kept pushing`; `got restless`; `lost words`; `went blank`; `left the space`; `used music/food/scrolling/sleep`; `felt more settled`; `felt foggy or raw`; `something else`. Mark `body / thoughts / both / hard to separate`.
- **Uncertainty/skip:** `I do not notice early signs` routes to accessible regulation, not failure; skip/pause allowed.
- **Target fields / sections / class:** overload sequence, recovery/residue; `PV-06–09, IFS-07`; D/I.
- **Prerequisites/branches:** S1; state candidates → repeated map later; route `SEF-001` after high burden.
- **Confidence/dependencies:** DS; signature requires another separate episode + map.
- **No inference:** no neurotype, diagnosis, or autonomic physiology measurement.

---

## BTM — Body Topography Map

**Purpose.** Collect representative, multivariate body change without treating it as measurement.  
**Mechanics.** Mark more active and quieter regions separately, then qualities/intensity; alternative list names regions.  
**Direct signals.** Region, quality, direction, breath/voice/orientation change.  
**Inferential limits.** One map never classifies a state.  
**Scoring fields.** activation/deactivation maps, quality, intensity, breath, voice, movement, attention.  
**Branching.** Always follows a concrete episode and routes to low-intensity resource/regulation.

### BTM-001 — mobilized waiting
- **Prompt:** “Return only to the moment you were waiting for your close friend’s reply. Where became more active, and where—if anywhere—went quieter?”
- **Options/mechanics:** front/back map or list `jaw, throat, chest, stomach, hands, legs, face, head, other`; qualities `tight, hot, buzzing, fluttery, heavy, restless, numb, blank, other`. Then: “Breath was: faster / held / shallow / unchanged / cannot tell”; “words with people: easier / harder / unchanged.”
- **Uncertainty/skip:** `I do not track my body` selects `hard to access`; no forced marks; skip/pause routes resource.
- **Target fields / sections / class:** body activation/deactivation, breath, speech; `PV-03, PV-06, PV-07, PV-11`, `IFS-06`; D.
- **Prerequisites/branches:** `BDA-002` or concrete MS; next `RSR-003`, never another high-arousal item.
- **Confidence/dependencies:** DS; needs map in an independent episode and onset/recovery for PV signature.
- **No inference:** no vagal-state classification, panic claim, or medical cause.

### BTM-002 — connected ordinary baseline
- **Prompt:** “Picture an ordinary stretch with the person who feels comparatively easier to be with—perhaps making plans, sharing quiet, or doing something routine. What is different in your body then?”
- **Options/mechanics:** select regions `looser, warmer, steadier, able to follow what is happening, no clear difference, other`; quieter regions optional. Add “I usually find it easier to: speak / listen / move / make eye contact / take space / none reliably.”
- **Uncertainty/skip:** no safer person → `not available`; skip/pause accepted.
- **Target fields / sections / class:** ordinary/connected body access, social availability; `PV-02, PV-10, ATT-11, IFS-11`; D.
- **Prerequisites/branches:** RL-003; may route to `SEF-001` for context detail.
- **Confidence/dependencies:** DS; baseline needs ordinary-time repetition.
- **No inference:** no claim of a regulated nervous system or relationship safety beyond report.

### BTM-003 — shutdown-like distance
- **Prompt:** “In one disagreement where you lost words, felt far away, or needed to disappear, what changed first in your body and attention?”
- **Options/mechanics:** mark/list `face, throat, chest, belly, hands, legs, whole body`; qualities `heavy, cold, far away, empty, slowed, numb, collapsed, tense too, other`. Choose attention: `narrowed / scattered / foggy / sharply focused / not sure`; movement: `leave / stay still / pace / hard to move / other`.
- **Uncertainty/skip:** unsafe-context option routes to control/exit validation rather than deepening; skip/pause allowed.
- **Target fields / sections / class:** deactivation/mixed signals, onset; `PV-04–07, PV-11, ATT-07`; D.
- **Prerequisites/branches:** concrete MS-003+BDA; high arousal count cap then `SEF-003`/pause.
- **Confidence/dependencies:** DS; repeated map and recovery required for state signature.
- **No inference:** no dissociation diagnosis, trauma history, or blame for proportionate withdrawal.

---

## FSR — First-Signal Race

**Purpose.** Capture onset order before stories overwrite it.  
**Mechanics.** Rank first, second, and optional third signals; type an unlisted signal.  
**Direct signals.** Self-reported onset order and access mode.  
**Inferential limits.** Order may be uncertain and does not prove causality.  
**Scoring fields.** `first_signal`, `second_signal`, `third_signal`, modality, certainty.  
**Branching.** Low certainty uses alternative cue or no ranking; action-first routes to ritual; blankness routes to gentle body/choice.

### FSR-001 — ambiguity onset
- **Prompt:** “When your partner or named close person becomes quieter than usual, what arrives first—before you have time to explain it?”
- **Options/mechanics:** tap-rank up to three: `a body change`; `a thought or rule`; `a feeling`; `an image`; `an urge to contact`; `an urge to pull away`; `blankness`; `something else`. Then choose certainty `clear / fuzzy / guessed`.
- **Uncertainty/skip:** `different person` → RL; `nothing arrives clearly`, skip, pause accepted.
- **Target fields / sections / class:** onset order, modality, cue; `PV-06, ATT-04, IFS-04`; D.
- **Prerequisites/branches:** concrete relational cue; thought/rule → `VFR-002`; contact/withdraw urge → `WMA-001` or RRE.
- **Confidence/dependencies:** DS; needs actual action and repeated episode for sequence.
- **No inference:** no causal chain, attachment dimension, or part identity.

### FSR-002 — seen succeeding
- **Prompt:** “Right after someone whose opinion matters praises your work or notices you succeeding, what shows up first?”
- **Options/mechanics:** rank `body lift or ease`; `thought to minimize it`; `pleasure`; `urge to explain`; `urge to work harder`; `suspicion`; `blankness`; `other`. Pick horizon `in the moment / later that day`.
- **Uncertainty/skip:** no recognition memory / skip / pause allowed.
- **Target fields / sections / class:** response to positive visibility, onset; `IFS-04, IFS-05, PV-06, ATT-03`; D.
- **Prerequisites/branches:** S1; minimization/harder → `BSP-001`; pleasure/ease → `SEF-002`.
- **Confidence/dependencies:** DS; broader meaning requires an edited rule + replication.
- **No inference:** no low self-worth conclusion or defensive-part name.

### FSR-003 — grief or loss recall
- **Prompt:** “When a memory of a loss or absence catches you unexpectedly—on a drive, in a song, or before sleep—what reaches you first?”
- **Options/mechanics:** rank `chest/throat/body change`; `image`; `sadness`; `rule to keep moving`; `urge to call someone`; `urge to shut it down`; `blankness`; `other`. `I prefer not to go there` is a complete response.
- **Uncertainty/skip:** decline routes immediately to ordinary resource content; save/pause offered.
- **Target fields / sections / class:** experience modality, first protective response; `IFS-04, PV-06, IFS-11`; D.
- **Prerequisites/branches:** optional S1; no forced follow-up; only deepen on voluntary concrete memory.
- **Confidence/dependencies:** DS, no minimum.
- **No inference:** no grief stage, trauma, or protected-vulnerability content.

---

## VFR — Voice or Felt-Rule Capture

**Purpose.** Gather user-language or nonverbal protective direction.  
**Mechanics.** Select closest phrase/mode, then edit/confirm separately.  
**Direct signals.** Phrase category, modality, typed edit.  
**Inferential limits.** Prewritten selection is not verbatim voice.  
**Scoring fields.** `voice_mode`, option ID, `typed_text`, confirmation, rule/urge/image.  
**Branching.** Edited wording can support quote only with confirmation; nonverbal modes branch to action/body.

### VFR-001 — before evaluation
- **Prompt:** “The night before your work will be reviewed, what is closest to the message or direction inside you?”
- **Options/mechanics:** `“Check it again; one mistake will matter.”`; `“Get ahead of this so no one can question me.”`; `“Do not start until you can do it right.”`; `a rule without words: prepare more`; `an image or body push`; `nothing clear / something else — type or edit`. Then: “Is the wording you typed or edited accurate enough to keep? yes / change it / no.”
- **Uncertainty/skip:** uncertain/skip/pause accepted; no typed text stored as quote.
- **Target fields / sections / class:** voice/felt rule, anticipatory function; `IFS-04–06`; D (mode/selection), C (edited confirmation).
- **Prerequisites/branches:** MS-002/BDA-001; → BSP-001 then RLB-001.
- **Confidence/dependencies:** UC voice sample only if user confirms edited wording; needs episodes for profile.
- **No inference:** no perfectionist part, fear, or quote from supplied phrases.

### VFR-002 — delayed reply
- **Prompt:** “While your named close person has not replied, what is closest to the message, rule, image, or urge that takes over?”
- **Options/mechanics:** `“Make sure they are not upset.”`; `“Do not be the one who needs more.”`; `“Say it now before the distance grows.”`; `a wordless pull to check`; `an image of being left out`; `blankness / other — type or edit`. Confirm edited words separately.
- **Uncertainty/skip:** person-specific branch; skip/pause allowed.
- **Target fields / sections / class:** cue-linked inner modality; `IFS-04, ATT-03–05`; D/C.
- **Prerequisites/branches:** MS-001/BDA-002; checking → RLB-002; contact urge → WMA-001.
- **Confidence/dependencies:** DS; quote requires confirmed edit; interpretation claim needs WMA.
- **No inference:** no abandonment belief, part identity, or attachment style.

### VFR-003 — conflict withdrawal
- **Prompt:** “When the disagreement is still happening and you want to leave or go quiet, what is closest to the direction inside?”
- **Options/mechanics:** `“Stop talking before this gets worse.”`; `“I cannot do this right now.”`; `“If I stay, I will say something I regret.”`; `a wordless need for distance`; `a blank wall`; `other — type or edit`. Confirm if edited.
- **Uncertainty/skip:** unsafe situation → `I need control or distance` may end this topic; skip/pause accepted.
- **Target fields / sections / class:** felt rule/urge, immediate horizon; `IFS-04–05, ATT-06–07, PV-07`; D/C.
- **Prerequisites/branches:** MS-003; → RRE-002 only if safe/consensual.
- **Confidence/dependencies:** DS; needs action, payoff/cost, and replication for profile.
- **No inference:** no avoidance label, intent attribution, or unsafe-context pathology.

---

## RLB — Ritual Loop Builder

**Purpose.** Make a strategy’s actual steps, stopping rule, interruption response, payoff, and cost visible.  
**Mechanics.** Select/order steps, choose stop condition, rate completion.  
**Direct signals.** Behavior sequence and subjective effect.  
**Inferential limits.** A loop is not a disorder or a part by itself.  
**Scoring fields.** `ritual_steps`, order, stopping_condition, interruption_response, payoff, cost.  
**Branching.** Incomplete/urgent loops route to recovery or blocked strategy only when user opts in.

### RLB-001 — review loop
- **Prompt:** “When you are preparing work for an evaluator, build the loop you usually fall into—even if you wish you did something else.”
- **Options/mechanics:** tap-order `re-read`; `fix small details`; `compare to a standard`; `ask for reassurance`; `make a new plan`; `delay`; `work late`; `stop and submit`; `other`. “It stops when: deadline arrives / I feel certain enough / someone else says it is okay / exhaustion wins / it rarely feels finished.” “If interrupted: relief / panic / irritation / nothing / other.”
- **Uncertainty/skip:** partial loop, none fit, skip/pause accepted.
- **Target fields / sections / class:** ritual, stopping rule, interruption; `IFS-06–07, IFS-09`; D.
- **Prerequisites/branches:** evaluation episode; rarely-finished → BSP-001; work late high burden → RSR.
- **Confidence/dependencies:** DS; profile needs feared outcome + repeated anchor.
- **No inference:** no OCD, perfectionism diagnosis, or manager identity without confirmation.

### RLB-002 — checking contact
- **Prompt:** “While waiting for a named person to reply, put these in the order you actually do them.”
- **Options/mechanics:** `look at the message`; `check their status`; `draft a follow-up`; `send it`; `ask another person`; `put the phone away`; `scroll to distract`; `decide not to care`; `other`. Stop condition: `they reply / I make myself stop / another task takes over / I fall asleep / no clear stop`. Relief: `settles body / only distracts / makes it worse / not sure`.
- **Uncertainty/skip:** different-person branch; skip/pause accepted.
- **Target fields / sections / class:** contact ritual, payoff/stop; `ATT-05, ATT-09, IFS-06–07`; D.
- **Prerequisites/branches:** BDA-002; repeated checking → WMA then RRE if relevant; after high activation → resource.
- **Confidence/dependencies:** DS; needs relational interpretation and response to distinguish protest from information seeking.
- **No inference:** no compulsive behavior label or anxious attachment score.

### RLB-003 — getting through overload
- **Prompt:** “When you are past your limit from noise, tasks, people, pain, or too little sleep, arrange what you actually use to get through the next hour.”
- **Options/mechanics:** `leave or get quiet`; `movement`; `food/drink`; `scroll/game`; `music`; `finish a task`; `ask someone to stay`; `sleep`; `breath`; `substance`; `other`. “What lets you stop: body feels different / task ends / I run out of energy / someone interrupts / unclear.” Rate: `changes my body / mostly distracts / sometimes worsens / not sure`.
- **Uncertainty/skip:** omit any private step; skip/pause available.
- **Target fields / sections / class:** regulation loop, stop, effect; `PV-08–10, IFS-06–07`; D.
- **Prerequisites/branches:** overload BDA; substance/private response never auto-deepens; route `SEF`/RSR.
- **Confidence/dependencies:** DS; effective channel needs repeated outcome.
- **No inference:** no substance-use diagnosis, self-harm inference, or physiological claim.

---

## BSP — Blocked-Strategy Probe

**Purpose.** Elicit protective function through a bounded counterfactual, not hidden history.  
**Mechanics.** Name the blocked move and choose likely near-term consequence.  
**Direct signals.** User-endorsed feared outcome and tolerability.  
**Inferential limits.** Does not identify an exile, origin, or objective likelihood.  
**Scoring fields.** `blocked_strategy`, feared outcome, certainty, tolerability, alternative.  
**Branching.** “Too much” stops topic; clear fear can support cautious function candidate.

### BSP-001 — cannot recheck
- **Prompt:** “Imagine you had to submit that work without one more round of checking. In the next day or two, what feels most likely or hardest to bear?”
- **Options/mechanics:** `I would miss something and be judged`; `I would let someone down`; `I would feel exposed or careless`; `I would keep thinking about it`; `I would feel uneasy without expecting one specific outcome`; `something else — type`. Tolerability: `I could sit with it / it would keep pulling at me / too much to picture`.
- **Uncertainty/skip:** `not sure`, `too much`, skip/pause accepted; too much routes resource.
- **Target fields / sections / class:** feared outcome, protective intent; `IFS-05, IFS-10`; D.
- **Prerequisites/branches:** RLB-001 or evaluation episode; typed/confirmed fear → candidate function, later PIS.
- **Confidence/dependencies:** DS; needs repeated pattern + identity confirmation for part dossier.
- **No inference:** no core wound, childhood origin, or actual incompetence claim.

### BSP-002 — cannot avoid the task
- **Prompt:** “When you are putting off a task that matters, imagine the task still has to be faced today. What feels most likely to happen inside or around you?”
- **Options/mechanics:** `I would feel flooded`; `I would fail publicly`; `I would be trapped in it`; `I would get angry or shut down`; `with someone helping me begin, I might start`; `other — type`. Choose `this fits often / one situation / not sure`.
- **Uncertainty/skip:** skip/pause available; “might start with help” routes regulation/co-regulation.
- **Target fields / sections / class:** avoided feared outcome, conditions of choice; `IFS-05, IFS-10–11, PV-09`; D.
- **Prerequisites/branches:** MS-002 delay or overload episode; flooded → lower intensity regulation item.
- **Confidence/dependencies:** DS; distinction needs horizon and actual aftermath.
- **No inference:** no executive-function diagnosis, trauma, or laziness label.

### BSP-003 — cannot leave conflict
- **Prompt:** “In a disagreement with this named person, if taking space were not possible for the next ten minutes, what would feel most likely or least bearable?”
- **Options/mechanics:** `I would say something sharp`; `I would lose words or go blank`; `I would feel cornered`; `I would keep explaining until they understand`; `a different tone might make staying possible`; `other — type`. Select `safe to imagine / not safe / not sure`.
- **Uncertainty/skip:** `not safe` ends probe and retains contextual safety flag; skip/pause accepted.
- **Target fields / sections / class:** protective function, safety/pace condition; `IFS-05, ATT-06–08, PV-07`; D.
- **Prerequisites/branches:** conflict episode + safety context; tone-change → RRE; unsafe → no deepening.
- **Confidence/dependencies:** DS; needs user confirmation and separate episode for profile.
- **No inference:** no anger risk, coercion conclusion, or attachment trait.

---

## PIS — Part Identity Sort

**Purpose.** Let the user adjudicate candidate clusters rather than equating strategies with parts.  
**Mechanics.** Show evidence-bound, nonclinical cards and allow same/ally/opponent/different/unsure, merge/split/rename.  
**Direct signals.** Identity relationship and corrections.  
**Inferential limits.** No card becomes a part without the user’s confirmation plus anchor evidence.  
**Scoring fields.** `cluster_relation`, merge/split, label, correction, confirmation.  
**Branching.** Unsure retains clusters; same opens dossier gap; opponent opens PDL.

### PIS-001 — evaluation patterns
- **Prompt:** “You described one pattern that prepares and rechecks before review, and another that takes over later by avoiding, overworking, or going numb. Do these feel like…”
- **Options/mechanics:** `the same inner pattern at different points`; `two patterns that work together`; `two patterns that fight each other`; `genuinely different`; `I cannot tell yet`. Optional label: “What would you call either one, if anything?” `type / keep functional label / no label`.
- **Uncertainty/skip:** unsure keeps separate tentative clusters; skip/pause accepted.
- **Target fields / sections / class:** cluster identity, relation, user label; `IFS-02, IFS-03, IFS-08–09`; C.
- **Prerequisites/branches:** two evidence-backed candidate clusters with episode IDs; ally/opponent → PDL; same → VFR/BSP gap.
- **Confidence/dependencies:** UC cluster status only with anchors; no confirmation = tentative cluster.
- **No inference:** no named part, role, or hidden motive from strategy similarity.

### PIS-002 — contact versus withdrawal
- **Prompt:** “With the same named close person, one pattern sends or checks for contact and another goes quiet to avoid needing anything. How do those feel in you?”
- **Options/mechanics:** `one pattern changing tactics`; `allies trying to protect me differently`; `opponents`; `different situations, not comparable`; `not sure`. Optional: `merge / keep separate / correct the description`.
- **Uncertainty/skip:** use `different situations` to route horizon/person discriminator; skip/pause available.
- **Target fields / sections / class:** relational cluster relationship; `IFS-02, IFS-08, ATT-05–06`; C.
- **Prerequisites/branches:** two concrete episodes same REF; opponent → PDL-002; different → routing discriminator.
- **Confidence/dependencies:** UC; requires direct actions/voices before dossier claim.
- **No inference:** no disorganized attachment, contradiction resolution, or single part.

### PIS-003 — body-state grouping
- **Prompt:** “The ‘restless and tight’ episode and the ‘far away and wordless’ episode: do they feel like the same pattern moving through phases, related but different, unrelated, or too early to sort?”
- **Options/mechanics:** `same pattern, different phases`; `related`; `unrelated`; `too early`; `the descriptions are wrong — edit`. Optional `what makes you say that?` brief text.
- **Uncertainty/skip:** no pressure to label; skip/pause accepted.
- **Target fields / sections / class:** user adjudication of state/cluster relation; `PV-03–05, IFS-02`; C.
- **Prerequisites/branches:** two mapped episodes; same → transition ranking; unrelated → retain separate state candidates.
- **Confidence/dependencies:** UC relation; state labels still need multivariate repeated maps.
- **No inference:** no autonomic sequence, dissociation, or part identity.

---

## PDL — Polarization Duel

**Purpose.** Capture simultaneous, competing protective moves and their cost.  
**Mechanics.** Present user-confirmed or plainly descriptive two-card tension; choose order/winner/loser aftermath.  
**Direct signals.** Conflict, sequencing, chosen behavior, cost.  
**Inferential limits.** Do not invent either side’s motive.  
**Scoring fields.** `impulse_a`, `impulse_b`, onset, winner, loser response, cost.  
**Branching.** Needs user correction; high intensity followed by resource.

### PDL-001 — submit versus perfect
- **Prompt:** “Before review, one side says ‘send it so this can end’; another keeps pushing for one more correction. When both show up, which arrives first, which usually wins, and what does the losing side do next?”
- **Options/mechanics:** first/winner: `submit / keep correcting / switch back and forth / neither`; loser: `gets louder`; `goes numb`; `creates more urgency`; `goes quiet for now`; `other`. Cost: `time / sleep / confidence / relationships / none clear / other`.
- **Uncertainty/skip:** edit either description, `not a real conflict`, skip/pause accepted.
- **Target fields / sections / class:** polarization sequence/cost; `IFS-08–09, IFS-07`; D/C.
- **Prerequisites/branches:** PIS opponent/ally and actual anchors; → FCF summary later.
- **Confidence/dependencies:** DS conflict, UC only if user approves card language; replication improves confidence.
- **No inference:** no separate parts, self-sabotage, or motive.

### PDL-002 — reach versus disappear
- **Prompt:** “After your named person goes quiet, one pull may want to get closer and another may want to disappear first. If that fits, what happens?”
- **Options/mechanics:** `reach wins`; `disappear wins`; `they alternate`; `only one is there`; `neither fits`. Then loser `keeps checking / gets sharp / goes blank / waits / other`; cost `more distance / shame / conflict / exhaustion / none clear`.
- **Uncertainty/skip:** `depends on person` → RL; skip/pause available.
- **Target fields / sections / class:** proximity/deactivation tension; `IFS-08, ATT-05–06, ATT-09`; D/C.
- **Prerequisites/branches:** PIS-002 or direct sequences; route RRE with appropriate intensity.
- **Confidence/dependencies:** DS; ATT sequence needs other response and repeated cue.
- **No inference:** no attachment category or intentional manipulation.

### PDL-003 — speak versus freeze
- **Prompt:** “During a disagreement, one side may want to explain everything and another may want to lose words or leave. Which comes first, which tends to run the next minute, and what is left afterward?”
- **Options/mechanics:** choose/order `explain / freeze / leave / smooth over / neither`; aftermath `relief / regret / fog / more fight / connection / other`.
- **Uncertainty/skip:** unsafe/too much ends topic; skip/pause accepted.
- **Target fields / sections / class:** conflict polarization, aftermath; `IFS-08, PV-07–08, ATT-07–08`; D.
- **Prerequisites/branches:** conflict episode/safety; high-arousal then regulation or secure exception.
- **Confidence/dependencies:** DS; needs body map + repair sequence for cross-framework claims.
- **No inference:** no dissociation or abuse conclusion.

---

## RMX — Relationship Matrix

**Purpose.** Compare one concise cue across named contexts without assigning a global style.  
**Mechanics.** Rows are selected referents; columns are same immediate move/meaning.  
**Direct signals.** Relationship differences and exceptions.  
**Inferential limits.** Empty cells and context differences matter; no global averaging.  
**Scoring fields.** referent-specific cue/action/interpretation, safety context.  
**Branching.** Large differences trigger relationship-specific reporting; unsafe row is context-bound.

### RMX-001 — delayed response across people
- **Prompt:** “When each of these named people is slow to reply, which first move fits best for that person?”
- **Options/mechanics:** rows `partner/closest`, `close friend`, `family person`, `reliably safer person` (only selected REF IDs); columns `check or send`; `wait and keep doing what I was doing`; `make up a worrying meaning`; `go quiet`; `depends / no recent example`. Each row has `safe/reliable context unchanged? yes / changed / not sure`.
- **Uncertainty/skip:** omit rows, `different cue`, skip/pause allowed.
- **Target fields / sections / class:** relationship-specific ambiguity/proximity/deactivation; `ATT-01–06, ATT-11`; D.
- **Prerequisites/branches:** 2+ REF IDs; worried meaning row → WMA; differences → no global comparison.
- **Confidence/dependencies:** CC only when 2+ comparable direct rows; each row remains DS.
- **No inference:** no single attachment style or blame for unsafe/unreliable referent.

### RMX-002 — asking for help
- **Prompt:** “When you need practical or emotional help from each named person, what do you actually do first?”
- **Options/mechanics:** rows selected `friend, partner, family, authority, safer person`; columns `ask directly`; `hint or wait`; `do it alone`; `ask then pull back`; `do not ask because it is not safe/available`; `not applicable`. Optional `how it usually lands: okay / awkward / ignored / costly / mixed`.
- **Uncertainty/skip:** omit any role; skip/pause accepted.
- **Target fields / sections / class:** proximity/help pattern, context, secure exception; `ATT-02, ATT-05–06, ATT-11, PV-10`; D.
- **Prerequisites/branches:** selected relevant REF IDs; `not safe` contains interpretation; direct request → RRE only if a rupture/reception exists.
- **Confidence/dependencies:** DS row data; CC requires comparable contexts.
- **No inference:** no dependency trait, self-reliance virtue, or relationship fault.

### RMX-003 — repair reception
- **Prompt:** “After you are hurt or there has been friction, when each named person reaches out, what is easiest to do with that repair?”
- **Options/mechanics:** per REF row: `respond as if it helped`; `ask for more detail`; `respond but keep distance afterward`; `feel unable to respond to it`; `do not expect repair`; `not applicable`. Residue: `minutes / hours / days / varies / not sure`.
- **Uncertainty/skip:** omit unsafe/unavailable rows; skip/pause available.
- **Target fields / sections / class:** repair reception, reassurance uptake, residue; `ATT-08–11`; D.
- **Prerequisites/branches:** 2+ relevant REF IDs; difficult landing → RRE-003; safe exception → SEF.
- **Confidence/dependencies:** DS; relationship-specific repetition needed.
- **No inference:** no forgiveness mandate, attachment label, or intent of other person.

---

## PCR — Pace Curve

**Purpose.** Record referent-specific workable/too-fast/too-slow thresholds.  
**Mechanics.** For each closeness dimension select three bands; optional examples.  
**Direct signals.** Pace comfort and conditions.  
**Inferential limits.** Thresholds are preferences/context, not avoidance/anxiety scores alone.  
**Scoring fields.** dimension, too_fast, workable, too_slow, referent, conditions.  
**Branching.** Touch omitted unless applicable; mismatches route to repair/exception.

### PCR-001 — contact pace
- **Prompt:** “With your named close person, what contact pace tends to feel like more than you want, the amount you tend to choose, or less than you want lately?”
- **Options/mechanics:** three bands for `messages`, `calls`, `time together`, `time alone`: `more than I want / the amount I tend to choose / less than I want / varies by week / not applicable`. Optional: “What changes the answer: stress / trust / conflict / logistics / other.”
- **Uncertainty/skip:** `I cannot set a general pace`, skip/pause accepted.
- **Target fields / sections / class:** contact/space thresholds, current context; `ATT-02, ATT-10`; D.
- **Prerequisites/branches:** named active REF; conflict-dependent → RRE; comparison needs another REF.
- **Confidence/dependencies:** DS; meaningful pattern requires current vs typical and relationship specificity.
- **No inference:** no clinginess, avoidance, compatibility, or obligation.

### PCR-002 — disclosure and dependence
- **Prompt:** “With this named friend or partner, when does emotional sharing or relying on each other feel sooner than you want, at a pace you tend to choose, or later than you want?”
- **Options/mechanics:** for `sharing something personal` and `asking for support`, choose `too soon`; `when there is some trust`; `only after a long time`; `I want it sooner`; `varies`; `not applicable`. Add `after conflict, this shifts: closer / farther / no change / unsure`.
- **Uncertainty/skip:** skip/pause; does not require disclosure of content.
- **Target fields / sections / class:** pace, help, context; `ATT-02, ATT-10–11`; D.
- **Prerequisites/branches:** selected close REF; distant after conflict → RRE; workable exception → SEF.
- **Confidence/dependencies:** DS; not a dimension score without episode evidence.
- **No inference:** no intimacy disorder, attachment style, or sexual assumption.

### PCR-003 — conflict and repair pace
- **Prompt:** “After a disagreement with this named person, what timing feels sooner than you want, at a pace you tend to choose, or later than you want for talking again?”
- **Options/mechanics:** bands `right away`; `within hours`; `next day`; `after several days`; `only when invited`; `varies`; `not safe/applicable`. Then `what changes the timing for you: space / clear plan / softer tone / practical repair / someone else present / other`.
- **Uncertainty/skip:** unsafe stops follow-up; skip/pause accepted.
- **Target fields / sections / class:** rupture/repair pace and conditions; `ATT-07–10, PV-08`; D.
- **Prerequisites/branches:** conflict episode/safety; → RRE if concrete.
- **Confidence/dependencies:** DS; repeated repair episodes for confidence.
- **No inference:** no avoidance, stonewalling, or relationship-quality verdict.

---

## RRE — Rupture–Repair Exchange

**Purpose.** Separate repair initiation, repair reception, reassurance uptake, and residue.  
**Mechanics.** Concrete cue followed by dual path: user reaches out vs other reaches out.  
**Direct signals.** Actual moves, response, landing, residue.  
**Inferential limits.** One exchange never establishes a stable pattern; safety context controls interpretation.  
**Scoring fields.** rupture, initiate_move, receive_move, other_response, uptake, residue, safety.  
**Branching.** High arousal requires low-intensity next item; absent repair is valid data.

### RRE-001 — user initiates
- **Prompt:** “Think of a disagreement with your named close person that you are willing to revisit. When you were the one to reopen contact, what did you actually do and what happened next?”
- **Options/mechanics:** initiation `send a direct message`; `explain my side`; `apologize first`; `act like nothing happened`; `wait for a sign`; `did not reopen`; `other`. Other response `met me / defended / delayed / minimized / did not reply / mixed`. Afterward `felt finished for now / felt partly finished / kept distance / felt worse / not sure`.
- **Uncertainty/skip:** unsafe, not willing to revisit, skip, and pause all end the probe.
- **Target fields / sections / class:** repair initiation, response, residue; `ATT-07–09, PV-08, IFS-07`; D.
- **Prerequisites/branches:** conflict episode + safety; settled → SEF; guarded → RRE-003 then resource.
- **Confidence/dependencies:** DS; relationship-specific replication/confirmation required.
- **No inference:** no protest manipulation, relationship fault, or attachment category.

### RRE-002 — other initiates after withdrawal
- **Prompt:** “After you went quiet, left, or needed space during friction with this named person, if they reached out, what was easiest to do with it?”
- **Options/mechanics:** `answer and reconnect`; `answer but keep distance`; `ask for more time`; `explain why I left`; `ignore it`; `they did not reach out`; `other`. Reassurance landing `I believed it / I wanted to but could not / I needed proof over time / it felt unsafe / not sure`.
- **Uncertainty/skip:** unsafe context ends topic; skip/pause allowed.
- **Target fields / sections / class:** deactivation, repair reception, reassurance uptake; `ATT-06–09`; D.
- **Prerequisites/branches:** concrete withdrawal + RL; hard-to-land → RRE-003; always low-intensity item next.
- **Confidence/dependencies:** DS; needs repeated cue or explicit fit confirmation.
- **No inference:** no avoidance style, punishing intent, or safety conclusion.

### RRE-003 — reassurance residue
- **Prompt:** “When this named person says or does something meant to reassure you after a rupture, how does it land over time?”
- **Options/mechanics:** `I move on without returning to it soon`; `it helps, then I need it again later`; `I hear it but my body stays on alert`; `I question it`; `it depends on what they do next`; `they do not offer reassurance / other`. Residue `minutes / hours / days / longer / not sure`.
- **Uncertainty/skip:** skip/pause accepted; no claim if no repair exists.
- **Target fields / sections / class:** uptake, time to recovery, co-regulation condition; `ATT-08–09, PV-08–10`; D.
- **Prerequisites/branches:** RRE or repair example; behavior-dependent → SEF/RMX; high intensity → resource.
- **Confidence/dependencies:** DS; replicated instances needed for pattern.
- **No inference:** no reassurance dependence or attachment score.

---

## WMA — Working-Model Attribution

**Purpose.** Separate what ambiguity seems to mean about self versus other, and whether alternatives are reachable.  
**Mechanics.** Two independent fields plus certainty/alternative reachability.  
**Direct signals.** First attribution and flexibility.  
**Inferential limits.** Thoughts are episode-bound, not factual beliefs or diagnoses.  
**Scoring fields.** cue, self_meaning, other_meaning, certainty, alternative_access.  
**Branching.** High certainty/distress routes to regulation; alternatives do not invalidate direct response.

### WMA-001 — unread message
- **Prompt:** “When your named close friend has seen your message and has not replied, before you know why, what does it seem to mean about you? Separately, what does it seem to mean about them?”
- **Options/mechanics:** self `I asked for too much / I do not matter much / I did something wrong / nothing about me / other`; other `busy or dealing with something / pulling away / upset with me / unreliable / impossible to tell / other`. Certainty `low / medium / high`; alternative `easy / possible with effort / hard to reach / not sure`.
- **Uncertainty/skip:** different person branch; skip/pause available.
- **Target fields / sections / class:** self/other attribution, flexibility; `ATT-03–04`; D.
- **Prerequisites/branches:** MS/BDA delayed reply; high distress → RSR or pause; then actual move check.
- **Confidence/dependencies:** DS; needs multiple cues or confirmation, retained per referent.
- **No inference:** no negative working model as trait, mind-reading truth, or attachment label.

### WMA-002 — criticism
- **Prompt:** “When your manager, client, instructor, or other evaluator points out a problem, what does it first seem to say about you, and what does it first seem to say about them?”
- **Options/mechanics:** self `I failed / I am not good enough / I need to fix it / there is a specific problem to respond to / other`; other `focused on a specific part of the work / impossible to satisfy / disappointed / asking for a change / not sure / other`. Certainty + alternative reachability as above.
- **Uncertainty/skip:** no applicable role routes to close-relationship feedback; skip/pause accepted.
- **Target fields / sections / class:** evaluation meaning, threat appraisal; `IFS-05, PV-06, ATT-03`; D.
- **Prerequisites/branches:** evaluation MS; `need to fix` → RLB; specific-problem framing → secure exception.
- **Confidence/dependencies:** DS; not cross-context without relational comparisons.
- **No inference:** no self-esteem score, authority trauma, or actual evaluator intent.

### WMA-003 — softened apology
- **Prompt:** “When your named person apologizes after hurting you, what does it first seem to mean about you, and separately about them?”
- **Options/mechanics:** self `my needs had a place in this / I still need to protect myself / I caused too much trouble / I do not know / other`; other `they understand / they want it over / they may change / words are not enough / other`. Alternative: `another reading comes to mind / only later / hard / not sure`.
- **Uncertainty/skip:** no apology example/not safe/skip/pause accepted.
- **Target fields / sections / class:** repair appraisal, self/other model; `ATT-03–04, ATT-08–09`; D.
- **Prerequisites/branches:** RRE repair episode; hard alternative → RRE-003; low intensity ending required.
- **Confidence/dependencies:** DS; requires actual behavior/outcome for robust repair claim.
- **No inference:** no forgiveness capacity, trust trait, or other-person sincerity.

---

## RSR — Regulation Sequence Ranking

**Purpose.** Document actual regulation/co-regulation order and body effect versus distraction.  
**Mechanics.** Rank used channels, then rate immediate and later effect.  
**Direct signals.** Strategy order, perceived body change, aggravation.  
**Inferential limits.** Does not prescribe treatment or claim mechanism.  
**Scoring fields.** channels, order, self/co-regulation, immediate/later effect, aggravators.  
**Branching.** Resource-oriented; private channels can be omitted.

### RSR-001 — after evaluation pressure
- **Prompt:** “After work-review pressure has peaked, what do you actually reach for first, second, and third to come down?”
- **Options/mechanics:** rank up to three `finish a small task`; `walk or move`; `talk it through`; `reassurance`; `music`; `food/drink`; `scroll/game`; `breath`; `sleep`; `be alone`; `other`. For each chosen: `changes my body / distracts briefly / helps later / worsens it / not sure`.
- **Uncertainty/skip:** `nothing reliably helps`, skip/pause accepted.
- **Target fields / sections / class:** recovery channels/effects; `PV-08–10, IFS-11`; D.
- **Prerequisites/branches:** BDA evaluation; no-help → SEF small exception; no high-arousal follow-up.
- **Confidence/dependencies:** DS; effective channel needs repeated favorable outcomes.
- **No inference:** no coping quality judgment or treatment recommendation.

### RSR-002 — after conflict
- **Prompt:** “After friction with this named person, before you can reconnect or decide not to, what usually helps most in the actual order you use it?”
- **Options/mechanics:** rank `space alone`; `movement`; `a clear explanation`; `their reassurance`; `talking with another person`; `music`; `task completion`; `sleep`; `food/drink`; `touch, if wanted`; `other`. Rate `body settles / thoughts settle / both / neither / worsens`.
- **Uncertainty/skip:** touch optional; unsafe relation does not ask for co-regulation; skip/pause available.
- **Target fields / sections / class:** repair/recovery channels; `PV-08–10, ATT-08–10, IFS-11`; D.
- **Prerequisites/branches:** conflict/RRE; effective explanation → PCR/RRE; resource item only next.
- **Confidence/dependencies:** DS; co-regulation needs repeat/context.
- **No inference:** no relational dependence or physiological mechanism.

### RSR-003 — brief reset now
- **Prompt:** “For the next minute, choose a realistic reset you would be willing to try right now—no option is required.”
- **Options/mechanics:** `look around the room`; `feel feet or a supported surface`; `take a drink or stretch`; `quiet / no exercise`; `save and come back`; `something else`. Then `some shift / same / harder / prefer not to say`.
- **Uncertainty/skip:** skip/pause is itself valid; never demands body awareness.
- **Target fields / sections / class:** immediate accessible resource, current burden; `PV-02, PV-09, IFS-11`; D.
- **Prerequisites/branches:** after BTM/RRE/high intensity; harder → pause/choice, never deepening.
- **Confidence/dependencies:** DS only; no stable channel claim without repetition.
- **No inference:** no regulation capacity rating or treatment effect.

---

## SEF — Secure Exception Finder

**Purpose.** Find conditions in which the usual pattern had more choice, connection, or recovery.  
**Mechanics.** Recall concrete exception then compare person/context/body/timing/action.  
**Direct signals.** Exception conditions and available choices.  
**Inferential limits.** One exception does not erase difficulty or prove safety.  
**Scoring fields.** exception cue, context, state, choice, support, outcome.  
**Branching.** Always low-to-moderate intensity and suitable after distress.

### SEF-001 — overload that did not take over
- **Prompt:** “Think of a recent time you had a lot going on but did not get pulled as far into the usual overload pattern. What was different before it built?”
- **Options/mechanics:** choose/type `more sleep or less pain`; `clearer plan`; `fewer people/noise`; `someone understood`; `I noticed earlier`; `I could leave`; `I do not know`; `other`. “What choice was available then: pause / ask / move / say no / continue differently / other.”
- **Uncertainty/skip:** no exception is valid; skip/pause accepted.
- **Target fields / sections / class:** resource conditions, choice; `PV-02, PV-09–11, IFS-11`; D.
- **Prerequisites/branches:** overload episode or S5; supports tailored resource route.
- **Confidence/dependencies:** DS; repeated exception strengthens effective channel.
- **No inference:** no resilience trait, cure, or cause of prior overload.

### SEF-002 — receiving positive attention
- **Prompt:** “Recall a time someone noticed you doing well and you could let even a little of it in. What made that moment different?”
- **Options/mechanics:** `I trusted the person`; `the praise was specific`; `I had a moment before responding`; `my body was already less keyed up`; `it was low stakes`; `I still brushed it off`; `other`. “What did you do next: thank them / share more / keep it quiet / feel a shift / other.”
- **Uncertainty/skip:** no memory/skip/pause allowed.
- **Target fields / sections / class:** secure exception, access to choice/connection; `IFS-11, PV-02, ATT-11`; D.
- **Prerequisites/branches:** FSR-002; contrast may inform VFR but no forced comparison.
- **Confidence/dependencies:** DS; user confirmation needed for broader claim.
- **No inference:** no self-worth conclusion or relationship safety guarantee.

### SEF-003 — conflict that repaired enough
- **Prompt:** “Think of a disagreement with a named person that was uncomfortable but changed course or ended differently from what you expected. What was different?”
- **Options/mechanics:** `we took space`; `tone softened`; `someone named the problem clearly`; `there was repair`; `I could leave safely`; `we changed the topic`; `not sure / other`. “Afterward I could: reconnect / stay in the room / sleep / think clearly / none of these.”
- **Uncertainty/skip:** no safe example/no memory/skip/pause accepted.
- **Target fields / sections / class:** repair conditions, social availability, resource; `ATT-08–11, PV-08–10, IFS-11`; D.
- **Prerequisites/branches:** S5 or after conflict; no deepening after this near end.
- **Confidence/dependencies:** DS; needs comparable episodes for reliable condition.
- **No inference:** no claim the relationship is healthy or prior pattern resolved.

---

## FCF — Fit Confirmation

**Purpose.** Give the user priority over model clustering and close with a correction-capable fit check.  
**Mechanics.** Show only evidence-bound summary with linked episode IDs; accept/revise/reject and per-field edits.  
**Direct signals.** Confirmation, correction, scope limits.  
**Inferential limits.** Confirmation does not manufacture missing evidence.  
**Scoring fields.** summary status, edits, rejected claims, preferred label, confidence.  
**Branching.** Corrections supersede model labels; partial fit routes only to missing field, otherwise completion.

### FCF-001 — candidate evaluation pattern
- **Prompt:** “Here is a working description built from the episodes you chose: before review, preparing or rechecking often starts first; once pressure is high, you may work harder, avoid, or go numb; the short-term aim seems to be reducing the chance of being judged. Does this fit?”
- **Options/mechanics:** `yes, keep it`; `partly — edit the trigger / sequence / aim / body description`; `no — remove it`; `too early to say`. Optional label `use my words / use a neutral working label / no label`.
- **Uncertainty/skip:** pause/skip leaves candidate tentative.
- **Target fields / sections / class:** cluster fit, role/function correction; `IFS-02–09, IFS-12`; C.
- **Prerequisites/branches:** at least two cited episodes or explicitly mark single-episode; partly → exact gap item; reject archives candidate.
- **Confidence/dependencies:** UC only for endorsed content; high dossier still requires two anchors.
- **No inference:** no part confirmation from acceptance of a generic summary; no quote unless user enters it.

### FCF-002 — state signature
- **Prompt:** “Across the two separate episodes you mapped, a working description is: when pressure rises, you first notice [user-selected signal], with [mapped regions/qualities]; speech or attention may change, and [named channel] sometimes helps afterward. Is that accurate enough?”
- **Options/mechanics:** `accurate`; `mostly, but change the first signal / body / recovery`; `not accurate`; `these were different states`; `not sure`. Free edit and “do not use this summary” available.
- **Uncertainty/skip:** skip/pause retains raw maps and avoids state profile.
- **Target fields / sections / class:** state grouping/correction; `PV-02–11`; C.
- **Prerequisites/branches:** two independent BTM maps + recovery evidence; different states → PIS-003/retain separate.
- **Confidence/dependencies:** UC plus replication supports high; no confirmation caps medium/low.
- **No inference:** no physiological state measurement or diagnosis.

### FCF-003 — relationship-specific sequence
- **Prompt:** “For your named close friend, the evidence so far suggests: delayed replies can first bring [user-selected meaning], then [actual move], and reassurance [landing/residue]. Does that fit this relationship?”
- **Options/mechanics:** `yes`; `partly — edit what it means / what I do / what helps`; `wrong`; `only true recently`; `true here but not with other people`; `too early`. Optional “what needs to stay separate?” text.
- **Uncertainty/skip:** skip/pause preserves relationship-specific evidence without summary claim.
- **Target fields / sections / class:** sequence fit, state-vs-trait, cross-relationship boundary; `ATT-02–12`; C.
- **Prerequisites/branches:** 2+ cue/response observations or explicit single-case label; recent-only → time-change discriminator; difference → RMX.
- **Confidence/dependencies:** UC supports relationship-specific medium/high with replication; CC requires matrix.
- **No inference:** no global attachment style, permanence, or other person’s intent.

## Inventory validation checklist

- All 17 family codes are present: `RL MS BDA BTM FSR VFR RLB BSP PIS PDL RMX PCR RRE WMA RSR SEF FCF`.
- Each family contains three fully voiced items (51 total), each with prompt, complete mechanics, uncertainty/skip, fields, section codes, signal class, prerequisites/branches, confidence/dependencies, and prohibited inferences.
- Direct signal collection is deliberately separated from candidate interpretation and user confirmation.
- Every high-arousal map/rupture route specifies a low-intensity, pause, or resource follow-up.
