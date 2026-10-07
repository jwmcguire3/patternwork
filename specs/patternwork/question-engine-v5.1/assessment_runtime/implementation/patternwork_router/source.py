"""Canonical source loading, option validation and source/runtime pinning."""
from __future__ import annotations

from copy import deepcopy
from pathlib import Path
import hashlib
import json
import re
from typing import Any

from .model import Config, ContractError, MISSING_STATUSES, canonical, digest

RUNTIME_VERSION = "PW-ROUTER-1.1.0-candidate.1"


class Source:
    def __init__(self, root: str | Path | None = None):
        self.root = Path(root) if root else Path(__file__).resolve().parents[2]
        self.bank = self._load("assessment/question_bank.json")
        self.routing = self._load("architecture/routing_targets.json")
        self.gates = self._load("architecture/item_gates.json")
        self.items = {x["id"]: x for x in self.bank["items"]}
        self.coverage = self._load("architecture/coverage_rules.json") if (self.root / "architecture/coverage_rules.json").exists() else {"rules": []}
        self.coverage_rules = {r["id"]: r for r in self.coverage["rules"]}
        self.coverage_by_item = {r["item_id"]: r for r in self.coverage["rules"]}
        self.targets = {x["id"]: x for x in self.routing["targets"]}
        self.entries = {x["id"]: x for x in self.routing["entry_points"]}
        self.variants = {x["id"]: x for x in self.bank["variants"]}
        self.replays = set(self.routing["operators"]["REPLAY"]["allowed_roots"])
        self.contexts = {q["context"] for q in self.items.values()} | {"self_relationship", "state"}
        self.release = self.bank["release"]
        paths = [
            "assessment/question_bank.json", "architecture/routing_targets.json", "architecture/item_gates.json",
            "implementation/reference_router.py",
            "architecture/01_EVIDENCE_MODEL.md", "architecture/02_PATTERN_OBJECTS_AND_CLAIM_RULES.md",
            "architecture/03_ROUTING_AND_STOPPING.md", "assessment/CONTROLS_AND_RENDERING.md",
            "architecture/REPORT_INTERFACE.md",
        ]
        paths += [str(p.relative_to(self.root)) for p in sorted((self.root / "implementation/patternwork_router").glob("*.py"))]
        for optional in ("implementation/runtime_policy.json", "schemas/router_packet.schema.json", "architecture/coverage_rules.json"):
            if (self.root / optional).exists():
                paths.append(optional)
        self.hashes = {p: hashlib.sha256((self.root / p).read_bytes()).hexdigest() for p in sorted(paths)}
        self.binding = {"question_release": self.release, "runtime_version": RUNTIME_VERSION, "source_sha256": digest(self.hashes)}
        self.validate()

    def _load(self, rel: str) -> Any:
        return json.loads((self.root / rel).read_text(encoding="utf-8"))

    def validate(self) -> None:
        if len(self.items) != len(self.bank["items"]) or len(self.targets) != len(self.routing["targets"]):
            raise ContractError("Duplicate source identities.")
        all_ids: set[str] = set()
        for q in self.items.values():
            if not set(q["eligibility"]["requires_answered"]) <= set(self.items):
                raise ContractError("Unknown authored parent.")
            for o in q["options"]:
                if o["id"] in all_ids:
                    raise ContractError("Duplicate option identity.")
                all_ids.add(o["id"])
        for t in self.targets.values():
            for candidate in t["candidate_items"]:
                if candidate != "REPLAY" and candidate.removeprefix("REPLAY:") not in self.items:
                    raise ContractError("Unknown target candidate.")

        if self.coverage_rules:
            from .coverage import validate_coverage_source
            validate_coverage_source(self)

    def question(self, item_id: str, variant: str = "base") -> dict[str, Any]:
        if item_id not in self.items:
            raise ContractError("Unknown question.")
        q = deepcopy(self.items[item_id])
        if variant != "base":
            v = self.variants.get(variant)
            if not v or v["replaces"] != item_id:
                raise ContractError("Unknown question variant.")
            q.update({k: deepcopy(v[k]) for k in ("prompt", "options", "captures")})
        return q

    def validate_config(self, config: Config) -> None:
        config.validate(self.contexts, set(self.entries))

    def validate_payload(self, item_id: str, variant: str, payload: dict[str, Any], root: bool) -> dict[str, Any]:
        if not isinstance(payload, dict) or set(payload) - {"selected", "status", "mode", "basis"}:
            raise ContractError("Responses accept selections/status/mode/basis only; no client evidence or flags.")
        q = self.question(item_id, variant)
        selected = payload.get("selected", [])
        if not isinstance(selected, (list, tuple)) or any(not isinstance(x, str) for x in selected):
            raise ContractError("Selections must be canonical option IDs.")
        status = payload.get("status", "answered")
        mode = payload.get("mode", "single")
        basis = payload.get("basis", "actual_recalled")
        if any(not isinstance(v, str) for v in (status, mode, basis)):
            raise ContractError("Response status, mode and basis must be strings.")
        if basis not in {"actual_recalled", "reported_typicality"}:
            raise ContractError("This instrument does not collect imagined events.")
        if not root and "basis" in payload and basis != "actual_recalled":
            raise ContractError("Attached questions inherit their episode basis.")
        if status != "answered":
            if status not in MISSING_STATUSES or selected:
                raise ContractError("Missingness must be a known control without selected answers.")
            return {"selected": [], "status": status, "mode": "single", "basis": "missing"}
        options = {o["id"]: o for o in q["options"]}
        if not selected or not set(selected) <= set(options) or len(set(selected)) != len(selected):
            raise ContractError("Unknown, empty or duplicate selections.")
        partial = q["selection"]["mode"] == "partial_order"
        if partial:
            if mode not in {"ordered", "simultaneous", "order_unknown"} or len(selected) > 3:
                raise ContractError("Recovery sequence requires an explicit order mode and at most three changes.")
        else:
            if mode not in {"single", "simultaneous", "order_unknown"}:
                raise ContractError("Screen order is not event chronology.")
            if (mode == "single" and len(selected) != 1) or (mode != "single" and len(selected) != 2):
                raise ContractError("Single requires one answer; a mixed response requires exactly two.")
        if len(selected) > 1 and any(options[o].get("exclusive", False) for o in selected):
            raise ContractError("An exclusive answer cannot be mixed with another answer.")
        if mode != "ordered":
            selected = sorted(selected)
        return {"selected": list(selected), "status": status, "mode": mode, "basis": basis}

    def rendered_options(self, item_id: str, variant: str, slots: dict[str, str]) -> dict[str, str]:
        texts = {o["id"]: o["text"] for o in self.question(item_id, variant)["options"]}
        if item_id == "M27":
            if not {"first_want", "second_want"} <= set(slots):
                raise ContractError("M27 requires its actual displayed want pair.")
            texts["M27.first"] = "I acted on wanting " + slots["first_want"] + "."
            texts["M27.second"] = "I acted on wanting " + slots["second_want"] + "."
        return texts

    def decision_cost(self, item_id: str, selected: list[str] | tuple[str, ...], mode: str) -> int:
        if not selected:
            return 1
        if self.items[item_id]["selection"]["mode"] == "partial_order":
            return len(selected) + 1
        return 1 if mode == "single" else 3

    def permutation(self, item_id: str, variant: str, seed: str) -> tuple[str, ...]:
        q = self.question(item_id, variant)
        ids = [o["id"] for o in q["options"]]
        if q["selection"]["mode"] == "partial_order" or item_id in {"D05", "D11"}:
            return tuple(ids)
        return tuple(sorted(ids, key=lambda oid: hashlib.sha256(canonical([seed, item_id, variant, oid]).encode()).hexdigest()))

    @staticmethod
    def slots(prompt: str) -> set[str]:
        return set(re.findall(r"\{([a-z_]+)\}", prompt))
