"""Executable target opening/closing policies for the base targets plus source-bound coverage extensions."""
from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .evidence import EvidenceIndex
from .model import EvidenceState, History, Target, TargetStatus, stable_id
from .semantics import (EXPOSURE, NEED_LIMITED, PRACTICAL, RELATIONAL, UNKNOWN_OPTIONS, PREVENTIVE,
                        ORDINARY_ACTIONS, matched_behavior)
from .source import Source

# Registry completeness is checked against the immutable authored ontology at load.
HANDLERS = frozenset({
    "access_before_change", "after_stop", "attachment_meaning", "attention", "availability_history",
    "care_scope", "contact_function", "contrast_context", "contrast_goal", "cost", "disclosure_prediction",
    "distance_function", "energy", "expressed_pace", "feeling_access", "function", "goal_change", "help_function",
    "hidden_want", "known_distance", "loss_want", "money_context", "need_exposure", "next_effect", "next_move",
    "noticed_order", "ordinary_contrast", "polarization_first", "polarization_relation", "polarization_second",
    "practical_context", "praise_experience", "predicted_response", "prediction", "quiet_or_access",
    "reassurance_duration", "recovery_duration", "recovery_marker", "recovery_sequence", "recurrence", "repair_aim",
    "repair_feature", "rest_access", "return_after_repair", "self_pressure", "sequence_relation", "social_feature",
    "stand_down", "timing", "uncertainty_meaning", "urge_action_difference", "vulnerable_meaning", "words",
})
NEXT_TARGETS = {"access_before_change", "sequence_relation", "goal_change", "next_effect"}
RECOVERY_TARGETS = {"recovery_duration", "recovery_marker", "recovery_sequence"}
SELF_TARGETS = {"self_pressure", "vulnerable_meaning"}


def target_key(target: str, ep: str, step: str = "first", comparisons: tuple[str, ...] = ()) -> str:
    return stable_id("T", target, ep, step, list(comparisons))


class TargetLifecycleEngine:
    def __init__(self, source: Source):
        if set(source.targets) != set(HANDLERS) | set(source.coverage_rules):
            from .model import ContractError
            raise ContractError("Authored target ontology and executable handler registry disagree.")
        self.source = source

    def build(self, s: EvidenceState, h: History) -> dict[str, Target]:
        idx = EvidenceIndex(s, h, self.source)
        targets: dict[str, Target] = {}
        for ep in s.episodes.values():
            if not idx.actual(ep.id):
                continue
            for tid, definition in self.source.targets.items():
                if tid in self.source.coverage_rules:
                    continue
                origins = idx.observations(ep.id, definition["opens_from_items"])
                if tid == "recurrence" and "recurrence" in h.config.details and ep.root_item_id in self.source.replays:
                    origins = origins or idx.action(ep.id, "first")
                steps = {o.step_id for o in origins} or {"first"}
                if tid in NEXT_TARGETS:
                    steps = {"next"}
                elif tid in RECOVERY_TARGETS:
                    steps = {"recovery"}
                elif tid == "self_pressure":
                    steps = {"self_response"}
                elif tid in {"function", "stand_down", "prediction", "practical_context", "hidden_want", "need_exposure", "vulnerable_meaning", "cost", "predicted_response", "timing", "after_stop"}:
                    steps = {x for x in steps if x not in {"edge", "comparison", "recovery"}} or {"first"}
                else:
                    steps = {"first"} if ep.family != "bound" else steps
                # Explicit requests can open a discriminator but cannot bypass item
                # dependencies, topic permissions, actualness, or specific gates.
                for step in sorted(steps):
                    key = target_key(tid, ep.id, step)
                    requested = key in h.requested_targets
                    if not origins and not requested:
                        continue
                    if not requested and not self._opens(tid, ep.id, step, idx, h):
                        continue
                    t = Target(key, tid, ep.id, step,
                               source_ids=sorted({o.id for o in origins}),
                               candidate_items=list(definition["candidate_items"]),
                               priority=definition["default_priority"],
                               opened_order=min((int(o.administration_id[1:]) for o in origins), default=9999),
                               explicit_request=requested,
                               flags=sorted(idx.flags_for(ep.id, step)))
                    attempts = [a for a in h.administrations.values() if key in a.target_ids and a.id not in h.invalidated]
                    t.attempts = len(attempts)
                    self._close(t, idx, h)
                    maximum = definition["explicitly_requested_maximum_attempts"] if requested else definition["maximum_attempts"]
                    if t.state == TargetStatus.OPEN.value and t.attempts >= maximum:
                        t.state, t.reason = TargetStatus.UNRESOLVED.value, "attempt_limit"
                    if key in h.closed_bindings:
                        outcome = h.closed_bindings[key]
                        t.state = {"skip": TargetStatus.DECLINED.value, "unknown": TargetStatus.UNRESOLVED.value,
                                   "same": TargetStatus.DESCRIBED.value}.get(outcome, TargetStatus.UNAVAILABLE.value)
                        t.reason = "occurrence_binding_" + outcome
                    if key in h.rejected_targets:
                        t.state, t.reason = TargetStatus.UNRESOLVED.value, "respondent_rejected_interpretation"
                    if key in h.target_closures:
                        t.state, t.reason = h.target_closures[key], "explicit_terminal_control"
                    # Ordinary optional texture is not collected merely because an
                    # episode exists. An explicit detail/focus choice can retain it.
                    if t.state == TargetStatus.OPEN.value and t.priority == 6 and not (requested or h.config.details or ep.id in h.config.focus_occurrences):
                        t.state, t.reason = TargetStatus.LOW_VALUE.value, "texture_not_requested"
                    targets[t.id] = t
        self._comparison_targets(idx, h, targets)
        self._entry_targets(idx, h, targets)
        from .coverage import build_coverage_targets
        build_coverage_targets(self.source, idx, h, targets)
        for request in h.requested_details:
            ep, item, step = request["occurrence_id"], request["item_id"], request["step_id"]
            if not idx.actual(ep):
                continue
            key = target_key("detail:" + item, ep, step)
            t = Target(key, "detail:" + item, ep, step, candidate_items=[item], priority=4,
                       explicit_request=True, source_ids=[o.id for o in idx.observations(ep, step=step)],
                       flags=sorted(idx.flags_for(ep, step)))
            self._close(t, idx, h)
            if key in h.closed_bindings:
                t.state, t.reason = TargetStatus.UNAVAILABLE.value, "detail_binding_unavailable"
            targets[key] = t
        # The urge item has a self-loop in the historical prose index; this explicit
        # user-selected detail entry supplies the missing noncircular route to it.
        if "urge" in h.config.details:
            for ep in s.episodes:
                if idx.actual(ep) and idx.action(ep):
                    key = target_key("urge_action_difference", ep)
                    t = targets.get(key) or Target(key, "urge_action_difference", ep, "first", candidate_items=["D31"], priority=6, explicit_request=True,
                                                   source_ids=[o.id for o in idx.action(ep)])
                    self._close(t, idx, h)
                    targets[key] = t
        s.targets = targets
        return targets

    def _opens(self, t: str, ep: str, step: str, x: EvidenceIndex, h: History) -> bool:
        o = x.options(ep)
        sig = x.signals(ep)
        flags = x.flags_for(ep, step)
        focus = ep in h.config.focus_occurrences
        state_detail = "state" in h.config.details
        action = x.action(ep, step)
        if t in {"attachment_meaning", "help_function", "uncertainty_meaning", "money_context", "loss_want", "expressed_pace"}:
            return True
        if t in NEXT_TARGETS:
            return bool(o & {"D07.more", "D07.leave", "D07.absorb", "D07.help", "D07.quiet", "D07.changed", "D07.nothing"})
        if t == "attention":
            return state_detail or bool(sig & {"attention_difficulty", "attention_scattered", "processing_slow"})
        if t == "words":
            return state_detail or bool(sig & {"speech_access", "words_blocked", "low_access"})
        if t == "energy":
            return state_detail or bool(sig & {"energy_drop", "mixed_energy", "energy_shift"})
        if t == "noticed_order":
            return state_detail or "body" in h.config.details
        if t == "availability_history":
            return bool(o & RELATIONAL)
        if t == "contact_function":
            return bool(o & {"M17.check", "M17.send", "M17.reread"}) and bool(o & (RELATIONAL | {"M18.info", "M18.open"}))
        if t == "known_distance":
            return bool(o & {"M18.upset", "M18.matter", "M19.ease", "M19.inspect", "D44.variable", "D44.strained"})
        if t == "reassurance_duration":
            return bool(o & {"M19.ease", "D43.okay"})
        if t == "care_scope":
            return focus or "recurrence" in h.config.details or "contrast" in h.config.details
        if t == "contrast_context":
            return focus or "contrast" in h.config.details or any(ep in e.distinct_from or e.id in x.state.episodes[ep].distinct_from for e in x.state.episodes.values())
        if t == "contrast_goal":
            return True
        if t == "cost":
            return focus or "texture" in h.config.details
        if t == "disclosure_prediction":
            return bool(o & {"D47.piece", "D47.light", "D47.wait", "D47.change", "D47.none"})
        if t == "distance_function":
            return bool(o & {"D62.ask", "D62.agree", "D62.later", "D62.less", "D62.explain", "D62.mix"})
        if t == "feeling_access":
            return "actual_feeling_episode" in flags and (focus or "feeling" in h.config.details)
        if t == "function":
            if not action:
                return False
            aims = x.options(ep, ["M03", "D02", "D15", "D49"], step)
            if aims:
                return True  # Produces an explicit resolved target, not another probe.
            return focus or any(z.signals and z.option_id not in ORDINARY_ACTIONS for z in action)
        if t == "hidden_want":
            return bool(o & NEED_LIMITED or o & {"D02.visible", "D17.none"}) and not bool(o & {"M21.practical", "M21.clear"})
        if t == "need_exposure":
            return bool(o & (NEED_LIMITED | EXPOSURE | {"D17.help", "D17.care", "D17.none", "D18.none", "D21.none"})) and not bool(o & {"M21.practical", "M21.clear"})
        if t == "predicted_response":
            return "reported_exposure_concern" in flags
        if t == "next_move":
            return bool(x.action(ep, "first") or x.action(ep, "during")) and (focus or bool(o & {"M11.push", "M11.absorb", "M11.stop", "M12.function", "M12.same", "M12.worse", "D55.quiet", "D55.end", "D59.other", "D59.urge", "D61.explain", "D61.sharp", "D61.settle", "D61.quiet", "D61.leave"}))
        if t == "ordinary_contrast":
            return "contrast" in h.config.details or (focus and bool(o & {"M01.tasks", "M01.restless", "D60.tasks", "D60.guilt"}))
        if t.startswith("polarization_"):
            if "actual_simultaneous_wants" not in flags or not x.observations(ep, ["M27"]):
                return False
            return t == "polarization_relation" or bool(o & {"D12.cost", "D12.switch"})
        if t == "practical_context":
            # A reported constraint is context, not itself proof of protection.
            return bool(o & {"M03.exposure", "M03.error", "M03.approval", "M09.disappointed", "M09.conflict", "M09.practical", "M09.status", "M16.mistake", "M16.unprepared", "M16.unclear", "M21.burden", "M21.owe", "M21.refusal", "D02.prevent", "D02.visible", "D02.feel", "D03.judged", "D03.connection", "D03.upset", "D19.reject", "D19.judge", "D19.control", "D34.unsafe", "D46.feeling", "D48.trust", "D49.pressure", "D49.worse", "D60.guilt", "D61.leave", "D61.quiet"})
        if t == "praise_experience":
            return bool(o & {"M07.flaw", "M07.credit", "M07.joke", "M07.move_on", "M07.ask"})
        if t == "prediction":
            return bool(o & {"D02.prevent", "D02.visible"}) or bool(o & {"M08.yes", "M08.explain", "M08.delay"})
        if t == "quiet_or_access":
            return "actual_low_response" in flags
        if t == "recovery_marker":
            return focus or bool(o & {"M12.function", "M12.same", "M12.worse", "D30.stuck", "D30.tired", "D34.words", "D34.tired"})
        if t == "recovery_sequence":
            return "actual_recovery_episode" in flags and (state_detail or focus)
        if t == "recovery_duration":
            return "actual_easing" in flags and (focus or state_detail or bool(o & {"M14.brief"}))
        if t == "recurrence":
            return bool(o & {"M03.exposure", "M03.approval", "D04.sign", "D05.usual"}) or "recurrence" in h.config.details
        if t == "repair_aim":
            return bool(o & {"M23.explain", "M23.invite", "M23.wait", "M23.none"}) or focus
        if t == "repair_feature":
            return bool(x.observations(ep, ["M24"]))
        if t == "return_after_repair":
            return bool(x.observations(ep, ["M24"])) and (focus or bool(o & {"M24.space", "M24.outward", "M24.missed"}))
        if t == "rest_access":
            return bool(o & {"M25.one_more", "M25.alternate", "M25.absorb", "M25.exhaust", "M25.deadline"}) or (focus and bool(x.observations(ep, ["M25"])))
        if t == "self_pressure":
            return bool(o & {"M05.attack", "M05.rules", "M06.worse", "D22.careless", "D22.incapable", "D22.not_enough"})
        if t == "social_feature":
            return "actual_helpful_social_effect" in flags or bool(o & {"M22.unhelpful"})
        if t == "stand_down":
            return bool(o & {"M02.recheck", "M02.rehearse", "M03.approval", "M25.one_more", "M25.alternate", "D15.prevent", "D15.before", "D60.tasks", "D60.guilt"}) and not bool(o & {"M03.requirements", "M03.no_aim"})
        if t == "timing":
            return bool(o & {"M03.relief"})  # Before a review is not necessarily before distress.
        if t == "after_stop":
            return "actual_response_stop" in flags
        if t == "urge_action_difference":
            return True
        if t == "vulnerable_meaning":
            return bool(o & {"M05.attack", "D03.judged", "D03.connection", "D15.before", "D15.pay", "D20.need", "D20.hurt", "D20.want", "D20.anger"})
        raise AssertionError(f"Unhandled target {t}")

    def _close(self, t: Target, x: EvidenceIndex, h: History) -> None:
        ep, tid = t.occurrence_id, t.target_id
        fact_flags = {"actual_bothersome_comment": "bothersome_comment", "actual_need_disclosure": "need_became_known", "actual_feeling_episode": "noticed_feeling_without_acting"}
        for item in t.candidate_items:
            if item not in self.source.items:
                continue
            required = self.source.items[item]["eligibility"].get("specific", {}).get("required_flags", [])
            for flag in required:
                if flag not in fact_flags or flag in x.flags_for(ep, t.step_id):
                    continue
                controls = [f for f in h.context_facts if f["occurrence_id"] == ep and f["fact"] == fact_flags[flag]]
                if controls and len(t.candidate_items) == 1:
                    t.state = TargetStatus.UNRESOLVED.value if controls[-1]["value"] is None else TargetStatus.UNAVAILABLE.value
                    t.reason = "required_context_not_confirmed:" + fact_flags[flag]
                    return
        observed = x.observations(ep)
        opts = {o.option_id for o in observed}
        # Select the actual discriminating item(s), never count a same-topic answer
        # from another occurrence as completion.
        candidates = [c for c in t.candidate_items if not c.startswith("REPLAY")]
        if tid == "function":
            candidates = ["M03", "D02", "D15", "D49"]
        elif tid == "prediction" and x.observations(ep, ["M09"]):
            candidates = ["M09"]
        elif tid == "contact_function" and "M18.info" in opts:
            candidates = ["M18"]
        elif tid == "need_exposure" and "D17.none" in opts:
            candidates = ["D17"]
        elif tid == "hidden_want":
            candidates = ["D17", "D20"]
        elif tid == "practical_context" and opts & {"M09.practical", "M09.status", "M16.practical", "M16.loss", "M21.practical", "D64.short", "D64.adjust", "D64.information"}:
            candidates = ["M09", "M16", "M21", "D64"]
        # Cross-episode items answer the parent target through an explicit link.
        ep_ids = [ep] + [e.id for e in x.state.episodes.values() if e.linked_from == ep and e.status == "actual"]
        if tid not in {"known_distance", "reassurance_duration", "ordinary_contrast", "recurrence", "social_feature"}:
            ep_ids = [ep]
        closing = []
        for eid in ep_ids:
            for item in candidates:
                for o in x.observations(eid, [item]):
                    if tid in {"function", "stand_down", "prediction", "cost", "timing"} and o.step_id != t.step_id:
                        continue
                    closing.append(o)
        if tid in NEXT_TARGETS and opts & {"D07.nothing", "D07.changed"}:
            closing = x.observations(ep, ["D07"])
            t.state, t.reason = TargetStatus.DESCRIBED.value, "no_actual_later_action"
        elif tid in NEXT_TARGETS and "D08.different" in opts:
            closing = x.observations(ep, ["D08"])
            t.state, t.reason = TargetStatus.UNRESOLVED.value, "different_occurrences_require_rebinding"
        elif tid == "need_exposure" and opts & {"D18.none", "D21.none", "D21.practical", "D17.none"}:
            closing = [o for o in observed if o.option_id in {"D18.none", "D21.none", "D21.practical", "D17.none"}]
            t.state, t.reason = TargetStatus.ALTERNATIVE.value, "reported_no_exposure_difficulty_or_practical_barrier"
        elif closing:
            values = {o.option_id for o in closing}
            if values & UNKNOWN_OPTIONS:
                t.state, t.reason = TargetStatus.UNRESOLVED.value, "discriminator_retains_uncertainty"
            elif values & PRACTICAL and values & (PREVENTIVE | {"D02.feel", "D09.relief", "D43.okay", "D21.visible", "D18.need", "D48.burden"}):
                t.state, t.reason = TargetStatus.DESCRIBED.value, "multiple_meanings_retained_without_choosing_one"
            elif values & PRACTICAL:
                t.state, t.reason = TargetStatus.ALTERNATIVE.value, "ordinary_or_contextual_explanation_recorded"
            elif values & PREVENTIVE or values & {"D02.feel", "D09.relief", "D43.okay", "D21.visible", "D18.need", "D48.burden"}:
                t.state, t.reason = TargetStatus.SUPPORTED.value, "explicit_discriminating_evidence_recorded_not_a_final_report_claim"
            else:
                t.state, t.reason = TargetStatus.DESCRIBED.value, "discriminator_answered_descriptively"
        if closing:
            t.resolution_ids = sorted({o.id for o in closing})
        if t.state != TargetStatus.OPEN.value:
            return
        # A rendered discriminator's missingness is a legitimate terminal result.
        for a in reversed(list(h.administrations.values())):
            if t.id not in a.target_ids or a.id in h.invalidated:
                continue
            r = h.responses.get(h.current.get(a.id, ""))
            if not r or r.status == "answered":
                continue
            if tid == "function" and a.item_id not in {"D02", "M03", "D15", "D49"}:
                # Not knowing the practical context/prediction does not answer
                # the distinct question about what the response was doing.
                continue
            t.state = (TargetStatus.DECLINED.value if r.status == "skip" else
                       TargetStatus.UNAVAILABLE.value if r.status in {"no_event", "not_applicable"} else TargetStatus.UNRESOLVED.value)
            t.reason = "discriminator_" + r.status
            return
        # Explicitly confirmed distinct replays can resolve recurrence without a
        # forced typicality question. Repeated fields alone are not function proof.
        if tid == "recurrence":
            root_actions = {o.option_id for o in x.action(ep, "first")}
            for other in x.state.episodes.values():
                if other.id == ep or not x.actual(other.id):
                    continue
                if ep not in other.distinct_from and other.id not in x.state.episodes[ep].distinct_from:
                    continue
                matches = matched_behavior(root_actions, {o.option_id for o in x.action(other.id, "first")})
                if matches:
                    t.state, t.reason = TargetStatus.DESCRIBED.value, "same_reported_action_in_confirmed_distinct_occurrences_function_scope_separate"
                    t.resolution_ids = sorted({o.id for o in x.action(ep) + x.action(other.id)})
                    return

    def _comparison_targets(self, x: EvidenceIndex, h: History, out: dict[str, Target]) -> None:
        episodes = sorted(x.state.episodes.values(), key=lambda e: e.id)
        for b in episodes:
            if not x.actual(b.id):
                continue
            for aid in b.distinct_from:
                if not x.actual(aid):
                    continue
                pair = (aid, b.id)
                matched = matched_behavior({o.option_id for o in x.action(aid)}, {o.option_id for o in x.action(b.id)})
                for tid, items, priority in [("contrast_context", ["D56"], 5), ("contrast_goal", ["D57"], 3)]:
                    if tid == "contrast_goal" and not matched:
                        continue
                    key = target_key(tid, aid, "comparison", pair)
                    origins = x.action(aid) + x.action(b.id)
                    if not origins:
                        continue
                    t = Target(key, tid, aid, "comparison", comparison_ids=pair,
                               source_ids=sorted(o.id for o in origins), candidate_items=items, priority=priority,
                               flags=["two_distinct_actual_episodes"] + (["matched_reported_behavior"] if matched else []))
                    administrations = [a for a in h.administrations.values() if key in a.target_ids and a.id not in h.invalidated]
                    t.attempts = len(administrations)
                    for a in administrations:
                        r = h.responses.get(h.current.get(a.id, ""))
                        if r:
                            t.state = (TargetStatus.DESCRIBED.value if r.status == "answered" else TargetStatus.UNRESOLVED.value)
                            t.reason = "comparison_recorded" if r.status == "answered" else "comparison_" + r.status
                            t.resolution_ids = sorted(o.id for o in x.observations(aid) if o.response_id == r.id)
                    out[key] = t
                # A trigger contrast requires a literal reported trigger and a
                # matched behavior; the semantic link never invents a causal trigger.
                trigger = [o for o in x.observations(aid) if o.capture in {"meaning", "prediction"} and o.signals]
                if matched and trigger and ("contrast" in h.config.details or aid in h.config.focus_occurrences):
                    key = target_key("contrast_context", aid, "trigger_comparison", pair)
                    t = Target(key, "contrast_context", aid, "trigger_comparison", comparison_ids=pair,
                               source_ids=sorted(o.id for o in trigger + x.action(aid) + x.action(b.id)), candidate_items=["D58"], priority=5,
                               flags=["two_distinct_actual_episodes", "matched_reported_behavior", "reported_candidate_trigger"])
                    for a in h.administrations.values():
                        if key in a.target_ids and a.id not in h.invalidated:
                            r = h.responses.get(h.current.get(a.id, ""))
                            if r:
                                t.state, t.reason = (TargetStatus.DESCRIBED.value, "trigger_contrast_recorded") if r.status == "answered" else (TargetStatus.UNRESOLVED.value, "trigger_contrast_" + r.status)
                                t.resolution_ids = sorted(o.id for o in x.observations(aid) if o.response_id == r.id)
                    out[key] = t

    def _entry_targets(self, x: EvidenceIndex, h: History, out: dict[str, Target]) -> None:
        for entry in sorted(h.config.focus_topics):
            definition = self.source.entries[entry]
            item = definition["first_item"]
            q = self.source.items[item]
            ep_id = "new:" + entry
            if q["episode_family"] == "bound" or q["eligibility"]["requires_answered"]:
                candidates = [e for e in x.state.episodes.values() if x.actual(e.id) and
                              (q["episode_family"] == "bound" or q["episode_family"] == e.family)]
                candidates.sort(key=lambda e: (e.id not in h.config.focus_occurrences, e.id))
                if not candidates:
                    continue
                ep_id = candidates[0].id
            key = target_key("entry:" + entry, ep_id)
            t = Target(key, "entry:" + entry, ep_id, "first", candidate_items=[item], priority=4, explicit_request=True,
                       flags=sorted(x.flags_for(ep_id)) if ep_id in x.state.episodes else [])
            for a in h.administrations.values():
                if key in a.target_ids and a.id not in h.invalidated:
                    r = h.responses.get(h.current.get(a.id, ""))
                    if r:
                        t.state = TargetStatus.DESCRIBED.value if r.status == "answered" else TargetStatus.UNAVAILABLE.value
                        t.reason = "explicit_entry_answered" if r.status == "answered" else "explicit_entry_" + r.status
            if key in h.closed_bindings:
                t.state, t.reason = TargetStatus.UNAVAILABLE.value, "entry_binding_unavailable"
            if ep_id in x.state.episodes and t.state == TargetStatus.OPEN.value:
                self._close(t, x, h)
            out[key] = t


def lifecycle_delta(before: dict[str, Target], after: dict[str, Target]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {"opened": [], "changed": [], "closed": [], "invalidated": []}
    for key, target in after.items():
        if key not in before:
            result["opened" if target.state == "open" else "closed"].append(asdict(target))
        elif asdict(before[key]) != asdict(target):
            result["changed" if target.state == "open" else "closed"].append({"id": key, "from": before[key].state, "to": target.state, "reason": target.reason})
    for key in sorted(set(before) - set(after)):
        result["invalidated"].append({"id": key, "state": TargetStatus.SUPERSEDED.value, "reason": "live_evidence_no_longer_opens_target"})
    return result
