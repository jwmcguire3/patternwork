"""Traceable structural report-readiness summaries, never a report writer.

These rules are deliberately not an exhaustive list of interpretations the writer
may make. A writer can connect other adequately supported evidence. No code here
names a protector, claims a vagal mechanism, or invents a developmental history.
"""
from __future__ import annotations

from dataclasses import replace

from .evidence import EvidenceIndex
from .model import EvidenceState, Finding, History, Observation, stable_id
from .semantics import CAPACITY_LIMIT, RELIEF_AIMS, matched_behavior
from .source import Source


def build_findings(s: EvidenceState, h: History, source: Source) -> list[Finding]:
    x = EvidenceIndex(s, h, source)
    findings: list[Finding] = []

    def add(code: str, obs: list[Observation], *, counter: list[Observation] | None = None,
            scope: str = "occurrence", missing: tuple[str, ...] = (), status: str = "structural_support_requires_report_semantic_review") -> None:
        if not obs:
            return
        ids = tuple(sorted({o.id for o in obs}))
        findings.append(Finding(stable_id("F", code, ids), code,
                                tuple(sorted({o.occurrence_id for o in obs})), tuple(sorted({o.step_id for o in obs})),
                                ids, tuple(sorted({o.id for o in (counter or [])})), scope, status, missing))

    for ep in s.episodes.values():
        if not x.actual(ep.id):
            continue
        all_obs = x.observations(ep.id)
        opts = x.options(ep.id)
        for step in sorted(x.step_ids(ep.id)):
            action = x.action(ep.id, step)
            step_obs = x.observations(ep.id, step=step)
            values = {o.option_id for o in step_obs}
            selected = lambda allowed: [o for o in step_obs if o.option_id in allowed]
            if not action:
                continue
            preventive = selected({"M03.exposure", "D15.prevent", "D15.before"})
            if "D02.prevent" in values:
                # A direct preventive aim is recorded, but a practical prediction
                # can limit the proposed protective reading.
                preventive += selected({"D02.prevent", "D03.judged", "D03.upset", "D03.connection", "D03.pressure"})
            if preventive:
                constraints = selected({"D16.consequence", "D16.unsafe", "D16.load", "D03.real"})
                add("preventive_function_support", action + preventive, counter=constraints,
                    missing=("recurrence", "developmental_origin"))
            relief_aims = selected(RELIEF_AIMS)
            if relief_aims:
                add("relief_seeking_aim_reported", action + relief_aims, status="reported_structure")
                limits = selected(CAPACITY_LIMIT)
                if limits:
                    add("relief_aim_with_capacity_ambiguity", action + relief_aims + limits,
                        missing=("chosen_strategy_versus_capacity_loss",))
                else:
                    hard_context = ep.family in {"conflict", "overload", "loss"} or bool(values & {"D01.during", "D11.urgent", "D09.relief"})
                    if hard_context:
                        add("reactive_relief_function_support", action + relief_aims + selected({"D01.during", "D11.urgent"}),
                            missing=("developmental_origin",))
            if values & {"D10.relief", "M12.relief", "M14.brief", "D59.relief"}:
                add("relief_effect_reported", action + selected({"D10.relief", "M12.relief", "M14.brief", "D59.relief"}), status="reported_structure")
            if values & {"D10.same", "D10.worse", "M12.same", "M12.worse"}:
                add("relief_not_reported_after_this_move", action + selected({"D10.same", "D10.worse", "M12.same", "M12.worse"}), status="reported_structure")
            if values & {"D02.practical", "M03.requirements", "M03.no_aim"}:
                add("practical_function_reported", action + selected({"D02.practical", "M03.requirements", "M03.no_aim"}), status="reported_structure")
        # A handoff needs the same actual occurrence, ordered steps, and a
        # discriminating change in job; overlap and uncertain order never suffice.
        first_support = [f for f in findings if f.code == "preventive_function_support" and f.occurrence_ids == (ep.id,)]
        next_support = [f for f in findings if f.code == "reactive_relief_function_support" and f.occurrence_ids == (ep.id,) and "next" in f.step_ids]
        edge = next((e for e in s.edges if e.occurrence_id == ep.id and e.to_step == "next" and e.relation == "before"), None)
        if first_support and next_support and edge and "D09.same" not in opts:
            first_support = [f for f in first_support if edge.from_step in f.step_ids]
            if first_support:
                ids = set(first_support[0].evidence_ids) | set(next_support[0].evidence_ids) | set(edge.evidence_ids)
                add("preventive_to_relief_handoff_support", [s.observations[i] for i in sorted(ids)],
                    missing=("broader_recurrence",))
        wait_action = x.observations(ep.id, ["M17"])
        if wait_action:
            evidence = x.observations(ep.id, ["M18", "M19", "D43"])
            contact_opts = {o.option_id for o in evidence}
            practical = contact_opts & {"M18.info", "D43.information", "M19.information"}
            relational = contact_opts & {"M18.upset", "M18.matter", "D43.okay", "D43.notice", "M19.ease"}
            if practical and not relational:
                add("practical_contact_explanation", wait_action + evidence, status="reported_structure")
            elif practical and relational:
                add("mixed_contact_meanings", wait_action + evidence, missing=("whether_both_jobs_operated_together",))
            elif relational:
                add("relationship_scoped_contact_concern", wait_action + evidence,
                    counter=x.observations(ep.id, ["D44"]), missing=("global_attachment_identity", "independent_recurrence"))
        if opts & {"D44.variable", "D44.strained", "D16.unreliable", "D16.unsafe"}:
            add("reported_relational_or_power_constraint", [o for o in all_obs if o.option_id in {"D44.variable", "D44.strained", "D16.unreliable", "D16.unsafe"}], status="reported_structure")
        if "M20.small" in opts:
            if opts & {"M21.practical", "D21.practical"}:
                add("smaller_request_with_practical_context", x.observations(ep.id, ["M20", "M21", "D21"]), status="reported_structure")
            if opts & {"D21.visible", "D18.need"}:
                add("visible_need_vulnerability_theme", x.observations(ep.id, ["M20", "M21", "D21", "D18"]),
                    missing=("distinct_vulnerable_part", "developmental_origin"))
        for code, options in [
            ("words_unavailable_reported", {"D30.stuck", "D34.words", "D11.words"}),
            ("chosen_silence_reported", {"D30.choose", "D34.choice"}),
            ("limited_energy_reported", {"D30.tired", "D34.tired", "M25.exhaust"}),
            ("felt_distance_reported", {"D34.far"}),
            ("functioning_without_ease", {"M12.function"}),
            ("choice_return_reported", {"M14.choice", "D35.choice", "D10.control"}),
            ("reassurance_did_not_last_without_new_event", {"D45.return"}),
            ("repair_had_helpful_effect", {"M24.helped"}),
            ("ordinary_autonomy_aim", {"D46.own", "D46.control"}),
            ("ordinary_ambivalence", {"D12.ordinary", "D12.both"}),
            ("no_hidden_want_reported", {"D17.none"}),
            ("no_exposure_difficulty_reported", {"D18.none", "D21.none"}),
            ("actual_resource_shortage_reported", {"D64.short"}),
        ]:
            selected = [o for o in all_obs if o.option_id in options]
            if selected:
                add(code, selected, status="reported_structure")
        if "M13.quiet" in opts and "M14.choice" in opts:
            add("choice_return_following_later_reduced_input", x.observations(ep.id, ["M13", "M14"]), status="reported_structure")
        if opts & {"D12.cost", "D12.switch"} and "actual_simultaneous_wants" in x.flags_for(ep.id):
            add("opposing_wants_obstruct_each_other", x.observations(ep.id, ["M26", "M27", "D12"]), missing=("distinct_protector_entities",))
        if ep.family == "exception":
            add("available_capacity_example", x.observations(ep.id, ["M28", "M29", "M30"]), status="reported_structure")
        if ep.family == "known_delay" and ep.linked_from and ep.linked_from in ep.distinct_from:
            if opts & {"D42.fine", "D42.miss", "D42.practical"}:
                prior = x.observations(ep.linked_from, ["M17", "M18", "M19", "D43", "D44"])
                if prior:
                    add("known_distance_counterexample", prior + x.observations(ep.id, ["D42"]),
                        scope="contrasted_occurrences", missing=("causal_exclusivity",))
        for o in all_obs:
            if o.item_id == "D57":
                a = h.administrations[o.administration_id]
                linked = [z for eid in a.comparison_ids for z in x.action(eid)]
                code = "matched_action_reported_same_job" if o.option_id == "D57.same" else "matched_action_function_not_identical_or_unresolved"
                add(code, linked + [o], scope="contrasted_occurrences")
            if o.option_id in {"D58.absent", "D58.after", "D58.other"}:
                a = h.administrations[o.administration_id]
                add("candidate_trigger_counterexample", [z for eid in a.comparison_ids for z in x.action(eid)] + [o], scope="contrasted_occurrences")

    seen_pairs: set[tuple[str, str]] = set()
    for b in s.episodes.values():
        for aid in b.distinct_from:
            if not x.actual(b.id) or not x.actual(aid):
                continue
            pair = tuple(sorted((aid, b.id)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            aa, ba = x.action(aid), x.action(b.id)
            if matched_behavior({o.option_id for o in aa}, {o.option_id for o in ba}):
                add("action_recurs_in_confirmed_distinct_events", aa + ba, scope="two_distinct_occurrences",
                    missing=("same_function_unless_separately_supported",))
                aims = x.observations(aid, ["M03", "D02", "D09"]) + x.observations(b.id, ["M03", "D02", "D09"])
                stops = x.observations(aid, ["D04"]) + x.observations(b.id, ["D04"])
                if len({o.occurrence_id for o in stops}) == 2:
                    add("converging_function_material_available", aa + ba + aims + stops,
                        scope="two_distinct_occurrences", missing=("writer_must_evaluate_competing_functions",))
            # The converging route does not demand a preselected conscious aim.
            # Repeated action/urgency/temporal handoff/effect are material for the
            # writer to consider, not a deterministically declared firefighter.
            sequences = []
            for eid in pair:
                values = x.options(eid)
                edges = [g for g in s.edges if g.occurrence_id == eid and g.relation == "before" and g.to_step == "next"]
                if {"D11.urgent", "D10.relief"} <= values and edges and x.action(eid, "next"):
                    sequences.extend(x.observations(eid, ["D61", "D07", "D08", "D09", "D10", "D11"]))
            if len({o.occurrence_id for o in sequences}) == 2 and matched_behavior(
                    {o.option_id for o in x.action(aid, "next")}, {o.option_id for o in x.action(b.id, "next")}):
                add("repeated_reactive_relief_sequence_material", sequences,
                    scope="two_distinct_occurrences", missing=("stated_function_may_be_unknown", "writer_must_evaluate_alternatives"))
    # Rejecting an interpretation preserves the reported actions but withdraws
    # its derived support. Never turn disagreement into evidence of resistance.
    affected_codes = {
        "function": {"preventive_function_support", "reactive_relief_function_support", "preventive_to_relief_handoff_support"},
        "prediction": {"preventive_function_support", "preventive_to_relief_handoff_support"},
        "contact_function": {"relationship_scoped_contact_concern", "mixed_contact_meanings"},
        "attachment_meaning": {"relationship_scoped_contact_concern", "mixed_contact_meanings"},
        "predicted_response": {"visible_need_vulnerability_theme"},
        "need_exposure": {"visible_need_vulnerability_theme"},
        "vulnerable_meaning": {"visible_need_vulnerability_theme"},
        "sequence_relation": {"preventive_to_relief_handoff_support", "repeated_reactive_relief_sequence_material"},
        "goal_change": {"reactive_relief_function_support", "preventive_to_relief_handoff_support"},
        "next_effect": {"reactive_relief_function_support", "preventive_to_relief_handoff_support", "repeated_reactive_relief_sequence_material"},
        "recurrence": {"converging_function_material_available", "repeated_reactive_relief_sequence_material"},
    }
    for target in s.targets.values():
        if target.id not in h.rejected_targets:
            continue
        affected = affected_codes.get(target.target_id, set())
        findings = [replace(f, status="respondent_disputed", missing=tuple(sorted(set(f.missing) | {"respondent_disagrees_with_interpretation"})))
                    if f.code in affected and target.occurrence_id in f.occurrence_ids else f for f in findings]
    unique = {f.id: f for f in findings}
    s.findings = [unique[k] for k in sorted(unique)]
    return s.findings
