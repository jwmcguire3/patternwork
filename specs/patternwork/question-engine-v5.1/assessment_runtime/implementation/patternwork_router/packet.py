"""Privacy-minimized report evidence and independent lineage validation.

The packet exposes authored evidence, not identities, free text, event requests,
internal scores or already written psychological conclusions.
"""
from __future__ import annotations

from dataclasses import asdict
import json
from typing import Any

from .model import ContractError, EvidenceState, History, Observation, Episode, SequenceEdge, stable_id, digest, canonical
from .source import Source
from .evidence import validate_graph


def compile_packet(state: EvidenceState, history: History, source: Source,
                   events: list[dict[str, Any]]) -> dict[str, Any]:
    observations = [asdict(o) for o in sorted(state.observations.values(), key=lambda o: o.id)]
    used = {o.occurrence_id for o in state.observations.values()}
    used |= {t.occurrence_id for t in state.targets.values() if t.occurrence_id in state.episodes}
    episodes = []
    for eid in sorted(used):
        e = state.episodes[eid]
        episodes.append({k: v for k, v in asdict(e).items() if k != "source_administrations"})
    steps = [{"id": stable_id("S", eid, step), "occurrence_id": eid, "step_id": step,
              "observation_ids": sorted(o.id for o in state.observations.values()
                                        if o.occurrence_id == eid and o.step_id == step)}
             for eid, step in sorted({(o.occurrence_id, o.step_id) for o in state.observations.values()})]
    targets = [{k: v for k, v in asdict(t).items()
                if k not in {"flags", "opened_order", "priority", "candidate_items", "explicit_request"}}
               for t in sorted(state.targets.values(), key=lambda t: t.id)]
    findings = [asdict(f) for f in state.findings]
    people = {e["person_id"] for e in episodes if e["person_id"]}
    comparisons = [{"occurrence_id": e["id"], "distinct_from": e["distinct_from"],
                    "linked_from": e["linked_from"], "basis": "respondent_confirmed_distinctness"}
                   for e in episodes if e["distinct_from"]]
    packet: dict[str, Any] = {
        "format": "patternwork-router-evidence-v1",
        "release_id": source.release,
        "snapshot_id": stable_id("SN", source.binding, asdict(history.config), events),
        "superseded_response_ids": sorted(state.superseded_response_ids),
        "invalidated_response_ids": sorted(state.invalidated_response_ids),
        "source_binding": source.binding.copy(),
        "assessment_scope": {"recall_window": history.config.recall_window,
                             "report_language": history.config.report_language,
                             "phase": history.phase, "completion_reason": history.completion_reason,
                             "readiness": state.readiness,
                             "interpretation_authority": "report_writer_with_semantic_review",
                             "evidence_basis": "retrospective_self_report_not_verified_behavior"},
        "observations": observations, "episodes": episodes, "steps": steps,
        "sequence_edges": [asdict(e) for e in state.edges],
        "target_resolutions": targets,
        "structural_evidence_summaries": findings,
        "supported_alternatives": [t["id"] for t in targets if t["state"] == "supports_alternative"],
        "counterexamples": [f["id"] for f in findings if "counterexample" in f["code"] or f["counterevidence_ids"]],
        "missingness": state.missingness,
        "corrections": [{k: v for k, v in c.items() if k in {"administration_id", "old_response_id", "new_response_id", "kind", "seq", "occurrence_id", "aspect", "target_id", "control_id", "reason", "destination_occurrence_id"}}
                        for c in history.corrections],
        "unresolved_bindings": state.unresolved_bindings,
        "referent_scopes": [{"person_id": p, "role": history.config.people[p]} for p in sorted(people)],
        "context_comparisons": comparisons,
        "reported_context_controls": [{k: c[k] for k in ("id", "occurrence_id", "fact", "value")} for c in history.context_facts if c["occurrence_id"] in used],
        "secure_capacity_examples": [f["id"] for f in findings if f["code"] in {
            "available_capacity_example", "choice_return_reported", "ordinary_autonomy_aim",
            "repair_had_helpful_effect", "choice_return_following_later_reduced_input"
        } and f["status"] != "respondent_disputed"],
        "interpretation_disputes": [{"target_instance": t.id, "target_id": t.target_id,
                                      "occurrence_id": t.occurrence_id, "step_id": t.step_id,
                                      "source_observation_ids": t.source_ids,
                                      "effect": "withdraw_inferred_explanation_not_literal_observation"}
                                     for t in sorted(state.targets.values(), key=lambda z: z.id) if t.id in history.rejected_targets],
        "open_questions": [{"target_instance": t["id"], "target_id": t["target_id"], "state": t["state"], "reason": t["reason"]}
                           for t in targets if t["state"] in {"open", "unresolved", "unavailable", "declined", "abandoned_low_value"}],
        "administration_provenance": [{"id": a.id, "item_id": a.item_id, "variant": a.variant,
                                        "occurrence_id": history.rebindings.get(a.id, a.occurrence_id),
                                        "option_order": list(a.option_order), "phase": a.phase,
                                        "selection_reason": a.selection_reason,
                                        "live_response_id": history.current.get(a.id) if a.id not in history.invalidated else None}
                                       for a in history.administrations.values()],
    }
    # Return detached JSON-native values: no mutable state aliases or tuples.
    packet = json.loads(canonical(packet))
    # Hashes prove deterministic content binding, not psychological validity.
    packet["packet_id"] = stable_id("PK", source.binding, asdict(history.config), events)
    packet["content_sha256"] = digest(packet)
    validate_packet(packet, source, state)
    return packet


def validate_packet(packet: dict[str, Any], source: Source, state: EvidenceState | None = None) -> None:
    """Validate source, selections, scopes, graphs and every current evidence link."""
    if packet.get("format") != "patternwork-router-evidence-v1" or packet.get("source_binding") != source.binding:
        raise ContractError("Packet source/format mismatch.")
    content = dict(packet)
    expected = content.pop("content_sha256", None)
    if expected != digest(content):
        raise ContractError("Packet content digest mismatch.")
    observations = packet["observations"]
    ids = {o["id"] for o in observations}
    if len(ids) != len(observations):
        raise ContractError("Duplicate observation identity.")
    eps = {e["id"]: e for e in packet["episodes"]}
    if len(eps) != len(packet["episodes"]):
        raise ContractError("Duplicate occurrence identity.")
    live = {a["live_response_id"] for a in packet["administration_provenance"] if a["live_response_id"]}
    if live & (set(packet["superseded_response_ids"]) | set(packet["invalidated_response_ids"])):
        raise ContractError("A stale response was presented as current.")
    for o in observations:
        q = source.question(o["item_id"], o["variant"])
        option = next((x for x in q["options"] if x["id"] == o["option_id"]), None)
        if option is None or o["text"] != option["text"] or o["reported_value"] != option["reported_value"]:
            raise ContractError("Observation is not a literal authored selection.")
        if o["response_id"] not in live or o["occurrence_id"] not in eps or o["dependence_group"] != o["occurrence_id"]:
            raise ContractError("Broken live observation/occurrence lineage.")
        if o["source_version"] != q["version"]:
            raise ContractError("Observation version mismatch.")
        if o["id"] != stable_id("O", o["response_id"], o["option_id"]):
            raise ContractError("Observation identity does not bind its selection.")
        if state and (o["id"] not in state.observations or o["response_id"] not in state.active_response_ids
                      or digest(o) != digest(asdict(state.observations[o["id"]]))):
            raise ContractError("Stale or invented observation.")
    for t in packet["target_resolutions"]:
        if not set(t["source_ids"] + t["resolution_ids"]) <= ids:
            raise ContractError("Target cites stale/nonexistent observations.")
    for f in packet["structural_evidence_summaries"]:
        if not set(f["evidence_ids"]) | set(f["counterevidence_ids"]) <= ids:
            raise ContractError("Structural summary has invalid evidence lineage.")
        if not set(f["occurrence_ids"]) <= set(eps):
            raise ContractError("Structural summary has invalid occurrence scope.")
    for edge in packet["sequence_edges"]:
        if not set(edge["evidence_ids"]) <= ids:
            raise ContractError("Sequence cites missing evidence.")
    for step in packet["steps"]:
        if not set(step["observation_ids"]) <= ids:
            raise ContractError("Step cites missing evidence.")
    # Validate the supplied graph, not merely an adjacent trusted graph. A caller
    # recomputing a digest must not make a dangling or cross-episode edge valid.
    try:
        graph = [SequenceEdge(**e) for e in packet["sequence_edges"]]
        graph_obs = {o["id"]: Observation(**o) for o in observations}
        graph_eps = {e["id"]: Episode(**e) for e in packet["episodes"]}
        validate_graph(graph, graph_obs, graph_eps)
    except (TypeError, KeyError) as exc:
        raise ContractError("Malformed graph evidence.") from exc
    if state:
        if digest(packet["sequence_edges"]) != digest([asdict(e) for e in state.edges]):
            raise ContractError("Packet graph differs from live evidence.")
        if digest(packet["structural_evidence_summaries"]) != digest([asdict(f) for f in state.findings]):
            raise ContractError("Packet summaries differ from live evidence.")
