# Gate 10 release gate ledger

| Gate | Status | Evidence / limitation |
|---|---|---|
| Source and fixture integrity | **PASS** | Starting v5 commit verified; canonical question/report sources and v2-v5 fixtures unchanged. New outputs pin current runtime separately. v5 source commit remains historical. |
| Functional router verification | **PARTIAL** | Current packet-builder/adapter lineage, correction attempts, D36 sequence semantics, and 25 retained fictional profiles exercised. One legacy C10 candidate packet archive is rejected for D36 observation/edge order mismatch; it remains a pending, noncanonical archive. Broader production integration is not qualified. |
| Independent routing review | **PENDING** | Separate agent review of v5 baseline found two packet defects, now fixed with regression tests. Fresh candidate review is requested after commit. No signed human/qualified routing receipt is present. |
| Strict cross-engine parity | **INCOMPLETE** | Exit 1; 893 overlapping unsupported surfaces, 0 unexplained differences among compared surfaces. See current gap ledger. |
| Per-call monetary enforcement | **PROVIDER-DEPENDENT** | Locally preflights full serialized request using the pinned context/output quote and sends OpenRouter `max_price`. There is no request-total USD limit or local control over provider billing discrepancies, pricing changes, reasoning accounting, or unreported charges. Post-call overrun detection happens after spend. |
| Aggregate budget and reservations | **PASS for one run journal** | Separate explicit positive per-call and aggregate values required live; atomic durable reservation and per-run lock; started/unknown costs remain reserved; concurrent process lock test passes. This is not a provider-account-wide quota. |
| Crash/retry spending containment | **PASS for journaled request outcomes** | Completed attempts replay without a second call. Started/unknown, timeout, HTTP 503 uncertainty, missing usage, and post-response receipt interruption retain reservation and do not auto-retry. Stale locks fail closed and require manual recovery. |
| Provider request preflight | **BLOCKED** | C01/C02 exact request bodies prepared; no dispatch, no API-key read, no caps, no routing receipt, no spend authorization. |
| Actual provider compatibility | **UNTESTED** | Current public model/schema/cache docs were checked; no authenticated metadata or request was sent. |
| Real report generation | **NOT RUN** | No paid provider call. |
| Semantic report evaluation | **PENDING** | Offline outputs are empty `insufficient_evidence` mock drafts. |
| Human approval | **PENDING** | No human semantic review, spend authorization, or approval receipt. |
| Production activation | **UNCHANGED** | No activation manifest or production changes. |

## Decision

**BLOCKED ON EXTERNAL REVIEW OR AUTHORIZATION.** Code, tests, offline evidence, and no-dispatch requests are prepared. Provider-dependent billing means the local quote is not an invoice guarantee; the first real request additionally requires independent source-bound review and explicit spending authority.

## Exact external actions before the first C01 IFS request

- A fresh reviewer must examine the committed candidate in an isolated read-only checkout, inspect actual source and packet evidence, and issue a bounded source/packet-bound routing receipt through the existing trust mechanism if they find qualification justified. An agent technical review by itself does not authorize live spend.
- The account owner must state an explicit positive `maxCallCostMicros` and `aggregateCostCapMicros` for the C01 run, accepting that each review/repair attempt is independently reserved. Re-run the cap-bound preflight and verify its fingerprint.
- The account owner must then explicitly authorize the specific diagnostic-only C01 IFS live run after provider docs/price and account credit fee state are rechecked. Do not infer this authorization from this commit, preflight, or Gate 10 status.
