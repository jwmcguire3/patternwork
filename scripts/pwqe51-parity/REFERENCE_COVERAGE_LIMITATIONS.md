# PWQE 5.1 reference coverage limitations

The Python replay is an independent implementation for the behaviors it actually models. The parity report does not treat it as authoritative where its action or candidate surface is incomplete.

## Entry-point items

The production source keeps `entry_points` separate from its 92 target definitions. The TypeScript router exposes each selected entry point as a direct candidate. In particular, source item D41 is the `body_detail` entry point, and the controls contract says the optional detailed-body chip controls D41.

The Python candidate compiler's `_entry_targets` enumerates `config.focus_topics`; it does not generate the direct D41 candidate from `config.topics`. The TypeScript parity adapter maps the fixture's selected topics into topic opt-ins, so it can expose D41 where the Python candidate list does not. Those Python/TypeScript candidate and choice rows are counted as unsupported reference coverage, not as equality, a Python-authoritative failure, or an approved parity exception. A Python direct-entry route fixture/contract is needed before that behavior can be compared independently.

In the current 25-plan replay, this is the first uncomparable route choice in every plan (D41 / `entry:body_detail`, at the plan-specific ordinal in `ROUTE_SELECTION_DISCREPANCY_LEDGER.json`). The audit stops counting decisions as a shared trajectory there. It still records later rows as conditional diagnostics.

At the same time, Python emits `entry:<id>` as a target-resolution pseudo-row while the TypeScript source models entry points as candidates and has no equivalent target-state row. The eleven original pseudo-target rows are listed in `EXCEPTIONS.json`. This exception applies only to those target-state representation rows; it does not exempt candidate or question-selection comparisons.

## Other unsupported surfaces

- The Python replay selector can choose `REPLAY`; `compilePwqe51Route` has no equivalent action. The audit reports replay candidate rows and chosen replay actions separately.
- In P01 and C07, after the D41 route gap, Python later selects M03 from a `replay_attached` child target while TypeScript selects D57 from `contrast_goal`. This is a conditional downstream difference, not a shared-prefix mismatch; independent parity requires equivalent replay-attached behavior or a source-backed contract expectation for that route.
- Python emits explicit `bind` and `mapping_ready` actions. TypeScript represents occurrence binding as candidate metadata and phase selection, so these control actions do not map one-for-one.
- Python exposes candidate rejection reasons that `compilePwqe51Route` does not return.
- Post-response target states are compared on accepted-response prefixes. Collector control rows and transitions without an accepted response are reported as unsupported.
- After a selected question/occurrence divergence, later Python-prefix comparisons are conditional diagnostics. They are not counted as shared-route parity evidence.

Each compared ask row now retains the two implementations' eligible candidates, target IDs, priorities, focus and tie-break fields, selected candidate order, open target states and accepted-response target transitions. This makes the selected route and the evidence available to the selector inspectable. Python rejection-reason parity remains unsupported because the TypeScript compile API does not return rejected candidate diagnostics.

The TypeScript router promotes D08's sequence relation candidate to tier 1, matching the short episode-order clarification specified by routing priority §5 and implemented in the Python candidate compiler. This priority is a candidate-selection rule; it does not rewrite the source target's authored priority or any recorded answer.

The normal audit command reports these limits and diagnostics. `npm run pwqe51:parity:strict` exits nonzero on unexplained contract-relevant mismatches and also refuses a full-parity status while applicable independent reference coverage remains missing.
