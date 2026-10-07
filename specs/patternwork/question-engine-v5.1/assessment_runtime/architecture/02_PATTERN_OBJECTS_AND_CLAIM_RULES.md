# Pattern objects and claim rules

All gates below are **authoring policies**, not validated clinical thresholds. Missing a field limits that field or scope; it does not require discarding an otherwise useful description.

## Common envelope

Every pattern has `pattern_id`, source item/option IDs, occurrence and step IDs, context and referent snapshots, claim kind, evidence basis, counterevidence, scope, unassessed fields, name status, and revision lineage. Names are writer-originated working handles unless supplied by the respondent. Renaming never changes evidence.

| Object | Required to describe it | Optional high-value fields | Claims that remain unavailable |
|---|---|---|---|
| Strategy | Actual context and action/internal move | timing, goal, effect, recurrence | protective purpose from action alone |
| Manager function | A strategy plus evidence of prevention/keeping difficulty from developing or escalating | feared outcome, stop condition, cost, exception | every thought/control behavior is a manager |
| Firefighter function | A strategy responding to difficult experience plus a supported immediate relief/escape/override function | urgency, predecessor, benefit and cost | intense emotion, low activity or capacity loss alone identifies a firefighter |
| Vulnerable theme | Reported want, feeling, concern or difficulty with exposure | linked concealment/avoidance, contextual contrast | childhood cause, traumatic history, age |
| Vulnerable part | Recurring present vulnerability with linked protection, distinguishable enough to make a part handle useful | what lets it be more visible, competing needs | a hidden independent entity has been detected |
| Handoff | Two responses within one occurrence, relation and roles/functions at each step | trigger for change, immediate payoff, later residue | unrelated work manager caused relationship withdrawal |
| Polarization | Two simultaneously competing directions plus evidence they obstruct or intensify each other | each concern, alternating action, temporary compromise | ordinary ambivalence proves two antagonistic parts |
| State description | Lived attention/speech/energy/body/social-access information with context | timing, action urge, recovery, outward/inner contrast | vagal activity, physiological diagnosis or stable baseline |
| State transition | At least two anchored experiential moments with an actual reported relation | external demands, duration category, recovery markers | questionnaire order establishes a causal chain |
| Attachment pattern | Relational cue + respondent meaning/aim + movement/response in a named relationship | reliability, practical stakes, repair, comparison, recurrence | waiting, asking, privacy or distance alone establishes an attachment type |
| Self-relationship | How the respondent treats themself in a specific situation | actual aim, effect, rules, praise contrast | self-criticism must have a benevolent conscious intention |
| Available capacity | Something the person actually could do in a sampled moment | conditions, persistence, comparable harder event | absence of an example means absence of Self or secure attachment |
| Context contrast | Two distinguishable actual episodes with comparable evidence and preserved differences | function in each, same behavior/different aim | one difference proves its cause or a universal trigger |
| Correction/exception | Respondent-specified contradiction, correction or contrary event | aspect changed, scope implications | correction is defensive resistance |

## Managers are not restricted to the night before

Prevention is a function, not a clock-time label. A response during disagreement can try to prevent rejection or keep a vulnerability from becoming exposed. Conversely, an action before a meeting may seek relief from distress already underway. Record the relationship between timing and function rather than classify by “before = manager; during = firefighter.”

Name a clear episode-scoped manager directly: **“The Rehearsal Manager prepares you for the moment someone might ask something you cannot answer.”** Recurrence can broaden this to the evaluations sampled. Do not extrapolate it to all work or all relationships.

## Firefighters without sensationalism

A firefighter need not look dramatic or socially unacceptable. Getting absorbed in a game, abruptly ending an exchange, or urgently working on something else could serve this role. The same actions can also be leisure, a boundary or an ordinary task change. Preserve the difference between stated relief-seeking and a supported inferred relief function. No mandate to find a firefighter in every respondent.

Capacity loss is described directly. “You wanted to answer, but words were not available” is not downgraded because the evidence does not establish a deliberate protective action. It is often a more useful finding than a forced part label.

## Vulnerability without manufacturing history

D17–D23 and D27 connect actual wants, visibility, expectations and self-response. The useful object may be **“needing help while trying not to be seen needing it.”** No exile is required to make that intimate. “Exile” can be explained as IFS vocabulary for kept-away vulnerability when an actual linked pattern supports that reading; not as proof of hidden trauma or a younger self.

## Attachment without reducing every relationship to attachment

A relational circumstance is a sampling context. Its explanatory lens depends on the data. An unanswered message about an urgent payment may principally concern logistics. A boundary with an unpredictable boss may principally concern realistic consequences. A supportive friend may contribute to a state/recovery description without implying anything global about attachment.

Preserve repair offered, repair received, reassurance received, actual changes in behavior and subsequent contact as separate events unless the respondent identifies them as one. A good apology and durable reassurance are not interchangeable measurements.

## What earns broader language

- One richly described event can support a direct, named functional interpretation within that event.
- A respondent's statement that a behavior is usual supports a **reported tendency**, not independently demonstrated recurrence.
- Two distinct occurrences can support recurrence of what actually repeats. Repeated action does not automatically replicate the function.
- A comparable counterexample may narrow the scope while strengthening the explanation.
- More contexts do not erase contextual differences. Merge/split decisions require function and context, not identical verbs.

## A concrete claim ledger example

```json
{
  "claim_id": "CL-example-01",
  "kind": "supported_interpretation",
  "text": "The Rehearsal Manager prepares you against being caught without an answer.",
  "role": "manager",
  "scope": {"kind": "occurrence", "occurrence_ids": ["EP-evaluation-1"]},
  "basis": "reported_action_and_preventive_aim",
  "source_answer_ids": ["A-M02", "A-M03"],
  "independent_occurrence_count": 1,
  "name_origin": "writer_working_handle",
  "counterevidence_ids": [],
  "unassessed": ["developmental_origin", "body_signature", "recurrence"],
  "status": "draft_requires_semantic_review"
}
```

No clinician, database, or hidden memory is being claimed. This is a bounded interpretation of selected responses.
