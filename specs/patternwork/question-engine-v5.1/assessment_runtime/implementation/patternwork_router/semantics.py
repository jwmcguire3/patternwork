"""Authored literal-choice policies. No NLP, intensity score, or universal A-F map."""
from __future__ import annotations

# An action can have a semantic match without being the same psychological function.
BEHAVIOR_GROUPS = {
    "rehearsing": {"M02.rehearse", "D54.rehearse"},
    "checking_again": {"M02.recheck", "M04.check"},
    "checking_for_update": {"M15.check", "M17.check"},
    "explaining": {"M04.explain", "D55.explain", "D61.explain"},
    "ending_exchange": {"D07.leave", "D55.end", "D61.leave"},
    "speaking_less": {"D55.quiet", "D61.quiet"},
    "absorbing_activity": {"M11.absorb", "M13.absorb", "M25.absorb", "D07.absorb", "D24.absorb", "D26.absorb"},
    "less_input": {"M11.quiet", "M13.quiet"},
    "request_minimizing": {"M20.small"},
    "downplaying_disclosure": {"D47.light"},
    "sending_again": {"M17.send"},
}
PRACTICAL = {
    "M03.requirements", "M03.no_aim", "M09.practical", "M09.status", "M16.practical", "M16.loss",
    "M18.info", "M19.information", "M21.practical", "M25.deadline", "D02.practical", "D03.real",
    "D16.consequence", "D16.unsafe", "D16.load", "D21.practical", "D43.information",
    "D46.own", "D46.control", "D48.privacy", "D48.timing", "D64.short", "D64.information",
}
RELATIONAL = {"M18.upset", "M18.matter", "M18.depend", "M19.ease", "M19.inspect", "D43.okay", "D43.notice", "D45.return", "D45.words", "D45.disbelieve"}
PREVENTIVE = {"M03.exposure", "D02.prevent", "D15.prevent", "D15.before", "D49.worse"}
RELIEF_AIMS = {"M03.relief", "D02.feel", "D09.relief", "D25.break", "D46.feeling", "D49.pressure"}
RELIEF_EFFECTS = {"M06.break", "M12.relief", "M12.away", "M14.brief", "D10.relief", "D10.away", "D59.relief"}
CAPACITY_LIMIT = {"D11.words", "D11.stuck", "D30.stuck", "D30.tired", "D34.words", "D34.tired", "D34.far"}
EXPOSURE = {"M21.burden", "M21.refusal", "M21.owe", "M22.minimize", "M22.mixed", "D02.visible", "D18.need", "D18.hurt", "D18.anger", "D18.uncertain", "D18.want", "D21.visible", "D21.need", "D21.no", "D21.receive"}
NEED_LIMITED = {"M20.small", "M20.hint", "M20.justify", "M20.wait", "M20.none", "M22.minimize"}
UNKNOWN_OPTIONS = {"D05.cannot", "D06.unclear", "D11.unclear", "D16.unclear", "D19.none", "D25.unclear", "D29.unclear", "D33.uncertain", "D43.automatic", "D49.unclear", "D57.unclear", "D58.unclear"}
ABSENT_OPTIONS = {"D07.nothing", "D07.changed", "D17.none", "D18.none", "D20.none", "D21.none", "D23.no_trial", "D35.none", "D60.no_rest", "D04.continued"}

# A narrowly scoped interpretation candidate cannot override these observed alternatives.
ORDINARY_ACTIONS = {"M02.bounded", "M02.none", "M04.fix", "M04.tell", "M04.continue", "M07.accept", "M08.limit", "M08.no", "M08.reduce", "M11.reduce", "M15.pause", "M15.other", "M17.other", "M17.wait", "M20.ask", "M23.apology", "M23.practical", "M25.stop", "M25.deadline", "D62.ask", "D62.later", "D62.mix"}


def matched_behavior(a: set[str], b: set[str]) -> str | None:
    same = a & b
    if same:
        return sorted(same)[0]
    for group, ids in BEHAVIOR_GROUPS.items():
        if a & ids and b & ids:
            return group
    return None
