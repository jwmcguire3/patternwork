"""Server-owned session interface: canonical responses -> next authored question."""
from __future__ import annotations

from copy import deepcopy
from dataclasses import asdict
import hashlib
import hmac
import json
from typing import Any

from .candidates import CompiledCandidate, TargetCandidateCompiler, PAIRS
from .evidence import CONTEXT_FACTS, EvidenceIndex, EvidenceStateReducer
from .findings import build_findings
from .model import (Administration, Config, ConflictError, ContractError, Response,
                    SourceMismatch, TOPICS, DETAILS, ROLES, canonical, digest)
from .source import Source
from .targets import TargetLifecycleEngine, lifecycle_delta, target_key


class AssessmentEngine:
    """A standalone deterministic core, not an authentication or delivery server.

    No public answer API accepts candidates, flags, provenance, arbitrary text,
    or an episode graph. Production adapters authenticate the actor and use the
    repository CAS boundary before committing mutations.
    """
    def __init__(self, config: Config | None = None, source: Source | None = None):
        self.source = source or Source()
        self.config = deepcopy(config or Config())
        self.source.validate_config(self.config)
        self.events: list[dict[str, Any]] = []
        self.requests: dict[str, dict[str, Any]] = {}
        self.reducer = EvidenceStateReducer(self.source)
        self.lifecycle = TargetLifecycleEngine(self.source)
        self.compiler = TargetCandidateCompiler(self.source)
        self.last_delta: dict[str, Any] = {}
        self._refresh()

    @property
    def revision(self) -> int:
        return len(self.events)

    def _refresh(self) -> None:
        self.history, self.state = self.reducer.reduce(self.config, self.events)
        self.lifecycle.build(self.state, self.history)
        build_findings(self.state, self.history, self.source)

    def _commit(self, kind: str, payload: dict[str, Any]) -> None:
        before = self.state.targets
        trial = self.events + [{"seq": self.revision + 1, "kind": kind, "payload": deepcopy(payload)}]
        # Validate on a fresh projection. A rejected mutation cannot partly update
        # the authoritative journal, budgets, active evidence or pending screen.
        h, s = self.reducer.reduce(self.config, trial)
        self.lifecycle.build(s, h)
        build_findings(s, h, self.source)
        self.events, self.history, self.state = trial, h, s
        self.last_delta = lifecycle_delta(before, s.targets)

    def _check_revision(self, expected_revision: int) -> None:
        if type(expected_revision) is not int or expected_revision != self.revision:
            raise ConflictError("Stale or missing expected_revision.")

    def _idempotent(self, request_id: str, command: Any) -> dict[str, Any] | None:
        if not isinstance(request_id, str) or not 1 <= len(request_id) <= 120:
            raise ContractError("A bounded idempotency key is required.")
        if request_id in self.requests:
            prior = self.requests[request_id]
            if prior["fingerprint"] != digest(command):
                raise ConflictError("Idempotency key reused with different content.")
            return deepcopy(prior["receipt"])
        return None

    def _receipt(self, request_id: str, command: Any, **extra: Any) -> dict[str, Any]:
        receipt = {"revision": self.revision, **extra, "target_changes": deepcopy(self.last_delta)}
        self.requests[request_id] = {"fingerprint": digest(command), "receipt": deepcopy(receipt)}
        return receipt

    def trace(self) -> dict[str, Any]:
        comp = self.compiler.compile(self.state, self.history)
        return deepcopy(comp.decision)

    def next(self) -> dict[str, Any]:
        """Return/issue one pending question; repeat calls never double-charge it."""
        h = self.history
        if h.control in {"pause", "edit"}:
            return {"action": h.control, "revision": self.revision}
        if h.phase == "finished":
            return {"action": "finished", "reason": h.completion_reason, "readiness": deepcopy(self.state.readiness), "revision": self.revision}
        if h.pending:
            return self._form(h.administrations[h.pending])
        if h.phase == "mapping_ready":
            return {"action": "mapping_ready", "readiness": deepcopy(self.state.readiness), "choices": ["continue_deepening", "end"], "revision": self.revision}
        context_request = self._context_request()
        if context_request:
            return context_request
        comp = self.compiler.compile(self.state, h)
        c = comp.selected
        if c and h.phase == "deepening" and c.candidate.tier >= 5:
            # Scope expansion/texture has a separate finite allowance unless the
            # respondent requested it. No missing theoretical category holds the
            # session open. This is a pilot policy, not a measurement threshold.
            extra = sum(a.phase == "deepening" and a.selection_reason == "scope_or_texture" for a in h.administrations.values())
            if extra >= 3 and not c.candidate.focus and not h.config.details:
                c = None
                comp.decision["reason"] = "remaining_targets_only_low_incremental_value"
        if c is None:
            if comp.decision.get("reason") == "burden_ceiling" or len(h.administrations) >= h.config.total_limit or h.decisions >= h.config.decision_limit:
                self._commit("control", {"command": "finish", "reason": "burden_ceiling"})
                return self.next()
            if h.phase == "mapping":
                self._commit("control", {"command": "mapping_ready"})
                return self.next()
            self._commit("control", {"command": "finish", "reason": comp.decision.get("reason", "no_eligible_material_target")})
            return self.next()
        if c.binding_request:
            return {"action": "bind", **deepcopy(c.binding_request), "revision": self.revision}
        return self._present(c)

    def _context_request(self) -> dict[str, Any] | None:
        if self.history.phase != "deepening":
            return None
        prompts = {
            "actual_bothersome_comment": ("bothersome_comment", "During that family contact, was there a comment that bothered you?"),
            "actual_need_disclosure": ("need_became_known", "In that same situation, did the other person learn that you needed help?"),
            "actual_feeling_episode": ("noticed_feeling_without_acting", "In that same situation, was there a moment when you noticed a feeling without immediately doing something about it?"),
        }
        idx = EvidenceIndex(self.state, self.history, self.source)
        for t in sorted(self.state.targets.values(), key=lambda t: t.id):
            if not t.explicit_request or t.state != "open" or not idx.actual(t.occurrence_id):
                continue
            for item in t.candidate_items:
                if item not in self.source.items:
                    continue
                q = self.source.items[item]
                topic = q["eligibility"].get("topic_opt_in") or self.state.episodes[t.occurrence_id].topic
                if topic and topic not in self.history.config.topics:
                    continue
                if any(not idx.current_response(t.occurrence_id, parent) or idx.current_response(t.occurrence_id, parent).status != "answered" for parent in q["eligibility"]["requires_answered"]):
                    continue
                for flag in q["eligibility"].get("specific", {}).get("required_flags", []):
                    if flag in prompts and flag not in idx.flags_for(t.occurrence_id, t.step_id):
                        fact, prompt = prompts[flag]
                        if not any(f["occurrence_id"] == t.occurrence_id and f["fact"] == fact for f in self.history.context_facts):
                            return {"action": "confirm_context", "occurrence_id": t.occurrence_id, "fact": fact,
                                    "prompt": prompt, "options": [{"text": "Yes", "value": True}, {"text": "No", "value": False}, {"text": "I am not sure", "value": None}], "revision": self.revision}
        return None

    def _present(self, c: CompiledCandidate) -> dict[str, Any]:
        base = c.candidate
        aid = f"A{len(self.history.administrations)+1:04d}"
        generation = sum(a.item_id == base.item_id and a.occurrence_id == base.occurrence_id and a.step_id == base.step_id for a in self.history.administrations.values())
        a = Administration(aid, base.item_id, base.occurrence_id, base.step_id,
                           self.history.phase, c.target_ids, base.variant, c.source_step_id,
                           c.dependencies, c.comparison_ids, c.replay_of,
                           self.source.permutation(base.item_id, base.variant, self.history.config.option_seed),
                           c.slots, "common_coverage" if self.history.phase == "mapping" else
                           ("scope_or_texture" if base.tier >= 5 else "response_discriminator"), generation, c.context_dependencies)
        self._commit("present", {"administration": asdict(a), "episode": asdict(c.new_episode) if c.new_episode else None})
        return self._form(a)

    def _form(self, a: Administration) -> dict[str, Any]:
        q = self.source.question(a.item_id, a.variant)
        slots = a.slots.copy()
        chips = []
        # Exact selected wording remains visible in neutral chips, rather than
        # turning a long quoted first-person sentence into awkward prompt grammar.
        for name, value in sorted(slots.items()):
            if "[" in value and name in {"response_label", "first_response_label", "next_response_label", "contact_response_label", "exposed_experience", "comparison_response_label", "candidate_trigger_label"}:
                label, text = value.split("[", 1)
                chips.append({"label": name, "selected_text": text.rstrip("]")})
                slots[name] = label.strip()
        if self.source.slots(q["prompt"]) - set(slots):
            raise ContractError("Unbound wording must never reach the respondent.")
        # Episode IDs are provenance, not client copy.
        import re
        slots = {k: re.sub(r" \(EP[0-9]+\)$", "", v) for k, v in slots.items()}
        prompt = q["prompt"].format(**slots)
        options = self.source.rendered_options(a.item_id, a.variant, a.slots)
        return {"action": "ask", "administration_id": a.id, "item_id": a.item_id,
                "variant": a.variant, "prompt": prompt, "context_chips": chips,
                "options": [{"id": oid, "text": options[oid]} for oid in a.option_order],
                "response_controls": deepcopy(self.source.bank["common_response_controls"]),
                "selection": q["selection"], "remaining_extra_decisions": max(0, self.history.config.decision_limit - self.history.decisions),
                "occurrence_id": a.occurrence_id, "step_id": a.step_id,
                "recall_basis_control": a.id == self.history.episodes[a.occurrence_id].source_administrations[0],
                "revision": self.revision}

    def answer(self, administration_id: str, payload: dict[str, Any], *, expected_revision: int, request_id: str) -> dict[str, Any]:
        command = {"kind": "answer", "administration_id": administration_id, "payload": payload}
        prior = self._idempotent(request_id, command)
        if prior:
            return prior
        self._check_revision(expected_revision)
        if self.history.control or self.history.phase == "finished":
            raise ConflictError("Resume the session before answering.")
        if self.history.pending != administration_id:
            raise ConflictError("Only the pending server-issued presentation can be answered.")
        return self._write_answer(administration_id, payload, request_id, command)

    def correct(self, administration_id: str, payload: dict[str, Any], *, expected_revision: int, request_id: str) -> dict[str, Any]:
        command = {"kind": "correct", "administration_id": administration_id, "payload": payload}
        prior = self._idempotent(request_id, command)
        if prior:
            return prior
        self._check_revision(expected_revision)
        if administration_id not in self.history.current:
            raise ContractError("A correction must address an answered presentation.")
        if administration_id in self.history.invalidated:
            raise ContractError("This answer lost its binding; answer a freshly issued replacement.")
        # Corrections remain possible after a ceiling/stop. They create a new state
        # revision; an old frozen packet is not mutated or automatically reissued.
        return self._write_answer(administration_id, payload, request_id, command)

    def _write_answer(self, aid: str, payload: dict[str, Any], request_id: str, command: Any) -> dict[str, Any]:
        a = self.history.administrations[aid]
        ep = self.history.episodes[a.occurrence_id]
        root = a.id == ep.source_administrations[0]
        p = self.source.validate_payload(a.item_id, a.variant, payload, root)
        if not root and p["status"] == "answered":
            p["basis"] = ep.basis
        old_id = self.history.current.get(aid)
        cost = self.source.decision_cost(a.item_id, p["selected"], p["mode"])
        # The already rendered screen reserved its base decision. Correction effort
        # is counted as a control, not blocked by a spent substantive budget.
        if old_id is None and self.history.decisions + cost - 1 > self.history.config.decision_limit:
            raise ContractError("The remaining decision budget does not allow that extra selection mode.")
        rid = f"R{len(self.history.responses)+1:05d}"
        r = Response(rid, aid, tuple(p["selected"]), p["status"], p["mode"], p["basis"], old_id)
        self._commit("response", asdict(r))
        return self._receipt(request_id, command, response_id=rid, administration_id=aid)

    def bind(self, payload: dict[str, Any], *, expected_revision: int, request_id: str) -> dict[str, Any]:
        command = {"kind": "binding", "payload": payload}
        prior = self._idempotent(request_id, command)
        if prior:
            return prior
        self._check_revision(expected_revision)
        if set(payload) - {"outcome", "relation", "person_id", "new_role", "source_occurrence_id"}:
            raise ContractError("Unknown binding fields; flags and evidence are never accepted.")
        comp = self.compiler.compile(self.state, self.history)
        if self.history.pending or not comp.selected or not comp.selected.binding_request:
            raise ConflictError("No current server-issued binding control.")
        request = comp.selected.binding_request
        outcome = payload.get("outcome", "confirm")
        if outcome not in request["outcomes"]:
            raise ContractError("Invalid binding outcome.")
        data: dict[str, Any] = {"command": "bind", "key": request["key"], "outcome": outcome}
        if outcome == "confirm":
            person = payload.get("person_id")
            role = payload.get("new_role")
            if person and role:
                raise ContractError("Select one existing person or one new neutral role.")
            if role:
                if role not in ROLES:
                    raise ContractError("Choose an authored neutral role, not a name.")
                number = max([int(p[1:]) for p in self.history.config.people] or [0]) + 1
                person = f"P{number}"
                data["new_person"] = {"id": person, "role": role}
            if person and person not in self.history.config.people and not role:
                raise ContractError("Unknown person ID.")
            if request["needs_person"] and not person:
                raise ContractError("An actual referent or unavailable control is required.")
            if person:
                data["person_id"] = person
            if request["needs_distinctness"]:
                if payload.get("relation") != "different":
                    raise ContractError("Explicit distinct-occurrence confirmation is required for this replay/comparison.")
                data["relation"] = "different"
            chosen = payload.get("source_occurrence_id", request.get("source_occurrence_id"))
            if request["source_occurrence_choices"] and chosen not in request["source_occurrence_choices"]:
                raise ContractError("Comparison source must be an actual available occurrence.")
            if chosen:
                data["source_occurrence_id"] = chosen
        self._commit("control", data)
        return self._receipt(request_id, command, binding_key=request["key"], outcome=outcome)

    def control(self, command: str, *, expected_revision: int, request_id: str, **kwargs: Any) -> dict[str, Any]:
        request = {"kind": "control", "command": command, **kwargs}
        prior = self._idempotent(request_id, request)
        if prior:
            return prior
        self._check_revision(expected_revision)
        allowed = {
            "continue_deepening": set(), "pause": set(), "resume": set(), "end": set(), "shorten": set(), "edit": set(),
            "topic": {"topic", "enabled"}, "focus_topic": {"topic"}, "focus_occurrence": {"occurrence_id"},
            "detail": {"detail"}, "request_detail": {"item_id", "occurrence_id", "step_id"}, "request_target": {"target_id", "occurrence_id", "step_id"},
            "reject_target": {"target_instance"}, "context_fact": {"occurrence_id", "fact", "value"},
            "rebind": {"administration_id", "occurrence_id"}, "language": {"value"},
        }
        if command not in allowed or set(kwargs) - allowed[command] or (allowed[command] - ({"step_id"} if command in {"request_target", "request_detail"} else set())) - set(kwargs):
            raise ContractError("Unknown control or fields.")
        if command == "continue_deepening" and self.history.phase != "mapping_ready":
            raise ContractError("Deepening follows the Mapping completion choice.")
        if command == "topic" and (kwargs.get("topic") not in TOPICS or type(kwargs.get("enabled")) is not bool):
            raise ContractError("Invalid topic setting.")
        if command == "focus_topic" and kwargs.get("topic") not in self.source.entries:
            raise ContractError("Unknown authored topic entry.")
        if command == "detail" and kwargs.get("detail") not in DETAILS:
            raise ContractError("Unknown detail.")
        if command in {"focus_occurrence", "request_target", "request_detail", "context_fact", "rebind"}:
            ep = kwargs.get("occurrence_id")
            if ep not in self.state.episodes or self.state.episodes[ep].status != "actual":
                raise ContractError("Control must name an actual known occurrence.")
        if command == "request_target":
            if kwargs.get("target_id") not in self.source.targets:
                raise ContractError("Unknown authored evidence target.")
            step = kwargs.get("step_id", "first")
            idx = EvidenceIndex(self.state, self.history, self.source)
            if step not in idx.step_ids(kwargs["occurrence_id"]) | {"first", "recovery", "next"}:
                raise ContractError("Unknown step.")
            kwargs = {"target_instance": target_key(kwargs["target_id"], kwargs["occurrence_id"], step)}
        if command == "request_detail":
            item = kwargs.get("item_id")
            if item not in self.source.items or self.source.items[item]["stage"] != "deepening":
                raise ContractError("Select an existing authored optional detail.")
            step = kwargs.get("step_id", "first")
            idx = EvidenceIndex(self.state, self.history, self.source)
            if step not in idx.step_ids(kwargs["occurrence_id"]) | {"first", "next", "recovery"}:
                raise ContractError("Unknown detail step.")
            kwargs["step_id"] = step
        if command == "reject_target" and kwargs.get("target_instance") not in self.state.targets:
            raise ContractError("Unknown target to correct.")
        if command == "context_fact" and (kwargs.get("fact") not in CONTEXT_FACTS or (kwargs.get("value") is not None and type(kwargs.get("value")) is not bool)):
            raise ContractError("Unknown factual control; derived flags cannot be supplied.")
        if command == "rebind":
            aid = kwargs.get("administration_id")
            if aid not in self.history.current:
                raise ContractError("Unknown answer to rebind.")
            # Rebinding is an explicit respondent correction, never a normalization
            # that silently merges unrelated events. It invalidates dependent fields.
        if command == "language" and kwargs.get("value") not in {"parts", "plain", "no_preference"}:
            raise ContractError("Invalid report language.")
        self._commit("control", {"command": command, **kwargs})
        return self._receipt(request_id, request, control=command)

    def packet(self) -> dict[str, Any]:
        from .packet import compile_packet
        return compile_packet(self.state, self.history, self.source, self.events)

    def dumps(self, signing_key: bytes | None = None) -> str:
        if signing_key is not None and (not isinstance(signing_key, bytes) or len(signing_key) < 32):
            raise ContractError("Signing keys must contain at least 32 bytes.")
        body = {"format": "patternwork-router-state-v1", "source_binding": self.source.binding,
                "config": asdict(self.config), "events": self.events, "requests": self.requests}
        encoded = canonical(body)
        envelope = {"body": body, "sha256": hashlib.sha256(encoded.encode()).hexdigest(),
                    "hmac_sha256": hmac.new(signing_key, encoded.encode(), hashlib.sha256).hexdigest() if signing_key else None}
        return canonical(envelope)

    @classmethod
    def loads(cls, raw: str, source: Source | None = None, *, signing_key: bytes | None = None, allow_unsigned_local: bool = False) -> "AssessmentEngine":
        if signing_key is not None and (not isinstance(signing_key, bytes) or len(signing_key) < 32):
            raise ContractError("Signing keys must contain at least 32 bytes.")
        if not isinstance(raw, str) or len(raw.encode("utf-8")) > 20_000_000:
            raise ContractError("Invalid or oversized serialized state.")
        try:
            envelope = json.loads(raw)
            if set(envelope) != {"body", "sha256", "hmac_sha256"}:
                raise ContractError("Unknown state envelope fields.")
            body = envelope["body"]
            if set(body) != {"format", "source_binding", "config", "events", "requests"} or body["format"] != "patternwork-router-state-v1":
                raise ContractError("Unknown state format.")
            encoded = canonical(body).encode()
            if not hmac.compare_digest(hashlib.sha256(encoded).hexdigest(), envelope["sha256"]):
                raise ContractError("State checksum mismatch.")
            if signing_key:
                expected = hmac.new(signing_key, encoded, hashlib.sha256).hexdigest()
                if not isinstance(envelope["hmac_sha256"], str) or not hmac.compare_digest(expected, envelope["hmac_sha256"]):
                    raise ContractError("State authentication failed.")
            elif not allow_unsigned_local or envelope["hmac_sha256"] is not None:
                raise ContractError("Authenticated storage is required; explicit local-only opt-in permits unsigned fixtures.")
            source = source or Source()
            if body["source_binding"] != source.binding:
                raise SourceMismatch("State is pinned to a different question/runtime source; no silent migration.")
            engine = cls(Config(**body["config"]), source)
            engine.events = body["events"]
            engine.requests = body["requests"]
            engine._refresh()
            engine.packet()  # Full lineage/graph validation on restore.
            return engine
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise ContractError("Malformed serialized state.") from exc
