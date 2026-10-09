# Current strict parity and deduplicated coverage gaps

The current normal parity command exited 0 with `completed; not a parity-pass assertion`. The strict command exited 1 with `incomplete_unsupported_coverage`, **893 overlapping unsupported comparison surfaces**, and zero unexplained differences among compared surfaces. These are additive surface counts, not 893 unique rows or defects. The full outputs and exit receipts are adjacent JSON/log files; the machine summary is `strict-parity-gap-ledger.json`.

## Root-cause grouping

| Root cause | Comparison surfaces | Count(s) | Effect and evidence boundary |
|---|---|---:|---|
| Comparator normalization incomplete | Python binding controls vs TypeScript session decisions; Python `mapping_ready` controls vs TypeScript pass transitions | 32; 25 | Can affect event binding and pass completion. Selected source-contract cases and the full fictional v5 routes are useful independent-of-router checks but do not make these surfaces cross-engine comparable. |
| Python reference intentionally lacks production-only behavior | TypeScript entry-point candidates, choices, and finishes; replay candidate and rejection comparisons; post-target entry-point pseudo-rows | 189, 28, 23; 88; 17 Python + 17 TypeScript; 255 | These outputs do not have equivalent Python production derivations. Entry/replay choices directly affect which observations reach reports. The seven D41 contract cases and C07 controlled-replay path cover selected behavior only. Full Python parity requires a new reference oracle; do not synthesize matching Python outputs. |
| Production behavior lacks an adequate source-contract oracle | Opt-out cohort replay/control surfaces; post-target rows without an accepted response transition; other finish rows after divergence/outside policy | 144; 50; 25 | Affects route selection, stopping, or response transitions. Selected source gates/target cases and current implementation tests exist, but their breadth does not fully define these omitted decisions. |
| Genuine mismatch observed | No unexplained mismatch among current strict comparable surfaces | 0 | This reports only the surfaces that were comparable; it is not evidence for omitted behavior. |
| Structurally impossible to compare without a new oracle | Production-only entry/replay/entry-point outputs with no reference counterpart; pseudo-rows without a response transition | Overlaps above | A source-contract oracle or a new equivalent reference behavior is required. Current focused contract tests cannot be used to relabel the strict parity gate as passed. |

The source categories overlap. Their counts sum to the strict audit's 893; they must not be added again across root-cause groupings. No comparison was deleted, no exception scope was enlarged for the purpose of passing, and no unsupported behavior was defined as success.

## Capability-specific status

| Capability | Python/reference parity | Independent source-contract evidence | Current implementation checks | Status for report evidence |
|---|---|---|---|---|
| Occurrence creation and binding | Partial | Selected `different`/`same`/`unknown`/`no_event`/`skip` and forged-scope contracts | 25 current v5 packets pass response/occurrence/step/provenance checks | Partial; no complete live persistence/browser path qualification |
| Replay confirmation and attached children | No complete Python equivalent; replay candidate/rejection surfaces unsupported | Original C07 confirmed-different replay path | C07 and retained selected routes; not every replay/rejection result | Partial; do not generalize C07 |
| Distinctness alternatives | Partial | Explicit outcome contracts; only confirmed `different` yields a distinct pair | C07 pair lineage, negative-control checks | Partial across all outcomes through correction and storage |
| Target lifecycle and stopping | Entry-point behavior mostly unsupported; some control/transition normalization gaps | Selected target/source-contract cases | Selected transitions and packet references checked | Partial; can change included questions/evidence |
| Corrections/currentness | Comparator incomplete after divergence | Selected correction guards | Supersession, invalidation, active attempts, and stale packet tests | Partial end-to-end |
| Sequence and step lineage | Python parity not adequate for packet sequence semantics | D36 ordered selection and C07 selected cases | D36 direction/relation plus all v5 packet sequence lineage checked | Partial independent breadth; current mutation regression rejects rehashed tampering |
| Mapping/Deepening completion | Mapping readiness controls unnormalized; terminal behavior incomplete | Selected completion boundaries | 25/25 retained v5 routes and current offline run | Partial beyond the fictional cohort |
| Packet currentness/adapter | Not applicable to Python router | Contract verifier over retained source/options | 25/25 profiles, 100/100 packet adapters | Pass for retained v5 fictional packets; not report quality |

## Independent evidence boundary

The machine source-contract suites and the 25-profile packet verifier were authored within this implementation workstream. A separate agent reviewed the v5 baseline and found material packet defects; the current code fixes are awaiting a fresh isolated review against this runtime. Agent review is technical evidence, not human approval. Strict cross-engine parity remains incomplete; overall routing qualification remains unqualified.
