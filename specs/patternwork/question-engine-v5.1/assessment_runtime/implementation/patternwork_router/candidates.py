"""Automatic candidates from live targets, with server-owned episode bindings."""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from reference_router import Answer, Candidate, State, choose_next, eligible
from .evidence import EvidenceIndex
from .model import Administration, Dependency, Episode, EvidenceState, History, SLOTS, Target, dependency_fingerprint, ContextDependency
from .semantics import matched_behavior
from .source import Source

ROLE_WORDS = {"partner": "your partner", "former_partner": "your former partner", "friend": "your friend", "family_member": "your family member", "colleague": "your colleague", "supervisor": "your supervisor", "client": "your client", "teacher": "your teacher", "reviewer": "the person reviewing your work", "other_person": "the person you selected"}
CONTEXT_WORDS = {"ordinary": "ordinary moment", "evaluation": "review of your work", "mistake": "mistake", "praise": "moment of appreciation", "boundary": "request when you were stretched", "overload": "demanding day", "practical_wait": "wait for practical information", "reply_wait": "wait for a message", "help_request": "help request", "receiving_help": "time you received help", "repair_offered": "attempt to put something right", "repair_received": "repair attempt from the other person", "rest": "evening you meant to stop", "two_pulls": "moment of competing wants", "exception": "easier occasion", "conflict": "disagreement", "autonomy": "request for your own time", "disclosure": "personal conversation", "loss": "reminder of loss", "money": "expense", "known_delay": "wait when you knew the reason", "reassurance": "reassurance conversation", "family_contact": "family contact", "new_closeness": "new connection", "help_missed": "attempted help that missed", "ordinary_second": "other ordinary moment", "disappointment": "disappointment", "self_expression": "held-back reaction or wish", "exploration": "trying something unfamiliar"}
PAIRS = {"M26.finish": ("to get it right", "to be done"), "M26.contact": ("contact", "space"), "M26.speak": ("to speak plainly", "to keep the peace"), "M26.help": ("help", "to manage alone"), "M26.rest": ("rest", "to keep working")}
SHORT_CHILDREN = {"M02": ["M03"], "M04": ["M05", "M06"], "M08": ["M09"], "M10": ["M11", "M12"], "M11": ["M12"], "M15": ["M16"], "M17": ["M18", "M19"], "M20": ["M21"], "M26": ["M27"], "M28": ["M29", "M30"]}


@dataclass
class CompiledCandidate:
    candidate: Candidate
    dependencies: tuple[Dependency, ...] = ()
    slots: dict[str, str] = field(default_factory=dict)
    comparison_ids: tuple[str, ...] = ()
    new_episode: Episode | None = None
    source_step_id: str = "first"
    binding_request: dict[str, Any] | None = None
    target_ids: tuple[str, ...] = ()
    replay_of: str | None = None
    context_dependencies: tuple[ContextDependency, ...] = ()

    @property
    def key(self) -> tuple[str, str, str, str]:
        c = self.candidate
        return c.item_id, c.occurrence_id, c.step_id, c.variant


@dataclass
class Compilation:
    candidates: list[CompiledCandidate]
    rejected: list[dict[str, Any]]
    selector_state: State
    decision: dict[str, Any]
    selected: CompiledCandidate | None = None


class TargetCandidateCompiler:
    def __init__(self, source: Source):
        self.source = source

    def compile(self, s: EvidenceState, h: History) -> Compilation:
        x = EvidenceIndex(s, h, self.source)
        compiled: list[CompiledCandidate] = []
        rejected: list[dict[str, Any]] = []
        if h.phase == "mapping":
            for item in s.readiness["applicable_pending_items"]:
                q = self.source.items[item]
                ep_id = "new:coverage:" + item
                parents = q["eligibility"]["requires_answered"]
                if parents:
                    matches = [a for a in h.administrations.values() if a.item_id == parents[0] and not a.replay_of and a.id not in h.invalidated]
                    if not matches:
                        continue
                    ep_id = matches[-1].occurrence_id
                if item == "M28" and any(i not in {"M28", "M29", "M30"} for i in s.readiness["applicable_pending_items"]):
                    continue
                t = Target("coverage:" + item, "coverage", ep_id, "first", candidate_items=[item], priority=1 if parents else 2)
                c, reason = self._candidate(t, item, x, h)
                if c:
                    compiled.append(c)
                else:
                    rejected.append({"item_id": item, "target": t.id, "reason": reason})
        if h.phase == "deepening":
            # Attached fields of a replay are genuine authored questions, not
            # independently sampled recurrences or hand-manufactured snapshots.
            for a in h.administrations.values():
                if a.replay_of and a.id not in h.invalidated and x.actual(a.occurrence_id):
                    for child in SHORT_CHILDREN.get(a.item_id, []):
                        t = Target("replay_attached:" + a.id + ":" + child, "replay_attached", a.occurrence_id, "first", candidate_items=[child], priority=1)
                        c, reason = self._candidate(t, child, x, h)
                        if c:
                            compiled.append(c)
                        elif reason not in {"already_answered", "already_administered"}:
                            rejected.append({"item_id": child, "target": t.id, "reason": reason})
            for target in sorted(s.targets.values(), key=lambda t: t.id):
                if target.state != "open":
                    rejected.append({"item_id": None, "target": target.id, "reason": "target_" + target.state})
                    continue
                for item in target.candidate_items:
                    c, reason = self._candidate(target, item, x, h)
                    if c:
                        compiled.append(c)
                    else:
                        rejected.append({"item_id": item, "target": target.id, "reason": reason})
        # One administration can satisfy several targets. Coalesce candidates by
        # actual item/episode/step/variant, while retaining all target identities.
        dedup: dict[tuple[str, str, str, str], CompiledCandidate] = {}
        for c in compiled:
            if c.key not in dedup:
                dedup[c.key] = c
            else:
                prior = dedup[c.key]
                ids = tuple(sorted(set(prior.target_ids) | set(c.target_ids)))
                best = c if c.candidate.tier < prior.candidate.tier else prior
                best.target_ids = ids
                dedup[c.key] = best
        compiled = list(dedup.values())
        state = self._selector_state(s, h)
        allowed: list[CompiledCandidate] = []
        for c in compiled:
            ok, reason = eligible(c.candidate, state, self.source.items, self.source.replays)
            if ok:
                allowed.append(c)
            else:
                rejected.append({"item_id": c.candidate.item_id, "target": c.candidate.target_instance, "reason": reason})
        decision = choose_next([c.candidate for c in allowed], state, self.source.items, self.source.replays)
        selected = next((c for c in allowed if decision.get("item_id") == c.candidate.item_id and decision.get("target_instance") == c.candidate.target_instance and decision.get("occurrence_id") == c.candidate.occurrence_id), None)
        decision["rejected"] = rejected + decision.get("rejected", [])
        decision["candidate_count"] = len(allowed)
        decision["candidates"] = [{"item_id": c.candidate.item_id, "target_ids": list(c.target_ids),
                                   "occurrence_id": c.candidate.occurrence_id, "step_id": c.candidate.step_id,
                                   "priority": c.candidate.tier, "focus": bool(c.candidate.focus),
                                   "new_requirements": c.candidate.new_requirements, "decisions": c.candidate.decisions,
                                   "binding_control_needed": bool(c.binding_request), "replay": c.candidate.replay,
                                   "derived_flags": sorted(c.candidate.flags),
                                   "selected": c is selected} for c in allowed]
        decision["open_targets"] = [{"id": t.id, "target": t.target_id, "priority": t.priority, "occurrence_id": t.occurrence_id, "missing_discriminator": t.candidate_items} for t in s.targets.values() if t.state == "open"]
        decision["burden"] = {"administrations": len(h.administrations), "decisions": h.decisions,
                              "total_limit": h.config.total_limit, "decision_limit": h.config.decision_limit}
        return Compilation(allowed, rejected, state, decision, selected)

    def _selector_state(self, s: EvidenceState, h: History) -> State:
        answers = []
        for r in h.live_responses():
            a = h.administrations[r.administration_id]
            if a.id in {b["administration_id"] for b in s.unresolved_bindings}:
                continue
            answers.append(Answer(a.item_id, h.rebindings.get(a.id, a.occurrence_id), r.selected, r.status, r.mode, False, a.step_id))
        used = {(a.item_id, a.occurrence_id, a.step_id, a.variant) for a in h.administrations.values() if a.id not in h.invalidated}
        last = {}
        recent = []
        for i, a in enumerate(h.administrations.values()):
            context = h.episodes[a.occurrence_id].context
            last[context] = i
            if a.phase == "deepening":
                recent.append(context)
        return State(answers=answers, used=used, closed_targets={t.id for t in s.targets.values() if t.state != "open"},
                     target_attempts={t.id: t.attempts for t in s.targets.values()}, third_attempt_targets=set(h.requested_targets),
                     topics=set(h.config.topics), context_last=last, recent_optional=recent,
                     administrations=len(h.administrations), mapping_administrations=sum(a.phase == "mapping" for a in h.administrations.values()),
                     decisions=h.decisions, phase=h.phase, control=h.control or ("shorten" if h.shortened else None),
                     total_limit=h.config.total_limit, mapping_limit=h.config.mapping_limit, decision_limit=h.config.decision_limit)

    def _candidate(self, t: Target, requested_item: str, x: EvidenceIndex, h: History) -> tuple[CompiledCandidate | None, str]:
        source_ep = x.state.episodes.get(t.occurrence_id)
        item = requested_item
        replay = item.startswith("REPLAY")
        if replay:
            if source_ep is None or not x.actual(source_ep.id):
                return None, "replay_requires_actual_source"
            item = item.split(":", 1)[1] if ":" in item else source_ep.root_item_id
            if item == "M11":
                item = "M10"  # Replay the authored prerequisite, then M11/M12.
            if item not in self.source.replays:
                return None, "root_not_replayable"
            # A single confirmed replay per source template is enough for this
            # reference scope. A new replay must not seed an infinite replay tree.
            if any(a.replay_of == source_ep.id and a.item_id == item for a in h.administrations.values()):
                return None, "replay_already_attempted"
            if source_ep.linked_from and any(a.replay_of for a in h.administrations.values() if a.occurrence_id == source_ep.id):
                return None, "replay_tree_limit"
        if item not in self.source.items:
            return None, "unknown_item"
        q = self.source.items[item]
        topic = q["eligibility"].get("topic_opt_in")
        if topic and topic not in h.config.topics:
            return None, "topic_declined"
        if source_ep and source_ep.topic and source_ep.topic not in h.config.topics:
            return None, "inherited_topic_declined"
        if q["context"] in h.config.unavailable_contexts:
            return None, "context_unavailable"
        key = t.id
        if key in h.closed_bindings:
            return None, "binding_" + h.closed_bindings[key]
        binding = h.bindings.get(key, {})
        fixed = q["episode_family"] not in {"bound", "comparison"}
        is_root = fixed and not q["eligibility"]["requires_answered"]
        new = source_ep is None or replay or (is_root and source_ep.family != q["episode_family"])
        if not new and fixed and source_ep.family != q["episode_family"]:
            return None, "requires_its_own_actual_episode_not_same_topic"
        if q["episode_family"] == "comparison":
            new = False
            if len(t.comparison_ids) != 2 or any(not x.actual(e) for e in t.comparison_ids):
                return None, "comparison_requires_two_actual_episodes"
        if q["episode_family"] == "bound" and (source_ep is None or not x.actual(source_ep.id)):
            return None, "bound_template_requires_actual_episode"
        if new and not is_root:
            return None, "missing_actual_root"
        if not new and not x.actual(source_ep.id):
            return None, "attached_question_requires_actual_episode"
        # An entry context already sampled is not silently resampled as a new root.
        if new and not replay and source_ep:
            linked = [e for e in x.state.episodes.values() if e.linked_from == source_ep.id and e.root_item_id == item]
            if linked:
                return None, "new_episode_already_attempted_for_target"
        ep_id = f"EP{len(h.episodes)+1:04d}" if new else source_ep.id
        source_step = t.step_id
        if source_step in {"recovery", "comparison", "trigger_comparison", "edge"}:
            source_step = "first"
        if item in {"D08", "D09", "D10", "D11"}:
            next_rs = x.current_response(source_ep.id, "D07") if source_ep else None
            if next_rs:
                source_step = h.administrations[next_rs.administration_id].source_step_id
            else:
                source_step = "first"
        step = q["step_binding"]
        if step == "selected":
            step = t.step_id if t.step_id not in {"comparison", "trigger_comparison"} else "first"
        if item in {"M05", "M06", "D15", "D22"}:
            step = "self_response"
        if item in {"D07", "D09", "D10", "D11"}:
            step = "next"
        if new:
            step, source_step = "first", "first"
        variant = "M10.observable" if item == "M10" and "body_detail" not in h.config.topics else "base"
        # An ordinary item is administered once per bound step. A correction may
        # reissue an invalidated item with fresh dependencies and a new generation.
        for a in h.administrations.values():
            if a.id not in h.invalidated and (a.item_id, a.occurrence_id, a.step_id, a.variant) == (item, ep_id, step, variant):
                return None, "already_administered"
        deps: list[Dependency] = []

        def depend(response, reason: str, aspect: str = "content") -> None:
            if response:
                dep = Dependency(response.administration_id, dependency_fingerprint(response, aspect), reason, aspect)
                if dep not in deps:
                    deps.append(dep)

        if not new:
            for parent in q["eligibility"]["requires_answered"]:
                r = x.current_response(ep_id, parent)
                if not r or r.status != "answered":
                    return None, "missing_same_occurrence_parent"
                depend(r, "same_occurrence_parent", "status_basis")
            gates = q["eligibility"].get("specific", {})
            opts = x.options(ep_id)
            if set(gates.get("exclude_parent_options", [])) & opts:
                return None, "parent_state_excludes_followup"
            if not set(gates.get("required_parent_options", [])) <= opts:
                return None, "required_parent_selection_missing"
            for opt in gates.get("exclude_parent_options", []) + gates.get("required_parent_options", []):
                depend(x.current_response(ep_id, opt.split(".")[0]), "literal_option_gate", "option:" + opt)
        if item in self.source.coverage_by_item:
            from .coverage import coverage_gate
            rule = self.source.coverage_by_item[item]
            enforce = rule.get("guard_details", True) or t.target_id == rule["id"]
            if enforce:
                reason, anchors = coverage_gate(rule, x, h, source_ep.id if source_ep else None, step, t.comparison_ids)
                if reason:
                    return None, reason
                for o in anchors:
                    depend(h.responses[o.response_id], "coverage_evidence_anchor")
        # New data-driven gates carry relevant anchors even for the existing D20/D23.
        flags = x.flags_for(ep_id, source_step if item == "D07" else step) if not new else set()
        flags = set(flags) | set(t.flags)
        if t.comparison_ids:
            flags.add("two_distinct_actual_episodes")
        required = set(q["eligibility"].get("specific", {}).get("required_flags", []))
        if not required <= flags:
            return None, "missing_derived_flag:" + ",".join(sorted(required - flags))
        if item in {"D09", "D10", "D11"}:
            relation = x.current_response(ep_id, "D08")
            if not relation or relation.status != "answered":
                return None, "establish_same_occurrence_relation_first"
            if "D08.different" in relation.selected:
                return None, "different_occurrences_require_rebinding"
            depend(relation, "same_event_after_relation_discriminator", "option:D08.different")
        if item == "D08" and x.has(ep_id, "D07.changed", "D07.nothing"):
            return None, "no_actual_later_action"
        # Capture the live evidence behind each flag, rather than trusting booleans.
        flag_sources = {
            "actual_next_move": ["D07", "D08"], "actual_simultaneous_wants": ["M26"],
            "reported_exposure_concern": ["D18", "D21"], "actual_need_disclosure": ["M20"],
            "actual_recovery_episode": ["M12", "M14", "D35"], "actual_easing": ["M12", "M14", "D35"],
            "actual_helpful_social_effect": ["M13", "M14", "M22"], "actual_wait_response": ["M17"],
            "actual_feeling_episode": ["D24", "D25", "D65", "D66"],
            "actual_received_repair": ["M24"], "actual_response_stop": ["D04"],
        }
        for flag in required:
            for provider in flag_sources.get(flag, []):
                r = x.current_response(ep_id, provider)
                if r and r.status == "answered":
                    depend(r, "derived_flag:" + flag, "option:D08.different" if provider == "D08" else "content")
        slots: dict[str, str] = {}
        prompt = self.source.question(item, variant)["prompt"]
        needed = self.source.slots(prompt)
        person_slots = needed & set(SLOTS)
        person = None
        role = None
        inherited_person = source_ep.person_id if source_ep else None
        if binding.get("person_id"):
            person = binding["person_id"]
        elif new and item in {"D42", "D45"} and inherited_person:
            person = inherited_person
        elif not new and inherited_person:
            person = inherited_person
        elif person_slots:
            person = h.config.referents.get(sorted(person_slots)[0])
        if person:
            role = h.config.people.get(person)
            if not role:
                return None, "unknown_person"
            for slot in person_slots:
                slots[slot] = ROLE_WORDS[role]
        elif person_slots and not new:
            return None, "episode_has_no_person_for_this_template"
        compare_source = None
        if item == "M28":
            comparable = [e for e in x.state.episodes.values() if x.actual(e.id) and x.action(e.id) and e.family not in {"exception", "ordinary", "receiving_help"}]
            if not comparable:
                return None, "no_comparable_actual_occurrence"
            chosen = binding.get("source_occurrence_id")
            if chosen and chosen not in {e.id for e in comparable}:
                return None, "invalid_comparison_source"
            compare_source = x.state.episodes[chosen] if chosen else sorted(comparable, key=lambda e: (e.id not in h.config.focus_occurrences, e.id))[0]
            slots["focus_situation"] = CONTEXT_WORDS.get(compare_source.family, "pressured moment")
        elif source_ep:
            compare_source = source_ep
        requires_distinct = new and (replay or item in {"M28", "D40", "D42"}) and compare_source is not None
        binding_request = None
        if new and ((person_slots and not person) or (requires_distinct and binding.get("relation") != "different")):
            binding_request = {"key": key, "item_id": item,
                               "needs_person": bool(person_slots and not person),
                               "person_choices": [{"id": p, "role": r} for p, r in sorted(h.config.people.items())],
                               "needs_distinctness": requires_distinct,
                               "source_occurrence_id": compare_source.id if compare_source else None,
                               "source_occurrence_choices": [e.id for e in x.state.episodes.values() if x.actual(e.id) and x.action(e.id)] if item == "M28" else [],
                               "prompt": "Choose the actual person and occasion. A different question does not necessarily mean a different event.",
                               "outcomes": ["confirm", "same", "unknown", "no_event", "skip"]}
        ep_family = q["episode_family"] if new else source_ep.family
        ep_label = CONTEXT_WORDS.get(ep_family, "selected moment") + " (" + ep_id + ")"
        slots["episode_label"] = ep_label
        slots["context_label"] = CONTEXT_WORDS.get(ep_family, "situations like this")
        action_step = source_step if item in {"D07", "D08"} else step
        action = x.action(source_ep.id, action_step) if source_ep else []
        if action:
            text = " / ".join(o.text for o in action)
            slots["response_label"] = "the response you selected [" + text + "]"
            for o in action:
                depend(h.responses[o.response_id], "displayed_selected_response")
        if source_ep and item == "D08":
            first = x.action(ep_id, source_step)
            nxt = x.action(ep_id, "next")
            slots["first_response_label"] = "the first response [" + " / ".join(o.text for o in first) + "]"
            slots["next_response_label"] = "the later response [" + " / ".join(o.text for o in nxt) + "]"
            for o in first + nxt:
                depend(h.responses[o.response_id], "sequence_endpoint")
        elif source_ep and "next_response_label" in needed:
            nxt = x.action(ep_id, "next")
            if nxt:
                slots["next_response_label"] = "the later response [" + " / ".join(o.text for o in nxt) + "]"
                for o in nxt:
                    depend(h.responses[o.response_id], "displayed_next_response")
        if "contact_response_label" in needed and source_ep:
            responses = x.observations(ep_id, ["M17"])
            slots["contact_response_label"] = "that response [" + " / ".join(o.text for o in responses) + "]"
            for o in responses:
                depend(h.responses[o.response_id], "displayed_contact_response")
        if item == "M27" or needed & {"first_want", "second_want"}:
            wants = [o for o in x.observations(ep_id, ["M26"]) if o.option_id in PAIRS]
            if len(wants) != 1:
                return None, "ambiguous_want_pair"
            slots["first_want"], slots["second_want"] = PAIRS[wants[0].option_id]
            depend(h.responses[wants[0].response_id], "displayed_want_pair")
        if "exposed_experience" in needed:
            obs = [o for o in x.observations(ep_id, ["D18", "D21"]) if o.option_id not in {"D18.none", "D21.none", "D21.practical"}]
            if not obs:
                return None, "no_exposure_to_render"
            slots["exposed_experience"] = "that experience [" + " / ".join(o.text for o in obs) + "]"
            for o in obs:
                depend(h.responses[o.response_id], "exposure_binding")
        if t.comparison_ids:
            ea, eb = [x.state.episodes[e] for e in t.comparison_ids]
            slots["episode_a_label"] = CONTEXT_WORDS.get(ea.family, "moment") + " (" + ea.id + ")"
            slots["episode_b_label"] = CONTEXT_WORDS.get(eb.family, "moment") + " (" + eb.id + ")"
            aa, ba = x.action(ea.id), x.action(eb.id)
            if matched_behavior({o.option_id for o in aa}, {o.option_id for o in ba}):
                slots["comparison_response_label"] = "a matched action [" + " / ".join(o.text for o in aa) + "]"
            for o in aa + ba:
                depend(h.responses[o.response_id], "comparison_endpoint")
            triggers = [o for o in x.observations(ea.id) if o.capture in {"meaning", "prediction"} and o.signals]
            if triggers:
                slots["candidate_trigger_label"] = "the concern you reported [" + triggers[0].text + "]"
                depend(h.responses[triggers[0].response_id], "literal_candidate_trigger")
        missing = needed - set(slots)
        if missing - person_slots:
            return None, "unbound_slots:" + ",".join(sorted(missing - person_slots))
        # Root identity dependencies concern actualness, not every selected action.
        if source_ep and not new:
            root_rs = x.current_response(ep_id, source_ep.root_item_id)
            depend(root_rs, "actual_episode_basis", "status_basis")
        priority = t.priority
        short = priority == 1 or item in {"D08", "D09", "D10", "M03", "M05", "M06", "M09", "M11", "M12", "M18", "M19", "M21", "M27", "M29", "M30"}
        if item == "D08":
            priority = 1  # Establish identity/order before any later effect.
        new_ep = None
        comparisons = t.comparison_ids
        if new:
            linked = compare_source.id if compare_source else None
            new_ep = Episode(ep_id, q["episode_family"], q["context"], item, person, role,
                             topic=topic, linked_from=linked,
                             distinct_from=[linked] if requires_distinct and binding.get("relation") == "different" else [],
                             recall_window=h.config.recall_window)
            if requires_distinct and linked:
                comparisons = (linked, ep_id)
        actual = True if new else x.actual(ep_id)
        c = Candidate(item, ep_id, t.id, priority, q["context"] if new else source_ep.context,
                      focus=t.explicit_request or (source_ep and source_ep.id in h.config.focus_occurrences) or
                      (h.phase == "mapping" and h.config.entry_context == q["context"]),
                      new_requirements=2 if replay or (t.target_id == "need_exposure" and item == "D21") else 1, decisions=2 if item == "D36" else 1,
                      opened_order=t.opened_order, binding_valid=not bool(missing - person_slots),
                      actual_occurrence=actual, flags=frozenset(flags), step_id=step, variant=variant,
                      replay=replay, replay_confirmed_distinct=bool(binding.get("relation") == "different") or bool(binding_request),
                      short_block=short)
        context_deps = []
        fact_flags = {"actual_bothersome_comment": "bothersome_comment", "actual_need_disclosure": "need_became_known", "actual_feeling_episode": "noticed_feeling_without_acting"}
        for flag in required:
            fact = fact_flags.get(flag)
            independent = (flag == "actual_need_disclosure" and x.has(ep_id, "M20.ask", "M20.small", "M20.justify")) or (flag == "actual_feeling_episode" and x.has(ep_id, "D24.stay", "D25.remember", "D65.patient", "D66.choice"))
            if fact and not independent and any(f["occurrence_id"] == ep_id and f["fact"] == fact and f["value"] is True for f in h.context_facts):
                context_deps.append(ContextDependency(ep_id, fact, True))
        deps.sort(key=lambda d: (d.administration_id, d.aspect, d.reason, d.response_fingerprint))
        context_deps.sort(key=lambda d: (d.occurrence_id, d.fact, d.expected_value))
        return CompiledCandidate(c, tuple(deps), slots, comparisons, new_ep, source_step,
                                 binding_request, (t.id,), source_ep.id if replay else None, tuple(context_deps)), "eligible"
