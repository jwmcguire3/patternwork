"""Typed records for the standalone Patternwork routing core.

Reported selections are not verified behavior. Derived records never replace them.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import Enum
from typing import Any
import hashlib
import json


class ContractError(ValueError):
    """An input violates an authored or runtime contract."""


class ConflictError(ContractError):
    """The caller's revision or idempotency key conflicts with current state."""


class SourceMismatch(ContractError):
    """A snapshot belongs to a different source/runtime release."""


class TargetStatus(str, Enum):
    OPEN = "open"
    SUPPORTED = "supports_interpretation"
    ALTERNATIVE = "supports_alternative"
    DESCRIBED = "resolved_descriptively"
    UNRESOLVED = "unresolved"
    UNAVAILABLE = "unavailable"
    DECLINED = "declined"
    SUPERSEDED = "superseded"
    LOW_VALUE = "abandoned_low_value"


class Basis(str, Enum):
    ACTUAL = "actual_recalled"
    TYPICAL = "reported_typicality"
    EXPECTATION = "remembered_expectation"
    MISSING = "missing"


class Relation(str, Enum):
    BEFORE = "before"
    SIMULTANEOUS = "simultaneous"
    ALTERNATING = "alternating"
    UNKNOWN = "order_unknown"
    SAME_STEP = "same_step"
    DIFFERENT = "different_occurrence"


MISSING_STATUSES = frozenset({"none_fit", "not_sure", "no_event", "not_applicable", "skip"})
TOPICS = frozenset({"family", "loss", "money", "growing_closeness", "body_detail"})
ROLES = frozenset({"partner", "former_partner", "friend", "family_member", "colleague", "supervisor", "client", "teacher", "reviewer", "other_person"})
SLOTS = frozenset({"evaluator", "boundary_person", "close_person", "support_person", "repair_person", "conflict_person", "family_person"})
DETAILS = frozenset({"state", "body", "urge", "feeling", "texture", "recurrence", "contrast"})


def canonical(value: Any) -> str:
    """Deterministic JSON; this is not a claim of RFC 8785 canonicalization."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def digest(value: Any) -> str:
    return hashlib.sha256(canonical(value).encode("utf-8")).hexdigest()


def stable_id(prefix: str, *parts: Any) -> str:
    return prefix + digest(parts)[:20]


@dataclass
class Config:
    people: dict[str, str] = field(default_factory=dict)
    referents: dict[str, str] = field(default_factory=dict)
    topics: list[str] = field(default_factory=list)
    unavailable_contexts: list[str] = field(default_factory=list)
    focus_topics: list[str] = field(default_factory=list)
    focus_occurrences: list[str] = field(default_factory=list)
    details: list[str] = field(default_factory=list)
    report_language: str = "no_preference"
    recall_window: str = "recent_weeks"
    entry_context: str | None = None
    total_limit: int = 56
    mapping_limit: int = 32
    decision_limit: int = 72
    option_seed: str = "patternwork-reference"

    def validate(self, contexts: set[str], entry_points: set[str]) -> None:
        import re
        if any(not re.fullmatch(r"P[0-9]{1,6}", p) or role not in ROLES for p, role in self.people.items()):
            raise ContractError("People require runtime-style opaque P<number> IDs and allowlisted roles; no names.")
        if not set(self.referents) <= SLOTS or not set(self.referents.values()) <= set(self.people):
            raise ContractError("Unknown referent slot/person.")
        if not set(self.topics) <= TOPICS or not set(self.details) <= DETAILS:
            raise ContractError("Unknown topic or detail preference.")
        if not set(self.unavailable_contexts) <= contexts:
            raise ContractError("Unknown unavailable context.")
        if not set(self.focus_topics) <= entry_points:
            raise ContractError("Unknown focus topic.")
        if self.report_language not in {"parts", "plain", "no_preference"}:
            raise ContractError("Unknown report language.")
        if self.recall_window not in {"recent_weeks", "recent_months", "past_year"}:
            raise ContractError("Unknown recall window.")
        if self.entry_context is not None and self.entry_context not in contexts:
            raise ContractError("Unknown entry context.")
        for k, maximum in [("total_limit", 56), ("mapping_limit", 32), ("decision_limit", 72)]:
            v = getattr(self, k)
            if type(v) is not int or not 1 <= v <= maximum:
                raise ContractError(f"{k} must be between 1 and {maximum}.")
        if not isinstance(self.option_seed, str) or len(self.option_seed) > 100:
            raise ContractError("Invalid option seed.")


@dataclass(frozen=True)
class Dependency:
    administration_id: str
    response_fingerprint: str
    reason: str
    aspect: str = "content"


@dataclass(frozen=True)
class ContextDependency:
    occurrence_id: str
    fact: str
    expected_value: bool


@dataclass(frozen=True)
class Administration:
    id: str
    item_id: str
    occurrence_id: str
    step_id: str
    phase: str
    target_ids: tuple[str, ...]
    variant: str = "base"
    source_step_id: str = "first"
    dependencies: tuple[Dependency, ...] = ()
    comparison_ids: tuple[str, ...] = ()
    replay_of: str | None = None
    option_order: tuple[str, ...] = ()
    slots: dict[str, str] = field(default_factory=dict)
    selection_reason: str = "coverage"
    generation: int = 0
    context_dependencies: tuple[ContextDependency, ...] = ()


@dataclass(frozen=True)
class Response:
    id: str
    administration_id: str
    selected: tuple[str, ...] = ()
    status: str = "answered"
    mode: str = "single"
    basis: str = Basis.ACTUAL.value
    supersedes: str | None = None

    @property
    def fingerprint(self) -> str:
        selected = self.selected if self.mode == "ordered" else tuple(sorted(self.selected))
        return digest([selected, self.status, self.mode, self.basis])


@dataclass
class Episode:
    id: str
    family: str
    context: str
    root_item_id: str
    person_id: str | None = None
    role: str | None = None
    basis: str = Basis.ACTUAL.value
    status: str = "proposed"
    topic: str | None = None
    linked_from: str | None = None
    distinct_from: list[str] = field(default_factory=list)
    source_administrations: list[str] = field(default_factory=list)
    recall_window: str = "recent_weeks"
    outside_window: bool = False


@dataclass(frozen=True)
class Observation:
    id: str
    response_id: str
    administration_id: str
    item_id: str
    option_id: str
    variant: str
    text: str
    reported_value: str
    capture: str
    occurrence_id: str
    step_id: str
    person_id: str | None
    basis: str
    mode: str
    dependence_group: str
    selection_reason: str
    source_version: str
    signals: tuple[str, ...] = ()
    displayed_text: str = ""


@dataclass(frozen=True)
class SequenceEdge:
    id: str
    occurrence_id: str
    from_step: str
    to_step: str
    relation: str
    evidence_ids: tuple[str, ...]
    first_not_helping: bool = False
    meaning: str = "reported_temporal_relation_not_causality"


@dataclass
class Target:
    id: str
    target_id: str
    occurrence_id: str
    step_id: str
    state: str = TargetStatus.OPEN.value
    comparison_ids: tuple[str, ...] = ()
    source_ids: list[str] = field(default_factory=list)
    resolution_ids: list[str] = field(default_factory=list)
    candidate_items: list[str] = field(default_factory=list)
    priority: int = 4
    reason: str = "evidence_gap"
    attempts: int = 0
    opened_order: int = 0
    flags: list[str] = field(default_factory=list)
    explicit_request: bool = False


@dataclass(frozen=True)
class Finding:
    """A structural evidence summary, not a named/validated psychological claim."""
    id: str
    code: str
    occurrence_ids: tuple[str, ...]
    step_ids: tuple[str, ...]
    evidence_ids: tuple[str, ...]
    counterevidence_ids: tuple[str, ...] = ()
    scope: str = "occurrence"
    status: str = "structural_support_requires_report_semantic_review"
    missing: tuple[str, ...] = ()


@dataclass
class EvidenceState:
    observations: dict[str, Observation] = field(default_factory=dict)
    episodes: dict[str, Episode] = field(default_factory=dict)
    edges: list[SequenceEdge] = field(default_factory=list)
    targets: dict[str, Target] = field(default_factory=dict)
    findings: list[Finding] = field(default_factory=list)
    missingness: list[dict[str, Any]] = field(default_factory=list)
    active_response_ids: set[str] = field(default_factory=set)
    invalidated_response_ids: set[str] = field(default_factory=set)
    superseded_response_ids: set[str] = field(default_factory=set)
    unresolved_bindings: list[dict[str, Any]] = field(default_factory=list)
    flags: dict[str, set[str]] = field(default_factory=dict)
    readiness: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        obj = asdict(self)
        for key in ("active_response_ids", "invalidated_response_ids", "superseded_response_ids"):
            obj[key] = sorted(obj[key])
        obj["flags"] = {k: sorted(v) for k, v in obj["flags"].items()}
        return obj


@dataclass
class History:
    config: Config
    administrations: dict[str, Administration] = field(default_factory=dict)
    responses: dict[str, Response] = field(default_factory=dict)
    current: dict[str, str] = field(default_factory=dict)
    episodes: dict[str, Episode] = field(default_factory=dict)
    invalidated: dict[str, str] = field(default_factory=dict)
    superseded: set[str] = field(default_factory=set)
    context_facts: list[dict[str, Any]] = field(default_factory=list)
    bindings: dict[str, dict[str, Any]] = field(default_factory=dict)
    closed_bindings: dict[str, str] = field(default_factory=dict)
    requested_targets: set[str] = field(default_factory=set)
    requested_details: list[dict[str, str]] = field(default_factory=list)
    rejected_targets: set[str] = field(default_factory=set)
    corrections: list[dict[str, Any]] = field(default_factory=list)
    phase: str = "mapping"
    control: str | None = None
    shortened: bool = False
    pending: str | None = None
    decisions: int = 0
    controls_count: int = 0
    revision: int = 0
    completion_reason: str | None = None
    rebindings: dict[str, str] = field(default_factory=dict)
    target_closures: dict[str, str] = field(default_factory=dict)

    def live_responses(self) -> list[Response]:
        return [self.responses[rid] for aid, rid in self.current.items() if aid not in self.invalidated]


def dependency_fingerprint(response: Response, aspect: str = "content") -> str:
    if aspect == "content":
        return response.fingerprint
    if aspect == "status_basis":
        return digest([response.status, response.basis])
    if aspect.startswith("option:"):
        return digest([response.status, response.basis, aspect[7:] in response.selected])
    raise ContractError("Unknown dependency aspect.")
