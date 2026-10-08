"""Independent Python replay data for the PWQE 5.1 bounded parity audit."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "specs/patternwork/question-engine-v5.1/assessment_runtime/implementation"))

from patternwork_router.engine import AssessmentEngine  # noqa: E402
from patternwork_router.model import Config, ContractError  # noqa: E402
from patternwork_router.source import Source  # noqa: E402


def replay_fixture(plan: dict[str, Any], source: Source) -> tuple[AssessmentEngine, list[dict[str, Any]]]:
    """Run the independent reference engine without inferring distinctness.

    Answer queues supply response inputs only. A queued later answer can be
    used after a binding screen only when the fixture separately authors the
    source episode and confirmed-different relation.
    """
    engine = AssessmentEngine(Config(**plan.get("config", {})), source)
    answers = plan["answers"]
    if any(not isinstance(rows, list) or any(not isinstance(row, dict) for row in rows) for rows in answers.values()):
        raise ContractError("Replay answers must be per-item lists of canonical answer objects.")
    binding_by_answer: dict[tuple[str, int], dict[str, Any]] = {}
    for declaration in plan.get("episode_bindings", []):
        if not isinstance(declaration, dict):
            raise ContractError("Episode binding declarations must be objects.")
        key = (declaration.get("item_id"), declaration.get("answer_index"))
        if not isinstance(key[0], str) or type(key[1]) is not int or key in binding_by_answer:
            raise ContractError("Episode binding declarations require unique item_id/answer_index keys.")
        if declaration.get("outcome") != "confirm" or declaration.get("relation") != "different":
            raise ContractError("Distinctness must be an authored confirmed-different binding.")
        if not isinstance(declaration.get("source_item_id"), str) or type(declaration.get("source_answer_index")) is not int:
            raise ContractError("A distinctness binding must identify its authored source answer.")
        if not isinstance(declaration.get("justification"), str) or not declaration["justification"].strip():
            raise ContractError("A distinctness binding requires an independent fixture justification.")
        binding_by_answer[key] = declaration

    counts: dict[str, int] = defaultdict(int)
    administered: dict[tuple[str, int], str] = {}
    used_bindings: set[tuple[str, int]] = set()
    log: list[dict[str, Any]] = []
    for _ in range(240):
        phase_before = engine.history.phase
        # Keep the independent compiler's eligible candidates and add only
        # selector metadata already present on those objects. This does not
        # synthesize candidates, alter decisions, or consult TypeScript output.
        compilation = engine.compiler.compile(engine.state, engine.history)
        trace = compilation.decision
        selector_state = compilation.selector_state
        recent_optional = selector_state.recent_optional[-4:]
        repeated_context = recent_optional[-1] if len(recent_optional) == 4 and len(set(recent_optional)) == 1 else None
        def selector_key(candidate: Any) -> tuple[Any, ...]:
            peer_diverse = repeated_context and candidate.context == repeated_context and not candidate.focus and not candidate.short_block and any(
                peer.candidate is not candidate and peer.candidate.tier == candidate.tier and peer.candidate.context != repeated_context
                for peer in compilation.candidates)
            return (
                candidate.tier, not candidate.focus, bool(peer_diverse), -candidate.new_requirements,
                candidate.decisions, selector_state.context_last.get(candidate.context, -1), candidate.opened_order,
                candidate.item_id, candidate.occurrence_id, candidate.step_id, candidate.variant, candidate.target_instance,
            )
        selector_ranks = {
            (candidate.item_id, candidate.occurrence_id, candidate.step_id, tuple(sorted(compiled.target_ids)), candidate.variant): rank
            for rank, compiled in enumerate(sorted(compilation.candidates, key=lambda row: selector_key(row.candidate)), start=1)
            for candidate in [compiled.candidate]
        }
        trace_candidates = trace.get("candidates", [])
        if len(trace_candidates) != len(compilation.candidates):
            raise ContractError("Reference selector trace candidates do not match the compiler's eligible candidate list.")
        for candidate, compiled in zip(trace_candidates, compilation.candidates):
            source_candidate = compiled.candidate
            identity = (source_candidate.item_id, source_candidate.occurrence_id, source_candidate.step_id,
                        tuple(sorted(compiled.target_ids)), source_candidate.variant)
            if (candidate.get("item_id"), candidate.get("occurrence_id"), candidate.get("step_id", "first"),
                    tuple(sorted(candidate.get("target_ids", [])))) != identity[:4]:
                raise ContractError("Reference selector trace candidate order differs from the eligible compiler candidate list.")
            if identity not in selector_ranks:
                raise ContractError("Reference selector trace candidate has no deterministic selector rank.")
            candidate.update({
                "variant": source_candidate.variant,
                "selector_rank": selector_ranks[identity],
                "selector_key": list(selector_key(source_candidate)),
                "context": source_candidate.context,
                "opened_order": source_candidate.opened_order,
                "short_block": source_candidate.short_block,
                "derived_flags": sorted(source_candidate.flags),
                "variant": source_candidate.variant,
            })
        form = engine.next()
        entry = {"form": form, "selection_trace": trace, "phase_before": phase_before}
        if form["action"] == "ask":
            item_id = form["item_id"]
            answer_index = counts[item_id]
            counts[item_id] += 1
            queue = answers.get(item_id, [])
            authored = answer_index < len(queue)
            payload = queue[answer_index] if authored else {"status": "no_event" if form["recall_basis_control"] else "not_sure"}
            entry["answer_origin"] = "authored_fixture" if authored else "explicit_fixture_missingness"
            if authored:
                entry["fixture_answer_index"] = answer_index
            entry["submitted_response"] = payload
            entry["receipt"] = engine.answer(form["administration_id"], payload, expected_revision=engine.revision, request_id=f"answer-{engine.revision}")
            if authored:
                administered[(item_id, answer_index)] = form["occurrence_id"]
            if item_id in plan.get("focus_roots", []) and engine.state.episodes[form["occurrence_id"]].status == "actual":
                engine.control("focus_occurrence", occurrence_id=form["occurrence_id"], expected_revision=engine.revision, request_id=f"focus-{engine.revision}")
        elif form["action"] == "bind":
            answer_index = counts[form["item_id"]]
            remaining = answer_index < len(answers.get(form["item_id"], []))
            binding = {"outcome": "no_event"}
            entry["binding_origin"] = "explicit_fixture_missingness"
            if remaining:
                key = (form["item_id"], answer_index)
                declaration = binding_by_answer.get(key)
                if declaration is None:
                    raise ContractError(f"Queued fixture answer {key[0]}[{key[1]}] has no independently authored episode binding.")
                source_key = (declaration["source_item_id"], declaration["source_answer_index"])
                source_occurrence = administered.get(source_key)
                if source_occurrence is None:
                    raise ContractError(f"Fixture binding source {source_key[0]}[{source_key[1]}] was not administered first.")
                if source_occurrence != form.get("source_occurrence_id"):
                    raise ContractError("Fixture binding source does not match the reference engine's target lineage.")
                binding = {"outcome": declaration["outcome"], "relation": declaration["relation"]}
                if form["needs_person"]:
                    person_id = declaration.get("person_id")
                    if not isinstance(person_id, str) or person_id not in engine.history.config.people:
                        raise ContractError("Fixture binding must author a valid person_id for this person-bound question.")
                    binding["person_id"] = person_id
                used_bindings.add(key)
                entry["binding_origin"] = "authored_fixture"
                entry["fixture_binding_key"] = list(key)
            entry["submitted_binding"] = binding
            entry["receipt"] = engine.bind(binding, expected_revision=engine.revision, request_id=f"bind-{engine.revision}")
        elif form["action"] == "confirm_context":
            value = plan.get("context_facts", {}).get(form["fact"])
            entry["submitted_context"] = {"fact": form["fact"], "value": value}
            entry["receipt"] = engine.control("context_fact", occurrence_id=form["occurrence_id"], fact=form["fact"], value=value, expected_revision=engine.revision, request_id=f"context-{engine.revision}")
        elif form["action"] == "mapping_ready":
            command = "continue_deepening" if plan.get("continue_deepening", True) else "end"
            entry["receipt"] = engine.control(command, expected_revision=engine.revision, request_id=f"phase-{engine.revision}")
        elif form["action"] == "finished":
            unused = set(binding_by_answer) - used_bindings
            if unused:
                raise ContractError(f"Fixture contains unused episode bindings: {sorted(unused)}")
            log.append(entry)
            return engine, log
        else:
            raise ContractError(f"Unexpected noninteractive replay state: {form['action']}")
        engine.packet()
        entry["post_target_states"] = [
            {
                "target_id": target.target_id,
                "occurrence_id": target.occurrence_id,
                "step_id": target.step_id,
                "comparison_ids": sorted(target.comparison_ids),
                "state": target.state,
            }
            for target in sorted(engine.state.targets.values(), key=lambda row: row.id)
        ]
        log.append(entry)
    raise ContractError("Replay exceeded its finite control/screen guard.")


def main() -> None:
    source = Source()
    legacy = json.loads((ROOT / "specs/patternwork/question-engine-v5/examples/worked_paths.json").read_text(encoding="utf-8"))
    coverage = json.loads((ROOT / "specs/patternwork/question-engine-v5.1/qualification/coverage/FICTIONAL_PLANS.json").read_text(encoding="utf-8"))
    plans = []
    for profile in legacy["profiles"]:
        pid = profile["id"]
        config = Config(people={"P1": "partner", "P2": "supervisor", "P3": "friend"},
                        referents={"evaluator": "P2", "boundary_person": "P2", "close_person": "P1", "support_person": "P3", "repair_person": "P1", "conflict_person": "P1"},
                        topics=["body_detail"])
        if pid in {"P02", "P06", "P09"}: config.focus_topics = ["conflict"]
        if pid == "P08": config.focus_topics = ["disclosure"]
        if pid == "P05": config.details = ["state"]
        if pid == "P09": config.details = ["recurrence"]
        answers = defaultdict(list)
        for row in profile["answers"]:
            answers[row["item_id"]].append({k: row[k] for k in ("selected", "status", "mode") if k in row})
        episode_bindings = []
        for episode in profile.get("episodes", []):
            if not episode.get("distinct_from"):
                continue
            episode_rows = [row for row in profile["answers"] if row.get("occurrence_id") == episode["id"]]
            if not episode_rows:
                continue
            root_row = episode_rows[0]
            if not root_row.get("replay") and root_row["item_id"] != "D42":
                continue
            source_rows = [row for row in profile["answers"] if row.get("occurrence_id") == episode["distinct_from"][0]]
            if not source_rows:
                raise ValueError(f"Worked path {pid} has a distinct episode without a source answer.")
            source_row = source_rows[0]
            root_row_index = profile["answers"].index(root_row)
            source_row_index = profile["answers"].index(source_row)
            episode_bindings.append({
                "item_id": root_row["item_id"],
                "answer_index": sum(1 for row in profile["answers"][:root_row_index] if row["item_id"] == root_row["item_id"]),
                "source_item_id": source_row["item_id"],
                "source_answer_index": sum(1 for row in profile["answers"][:source_row_index] if row["item_id"] == source_row["item_id"]),
                "outcome": "confirm", "relation": "different",
                **({"person_id": episode["person"]} if episode.get("person") else {}),
                "justification": root_row.get("selection_reason") or f"Authored occurrence {episode['id']} is distinct from {episode['distinct_from'][0]}.",
            })
        plans.append({"id": pid, "config": asdict(config), "answers": dict(answers), "episode_bindings": episode_bindings,
                      "focus_roots": ["D61"] if pid in {"P02", "P06", "P09"} else []})
    plans += coverage["plans"]
    output = []
    for plan in plans:
        try:
            engine, log = replay_fixture(plan, source)
            asked = [e["form"]["item_id"] for e in log if e["form"]["action"] == "ask"]
            packet = engine.packet()
            target_by_internal_id = {target["id"]: target for target in packet["target_resolutions"]}

            def target_ref(internal_id: str) -> str:
                target = target_by_internal_id.get(internal_id)
                if not target:
                    return internal_id
                if target["target_id"].startswith("entry:"):
                    return target["target_id"]
                pair = target.get("comparison_ids") or []
                return ":".join([target["target_id"], target["occurrence_id"], target["step_id"], *sorted(pair)])

            def normalize_trace(trace: dict[str, Any]) -> dict[str, Any]:
                target_instance = trace.get("target_instance")
                return {
                    "action": trace.get("action"), "item_id": trace.get("item_id"),
                    "occurrence_id": trace.get("occurrence_id"),
                    "target_instance": target_ref(target_instance) if isinstance(target_instance, str) else target_instance,
                    "reason": trace.get("reason"), "candidate_count": trace.get("candidate_count", 0),
                    "candidates": [{
                        "item_id": candidate.get("item_id"),
                        "target_ids": [target_ref(target_id) for target_id in candidate.get("target_ids", [])],
                        "occurrence_id": candidate.get("occurrence_id"), "step_id": candidate.get("step_id"),
                        "priority": candidate.get("priority"), "selected": candidate.get("selected", False),
                        "focus": candidate.get("focus", False),
                        "new_requirements": candidate.get("new_requirements"),
                        "decisions": candidate.get("decisions"),
                        "context": candidate.get("context"),
                        "opened_order": candidate.get("opened_order"),
                        "short_block": candidate.get("short_block", False),
                        "derived_flags": candidate.get("derived_flags", []),
                        "variant": candidate.get("variant", "base"),
                        "selector_rank": candidate.get("selector_rank"),
                        "selector_key": candidate.get("selector_key"),
                        "binding_control_needed": candidate.get("binding_control_needed", False),
                        "replay": candidate.get("replay", False),
                    } for candidate in trace.get("candidates", [])],
                    "open_targets": [{
                        "id": target_ref(target["id"]), "target": target.get("target"),
                        "priority": target.get("priority"), "occurrence_id": target.get("occurrence_id"),
                        "missing_discriminator": target.get("missing_discriminator", []),
                    } for target in trace.get("open_targets", [])],
                    "rejected_count": len(trace.get("rejected", [])),
                    "burden": trace.get("burden"),
                }

            canonical_responses = []
            focus_occurrences = []
            context_facts = []
            selection_steps = []
            prefix_responses = []
            prefix_focus_occurrences: set[str] = set()
            prefix_context_facts = []
            prefix_closed_bindings: dict[str, str] = {}
            prefix_occurrence_bindings: dict[str, str] = {}
            pending_confirmed_binding: dict[str, str] | None = None

            def prefix_episode_state() -> tuple[list[list[str]], list[dict[str, str]]]:
                actual_ids = {row["occurrenceId"] for row in prefix_responses if row.get("basis") == "actual_recalled"}
                pairs = sorted({tuple(sorted([episode["id"], prior])) for episode in packet["episodes"]
                                if episode["id"] in actual_ids for prior in episode.get("distinct_from", []) if prior in actual_ids})
                links = [{"occurrenceId": episode["id"], "linkedFrom": episode["linked_from"]}
                         for episode in packet["episodes"] if episode["id"] in actual_ids and episode.get("linked_from") in actual_ids]
                return [list(pair) for pair in pairs], links

            for event in log:
                form = event["form"]
                if pending_confirmed_binding and form["action"] == "ask" and form.get("item_id") == pending_confirmed_binding["item_id"]:
                    target_id = pending_confirmed_binding["target_id"]
                    key = target_id if target_id.startswith("entry:") else f"target:{target_id}:{pending_confirmed_binding['item_id']}"
                    prefix_occurrence_bindings[key] = form["occurrence_id"]
                    pending_confirmed_binding = None
                distinct_pairs, episode_links = prefix_episode_state()
                selection_steps.append({
                    "ordinal": len(selection_steps), "phase": event.get("phase_before", "mapping"),
                    "form_action": form["action"], "form_item_id": form.get("item_id"),
                    "form_occurrence_id": form.get("occurrence_id"), "form_target_key": form.get("key"),
                    "binding_needs_distinctness": form.get("needs_distinctness"),
                    "binding_outcome": event.get("submitted_binding", {}).get("outcome"),
                    "form_reason": form.get("reason"), "decision": normalize_trace(event.get("selection_trace", {})),
                    "pre_response_count": len(prefix_responses),
                    "pre_focus_occurrences": sorted(prefix_focus_occurrences),
                    "pre_context_fact_count": len(prefix_context_facts),
                    "pre_closed_bindings": dict(prefix_closed_bindings),
                    "pre_occurrence_bindings": dict(prefix_occurrence_bindings),
                    "pre_distinct_pairs": distinct_pairs, "pre_episode_links": episode_links,
                })
                if form["action"] == "ask" and event.get("receipt", {}).get("response_id"):
                    payload = event["submitted_response"]
                    administration = engine.history.administrations[event["receipt"]["administration_id"]]
                    response = {
                        "responseId": event["receipt"]["response_id"], "questionId": form["item_id"],
                        "occurrenceId": form["occurrence_id"], "stepId": form.get("step_id", "first"),
                        "selectedOptionIds": payload.get("selected", []), "status": payload.get("status", "answered"),
                        "mode": payload.get("mode", "single"),
                        **({"variantId": form["variant"]} if form.get("variant", "base") != "base" else {}),
                        **({"basis": "actual_recalled"} if form.get("recall_basis_control") and payload.get("status", "answered") == "answered" else {}),
                        "targetIds": sorted({target_ref(target_id) for target_id in administration.target_ids}),
                    }
                    if administration.comparison_ids:
                        response["comparisonIds"] = list(administration.comparison_ids)
                    canonical_responses.append(response)
                    prefix_responses.append(response)
                    if form["item_id"] in plan.get("focus_roots", []) and payload.get("status", "answered") == "answered":
                        focus_occurrences.append(form["occurrence_id"])
                        prefix_focus_occurrences.add(form["occurrence_id"])
                    for topic in plan.get("config", {}).get("focus_topics", []):
                        entry = source.entries.get(topic)
                        if entry and form["item_id"] == entry["first_item"] and payload.get("status", "answered") == "answered":
                            prefix_occurrence_bindings[f"entry:{topic}"] = form["occurrence_id"]
                if "submitted_context" in event:
                    item = event["submitted_context"]
                    fact = {"episodeId": form["occurrence_id"], "fact": item["fact"], "value": item.get("value")}
                    context_facts.append(fact)
                    prefix_context_facts.append(fact)
                receipt = event.get("receipt", {})
                if form["action"] == "bind" and receipt.get("binding_key") in target_by_internal_id:
                    outcome = receipt.get("outcome", "no_event")
                    if outcome == "confirm":
                        trace = normalize_trace(event.get("selection_trace", {}))
                        target_id = trace.get("target_instance")
                        selected_item = trace.get("item_id") or form.get("item_id")
                        if isinstance(target_id, str) and isinstance(selected_item, str):
                            pending_confirmed_binding = {"target_id": target_id, "item_id": selected_item}
                    else:
                        prefix_closed_bindings[target_ref(receipt["binding_key"])] = outcome
                post_pairs, post_links = prefix_episode_state()
                target_changes = []
                for change_kind in ("opened", "changed", "closed", "invalidated"):
                    for change in receipt.get("target_changes", {}).get(change_kind, []):
                        target = target_by_internal_id.get(change.get("id"), change)
                        pair = target.get("comparison_ids") or []
                        state = change.get("state", change.get("to"))
                        target_changes.append({
                            "kind": change_kind,
                            "target_id": target.get("target_id"),
                            "occurrence_id": target.get("occurrence_id"),
                            "step_id": target.get("step_id"),
                            "comparison_ids": sorted(pair),
                            "state": state,
                        })
                selection_steps[-1].update({
                    "post_response_count": len(prefix_responses),
                    "post_focus_occurrences": sorted(prefix_focus_occurrences),
                    "post_context_fact_count": len(prefix_context_facts),
                    "post_closed_bindings": dict(prefix_closed_bindings),
                    "post_occurrence_bindings": dict(prefix_occurrence_bindings),
                    "post_distinct_pairs": post_pairs,
                    "post_episode_links": post_links,
                    "post_target_changes": target_changes,
                    "post_target_states": event.get("post_target_states", []),
                })
            used_binding_keys = {tuple(event["fixture_binding_key"]) for event in log if event.get("fixture_binding_key")}
            unused_episode_bindings = [binding for binding in plan.get("episode_bindings", [])
                                       if (binding["item_id"], binding["answer_index"]) not in used_binding_keys]
            traced = []
            for event in log:
                for candidate in event.get("selection_trace", {}).get("candidates", []):
                    item = candidate.get("item_id")
                    if item and item not in traced:
                        traced.append(item)
            output.append({
                "id": plan["id"], "ok": True, "asked_items": asked,
                "trace_candidate_items": traced,
                "decisions": engine.history.decisions,
                "target_states": {t.id: t.state for t in engine.state.targets.values()},
                "canonical_responses": canonical_responses,
                "selection_steps": selection_steps,
                "comparison_ids_by_response_id": {row["responseId"]: row["comparisonIds"] for row in canonical_responses if "comparisonIds" in row},
                "focus_occurrences": sorted(set(focus_occurrences)),
                "context_facts": context_facts,
                "episode_links": [{"occurrenceId": episode["id"], "linkedFrom": episode["linked_from"]} for episode in packet["episodes"] if episode.get("linked_from")],
                "closed_bindings": {target_ref(key): value for key, value in engine.history.closed_bindings.items() if key in target_by_internal_id},
                "rejected_target_ids": [target_ref(key) for key in engine.history.rejected_targets if key in target_by_internal_id],
                "explicit_binding_count": sum(1 for event in log if event.get("binding_origin") == "authored_fixture"),
                "synthetic_binding_count": sum(1 for event in log if event.get("binding_origin") == "driver_synthesized"),
                "unused_episode_bindings": unused_episode_bindings,
                "episodes": packet["episodes"], "observations": packet["observations"],
                "targets": packet["target_resolutions"], "missingness": packet["missingness"],
                "steps": packet["steps"], "sequence_edges": packet["sequence_edges"],
                "config": plan.get("config", {}), "focus_roots": plan.get("focus_roots", []),
                "python_source_binding": source.binding,
            })
        except Exception as exc:  # Keep failures visible per fixture; continue the audit.
            output.append({"id": plan["id"], "ok": False, "error": f"{type(exc).__name__}: {exc}"})
    print(json.dumps({"plans": output, "legacy_profile_ids": [p["id"] for p in legacy["profiles"]], "coverage_ids": [p["id"] for p in coverage["plans"]]}))


if __name__ == "__main__":
    main()
