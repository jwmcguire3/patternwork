# Patternwork Question Engine v3.1 — Core Mapping Bank

Status: complete core bank  
Bank version: `PWQE3-CMB-1.0`  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Scope: S0 calibration and S1 broad mapping. This bank creates small, coherent `EpisodeEvidence` fragments; it does not establish diagnoses, parts, autonomic physiology, attachment style, histories, or origins.

## How to read a bank item

Every rendered instance stores `bank_item_id`, `bank_version`, `RI-*`, `RR-*`, `REF-*`, the presented option order, entered/edited text, certainty, and any voluntary skip reason. A selected supplied option is an option ID and paraphrase only—not a quotation. “Direct” means the item records what the person reports. “Inferred” means a candidate for later testing, never a report claim by itself. “Confirmatory” requires an explicit later fit/identity confirmation.

`Safety context` is always interpreted before relational signals. A person may answer “unsafe or unreliable”; doing so routes away from trait-like interpretation and toward context-sensitive description or a skip. “None” and “not sure” preserve missingness; they never become negative evidence.

### Shared response controls

All applicable items show **Back**, **Save and leave**, and **Pause this topic**. Body prompts also offer “I notice this more through thoughts/actions than body sensations.” Any relationship prompt offers “This person or relationship is not applicable” before exposure to details. Items marked `higher` include a visible **Skip this memory** choice and mandatory recovery routing.

## Coverage index

| Domain / named referent | Core items | horizon(s) | usual burden | main evidence slice |
|---|---|---|---|---|
| calibration, accessibility, body confounds | `RL-101`–`RL-105` | context | low | eligible referents, safety, windows, modality, confounds |
| partner or closest attachment figure | `MS-101`, `WMA-101`, `RRE-101` | anticipation, immediate, aftermath | low–higher | ambiguity, contact move, repair reception |
| close friend | `MS-102`, `BDA-102`, `RRE-102` | immediate, aftermath | low–moderate | cancellation, conflict, repair initiation |
| parent/caregiver or formative family relationship | `MS-103`, `BDA-103` | anticipation, immediate | low–moderate | contact preparation, criticism response |
| sibling / comparable family peer | `RMX-104` | immediate | low | comparison context and differentiation |
| authority / evaluation | `BDA-105`, `FSR-105` | anticipation, immediate, aftermath | moderate | preparation, evaluation response, sequence |
| asking for help | `MS-106`, `BSP-106` | anticipation, immediate | low–moderate | request move and blocked strategy |
| success / being seen | `MS-107`, `VFR-107` | immediate, aftermath | low | receiving visibility, inner rule |
| failure / mistake | `BDA-108`, `RLB-108` | immediate, aftermath | moderate | response loop, stopping condition |
| conflict / anger | `BDA-109`, `BTM-109` | immediate, aftermath | moderate–higher | action sequence and representative body map |
| ambiguity / delayed response | `WMA-110`, `MS-110` | anticipation, immediate | low–moderate | first interpretation and actual contact move |
| money / scarcity | `MS-111`, `RLB-111` | anticipation, aftermath | low–moderate | decision pressure, monitoring/avoidance loop |
| grief / loss recall | `MS-112`, `RSR-112` | immediate, aftermath | moderate–higher | recall response and recovery channels |
| solitude / disconnection | `MS-113`, `SEF-113` | immediate, aftermath | low–moderate | what solitude becomes, a contrasting exception |
| body overload / recovery | `BTM-114`, `RSR-003`, then optional `RSR-114` | immediate, aftermath | moderate | non-diagnostic body signature, immediate transition, and later recovery detail |

The broad pass presents one or two items from a row, not every listed item. It targets at least: one relational ambiguity/repair episode, one evaluation or help episode, one success/failure episode, one body/recovery episode, and one resource or exception. It rotates interaction families and never presents more than two moderate/higher-burden items consecutively.

## S0 calibration and applicability screens

### `RL-101` v1.0 — People and roles to use today

**Eligibility/referent.** Always first; no psychological eligibility required. **Intensity/burden.** `low / 1 of 5`. **Mechanic.** Referent Lock; multi-select plus optional labels.

**Prompt.** “For the moments we ask about, which people or roles fit your life right now? You can use a label like ‘my roommate’ rather than a name.”

**Choices.**

- `closest`: “A partner, spouse, dating person, or the person I am closest to”
- `friend`: “A close friend”
- `caregiver`: “A parent, caregiver, or formative family relationship”
- `sibling`: “A sibling or family peer”
- `authority`: “A manager, teacher, coach, client, clinician, or other evaluator”
- `safe_person`: “Someone I tend to turn to when I need steadier contact”
- `none_today`: “None of these fit today; I would rather use life situations”
- `not_sure`: “I am not sure who to use yet”

For every selected role, collect an editable `referent_label`, `relationship_type`, current relevance (`currently active` / `not current but meaningful` / `prefer not to say`), and a choice to reuse it later. `none_today` enables non-relational routes and suppresses relationship-specific requirements.

**Raw/evidence fields.** `referent_id`, type, label, applicability, current relevance; supports `ATT-01`, `ATT-02`, `ATT-11`, and relationship distribution in `IFS-02`. **Signal classification.** Direct: chosen role and label. Inferred: none. Confirmatory: none.

**Limits/prohibited inference.** Role selection says nothing about attachment, family history, safety, or relationship quality. Do not require a partner, biological family, employment, or a single closest person.

**Branch rules.** A selected `closest` becomes `REF-*` and unlocks `MS-101`; `friend` unlocks `MS-102`; `caregiver` unlocks `MS-103`; `sibling` unlocks `RMX-104`; `authority` unlocks `BDA-105`. `not_sure` offers `MS-106`, `MS-107`, or body routes. **Confidence/replication.** Context only; no claim contribution. **Recovery.** None needed.

### `RL-102` v1.0 — What the relationship is like lately

**Eligibility/referent.** One selected `REF-*`; repeat only for referents actually used. **Intensity/burden.** `low / 1`. **Mechanic.** Single choice plus optional brief text.

**Prompt.** “Thinking about **[referent label]** lately, which is closest to the conditions around contact—not what you think you should feel?”

- `steady`: “Mostly predictable and respectful, even if we disagree”
- `uneven`: “There are caring moments, but I cannot count on the response”
- `strained`: “It has been tense, distant, or hard to read lately”
- `unsafe`: “There is pressure, fear, coercion, threat, or a reason to stay alert”
- `changed`: “The relationship has changed a lot recently”
- `unknown`: “I do not know enough to say”
- `skip`: “I would rather not describe this”

**Raw/evidence fields.** `relationship_safety_reliability`, `context_note`, `certainty`; supports `ATT-01`, `ATT-12`, `PV-11`, `IFS-01`. **Signal classification.** Direct: context selection. Inferred: contextual qualifier only. Confirmatory: none.

**Limits/prohibited inference.** Never score vigilance, pursuit, distance, anger, or numbing as a trait when `unsafe`, `uneven`, `strained`, or `changed` is selected. No abuse determination is made.

**Branch rules.** `unsafe` enables only user-led, low-detail episodes and tags later relational evidence `context_limited`; offer non-relational or safe-person path. `changed` requires recency tagging. **Confidence/replication.** Mandatory qualifier for any relational report claim; it does not itself raise attachment confidence. **Recovery.** None.

### `RL-103` v1.0 — Which time frame is real enough to answer

**Eligibility/referent.** Always. **Intensity/burden.** `low / 1`. **Mechanic.** Two selectors.

**Prompt.** “Use the time frame that gives you actual moments, not a perfect answer.”

Recent window: “the last two weeks,” “the last two months,” “a current life period,” “an older period that still matters,” “it changes too much to choose.” Typicality: “very typical lately,” “shows up sometimes,” “a distinct event rather than a usual one,” “I cannot tell.”

**Raw/evidence fields.** `recent_window`, `recency`, `typicality`; supports every episode’s state/trait separation and `IFS-12`, `PV-11`, `ATT-12`. **Signal classification.** Direct. **Limits.** A recent episode does not establish a longstanding pattern; an older memory does not establish current functioning. **Branch rules.** “changes too much” adds a change-over-time discriminator to later routing. **Confidence/replication.** Required contextual field; replicate across independent windows before stable wording. **Recovery.** None.

### `RL-104` v1.0 — How experience is easiest to notice

**Eligibility/referent.** Always. **Intensity/burden.** `low / 1`. **Mechanic.** Multi-select, editable.

**Prompt.** “When something gets intense, what is easiest to notice first? More than one can be true.”

“Words in my head,” “a rule without words,” “an image or scene,” “emotion,” “body sensation,” “an urge to do something,” “what I actually do,” “blankness or distance,” “it is hard to notice anything until later,” “none of these describe it.”

**Raw/evidence fields.** `accessible_modalities`, `low_interoception_or_delayed_access`; supports response rendering and `IFS-04`, `PV-11`. **Signal classification.** Direct accessibility preference, not symptom evidence. **Limits.** Do not treat blankness, low interoception, or nonverbal experience as shutdown, avoidance, dissociation, or a part. **Branch rules.** Presents action/sequence alternatives when body or words are inaccessible; never forces free text. **Confidence/replication.** Administration accommodation only. **Recovery.** None.

### `RL-105` v1.0 — Things that may be affecting body sensations today

**Eligibility/referent.** Always optional. **Intensity/burden.** `low / 1`. **Mechanic.** Private multi-select; “prefer not to say” is equivalent to unknown.

**Prompt.** “Some ordinary things can change body sensations. Is any of this likely to matter for today’s answers?”

“Pain or injury,” “illness or recovery,” “sleep change,” “medication change,” “caffeine, nicotine, alcohol, or another substance,” “hormonal or other physical change,” “sensory overload,” “I do not think so,” “I am not sure,” “prefer not to say.” Optional: “Something else that changes how my body feels.”

**Raw/evidence fields.** `body_confound_flags`, optional note; supports `PV-01`, `PV-11`, `IFS-06`. **Signal classification.** Direct possible confound. **Limits.** This neither explains away distress nor identifies a medical cause; the engine offers no medical advice. **Branch rules.** Any selected factor adds `body_context_uncertain` to body-derived candidates and prioritizes action/sequence rather than sensation labels. **Confidence/replication.** Lowers certainty of bodily interpretation until replicated in varied context. **Recovery.** None.

## S1 episode bank

### `MS-101` v1.0 — The unanswered message from the closest person

**Eligibility/referent.** `REF-*` of type closest; `RL-102` complete. **Intensity/burden.** `low–moderate / 2`; first choice is a Memory Snap.

**Prompt.** “When **[closest label]** has seen your message or has often answered by then, and the evening keeps moving with no reply, what do you actually do first?”

- `wait`: “I keep checking, but I try not to send anything yet.”
- `follow_up`: “I send another message, often softer or more casual than what I mean.”
- `explain`: “I start building reasons in my head for why the silence makes sense.”
- `pull_back`: “I decide not to need the answer and put distance between us.”
- `occupy`: “I throw myself into something else so I do not have to sit with it.”
- `continue`: “I leave my phone aside and go on with what I was doing.”
- `depends`: “It depends on what we were talking about or what is happening between us.”
- `no_memory`: “I cannot find a clear moment like this.”
- `skip`: “Skip this one.”

Then ask only the selected branch: `wait/follow_up`: “While waiting or before sending, which is closest? ‘I need to know we are okay’; ‘I should not be this much’; ‘Something is wrong’; ‘I just want the practical answer’; ‘none / hard to name.’” `pull_back/occupy`: “What does pulling back or getting busy protect you from right then?” with “feeling foolish,” “being disappointed,” “making it worse,” “feeling too much,” “something else,” “not sure.” `continue`: ask “What made it possible to leave your phone aside?” (what had been said, timing, another commitment, another source of support, body state, not sure).

**Raw/evidence fields.** trigger=`delayed_reply`, referent/context, horizon=`immediate`, `first_action`, `first_interpretation_or_felt_rule`, `action_urge`, `certainty`, `typicality`. Targets `EpisodeEvidence.actual_first_action`, `EpisodeEvidence.internal_experience`, `EpisodeEvidence.short_term_payoff`; sections `ATT-02`–`ATT-06`, `IFS-03`–`IFS-05`, `PV-06` only if later body evidence exists.

**Signal classification.** Direct: action and selected interpretation/protective function. Inferred: possible proximity-seeking or deactivation candidate. Confirmatory: a later sequence summary. **Limits/prohibited inference.** Silence response alone cannot establish attachment anxiety/avoidance, a part, abandonment fear, or a state signature. **Branch rules.** `depends` routes to `WMA-101` with a named subcontext; `no_memory/skip` routes to friend or authority episode without penalty. `unsafe/strained` context records only proportionate response. **Confidence/replication.** Direct-single; needs a second cue or confirmation for relational sequence. **Recovery.** Follow with a neutral resource/item if this feels activating.

### `WMA-101` v1.0 — What the silence seems to say

**Eligibility/referent.** A concrete delayed-response episode from `MS-101` or `MS-110`, not `unsafe` unless user elects it. **Intensity/burden.** `moderate / 2`. **Mechanic.** Working-Model Attribution; two separate selections and an alternative-reachability choice.

**Prompt.** “In that particular stretch of silence from **[referent label]**, before you had more information, what did it seem to say about *you*? And separately, what did it seem to say about *them*?”

About me: “I am not important enough,” “I am asking for too much,” “I did something wrong,” “I do not know where I stand,” “I did not connect it to myself,” “another meaning,” “not sure.” About them: “They are upset or pulling away,” “They are overwhelmed or occupied,” “They are being careless,” “They are unreliable in this situation,” “I did not decide what it meant,” “another meaning,” “not sure.” Then: “Could another explanation feel possible before a reply arrived?” — “I could think of one right away,” “maybe, but it did not land,” “not really in that moment,” “I did not look for another explanation,” “not sure.”

**Raw/evidence fields.** `first_interpretation_self`, `first_interpretation_other`, `alternative_reachability`, certainty; targets `ATT-03`, `ATT-04`, `ATT-12`; may support `IFS-04` as a non-quoted felt rule. **Signal classification.** Direct: selected meanings. Inferred: working-model candidate limited to this cue/referent. Confirmatory: user approves a later relationship-specific summary. **Limits.** Do not call options beliefs, schemas, attachment style, or quotes. Do not claim distorted thinking; context may make any option reasonable. **Branch rules.** “another meaning” accepts optional text; edited text may later be quoted only with confirmation. “not really” follows later with an exception-finder item, not immediate deepening. **Confidence/replication.** One cue = direct-single; needs another cue or confirmation. **Recovery.** `SEF-113` or `MS-107` before another high-burden relational probe.

### `RRE-101` v1.0 — A repair arrives after distance

**Eligibility/referent.** Closest `REF-*` and a recent rupture/delay only if user has one. **Intensity/burden.** `moderate / 3`. **Mechanic.** Rupture–Repair Exchange with repair received.

**Prompt.** “When **[closest label]** does come back after a tense stretch—perhaps with an explanation, apology, or warm message—what is most like your first real response?”

- “I answer in a warmer way, even if I still want to talk.”
- “I answer warmly, but I keep checking whether it will last.”
- “I need details before I can settle.”
- “I say it is fine while a part of me stays braced.”
- “I am colder than I meant to be.”
- “I do not want contact for a while.”
- “It depends on whether they actually addressed what happened.”
- “I have not had a repair like this / not sure / skip.”

If applicable: “By the next day, does the reassurance stay with you?” — “mostly,” “for a while then it fades,” “only after repeated follow-through,” “not much,” “it is not about reassurance,” “not sure.”

**Raw/evidence fields.** `repair_offered`, `repair_reception`, `reassurance_uptake`, `residue_duration`, `repair_condition`; supports `ATT-07`–`ATT-09`, `PV-08`, `IFS-09`. **Signal classification.** Direct receipt/residue. Inferred: candidate repair uptake pattern. Confirmatory: later fit statement. **Limits.** Do not equate needing detail, distance, or follow-through with pathology; no relational advice or partner judgment. **Branch rules.** “depends” captures the named condition; no repair skips to a different context. Follow with resource. **Confidence/replication.** Needs a second repair or explicit confirmation; remains referent-specific. **Recovery.** Mandatory `SEF-113`, `RSR-114`, or save/pause screen.

### `MS-102` v1.0 — The close friend cancels at the last minute

**Eligibility/referent.** Close-friend `REF-*`; context screen complete. **Intensity/burden.** `low / 1`. **Mechanic.** Memory Snap.

**Prompt.** “When **[friend label]** cancels plans close to the time—especially when you had been looking forward to them—what do you tend to do with the rest of that evening?”

- “I make another plan or use the time for something else.”
- “I say no problem, then feel flat or irritated alone.”
- “I ask what happened because I want to understand.”
- “I start wondering if I matter less to them.”
- “I withdraw and wait to see whether they reach out.”
- “I get on with something practical and do not look too closely at it.”
- “It really depends on the reason and the pattern.”
- “No clear example / skip.”

**Raw/evidence fields.** `trigger=cancellation`, horizon=`immediate/aftermath`, `first_action`, `later_internal_residue`, `relationship_context`, typicality; supports `ATT-02`–`ATT-06`, cross-referent comparison `ATT-11`, `IFS-07`. **Signal classification.** Direct action/residue; inference only candidate comparison. **Limits.** A cancellation response cannot generalize from friendship to partner, nor establish rejection sensitivity. **Branch rules.** `depends` asks which factor mattered: notice, reason, prior pattern, current energy, other; route to named episode. **Confidence/replication.** Direct-single and useful contrast only. **Recovery.** None; may precede `BDA-102` on a later screen.

### `BDA-102` v1.0 — After a disagreement with a close friend

**Eligibility/referent.** Friend `REF-*`; concrete disagreement, optional. **Intensity/burden.** `moderate / 3`. **Mechanic.** Before–During–After Strip; choose one tile in each column.

**Prompt.** “Think of a disagreement with **[friend label]** that had some charge but is okay to touch today. The day before, while it was happening, and afterward: what actually happened first in each stretch?”

Before: “I rehearsed what to say,” “I hoped it would disappear,” “I asked someone else what they thought,” “I had already decided what I wanted to say,” “I did not see it coming,” “not sure.” During: “I explained more and more,” “I went quiet,” “I became sharp or defensive,” “I tried to fix it immediately,” “I left or ended the exchange,” “I kept talking even though I felt unsettled,” “not sure.” After: “I reached out to repair,” “I waited for them,” “I replayed it,” “I felt relief once it ended,” “I distracted myself,” “we repaired in the moment,” “not sure.”

Then: “What made you choose that after-step?” — “I wanted closeness,” “I needed space,” “I feared making it worse,” “I wanted the uncertainty to end,” “I was too tired/overloaded,” “another reason,” “not sure.”

**Raw/evidence fields.** `before_action`, `during_action`, `after_action`, `protective_function`, `repair_initiation`, certainty; supports `ATT-05`–`ATT-08`, `IFS-03`, `IFS-06`–`IFS-09`, `PV-08`. **Signal classification.** Direct sequencing. Inferred: possible anticipatory/urgent/aftermath role timing, not identity. Confirmatory: later sequence fit. **Limits.** Do not call sharpness protest, quietness shutdown, or rehearsal a manager without replication/function. **Branch rules.** “not okay today” skips without collecting reason, then offers low-intensity friend cancellation or safe exception. **Confidence/replication.** One chain supports direct-single; compare with closest/authority before cross-context claim. **Recovery.** Resource route required if distress rating ≥3/5.

### `RRE-102` v1.0 — Starting repair with a friend

**Eligibility/referent.** Friend episode with unresolved or resolved disagreement. **Intensity/burden.** `low–moderate / 2`. **Mechanic.** Short message-builder with no free-text requirement.

**Prompt.** “The next time you contact **[friend label]** after a rough moment, what is closest to the first move you actually make?”

“‘Can we talk about what happened?’”, “I send something light first,” “I apologize quickly, even if I am still hurt,” “I explain my side in detail,” “I wait for them to make the first move,” “I send ordinary small talk and hope it passes,” “I decide the friendship is not worth reopening,” “it depends / not sure / skip.” Then select what would make a repair attempt feel possible: “a tone that does not feel rushed,” “time to think,” “evidence they care,” “an apology that names what happened,” “less pressure,” “something else.”

**Raw/evidence fields.** `repair_initiation_move`, `repair_threshold`, `actual_language_option`, `certainty`; supports `ATT-08`, `ATT-10`, `IFS-07`, `PV-10`. **Signal classification.** Direct. Inferred: repair-initiation candidate. Confirmatory: explicit summary later. **Limits.** Option selection is not a literal message or quote, and waiting does not prove avoidance. **Branch rules.** No repair history → retain missingness. **Confidence/replication.** Compare only with another repair exchange; no global conclusion. **Recovery.** Low burden; suitable post-conflict.

### `MS-103` v1.0 — Before seeing or calling a caregiver

**Eligibility/referent.** Caregiver/formative family `REF-*`; any current relevance. **Intensity/burden.** `low–moderate / 2`. **Mechanic.** Anticipatory Memory Snap.

**Prompt.** “Before a call, visit, or message with **[caregiver label]**, when you have a sense it may be complicated, what do you find yourself doing beforehand?”

- “I plan what I am willing to mention.”
- “I try to settle myself before I do it.”
- “I put it off until I have to do it.”
- “I reach out without much planning and see what happens.”
- “I line up an exit, task, or time limit.”
- “I ask someone else to help me decide.”
- “I do not have contact / this does not apply.”
- “It varies too much / no clear memory / skip.”

**Raw/evidence fields.** trigger=`anticipated_contact`, horizon=`anticipatory`, `preparatory_strategy`, `stopping_or_exit_rule`, `context`; supports `IFS-03`, `IFS-05`–`IFS-06`, `ATT-01`, `ATT-06`, `ATT-10`. **Signal classification.** Direct preparation. Inferred: anticipatory protective candidate. Confirmatory: only after function and identity testing. **Limits.** Never infer childhood cause, family role, or attachment style; planning may be proportionate to context. **Branch rules.** No contact records applicability only. `unsafe` keeps response descriptive and offers no deepening. **Confidence/replication.** Requires a second anticipatory example/function for role-class candidate. **Recovery.** Offer ordinary success or body-recovery next.

### `BDA-103` v1.0 — A critical or loaded comment from a caregiver

**Eligibility/referent.** Caregiver `REF-*`, concrete low-to-moderate memory, and user elects it. **Intensity/burden.** `moderate / 3`. **Mechanic.** Three-step strip with a wordless option.

**Prompt.** “While **[caregiver label]** is still in the room or on the call and says something that lands as critical or loaded, which sequence is closest?”

First hit: “my body tightens,” “I feel blank or far away,” “a rule shows up without words,” “I want to explain,” “I feel heat/anger,” “I do not notice until later.” Next move: “I defend myself,” “I smooth it over,” “I go quiet,” “I change the subject,” “I leave/end contact,” “I stay but stop sharing.” Later: “I replay it,” “I feel relieved it is over,” “I contact someone else,” “I act as if nothing happened,” “I repair with them,” “it fades,” “not sure.”

**Raw/evidence fields.** `first_signal_mode`, `first_action`, `later_residue`, `social_availability`, `context`; supports `IFS-04`–`IFS-07`, `PV-06`–`PV-08`, `ATT-06`–`ATT-08`. **Signal classification.** Direct sequence. Inferred: candidate activated/deactivated/mixed state only after body replication; candidate deactivation only within this relationship. Confirmatory: user fit review. **Limits.** Do not label blankness dissociation, heat mobilization, or silence avoidance. No origin claims. **Branch rules.** If “too much,” save incomplete record and route to `RSR-114`/pause. **Confidence/replication.** Needs body map in a separate episode and/or user confirmation. **Recovery.** Mandatory resource or pause.

### `RMX-104` v1.0 — Same family cue, different person

**Eligibility/referent.** Sibling/family-peer `REF-*` plus one other family referent, or a user-defined comparable person. **Intensity/burden.** `low / 2`. **Mechanic.** Relationship Matrix; no assumption of siblings.

**Prompt.** “When a family conversation starts comparing people—achievement, money, care, or who is ‘doing enough’—what is your first move with each person who fits?”

Rows are named selected referents. Each row offers: “I argue my case,” “I make a joke or change the subject,” “I get quieter,” “I try harder to prove myself,” “I leave or shorten contact,” “I tell myself the comparison is about the conversation, not a verdict on me,” “it depends,” “not applicable.” A final question: “Do these feel driven by the same inner pattern, related patterns, different patterns, or I cannot tell?”

**Raw/evidence fields.** `referent_specific_first_action[]`, `comparison_cue`, `same_or_different_preliminary`; supports `ATT-02`, `ATT-11`, `IFS-02`, `IFS-08`. **Signal classification.** Direct cross-referent differences. Inferred: candidate cluster distribution. Confirmatory: preliminary sort is not a Part Identity Sort; later `PIS` required for part identity. **Limits.** Do not force a sibling, interpret comparison culturally, or merge strategies into a part. **Branch rules.** One row is enough; `it depends` asks for one concrete person/event later. **Confidence/replication.** Supports relationship differentiation; not a cross-context trait claim by itself. **Recovery.** None.

### `BDA-105` v1.0 — The evaluation on the calendar

**Eligibility/referent.** Authority/evaluator `REF-*` or a non-personal evaluation context. **Intensity/burden.** `moderate / 3`. **Mechanic.** Before–During–After Strip.

**Prompt.** “When a review, audition, deadline check, performance conversation, or other evaluation is on the calendar, what happens the night before, in the moment, and after you know how it went?”

Night before: “I rehearse or over-prepare,” “I avoid looking at it,” “I make a detailed plan,” “I seek reassurance,” “I choose one more pass through it, then switch to something else,” “I cannot start.” In the moment: “I talk quickly or over-explain,” “I go very precise,” “I lose words or go blank,” “I watch their face closely,” “I become defensive,” “I focus on the literal questions and keep my answers short.” After: “I check/replay every detail,” “I work harder immediately,” “I shut it out,” “I ask for feedback,” “I switch to another activity and return only if something brings it back,” “I use a quick escape/soothing routine,” “not sure.”

**Raw/evidence fields.** `anticipatory_strategy`, `during_behavior`, `aftermath_behavior`, `actual_outcome_known`, `typicality`, `functional_cost`; supports `IFS-03`, `IFS-06`–`IFS-09`, `PV-06`–`PV-08`, `ATT-02` (authority-specific only). **Signal classification.** Direct sequence. Inferred: manager/firefighter timing candidate, only if function/urgency later collected. Confirmatory: fit confirmation. **Limits.** Do not call preparation perfectionism or attention to faces hypervigilance; no employment competence conclusion. **Branch rules.** If evaluation was genuinely threatening/unfair, tag context and do not trait-score. `cannot start` routes to `BSP-106` only if desired. **Confidence/replication.** Needs independent episode or confirmation for a protective cluster; manager→firefighter handoff requires ordered urgency evidence. **Recovery.** Route to `FSR-105` only if user reports manageable burden, otherwise a resource item.

### `FSR-105` v1.0 — The first few seconds of feedback

**Eligibility/referent.** One authority/evaluation episode. **Intensity/burden.** `moderate / 2`. **Mechanic.** First-Signal Race; rank up to three, no full introspection required.

**Prompt.** “When the feedback first lands from **[authority label]**, what arrived first, and what came next if you can tell?”

Rank cards: “a body change,” “a thought or rule,” “an emotion,” “an image or remembered scene,” “an urge to act,” “blankness/distance,” “I only noticed afterward,” “I cannot order it.” If body first/second: choose one region or “not specific”: jaw/throat, chest, stomach, face/head, hands/arms, legs/feet, whole body, quiet/numb, other. If action urge: “explain,” “fix it now,” “leave,” “freeze/hold still,” “ask a question,” “push back,” “none.”

**Raw/evidence fields.** `first_signal`, `second_signal`, `third_signal`, region, urge, certainty; supports `PV-06`, `PV-07`, `IFS-04`, `IFS-06`, `ATT-07` only where relational. **Signal classification.** Direct temporal ordering. Inferred: state entry candidate. Confirmatory: repeated mapping and user summary. **Limits.** One first signal/region cannot classify a nervous-system state or prove a part. **Branch rules.** “only afterward” routes to later aftermath item, not body-map pressure. **Confidence/replication.** Requires a second independent episode plus entry/exit/recovery for state signature. **Recovery.** Offer low-intensity success/ordinary baseline item.

### `MS-106` v1.0 — Asking someone for help

**Eligibility/referent.** Any named safe, friend, closest, authority, or non-personal support context. **Intensity/burden.** `low / 2`. **Mechanic.** Memory Snap with named request.

**Prompt.** “When you need help with something concrete—coverage, advice, money, care, a task, or emotional support—and you are deciding whether to ask **[referent label]**, what do you usually do?”

“I make the request in one message or sentence,” “I hint and hope they offer,” “I make the request smaller than I need,” “I write and rewrite the message,” “I wait until I am already overwhelmed,” “I handle it alone,” “I ask several people so no one has to carry it,” “it depends on what I need,” “I do not have someone I can ask / skip.”

**Raw/evidence fields.** `help_domain`, `request_strategy`, `referent`, horizon=`anticipatory`, `access_to_support`; supports `ATT-05`, `ATT-06`, `ATT-10`, `IFS-03`, `IFS-05`–`IFS-07`, `PV-10`. **Signal classification.** Direct action. Inferred: candidate proximity or self-protection function. Confirmatory: later blocked-strategy/function confirmation. **Limits.** Handling alone is not evidence of avoidance or lack of support; the actual availability and safety of help matters. **Branch rules.** “no one” offers no probing; route to practical resource/end options. `depends` asks request domain before later comparison. **Confidence/replication.** Direct-single; compare across help domains/referents. **Recovery.** None.

### `BSP-106` v1.0 — If the usual way of asking were unavailable

**Eligibility/referent.** One concrete help episode and user consent. **Intensity/burden.** `moderate / 3`. **Mechanic.** Blocked-Strategy Probe.

**Prompt.** “In that help situation, imagine you could not use the move you usually make—no hinting, no handling it alone, no rewriting, no waiting. What feels most likely or hardest about putting the request into plain words?”

“They might say no,” “I might look needy or incompetent,” “I might owe them something,” “I might be misunderstood,” “I might get more attention than I can handle,” “nothing in particular; it is mostly logistics,” “something else,” “I cannot tell,” “skip.” Then: “How certain is that in this situation?” — “a guess,” “somewhat likely,” “very likely from experience,” “not sure.”

**Raw/evidence fields.** `blocked_strategy`, `feared_outcome_candidate`, `outcome_certainty`, `contextual_evidence`; supports `IFS-05`, `IFS-07`, `ATT-03`, `ATT-05`, `ATT-10`. **Signal classification.** Direct: stated feared outcome and certainty. Inferred: protective function candidate. Confirmatory: later user-approved function summary. **Limits.** Do not infer hidden vulnerability, exile, developmental origin, or irrational fear. “Very likely from experience” is a context flag, not pathology. **Branch rules.** Skip routes to low-burden ordinary-success item. **Confidence/replication.** Requires another episode or explicit function confirmation for PartProfile field. **Recovery.** Mandatory low-intensity follow-up.

### `MS-107` v1.0 — Someone notices you did well

**Eligibility/referent.** Any chosen referent or group. **Intensity/burden.** `low / 1`. **Mechanic.** Memory Snap; success/resource counterweight.

**Prompt.** “When someone notices something you did well—at home, with friends, in care work, school, work, or a hobby—what do you do in the first few seconds?”

“I say thank you, then go back to what I was doing,” “I explain why it was not a big deal,” “I redirect credit,” “I get energized and want to do more,” “I feel exposed and change the subject,” “I wonder what they want from me,” “I feel proud privately but do not show much,” “it depends who is saying it,” “no clear moment.”

**Raw/evidence fields.** `trigger=positive_visibility`, `first_action`, `social_availability`, referent/context; supports `PV-02`, `PV-07`, `IFS-04`, `IFS-07`, `ATT-03`, `ATT-11`, `IFS-11`. **Signal classification.** Direct response and positive-exception data. Inferred: possible visibility-related rule; never a deficit. Confirmatory: only later fit. **Limits.** Deflecting praise cannot establish low self-worth, avoidance, or a part. **Branch rules.** `depends` locks a person for comparison. Positive response may route to `SEF-113` as a resource anchor. **Confidence/replication.** Useful contrast; no pattern without repeat. **Recovery.** Resource item by design.

### `VFR-107` v1.0 — What receiving praise asks of you

**Eligibility/referent.** Concrete success response from `MS-107`; optional. **Intensity/burden.** `low–moderate / 2`. **Mechanic.** Voice or Felt-Rule Capture with edit control.

**Prompt.** “Right as the praise lands, is there a phrase, wordless rule, image, urge, or nothing clear that fits?”

“‘Do not make a big deal of this,’” “‘Keep earning it,’” “‘They do not know the whole story,’” “‘Stay small,’” “a wordless pull to give credit away,” “an image or body urge rather than words,” “I say thanks and move on,” “something else,” “nothing clear.” Optional edit: “Change any words so it sounds like you, or leave it as a choice.”

**Raw/evidence fields.** `inner_mode`, `selected_phrase_id`, `edited_or_typed_text`, `edit_status`; supports `IFS-04`, `IFS-05`, `IFS-11`, `ATT-03`. **Signal classification.** Direct selected mode; only edited/typed text is a possible attributable excerpt after separate confirmation. Inferred: candidate rule/function. Confirmatory: explicit “this fits” later. **Limits.** Never quote a supplied option, name a part, or infer shame from deflection. **Branch rules.** Nonverbal selection routes to urge/image fields, not text. **Confidence/replication.** Requires episode replication and confirmation for profile voice. **Recovery.** None.

### `BDA-108` v1.0 — A mistake others might notice

**Eligibility/referent.** Any life domain; can be private if no one noticed. **Intensity/burden.** `moderate / 3`. **Mechanic.** Before–During–After Strip.

**Prompt.** “When you realize you made a mistake that might be noticed, what usually happens while you are still deciding what to do, as you respond, and later that day?”

Before response: “I check facts repeatedly,” “I want to hide it,” “I make a repair plan,” “I ask someone what to do,” “I freeze,” “I tell the relevant person early.” Response: “I fix it immediately,” “I explain every detail,” “I delay telling anyone,” “I apologize quickly,” “I blame myself silently,” “I become angry/defensive,” “I step away first.” Later: “I replay it,” “I keep working to cancel the feeling,” “I feel relief once it is contained,” “I avoid the task for a while,” “I seek comfort,” “I turn back to my usual tasks,” “not sure.”

**Raw/evidence fields.** `trigger=mistake`, ordered strategies, `repair_action`, payoff, residue, functional cost; supports `IFS-03`, `IFS-05`–`IFS-09`, `PV-06`–`PV-08`, `ATT-03` if self-meaning later collected. **Signal classification.** Direct chain. Inferred: candidate manager/reactive handoff based on horizon/urgency, not behavior alone. Confirmatory: later chain review. **Limits.** Do not call checking compulsive, avoidance a firefighter, or mistake response perfectionism. **Branch rules.** If error is high-stakes/current, offer practical pause and do not intensify. **Confidence/replication.** Two independent mistake/evaluation chains needed for role distribution. **Recovery.** Resource or body-recovery item after this.

### `RLB-108` v1.0 — What lets the mistake loop stop

**Eligibility/referent.** A selected loop-like response from `BDA-108`; optional. **Intensity/burden.** `moderate / 2`. **Mechanic.** Ritual Loop Builder with order and stopping rule.

**Prompt.** “After that mistake, which steps tend to happen in the order they really happen? Pick only the ones that fit, then tell us what finally lets you stop.”

Step cards: “re-check,” “re-read/rewrite,” “research more,” “ask for reassurance,” “send another clarification,” “work harder,” “avoid looking,” “scroll/eat/use something/zone out,” “talk it through,” “sleep,” “nothing repeats,” “other.” Stop cards: “I get enough evidence,” “someone reassures me,” “a deadline interrupts it,” “I get too tired,” “I decide it cannot be fixed,” “I do not really feel finished,” “other / not sure.” Interruption: “If interrupted, I feel calmer,” “unfinished/uneasy,” “more activated,” “relieved but still thinking,” “not sure.”

**Raw/evidence fields.** `ritual_steps_ordered`, `stopping_condition`, `interruption_response`, payoff/cost; supports `IFS-06`, `IFS-07`, `IFS-09`, `PV-08`. **Signal classification.** Direct actual sequence/stopping rule. Inferred: protective ritual/function candidate. Confirmatory: later user identity/function confirmation. **Limits.** Do not diagnose compulsions, addiction, or disorder; numbing card is a behavior label only. **Branch rules.** “nothing repeats” records a negative for this loop only, then route elsewhere. **Confidence/replication.** Need second episode/function to attach loop to a cluster. **Recovery.** A low-arousal resource question follows.

### `BDA-109` v1.0 — Anger during a live conflict

**Eligibility/referent.** Concrete conflict that is safe enough to recall; no current danger. **Intensity/burden.** `moderate–higher / 4`. **Mechanic.** Four-position strip; never required.

**Prompt.** “In a conflict where you felt anger rising while the other person was still there, what came just before it, what did you do first, what happened next, and what was left afterward?”

Just before: “I felt dismissed,” “I felt pressured,” “I felt misunderstood,” “a boundary was crossed,” “it built from many small things,” “I cannot name it.” First move: “my voice got sharper,” “I argued the point,” “I went quiet,” “I left,” “I tried to calm them/us,” “I froze/held still,” “I cried,” “other.” Next: “I pushed harder,” “I apologized or softened,” “I shut down,” “I got practical,” “I sought distance,” “we repaired,” “not sure.” After: “I felt relief,” “guilt,” “still charged,” “numb/flat,” “clearer,” “I replayed it,” “nothing clear.”

**Raw/evidence fields.** cue, `first_action`, `second_action`, `aftermath`, referent/safety, distress rating (optional); supports `IFS-03`, `IFS-06`–`IFS-09`, `PV-05`–`PV-08`, `ATT-05`–`ATT-08`. **Signal classification.** Direct sequence/residue. Inferred: a candidate state transition or protest/deactivation sequence, pending replication. Confirmatory: later fit. **Limits.** Anger is not automatically protest, mobilization, aggression, or a firefighter; silence is not automatically shutdown. No judgment of whose account is correct. **Branch rules.** `unsafe/current danger` exits to pause/safe support information, with no analysis. At reported activation ≥3/5, no further high-arousal item. **Confidence/replication.** Requires another conflict/rupture and body/recovery data for sequence claims. **Recovery.** Mandatory `RSR-114`, `SEF-113`, or session end on resource.

### `BTM-109` v1.0 — One body map from conflict

**Eligibility/referent.** One manageable `BDA-109` conflict episode; `RL-105` reviewed. **Intensity/burden.** `higher / 4`; optional representative map only. **Mechanic.** Body Topography Map or accessible list alternative.

**Prompt.** “For that one conflict, while it was at its strongest, where did your body become more active, and where—if anywhere—went quiet, heavy, distant, or hard to feel? You can choose ‘I do not notice body changes.’”

Active regions: face/head, jaw/throat, chest, stomach, hands/arms, legs/feet, whole body, other. Qualities after each chosen region: tight, hot, buzzy, shaky, fast, heavy, restless, tearful, pressure, other. Quieter regions: same region list plus “none,” qualities: numb, far away, heavy, slowed, blank, hard to sense, other. Then two simple changes: breath “faster/held/shallower/deeper/no change/not sure”; voice/access “more words/fewer words/different tone/could not speak/no change/not sure.”

**Raw/evidence fields.** `body_activation_map`, `body_deactivation_map`, qualities, breath, voice, `body_confound_flags`; supports `PV-03`–`PV-07`, `IFS-06`, `PV-11`. **Signal classification.** Direct self-report for one episode. Inferred: possible activated/deactivated/mixed signature only. Confirmatory: repeated map plus entry/exit/recovery and fit. **Limits.** No single region, quality, or breath pattern means a physiological state; use “self-reported signature consistent with” only after multivariate replication. **Branch rules.** Every completed map, including a low-interoception or no-change response, opens the canonical transition gate: the next rendered screen is only `RSR-003` or an eligible `SEF-*` item. Pause, save, or end may terminate with that gate pending; no other item, deepening, or `RSR-114` may intervene. **Confidence/replication.** Requires a second independent map, multiple channels, and entry/exit sequence before any state signature. **Recovery.** Mandatory canonical next screen: `RSR-003` or eligible `SEF-*`; never another conflict recall.

### `WMA-110` v1.0 — Ambiguous tone, not just delay

**Eligibility/referent.** Any selected relational `REF-*`; safety screen complete. **Intensity/burden.** `low–moderate / 2`. **Mechanic.** Working-Model Attribution with a distinct cue.

**Prompt.** “When **[referent label]** says ‘okay’ in a tone you cannot read, or seems a little different than usual, what is the first meaning you give it before you know more?”

“They are irritated with me,” “I did something wrong,” “they are having their own hard day,” “they are pulling away,” “I need more information before I decide,” “I act like it is nothing and keep moving,” “I do not usually notice tone,” “it depends on our recent context,” “not sure / skip.” Then choose actual next move: “ask what they mean,” “watch for more signs,” “send something reassuring,” “give space,” “get quieter,” “continue with the conversation as it is,” “other.”

**Raw/evidence fields.** `ambiguity_cue`, self/other implication if selected, `first_action`, alternative reachability; supports `ATT-03`–`ATT-06`, `IFS-04`, `PV-06`. **Signal classification.** Direct cue meaning/action. Inferred: relationship-specific ambiguity pattern. Confirmatory: compare with `WMA-101` and user summary. **Limits.** No global style or cognitive bias conclusion; the surrounding relationship can make the interpretation apt. **Branch rules.** “depends” asks for a recent-context tag, not more speculation. **Confidence/replication.** Pair with delayed response or rupture evidence; differences across referents are meaningful. **Recovery.** None.

### `MS-110` v1.0 — What you do while waiting for clarity

**Eligibility/referent.** A chosen ambiguity cue, including non-relational decision. **Intensity/burden.** `low / 1`. **Mechanic.** Immediate action inventory.

**Prompt.** “After that unclear moment, while you are still waiting for clarity, what do you usually find yourself doing even if you wish you did something else?”

“checking for a response,” “re-reading what happened,” “sending a follow-up,” “asking another person,” “making myself busy,” “pulling away first,” “trying to settle my body,” “leaving it alone,” “it changes by person,” “none of these / not sure.”

**Raw/evidence fields.** `actual_waiting_behavior`, horizon=`immediate`, payoff if asked later; supports `ATT-04`–`ATT-06`, `IFS-06`, `PV-08`. **Signal classification.** Direct. Inferred: waiting strategy candidate. Confirmatory: later chain. **Limits.** Checking/re-reading alone does not establish a ritual or attachment dimension. **Branch rules.** “changes by person” routes to `RMX-104` format on a future screen. **Confidence/replication.** Needs a second context for cross-context pattern. **Recovery.** Low burden.

### `MS-111` v1.0 — The moment money feels tight

**Eligibility/referent.** Any financial responsibility level; may be hypothetical current-life cue. **Intensity/burden.** `low–moderate / 2`. **Mechanic.** Memory Snap with non-assumptive wording.

**Prompt.** “When you notice a bill, balance, price, or upcoming expense that makes money feel tighter than you want, what do you do first?”

“look at every number right away,” “make a plan or list,” “put it off because I cannot face it yet,” “ask someone for help or advice,” “cut back quickly,” “spend on something small to get relief,” “tell myself it will work out and move on,” “money is not a relevant stressor for me,” “it depends / skip.”

**Raw/evidence fields.** `trigger=financial_pressure`, `first_action`, life context, horizon=`immediate`; supports `IFS-03`, `IFS-05`–`IFS-07`, `PV-06`, `PV-11`. **Signal classification.** Direct action. Inferred: candidate preparation/urgent-relief response. Confirmatory: later function and repeat. **Limits.** No socioeconomic judgment, financial advice, impulse-control conclusion, or inference of scarcity history. Actual financial constraints are contextual realities. **Branch rules.** “not relevant” is valid coverage exception. `ask help` can link to `MS-106` only on permission. **Confidence/replication.** Single-domain only unless separately repeated. **Recovery.** Offer success/resource route.

### `RLB-111` v1.0 — The money-pressure loop

**Eligibility/referent.** `MS-111` response implies repeated monitoring/avoidance/relief, and user consents. **Intensity/burden.** `moderate / 2`. **Mechanic.** Context-specific loop builder.

**Prompt.** “When money pressure sticks around, which loop, if any, is closest—not what would be best, but what really repeats?”

“check balances → make plans → check again,” “avoid opening messages → feel worse → avoid again,” “research options → get overloaded → stop,” “cut back hard → feel deprived → rebound somehow,” “talk it through → feel steadier,” “I do not have a repeating loop,” “another loop,” “not sure.” Then: “What ends it for the moment?” — “a concrete plan,” “new information,” “someone else’s help,” “I run out of energy,” “time passes,” “I do not feel finished,” “other.”

**Raw/evidence fields.** `financial_loop`, ordered steps, stopping condition, payoff/residue; supports `IFS-06`, `IFS-07`, `IFS-09`, `PV-08`. **Signal classification.** Direct repeated behavior. Inferred: protective-loop candidate. Confirmatory: later cluster identity if similar elsewhere. **Limits.** Do not diagnose compulsivity, financial irresponsibility, or derive socioeconomic identity. **Branch rules.** No loop routes out. **Confidence/replication.** Repeat in a second pressure domain before cross-domain cluster. **Recovery.** Low-intensity positive/resource item next.

### `MS-112` v1.0 — A loss that comes back unexpectedly

**Eligibility/referent.** Optional; user must elect a manageable memory. **Intensity/burden.** `moderate–higher / 4`. **Mechanic.** Memory Snap with broad loss definition.

**Prompt.** “Sometimes a person, place, role, pet, future, or other loss comes back unexpectedly—in a song, date, photo, or ordinary moment. If there is one you can touch safely today, what happens first?”

“I let myself feel it for a while,” “I get busy right away,” “I reach for someone,” “I go quiet or far away,” “I want to talk about the person/thing,” “I avoid the reminder,” “I feel warmth as well as sadness,” “nothing clear comes up,” “I would rather not go here today.”

**Raw/evidence fields.** `loss_cue` (optional broad), `first_response`, `social_move`, `access_to_mixed_affect`, horizon=`immediate`; supports `IFS-04`, `IFS-06`–`IFS-07`, `PV-04`–`PV-08`, `PV-10`, `IFS-11`. **Signal classification.** Direct response. Inferred: none beyond a candidate recovery need. Confirmatory: never required for broad mapping. **Limits.** Do not infer grief stage, trauma, depression, dissociation, or history. Loss need not be death and disclosure is never required. **Branch rules.** “rather not” immediately offers pause or resource without tracking as resistance. **Confidence/replication.** No general state claim from one loss episode. **Recovery.** Mandatory `RSR-112` or a positive/ordinary ending.

### `RSR-112` v1.0 — What helps after a loss reminder

**Eligibility/referent.** `MS-112` completed with any response; optional. **Intensity/burden.** `low / 2`. **Mechanic.** Regulation Sequence Ranking, select up to three actual channels.

**Prompt.** “After a loss reminder, what tends to help your system come back enough to continue the day? Put the first one you actually use first.”

Cards: “quiet/solitude,” “talking with someone,” “being near someone without talking,” “movement,” “music or a familiar sensory thing,” “a task/routine,” “food, drink, scrolling, or another distraction,” “sleep/rest,” “crying,” “spiritual/cultural practice,” “time,” “nothing helps much,” “other.” For each chosen: “changes how I feel in my body,” “mostly gives me a break,” “sometimes makes it worse,” “not sure.”

**Raw/evidence fields.** ordered `regulation_channels`, `body_change_vs_distraction`, `aggravating_channels`, `co_regulation`; supports `PV-08`–`PV-10`, `IFS-11`. **Signal classification.** Direct self-reported helpfulness. Inferred: regulation-channel candidate. Confirmatory: replicate across another episode. **Limits.** Distraction is not failure and does not imply numbing; do not prescribe a channel. **Branch rules.** “nothing” prompts optional pause, not a deeper probe. **Confidence/replication.** Two contexts required before calling a channel reliably helpful/aggravating. **Recovery.** This is the recovery route; end or move to neutral topic.

### `MS-113` v1.0 — An evening alone

**Eligibility/referent.** Always; no assumption that solitude is unwanted. **Intensity/burden.** `low / 1`. **Mechanic.** Memory Snap.

**Prompt.** “On an evening when you are alone and nothing urgent is demanding you, what does the space usually become after the first hour?”

“restful or spacious,” “productive because I settle into tasks,” “a chance to catch up with myself,” “lonely and I reach out,” “lonely but I do not reach out,” “restless and I fill every minute,” “flat or hard to feel anything,” “it varies a lot,” “I rarely have time alone / skip.”

**Raw/evidence fields.** `solitude_experience`, `contact_move`, `activity_pattern`, `typicality`; supports `PV-02`, `PV-04`–`PV-05`, `PV-09`, `ATT-05`–`ATT-06`, `IFS-11`. **Signal classification.** Direct ordinary state/resource information. Inferred: none until body/sequence evidence repeats. Confirmatory: exception candidate if user says it fits. **Limits.** Solitude preference is not avoidance; flatness alone is not shutdown. **Branch rules.** “varies” captures differentiator: choice, recent contact, workload, body state, safety, other. **Confidence/replication.** Provides baseline comparison, requires another ordinary-context item for PV baseline. **Recovery.** Low intensity by design.

### `SEF-113` v1.0 — When the usual pattern eased up

**Eligibility/referent.** Any prior episode with a protective/action candidate, or standalone. **Intensity/burden.** `low / 2`. **Mechanic.** Exception Finder.

**Prompt.** “Think of a similar moment when the usual pull—checking, shutting down, over-preparing, arguing, disappearing, or something else—did *not* take over as much. What was different?”

“I had recent reasons to expect a steady response from that person,” “I had more time,” “my body was less overloaded,” “the stakes were lower,” “I had enough information to decide what to do,” “someone slowed the conversation down with me,” “I had already rested/eaten/moved,” “I had more choice than usual,” “I cannot find an exception,” “something else.” Then: “What could you do in that moment that was harder in the other one?” — “ask what I mean in one question,” “wait,” “set a limit,” “take a break and say I need it,” “receive support,” “repair after a mistake,” “keep the conversation going,” “other / not sure.”

**Raw/evidence fields.** `exception_context`, `available_choice`, comparison episode IDs; supports `IFS-11`, `PV-02`, `PV-08`–`PV-10`, `ATT-10`–`ATT-11`. **Signal classification.** Direct exception/context. Inferred: conditions increasing choice/calm candidate. Confirmatory: user can endorse a later contrast summary. **Limits.** Not finding an exception is not a deficit and does not confirm a pattern. Do not call this Self or apply an attachment label. **Branch rules.** “cannot find” ends gently. **Confidence/replication.** Two exceptions or one explicit fit is needed for a resource-condition claim. **Recovery.** Designed as a terminal/resource item.

### `BTM-114` v1.0 — When the body has had too much

**Eligibility/referent.** Any manageable overload/recovery episode; medical confounds reviewed. **Intensity/burden.** `moderate / 3`. **Mechanic.** Body Topography Map plus concrete context; no relational assumption.

**Prompt.** “After a day with too much input, demand, pain, social contact, exertion, or too little rest, what changes do you notice while you are still trying to get through it?”

Choose any context: “sensory input,” “work/care demands,” “social time,” “pain/illness,” “exercise/exertion,” “sleep loss,” “many small tasks,” “other.” More-active map/list: head/face, throat/chest, stomach, hands/arms, legs, whole body, none noticed. Quieter/heavier map/list: same regions, none. Actual move: “push through,” “get very still,” “become irritable,” “lose words,” “need less contact,” “seek comfort/connection,” “rest as soon as I can,” “not sure.”

**Raw/evidence fields.** overload context, activation/deactivation regions, action, speech/social availability, confounds; supports `PV-02`–`PV-08`, `PV-11`, `IFS-06`, `IFS-11`. **Signal classification.** Direct self-report. Inferred: state signature candidate only after multivariate repeat. Confirmatory: later state-description fit. **Limits.** No physiology, sensory-processing diagnosis, medical inference, or claim that a body pattern is caused by a psychological event. **Branch rules.** “pain/illness” foregrounds context qualifier; “none noticed” uses action route. Every completed map opens the canonical transition gate: render only `RSR-003` or an eligible `SEF-*` item next. Pause, save, or end may preserve the pending gate; `RSR-114` and all other deepening wait until the canonical transition is complete. **Confidence/replication.** Requires an independent map and recovery sequence to describe a signature. **Recovery.** Mandatory canonical next screen: `RSR-003` or eligible `SEF-*`.

### `RSR-114` v1.0 — Later recovery detail after overload

**Eligibility/referent.** A prior body/activation episode only after its required immediate transition has completed: a completed `RSR-003` or eligible `SEF-*` item after `BTM-*`; or another earlier activation/recovery sequence where this detail remains evidence-relevant. **Intensity/burden.** `low / 2`. **Mechanic.** Regulation Sequence Ranking with recovery time. `RSR-114` is never the next rendered screen after a completed `BTM-*` item.

**Prompt.** “When you have had too much, what actually helps you come back enough to speak, choose, or be with people again? Put the earliest thing you tend to use first.”

“quiet/dark/less input,” “sleep or lying down,” “food/water/medication as prescribed,” “movement,” “a shower/temperature change,” “music or familiar sensory input,” “a task with clear steps,” “talking,” “being near a safe person,” “touch, if welcome,” “scrolling/TV/game,” “pushing through,” “nothing reliably helps,” “other.” Then recovery window: “minutes,” “a few hours,” “overnight,” “more than a day,” “varies,” “not sure.” And: “Which one can make things worse?” same cards plus “none noticed.”

**Raw/evidence fields.** ordered channels, `recovery_time`, `co_regulation_conditions`, `aggravating_channels`, recovery target; supports `PV-08`–`PV-10`, `PV-11`, `IFS-11`. **Signal classification.** Direct self-report. Inferred: a candidate exit path. Confirmatory: repeated across distinct episodes. **Limits.** No treatment recommendation; touch is conditional and never presumed; “pushing through” is not judged. **Branch rules.** “nothing reliably helps” gives pause/save and optional safe support resource, not more probing. **Confidence/replication.** Need repeat in another context for effective/aggravating channel claim. **Recovery.** Terminal recovery item; session can end here.

## Broad-pass routing and integrity checks

1. Start with `RL-101`–`RL-105`, but let a user skip any optional context field. Render only eligible rows.
2. Begin S1 with a low-burden concrete moment (`MS-101`, `MS-102`, `MS-106`, `MS-107`, `MS-110`, `MS-111`, or `MS-113`). Do not require all relationship classes; absence is an applicability branch, not missing compliance.
3. Choose one immediate/ambiguity episode and one anticipatory/aftermath sequence where available. A broad pass normally samples, rather than deepens, at most one higher-burden memory. It normally ends in the framework-neutral Mapping Summary; no maximum screen count or session duration is implied.
4. After `depends`, route to a named-referent/context discriminator. After a contradiction, ask on a later screen whether the difference is person, horizon, intensity, changing conditions, or different inner pattern; never average contradictions away.
5. Immediately after every completed `BTM-*`, the next rendered screen is only `RSR-003` or an eligible `SEF-*` item. Pause, save, or end may preserve a pending canonical transition; no other deepening, including `RSR-114`, may intervene. Once that transition completes, `RSR-114` is eligible only if later recovery detail remains evidence-relevant. After `BDA-109`, `MS-112`, or distress ≥3/5 without a completed `BTM-*`, route to a resource, pause, or end. No more than two moderate/higher items consecutively and no interaction family more than twice in five screens.
6. Candidate clusters may be created only as `tentative` and must retain item/response IDs. A selected option creates no exact quote, named part, body-state classification, or attachment label.

## Consumer contract: emitted fragments

Each completed item emits an `EpisodeEvidence` fragment with only observed fields, source `RR-*` IDs, `bank_item_id/version`, referent/context, structured window, administration sequence, horizon, certainty, and `evidence_grade=direct_single` unless replication is computed elsewhere. Candidate flags may be emitted as `candidate_*` with their inferential limit, but not as report-ready labels. Replication is computed only from distinct anchored episode IDs.

The scoring layer may promote evidence only under the shared contract: major part dossier = two independent episode anchors plus identity confirmation; state signature = repeated multichannel maps plus entry/exit or recovery; attachment sequence = multiple cues or explicit confirmation and remains relationship-specific unless cross-context evidence exists. The report writer must preserve `unsafe`, `changed`, confound, skip, and contradiction qualifiers, and omit unsupported material.

## Verification checklist

- [x] Calibration covers referents, safety/reliability, time window, internal modality, and body confounds.
- [x] Required domains, referents where applicable, anticipatory/immediate/aftermath horizons, and low/moderate/higher burden are indexed above.
- [x] Every item carries a versioned ID, eligibility, prompt, complete mechanics, raw/evidence fields, section codes, classification, limits, branches, confidence/replication rule, and recovery route where needed.
- [x] Family, employment, partner, money, touch, and body access are optional or user-defined.
- [x] Supplied response language is never a quote; no item assigns a diagnosis, physiology, origin, or hidden biography.
