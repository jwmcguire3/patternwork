# PWQE 5.1 reference coverage and qualification

The parity audit keeps cross-engine comparisons separate from source-bound contract qualification. It reports an incomplete strict result whenever an applicable surface has no independent reference behavior; an empty mismatch list alone is not a parity pass.

## D41 / `body_detail`

The immutable controls source authorizes D41 through `config.topics`. Python `targets.py::_entry_targets` currently enumerates `config.focus_topics`, so the Python reference does not independently reproduce this authored permission path. The package itself is unchanged.

`REFERENCE_EXTENSIONS.json` is a separately authored, source-manifest-bound contract fixture. Its seven cases qualify topic authorization, rejection without an actual episode, admission and priority for a bound actual episode, ordering behind a tier-three comparison, answer retention, skip missingness, and correction supersession. The tests label this as contract-based qualification, not Python/TypeScript parity.

The original 25 fixtures remain intact. A second collector run removes `body_detail` from both topic and focus permissions and applies only the three documented M10 option adapters required by the immutable authored bank. This opt-out cohort replays all 25 plans and records 591 selection snapshots. It has no D41 candidate rows, no shared-prefix candidate/choice mismatches, and no shared post-response target-transition mismatches. The 11 entry-point pseudo-target rows recur exactly within the existing exception list; all other projection differences are zero.

## Selection and state coverage

The original 25-plan replay compares 610 ask decisions on shared route prefixes. Candidate identity, eligibility, target, priority, selected question/occurrence, and accepted-response target transitions have no shared-prefix mismatch. The current route outcomes also include focused tests for distinct/same/unknown binding results, skip/no-event closure, `mapping_ready` ordering, decision and administration budgets, correction dependency invalidation, and candidate rejection causes.

The TypeScript compile selector does not implement Python's `REPLAY` operator. In the opt-out cohort, the first unsupported selected action remains at P01 ordinal 20, P09 ordinal 23, and C07 ordinal 20. The original replay includes 17 Python and 89 TypeScript REPLAY rejection rows; they are reported as unsupported coverage, excluded from equality comparisons, and never counted as parity evidence. Python `bind` and `mapping_ready` are also not one-to-one TypeScript actions. Post-target snapshots without an accepted response prefix remain unsupported.

The 11 entries in `EXCEPTIONS.json` apply only to exact target-state pseudo-row keys whose IDs are present in the immutable `entry_points` ontology and absent from its target ontology. The audit verifies their complete exact scope in both the original and opt-out cohorts. They do not excuse candidate, route-choice, or non-entry target differences.

## Current strict status

The strict run reports zero unexplained differences and zero shared-prefix route or target-transition mismatches. It exits nonzero with `incomplete_unsupported_coverage`, because Python/TypeScript behavior is still not independently comparable for the REPLAY selector, bind and `mapping_ready` controls, Python entry-point candidates, and the listed post-target/control rows. `full_applicable_parity_established` therefore remains false. The strict gate must stay non-passing until those relevant reference surfaces are implemented or independently qualified with explicit reviewable contracts.
