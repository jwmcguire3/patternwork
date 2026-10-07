# Controls, preferences and rendering contract

## Opening copy

> We ask about moments you remember, not how you think you should react. One answer may fit the first moment and another may come later. You can tell us that without making the whole experience fit one choice. Skip anything that does not fit. We use these accounts to describe patterns, not diagnose you.

Default recall cue: **“Use the past four weeks when a real example comes to mind.”** An older real event can be selected with an explicit window extension. Never silently treat an old relationship as current. Do not require precise dates or names.

## C01 — Recall basis (at a new root, only as needed)

“Is this one actual occasion, a usual tendency, or not a situation you can recall?”

- One actual occasion.
- A usual tendency; I am not describing one event.
- I cannot recall a relevant occasion.
- I would rather skip this situation.

The default root question requests an actual occasion; a persistent control allows another basis. Do not add a forced screen after every answer. A used tendency control changes chronology and recurrence permissions.

## C02 — People and situations (just in time)

“Who was involved in the moment you are answering about?”

- My partner / a former partner.
- A friend.
- A family member.
- A colleague, supervisor, client, teacher or other person reviewing my work.
- Someone else (choose a neutral role label; no name needed).
- No other person / no applicable situation.

Select the actual role appropriate to the question. A reused label does not by itself prove the same person. Store an opaque person ID plus the role snapshot. For evaluation, examples include paid work, school, care responsibilities, volunteer work or a hobby **when another person really reviewed it**. If there was no evaluator, close M02–M03 as unavailable; do not invent one. A boundary person and support person need not be the closest person.

## C03 — Report language (not personality evidence)

“Which wording would you rather read?”

- Parts language, with names such as “the Rehearsal Manager.”
- Plain patterns and functions, without personifying them.
- No preference.

A language preference changes names/personification only. The same evidence standards and interpretive permission apply. This can be offered after Mapping rather than as an extra opening hurdle.

## C04 — Topic/detail permissions

Optional chips, off until chosen: **Family · Loss · Money · Growing closeness · Detailed body sensations**. These control D24–25, D54–55, D63–64, D52–53, and D41 respectively. Broad everyday overload can be answered through observable M10 rather than body sensations. A declined topic cannot be reintroduced by paraphrasing it in a generic deepening template.

Before a generic deepening question binds to an optional-topic episode, that episode's permission must still be active. Turning a topic off removes it from future routing; it does not erase historical evidence unless the user also deletes it.

## C05 — Deepening focus and length

“You can finish with your map, or look more closely at one of these moments.” Render the neutral episode labels that actually exist; also provide **Let the unanswered questions guide it · Shorten this · Pause · Finish now**.

This is a priority preference, not evidence that the selected issue is the user's dominant trait. No promise that more questions will reveal a hidden part.

## C06 — Two responses and sequence

For an ordinary single-choice item, an unobtrusive **Two happened together** control allows up to two selections with `relation=simultaneous`. It adds a mode decision and one extra selection. Do not score both as two episodes. For later moves use D07/D08 or a bound authored replay, not “secondary means later.”

D36 has **I remember the order / Some happened together / I do not know the order**. Preserve a partial order graph. On accessible interfaces use buttons for earlier/later/together, not mandatory dragging. No additional response is required.

## C07 — Distinctness for replays and comparisons

“Is this a different occasion from [neutral earlier label]?”

- A different occasion.
- The same occasion; I am adding detail.
- I cannot tell / I was describing what usually happens.

Only the first permits an independent occurrence count. Similarity and difference refer to meaning after identity is established, never the reverse.

## C08 — Correction

For a selected statement or linked observation summary:

- The events are right, but this sounds too broad.
- The action is right; the reason is not.
- These are different occasions or people.
- The name does not fit.
- I need to change an answer.
- It fits the moments I described.
- Leave it open.

Selection opens the appropriate correction control. A disagreement about reason withdraws/reopens that interpretation; it is not hidden confirmation. Summary agreement does not count toward independent support. Offer the underlying observations, not a theoretical label, during assessment so subsequent answers are not primed by a character story.

## C09 — None fits and private notes

**None fits** is useful evidence about the instrument's limitations, not a psychological trait. The user can skip, choose another actual occasion, or add a private note. Private notes do not route, score or enter provider prompts under the supplied application's privacy contract. No silent free-text transfer is authorized by this redesign.

A future opt-in “include my own wording in the report” feature needs a separately reviewed consent, minimization and validation path. Do not pretend today's structured bank can recover information that only exists in a private note. Track none-fit rates for item revision.

## Deterministic slot registry

| Slot | Allowed source |
|---|---|
| evaluator / boundary_person / close_person / support_person / repair_person / conflict_person / family_person | Actual user-selected opaque referent and current role snapshot for the bound event |
| episode_label | Neutral scenario label plus occurrence marker, not an inferred part name |
| context_label | Authored human label for the same context, e.g. “reviews of your work” |
| response_label / first_response_label / next_response_label / contact_response_label | Selected authored response rendered as a neutral nominal phrase; approved forms below |
| first_want / second_want | The actual two terms of M26's selected pair; retain pair order independent of option display order |
| focus_situation | Neutral label of the real source event chosen for comparison: review, mistake, demanding day, help request, disagreement, etc. |
| exposed_experience | Selected D18 or D21 description; never a model-invented hidden feeling |
| episode_a_label / episode_b_label | Two explicitly bound actual occurrences |
| comparison_response_label | A genuinely matched reported behavior; do not equate different option IDs without an approved semantic link |
| candidate_trigger_label | A trigger actually reported in the compared observations; not a generated hypothesis about childhood or abandonment |

The JSON bank is not directly an app renderer. The implementer must bind and validate these inputs before asking the question. A missing slot closes/defer the target; it is never shown literally in the live UI.

### Nominal response rendering

Use exact full selected text as a labeled chip where a grammatical paraphrase is unavailable. Approved nominal forms include: checking again, rehearsing what to say, asking for an update, sending another message, rereading the conversation, explaining your point, making the request smaller, stopping the exchange, turning to something absorbing, going somewhere quieter, continuing to work. The chip always retains the exact original choice beneath it for correction. Nominal wording adds no motive.

M27's first/second choice displays the actual wants, not the bare words “first” and “second.” D58 is only available if the factual candidate trigger was previously selected. D08 requires two actual response descriptions. D36 is only available after at least one actual recovery change; no forced full recovery sequence.

## Specific eligibility beyond simple prerequisites

- M14: do not ask if M13 records no attempt.
- M19.no_reply: an event-status observation; cannot supply relief or continued-monitoring evidence.
- M27: do not ask if M26 says the wants changed successively. Capture any real sequence separately only when there are actual actions to bind.
- M29–M30: only after an actual easier occasion in M28.
- D15: only after an actual harsh self-response, not every M05 selection.
- D17/D18: no automatic assumption of a hidden want; “none” closes the target without further fishing.
- D19: only after an actual exposure concern has been selected; no hypothetical exposure exercise.
- D23: asks about a recalled moment of allowing a feeling, not an instruction to try it now.
- D27: only after the need was actually expressed or became known; not after an unasked request alone.
- D34: only after actual quiet/low response, not a skipped body item.
- D38: only after reported helpful contact; D39 establishes its own optional mismatch occurrence.
- D45: a distinct reassurance event unless explicitly linked; no event means skip.
- D46: only after wanted or enacted space, with same-episode binding.
- D51: only when a repair attempt actually happened; continued distance is a valid outcome.
- D52–53: no automatic rare-bonding branch from emotion intensity. Use only explicit topic interest or an actual recorded private/outward discrepancy with permission.
- D55: no bothersome comment means no during-action data, not an assumption of calm agreement.
- D56–58: two anchored actual occurrences and the particular comparison must exist.
- D59: only if the selected response actually stopped.

## Option order and accessible variant

Stable semantic IDs are authoritative, not displayed A/B/C positions. For nominal lists, use a stored per-session permutation to reduce a permanently “good first option”; replay comparisons preserve the original permutation. Do not shuffle ordinal/sequence scales or M26's within-option pair order. Test order effects; deterministic seeding does not eliminate them.

`M10.observable` is a fully authored alternative in the JSON. It has a different capture channel from M10, not claimed psychometric equivalence. Show its actual six options in the question browser. Body-detail preference never upgrades or downgrades evidence strength.
