# Patternwork Question Engine v3.1 — Adaptive Deep-Dive Banks

Status: complete authored bank  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Bank version: `3.0.0`  
Use: S2 adjudication and S3–S5 gap-driven deepening

## 1. Bank-wide rendering and evidence rules

Each interaction renders as one screen unless a numbered sequence explicitly says otherwise. The engine inserts the user's referent label, episode cue, and edited wording; it never exposes framework names. All authored choices in this file and in `05_response_option_libraries.md` are `paraphrase_candidate_only`. A selected choice is stored as an option ID and selected text, never as a quotation. Only wording the user typed, edited, or explicitly confirmed through a quote-confirmation control may be stored as `user_confirmed_wording` and quoted later.

Bank headings, module names, route labels, target-field labels, and scoring descriptors are author/scoring metadata and are never rendered. This includes `manager`, `firefighter`, `protest`, `deactivation`, `avoidance`, `secure exception`, `Self`, and state-classification language. Rendered screens use only the full prompts and mechanics choices labeled below, translated into observable behavior, access, timing, or effect; no rendered choice carries a preferred-response score.

Every screen includes `None of these`, `I cannot get a clear read`, `It depends—choose a person or moment`, `Skip this`, and `Pause and save` when applicable. Choice order is randomized except for temporal sequences. Multiple selection always includes a `Not at the same time` correction. Text entry is optional. Body maps have a region-list alternative; ordering tasks have tap-to-number and screen-reader alternatives; sliders have labeled bands and `Not measurable this way`.

Signals are recorded separately:

- `direct`: what the user reports about a specific episode or ordinary baseline.
- `confirmatory`: the user endorses, edits, splits, merges, or rejects an evidence-based summary.
- `derived_candidate`: an engine comparison or hypothesis awaiting confirmation; it is never reportable as direct evidence.

No module diagnoses, assigns a global attachment style, identifies an exile, infers trauma/developmental origin, claims measured physiology, or turns one sensation or one selected phrase into a stable pattern. Relationship interpretation is disabled until a current safety/reliability record exists. High-arousal modules are never delivered more than twice in succession. Any `pause`, distress flag, unsafe-context flag, or inability to orient routes to the common recovery sequence: stop deepening; show feet/seat/room-orientation choices without requiring breath focus; offer a familiar neutral activity, contact with a chosen safe support, save/exit, and crisis-resource language only if separately warranted by the safety system. The session resumes at a low-intensity resource or ordinary-baseline screen, never by replaying peak material. An unavailable module route is logged as route absence, not as coverage N/A.

## 2. Protective-pattern modules

### `VFR-201 v3.0.0` — Voice, mode, and function capture

- **Trigger / eligibility:** A candidate cluster `CL-*` has at least one anchored episode with a protective move and missing or ambiguous `voice_mode`, `felt_rule`, or function. Use one cluster at a time; distinct-part status is not required.
- **Intensity:** low–moderate.
- **Prompt:** “Go back to the moment with **{referent/episode cue}**, just before you **{protective move}**. What best matches what was steering you then? You do not need to hear words.”
- **Mechanics / complete options:** Single-select mode: `Words or a sentence`; `A rule I knew without words`; `A picture or scene`; `A body pull, push, brace, or freeze`; `An urge to do something immediately`; `Blankness, distance, or no access`; `More than one—let me order them`; `Something else`; uncertainty/skip controls. Then show only the matching capture: optional text with “closest rough wording is enough”; image description; region + direction; action urge from `OL-AU-*`; or blankness accessibility from `OL-BL-*`. Follow with “What was this trying to make less likely right then?” using context-specific feared outcomes, plus `I only know what it made me do`.
- **Targets / sections:** Selected option IDs remain in the `RR-*` raw response; attributable content maps to `EpisodeEvidence.internal_experience`, `EpisodeEvidence.first_impulse`, and `EpisodeEvidence.user_certainty`; confirmed aggregate modes/samples map to `PartProfile.voice_mode` and `PartProfile.voice_samples`. Protective-function evidence is represented through schema-valid `PartProfile.feared_outcomes`, `PartProfile.strategy_sequence`, and `PartProfile.short_term_payoff`, not a free-standing inferred field. Sections `IFS-04`, `IFS-05`, `IFS-12`.
- **Signal class:** Mode/content selections are direct-single; a function link is direct only if the user states it, otherwise derived-candidate.
- **Confidence / dependencies:** One episode can populate low-confidence description. Part-level voice/function requires identity confirmation plus a second episode or explicit dossier confirmation. Exact quotation requires typed, edited, or separately confirmed text.
- **Branches:** `More than one` → first-signal ordering; `blankness` → `MS-201`; `I only know the action` → retain modality unknown and route to `BSP-201`; different wording across episodes → `PIS-201`; unsafe referent → contextualize before interpretation.
- **Limits / prohibitions:** Do not force verbal speech, invent a sentence, label a part from the move alone, or infer protected childhood material/origin.
- **Recovery routing:** Follow with `BTM-202` ordinary baseline or a neutral lower-takeover exception cue if intensity rises; otherwise continue to the least intense missing field.

### `BSP-201 v3.0.0` — Blocked move, feared outcome, and protective intent

- **Trigger / eligibility:** A usual move is directly reported and the feared outcome or immediate protective aim is missing. Do not use while the person is currently in an unsafe encounter.
- **Intensity:** moderate; potentially high if the episode is recent.
- **Prompt:** “In that moment with **{referent}**, imagine the usual move—**{user move}**—was unavailable for just ten seconds. What seemed most likely to happen next, even if another part of you knew it might not?”
- **Mechanics / complete options:** Choose up to two from a context-matched `OL-FO-*` set; `Nothing specific—just unbearable pressure`; `My body would keep climbing or dropping`; `I would not know what to do`; `I cannot imagine blocking it`; `Something else`; uncertainty/skip. For each selected outcome: certainty `bare possibility / plausible / felt inevitable`; horizon `in the next minute / later that day / over time`; then “So the move was mainly trying to…” with `prevent it`, `reduce it`, `get through it`, `hide it`, `restore contact/control/space`, `I am not sure`, or user text.
- **Targets / sections:** The blocked-strategy prediction maps to `EpisodeEvidence.internal_experience`; completion/constraint evidence maps to `EpisodeEvidence.stopping_condition`, with `EpisodeEvidence.user_certainty` and `EpisodeEvidence.time_horizon` retained separately. Candidate aggregates map to `PartProfile.feared_outcomes`, cautiously stated `PartProfile.protected_feelings_or_vulnerabilities`, and `PartProfile.role_class`. `IFS-03`, `IFS-05`, `IFS-10`, `IFS-12`.
- **Signal class:** Chosen feared outcome and aim are direct-single self-report; manager/firefighter role is derived-candidate from timing + function.
- **Confidence / dependencies:** Role remains uncertain until horizon is anchored. Protected vulnerability may be described only in the user's present-tense terms. A stable feared outcome needs replication or user confirmation.
- **Branches:** “pressure only” → body/state sequence; preventive horizon → manager candidate; after breakthrough/urgent relief → firefighter candidate; mixed timing → preserve mixed/uncertain; cannot imagine blocking → ritual interruption module with opt-out.
- **Limits / prohibitions:** Never ask “what exile is underneath,” age, origin, trauma, or why the person became this way. A feared choice is not fact and not a quote.
- **Recovery routing:** Ask what is available now that makes the imagined block different from the original moment; then ordinary orientation or pause.

### `RLB-201 v3.0.0` — Ritual sequence, stopping state, and interruption

- **Trigger / eligibility:** Repeated checking, rehearsing, pleasing, avoidance, fixing, numbing, escape, shutdown, or another sequence is reported; collect on a representative episode.
- **Intensity:** moderate.
- **Prompt:** “The last time **{trigger}** set this off, what did you actually do from the first step until you could stop—or until something else stopped you?”
- **Mechanics / complete options:** Build an ordered strip from a context-specific `OL-RI-*` set, allowing repeats and user-added steps. Mark each as `inside` (attention/thought), `visible`, or `both`. Then select stopping state: `It felt settled enough`; `I got the answer/result I needed`; `The other person changed something`; `I ran out of time or energy`; `A different urgent move took over`; `I stopped but it did not feel complete`; `I do not remember`; `Other`. Interruption probe: “If the loop is interrupted after **{selected step}**, what usually happens?” Options `restart`; `go back a step`; `pressure rises`; `irritability/urgency`; `blank/drop`; `switch strategy`; `relief`; `nothing consistent`; `other`.
- **Targets / sections:** The first two episode actions map to `EpisodeEvidence.actual_first_action` and `EpisodeEvidence.second_action_or_escalation`; later selected loop steps remain in the attributed raw response/provenance and, after confirmation, populate `PartProfile.strategy_sequence`. Completion, effect, and residue map to `EpisodeEvidence.stopping_condition`, `EpisodeEvidence.short_term_payoff`, `EpisodeEvidence.helped_failed_or_worsened`, and `EpisodeEvidence.residue_duration`; profile aggregates map to `PartProfile.stopping_rules` and `PartProfile.aftereffects`. `IFS-06`, `IFS-07`, `IFS-09`; `PV-06`, `PV-08` when temporal body data also exist.
- **Signal class:** Ordered acts and stopping/interruption reports are direct-single. Calling the sequence a ritual or assigning function is derived until confirmed.
- **Confidence / dependencies:** A stable loop needs two episodes or explicit typicality confirmation. Firefighter/manager classification depends on when activation broke through and what the sequence did.
- **Branches:** New urgent strategy → cascade module; no completion → stuck/recovery module; `nothing consistent` → compare intensity or referent; marked `inside only` → do not report as overt behavior.
- **Limits / prohibitions:** Do not assume compulsion, addiction, dissociation, or pathology. Do not interpret order when recall certainty is low.
- **Recovery routing:** End by asking what happened after the loop and one neutral transition that followed; do not immediately run another interruption probe.

### `BDA-201 v3.0.0` — Immediate payoff and three kinds of cost

- **Trigger / eligibility:** A concrete move/loop has been anchored. Prefer after, not during, peak recall.
- **Intensity:** low–moderate.
- **Prompt:** “Immediately after you **{move/sequence}**, what changed first? And by **{later horizon}**, what did it cost, if anything?”
- **Mechanics / complete options:** First select payoff from `pressure down`, `more control/clarity`, `more distance`, `more contact or response`, `feel less`, `energy discharged`, `task handled`, `no relief`, `other`; magnitude `none / a little / meaningful / strong`. Then three separate optional columns using contextual `OL-CI-*`, `OL-CR-*`, `OL-CF-*`: internal, relational, functional. Each selected cost gets onset and duration. `No cost I noticed` is available independently in each column.
- **Targets / sections:** `EpisodeEvidence.short_term_payoff`, `EpisodeEvidence.costs.internal`, `EpisodeEvidence.costs.relational`, `EpisodeEvidence.costs.functional`, and `EpisodeEvidence.residue_duration`; aggregates map to `PartProfile.short_term_payoff`, `PartProfile.costs`, and `PartProfile.aftereffects`. `IFS-07`, `IFS-09`; `ATT-09` for relational residue; `PV-08` for duration only.
- **Signal class:** Direct-single; summary across episodes derived-candidate until confirmed.
- **Confidence / dependencies:** Never infer cost from the move. Stable cost claims need replication or user confirmation; each cost domain remains separable.
- **Branches:** No relief + repeated loop → stopping/stuck probe; relationship cost → rupture/repair only if safety gate passes; next-day body residue → recovery module; conflicting payoffs → person/horizon/intensity discriminator.
- **Limits / prohibitions:** Do not moralize, assume impairment, or collapse inconvenience, regret, relationship effect, and functional impact into one severity score.
- **Recovery routing:** Conclude with “Was anything protected or accomplished, even imperfectly?” and accept `not that I can tell`.

### `BTM-201 v3.0.0` — Repeated body signature for a candidate pattern

- **Trigger / eligibility:** Confirmed or likely cluster has two episode anchors; at least one body field is missing or apparently inconsistent. Check body confounds first.
- **Intensity:** moderate.
- **Prompt:** “Compare **{episode A}** and **{episode B}**. In each one, where did your body become more active, and where did it go quieter, numb, heavy, or hard to find?”
- **Mechanics / complete options:** Two side-by-side maps or region lists. For each episode mark `more active`, `less active/disappeared`, `mixed`, `no clear change`; choose up to three qualities per marked region from direction-specific `OL-BQ-*`; rate 0–4 intensity or `not measurable`; capture breath, voice, movement, orientation, temperature, muscle tone, social availability. Then compare: `mostly the same signature`; `same core with different intensity`; `different signatures`; `cannot tell`.
- **Targets / sections:** `EpisodeEvidence.body_activation_map`, `EpisodeEvidence.body_deactivation_map`, `EpisodeEvidence.breath_changes`, `EpisodeEvidence.voice_changes`, `EpisodeEvidence.movement_changes`, `EpisodeEvidence.orientation_changes`, and `EpisodeEvidence.heart_muscle_temperature`; candidate `PartProfile.body_signature`; repeated aggregates map to `StateSignature.supporting_episode_ids`, `StateSignature.body_regions`, `StateSignature.energy_direction`, `StateSignature.sensation_qualities`, `StateSignature.onset_order`, and `StateSignature.confidence`. `IFS-06`; `PV-03`–`PV-07`, `PV-11`.
- **Signal class:** Maps are direct; similarity is confirmatory; any state classification is derived-candidate.
- **Confidence / dependencies:** No state classification from one region/sensation. State report needs repeated multivariate maps plus entry/exit or recovery evidence. Part-body signature needs identity confirmation.
- **Branches:** Different signatures → identity split or intensity/horizon discriminator; low interoception → `MS-201`; mixed active/quiet → `BDA-203`; medication/pain/sleep confound → retain context flag and limit confidence.
- **Limits / prohibitions:** Self-report is not vagal or physiological measurement. Do not equate numbness with a particular mechanism or treat absence of sensation as absence of response.
- **Recovery routing:** Immediately after completion, the router must present `RSR-003` or an eligible low-intensity `SEF-*`; alternatively, honor a user-controlled pause, save, or end when permitted. A present-time body-or-environment check may occur inside that resource interaction, but no `BTM-*`, `VFR-*`, `PIS-*`, `BSP-*`, confirmation, or other deepening interaction may intervene.

### `BDA-202 v3.0.0` — Manager → breakthrough → firefighter → aftermath chain

- **Trigger / eligibility:** Evidence suggests an anticipatory/preventive move and a later urgent relief/escape/attack/shutdown move in the same episode or repeated chain. Both moves must be user-reported.
- **Intensity:** high.
- **Prompt:** “Before **{event}**, you **{preventive move}**. When that no longer held, you **{urgent move}**. Put the turning points in the order they actually happened, including what came the next morning or later.”
- **Mechanics / complete options:** Four required lanes with user correction: `Before: trying to prevent`; `Breakthrough: first sign it was not working`; `Urgent response: what I did next`; `Aftermath: body/contact/task residue`. Populate from anchored evidence plus `add`, `remove`, and `that was a different episode`. For each transition choose first signal and perceived function. Confirmation: `one chain`; `sometimes a chain`; `two unrelated patterns`; `the order does not match`; `not sure`.
- **Targets / sections:** `EpisodeEvidence.time_horizon`, `EpisodeEvidence.first_noticed_signal`, `EpisodeEvidence.onset_order`, `EpisodeEvidence.actual_first_action`, `EpisodeEvidence.second_action_or_escalation`, `EpisodeEvidence.short_term_payoff`, `EpisodeEvidence.costs`, and `EpisodeEvidence.repair_or_recovery_attempts`; `PartProfile.role_class`, `PartProfile.manager_to_firefighter_handoffs`, and `PartProfile.aftereffects`; `StateSignature.entry_paths`, `StateSignature.exit_paths`, and `StateSignature.duration_and_residue`. `IFS-03`, `IFS-09`, `IFS-12`; `PV-06`–`PV-08`.
- **Signal class:** Existing episode details are direct; the chain relationship and role names are confirmatory/derived and remain internal labels.
- **Confidence / dependencies:** Report as a cascade only when the user endorses the order and moves are anchored. Distinct parts still require identity sort; one chain may involve one mixed pattern.
- **Branches:** `two unrelated` → split candidates; `sometimes` → collect discriminator; wrong order → edit and supersede draft; high distress → recovery immediately; relationship rupture → later repair module, not adjacent.
- **Limits / prohibitions:** Behavior alone never sets role. Do not invent a hidden vulnerable part or causal biography.
- **Recovery routing:** Mandatory low-intensity present-orientation and a known helpful transition; no second high-arousal module next.

### `PDL-201 v3.0.0` — Polarization and allies

- **Trigger / eligibility:** Two user-reported impulses, rules, or clusters co-occur, alternate, or block each other. At least one anchored episode for each side.
- **Intensity:** moderate.
- **Prompt:** “In **{episode}**, one pull was **{user wording/summary A}** and another was **{B}**. Which arrived first, which usually won, and what did the other one do next?”
- **Mechanics / complete options:** For arrival: A/B/together/cannot tell. Outcome: A wins/B wins/stalemate/rapid switching/another move takes over. Losing-side next move: `gets louder`; `criticizes`; `withdraws/goes quiet`; `waits and returns later`; `changes strategy`; `joins the winner`; `nothing I can detect`; `other`. Relationship: `same internal presence in conflict`; `different but allied`; `opponents`; `one reacts to the other`; `unrelated`; `not sure`. Cost categories from `OL-CI-*` and `OL-CF-*`.
- **Targets / sections:** `PartProfile.allied_part_ids`, `PartProfile.polarized_part_ids`, `PartProfile.strategy_sequence`, `PartProfile.costs`, and `PartProfile.supporting_episode_ids`. `IFS-02`, `IFS-08`, `IFS-12`.
- **Signal class:** Timing/actions direct; relationship among candidates confirmatory.
- **Confidence / dependencies:** Do not create two parts merely because two options were selected. Alliance/polarization requires user confirmation and preferably repetition.
- **Branches:** `same presence` → merge consideration; `unrelated` → retain separate; rapid switching with body shifts → mixed-state module; unclear → do not force identity.
- **Limits / prohibitions:** No personification requirement, no assumed inner dialogue, and no claim that conflict reveals exiles or origins.
- **Recovery routing:** Ask whether either pull softens in a lower-stakes setting; route to a lower-takeover exception or access-conditions screen.

### `RSR-201 v3.0.0` — Access to curiosity, calm, compassion, and choice

- **Trigger / eligibility:** A major cluster has an anchored episode and administration is below peak activation. This is capacity-in-context, not a trait rating.
- **Intensity:** low.
- **Prompt:** “When **{pattern}** is only mildly present, which of these remain available, which do not, and what changes that access?”
- **Mechanics / complete options:** Rate separately `I can wonder what is happening`, `some physical or mental settling is available`, `I can reduce self-attack`, `I can recognize my reasons without agreeing with the move`, `I can notice more than the immediate cue`, `I can wait before the next move`, `more than one next action is available`, `contact with myself or another person remains available`, `none of these are reliably reachable`, `hard to tell`. Bands: `available now`, `available with support or time`, `not available in this state`, `this wording does not fit`. Then choose access conditions from `OL-RG-*`/`OL-CRG-*`, aggravators, and the earliest observable sign that another next move becomes available.
- **Targets / sections:** `PartProfile.self_capacity_access` and `PartProfile.blending_conditions`; applicable effects also map to `StateSignature.effective_self_regulation`, `StateSignature.effective_co_regulation`, `StateSignature.ineffective_or_aggravating_channels`, and `StateSignature.social_availability`. `IFS-11`; `PV-09`, `PV-10`; `IFS-12`.
- **Signal class:** Direct-single; stable capacity profile requires multiple contexts.
- **Confidence / dependencies:** Capacity is state- and context-dependent. `Not reachable` is not deficit evidence and may reflect current safety, pain, fatigue, or overload.
- **Branches:** wording mismatch → replace with user-defined capacities; only with a person → co-regulation; only after time → recovery curve; unsafe context → do not frame openness as preferable.
- **Limits / prohibitions:** Do not grade “Self,” prescribe calm, or interpret compassion/choice absence as pathology.
- **Recovery routing:** This is a preferred end-of-session screen; save one chosen access condition as an optional return cue.

## 3. State-signature and transition modules

### `BTM-202 v3.0.0` — Ordinary baseline and accessible range

- **Trigger / eligibility:** S0 complete; use outside peak recall and repeat on a typical-enough day if initial reading is confounded.
- **Intensity:** low.
- **Prompt:** “Think of an ordinary stretch when nothing urgent is happening—not your easiest day, just a typical lower-demand one. What are your body, attention, voice, movement, and contact with people like?”
- **Mechanics / complete options:** Complete five small cards: energy `up/steady/down/mixed/hard to detect`; breath `easy to ignore/noticeable but workable/held or effortful/variable/not accessible`; movement `available/restless/slowed/very still/variable`; attention `wide/focused/narrow/scattered/foggy`; contact `I tend to approach`, `I choose among people`, `contact takes effort`, `little or no pull toward contact`, `hard to tell`. Add body regions/qualities from `OL-BQ-BASE`. Mark typicality over recent and longer windows and confounds.
- **Targets / sections:** A baseline record uses `StateSignature.classification = baseline` plus `StateSignature.energy_direction`, `StateSignature.body_regions`, `StateSignature.breath_heart_muscle_temperature`, `StateSignature.orientation_attention`, `StateSignature.movement_access`, `StateSignature.speech_access`, `StateSignature.social_availability`, and `StateSignature.body_confounds`. `PV-02`, `PV-11`.
- **Signal class:** Direct baseline self-report.
- **Confidence / dependencies:** One day is not a trait. Baseline confidence improves with repeat sampling or typicality confirmation.
- **Branches:** `ordinary is hard to find` → choose least-demanding recent window; major confound → resample later; low access → observable behavior alternative.
- **Limits / prohibitions:** Do not call one arrangement regulated/dysregulated or compare to a normative ideal.
- **Recovery routing:** Immediately after completion, the router must present `RSR-003` or an eligible low-intensity `SEF-*`; alternatively, honor a user-controlled pause, save, or end when permitted. This baseline body map cannot itself satisfy a preceding BTM recovery requirement, and no `BTM-*`, `VFR-*`, `PIS-*`, `BSP-*`, confirmation, or other deepening interaction may intervene.

### `FSR-201 v3.0.0` — Mobilization entry and peak

- **Trigger / eligibility:** Episode includes increased energy, urgency, tension, scanning, confrontation, escape, or rapid action. Safety/context and confounds recorded.
- **Intensity:** moderate–high.
- **Prompt:** “As **{episode cue}** began, what changed first? Add the next two changes, then describe the most intense point without going back through every detail.”
- **Mechanics / complete options:** First-signal race: body region/quality, thought/rule, emotion label if available, image, action urge, speech change, orientation change, blankness. Order up to three. Peak cards cover active/quiet regions, breath, heart awareness, muscle tone, temperature, attention/orientation, movement, speech, social availability, action tendency, 0–4 intensity, duration.
- **Targets / sections:** `EpisodeEvidence.first_noticed_signal`, `EpisodeEvidence.onset_order`, body-map and breath/voice/movement/orientation fields; repeated aggregates map to `StateSignature.classification = activated`, `StateSignature.first_signals`, `StateSignature.onset_order`, `StateSignature.body_regions`, `StateSignature.breath_heart_muscle_temperature`, `StateSignature.orientation_attention`, `StateSignature.movement_access`, `StateSignature.speech_access`, `StateSignature.social_availability`, and `StateSignature.action_tendencies`. `PV-03`, `PV-06`, `PV-07`, `PV-11`; optional `IFS-06` only if linked to a confirmed pattern.
- **Signal class:** Direct-single; mobilized classification derived-candidate.
- **Confidence / dependencies:** Repeated multivariate evidence plus exit/recovery required for report-level state signature.
- **Branches:** simultaneous rise/drop → mixed module; single sensation only → gather other dimensions without classifying; blankness → accessibility module; unsafe context → proportionate-response note.
- **Limits / prohibitions:** No physiological or vagal claim; heart sensations do not imply medical cause or state class. Acute concerning physical symptoms invoke separate medical-safety copy, not interpretation.
- **Recovery routing:** Mandatory present orientation then baseline/resource question.

### `FSR-202 v3.0.0` — Deactivation entry and peak

- **Trigger / eligibility:** Episode includes heaviness, collapse, numbness, fog, withdrawal, speech loss, immobility, or reduced social access; context/confounds recorded.
- **Intensity:** moderate–high.
- **Prompt:** “In **{episode}**, when things began to go quiet, heavy, far away, or hard to reach, what disappeared or slowed first? What was the strongest point like?”
- **Mechanics / complete options:** Order up to three losses/changes: `words became hard`; `movement slowed/stopped`; `attention blurred/narrowed`; `body region went numb/absent`; `temperature changed`; `breath became faint/held/effortful`; `contact felt far or unwanted`; `memory became patchy`; `urge to curl/lie down/leave`; `other`; `cannot tell`. Peak uses region-specific quiet qualities `OL-BQ-DOWN-*`, plus speech, orientation, movement, social availability, duration.
- **Targets / sections:** `EpisodeEvidence.body_deactivation_map`, `EpisodeEvidence.first_noticed_signal`, `EpisodeEvidence.onset_order`, and `EpisodeEvidence.residue_duration`; repeated aggregates map to `StateSignature.classification = shutdown`, `StateSignature.body_regions`, `StateSignature.first_signals`, `StateSignature.onset_order`, `StateSignature.speech_access`, `StateSignature.movement_access`, `StateSignature.orientation_attention`, `StateSignature.social_availability`, and `StateSignature.duration_and_residue`. `PV-04`, `PV-06`–`PV-08`, `PV-11`.
- **Signal class:** Direct-single; shutdown classification derived-candidate.
- **Confidence / dependencies:** Needs replication and transition/recovery evidence. Low interoception and memory uncertainty are retained, not scored as stronger shutdown.
- **Branches:** active pressure co-present → mixed module; medical/sleep/substance confound → limitation; no recall → aftermath observable signs; present disorientation → stop.
- **Limits / prohibitions:** Do not equate blankness, fatigue, dissociation, depression, or physiology; no diagnosis.
- **Recovery routing:** Mandatory environment orientation and chosen gentle transition; no immediate rupture or blocked-strategy probe.

### `BDA-203 v3.0.0` — Mixed or rapidly shifting signature

- **Trigger / eligibility:** Same episode contains coexisting up/down evidence or rapid transitions, not merely two separate episodes.
- **Intensity:** moderate.
- **Prompt:** “In **{episode}**, some signals looked activated while others went quiet. Were they present together, alternating, or one turning into the other?”
- **Mechanics / complete options:** `Together at the same time`; `up first, then down`; `down first, then up`; `alternating more than once`; `different body regions did different things`; `these were separate moments`; `not sure`. Build a two-lane timeline: increasing/active and decreasing/absent, with region qualities and transition cue.
- **Targets / sections:** `StateSignature.classification = mixed`, `StateSignature.onset_order`, `StateSignature.entry_paths`, `StateSignature.exit_paths`, `StateSignature.body_regions`, `StateSignature.social_availability`, `StateSignature.speech_access`, and `StateSignature.movement_access`. `PV-05`–`PV-08`.
- **Signal class:** Direct timing choice and maps; mixed classification confirmatory/derived.
- **Confidence / dependencies:** Repeat or explicit summary confirmation required. “Mixed” remains descriptive, not causal.
- **Branches:** separate moments → split episodes; region difference only → retain multivariate description; alternating → stuck/recovery; candidate-part shifts → identity sort later.
- **Limits / prohibitions:** Do not interpret as diagnostic instability or claim competing autonomic branches.
- **Recovery routing:** Low-intensity “what sign told you the episode was ending?” then pause/baseline.

### `BDA-204 v3.0.0` — Exit, stuck point, residue, and recovery curve

- **Trigger / eligibility:** Entry/peak episode exists and `exit`, `duration`, or `recovery` is missing.
- **Intensity:** moderate.
- **Prompt:** “After the strongest point of **{episode}**, what was the first sign of change? What kept it going, and when did you feel close enough to your ordinary range again?”
- **Mechanics / complete options:** First exit sign from body/breath/orientation/movement/words/contact/action completion/sleep/time/other. Stuck factors: `cue was still present`; `mind kept replaying`; `unfinished task/ritual`; `continued contact`; `being alone`; `too much contact`; `pain/fatigue/hunger/substance`; `another wave`; `nothing clear`. Recovery bands: minutes / hours / next sleep / more than a day / did not return before another episode / unknown. Residue checklist and certainty.
- **Targets / sections:** `StateSignature.exit_paths`, `StateSignature.stuck_points`, `StateSignature.duration_and_residue`, and `StateSignature.body_confounds`; episode-specific evidence maps to `EpisodeEvidence.repair_or_recovery_attempts`, `EpisodeEvidence.helped_failed_or_worsened`, and `EpisodeEvidence.residue_duration`. `PV-08`, `PV-11`; `IFS-09`; `ATT-09` when relational.
- **Signal class:** Direct-single.
- **Confidence / dependencies:** A typical recovery curve needs replication or typicality confirmation. Never substitute duration for severity.
- **Branches:** no return → current-state check and support routing; relational stuck factor → regulation or repair later; ritual unfinished → ritual module; contradictory duration → episode-specific preservation.
- **Limits / prohibitions:** Do not infer chronic state or medical cause.
- **Recovery routing:** Ask which state with more access to words, movement, attention, or contact became available first; use it as the next low-intensity anchor.

### `RSR-202 v3.0.0` — Self-regulation: sequence and actual effect

- **Trigger / eligibility:** At least one representative activation/deactivation episode; not at peak.
- **Intensity:** low–moderate.
- **Prompt:** “Once you noticed **{state cue}**, what did you try first, second, and third—even if it was not what you wish you did? Which changed your body, which only bought time, and which made things harder?”
- **Mechanics / complete options:** Rank up to three from direction- and context-specific `OL-RG-*`; add custom. For each: actual use frequency; effect `body shifted toward ordinary range`, `emotion/thought changed but body did not`, `distracted/numbed`, `helped the task only`, `no change`, `aggravated`, `unclear`; onset and durability. Include `I did nothing I could identify`.
- **Targets / sections:** `StateSignature.effective_self_regulation`, `StateSignature.ineffective_or_aggravating_channels`, and `StateSignature.transition_target_ids`; episode-specific attempts/effects map to `EpisodeEvidence.repair_or_recovery_attempts` and `EpisodeEvidence.helped_failed_or_worsened`. `PV-09`, `PV-10`, `PV-08`; relevant `IFS-07` payoff only when tied to a cluster.
- **Signal class:** Direct-single; effectiveness summary requires repeat evidence.
- **Confidence / dependencies:** “Effective” means user-reported directional change in that context, not generally beneficial. Distinguish suppression/distraction from body change without moral ranking.
- **Branches:** other person involved → co-regulation; different effect by state direction → keep separate sets; aggravation → record and exclude as default suggestion; substance/food/scrolling → neutral effect capture, no diagnosis.
- **Limits / prohibitions:** Do not prescribe, rank virtue, or claim mechanism.
- **Recovery routing:** End with one already-demonstrated low-effort support; no forced practice.

### `RSR-203 v3.0.0` — Co-regulation, contact dose, and aggravation

- **Trigger / eligibility:** User reports another person's presence/contact altered a state. Named referent and safety gate required.
- **Intensity:** low–moderate.
- **Prompt:** “When **{referent}** was available during or after **{episode}**, what kind of contact changed things—and what kind made the pressure rise or made you go farther away?”
- **Mechanics / complete options:** Separate `reduced pressure or increased access`, `no clear change`, `increased pressure or distance`, `depends on timing` columns using `OL-CRG-*`: quiet presence, practical help, listening, explanation, reassurance, humor, space with return plan, text/voice/in-person contact, touch only if applicable, shared movement/task, advocacy, other. For each, choose dose/timing and observable effect on body, voice, orientation, movement, social availability.
- **Targets / sections:** `StateSignature.effective_co_regulation` and `StateSignature.ineffective_or_aggravating_channels`; episode-specific contact and effect map to `EpisodeEvidence.repair_or_recovery_attempts`, `EpisodeEvidence.helped_failed_or_worsened`, and `EpisodeEvidence.referent_id`. `PV-10`, `PV-08`; `ATT-09` only when reassurance uptake is separately measured.
- **Signal class:** Direct-single.
- **Confidence / dependencies:** Generalization requires replication. Safety context can explain why contact does not help.
- **Branches:** touch not applicable → omit; reassurance selected → `RRE-203` later; space helps only with return plan → pace/repair; unsafe/unreliable → report context, do not score low co-regulation capacity.
- **Limits / prohibitions:** Do not imply dependence, secure/insecure attachment, or universal benefit of closeness.
- **Recovery routing:** May end on a user-chosen helpful-contact memory or on solitude if that is the demonstrated resource.

## 4. Relationship-sequence modules

### `WMA-201 v3.0.0` — Ambiguity and working models

- **Trigger / eligibility:** A concrete ambiguous cue with a named referent; safety/reliability recorded. Do not use genuine threats as “ambiguity.”
- **Intensity:** moderate.
- **Prompt:** “When **{referent}** **{delayed reply/changed tone/cancelled/grew quiet}**, before you knew why, what did it first seem to mean about you? Separately, what did it seem to mean about **{referent}**?”
- **Mechanics / complete options:** Self attribution from context-specific `OL-AT-S-*`; other attribution from `OL-AT-O-*`; each with certainty `fleeting / possible / likely / felt certain`. Then alternative reachability: `another explanation came immediately`; `after a little time`; `only after evidence/reassurance`; `I could name one but not feel it`; `none was reachable`; `the facts available then already pointed one way`; user text.
- **Targets / sections:** `AttachmentPattern.ambiguity_cues`, `AttachmentPattern.first_interpretations`, `AttachmentPattern.working_model_self_evidence`, `AttachmentPattern.working_model_other_evidence`, and `AttachmentPattern.alternative_interpretation_reachability`; episode certainty remains in `EpisodeEvidence.user_certainty`. `ATT-03`, `ATT-04`, `ATT-12`.
- **Signal class:** Direct-single; working-model pattern across episodes is derived-candidate.
- **Confidence / dependencies:** Relationship-specific pattern needs multiple cues or explicit confirmation. Cross-relationship claims require matrix evidence.
- **Branches:** cue objectively unreliable/unsafe → contextual response path; different interpretations by referent → matrix; no interpretation/blankness → deactivation/accessibility; alternative only after reassurance → reassurance uptake later.
- **Limits / prohibitions:** Do not treat the first interpretation as belief, fact, or global self-model. No global attachment label.
- **Recovery routing:** Ask what information eventually arrived; then a neutral present-context check.

### `BDA-205 v3.0.0` — Proximity-seeking and protest sequence

- **Trigger / eligibility:** Ambiguous distance/availability cue plus an impulse or move toward contact, pressure, testing, signaling, or visible distress. Safety gate required.
- **Intensity:** moderate–high.
- **Prompt:** “After **{cue}**, what did you want to do to restore contact or get a clear response? What did you actually do first, and what happened after **{referent}** responded—or did not?”
- **Mechanics / complete options:** Select impulse from `OL-AU-REL-TOWARD`; overt first move from `OL-OM-REL-PROTEST`; second move from same set plus withdrawal/stop; other-person response `clear contact`, `partial/ambiguous`, `defensive`, `more distance`, `no response`, `not known`; next user move; immediate payoff and residue. Mark hidden vs visible.
- **Targets / sections:** `AttachmentPattern.proximity_seeking_impulses`, `AttachmentPattern.protest_sequence`, and `AttachmentPattern.reassurance_uptake`; episode sequence/effect maps to `EpisodeEvidence.first_impulse`, `EpisodeEvidence.actual_first_action`, `EpisodeEvidence.second_action_or_escalation`, `EpisodeEvidence.other_person_response`, `EpisodeEvidence.short_term_payoff`, and `EpisodeEvidence.residue_duration`. `ATT-05`, `ATT-09`, `ATT-12`; optional state fields only if directly gathered.
- **Signal class:** Direct-single; “protest” is an internal sequence label, not user-facing or diagnostic.
- **Confidence / dependencies:** Repeated cue or user-confirmed sequence required. A move in an unreliable relationship cannot be interpreted without context.
- **Branches:** impulse but no move → retain inhibition; more distance → deactivation/cascade later; clear response → reassurance uptake; unsafe coercion → safety route, suspend attachment interpretation.
- **Limits / prohibitions:** Do not label neediness/manipulation, infer motive beyond stated aim, or treat one bid as anxiety dimension.
- **Recovery routing:** Mandatory low-intensity check of current contact and a safe/neutral resource; separate from rupture probe.

### `BDA-206 v3.0.0` — Deactivation and distancing sequence

- **Trigger / eligibility:** Closeness, conflict, disappointment, demand, or ambiguity is followed by reduced contact, suppression, self-reliance, dismissal, or internal distance. Safety gate required.
- **Intensity:** moderate.
- **Prompt:** “When **{referent/cue}** made closeness feel costly or too much, what was the first move toward distance—inside or where they could see it? What did that make possible?”
- **Mechanics / complete options:** First internal move `stop wanting`, `downplay importance`, `focus on flaws`, `go blank`, `turn to tasks`, `decide to handle it alone`, `prepare to leave`, `other`; overt move from `OL-OM-REL-DISTANCE`; payoff `space`, `control`, `less feeling`, `less conflict`, `protect dignity`, `function`, `no payoff`; duration; return conditions.
- **Targets / sections:** `AttachmentPattern.deactivation_sequence`; internal experience maps to `EpisodeEvidence.internal_experience`, overt moves to `EpisodeEvidence.actual_first_action` and `EpisodeEvidence.second_action_or_escalation`, payoff to `EpisodeEvidence.short_term_payoff`, and return conditions to `EpisodeEvidence.stopping_condition` or `EpisodeEvidence.repair_or_recovery_attempts` as applicable. `ATT-06`, `ATT-09`, `ATT-12`; state fields only if directly collected.
- **Signal class:** Direct-single; avoidance estimate derived across evidence.
- **Confidence / dependencies:** Multiple cues or confirmation; relationship safety and demanded pace are required contextualizers.
- **Branches:** blankness → accessibility/state deactivation; return requires repair → repair reception; permanent distance in unsafe context → proportionate response, no attachment inference; task focus before event → possible manager horizon.
- **Limits / prohibitions:** Do not interpret boundaries, solitude, or leaving unsafe contact as defensive avoidance. No global style.
- **Recovery routing:** Ask for one context where chosen space was workable, then baseline/resource.

### `RRE-201 v3.0.0` — Rupture response

- **Trigger / eligibility:** Specific conflict, disappointment, misattunement, or trust break; named referent; safety gate passed or unsafe context explicitly retained.
- **Intensity:** high.
- **Prompt:** “After the moment with **{referent}** when something between you felt broken or off, what happened in the first hour, and what was different by the next contact?”
- **Mechanics / complete options:** Two-step strip. First hour: approach, clarify, explain, apologize, demand response, freeze, leave, go quiet, continue the usual routine without naming the break, seek third-party support, task/scroll/substance/food/sleep, other. Next contact: initiate, wait, test for a response, reduce or decline contact, answer with few words or limited detail, move toward contact, postpone contact, no next contact. Include body/social availability and safety note.
- **Targets / sections:** `AttachmentPattern.rupture_response`, with episode horizon and actions in `EpisodeEvidence.time_horizon`, `EpisodeEvidence.actual_first_action`, `EpisodeEvidence.second_action_or_escalation`, and `EpisodeEvidence.repair_or_recovery_attempts`. `ATT-07`, `ATT-08`, `ATT-12`; `PV-06`–`PV-08` if full state fields are gathered; `IFS-09` only through linked evidence.
- **Signal class:** Direct-single.
- **Confidence / dependencies:** Relationship-specific; repeated or confirmed for a typical sequence. Rupture severity and actual harm are stored separately.
- **Branches:** user initiates → `RRE-202` later; other initiates → `RRE-203` later; no safe repair possible → do not encourage contact; high activation → recover now.
- **Limits / prohibitions:** Do not normalize harm, assume mutual responsibility, or imply repair is always appropriate.
- **Recovery routing:** Mandatory recovery screen and no further high-arousal item.

### `RRE-202 v3.0.0` — Repair initiated by the user

- **Trigger / eligibility:** A specific rupture in which the user initiated or wanted to initiate contact; safe contact is plausible. Not a prompt to contact anyone now.
- **Intensity:** moderate.
- **Prompt:** “The next time you tried—or wanted—to reopen contact with **{referent}**, what did you do first? What made it feel possible, and what response were you watching for?”
- **Mechanics / complete options:** Initiation from `OL-RP-INIT-*`; preconditions `time`, `body settled`, `script`, `proof they were receptive`, `third-party support`, `practical reason`, `no precondition`, `other`; hoped-for signal `acknowledgment`, `accountability`, `warmth`, `clarity`, `changed behavior`, `space without cutoff`, `nothing specific`; actual response and next move.
- **Targets / sections:** `AttachmentPattern.repair_initiation_sequence`; episode attempts, actual response, and next move map to `EpisodeEvidence.repair_or_recovery_attempts`, `EpisodeEvidence.other_person_response`, and `EpisodeEvidence.second_action_or_escalation`. `ATT-08`, `ATT-09`, `ATT-12`.
- **Signal class:** Direct-single.
- **Confidence / dependencies:** Typical initiation pattern requires replication/confirmation. The wish to initiate is not the same as overt initiation.
- **Branches:** drafted but not sent → retain as internal move; response unsafe/dismissive → contextual route; apology used to end uncertainty → link payoff/cost without judging; no repair desired → valid endpoint.
- **Limits / prohibitions:** Do not prescribe apology, reconciliation, disclosure, or contact. Do not infer accountability from initiation alone.
- **Recovery routing:** Close with what boundary or condition would make the next step workable; then neutral/resource.

### `RRE-203 v3.0.0` — Repair received and reassurance uptake

- **Trigger / eligibility:** Specific repair or reassurance was offered by a named referent. Record content and credibility; safety gate required.
- **Intensity:** moderate.
- **Prompt:** “When **{referent}** offered **{apology/explanation/reassurance/changed behavior}**, what happened first inside you? Did the offer change what you expected then, later, or not at all?”
- **Mechanics / complete options:** First response from `OL-RP-RECV-*`; uptake bands `changed what I expected immediately`, `changed part of what I expected`, `changed what I expected only after time`, `changed what I expected only after repeated matching action`, `I understood it but my body did not shift`, `did not change what I expected`, `increased pressure or distance`, `not sure`. Evidence needed: `words`, `specific explanation`, `they named what they did and its effect`, `changed behavior`, `time`, `space`, `lower-demand contact`, `no available route`. Residue duration and next action.
- **Targets / sections:** `AttachmentPattern.repair_reception_sequence` and `AttachmentPattern.reassurance_uptake`; body effect and residue map to `EpisodeEvidence.helped_failed_or_worsened` and `EpisodeEvidence.residue_duration`. `ATT-08`, `ATT-09`, `ATT-12`; `PV-10` only for a directly observed co-regulatory effect.
- **Signal class:** Direct-single.
- **Confidence / dependencies:** Separate the credibility/adequacy of the offer from recipient uptake. Stable pattern needs multiple offers or confirmation.
- **Branches:** words/body differ → preserve split; repeated action required → lower-takeover exception/working model; increased pressure or distance → aggravation and context; coercive “reassurance” → do not score as repair.
- **Limits / prohibitions:** Do not blame the user when reassurance does not land or call an inadequate offer repair. No global style.
- **Recovery routing:** Ask what, if anything, restored present-day choice; offer pause.

### `PCR-201 v3.0.0` — Pace thresholds by dimension

- **Trigger / eligibility:** Applicable named relationship or comparison referent; user can opt out of any dimension. Safety/reliability recorded.
- **Intensity:** low.
- **Prompt:** “With **{referent/type}**, where does the pace shift from workable to too fast—or from spacious to too slow? Mark only the kinds of closeness that matter here.”
- **Mechanics / complete options:** For each applicable dimension—contact frequency, emotional disclosure, asking for help, depending on each other, physical closeness, commitment/planning, space, conflict-return pace—mark `too fast`, `workable band`, `too slow`, `not applicable`, `changes by state/context`, `cannot quantify`. Then choose first threshold signal from body, rule, urge, overt move.
- **Targets / sections:** `AttachmentPattern.pace_thresholds`, keyed to `AttachmentPattern.referent_id` and `AttachmentPattern.relationship_context`; directly observed threshold cues remain attributable episode evidence. `ATT-10`, `ATT-11`, `ATT-12`.
- **Signal class:** Direct; cross-referent comparison derived after matrix.
- **Confidence / dependencies:** Thresholds are preferences/contextual tolerances, not pathology. Estimate bands do not imply precision.
- **Branches:** changes by context → specify conflict vs calm/new vs established; touch not applicable → omit; mismatch with another referent → matrix; current coercion → safety route.
- **Limits / prohibitions:** No norm for proper closeness, monogamy, cohabitation, touch, or commitment.
- **Recovery routing:** End on one pace that has felt workable.

### `RMX-201 v3.0.0` — Cross-relationship cue matrix

- **Trigger / eligibility:** At least two applicable referents with safety records; use only concise repeated cue, never a vague global rating.
- **Intensity:** low–moderate.
- **Prompt:** “When each of these people is slower or quieter than usual, what happens first? Answer separately; differences are useful.”
- **Mechanics / complete options:** Rows are named referents; columns: first interpretation, body direction, first urge, actual move, alternative reachability, safety/reliability. Use concise contextual options from `OL-AT-*`, `OL-AU-REL-*`, `OL-OM-REL-*`; `not applicable/no memory` per cell. Follow-up: “Which rows feel like the same sequence?” `same`, `partly`, `different`, `not sure`.
- **Targets / sections:** Each row updates a referent-keyed `AttachmentPattern`; similarities/differences map to `AttachmentPattern.cross_relationship_comparisons`, while per-row cues, interpretations, impulses, and sequences map to the corresponding schema-valid attachment fields. `ATT-02`–`ATT-06`, `ATT-11`, `ATT-12`.
- **Signal class:** Cell responses direct; similarity/cross-context pattern confirmatory.
- **Confidence / dependencies:** Never average rows into a global style. Cross-context claim requires comparable cues and user confirmation.
- **Branches:** one unsafe row → context note and exclude from trait inference; `it depends` → add concrete episode; friend vs partner difference → retain; no comparable cue → choose another cue.
- **Limits / prohibitions:** Do not rank relationships or erase culture, role, power, or actual reliability differences.
- **Recovery routing:** End by identifying the row with most available choice or mark `none` without penalty.

### `SEF-201 v3.0.0` — Secure exception finder

- **Trigger / eligibility:** A usual relationship pattern is supported; use at S5 or after a high-intensity chain. Exception may involve a different person or same person/different context.
- **Intensity:** low.
- **Prompt:** “Find one time when **{usual cue}** happened but the usual **{move/state}** did not take over as strongly. What was different before, during, or after?”
- **Mechanics / complete options:** Difference categories: person/reliability, clear information, lower stakes, body state/rest/pain, pace, environment/privacy, available time, user's preparation, other person's response, support nearby, practiced option, no clear difference. Then select what remained available: words, movement, contact, boundaries, interest in what was happening, humor, waiting, repair, other. Confirm whether the same cue was followed by a different response or whether the two situations are not comparable.
- **Targets / sections:** `AttachmentPattern.secure_exceptions`; when directly supported, enabling conditions also map to `PartProfile.self_capacity_access`, `PartProfile.blending_conditions`, `StateSignature.effective_self_regulation`, or `StateSignature.effective_co_regulation`. `ATT-11`, `ATT-12`; `IFS-11`; `PV-09`, `PV-10`.
- **Signal class:** Direct-single; exception relevance confirmatory.
- **Confidence / dependencies:** Do not use one exception to negate repeated evidence. It identifies conditions, not a secure identity.
- **Branches:** different because safer → context moderator; body rested → confound/access condition; no exception → resource outside relationship or ordinary baseline; false comparison → reject.
- **Limits / prohibitions:** Do not call a person “secure,” imply the user should recreate unsafe contact, or turn the exception into advice.
- **Recovery routing:** Preferred low-intensity ending; optionally save the concrete enabling condition as a return cue.

## 5. Adjudication, accessibility, and confirmation modules

### `MS-201 v3.0.0` — Blankness, low interoception, and accessibility route

- **Trigger / eligibility:** User selects blankness, no clear body read, no inner words, patchy recall, or repeated uncertainty.
- **Intensity:** low.
- **Prompt:** “A clear inside answer may not be available. Which outside signs, if any, tell you something changed in **{episode}**?”
- **Mechanics / complete options:** `what I did`; `what I stopped doing`; `speech volume/speed/words`; `movement/posture`; `attention or mistakes`; `time passing differently`; `what another person noticed`; `device/activity record`; `aftermath`; `none accessible`; `I would rather skip`; user entry. Certainty and source are stored. Optional mode preference: concrete choices, images, action sequence, body list, short text, no introspection.
- **Targets / sections:** Accessibility mode, missingness reason, and observable-source metadata remain in the attributed `RR-*` response/provenance. Only directly supported content maps onward—for example `EpisodeEvidence.internal_experience`, `EpisodeEvidence.voice_changes`, `EpisodeEvidence.movement_changes`, `EpisodeEvidence.actual_first_action`, `EpisodeEvidence.residue_duration`, and `EpisodeEvidence.user_certainty`. Especially `IFS-04`, `PV-11`, `ATT-12`.
- **Signal class:** Direct report about accessibility/observable signs; another person's observation is attributed secondary evidence, never direct inner evidence.
- **Confidence / dependencies:** Blankness does not raise state or avoidance scores. Missing body data stays missing.
- **Branches:** action available → sequence module; aftermath available → costs/recovery; no access → skip and avoid repeated probing; accessibility preference updates renderer.
- **Limits / prohibitions:** Do not equate blankness with shutdown, dissociation, resistance, or concealment; do not force body attention or verbal inner speech.
- **Recovery routing:** Route to a concrete low-demand task or end.

### `PIS-201 v3.0.0` — Candidate identity sort: merge, split, allies, opponents

- **Trigger / eligibility:** Two or more candidate clusters have episode anchors and sufficient concrete features to compare. Never present inferred biographies.
- **Intensity:** low–moderate.
- **Prompt:** “These moments share some features, but they may not belong together. Looking at the timing, pull, body pattern, and what each was trying to prevent, how do they fit?”
- **Mechanics / complete options:** Cards show only attributable evidence IDs/summaries. Choices: `same internal presence/pattern`; `same family, different versions`; `different but allied`; `opponents`; `one follows the other`; `genuinely different`; `one card does not match`; `not enough access`. Allow drag/tap merge, split by episode, rename in user language, reject, and undo. Follow with “What is the clearest discriminator?” timing/function/voice mode/body/trigger/referent/other.
- **Targets / sections:** `PartProfile.status`, `PartProfile.identity_confirmation`, `PartProfile.supporting_episode_ids`, `PartProfile.user_label`, `PartProfile.allied_part_ids`, `PartProfile.polarized_part_ids`, and `PartProfile.manager_to_firefighter_handoffs`. `IFS-02`, `IFS-03`, `IFS-08`, `IFS-09`, `IFS-12`.
- **Signal class:** User sort is confirmatory; displayed similarities are derived-candidates.
- **Confidence / dependencies:** Major distinct part normally requires two episodes plus this identity confirmation. One detailed dossier can qualify only with explicit coherent confirmation under the contract. `not enough access` retains cluster status.
- **Branches:** merge → consolidate without deleting source IDs; split → create opaque new IDs; wrong → contradiction/correction; follows → cascade module; opponents → polarization.
- **Limits / prohibitions:** A strategy is not a part. No forced names/personification; no origin, age, exile, or trauma questions.
- **Recovery routing:** Follow with a resource/choice item, not a new high-arousal dossier.

### `FCF-201 v3.0.0` — Fit confirmation and correction

- **Trigger / eligibility:** Evidence-based summary exists for a candidate part, state signature, attachment sequence, or cross-framework chain; run before report handoff and after a `cap_low` or `omit_claim` contradiction is resolved or explicitly retained.
- **Intensity:** low.
- **Prompt:** “Here is the shortest summary supported by your answers. What fits, what needs changing, and what remains uncertain?”
- **Mechanics / complete options:** Show traceable clauses separately: trigger; horizon; inner mode/wording; body signature; impulse/action; feared outcome/function; payoff/cost; relationship/context; recovery/repair. Each clause: `matches`, `close—edit`, `fits only when…`, `does not match`, `not enough evidence`, `do not include`. Text edits optional. Separate control: `You may quote my edited words` / `Keep as paraphrase only`. Final whole-summary choice: matches/partly matches/does not match/undetermined.
- **Targets / sections:** Corrections update the specific schema-valid evidence field and its provenance; object-level effects update the applicable `EpisodeEvidence.confidence` / `EpisodeEvidence.contradiction_ids`, `PartProfile.confidence` / `PartProfile.contradiction_ids`, `StateSignature.confidence` / `StateSignature.contradiction_ids`, or `AttachmentPattern.confidence` / `AttachmentPattern.contradiction_ids`. Quote eligibility remains on the corrected `AttributedText`; report inclusion/exclusion stays in the fit response and evidence-packet assembly controls. All relevant sections, including `IFS-12`, `PV-11`, `ATT-12`.
- **Signal class:** Confirmatory; user edits become direct user-entered wording. Rejection supersedes candidate inference but never deletes raw evidence.
- **Confidence / dependencies:** Confirmation can support medium confidence with direct evidence; high still requires relevant replication and no major contradiction. Quote permission applies only to exact edited/typed string.
- **Branches:** `true only when` → person/horizon/intensity/state/change-over-time discriminator; wrong → revise or downgrade; do not include → exclusion flag; unresolved contradiction → preserve Amber/low or unsupported.
- **Limits / prohibitions:** Do not pressure agreement, interpret rejection as defensiveness, or silently rewrite user corrections. Generated names are working labels only.
- **Recovery routing:** End with `RSR-201`, `SEF-201`, or a neutral baseline choice. This is the final gate before report packet creation.

## 6. Selection and sufficiency notes

The router chooses a module only when its expected coverage gain or contradiction reduction exceeds its burden. A complete dossier is not required for every candidate. Priority order is: safety/context → missing direct fields → identity/referent discrimination → replication → confirmation → resources. Attachment modules remain keyed to `REF-*`; state modules remain descriptive and multivariate; part modules remain clusters until `PIS-201` or an equivalent explicit confirmation resolves identity.

No bank module alone establishes a high-confidence report section. The scoring engine must enforce the dependencies written above, retain contradicted evidence, and route all user corrections as higher-priority evidence without destroying provenance.
