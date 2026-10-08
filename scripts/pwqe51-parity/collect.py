"""Independent Python replay data for the PWQE 5.1 bounded parity audit."""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "specs/patternwork/question-engine-v5.1/assessment_runtime/implementation"))

from patternwork_router.replay import replay_plan  # noqa: E402
from patternwork_router.model import Config  # noqa: E402
from patternwork_router.source import Source  # noqa: E402


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
        plans.append({"id": pid, "config": asdict(config), "answers": dict(answers),
                      "focus_roots": ["D61"] if pid in {"P02", "P06", "P09"} else []})
    plans += coverage["plans"]
    output = []
    for plan in plans:
        try:
            engine, log = replay_plan(plan, source)
            asked = [e["form"]["item_id"] for e in log if e["form"]["action"] == "ask"]
            packet = engine.packet()
            canonical_responses = []
            focus_occurrences = []
            context_facts = []
            for event in log:
                form = event["form"]
                if form["action"] == "ask" and event.get("receipt", {}).get("response_id"):
                    payload = event["submitted_response"]
                    administration = engine.history.administrations[event["receipt"]["administration_id"]]
                    canonical_responses.append({
                        "responseId": event["receipt"]["response_id"], "questionId": form["item_id"],
                        "occurrenceId": form["occurrence_id"], "stepId": form.get("step_id", "first"),
                        "selectedOptionIds": payload.get("selected", []), "status": payload.get("status", "answered"),
                        "mode": payload.get("mode", "single"),
                        **({"variantId": form["variant"]} if form.get("variant", "base") != "base" else {}),
                        **({"basis": "actual_recalled"} if form.get("recall_basis_control") and payload.get("status", "answered") == "answered" else {}),
                    })
                    if administration.comparison_ids:
                        canonical_responses[-1]["comparisonIds"] = list(administration.comparison_ids)
                    if form["item_id"] in plan.get("focus_roots", []) and payload.get("status", "answered") == "answered":
                        focus_occurrences.append(form["occurrence_id"])
                if "submitted_context" in event:
                    item = event["submitted_context"]
                    context_facts.append({"episodeId": form["occurrence_id"], "fact": item["fact"], "value": item.get("value")})
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
                "comparison_ids_by_response_id": {row["responseId"]: row["comparisonIds"] for row in canonical_responses if "comparisonIds" in row},
                "focus_occurrences": sorted(set(focus_occurrences)),
                "context_facts": context_facts,
                "synthetic_binding_count": sum(1 for event in log if event.get("submitted_binding", {}).get("relation") == "different"),
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
