# Coverage routing changes

All new items are conditional Deepening. The base 56-administration/72-decision ceilings and automatic scope/texture allowance are unchanged. New D72 and D97 roots are user-selected; D84/D99 are optional precision/scope. Explicit requests still obey source, topic and same-episode parent guards.

36 new question targets plus three existing-item routes yield 92 targets. The router records descriptions and legitimate alternatives; it does not count parts or require any framework category.

## Retained-target clarification

The existing `self_pressure` target now resolves through D15 (criticism function). D22 (self-conclusion) is independently reachable through `coverage_self_conclusion`. Answering or declining D22 cannot close the distinct D15 function question. No old item wording changed.

## Target rules

### coverage_self_stance → D65

Purpose: Samples the relationship to a reaction, which ordinary calm, competence, or receiving help cannot establish.

```json
{
  "id": "coverage_self_stance",
  "item_id": "D65",
  "opens_from_items": [
    "M05",
    "M06",
    "M28",
    "M30",
    "D20",
    "D23",
    "D74",
    "D12"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M05",
    "M28",
    "D20",
    "D23",
    "D74",
    "D12"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D65.not_noticed"
  ],
  "unknown_options": [],
  "reason": "Samples the relationship to a reaction, which ordinary calm, competence, or receiving help cannot establish.",
  "scope_note": ""
}
```

### coverage_awareness_choice → D66

Purpose: Distinguishes awareness, room for choice, retrospective reflection, dismissal and felt detachment; none alone yields a Self score.

```json
{
  "id": "coverage_awareness_choice",
  "item_id": "D66",
  "opens_from_items": [
    "D65"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D65.not_noticed"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [],
  "unknown_options": [],
  "reason": "Distinguishes awareness, room for choice, retrospective reflection, dismissal and felt detachment; none alone yields a Self score.",
  "scope_note": ""
}
```

### coverage_internal_admission_barrier → D67

Purpose: Resolves internal exclusion versus temporary demands or difficulty identifying experience, after an actual admission difficulty.

```json
{
  "id": "coverage_internal_admission_barrier",
  "item_id": "D67",
  "opens_from_items": [
    "D20"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D20.none"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D67.demands",
    "D67.not_difficult"
  ],
  "unknown_options": [
    "D67.unclear"
  ],
  "reason": "Resolves internal exclusion versus temporary demands or difficulty identifying experience, after an actual admission difficulty.",
  "scope_note": ""
}
```

### coverage_internal_return → D68

Purpose: Separates temporary postponement, later access, persistence and disappearance without requiring a hidden-part story.

```json
{
  "id": "coverage_internal_return",
  "item_id": "D68",
  "opens_from_items": [
    "D67"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D20.none",
    "D67.not_difficult"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D68.returned",
    "D68.faded"
  ],
  "unknown_options": [
    "D68.no_room",
    "D68.no_later"
  ],
  "reason": "Separates temporary postponement, later access, persistence and disappearance without requiring a hidden-part story.",
  "scope_note": ""
}
```

### coverage_response_internal_effect → D69

Purpose: Links an actual response to internal access without assuming that outward concealment removes internal access.

```json
{
  "id": "coverage_response_internal_effect",
  "item_id": "D69",
  "opens_from_items": [
    "D20",
    "D23",
    "D18",
    "D17"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "D20",
    "D23",
    "D18",
    "D17"
  ],
  "required_flags": [],
  "requires_action": true,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D69.clearer",
    "D69.bearable",
    "D69.hidden_only",
    "D69.same"
  ],
  "unknown_options": [
    "D69.unclear"
  ],
  "reason": "Links an actual response to internal access without assuming that outward concealment removes internal access.",
  "scope_note": ""
}
```

### coverage_self_belief_force → D70

Purpose: Tests the current force and scope of an organizing belief; this does not establish a historical burden or origin.

```json
{
  "id": "coverage_self_belief_force",
  "item_id": "D70",
  "opens_from_items": [
    "D22"
  ],
  "scope": "self_response",
  "any_options": [],
  "exclude_options": [
    "D22.none"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D70.local",
    "D70.rejected"
  ],
  "unknown_options": [],
  "reason": "Tests the current force and scope of an organizing belief; this does not establish a historical burden or origin.",
  "scope_note": ""
}
```

### coverage_self_belief_update → D71

Purpose: Collects reported updating or non-updating rather than assuming a belief resists contrary evidence.

```json
{
  "id": "coverage_self_belief_update",
  "item_id": "D71",
  "opens_from_items": [
    "D70"
  ],
  "scope": "self_response",
  "any_options": [],
  "exclude_options": [
    "D22.none"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D71.revised"
  ],
  "unknown_options": [
    "D71.no_new",
    "D71.unfinished"
  ],
  "reason": "Collects reported updating or non-updating rather than assuming a belief resists contrary evidence.",
  "scope_note": ""
}
```

### coverage_held_back_material → D72

Purpose: A user-selected new episode extends beyond hurt and need to anger, pride, interests and voice. Keeping something private is not itself evidence of an exile.

```json
{
  "id": "coverage_held_back_material",
  "item_id": "D72",
  "opens_from_items": [],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": false,
  "priority": 4,
  "root": true,
  "alternative_options": [],
  "unknown_options": [],
  "reason": "A user-selected new episode extends beyond hurt and need to anger, pride, interests and voice. Keeping something private is not itself evidence of an exile.",
  "scope_note": ""
}
```

### coverage_held_back_reason → D73

Purpose: Separates external consequences, chosen privacy, timing and internal prohibition in a volunteered actual episode.

```json
{
  "id": "coverage_held_back_reason",
  "item_id": "D73",
  "opens_from_items": [
    "D72"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D73.privacy",
    "D73.timing",
    "D73.consequences"
  ],
  "unknown_options": [],
  "reason": "Separates external consequences, chosen privacy, timing and internal prohibition in a volunteered actual episode.",
  "scope_note": ""
}
```

### coverage_private_permission → D74

Purpose: Directly tests internal permission rather than upgrading outward concealment into an exile.

```json
{
  "id": "coverage_private_permission",
  "item_id": "D74",
  "opens_from_items": [
    "D73"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D74.allow",
    "D74.changed"
  ],
  "unknown_options": [
    "D74.hard_locate"
  ],
  "reason": "Directly tests internal permission rather than upgrading outward concealment into an exile.",
  "scope_note": ""
}
```

### coverage_two_wants_access → D75

Purpose: Samples actual internal engagement, not an instruction to perform an exercise; not trying is a valid endpoint.

```json
{
  "id": "coverage_two_wants_access",
  "item_id": "D75",
  "opens_from_items": [
    "D12"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "M26.sequential"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D75.not_tried"
  ],
  "reason": "Samples actual internal engagement, not an instruction to perform an exercise; not trying is a valid endpoint.",
  "scope_note": ""
}
```

### coverage_shared_concern → D76

Purpose: Records a perceived relation between two actual concerns without turning a shared word into a shared Exile or separate entities.

```json
{
  "id": "coverage_shared_concern",
  "item_id": "D76",
  "opens_from_items": [
    "D13",
    "D14"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D76.one",
    "D76.neither"
  ],
  "unknown_options": [
    "D76.unclear"
  ],
  "reason": "Records a perceived relation between two actual concerns without turning a shared word into a shared Exile or separate entities.",
  "scope_note": ""
}
```

### coverage_pattern_continuity → D77

Purpose: A distinct-occurrence comparison follows a reported matched action. Identity remains an interpretation, not a literal part count.

```json
{
  "id": "coverage_pattern_continuity",
  "item_id": "D77",
  "opens_from_items": [],
  "scope": "comparison",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D77.different",
    "D77.only_action"
  ],
  "unknown_options": [
    "D77.unclear"
  ],
  "reason": "A distinct-occurrence comparison follows a reported matched action. Identity remains an interpretation, not a literal part count.",
  "scope_note": ""
}
```

### coverage_response_return → D78

Purpose: Records an actual return rather than calling every two-step sequence a loop. Return has a new step identity, not a cyclic chronology.

```json
{
  "id": "coverage_response_return",
  "item_id": "D78",
  "opens_from_items": [
    "D08",
    "D10"
  ],
  "scope": "return",
  "any_options": [
    "D08.after_failed",
    "D08.after",
    "D08.alternate"
  ],
  "exclude_options": [
    "D08.different",
    "D08.overlap",
    "D08.uncertain",
    "D07.nothing",
    "D07.changed"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D78.no",
    "D78.ended"
  ],
  "unknown_options": [
    "D78.unclear"
  ],
  "reason": "Records an actual return rather than calling every two-step sequence a loop. Return has a new step identity, not a cyclic chronology.",
  "scope_note": ""
}
```

### coverage_return_context → D79

Purpose: Describes the reported conditions before a return; not proof of the unique cause of a feedback loop.

```json
{
  "id": "coverage_return_context",
  "item_id": "D79",
  "opens_from_items": [
    "D78"
  ],
  "scope": "return",
  "any_options": [],
  "exclude_options": [],
  "all_options": [
    "D78.returned"
  ],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D79.unclear"
  ],
  "reason": "Describes the reported conditions before a return; not proof of the unique cause of a feedback loop.",
  "scope_note": ""
}
```

### coverage_remaining_capacity → D80

Purpose: Samples a remaining capability without pretending an unselected capability was absent or measuring total state range.

```json
{
  "id": "coverage_remaining_capacity",
  "item_id": "D80",
  "opens_from_items": [
    "M10",
    "M11",
    "M12",
    "D29",
    "D30",
    "D34"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M10",
    "D29",
    "D30",
    "D34"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D80.unclear"
  ],
  "reason": "Samples a remaining capability without pretending an unselected capability was absent or measuring total state range.",
  "scope_note": ""
}
```

### coverage_outward_inward → D81

Purpose: Records the respondent’s own estimate of presentation; not an observer measurement or evidence that the body is the hidden truth.

```json
{
  "id": "coverage_outward_inward",
  "item_id": "D81",
  "opens_from_items": [
    "M12",
    "D34",
    "D30",
    "M24"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M12",
    "D34",
    "D30",
    "M24"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 6,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D81.no_view"
  ],
  "reason": "Records the respondent’s own estimate of presentation; not an observer measurement or evidence that the body is the hidden truth.",
  "scope_note": ""
}
```

### coverage_onset_shape → D82

Purpose: Describes remembered onset without inferring objective speed, cause, thresholds or body-first precedence.

```json
{
  "id": "coverage_onset_shape",
  "item_id": "D82",
  "opens_from_items": [
    "M10",
    "D33",
    "D32"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M10",
    "D33",
    "D32"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D82.unclear"
  ],
  "reason": "Describes remembered onset without inferring objective speed, cause, thresholds or body-first precedence.",
  "scope_note": ""
}
```

### coverage_residual_difficulty → D83

Purpose: Distinguishes resuming activity from recovery in other channels without assuming an unseen residual cost.

```json
{
  "id": "coverage_residual_difficulty",
  "item_id": "D83",
  "opens_from_items": [
    "M12",
    "D35"
  ],
  "scope": "first",
  "any_options": [
    "M12.function"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D83.nothing"
  ],
  "unknown_options": [
    "D83.not_back"
  ],
  "reason": "Distinguishes resuming activity from recovery in other channels without assuming an unseen residual cost.",
  "scope_note": ""
}
```

### coverage_easing_time_estimate → D84

Purpose: A coarse recalled interval, not a physiological recovery latency, treatment target or exact threshold.

```json
{
  "id": "coverage_easing_time_estimate",
  "item_id": "D84",
  "opens_from_items": [
    "M10",
    "M14",
    "D35"
  ],
  "scope": "recovery",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M10"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": true,
  "details": [
    "state",
    "texture"
  ],
  "automatic": true,
  "priority": 6,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D84.no_easing",
    "D84.cannot_estimate"
  ],
  "reason": "A coarse recalled interval, not a physiological recovery latency, treatment target or exact threshold.",
  "scope_note": ""
}
```

### coverage_function_ease_order → D85

Purpose: A remembered channel comparison, not a required recovery ladder or measured physiology.

```json
{
  "id": "coverage_function_ease_order",
  "item_id": "D85",
  "opens_from_items": [
    "M12",
    "M14",
    "D35",
    "D36"
  ],
  "scope": "recovery",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [
    "M12",
    "M14",
    "D35"
  ],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D85.unclear"
  ],
  "reason": "A remembered channel comparison, not a required recovery ladder or measured physiology.",
  "scope_note": ""
}
```

### coverage_recovery_conditions → D86

Purpose: Preserves changing circumstances instead of attributing every improvement to an internal strategy.

```json
{
  "id": "coverage_recovery_conditions",
  "item_id": "D86",
  "opens_from_items": [
    "M14",
    "D35"
  ],
  "scope": "recovery",
  "any_options": [
    "M14.choice",
    "M14.energy",
    "M14.settled",
    "M14.brief"
  ],
  "exclude_options": [
    "M13.nothing"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [
    "actual_easing"
  ],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D86.unclear"
  ],
  "reason": "Preserves changing circumstances instead of attributing every improvement to an internal strategy.",
  "scope_note": ""
}
```

### coverage_company_effect → D87

Purpose: Distinguishes practical assistance, internal settling, performance and added demand during the same actual company episode.

```json
{
  "id": "coverage_company_effect",
  "item_id": "D87",
  "opens_from_items": [
    "M13"
  ],
  "scope": "recovery",
  "any_options": [],
  "exclude_options": [],
  "all_options": [
    "M13.company"
  ],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D87.practical",
    "D87.same"
  ],
  "unknown_options": [],
  "reason": "Distinguishes practical assistance, internal settling, performance and added demand during the same actual company episode.",
  "scope_note": ""
}
```

### coverage_company_aftereffect → D88

Purpose: Adds durability without claiming another person regulates someone universally or that company caused a change.

```json
{
  "id": "coverage_company_aftereffect",
  "item_id": "D88",
  "opens_from_items": [
    "D87"
  ],
  "scope": "recovery",
  "any_options": [],
  "exclude_options": [],
  "all_options": [
    "M13.company"
  ],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D88.new",
    "D88.not_alone"
  ],
  "reason": "Adds durability without claiming another person regulates someone universally or that company caused a change.",
  "scope_note": ""
}
```

### coverage_relational_self_expectation → D89

Purpose: A present working expectation in one wait; not a global self-model or childhood rule.

```json
{
  "id": "coverage_relational_self_expectation",
  "item_id": "D89",
  "opens_from_items": [
    "M18"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 6,
  "root": false,
  "alternative_options": [
    "D89.practical",
    "D89.none"
  ],
  "unknown_options": [],
  "reason": "A present working expectation in one wait; not a global self-model or childhood rule.",
  "scope_note": ""
}
```

### coverage_relational_expected_response → D90

Purpose: Distinguishes what the respondent expected the other person would do from what the respondent wanted their own follow-up to achieve.

```json
{
  "id": "coverage_relational_expected_response",
  "item_id": "D90",
  "opens_from_items": [
    "D43",
    "M18"
  ],
  "scope": "first",
  "any_options": [
    "D43.okay",
    "D43.notice",
    "M18.upset",
    "M18.matter"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 6,
  "root": false,
  "alternative_options": [
    "D90.reply"
  ],
  "unknown_options": [
    "D90.undecided"
  ],
  "reason": "Distinguishes what the respondent expected the other person would do from what the respondent wanted their own follow-up to achieve.",
  "scope_note": ""
}
```

### coverage_help_response → D91

Purpose: Adds the actual reported other response so the report need not invent the consequence of a smaller request.

```json
{
  "id": "coverage_help_response",
  "item_id": "D91",
  "opens_from_items": [
    "M20",
    "M21"
  ],
  "scope": "first",
  "any_options": [
    "M20.ask",
    "M20.small",
    "M20.justify"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D91.pending"
  ],
  "reason": "Adds the actual reported other response so the report need not invent the consequence of a smaller request.",
  "scope_note": ""
}
```

### coverage_need_after_response → D92

Purpose: Distinguishes receiving the requested amount from having the actual need met; the other person’s intention remains unknown.

```json
{
  "id": "coverage_need_after_response",
  "item_id": "D92",
  "opens_from_items": [
    "D91"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D91.pending"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D92.met",
    "D92.changed"
  ],
  "unknown_options": [],
  "reason": "Distinguishes receiving the requested amount from having the actual need met; the other person’s intention remains unknown.",
  "scope_note": ""
}
```

### coverage_pace_fit → D93

Purpose: Adds desired versus actual pace at a known stage, without claiming a universal ideal speed or rare-bonding subtype.

```json
{
  "id": "coverage_pace_fit",
  "item_id": "D93",
  "opens_from_items": [
    "D53"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D93.fit"
  ],
  "unknown_options": [
    "D93.unsure"
  ],
  "reason": "Adds desired versus actual pace at a known stage, without claiming a universal ideal speed or rare-bonding subtype.",
  "scope_note": ""
}
```

### coverage_pace_conditions → D94

Purpose: Preserves practical capacity, actual interest and expected commitments as alternatives to protective explanations.

```json
{
  "id": "coverage_pace_conditions",
  "item_id": "D94",
  "opens_from_items": [
    "D93"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [],
  "unknown_options": [
    "D94.unclear"
  ],
  "reason": "Preserves practical capacity, actual interest and expected commitments as alternatives to protective explanations.",
  "scope_note": ""
}
```

### coverage_interest_aftereffect → D95

Purpose: Records what followed actual expressed interest. Do not invent a disclosure episode when the person only waited.

```json
{
  "id": "coverage_interest_aftereffect",
  "item_id": "D95",
  "opens_from_items": [
    "D53"
  ],
  "scope": "first",
  "any_options": [
    "D53.direct",
    "D53.small"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D95.same"
  ],
  "unknown_options": [
    "D95.unclear"
  ],
  "reason": "Records what followed actual expressed interest. Do not invent a disclosure episode when the person only waited.",
  "scope_note": ""
}
```

### coverage_repair_unfinished → D96

Purpose: Distinguishes unfinished or inadequate repair from an assumed inability to receive it.

```json
{
  "id": "coverage_repair_unfinished",
  "item_id": "D96",
  "opens_from_items": [
    "M24",
    "D50"
  ],
  "scope": "first",
  "any_options": [
    "M24.details",
    "M24.change",
    "M24.outward",
    "M24.missed",
    "D50.none"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D96.nothing"
  ],
  "unknown_options": [
    "D96.unclear"
  ],
  "reason": "Distinguishes unfinished or inadequate repair from an assumed inability to receive it.",
  "scope_note": ""
}
```

### coverage_exploration_support → D97

Purpose: A user-selected context samples support for exploration rather than only relationship threat.

```json
{
  "id": "coverage_exploration_support",
  "item_id": "D97",
  "opens_from_items": [],
  "scope": "first",
  "any_options": [],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": false,
  "priority": 4,
  "root": true,
  "alternative_options": [
    "D97.private",
    "D97.none"
  ],
  "unknown_options": [],
  "reason": "A user-selected context samples support for exploration rather than only relationship threat.",
  "scope_note": ""
}
```

### coverage_exploration_effect → D98

Purpose: Distinguishes secure-base-like support, practical input and permission-seeking within one recalled event.

```json
{
  "id": "coverage_exploration_effect",
  "item_id": "D98",
  "opens_from_items": [
    "D97"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D97.private",
    "D97.none"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D98.practical",
    "D98.same"
  ],
  "unknown_options": [
    "D98.no_response"
  ],
  "reason": "Distinguishes secure-base-like support, practical input and permission-seeking within one recalled event.",
  "scope_note": ""
}
```

### coverage_sequence_typicality → D99

Purpose: Reported sequence typicality is not a collection of independent observed episodes or proof of a lifetime loop.

```json
{
  "id": "coverage_sequence_typicality",
  "item_id": "D99",
  "opens_from_items": [
    "D08",
    "D78"
  ],
  "scope": "first",
  "any_options": [],
  "exclude_options": [
    "D08.different",
    "D08.overlap",
    "D08.uncertain",
    "D07.nothing",
    "D07.changed"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": true,
  "details": [
    "recurrence",
    "contrast"
  ],
  "automatic": true,
  "priority": 6,
  "root": false,
  "alternative_options": [
    "D99.once"
  ],
  "unknown_options": [
    "D99.unclear"
  ],
  "reason": "Reported sequence typicality is not a collection of independent observed episodes or proof of a lifetime loop.",
  "scope_note": ""
}
```

### coverage_meaning_after_easing → D100

Purpose: Captures a reported change in interpretation, rather than assigning a cognitive stereotype from a state label.

```json
{
  "id": "coverage_meaning_after_easing",
  "item_id": "D100",
  "opens_from_items": [
    "M14",
    "D35"
  ],
  "scope": "recovery",
  "any_options": [
    "M14.choice",
    "M14.energy",
    "M14.settled",
    "M14.brief"
  ],
  "exclude_options": [
    "M13.nothing"
  ],
  "all_options": [],
  "any_items": [],
  "required_flags": [
    "actual_easing"
  ],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 5,
  "root": false,
  "alternative_options": [
    "D100.same"
  ],
  "unknown_options": [
    "D100.unclear"
  ],
  "reason": "Captures a reported change in interpretation, rather than assigning a cognitive stereotype from a state label.",
  "scope_note": ""
}
```

### coverage_internal_access → D20

Purpose: Make existing internal admission independently reachable after an exposure concern; D17 does not answer D20.

```json
{
  "id": "coverage_internal_access",
  "item_id": "D20",
  "opens_from_items": [
    "D18",
    "D21",
    "D48"
  ],
  "scope": "first",
  "any_options": [
    "D18.need",
    "D18.hurt",
    "D18.anger",
    "D18.want",
    "D18.uncertain",
    "D21.visible",
    "D21.need",
    "D48.burden",
    "D48.judge"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [],
  "unknown_options": [],
  "reason": "Make existing internal admission independently reachable after an exposure concern; D17 does not answer D20.",
  "scope_note": "Existing authored question; routing eligibility is not a clinical finding.",
  "guard_details": false
}
```

### coverage_feeling_tolerance → D23

Purpose: Use actual reported room for feeling to reach the existing tolerance question, without assigning Self or an exile.

```json
{
  "id": "coverage_feeling_tolerance",
  "item_id": "D23",
  "opens_from_items": [
    "D65",
    "D66"
  ],
  "scope": "first",
  "any_options": [
    "D65.patient",
    "D66.choice"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [
    "actual_feeling_episode"
  ],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [],
  "unknown_options": [],
  "reason": "Use actual reported room for feeling to reach the existing tolerance question, without assigning Self or an exile.",
  "scope_note": "Existing authored question; routing eligibility is not a clinical finding.",
  "guard_details": false
}
```

### coverage_self_conclusion → D22

Purpose: Keep the existing self-conclusion question reachable after self-criticism instead of allowing a different vulnerability question to close its gap.

```json
{
  "id": "coverage_self_conclusion",
  "item_id": "D22",
  "opens_from_items": [
    "M05",
    "M06"
  ],
  "scope": "self_response",
  "any_options": [
    "M05.attack",
    "M05.rules",
    "M06.worse"
  ],
  "exclude_options": [],
  "all_options": [],
  "any_items": [],
  "required_flags": [],
  "requires_action": false,
  "focus_or_details_only": false,
  "details": [],
  "automatic": true,
  "priority": 4,
  "root": false,
  "alternative_options": [
    "D22.none",
    "D22.learning"
  ],
  "unknown_options": [],
  "reason": "Keep the existing self-conclusion question reachable after self-criticism instead of allowing a different vulnerability question to close its gap.",
  "scope_note": "A local reported conclusion, not a global identity or acquired burden.",
  "guard_details": false
}
```

## Graph and correction invariants

D78 actual return creates a new later `return` step after `next`, never a directed cycle back in time. D08 overlap/unknown/different-event cannot license it. D99 is reported typicality, not an independent occurrence. Actual-response anchors, scope, current parent content and exclusion choices are dependencies; edits invalidate affected descendants while preserving unrelated evidence.

## Report interface

New observations are report input even without a deterministic structural finding. The active report binding is separate from the assessment source. No v6 writer prompt is activated by the router.
