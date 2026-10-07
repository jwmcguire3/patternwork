"""Coverage-extension targets: literal evidence gaps, never theory classifiers.

New targets close descriptively. Both alternative answers and unresolved answers
are valid. Eligibility and response dependencies are server-derived. This module
does not count constructs or make a requested theoretical finding mandatory.
"""
from __future__ import annotations
from typing import Any
from .model import ContractError, Target, TargetStatus, SequenceEdge, stable_id
from .semantics import matched_behavior


def validate_coverage_source(source) -> None:
    rules = source.coverage["rules"]
    if len(source.coverage_rules) != len(rules) or len(source.coverage_by_item) != len(rules):
        raise ContractError("Duplicate coverage target or item rule.")
    option_ids = {o["id"] for q in source.items.values() for o in q["options"]}
    for rule in rules:
        if rule["id"] not in source.targets or source.targets[rule["id"]]["candidate_items"] != [rule["item_id"]]:
            raise ContractError("Coverage target/candidate index mismatch.")
        if rule["item_id"] not in source.items or not set(rule["opens_from_items"]) <= source.items.keys():
            raise ContractError("Unknown coverage item or origin.")
        for key in ("any_options", "all_options", "exclude_options", "alternative_options", "unknown_options"):
            if not set(rule[key]) <= option_ids:
                raise ContractError("Unknown coverage option: " + str(set(rule[key]) - option_ids))
        if not set(rule["any_items"]) <= source.items.keys():
            raise ContractError("Unknown coverage evidence item.")
        if rule["scope"] not in {"first", "self_response", "recovery", "return", "comparison"}:
            raise ContractError("Unknown coverage scope.")
        if set(rule["alternative_options"]) & set(rule["unknown_options"]):
            raise ContractError("Alternative and unknown closures overlap.")
        # New items are qualitative descriptions with no automatic part identity.
        if any(x in rule["id"] for x in ("exile_exists", "self_score", "attachment_type")):
            raise ContractError("A coverage rule cannot classify psychological identity.")


def coverage_gate(rule, x, h, ep: str | None, step: str, comparisons=()):
    """Return an explicit rejection reason and its live literal anchor leaves.

    New-episode roots do not assert an existing history. Attached details can
    never bypass the same-origin evidence requirements by request_detail.
    """
    if rule["root"]:
        return None, []
    if ep is None or not x.actual(ep):
        return "coverage_requires_actual_episode", []
    obs = x.observations(ep)
    opts = {o.option_id for o in obs}
    anchors = []
    if rule["scope"] == "comparison":
        if len(comparisons) != 2 or not all(x.actual(e) for e in comparisons):
            return "coverage_requires_distinct_comparison", []
        a, b = [x.state.episodes[e] for e in comparisons]
        if a.id not in b.distinct_from and b.id not in a.distinct_from:
            return "coverage_comparison_distinctness_unknown", []
        aa, bb = x.action(a.id), x.action(b.id)
        if not matched_behavior({o.option_id for o in aa}, {o.option_id for o in bb}):
            return "coverage_comparison_requires_matched_action", []
        # Collect only a deeper continuity comparison after the basic context or
        # job comparison was actually answered for these same two episodes.
        matched_admins = [ad for ad in h.administrations.values() if ad.item_id in {"D56", "D57"} and
                         tuple(ad.comparison_ids) == tuple(comparisons) and ad.id not in h.invalidated]
        live = [h.responses[h.current[ad.id]] for ad in matched_admins if ad.id in h.current and h.responses[h.current[ad.id]].status == "answered"]
        if not live:
            return "coverage_comparison_needs_context_or_job", []
        lids = {r.id for r in live}
        anchors += aa + bb + [o for o in obs if o.response_id in lids]
    if rule["any_items"]:
        matches = [o for o in obs if o.item_id in rule["any_items"]]
        if not matches:
            return "coverage_anchor_item_missing", []
        anchors += matches
    if rule["any_options"]:
        matches = [o for o in obs if o.option_id in rule["any_options"]]
        if not matches:
            return "coverage_discriminating_selection_missing", []
        anchors += matches
    if not set(rule["all_options"]) <= opts:
        return "coverage_required_selection_missing", []
    anchors += [o for o in obs if o.option_id in rule["all_options"]]
    if set(rule["exclude_options"]) & opts:
        return "coverage_answer_excludes_followup", []
    # Dependencies on exclusion controls matter too: a later edit can withdraw
    # the premise even where the current selected option was not the excluded one.
    relevant_items = {oid.split(".")[0] for oid in rule["exclude_options"]}
    anchors += [o for o in obs if o.item_id in relevant_items]
    if rule["requires_action"]:
        action = x.action(ep, step)
        if not action:
            return "coverage_selected_action_missing", []
        anchors += action
    if not set(rule["required_flags"]) <= x.flags_for(ep, step):
        return "coverage_required_context_missing", []
    if rule["required_flags"]:
        # Actual easing and feeling presence can have several literal sources;
        # preserve them as dependencies, never accept a client-supplied flag.
        flag_sources = {"actual_easing": {"M12", "M14", "D35"}, "actual_feeling_episode": {"D24", "D25", "D65", "D66"}}
        needed = set().union(*(flag_sources.get(f, set()) for f in rule["required_flags"]))
        anchors += [o for o in obs if o.item_id in needed]
    q = x.source.items[rule["item_id"]]
    for parent in q["eligibility"]["requires_answered"]:
        r = x.current_response(ep, parent)
        if not r or r.status != "answered":
            return "coverage_same_episode_parent_missing", []
        anchors += [o for o in obs if o.response_id == r.id]
    return None, list({o.id: o for o in anchors}.values())


def _close(rule, t, x, h):
    answered = x.observations(t.occurrence_id, [rule["item_id"]], t.step_id)
    if rule["scope"] == "comparison":
        ids = {a.id for a in h.administrations.values() if a.item_id == rule["item_id"] and a.comparison_ids == t.comparison_ids}
        answered = [o for o in answered if o.administration_id in ids]
    if answered:
        values = {o.option_id for o in answered}
        t.resolution_ids = sorted(o.id for o in answered)
        if values & set(rule["unknown_options"]):
            t.state, t.reason = TargetStatus.UNRESOLVED.value, "coverage_uncertainty_retained"
        elif values <= set(rule["alternative_options"]):
            t.state, t.reason = TargetStatus.ALTERNATIVE.value, "coverage_ordinary_or_competing_account"
        else:
            t.state, t.reason = TargetStatus.DESCRIBED.value, "coverage_description_recorded_not_theory_classification"
        return
    for a in reversed(list(h.administrations.values())):
        if a.id in h.invalidated or a.item_id != rule["item_id"] or a.occurrence_id != t.occurrence_id or a.step_id != t.step_id:
            continue
        r = h.responses.get(h.current.get(a.id, ""))
        if r and r.status != "answered":
            t.state = TargetStatus.DECLINED.value if r.status == "skip" else TargetStatus.UNAVAILABLE.value if r.status in {"no_event", "not_applicable"} else TargetStatus.UNRESOLVED.value
            t.reason = "coverage_" + r.status
            return


def build_coverage_targets(source, x, h, out: dict[str, Target]) -> None:
    from .targets import target_key
    for rule in source.coverage_rules.values():
        if rule["root"]:
            # Entry-point presentation supplied this occurrence. Record its own
            # target resolution without using it to start another occurrence.
            for root_ep in x.state.episodes.values():
                if x.actual(root_ep.id) and root_ep.root_item_id == rule["item_id"]:
                    key = target_key(rule["id"], root_ep.id, "first")
                    root_obs = x.observations(root_ep.id, [rule["item_id"]])
                    t = Target(key, rule["id"], root_ep.id, "first", source_ids=sorted(o.id for o in root_obs),
                               candidate_items=[rule["item_id"]], priority=rule["priority"], attempts=1)
                    _close(rule, t, x, h)
                    out[key] = t
            continue
        for ep in sorted(x.state.episodes.values(), key=lambda e: e.id):
            if not x.actual(ep.id):
                continue
            pairs = [()]
            if rule["scope"] == "comparison":
                pairs = [(ep.id, e.id) for e in sorted(x.state.episodes.values(), key=lambda e:e.id) if x.actual(e.id) and ep.id in e.distinct_from]
            for pair in pairs:
                step = rule["scope"]
                key = target_key(rule["id"], ep.id, step, pair)
                requested = key in h.requested_targets
                focused = ep.id in h.config.focus_occurrences
                origins = x.observations(ep.id, rule["opens_from_items"])
                if rule["scope"] != "comparison" and not origins and not requested:
                    continue
                if not rule["automatic"] and not requested:
                    continue
                reason, anchors = coverage_gate(rule, x, h, ep.id, step, pair)
                if reason:
                    continue
                t = Target(key, rule["id"], ep.id, step,
                           source_ids=sorted({o.id for o in origins+anchors}), candidate_items=[rule["item_id"]],
                           priority=rule["priority"], comparison_ids=pair,
                           opened_order=min((int(o.administration_id[1:]) for o in origins+anchors),default=9999),
                           explicit_request=requested, flags=sorted(x.flags_for(ep.id,step)))
                t.attempts = sum(a.item_id == rule["item_id"] and a.occurrence_id == ep.id and a.step_id == step and a.id not in h.invalidated for a in h.administrations.values())
                _close(rule,t,x,h)
                if t.state == TargetStatus.OPEN.value:
                    # Presentation has reserved the attempt but has not answered
                    # it; keep the target open until an actual response arrives.
                    answered_attempts = sum(a.item_id == rule["item_id"] and a.occurrence_id == ep.id and a.step_id == step and a.id in h.current and a.id not in h.invalidated for a in h.administrations.values())
                    if answered_attempts >= source.targets[rule["id"]]["maximum_attempts"]:
                        t.state,t.reason=TargetStatus.UNRESOLVED.value,"coverage_attempt_limit"
                    elif rule["focus_or_details_only"] and not (requested or focused or set(rule["details"]) & set(h.config.details)):
                        t.state,t.reason=TargetStatus.LOW_VALUE.value,"coverage_optional_precision_not_requested"
                if key in h.rejected_targets:
                    t.state,t.reason=TargetStatus.UNRESOLVED.value,"respondent_rejected_interpretation"
                if key in h.target_closures:
                    t.state,t.reason=h.target_closures[key],"explicit_terminal_control"
                if key in h.closed_bindings:
                    t.state,t.reason=TargetStatus.UNAVAILABLE.value,"coverage_binding_closed"
                out[key]=t


def append_return_edges(s) -> None:
    """Actual next -> return is a new temporal step, not an impossible cycle."""
    for o in s.observations.values():
        if o.option_id != "D78.returned":
            continue
        endpoints = [x for x in s.observations.values() if x.occurrence_id == o.occurrence_id]
        order = [x for x in endpoints if x.option_id in {"D08.after_failed", "D08.after", "D08.alternate"}]
        nxt = [x for x in endpoints if x.item_id == "D07" and x.option_id not in {"D07.nothing", "D07.changed"}]
        if not order or not nxt:
            raise ContractError("Return edge lacks its same-episode sequence.")
        ids = tuple(sorted({o.id,*[x.id for x in order+nxt]}))
        s.edges.append(SequenceEdge(stable_id("G",o.id,"return"),o.occurrence_id,"next",o.step_id,"before",ids,
                                    meaning="reported_earlier_response_returns_at_a_later_step_not_a_causal_loop"))
