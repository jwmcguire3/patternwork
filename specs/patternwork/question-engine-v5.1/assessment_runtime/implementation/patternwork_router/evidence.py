"""Journal reduction, live evidence projection, episode and sequence integrity.

At this instrument's bounded size a complete deterministic replay is intentional:
it removes stale caches and makes correction behavior inspectable. Projection is
indexed by occurrence; no language model or free-text classifier is involved.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict
from typing import Any, Iterable

from .model import (Administration, Basis, Config, ContractError, Dependency,
                    Episode, EvidenceState, History, Observation, Response, ContextDependency,
                    SequenceEdge, stable_id, dependency_fingerprint)
from .source import Source

CONTEXT_FACTS = frozenset({"bothersome_comment", "need_became_known", "noticed_feeling_without_acting"})
NO_ACTION_OPTIONS = frozenset({"M02.none", "M13.nothing", "M23.none", "D07.nothing", "D07.changed", "D54.none", "D63.none"})
ACTION_CAPTURES = frozenset({"first_action", "next_action", "later_action", "during_action", "self_response"})
EXPECTATION_ITEMS = frozenset({"M09", "D03", "D19", "D48", "D89", "D90"})
TENDENCY_ITEMS = frozenset({"D05", "D44", "D99"})


def _administration(raw: dict[str, Any]) -> Administration:
    data = dict(raw)
    data["dependencies"] = tuple(Dependency(**x) for x in data.get("dependencies", []))
    data["context_dependencies"] = tuple(ContextDependency(**x) for x in data.get("context_dependencies", []))
    for k in ("target_ids", "comparison_ids", "option_order"):
        data[k] = tuple(data.get(k, []))
    return Administration(**data)


def _response(raw: dict[str, Any]) -> Response:
    data = dict(raw)
    data["selected"] = tuple(data.get("selected", []))
    return Response(**data)


class EvidenceStateReducer:
    def __init__(self, source: Source):
        self.source = source

    def history(self, config: Config, events: list[dict[str, Any]]) -> History:
        self.source.validate_config(config)
        h = History(config=deepcopy(config))
        if len(events) > 2000:
            raise ContractError("Journal limit exceeded; end or start a versioned extension.")
        for index, event in enumerate(events, 1):
            if event.get("seq") != index or set(event) != {"seq", "kind", "payload"}:
                raise ContractError("Noncanonical journal event/order.")
            kind, p = event["kind"], deepcopy(event["payload"])
            if kind == "present":
                a = _administration(p["administration"])
                if a.id in h.administrations or a.item_id not in self.source.items:
                    raise ContractError("Duplicate or unknown administration.")
                if h.pending is not None:
                    raise ContractError("Only one unresolved presentation may be active.")
                if p.get("episode"):
                    ep = Episode(**p["episode"])
                    if ep.id in h.episodes:
                        raise ContractError("Duplicate occurrence identity.")
                    h.episodes[ep.id] = ep
                if a.occurrence_id not in h.episodes:
                    raise ContractError("Presentation has no episode.")
                if not set(a.comparison_ids) <= set(h.episodes):
                    raise ContractError("Unknown comparison episode.")
                for dep in a.dependencies:
                    rid = h.current.get(dep.administration_id)
                    if not rid or dep.administration_id in h.invalidated or dependency_fingerprint(h.responses[rid], dep.aspect) != dep.response_fingerprint:
                        raise ContractError("Presentation depends on stale evidence.")
                for dep in a.context_dependencies:
                    facts = [f for f in h.context_facts if f["occurrence_id"] == dep.occurrence_id and f["fact"] == dep.fact]
                    if not facts or facts[-1]["value"] is not dep.expected_value:
                        raise ContractError("Presentation depends on an unavailable context fact.")
                q = self.source.question(a.item_id, a.variant)
                if set(a.option_order) != {o["id"] for o in q["options"]} or len(a.option_order) != len(q["options"]):
                    raise ContractError("Invalid presented option permutation.")
                h.administrations[a.id] = a
                h.episodes[a.occurrence_id].source_administrations.append(a.id)
                h.pending = a.id
                h.decisions += 1
            elif kind == "response":
                r = _response(p)
                if r.id in h.responses or r.administration_id not in h.administrations:
                    raise ContractError("Duplicate response or unknown administration.")
                a = h.administrations[r.administration_id]
                ep = h.episodes[a.occurrence_id]
                is_root = a.item_id == ep.root_item_id and a.id == ep.source_administrations[0]
                raw_payload = {"selected": list(r.selected), "status": r.status, "mode": r.mode}
                if r.status == "answered" and is_root:
                    raw_payload["basis"] = r.basis
                parsed = self.source.validate_payload(a.item_id, a.variant, raw_payload, is_root)
                if parsed["status"] != r.status or tuple(parsed["selected"]) != r.selected:
                    raise ContractError("Noncanonical stored response.")
                if r.status != "answered" and r.basis != "missing":
                    raise ContractError("Missing answer has nonmissing basis.")
                old_id = h.current.get(a.id)
                if old_id != r.supersedes:
                    raise ContractError("Supersession must name the current response to this administration.")
                if a.id in h.invalidated:
                    raise ContractError("Cannot answer an invalidated presentation; reissue it with a live binding.")
                if old_id is None and h.pending != a.id:
                    raise ContractError("Only the pending presentation can receive a new answer.")
                if old_id:
                    h.controls_count += 1  # Edits are recorded burden, never blocked by the substantive cap.
                    h.superseded.add(old_id)
                    old = h.responses[old_id]
                    h.corrections.append({"old_response_id": old_id, "new_response_id": r.id, "administration_id": a.id})
                    if old.fingerprint != r.fingerprint:
                        self._invalidate_descendants(h, a.id, r)
                else:
                    h.decisions += self.source.decision_cost(a.item_id, r.selected, r.mode) - 1
                h.responses[r.id] = r
                h.current[a.id] = r.id
                if h.pending == a.id:
                    h.pending = None
                if is_root:
                    ep.basis = r.basis
                    ep.status = "actual" if r.status == "answered" and r.basis == Basis.ACTUAL.value else ("typical" if r.status == "answered" else r.status)
                # A semantic correction never leaves the edit lock on indefinitely.
                if h.control == "edit":
                    h.control = None
            elif kind == "control":
                self._control(h, p, index)
            else:
                raise ContractError("Unknown journal event kind.")
            h.revision = index
        return h

    @staticmethod
    def _invalidate_descendants(h: History, changed: str, new_response: Response | None) -> None:
        invalid_sources = {changed}
        progress = True
        while progress:
            progress = False
            for aid, a in h.administrations.items():
                if aid == changed or aid in h.invalidated:
                    continue
                for dep in a.dependencies:
                    if dep.administration_id not in invalid_sources:
                        continue
                    if dep.administration_id == changed and new_response is not None and dep.response_fingerprint == dependency_fingerprint(new_response, dep.aspect):
                        continue
                    h.invalidated[aid] = "dependency_superseded:" + changed
                    invalid_sources.add(aid)
                    if h.pending == aid:
                        h.pending = None
                    progress = True
                    break

    def _control(self, h: History, p: dict[str, Any], seq: int) -> None:
        cmd = p.get("command")
        h.controls_count += 1
        if cmd == "continue_deepening":
            h.phase, h.control = "deepening", None
        elif cmd == "mapping_ready":
            h.phase = "mapping_ready"
        elif cmd in {"end", "finish"}:
            h.phase = "finished"
            h.completion_reason = "user_end" if cmd == "end" else p["reason"]
            h.control = None
            h.pending = None
        elif cmd in {"pause", "edit"}:
            h.control = cmd
        elif cmd == "resume":
            h.control = None
        elif cmd == "shorten":
            h.shortened = True
        elif cmd == "topic":
            topic = p["topic"]
            if p["enabled"]:
                h.config.topics = sorted(set(h.config.topics) | {topic})
            else:
                h.config.topics = sorted(set(h.config.topics) - {topic})
                if h.pending:
                    a = h.administrations[h.pending]
                    if self.source.items[a.item_id]["eligibility"].get("topic_opt_in") == topic or h.episodes[a.occurrence_id].topic == topic:
                        h.pending = None
        elif cmd == "focus_topic":
            h.config.focus_topics = sorted(set(h.config.focus_topics) | {p["topic"]})
        elif cmd == "focus_occurrence":
            h.config.focus_occurrences = sorted(set(h.config.focus_occurrences) | {p["occurrence_id"]})
        elif cmd == "detail":
            h.config.details = sorted(set(h.config.details) | {p["detail"]})
        elif cmd == "request_target":
            h.requested_targets.add(p["target_instance"])
        elif cmd == "request_detail":
            h.requested_details.append({k: p[k] for k in ("item_id", "occurrence_id", "step_id")})
        elif cmd == "reject_target":
            h.rejected_targets.add(p["target_instance"])
            h.corrections.append({"aspect": "interpretation", "target_id": p["target_instance"], "control_id": f"C{seq:06d}", "reason": "respondent_rejected_interpretation"})
        elif cmd == "bind":
            if p.get("outcome") in {"skip", "no_event", "same", "unknown"}:
                h.closed_bindings[p["key"]] = p["outcome"]
            else:
                h.bindings[p["key"]] = {k: v for k, v in p.items() if k not in {"command", "key"}}
                if p.get("new_person"):
                    person = p["new_person"]
                    h.config.people[person["id"]] = person["role"]
        elif cmd == "context_fact":
            if p["fact"] not in CONTEXT_FACTS or (p["value"] is not None and type(p["value"]) is not bool):
                raise ContractError("Unsupported context fact.")
            if p["occurrence_id"] not in h.episodes:
                raise ContractError("Context fact has no episode.")
            previous = [f for f in h.context_facts if f["occurrence_id"] == p["occurrence_id"] and f["fact"] == p["fact"]]
            if previous and previous[-1]["value"] is not p["value"]:
                h.corrections.append({"aspect": "context", "control_id": f"C{seq:06d}", "occurrence_id": p["occurrence_id"], "reason": "context_fact_revised"})
                for aid, a in list(h.administrations.items()):
                    if aid not in h.invalidated and any(d.occurrence_id == p["occurrence_id"] and d.fact == p["fact"] and d.expected_value is not p["value"] for d in a.context_dependencies):
                        h.invalidated[aid] = "context_fact_superseded:" + p["fact"]
                        if h.pending == aid:
                            h.pending = None
                        self._invalidate_descendants(h, aid, None)
            h.context_facts = [f for f in h.context_facts if not (f["occurrence_id"] == p["occurrence_id"] and f["fact"] == p["fact"])]
            h.context_facts.append({**p, "id": f"C{seq:06d}"})
        elif cmd == "rebind":
            aid = p["administration_id"]
            if aid not in h.administrations or p["occurrence_id"] not in h.episodes:
                raise ContractError("Unknown rebinding endpoint.")
            self._invalidate_descendants(h, aid, None)
            h.rebindings[aid] = p["occurrence_id"]
            h.corrections.append({"aspect": "occurrence", "administration_id": aid, "destination_occurrence_id": p["occurrence_id"], "control_id": f"C{seq:06d}"})
        elif cmd == "close_target":
            h.target_closures[p["target_instance"]] = p["state"]
        elif cmd == "language":
            h.config.report_language = p["value"]
        else:
            raise ContractError("Unknown control.")

    def project(self, h: History) -> EvidenceState:
        s = EvidenceState(episodes=deepcopy(h.episodes), superseded_response_ids=set(h.superseded))
        live = h.live_responses()
        by_item_ep: dict[tuple[str, str], list[Response]] = {}
        for r in live:
            a = h.administrations[r.administration_id]
            ep_id = h.rebindings.get(a.id, a.occurrence_id)
            by_item_ep.setdefault((a.item_id, ep_id), []).append(r)
        separate = {ep for (item, ep), rs in by_item_ep.items() if item == "D08" and any("D08.different" in r.selected for r in rs)}
        for aid, why in h.invalidated.items():
            rid = h.current.get(aid)
            if rid:
                s.invalidated_response_ids.add(rid)
            s.missingness.append({"administration_id": aid, "status": "invalidated_dependency", "reason": why})
        for r in live:
            a = h.administrations[r.administration_id]
            ep_id = h.rebindings.get(a.id, a.occurrence_id)
            ep = s.episodes[ep_id]
            if r.status != "answered":
                s.missingness.append({"administration_id": a.id, "response_id": r.id, "item_id": a.item_id, "occurrence_id": ep_id, "status": r.status})
                s.active_response_ids.add(r.id)
                continue
            # The selected action is retained in the private journal, but not supplied
            # as a bound step in a report until the respondent repairs the event link.
            if ep_id in separate and a.item_id in {"D07", "D09", "D10", "D11"}:
                s.unresolved_bindings.append({"administration_id": a.id, "response_id": r.id, "reason": "different_occurrences_require_rebinding"})
                continue
            q = self.source.question(a.item_id, a.variant)
            opts = {o["id"]: o for o in q["options"]}
            basis = r.basis
            if a.item_id in EXPECTATION_ITEMS and ep.basis == Basis.ACTUAL.value:
                basis = Basis.EXPECTATION.value
            if a.item_id in TENDENCY_ITEMS:
                basis = Basis.TYPICAL.value
            step = a.step_id if ep_id == a.occurrence_id else "first"
            s.active_response_ids.add(r.id)
            for selected in r.selected:
                opt = opts[selected]
                oid = stable_id("O", r.id, selected)
                s.observations[oid] = Observation(
                    oid, r.id, a.id, a.item_id, selected, a.variant, opt["text"],
                    opt["reported_value"], q["captures"], ep_id, step, ep.person_id,
                    basis, r.mode, ep_id, a.selection_reason, q["version"],
                    tuple(opt.get("candidate_signals", [])),
                    self.source.rendered_options(a.item_id, a.variant, a.slots)[selected],
                )
            if ep.status == "proposed":
                ep.status = "actual" if r.basis == Basis.ACTUAL.value else "typical"
        for aid, a in h.administrations.items():
            if aid not in h.current and aid not in h.invalidated:
                s.missingness.append({"administration_id": aid, "item_id": a.item_id, "occurrence_id": a.occurrence_id,
                                      "status": "pending" if h.pending == aid else "offered_without_answer"})
        self._edges(s, h)
        idx = EvidenceIndex(s, h, self.source)
        for ep in s.episodes.values():
            for step in idx.step_ids(ep.id) | {"first"}:
                s.flags[f"{ep.id}/{step}"] = idx.derive_flags(ep.id, step)
        s.readiness = mapping_readiness(s, h, self.source)
        return s

    def reduce(self, config: Config, events: list[dict[str, Any]]) -> tuple[History, EvidenceState]:
        h = self.history(config, events)
        return h, self.project(h)

    def _edges(self, s: EvidenceState, h: History) -> None:
        relations = {"D08.after_failed": "before", "D08.after": "before", "D08.overlap": "simultaneous", "D08.alternate": "alternating", "D08.uncertain": "order_unknown"}
        for o in s.observations.values():
            if o.item_id == "D08" and o.option_id in relations:
                a = h.administrations[o.administration_id]
                s.edges.append(SequenceEdge(stable_id("G", o.id), o.occurrence_id,
                                            a.source_step_id, "next", relations[o.option_id], (o.id,),
                                            o.option_id == "D08.after_failed"))
        grouped: dict[str, list[Observation]] = {}
        for o in s.observations.values():
            grouped.setdefault(o.response_id, []).append(o)
        for group in grouped.values():
            first = group[0]
            if len(group) < 2:
                continue
            response = h.responses[first.response_id]
            obs_by_option = {o.option_id: o for o in group}
            ordered = [obs_by_option[x] for x in response.selected]
            rel = "before" if response.mode == "ordered" else response.mode
            if rel not in {"before", "simultaneous", "order_unknown"}:
                continue
            if first.item_id != "D36" and rel == "before":
                raise ContractError("Only explicitly ordered recovery changes produce ordered option edges.")
            for a, b in zip(ordered, ordered[1:]):
                s.edges.append(SequenceEdge(stable_id("G", a.id, b.id, rel), a.occurrence_id,
                                            f"{a.step_id}/{a.option_id}", f"{b.step_id}/{b.option_id}", rel, (a.id, b.id),
                                            meaning="reported_recovery_order" if first.item_id == "D36" else "reported_response_cooccurrence"))
        from .coverage import append_return_edges
        append_return_edges(s)
        validate_graph(s.edges, s.observations, s.episodes)


class EvidenceIndex:
    def __init__(self, s: EvidenceState, h: History, source: Source):
        self.state, self.history, self.source = s, h, source
        self.by_ep: dict[str, list[Observation]] = {}
        for o in s.observations.values():
            self.by_ep.setdefault(o.occurrence_id, []).append(o)

    def observations(self, ep: str, items: Iterable[str] | None = None, step: str | None = None) -> list[Observation]:
        allowed = set(items) if items is not None else None
        return [o for o in self.by_ep.get(ep, []) if (allowed is None or o.item_id in allowed) and (step is None or o.step_id == step)]

    def options(self, ep: str, items: Iterable[str] | None = None, step: str | None = None) -> set[str]:
        return {o.option_id for o in self.observations(ep, items, step)}

    def signals(self, ep: str, step: str | None = None) -> set[str]:
        return {x for o in self.observations(ep, step=step) for x in o.signals}

    def step_ids(self, ep: str) -> set[str]:
        return {o.step_id for o in self.by_ep.get(ep, [])}

    def action(self, ep: str, step: str = "first") -> list[Observation]:
        return [o for o in self.observations(ep, step=step) if o.capture in ACTION_CAPTURES and o.option_id not in NO_ACTION_OPTIONS]

    def actual(self, ep: str) -> bool:
        return ep in self.state.episodes and self.state.episodes[ep].status == "actual" and self.state.episodes[ep].basis == Basis.ACTUAL.value

    def has(self, ep: str, *options: str) -> bool:
        return bool(self.options(ep) & set(options))

    def current_response(self, ep: str, item: str, step: str | None = None) -> Response | None:
        found = []
        for r in self.history.live_responses():
            a = self.history.administrations[r.administration_id]
            if self.history.rebindings.get(a.id, a.occurrence_id) == ep and a.item_id == item and (step is None or a.step_id == step):
                found.append(r)
        return found[-1] if found else None

    def flags_for(self, ep: str, step: str = "first") -> set[str]:
        return self.state.flags.get(f"{ep}/{step}", self.derive_flags(ep, step))

    def derive_flags(self, ep: str, step: str) -> set[str]:
        if not self.actual(ep):
            return set()
        opts = self.options(ep)
        step_opts = self.options(ep, step=step)
        sig = self.signals(ep, step)
        flags: set[str] = set()
        if self.action(ep, "first"):
            flags.add("actual_first_move")
        if self.action(ep, step):
            flags.add("actual_selected_step")
        if self.has(ep, "D07.more", "D07.leave", "D07.absorb", "D07.help", "D07.quiet") and "D08.different" not in opts:
            flags.add("actual_next_move")
        if self.has(ep, "M26.finish", "M26.contact", "M26.speak", "M26.help", "M26.rest") and "M26.sequential" not in opts:
            flags.add("actual_simultaneous_wants")
        if self.has(ep, "D18.hurt", "D18.need", "D18.anger", "D18.uncertain", "D18.want", "D21.visible") and not self.has(ep, "D18.none", "D21.none"):
            flags.add("reported_exposure_concern")
        if self.has(ep, "D24.stay", "D25.remember", "D65.patient", "D66.choice") or any(f["occurrence_id"] == ep and f["fact"] == "noticed_feeling_without_acting" and f["value"] is True for f in self.history.context_facts):
            flags.add("actual_feeling_episode")
        if self.has(ep, "M20.ask", "M20.small", "M20.justify") or any(f["occurrence_id"] == ep and f["fact"] == "need_became_known" and f["value"] is True for f in self.history.context_facts):
            flags.add("actual_need_disclosure")
        if sig & {"low_response", "low_activity", "words_blocked", "speech_access", "chosen_silence", "chosen_quiet", "speech_effort", "low_access", "felt_distance"}:
            flags.add("actual_low_response")
        if self.has(ep, "M12.relief", "M12.clear", "M14.choice", "M14.energy", "M14.settled", "M14.brief", "D35.clear", "D35.words", "D35.choice", "D35.contact", "D35.energy"):
            flags.update({"actual_recovery_episode", "actual_easing"})
        if self.has(ep, "M22.ease") or ("M13.company" in opts and bool(opts & {"M14.choice", "M14.energy", "M14.settled", "M14.brief"})):
            flags.add("actual_helpful_social_effect")
        if "body_detail" in self.history.config.topics:
            flags.add("body_detail_allowed")
        if self.has(ep, "M17.check", "M17.send", "M17.reread"):
            flags.add("actual_wait_response")
        if self.state.episodes[ep].family == "autonomy" or step_opts & {"D07.leave", "D61.leave", "D61.break", "M11.quiet", "M17.stop", "M24.space"}:
            flags.add("actual_space_or_distance_episode")
        if self.observations(ep, ["M24"]):
            flags.add("actual_received_repair")
        if self.observations(ep, ["D04"]) and "D04.continued" not in opts:
            flags.add("actual_response_stop")
        if any(f["occurrence_id"] == ep and f["fact"] == "bothersome_comment" and f["value"] is True for f in self.history.context_facts):
            flags.add("actual_bothersome_comment")
        return flags


def validate_graph(edges: list[SequenceEdge], observations: dict[str, Observation], episodes: dict[str, Episode]) -> None:
    adjacency: dict[tuple[str, str], set[tuple[str, str]]] = {}
    pair_relations: dict[tuple[str, frozenset[str]], set[str]] = {}
    nodes = {(o.occurrence_id, o.step_id) for o in observations.values()}
    nodes |= {(o.occurrence_id, f"{o.step_id}/{o.option_id}") for o in observations.values()}
    for e in edges:
        if (e.occurrence_id, e.from_step) not in nodes or (e.occurrence_id, e.to_step) not in nodes:
            raise ContractError("Sequence endpoint has no live observation.")
        if e.occurrence_id not in episodes or e.from_step == e.to_step:
            raise ContractError("Invalid sequence endpoint.")
        if not e.evidence_ids or not set(e.evidence_ids) <= set(observations):
            raise ContractError("Sequence has missing or stale evidence.")
        if any(observations[oid].occurrence_id != e.occurrence_id for oid in e.evidence_ids):
            raise ContractError("An occurrence sequence cannot cross episodes.")
        if e.relation not in {"before", "simultaneous", "alternating", "order_unknown", "same_step"}:
            raise ContractError("Invalid within-occurrence relation.")
        key = (e.occurrence_id, frozenset({e.from_step, e.to_step}))
        pair_relations.setdefault(key, set()).add(e.relation)
        if len(pair_relations[key]) > 1:
            raise ContractError("Contradictory sequence relationships require correction, not silent repair.")
        if e.relation == "before":
            adjacency.setdefault((e.occurrence_id, e.from_step), set()).add((e.occurrence_id, e.to_step))
    visiting: set[tuple[str, str]] = set()
    visited: set[tuple[str, str]] = set()

    def visit(node: tuple[str, str]) -> None:
        if node in visiting:
            raise ContractError("Cyclic before/after sequence.")
        if node in visited:
            return
        visiting.add(node)
        for other in adjacency.get(node, set()):
            visit(other)
        visiting.remove(node)
        visited.add(node)
    for node in adjacency:
        visit(node)


def mapping_readiness(s: EvidenceState, h: History, source: Source) -> dict[str, Any]:
    offered = {a.item_id for a in h.administrations.values() if a.phase == "mapping" and a.id not in h.invalidated}
    closed: dict[str, str] = {}
    actual = {o.occurrence_id for o in s.observations.values() if o.basis in {Basis.ACTUAL.value, Basis.EXPECTATION.value} and s.episodes[o.occurrence_id].status == "actual"}
    idx = EvidenceIndex(s, h, source)
    for q in source.items.values():
        if q["stage"] != "mapping" or q["id"] in offered:
            continue
        if q["context"] in h.config.unavailable_contexts:
            closed[q["id"]] = "context_unavailable"
            continue
        parents = q["eligibility"]["requires_answered"]
        if parents:
            parent_admins = [a for a in h.administrations.values() if a.item_id == parents[0] and not a.replay_of]
            if parent_admins:
                a = parent_admins[-1]
                r = h.responses.get(h.current.get(a.id, ""))
                if r and (r.status != "answered" or not idx.actual(a.occurrence_id)):
                    closed[q["id"]] = "parent_unavailable"
                elif r and set(q["eligibility"].get("specific", {}).get("exclude_parent_options", [])) & idx.options(a.occurrence_id):
                    closed[q["id"]] = "parent_substantive_answer_excludes_followup"
            elif parents[0] in closed:
                closed[q["id"]] = "parent_context_unavailable"
        if q["id"] == "M28":
            comparable = [e for e in s.episodes.values() if idx.actual(e.id) and idx.action(e.id) and e.family not in {"exception", "ordinary", "receiving_help"}]
            others = {z["id"] for z in source.items.values() if z["stage"] == "mapping"} - {"M28", "M29", "M30"}
            if not comparable and others <= (offered | set(closed)):
                closed[q["id"]] = "no_comparable_actual_occurrence"
        if f"coverage:{q['id']}" in h.closed_bindings:
            closed[q["id"]] = "binding_" + h.closed_bindings[f"coverage:{q['id']}"]
    applicable_pending = [q["id"] for q in source.items.values() if q["stage"] == "mapping" and q["id"] not in offered and q["id"] not in closed]
    contexts = sorted({s.episodes[ep].context for ep in actual})
    return {
        "mapping_coverage_complete": not applicable_pending,
        "applicable_pending_items": applicable_pending,
        "closed_coverage": closed,
        "offered_mapping_items": sorted(offered),
        "actual_occurrence_ids": sorted(actual),
        "sampled_contexts": contexts,
        "usable_actual_occurrences": len(actual),
        "report_readiness": "scoped_evidence_available" if actual else "insufficient_answered_evidence",
        "unresolved_bindings": len(s.unresolved_bindings),
        "normal_mapping_ready": not applicable_pending and bool(actual) and h.pending is None,
        "administrations": len(h.administrations),
        "mapping_administrations": sum(a.phase == "mapping" for a in h.administrations.values()),
        "decisions": h.decisions,
        "controls": h.controls_count,
        "interpretive_quota": None,
    }
