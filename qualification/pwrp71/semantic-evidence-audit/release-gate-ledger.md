# Gate 9 release ledger

| Gate | Status | Evidence |
|---|---|---|
| Fixture source validity | Pass | v2, v3, and v4 protected hashes verified; v5 manifest `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f` and experimental permission variant pinned |
| Full-session execution | Pass | 25/25 v5 profiles completed Mapping and Deepening using the production lifecycle |
| Semantic evidence coverage | Full | CQ01–CQ14 supported by current source-bound v5 observations; v4 CQ08–CQ10 were unreachable, and v4 writer packets did not distinguish synthetic from original answers |
| Packet and adapter validation | Pass | 25/25 profile MAP and Deepening packets/adapters pass; packet provenance and source-to-packet verifier have zero failures |
| Independent routing qualification | Incomplete | Strict parity remains `incomplete_unsupported_coverage` with 893 unsupported surfaces; no reviewed routing qualification manifest is pinned |
| Offline report structure | Pass | Run `pwrp71-v5-provenance-full-20261008-cap5usd`: 125/125 deterministic mock results accepted, zero validation issues, zero reported cost; drafts are empty `insufficient_evidence` placeholders |
| Real provider generation | Not run | No authorized monetary cap, no separate per-call ceiling, and required independent routing evidence remains outstanding |
| Independent semantic review | Pending | No genuine provider reports or external reviewer receipts exist |
| Human approval | Pending | No approval manifest exists |
| Production activation | Unchanged | No activation or deployment control was changed |

The v4 qualification ledger states that an offline run completed, but the supplied v4 fixture directory lacks its run and attempt receipts. Gate 0 retained a fresh explicit v4 reproduction under the audit package; v5 stores its current run, attempts, and report files. The first v5 preflight used an aggregate cap below the mock reservation estimate and made no calls; the next run completed after raising the offline simulation cap. See [the v4 reproduction summary](v4-offline-baseline-summary.md) and [v5 offline summary](offline-run-summary.md).

The authoritative machine-readable gate state is in [release-gate-ledger.json](release-gate-ledger.json). The source-to-packet evidence is in [claim-evidence-audit.json](claim-evidence-audit.json) and the full [coverage matrix](coverage-matrix.md).

Actual final command results and exit codes are recorded in [final-verification/command-results.json](final-verification/command-results.json), with the corresponding console outputs in the same directory.
