"""Patternwork design reference: deterministic selection over explicit target snapshots.

This does NOT derive psychological conclusions, implement a database, or implement
all production opening/closing rules. The caller supplies server-derived target
instances and bindings. Run `python verification/verify_release.py` at release root.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

MISSING = frozenset({'none_fit', 'not_sure', 'no_event', 'not_applicable', 'skip'})

@dataclass(frozen=True)
class Answer:
    item_id: str
    occurrence_id: str
    selected: tuple[str, ...] = ()
    status: str = 'answered'
    mode: str = 'single'
    superseded: bool = False
    step_id: str = 'first'

@dataclass(frozen=True)
class Candidate:
    item_id: str
    occurrence_id: str
    target_instance: str
    tier: int
    context: str
    focus: bool = False
    new_requirements: int = 1
    decisions: int = 1
    opened_order: int = 0
    binding_valid: bool = True
    actual_occurrence: bool = True
    flags: frozenset[str] = frozenset()
    step_id: str = 'first'
    variant: str = 'base'
    replay: bool = False
    replay_confirmed_distinct: bool = False
    short_block: bool = False
    force_followup: bool = False  # never bypasses user stop, eligibility or budget

@dataclass
class State:
    answers: list[Answer] = field(default_factory=list)
    used: set[tuple[str, str, str, str]] = field(default_factory=set)
    closed_targets: set[str] = field(default_factory=set)
    target_attempts: dict[str, int] = field(default_factory=dict)
    third_attempt_targets: set[str] = field(default_factory=set)
    topics: set[str] = field(default_factory=set)
    context_last: dict[str, int] = field(default_factory=dict)
    recent_optional: list[str] = field(default_factory=list)
    administrations: int = 0
    mapping_administrations: int = 0
    decisions: int = 0
    phase: str = 'mapping'
    control: str | None = None
    total_limit: int = 56
    mapping_limit: int = 32
    decision_limit: int = 72


def _current_answers(state: State, occurrence_id: str) -> list[Answer]:
    return [a for a in state.answers if not a.superseded and a.occurrence_id == occurrence_id and a.status == 'answered']


def eligible(c: Candidate, s: State, bank: dict[str, dict[str, Any]], allowed_replays: set[str]) -> tuple[bool, str]:
    if c.item_id not in bank:
        return False, 'unknown_item'
    if not c.binding_valid or not c.actual_occurrence:
        return False, 'unbound_or_not_actual'
    if c.target_instance in s.closed_targets:
        return False, 'target_closed'
    if s.target_attempts.get(c.target_instance, 0) >= (3 if c.target_instance in s.third_attempt_targets else 2):
        return False, 'target_attempt_limit'
    key=(c.item_id,c.occurrence_id,c.step_id,c.variant)
    if key in s.used:
        return False, 'already_administered'
    if c.replay and (c.item_id not in allowed_replays or not c.replay_confirmed_distinct):
        return False, 'invalid_replay'
    if c.decisions < 1 or c.tier not in range(1, 7):
        return False, 'invalid_candidate'
    if s.administrations >= s.total_limit or s.decisions+c.decisions > s.decision_limit:
        return False, 'budget'
    if s.phase == 'mapping' and s.mapping_administrations >= s.mapping_limit:
        return False, 'mapping_budget'
    q=bank[c.item_id]
    if c.variant not in q.get('allowed_variants',['base']):
        return False, 'unknown_variant'
    topic=q['eligibility'].get('topic_opt_in')
    if topic and topic not in s.topics:
        return False, 'topic_declined'
    current=_current_answers(s,c.occurrence_id)
    answered={a.item_id for a in current}
    if not set(q['eligibility']['requires_answered']) <= answered:
        return False, 'missing_same_occurrence_parent'
    gates=q['eligibility'].get('specific', {})
    selected={v for a in current for v in a.selected}
    if set(gates.get('exclude_parent_options', ())) & selected:
        return False, 'parent_state_excludes_followup'
    if not set(gates.get('required_parent_options', ())) <= selected:
        return False, 'missing_required_parent_selection'
    if not set(gates.get('required_flags', ())) <= c.flags:
        return False, 'missing_derived_flag'
    return True,'eligible'


def choose_next(candidates: list[Candidate], state: State, bank: dict[str, dict[str, Any]], allowed_replays: set[str]) -> dict[str, Any]:
    """Select using lexicographic priorities, never a psychological score."""
    if state.control in {'end', 'pause', 'edit'}:
        return {'action':state.control,'item_id':None,'reason':'user_control'}
    if state.administrations >= state.total_limit or state.decisions >= state.decision_limit:
        return {'action':'finish','item_id':None,'reason':'burden_ceiling'}
    eligible_items=[]; rejected=[]
    for c in candidates:
        ok,reason=eligible(c,state,bank,allowed_replays)
        if ok and not (state.control=='shorten' and c.tier>=5 and not c.short_block):
            eligible_items.append(c)
        else:
            rejected.append({'item_id':c.item_id,'target':c.target_instance,'reason':reason if not ok else 'shorten'})
    if not eligible_items:
        return {'action':'finish_phase','item_id':None,'reason':'no_eligible_material_target','rejected':rejected}
    # Four optional items in one context: prefer a peer-tier different context,
    # never override a user focus or split a pending coherent short block.
    repeated = state.recent_optional[-1] if len(state.recent_optional)>=4 and len(set(state.recent_optional[-4:]))==1 else None
    def order(c: Candidate) -> tuple:
        peer_diverse = repeated and c.context==repeated and not c.focus and not c.short_block and any(
            x.tier==c.tier and x.context!=repeated for x in eligible_items)
        return (c.tier, not c.focus, bool(peer_diverse), -c.new_requirements,
                c.decisions, state.context_last.get(c.context,-1), c.opened_order,
                c.item_id,c.occurrence_id,c.step_id,c.variant,c.target_instance)
    c=min(eligible_items,key=order)
    return {'action':'ask','item_id':c.item_id,'occurrence_id':c.occurrence_id,
            'target_instance':c.target_instance,'reason':'lexicographic_gap_priority',
            'replay':c.replay,'variant':c.variant,'rejected':rejected}


def validate_answer(answer: Answer, question: dict[str, Any]) -> list[str]:
    """Validate literal response structure; semantic congruence needs review."""
    errors=[]
    valid={o['id'] for o in question['options']}
    if answer.item_id != question['id']:errors.append('item_mismatch')
    if answer.status != 'answered':
        if answer.status not in MISSING:errors.append('invalid_status')
        if answer.selected:errors.append('missingness_cannot_have_selections')
        return errors
    if not answer.selected or not set(answer.selected)<=valid:errors.append('invalid_selections')
    if len(set(answer.selected))!=len(answer.selected):errors.append('duplicate_selections')
    partial=question['selection']['mode']=='partial_order'
    if partial:
        if answer.mode not in {'ordered','simultaneous','order_unknown'}:errors.append('sequence_mode_required')
        if len(answer.selected)>3:errors.append('too_many_sequence_steps')
    else:
        if answer.mode not in {'single','simultaneous','order_unknown'}:errors.append('invalid_mode')
        if answer.mode=='single' and len(answer.selected)!=1:errors.append('single_requires_one')
        if answer.mode!='single' and len(answer.selected)!=2:errors.append('pair_requires_two')
    exclusive={o['id'] for o in question['options'] if o.get('exclusive',False)}
    if len(answer.selected)>1 and set(answer.selected)&exclusive:errors.append('exclusive_selection_mixed')
    return errors
