# Patternwork Question Engine v3.1 — Contextual Response-Option Libraries

Status: complete authored library  
Release package: `3.1.0`  
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`  
Library version: `3.1.0`

## 1. Use and provenance contract

These libraries are rendering resources, not scales. The renderer selects the smallest context-matched set, normally 5–9 authored choices plus uncertainty/custom controls; it does not pool every option into a generic list. Options may be randomized within compatible groups. The engine records `library_set_id`, `option_id`, presented wording, selection order, response certainty, and any user edit.

Option availability is a route-level condition. An authored `not applicable` response can contribute to coverage only through an explicit section-level applicability rule that preserves its reason and evidence ID; it is otherwise distinct from skipped or unknown.

**Every authored choice below has status `paraphrase_candidate_only`.** Selecting it does not create a verbatim quote and does not prove the interpretation implied by its wording. Only user-typed text, a user edit, or a separate explicit confirmation may become `user_confirmed_wording`; quote permission is stored independently. Reports cite option IDs as structured self-report, not as quoted speech.

Every rendered set appends context-matched controls: `none_of_these`, `unclear`, `depends_on_person_or_moment`, `something_else` with optional text, `skip`, and `pause_save`. “Not applicable” appears wherever eligibility can vary. Sets support single-select, multi-select with caps, order/rank, intensity bands, and non-drag alternatives. Options carry no preferred-response score.

## 2. Body qualities by region and state direction

Body options are always rendered after a region and direction are chosen. A single selection never classifies a state. The required multivariate fields—energy direction, breath, muscle tone, temperature, orientation, movement, speech, social availability, onset, duration, and recovery—remain separate.

### `OL-BQ-BASE-01` — Ordinary workable baseline

`status: paraphrase_candidate_only`; use: typical-enough low-demand period; select up to three per region.

- `BASE-01` — “Present but easy to ignore.”
- `BASE-02` — “Loose enough to move without thinking about it.”
- `BASE-03` — “Steady pressure or contact.”
- `BASE-04` — “Warm or evenly held.”
- `BASE-05` — “Light, open, or roomy.”
- `BASE-06` — “A familiar background tightness.”
- `BASE-07` — “Low sensation, but I can find the area if I look.”
- `BASE-08` — “Variable even when nothing urgent is happening.”

### `OL-BQ-UP-HEAD-01` — Head/face becoming more active

`status: paraphrase_candidate_only`; use: activation direction `up` in head, face, jaw, eyes.

- `UP-H-01` — “Pressure behind my eyes or forehead.”
- `UP-H-02` — “Jaw or teeth tightening.”
- `UP-H-03` — “Heat rising into my face.”
- `UP-H-04` — “Buzzing, rushing, or crowded.”
- `UP-H-05` — “Eyes locked on one thing.”
- `UP-H-06` — “Eyes scanning for what changed.”
- `UP-H-07` — “Sound or light felt sharper.”
- `UP-H-08` — “A headache-like build without knowing what it meant.”

### `OL-BQ-DOWN-HEAD-01` — Head/face becoming quieter or less accessible

`status: paraphrase_candidate_only`; use: deactivation direction `down/absent` in head/face.

- `DOWN-H-01` — “Foggy or slowed.”
- `DOWN-H-02` — “Far away from my face.”
- `DOWN-H-03` — “Heavy eyelids or a pull to close my eyes.”
- `DOWN-H-04` — “Words stopped forming.”
- `DOWN-H-05` — “Sounds felt distant or muffled.”
- `DOWN-H-06` — “My gaze dropped or would not settle.”
- `DOWN-H-07` — “Blank rather than quietly aware.”
- `DOWN-H-08` — “I cannot recover a clear memory of this area.”

### `OL-BQ-UP-THROAT-CHEST-01` — Throat/chest becoming more active

`status: paraphrase_candidate_only`; use: active direction in throat, chest, upper back.

- `UP-TC-01` — “Throat tightening around words.”
- `UP-TC-02` — “Chest pressure or bracing.”
- `UP-TC-03` — “Heart pounding or suddenly noticeable.”
- `UP-TC-04` — “Breath high, quick, held, or effortful.”
- `UP-TC-05` — “Heat, burning, or a rising wave.”
- `UP-TC-06` — “A push to speak, explain, or get out.”
- `UP-TC-07` — “Shoulders lifting toward my ears.”
- `UP-TC-08` — “A tight band across my upper back.”

### `OL-BQ-DOWN-THROAT-CHEST-01` — Throat/chest becoming quieter

`status: paraphrase_candidate_only`; use: quiet/absent direction in throat/chest.

- `DOWN-TC-01` — “Voice became faint, flat, or unavailable.”
- `DOWN-TC-02` — “Chest felt hollow or dropped.”
- `DOWN-TC-03` — “Breath was hard to notice.”
- `DOWN-TC-04` — “Upper body folded or sank.”
- `DOWN-TC-05` — “Cold spreading through my chest.”
- `DOWN-TC-06` — “Little sense of heartbeat or movement.”
- `DOWN-TC-07` — “Words were there, but I could not send them out.”
- `DOWN-TC-08` — “The whole area felt far away.”

### `OL-BQ-UP-GUT-PELVIS-01` — Gut/pelvis becoming more active

`status: paraphrase_candidate_only`; use: active direction in abdomen, low back, pelvis.

- `UP-GP-01` — “Stomach clenched or dropped sharply.”
- `UP-GP-02` — “Fluttering, churning, or nausea.”
- `UP-GP-03` — “A hard brace through my middle.”
- `UP-GP-04` — “Heat or pressure low in my body.”
- `UP-GP-05` — “An urgent need to move or use the bathroom.”
- `UP-GP-06` — “Low back tightening.”
- `UP-GP-07` — “A pull inward as if protecting my center.”
- `UP-GP-08` — “Sharp, restless energy without a clear emotion.”

### `OL-BQ-DOWN-GUT-PELVIS-01` — Gut/pelvis becoming quieter

`status: paraphrase_candidate_only`; use: down/absent direction in abdomen/pelvis.

- `DOWN-GP-01` — “Heavy or weighted.”
- `DOWN-GP-02` — “Hollow or empty.”
- `DOWN-GP-03` — “Numb or hard to locate.”
- `DOWN-GP-04` — “Soft collapse rather than release.”
- `DOWN-GP-05` — “Cold or drained.”
- `DOWN-GP-06` — “No appetite or no sense of hunger.”
- `DOWN-GP-07` — “A pull to curl inward.”
- `DOWN-GP-08` — “I noticed the area only later.”

### `OL-BQ-UP-ARMS-HANDS-01` — Arms/hands becoming more active

`status: paraphrase_candidate_only`; use: mobilization in arms/hands.

- `UP-AH-01` — “Hands restless, tapping, or reaching.”
- `UP-AH-02` — “Fists or grip tightening.”
- `UP-AH-03` — “Tingling, buzzing, or shaking.”
- `UP-AH-04` — “A push to type, fix, point, or hold on.”
- `UP-AH-05` — “Arms ready to block or push away.”
- `UP-AH-06` — “Heat or sweat in my hands.”
- `UP-AH-07` — “Movements faster or less precise.”

### `OL-BQ-DOWN-ARMS-HANDS-01` — Arms/hands becoming quieter

`status: paraphrase_candidate_only`; use: reduced access in arms/hands.

- `DOWN-AH-01` — “Heavy at my sides.”
- `DOWN-AH-02` — “Cold or numb fingers.”
- `DOWN-AH-03` — “Hard to start a movement.”
- `DOWN-AH-04` — “Grip weakened or objects felt far away.”
- `DOWN-AH-05` — “Hands went still even while my mind was active.”
- `DOWN-AH-06` — “I stopped noticing them.”

### `OL-BQ-UP-LEGS-FEET-01` — Legs/feet becoming more active

`status: paraphrase_candidate_only`; use: mobilization in legs/feet.

- `UP-LF-01` — “Ready to leave, pace, or stand.”
- `UP-LF-02` — “Bouncing, shaking, or unable to settle.”
- `UP-LF-03` — “Muscles braced to hold position.”
- `UP-LF-04` — “Heat or pins-and-needles.”
- `UP-LF-05` — “A push forward before I had decided.”
- `UP-LF-06` — “Feet pressing hard into the floor.”

### `OL-BQ-DOWN-LEGS-FEET-01` — Legs/feet becoming quieter

`status: paraphrase_candidate_only`; use: reduced movement/access in legs/feet.

- `DOWN-LF-01` — “Heavy, weak, or hard to move.”
- `DOWN-LF-02` — “Cold or numb.”
- `DOWN-LF-03` — “Knees soft or giving way.”
- `DOWN-LF-04` — “A pull to sit or lie down.”
- `DOWN-LF-05` — “Feet felt far from me.”
- `DOWN-LF-06` — “Stillness that did not feel chosen.”

### `OL-BQ-MIXED-01` — Simultaneous or alternating directions

`status: paraphrase_candidate_only`; use only after the user reports both active and quiet signals.

- `MIX-01` — “My mind raced while my body felt heavy.”
- `MIX-02` — “My chest was activated while my limbs went still.”
- `MIX-03` — “I switched between restless and dropped.”
- `MIX-04` — “One region braced while another disappeared.”
- `MIX-05` — “I had urgency without usable movement.”
- `MIX-06` — “There was little visible movement while the inside was surging.”
- `MIX-07` — “The directions changed too quickly to order.”

## 3. Action urges by trigger and direction

### `OL-AU-EVAL-BEFORE-01` — Before evaluation, exposure, or possible failure

`status: paraphrase_candidate_only`; horizon: anticipatory.

- `AU-EB-01` — “Prepare until there is less room for surprise.”
- `AU-EB-02` — “Check for the mistake before anyone else sees it.”
- `AU-EB-03` — “Rehearse what I will say and how they may respond.”
- `AU-EB-04` — “Make myself useful or easy to approve of.”
- `AU-EB-05` — “Delay, avoid, or find a reason not to be seen.”
- `AU-EB-06` — “Get it over with before I can think more.”
- `AU-EB-07` — “Keep options open so I am not trapped by one outcome.”

### `OL-AU-EVAL-HIT-01` — When criticism, error, or exposure lands

`status: paraphrase_candidate_only`; horizon: immediate/after breakthrough.

- `AU-EH-01` — “Explain what happened immediately.”
- `AU-EH-02` — “Fix it before I feel anything else.”
- `AU-EH-03` — “Argue with the judgment.”
- `AU-EH-04` — “Disappear from view or stop responding.”
- `AU-EH-05` — “Attack myself before they can.”
- `AU-EH-06` — “Do something fast to shut the pressure off.”
- `AU-EH-07` — “Act as though it does not matter.”

### `OL-AU-REL-TOWARD-01` — Ambiguous distance: toward contact

`status: paraphrase_candidate_only`; relationship-specific.

- `AU-RT-01` — “Reach out once and look for a clear sign.”
- `AU-RT-02` — “Send more so they understand how important it is.”
- `AU-RT-03` — “Ask directly whether something changed.”
- `AU-RT-04` — “Make myself more appealing, helpful, or easy.”
- `AU-RT-05` — “Create a reason for contact that feels safer than asking.”
- `AU-RT-06` — “Show that I am hurt without saying it directly.”
- `AU-RT-07` — “Get proof before I can settle.”

### `OL-AU-REL-AWAY-01` — Closeness, conflict, or ambiguity: toward distance

`status: paraphrase_candidate_only`; relationship-specific.

- `AU-RA-01` — “Pull back before they can decide for me.”
- `AU-RA-02` — “Stop needing an answer.”
- `AU-RA-03` — “Handle it alone and say less.”
- `AU-RA-04` — “Focus on the parts of the relationship I dislike or distrust.”
- `AU-RA-05` — “End the conversation or leave the space.”
- `AU-RA-06` — “Continue the usual routine and put the feeling somewhere else.”
- `AU-RA-07` — “Make more room without ending contact.”

### `OL-AU-CONFLICT-01` — While conflict is live

`status: paraphrase_candidate_only`; use with named referent and safety gate.

- `AU-CF-01` — “Push until the point is understood.”
- `AU-CF-02` — “Find the exact words that will make this make sense.”
- `AU-CF-03` — “Agree or soften it so the tension stops.”
- `AU-CF-04` — “Go quiet so the tension does not increase.”
- `AU-CF-05` — “Leave and return only when I have control.”
- `AU-CF-06` — “Say something sharp enough to create distance.”
- `AU-CF-07` — “Solve the practical issue and skip the emotional one.”

### `OL-AU-OVERLOAD-01` — Sensory, emotional, or task overload

`status: paraphrase_candidate_only`; do not assume cause.

- `AU-OV-01` — “Reduce sound, light, people, or input.”
- `AU-OV-02` — “Move, pace, shake, or discharge energy.”
- `AU-OV-03` — “Finish one thing so the pile stops expanding.”
- `AU-OV-04` — “Go still and wait for demand to pass.”
- `AU-OV-05` — “Reach for something absorbing or numbing.”
- `AU-OV-06` — “Hand the decision to someone else.”
- `AU-OV-07` — “Escape without explaining.”

## 4. Overt moves by context

### `OL-OM-EVAL-01` — Visible moves around evaluation

`status: paraphrase_candidate_only`; record visible vs private.

- `OM-EV-01` — “I checked the work again.”
- `OM-EV-02` — “I asked someone to confirm it was okay.”
- `OM-EV-03` — “I added more detail than the task required.”
- `OM-EV-04` — “I delayed submitting or showing it.”
- `OM-EV-05` — “I submitted quickly to stop the buildup.”
- `OM-EV-06` — “I explained the weak point before anyone asked.”
- `OM-EV-07` — “I avoided looking at the response.”
- `OM-EV-08` — “I worked on something else that felt controllable.”

### `OL-OM-REL-PROTEST-01` — Visible moves after ambiguous distance

`status: paraphrase_candidate_only`; do not label as manipulation.

- `OM-RP-01` — “I sent one direct check-in.”
- `OM-RP-02` — “I sent another message before they answered.”
- `OM-RP-03` — “I asked whether we were okay.”
- `OM-RP-04` — “I made the hurt more visible.”
- `OM-RP-05` — “I became cooler or shorter to see if they noticed.”
- `OM-RP-06` — “I brought up ending or stepping back.”
- `OM-RP-07` — “I found another reason to contact them.”
- `OM-RP-08` — “I watched for signs without contacting them.”

### `OL-OM-REL-DISTANCE-01` — Visible moves toward distance

`status: paraphrase_candidate_only`; leaving threatening, coercive, or unstable contact is contextual, not evidence of a generalized distancing pattern.

- `OM-RD-01` — “I shortened my replies.”
- `OM-RD-02` — “I stopped initiating.”
- `OM-RD-03` — “I said I needed space or time.”
- `OM-RD-04` — “I stayed busy and hard to reach.”
- `OM-RD-05` — “I kept the conversation practical.”
- `OM-RD-06` — “I acted as if nothing had happened.”
- `OM-RD-07` — “I left, ended the call, or logged off.”
- `OM-RD-08` — “I ended or paused the relationship/contact.”

### `OL-OM-RUPTURE-01` — First-hour moves after rupture

`status: paraphrase_candidate_only`; high-intensity set.

- `OM-RU-01` — “I tried to resolve it before taking space.”
- `OM-RU-02` — “I wrote or rehearsed a long explanation.”
- `OM-RU-03` — “I apologized quickly.”
- `OM-RU-04` — “I waited for them to make the first move.”
- `OM-RU-05` — “I cut off the conversation.”
- `OM-RU-06` — “I looked for support or a reality check elsewhere.”
- `OM-RU-07` — “I distracted myself with a task, media, food, substance, or sleep.”
- `OM-RU-08` — “I continued as usual while holding it inside.”

### `OL-OM-HELP-01` — Asking for or receiving help

`status: paraphrase_candidate_only`; render for practical/emotional help as applicable.

- `OM-HP-01` — “I asked directly for one specific thing.”
- `OM-HP-02` — “I hinted and waited to see if they offered.”
- `OM-HP-03` — “I explained why the need was small or temporary.”
- `OM-HP-04` — “I made the request smaller than it was.”
- `OM-HP-05` — “I withdrew the request when they hesitated.”
- `OM-HP-06` — “I accepted help but tried to repay it immediately.”
- `OM-HP-07` — “I did it alone instead.”

## 5. Inner rules by horizon and domain

These are rough recognition prompts, not quotes or discovered beliefs. Every set includes `a rule without words`, `an image`, `an action urge`, and `no accessible rule`.

### `OL-IR-EVAL-BEFORE-01` — Anticipatory evaluation

`status: paraphrase_candidate_only`.

- `IR-EB-01` — “Do not give them an opening.”
- `IR-EB-02` — “If I prepare enough, I can prevent the moment I am anticipating.”
- `IR-EB-03` — “Be impressive enough that the weak point does not count.”
- `IR-EB-04` — “Know the answer before I enter.”
- `IR-EB-05` — “Stay unnoticed until I am certain.”
- `IR-EB-06` — “Finish fast so there is no time to doubt.”

### `OL-IR-EVAL-AFTER-01` — After error, criticism, or exposure

`status: paraphrase_candidate_only`.

- `IR-EA-01` — “Fix this before anything else.”
- `IR-EA-02` — “Make them understand why it happened.”
- `IR-EA-03` — “Do not let them see how much this landed.”
- `IR-EA-04` — “Get away from the evidence.”
- `IR-EA-05` — “Punish the mistake so it will not happen again.”
- `IR-EA-06` — “It is already ruined, so stop trying.”

### `OL-IR-REL-AMBIG-01` — Relational ambiguity

`status: paraphrase_candidate_only`.

- `IR-RA-01` — “Find out where I stand.”
- `IR-RA-02` — “Do not wait passively while contact disappears.”
- `IR-RA-03` — “Do not show how much I need an answer.”
- `IR-RA-04` — “Leave first if this is going away.”
- `IR-RA-05` — “Give them room or the distance may grow.”
- `IR-RA-06` — “Watch what they do, not what they say.”

### `OL-IR-CONFLICT-LIVE-01` — While conflict is live

`status: paraphrase_candidate_only`.

- `IR-CL-01` — “Keep explaining until the point lands.”
- `IR-CL-02` — “Do not back down or my reality disappears.”
- `IR-CL-03` — “End the tension, even if my point gets lost.”
- `IR-CL-04` — “Say less; words can be used against me.”
- `IR-CL-05` — “Get enough distance to think.”
- `IR-CL-06` — “Solve the concrete problem first.”

### `OL-IR-CARE-HELP-01` — Need, care, or dependence

`status: paraphrase_candidate_only`.

- `IR-CH-01` — “Make the need easy to meet.”
- `IR-CH-02` — “Do not owe more than I can repay.”
- `IR-CH-03` — “If they care, they will notice without being told.”
- `IR-CH-04` — “Ask clearly before resentment grows.”
- `IR-CH-05` — “Handle it alone; asking changes the balance.”
- `IR-CH-06` — “Stay useful so I remain welcome.”

### `OL-IR-MONEY-SCARCITY-01` — Money, resources, or scarcity

`status: paraphrase_candidate_only`; actual material constraint must remain visible.

- `IR-MS-01` — “Keep enough back for what I cannot predict.”
- `IR-MS-02` — “Check every detail before committing.”
- `IR-MS-03` — “Solve the shortage now, whatever it takes.”
- `IR-MS-04` — “Do not look at it until I can handle the number.”
- `IR-MS-05` — “Prove I can manage without help.”
- `IR-MS-06` — “Use it now before it disappears.”

### `OL-IR-LOSS-SOLITUDE-01` — Loss recall or disconnection

`status: paraphrase_candidate_only`; never infer trauma/origin.

- `IR-LS-01` — “Keep moving so the feeling does not take the whole day.”
- `IR-LS-02` — “Stay close to reminders so the connection is not lost.”
- `IR-LS-03` — “Do not bring this to people who cannot hold it.”
- `IR-LS-04` — “Find someone or something that makes the room feel less empty.”
- `IR-LS-05` — “Go quiet until the wave passes.”
- `IR-LS-06` — “Turn the feeling into a task I can complete.”

## 6. Feared outcomes by domain and horizon

### `OL-FO-EVAL-IMMEDIATE-01` — Immediate evaluation outcome

`status: paraphrase_candidate_only`; user rates subjective likelihood separately.

- `FO-EI-01` — “They will see me as less capable.”
- `FO-EI-02` — “I will freeze and not recover in the moment.”
- `FO-EI-03` — “The mistake will become the only thing that counts.”
- `FO-EI-04` — “I will lose control of how I am seen.”
- `FO-EI-05` — “I will be confronted before I have an explanation.”
- `FO-EI-06` — “I will feel the hit with no way to reduce it.”

### `OL-FO-EVAL-LONG-01` — Longer-horizon evaluation outcome

`status: paraphrase_candidate_only`.

- `FO-EL-01` — “Trust or opportunity will shrink.”
- `FO-EL-02` — “I will be remembered for the weak point.”
- `FO-EL-03` — “I will have to keep proving myself.”
- `FO-EL-04` — “One miss will start a larger slide.”
- `FO-EL-05` — “I will lose belonging, status, or independence.”
- `FO-EL-06` — “The demands will grow beyond what I can sustain.”

### `OL-FO-REL-DISTANCE-01` — Ambiguous distance or delayed response

`status: paraphrase_candidate_only`; reliability context required.

- `FO-RD-01` — “The connection is fading and I will find out too late.”
- `FO-RD-02` — “I matter less than I thought.”
- `FO-RD-03` — “They are upset but will not say it.”
- `FO-RD-04` — “I will be left holding uncertainty alone.”
- `FO-RD-05` — “If I reach, I will make them pull farther away.”
- `FO-RD-06` — “If I do not reach, the chance to repair will pass.”

### `OL-FO-CLOSENESS-01` — Increasing closeness or dependence

`status: paraphrase_candidate_only`; not applicable options required.

- `FO-CL-01` — “I will lose room to choose.”
- `FO-CL-02` — “The expectations will outrun what I can give.”
- `FO-CL-03` — “What I reveal will change how they hold me.”
- `FO-CL-04` — “I will depend on something that may not stay.”
- `FO-CL-05` — “I will have to manage their response as well as mine.”
- `FO-CL-06` — “Backing away later will cause more harm.”

### `OL-FO-CONFLICT-01` — Conflict or blocked repair

`status: paraphrase_candidate_only`; actual threat is handled as context, not a feared-cognition score.

- `FO-CF-01` — “My point will disappear if I stop pushing.”
- `FO-CF-02` — “The relationship will break before we understand each other.”
- `FO-CF-03` — “I will say or do something I cannot take back.”
- `FO-CF-04` — “Their anger or disappointment will become unbearable.”
- `FO-CF-05` — “Repair will require me to abandon my boundary.”
- `FO-CF-06` — “Nothing I do will change the outcome.”

### `OL-FO-NEED-HELP-01` — Asking for help or showing need

`status: paraphrase_candidate_only`.

- `FO-NH-01` — “The need will be too much for them.”
- `FO-NH-02` — “They will help but see me differently.”
- `FO-NH-03` — “I will owe something I cannot predict.”
- `FO-NH-04` — “They will say no and the need will feel harder to carry.”
- `FO-NH-05` — “I will lose control over how the help happens.”
- `FO-NH-06` — “If I do not ask, I will have to carry it alone.”

### `OL-FO-OVERLOAD-01` — Overload and blocked relief

`status: paraphrase_candidate_only`.

- `FO-OV-01` — “The pressure will keep rising with no exit.”
- `FO-OV-02` — “I will stop being able to speak or function.”
- `FO-OV-03` — “I will react in a way that creates another problem.”
- `FO-OV-04` — “I will be trapped in input I cannot reduce.”
- `FO-OV-05` — “I will lose the thread and not get it back.”
- `FO-OV-06` — “If I slow down, everything waiting will catch up.”

## 7. Ritual steps, completion, and interruption states

The loop builder permits repeated steps and preserves `inside`, `visible`, or `both`. “Ritual” is an engine term only; selecting a sequence does not establish compulsion or diagnosis.

### `OL-RI-CHECK-EVAL-01` — Checking and evaluation loop

`status: paraphrase_candidate_only`; horizon usually anticipatory.

- `RI-CE-01` — “Scan for the part most likely to be questioned.”
- `RI-CE-02` — “Compare against the instructions or someone else's work.”
- `RI-CE-03` — “Correct or add detail.”
- `RI-CE-04` — “Read it as if I were the evaluator.”
- `RI-CE-05` — “Ask for confirmation.”
- `RI-CE-06` — “Reopen something I had already finished.”
- `RI-CE-07` — “Delay sending while I run one more check.”
- `RI-CE-08` — “Send, then check for the response.”

### `OL-RI-REHEARSE-SOCIAL-01` — Rehearsing a social or conflict moment

`status: paraphrase_candidate_only`.

- `RI-RS-01` — “Replay what already happened.”
- `RI-RS-02` — “Predict the next question or objection.”
- `RI-RS-03` — “Build the clearest explanation.”
- `RI-RS-04` — “Try different tones in my head or out loud.”
- `RI-RS-05` — “Remove anything that could sound needy, angry, or unclear.”
- `RI-RS-06` — “Check how the message might land.”
- `RI-RS-07` — “Draft, revise, and hold it.”
- `RI-RS-08` — “Send or speak, then replay it again.”

### `OL-RI-CONTACT-MONITOR-01` — Monitoring relational contact

`status: paraphrase_candidate_only`; safety/reliability required.

- `RI-CM-01` — “Check whether they replied or were active.”
- `RI-CM-02` — “Review the last exchange for a change in tone.”
- `RI-CM-03` — “Look for another explanation.”
- `RI-CM-04` — “Ask someone else how it looks.”
- `RI-CM-05` — “Send a low-risk signal.”
- `RI-CM-06` — “Watch whether they respond differently.”
- `RI-CM-07` — “Pull back to see if they initiate.”
- `RI-CM-08` — “Restart the checking when uncertainty returns.”

### `OL-RI-PLEASE-FIX-01` — Pleasing, smoothing, or fixing

`status: paraphrase_candidate_only`.

- `RI-PF-01` — “Notice what the other person may need or be reacting to.”
- `RI-PF-02` — “Adjust my tone, request, or preference.”
- `RI-PF-03` — “Offer help or take on a task.”
- `RI-PF-04` — “Check whether the atmosphere improved.”
- `RI-PF-05` — “Explain away my own need.”
- `RI-PF-06` — “Do more when the first effort does not settle it.”
- `RI-PF-07` — “Keep monitoring after the conversation ends.”

### `OL-RI-URGENT-RELIEF-01` — Urgent relief after activation breaks through

`status: paraphrase_candidate_only`; horizon immediate/aftermath.

- `RI-UR-01` — “Get away from the cue or conversation.”
- `RI-UR-02` — “Reach for fast input: scrolling, media, game, or noise.”
- `RI-UR-03` — “Eat, drink, use a substance, shop, or seek another quick shift.”
- `RI-UR-04` — “Push the energy through movement, argument, work, or cleaning.”
- `RI-UR-05` — “Go to sleep or make the body still.”
- `RI-UR-06` — “Find someone who can change the feeling or confirm reality.”
- `RI-UR-07` — “Switch tasks until the original cue is farther away.”
- `RI-UR-08` — “Repeat the relief step when the pressure returns.”

### `OL-RI-SHUTDOWN-01` — Withdrawal or shutdown sequence

`status: paraphrase_candidate_only`; no dissociation inference.

- `RI-SD-01` — “Stop speaking or shorten answers.”
- `RI-SD-02` — “Reduce eye contact, movement, or incoming information.”
- `RI-SD-03` — “Leave the room, call, app, or task.”
- `RI-SD-04` — “Lie down, curl inward, or become very still.”
- `RI-SD-05` — “Let time pass without choosing a next step.”
- `RI-SD-06` — “Return only when the demand is lower.”
- `RI-SD-07` — “Continue the usual routine while remaining internally far away.”

### `OL-RI-STOP-01` — What lets a loop stop

`status: paraphrase_candidate_only`; render after an ordered sequence.

- `RI-ST-01` — “I reached a result that felt certain enough.”
- `RI-ST-02` — “The other person responded in the needed way.”
- `RI-ST-03` — “The task or event ended.”
- `RI-ST-04` — “My body pressure dropped enough.”
- `RI-ST-05` — “I became too tired to continue.”
- `RI-ST-06` — “Time, access, or another person stopped me.”
- `RI-ST-07` — “A more urgent strategy took over.”
- `RI-ST-08` — “I chose to stop, but it still felt unfinished.”
- `RI-ST-09` — “There was no clear ending; it faded and returned.”

### `OL-RI-INTERRUPT-01` — If the sequence is interrupted

`status: paraphrase_candidate_only`; imagined or remembered status stored separately.

- `RI-IN-01` — “Pressure rises until I restart.”
- `RI-IN-02` — “I go back to the last completed step.”
- `RI-IN-03` — “I switch to a faster or stronger move.”
- `RI-IN-04` — “I become irritable, distracted, or hard to reach.”
- `RI-IN-05` — “I drop, go blank, or stop functioning.”
- `RI-IN-06` — “I can stop, but the unfinished feeling stays.”
- `RI-IN-07` — “Interruption actually brings relief.”
- `RI-IN-08` — “The result depends on who interrupts and how.”

## 8. Costs in three distinct domains

Cost options are displayed only after the user anchors a move. Each domain permits “none noticed.” Selection is descriptive, not an impairment score.

### `OL-CI-PREVENTIVE-01` — Internal costs of anticipatory control

`status: paraphrase_candidate_only`.

- `CI-PR-01` — “My mind stays occupied after I have met the stated task requirement.”
- `CI-PR-02` — “Rest feels unavailable or undeserved.”
- `CI-PR-03` — “I lose track of what I actually prefer.”
- `CI-PR-04` — “The standard rises as I approach it.”
- `CI-PR-05` — “Relief is brief before the next concern appears.”
- `CI-PR-06` — “I feel tight, tired, or depleted later.”
- `CI-PR-07` — “I become harsher toward myself.”

### `OL-CI-URGENT-01` — Internal costs of urgent relief, attack, or shutdown

`status: paraphrase_candidate_only`.

- `CI-UR-01` — “The original feeling returns with residue.”
- `CI-UR-02` — “I feel foggy, flat, or disconnected afterward.”
- `CI-UR-03` — “Regret or self-criticism arrives later.”
- `CI-UR-04` — “My body remains activated or drained.”
- `CI-UR-05` — “I lose part of the day or night.”
- `CI-UR-06` — “I need a stronger repeat to get the same shift.”
- `CI-UR-07` — “I cannot easily remember what I needed before the move.”

### `OL-CI-RELATIONAL-LOOP-01` — Internal costs of contact monitoring/protest

`status: paraphrase_candidate_only`.

- `CI-RL-01` — “Uncertainty takes over my attention.”
- `CI-RL-02` — “My sense of where I stand changes with each signal.”
- `CI-RL-03` — “I replay the exchange after contact resumes.”
- `CI-RL-04` — “I feel exposed for having reached.”
- `CI-RL-05` — “Relief depends on the next response.”
- `CI-RL-06` — “I have less access to other parts of my life.”

### `OL-CR-PREVENTIVE-01` — Relational costs of pleasing, controlling, or monitoring

`status: paraphrase_candidate_only`.

- `CR-PR-01` — “The other person sees less of what I actually want.”
- `CR-PR-02` — “I become responsible for the atmosphere.”
- `CR-PR-03` — “Resentment builds behind cooperation.”
- `CR-PR-04` — “They may feel managed, checked, or kept at a distance.”
- `CR-PR-05` — “I ask for reassurance in ways that do not bring lasting clarity.”
- `CR-PR-06` — “The relationship works, but only with a lot of hidden effort.”
- `CR-PR-07` — “Repair gets postponed because no conflict is visible.”

### `OL-CR-PROTEST-01` — Relational costs after protest/escalation

`status: paraphrase_candidate_only`.

- `CR-PT-01` — “The cue becomes a larger conflict.”
- `CR-PT-02` — “The other person responds to the pressure rather than the need.”
- `CR-PT-03` — “They move farther away or become defensive.”
- `CR-PT-04` — “I later have to repair the way I reached.”
- `CR-PT-05` — “Contact returns without resolving the uncertainty.”
- `CR-PT-06` — “Trust in the next conversation is lower.”

### `OL-CR-DISTANCE-01` — Relational costs of deactivation/distance

`status: paraphrase_candidate_only`; do not use when distance is a safety response.

- `CR-DI-01` — “The other person cannot tell what happened.”
- `CR-DI-02` — “Space turns into a longer gap than I intended.”
- `CR-DI-03` — “Practical contact continues while emotional contact narrows.”
- `CR-DI-04` — “The other person increases pursuit or gives up.”
- `CR-DI-05` — “Repair starts later and with less information.”
- `CR-DI-06` — “I return before I feel present, or do not return at all.”

### `OL-CF-WORK-TASK-01` — Functional costs in work/task domains

`status: paraphrase_candidate_only`.

- `CF-WT-01` — “The task takes longer than its value calls for.”
- `CF-WT-02` — “I miss a deadline, handoff, or chance to submit.”
- `CF-WT-03` — “I spend effort on low-impact details.”
- `CF-WT-04` — “I avoid feedback or information I need.”
- `CF-WT-05` — “I rush and create another correction cycle.”
- `CF-WT-06` — “Other tasks are displaced.”
- `CF-WT-07` — “My performance is intact but difficult to sustain.”

### `OL-CF-DAILY-01` — Functional costs in daily life

`status: paraphrase_candidate_only`.

- `CF-DL-01` — “Sleep shifts or becomes less restorative.”
- `CF-DL-02` — “Meals, medication, movement, or basic routines are delayed.”
- `CF-DL-03` — “I cancel or narrow plans.”
- `CF-DL-04` — “Decisions pile up because I cannot re-enter them.”
- `CF-DL-05` — “I lose time to replay, checking, recovery, or numbness.”
- `CF-DL-06` — “I need extra transition time before the next demand.”
- `CF-DL-07` — “No functional cost I can identify.”

### `OL-CF-RELATIONAL-ATTENTION-01` — Functional spillover from relationship cues

`status: paraphrase_candidate_only`.

- `CF-RA-01` — “I keep checking while trying to do something else.”
- `CF-RA-02` — “Work or study becomes harder to hold in mind.”
- `CF-RA-03` — “I reorganize plans around the possibility of contact.”
- `CF-RA-04` — “I stay awake waiting, replaying, or avoiding.”
- `CF-RA-05` — “I seek repeated input from other people.”
- `CF-RA-06` — “I function outwardly, but with much higher effort.”

## 9. Ambiguity and attachment interpretations

All interpretation sets require a named referent and safety/reliability context. Self and other attributions are asked separately. A selected option is a first interpretation in one moment, not a global belief.

### `OL-AT-S-DELAY-01` — What a delayed reply may seem to mean about self

`status: paraphrase_candidate_only`.

- `AT-SD-01` — “I am not important enough to answer now.”
- `AT-SD-02` — “I said more than they wanted or missed something important.”
- `AT-SD-03` — “I am asking for more contact than they want.”
- `AT-SD-04` — “Needing the reply this much feels like a problem.”
- `AT-SD-05` — “It probably does not say anything about me.”
- `AT-SD-06` — “I cannot find a self-meaning; I only notice the gap.”

### `OL-AT-O-DELAY-01` — What a delayed reply may seem to mean about the other

`status: paraphrase_candidate_only`.

- `AT-OD-01` — “They are busy or unavailable for reasons I do not know.”
- `AT-OD-02` — “They are upset and not saying it.”
- `AT-OD-03` — “Their interest or care has changed.”
- `AT-OD-04` — “They expect me to take the hint.”
- `AT-OD-05` — “They are inconsistent, and I need to watch actions.”
- `AT-OD-06` — “I cannot form a story about them yet.”

### `OL-AT-S-TONE-01` — What a changed tone may seem to mean about self

`status: paraphrase_candidate_only`.

- `AT-ST-01` — “I have become annoying, disappointing, or too much.”
- `AT-ST-02` — “I missed a rule everyone else can see.”
- `AT-ST-03` — “I need to fix the atmosphere.”
- `AT-ST-04` — “My view will not matter here.”
- `AT-ST-05` — “Their tone may not be about me.”
- `AT-ST-06` — “I notice my body before any meaning.”

### `OL-AT-O-TONE-01` — What a changed tone may seem to mean about the other

`status: paraphrase_candidate_only`.

- `AT-OT-01` — “They are angry or pulling away.”
- `AT-OT-02` — “They are overwhelmed and have less room.”
- `AT-OT-03` — “They are trying to control the distance.”
- `AT-OT-04` — “They will not tell me directly what changed.”
- `AT-OT-05` — “This is a temporary state, not a relationship message.”
- `AT-OT-06` — “I need more information before attributing it.”

### `OL-AT-S-CANCEL-01` — What cancellation/changed plans may mean about self

`status: paraphrase_candidate_only`.

- `AT-SC-01` — “Time with me was easy to drop.”
- `AT-SC-02` — “I made the plan harder for them to keep.”
- `AT-SC-03` — “I counted on more than was actually offered.”
- `AT-SC-04` — “Showing disappointment feels risky.”
- `AT-SC-05` — “Their change of plan is not a measure of me.”
- `AT-SC-06` — “No clear self-meaning.”

### `OL-AT-O-CANCEL-01` — What cancellation/changed plans may mean about the other

`status: paraphrase_candidate_only`.

- `AT-OC-01` — “They had a real constraint and will repair the plan.”
- `AT-OC-02` — “They do not protect plans with me.”
- `AT-OC-03` — “They want less closeness than they say.”
- `AT-OC-04` — “They assume I will absorb the change.”
- `AT-OC-05` — “I did not settle on an interpretation from this event.”
- `AT-OC-06` — “Their reliability is already known from a larger pattern.”

### `OL-AT-ALT-01` — Alternative interpretation reachability

`status: paraphrase_candidate_only`; use after first attribution.

- `AT-AL-01` — “Another explanation was available immediately.”
- `AT-AL-02` — “I could reach one after a little time.”
- `AT-AL-03` — “I needed direct information from them.”
- `AT-AL-04` — “Someone else could suggest it, but it did not feel real.”
- `AT-AL-05` — “I could say the alternative while my body stayed with the first story.”
- `AT-AL-06` — “No alternative was reachable then.”
- `AT-AL-07` — “The cue was not ambiguous given their actual pattern.”

## 10. Repair initiation, reception, and reassurance

Repair sets describe actual moves and effects. They do not imply reconciliation is safe or required. The engine stores who initiated, offer content, credibility/adequacy, timing, visible action, body effect, and residue separately.

### `OL-RP-INIT-LOW-01` — User initiates after a lower-intensity misattunement

`status: paraphrase_candidate_only`.

- `RP-IL-01` — “I name the moment briefly and ask how they saw it.”
- `RP-IL-02` — “I send a practical message that opens the door.”
- `RP-IL-03` — “I acknowledge my part before raising what hurt.”
- `RP-IL-04` — “I ask whether they can talk now or want another time.”
- `RP-IL-05` — “I act warmer and wait to see whether they meet me.”
- `RP-IL-06` — “I wait for the tension to fade without naming it.”
- `RP-IL-07` — “I decide the moment does not need repair.”

### `OL-RP-INIT-HIGH-01` — User initiates after a consequential rupture

`status: paraphrase_candidate_only`; safety and contact eligibility required.

- `RP-IH-01` — “I describe the specific break and what I need addressed.”
- `RP-IH-02` — “I offer my account and invite theirs.”
- `RP-IH-03` — “I apologize for my move without settling the whole disagreement.”
- `RP-IH-04` — “I ask for a concrete next step or changed behavior.”
- `RP-IH-05` — “I set a boundary and leave a path for later contact.”
- `RP-IH-06` — “I draft the message but wait for a sign of safety or readiness.”
- `RP-IH-07` — “I choose not to reopen contact.”

### `OL-RP-RECV-APOLOGY-01` — Receiving an apology/accountability

`status: paraphrase_candidate_only`; apology adequacy stored separately.

- `RP-RA-01` — “Some body pressure drops immediately.”
- `RP-RA-02` — “I listen for whether they name the actual impact.”
- `RP-RA-03` — “I want the apology to change things, but my body stays guarded.”
- `RP-RA-04` — “I need time before I know what I feel.”
- `RP-RA-05` — “I test whether their behavior changes.”
- `RP-RA-06` — “I minimize my hurt so the repair can finish.”
- `RP-RA-07` — “The apology does not change what I expect, or I do not find it credible.”
- `RP-RA-08` — “The apology increases pressure because contact could bring more pressure or harm.”

### `OL-RP-RECV-EXPLANATION-01` — Receiving an explanation or clarification

`status: paraphrase_candidate_only`.

- `RP-RE-01` — “The missing information changes my interpretation.”
- `RP-RE-02` — “I understand the explanation, but the residue remains.”
- `RP-RE-03` — “I look for details that make it internally consistent.”
- `RP-RE-04` — “I need their tone and behavior to match the words.”
- `RP-RE-05` — “Relief arrives, then doubt returns.”
- `RP-RE-06` — “The explanation feels like deflection rather than repair.”
- `RP-RE-07` — “I cannot process it until my state changes.”

### `OL-RP-REASSURE-01` — Receiving reassurance about the relationship

`status: paraphrase_candidate_only`.

- `RP-RS-01` — “The words and my body both settle.”
- `RP-RS-02` — “The words help, but only for a short time.”
- `RP-RS-03` — “I believe them intellectually before I feel safer.”
- `RP-RS-04` — “I need a specific answer rather than general reassurance.”
- `RP-RS-05` — “Consistent action matters more than another statement.”
- `RP-RS-06` — “I want more contact immediately after reassurance.”
- `RP-RS-07` — “Reassurance feels pressuring or hard to trust.”
- `RP-RS-08` — “No clear change.”

### `OL-RP-UPTAKE-01` — Timing and degree of uptake

`status: paraphrase_candidate_only`; pair with the offer type.

- `RP-UP-01` — “It changed what I expected in the moment.”
- `RP-UP-02` — “It changed part of what I expected; part stayed watchful.”
- `RP-UP-03` — “It changed what I expected after minutes or hours.”
- `RP-UP-04` — “It changed what I expected after sleep or a later conversation.”
- `RP-UP-05` — “What I expected changed only after repeated matching action.”
- `RP-UP-06` — “I could understand it, but my body did not shift.”
- `RP-UP-07` — “It did not change what I expected.”
- `RP-UP-08` — “It increased pressure or distance in the interaction.”

### `OL-RP-NEEDED-01` — What makes repair receivable

`status: paraphrase_candidate_only`.

- `RP-ND-01` — “A specific acknowledgment of what happened.”
- `RP-ND-02` — “They name what they did and its effect without demanding that I move on.”
- `RP-ND-03` — “A clear explanation that fits the evidence.”
- `RP-ND-04` — “Changed behavior over time.”
- `RP-ND-05` — “A slower pace and room not to answer immediately.”
- `RP-ND-06` — “Warmth or presence without pressure.”
- `RP-ND-07` — “A boundary or practical plan.”
- `RP-ND-08` — “Distance or no further contact.”
- `RP-ND-09` — “I do not know what could make it receivable.”

## 11. Self-regulation by state direction and purpose

These are reports of what the user actually tries. The renderer asks separately whether a channel shifts the body, changes thoughts/emotion, buys time, suppresses/distracts, helps function, has no effect, or aggravates. No option is recommended merely by appearing here.

### `OL-RG-UP-DISCHARGE-01` — High energy needing movement or discharge

`status: paraphrase_candidate_only`.

- `RG-UD-01` — “Walk, pace, run, stretch, shake, or use effort.”
- `RG-UD-02` — “Clean, organize, or complete a physical task.”
- `RG-UD-03` — “Speak, sing, hum, or make sound privately.”
- `RG-UD-04` — “Change temperature, air, or physical setting.”
- `RG-UD-05` — “Use steady pressure or hold an object.”
- `RG-UD-06` — “Wait without adding more input.”
- `RG-UD-07` — “Use a familiar repetitive motion.”

### `OL-RG-UP-ORIENT-01` — High energy with narrowed attention or scanning

`status: paraphrase_candidate_only`.

- `RG-UO-01` — “Get concrete information about what is happening.”
- `RG-UO-02` — “Name the next single task.”
- `RG-UO-03` — “Look around or relocate to a less demanding space.”
- `RG-UO-04` — “Write the thoughts outside my head.”
- `RG-UO-05` — “Reduce alerts, messages, sound, or visual input.”
- `RG-UO-06` — “Use a familiar schedule, list, or script.”
- `RG-UO-07` — “Delay decisions until attention widens.”

### `OL-RG-DOWN-GENTLE-01` — Low energy, heaviness, or reduced access

`status: paraphrase_candidate_only`; breath focus is never required.

- `RG-DG-01` — “Reduce demands and choose one very small action.”
- `RG-DG-02` — “Use light, temperature, sound, or texture that helps me orient.”
- `RG-DG-03` — “Sit upright, stand, or change position if available.”
- `RG-DG-04` — “Eat, drink water, take medication, or meet a basic need.”
- `RG-DG-05` — “Use familiar music, media, or a repetitive task.”
- `RG-DG-06` — “Rest or sleep without requiring immediate processing.”
- `RG-DG-07` — “Ask someone to stay nearby or help choose the next step.”
- `RG-DG-08` — “Wait for access to return rather than forcing it.”

### `OL-RG-MIXED-01` — Urgency with immobility or rapidly shifting state

`status: paraphrase_candidate_only`.

- `RG-MX-01` — “Reduce input before trying to decide.”
- `RG-MX-02` — “Use small movement without demanding full activation.”
- `RG-MX-03` — “Put the urgent thought into a note and postpone action.”
- `RG-MX-04` — “Ask for quiet presence rather than discussion.”
- `RG-MX-05` — “Move between rest and brief practical action.”
- `RG-MX-06` — “Choose a familiar sensory anchor.”
- `RG-MX-07` — “Do nothing identifiable until the shift passes.”

### `OL-RG-RELATIONAL-RESIDUE-01` — After relational activation

`status: paraphrase_candidate_only`.

- `RG-RR-01` — “Write what I want to say without sending it yet.”
- `RG-RR-02` — “Get one reality check from a trusted person.”
- `RG-RR-03` — “Take space with a clear return point.”
- `RG-RR-04` — “Ask the person directly for missing information.”
- `RG-RR-05` — “Return to a task or routine outside the relationship.”
- `RG-RR-06` — “Let the body shift before deciding what the cue means.”
- `RG-RR-07` — “Seek more contact until I get a clear response.”
- `RG-RR-08` — “Cut off incoming contact for a while.”

### `OL-RG-TASK-OVERLOAD-01` — Task overload and performance pressure

`status: paraphrase_candidate_only`.

- `RG-TO-01` — “Reduce the task to the next visible action.”
- `RG-TO-02` — “Check the actual requirement and stop adding.”
- `RG-TO-03` — “Ask for clarification, help, or a changed deadline.”
- `RG-TO-04` — “Switch briefly to a bounded task.”
- `RG-TO-05` — “Remove notifications or competing inputs.”
- `RG-TO-06` — “Stop work and recover before re-entry.”
- `RG-TO-07` — “Push through until it is finished.”
- `RG-TO-08` — “Avoid opening the task until pressure forces it.”

## 12. Co-regulation by contact type, dose, and timing

Touch options render only when applicable and never as a preferred default. Each selection is classified by the user as helpful, neutral, aggravating, or timing-dependent.

### `OL-CRG-PRESENCE-01` — Presence without problem-solving

`status: paraphrase_candidate_only`.

- `CRG-PR-01` — “Quiet company in the same space.”
- `CRG-PR-02` — “A call or voice nearby without needing to talk much.”
- `CRG-PR-03` — “Brief check-ins while I have space.”
- `CRG-PR-04` — “Someone doing an ordinary task alongside me.”
- `CRG-PR-05` — “Knowing they are available later.”
- `CRG-PR-06` — “No company until I initiate.”

### `OL-CRG-WORDS-01` — Verbal contact and information

`status: paraphrase_candidate_only`.

- `CRG-WD-01` — “A direct answer to the uncertain point.”
- `CRG-WD-02` — “Listening without correcting my first account.”
- `CRG-WD-03` — “A short reminder of what is still true.”
- `CRG-WD-04` — “Naming the next practical step.”
- `CRG-WD-05` — “Helping me compare more than one interpretation.”
- `CRG-WD-06` — “Fewer words and slower questions.”
- `CRG-WD-07` — “No discussion until my body shifts.”

### `OL-CRG-PRACTICAL-01` — Practical support

`status: paraphrase_candidate_only`.

- `CRG-PA-01` — “Take over one concrete task with permission.”
- `CRG-PA-02` — “Help me choose between a small number of options.”
- `CRG-PA-03` — “Bring food, water, medication, transport, or needed items.”
- `CRG-PA-04` — “Reduce noise, interruptions, or social demands.”
- `CRG-PA-05` — “Stay while I start the first step.”
- `CRG-PA-06` — “Do not take over; wait for a specific request.”

### `OL-CRG-CONTACT-MODE-01` — Mode and dose

`status: paraphrase_candidate_only`.

- `CRG-CM-01` — “One text with no demand for an immediate reply.”
- `CRG-CM-02` — “A short voice call.”
- `CRG-CM-03` — “In-person contact with an easy exit.”
- `CRG-CM-04` — “Frequent brief contact for a limited period.”
- `CRG-CM-05` — “Space plus a specific time to reconnect.”
- `CRG-CM-06` — “Contact only around the practical issue.”
- `CRG-CM-07` — “No contact for now.”

### `OL-CRG-TOUCH-01` — Physical contact, only when applicable

`status: paraphrase_candidate_only`; renderer requires opt-in applicability.

- `CRG-TC-01` — “A brief hug or hand contact I can end.”
- `CRG-TC-02` — “Steady pressure or close contact.”
- `CRG-TC-03` — “Sitting nearby without touch.”
- `CRG-TC-04` — “Ask before every change in contact.”
- `CRG-TC-05` — “Touch helps only after words or clarity.”
- `CRG-TC-06` — “Touch makes this state harder.”

## 13. Aggravating channels by state/context

These sets prevent the engine from assuming a conventionally soothing action is helpful.

### `OL-AG-UP-01` — May aggravate high activation

`status: paraphrase_candidate_only`.

- `AG-UP-01` — “Too many questions.”
- `AG-UP-02` — “Being told to settle or explain immediately.”
- `AG-UP-03` — “Unexpected touch or blocked movement.”
- `AG-UP-04` — “More messages, noise, light, or people.”
- `AG-UP-05` — “General reassurance without answering the uncertain point.”
- `AG-UP-06` — “Pressure to make a decision.”
- `AG-UP-07` — “Being left alone without knowing when contact returns.”

### `OL-AG-DOWN-01` — May aggravate low access/deactivation

`status: paraphrase_candidate_only`.

- `AG-DN-01` — “Demanding detailed emotional language.”
- `AG-DN-02` — “Rapid questions or too many choices.”
- `AG-DN-03` — “Strong stimulation intended to wake me up.”
- `AG-DN-04` — “Being left with a complex task.”
- `AG-DN-05` — “Long explanations I cannot track.”
- `AG-DN-06` — “Touch or closeness when I cannot respond clearly.”
- `AG-DN-07` — “Pressure to repair before words and movement return.”

### `OL-AG-REL-01` — May aggravate relational activation

`status: paraphrase_candidate_only`; actual relational behavior remains contextual evidence.

- `AG-RL-01` — “Vague promises instead of a direct answer.”
- `AG-RL-02` — “Contact that becomes intense and then disappears.”
- `AG-RL-03` — “Being told to drop my interpretation before the facts are clear.”
- `AG-RL-04` — “A repair attempt that skips impact or accountability.”
- `AG-RL-05` — “More space without a return plan.”
- `AG-RL-06` — “Repeated reassurance with no change in behavior.”
- `AG-RL-07` — “Pressure to disclose or forgive.”

## 14. Blankness and low-interoception alternatives

These options collect accessibility data without turning missing inner access into state evidence.

### `OL-BL-INSIDE-01` — No clear inside signal

`status: paraphrase_candidate_only`.

- `BL-IN-01` — “I know something changed, but not what it felt like.”
- `BL-IN-02` — “I can identify the action, not the feeling or body cue.”
- `BL-IN-03` — “I can find an image or direction, not words.”
- `BL-IN-04` — “I notice the signal only afterward.”
- `BL-IN-05` — “The memory is patchy.”
- `BL-IN-06` — “Nothing is accessible when I look inward.”
- `BL-IN-07` — “Looking inward makes the answer less clear.”
- `BL-IN-08` — “I prefer not to check inside.”

### `OL-BL-OUTSIDE-01` — Observable substitutes

`status: paraphrase_candidate_only`.

- `BL-OU-01` — “My speech changed.”
- `BL-OU-02` — “My posture, movement, or facial expression changed.”
- `BL-OU-03` — “I stopped or started an activity.”
- `BL-OU-04` — “My attention or error rate changed.”
- `BL-OU-05` — “Someone else noticed a change.”
- `BL-OU-06` — “I lost track of time or sequence.”
- `BL-OU-07` — “The clearest evidence is the aftermath.”
- `BL-OU-08` — “No reliable outside sign either.”

### `OL-BL-RENDER-01` — Preferred response mode

`status: paraphrase_candidate_only`; updates accessibility preferences.

- `BL-RE-01` — “Concrete actions and sequence choices.”
- `BL-RE-02` — “Body-region list without a silhouette.”
- `BL-RE-03` — “Images, shapes, or direction.”
- `BL-RE-04` — “Short first-person phrases I can edit.”
- `BL-RE-05` — “Observable signs rather than inner experience.”
- `BL-RE-06` — “One question at a time with fewer options.”
- `BL-RE-07` — “Free text without suggested wording.”
- `BL-RE-08` — “Skip this kind of question.”

## 15. Uncertainty, accessibility, and correction controls

The renderer chooses controls matched to the task. Uncertainty is evidence about access/precision, not a midpoint score.

### `OL-UN-MEMORY-01` — Memory availability

`status: paraphrase_candidate_only`.

- `UN-ME-01` — “I have one clear moment.”
- `UN-ME-02` — “I have a rough moment, but the order is uncertain.”
- `UN-ME-03` — “I remember the aftermath more clearly than the moment.”
- `UN-ME-04` — “Several moments blur together.”
- `UN-ME-05` — “No clear memory is available.”
- `UN-ME-06` — “I do not want to use this memory.”

### `OL-UN-TYPICALITY-01` — Episode-to-pattern relation

`status: paraphrase_candidate_only`.

- `UN-TY-01` — “This is close to what usually happens.”
- `UN-TY-02` — “The sequence is typical, but the intensity was unusual.”
- `UN-TY-03` — “This happens only with this person or setting.”
- `UN-TY-04` — “This was an exception.”
- `UN-TY-05` — “It used to fit more than it does now.”
- `UN-TY-06` — “I do not know how typical it is.”

### `OL-UN-CONTRADICTION-01` — Why two answers may differ

`status: paraphrase_candidate_only`.

- `UN-CX-01` — “Different person or relationship.”
- `UN-CX-02` — “Different point in time: before, during, or after.”
- `UN-CX-03` — “Different intensity.”
- `UN-CX-04` — “Different internal pattern was steering.”
- `UN-CX-05` — “My response changed over time.”
- `UN-CX-06` — “The safety or reliability context was different.”
- `UN-CX-07` — “One answer does not match or is poorly worded.”
- `UN-CX-08` — “Both are true and I cannot yet separate them.”

### `OL-UN-FIT-01` — Summary-clause correction

`status: paraphrase_candidate_only`.

- `UN-FT-01` — “Accurate as written.”
- `UN-FT-02` — “Close; I want to edit the wording.”
- `UN-FT-03` — “True only with a particular person, horizon, or intensity.”
- `UN-FT-04` — “The order does not match.”
- `UN-FT-05` — “These are two different patterns.”
- `UN-FT-06` — “This conclusion goes beyond my answers.”
- `UN-FT-07` — “Not enough evidence.”
- `UN-FT-08` — “Do not include this in my report.”

### `OL-UN-QUOTE-01` — Wording provenance and report use

`status: paraphrase_candidate_only`; presented only for typed/edited/explicitly confirmed text.

- `UN-QT-01` — “This exact wording is mine and may be quoted.”
- `UN-QT-02` — “The meaning fits, but keep it as a paraphrase.”
- `UN-QT-03` — “Use the evidence without this wording.”
- `UN-QT-04` — “This wording is not accurate; let me change it.”

### `OL-UN-ACCESS-01` — Accessibility and burden

`status: paraphrase_candidate_only`.

- `UN-AC-01` — “I can answer with the current format.”
- `UN-AC-02` — “Show fewer choices.”
- `UN-AC-03` — “Use a list instead of dragging or a body image.”
- `UN-AC-04` — “Ask about visible actions instead.”
- `UN-AC-05` — “Let me type without suggestions.”
- `UN-AC-06` — “Use a lower-intensity or more distant example.”
- `UN-AC-07` — “Skip this and keep going.”
- `UN-AC-08` — “Pause and save here.”

## 16. Library selection safeguards

1. Match by named referent, domain, cue, horizon, and state direction; never select only from a framework hypothesis.
2. Do not show a feared-outcome or inner-rule set until the user has anchored a recognizable episode and actual move.
3. Do not mix `before` manager-like wording with urgent post-breakthrough wording in one unlabeled list. If both are eligible, ask the horizon first.
4. For body qualities, require region and direction, keep active and quiet maps distinct, and permit mixed/absent responses. No single body option emits a state classification.
5. For relationships, use actual safety/reliability evidence to decide whether ambiguity interpretation is eligible. Genuine unreliability, coercion, or threat is not reframed as an attachment bias.
6. For repair, distinguish initiation, offer content, reception, uptake, and changed behavior. A reassurance option cannot stand in for repair evidence.
7. For costs, render internal, relational, and functional panels separately; no inferred cost is preselected.
8. Preserve presentation provenance. Authored choice text remains `paraphrase_candidate_only` even when selected repeatedly. Only explicit user-authored or user-confirmed wording can be quoted.
9. Preserve absence and contradiction. `None`, `unclear`, context dependence, and rejection route to evidence gaps or discriminators, never forced scoring.
10. After a high-intensity set, route to ordinary baseline, an accessible resource, a lower-takeover exception, or pause. Never finish administration on a feared outcome, rupture, peak-body map, or blocked-strategy screen.
