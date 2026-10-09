# Independent routing review handoff

## Review request

Review the exact Gate 10 candidate commit named in `source-hash-manifest.json` from an isolated, read-only checkout. Derive findings from the pinned question contract, router/session/packet source, raw fictional response records, and the retained qualification outputs. Do not assume the implementation team's verdicts. Challenge the existing tests and identify missing counterexamples. Return `PASS`, `FAIL`, `PARTIAL`, or `UNREVIEWED` for each requested capability, with source locations, reproductions, and reviewed content hashes.

This handoff is a request for technical review. It is not a qualification receipt, human signature, spending authorization, or activation approval.

## Scope and pins to verify

- Candidate commit and tree: see `source-hash-manifest.json` (baseline `8dd192a7076ae535b90f340a778d915a8a2338bd`).
- Question release `PWQE-5.1.0-candidate.1`; question source SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`; question source-manifest SHA-256 `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Router runtime SHA-256 `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`.
- PWRP 7.1 report-source manifest SHA-256 `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- v5 replay manifest SHA-256 `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`.
- Semantic case bytes SHA-256 `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d`.
- Exact packet and request digests: `source-hash-manifest.json` and `provider-preflight/c01-c02-ifs-no-dispatch-current.json`.

The v5 replay artifacts are fictional, retained inputs. Their manifest records their historical source commit; the candidate must not represent them as sessions newly executed by this runtime.

## Required adversarial questions

1. Are source contracts complete enough to define the relevant behavior?
2. Are router outputs consistent with those contracts, including same-topic/different-event, `different`/`same`/`unknown`/`no_event`/`skip`, and replay rejection paths?
3. Is occurrence, target, step, sequence, correction, and currentness lineage correct end to end?
4. Can practical alternatives and negative cases remain valid without a default psychological interpretation?
5. Do strict parity omissions materially undermine report evidence, and where is a production-only source-contract oracle adequate?
6. Are packet validation and the PWRP 7.1 adapter bound to the actual current response and D36 selected partial order?
7. Which defects or coverage gaps block a C01 IFS diagnostic?
8. What exact source, fixture, packet, and wire-body hashes were reviewed?

Review at least C01/C02, C07 replay binding, C08/C09 return versus no return, C10 D36 ordering and correction/currentness, C11 company/aftermath, C12 separate D42 occasion, C15/C16 encouragement/permission, plus the mutation tests for recomputed packet digests and cross-process attempt locking.

## Relevant material

- `specs/patternwork/question-engine-v5.1/assessment_runtime/`
- `lib/server/assessment/pwqe51-router.ts`
- `lib/server/assessment/pwqe51-session.ts`
- `lib/server/reports/pwqe51-packet.ts`
- `lib/server/reports/pwrp71-adapter.ts`
- `lib/server/reports/qualification/attempt-store.ts`
- `lib/server/reports/qualification/semantic-evidence-verifier.ts`
- `qualification/pwrp71/SEMANTIC_CASES.json`
- `qualification/pwrp71/constructed_histories_v2/`
- `qualification/pwrp71/route_replays_v5/`
- `qualification/pwrp71/gate10-routing-budget-readiness/packet-verification/`
- `qualification/pwrp71/gate10-routing-budget-readiness/routing-parity-current/`
- `qualification/pwrp71/gate10-routing-budget-readiness/verification/`

## Reviewer record

Record reviewer identity, date, isolated checkout commit, exact reviewed source/packet digests, decision, scope limits, and signature/receipt mechanism. If this is an agent-only technical review, say so explicitly; it cannot satisfy an external human authorization or install the qualified routing receipt.
