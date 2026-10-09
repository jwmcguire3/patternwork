# Independent routing and budget review handoff

## Exact review target

Review implementation candidate commit `bbd357322191364d2b2e0306a8b7f9f76ca2c267`, tree `ab7e1fa50a99af414db79213b7f5e966d9f9b32e`, in the isolated managed checkout. Do not rely on or modify the implementing worktree. Verify the commit, tree, and file hashes before review. The review target is this committed code; subsequent evidence/documentation commits do not change it.

Derive findings from the authored contracts and source. Do not treat the implementation team's gate ledger, test names, previous scoped D36 review, or reported passes as assumed conclusions. Challenge tests with counterexamples and inspect representative raw response and packet records. Record exact source locations, reproductions, and hashes. Do not make provider calls, read provider credentials, create/alter a qualification receipt, or commit changes.

This is a request for a technical review. A model-generated or agent review does not by itself establish human authorization, signed attestation, provider-spending permission, or production activation.

## Pins and fixtures

- Baseline v5 commit: `8dd192a7076ae535b90f340a778d915a8a2338bd`.
- Question release/source: `PWQE-5.1.0-candidate.1`; source SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`; source-manifest SHA-256 `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Router runtime SHA-256: `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`.
- PWRP 7.1 report-source manifest SHA-256: `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- v5 replay manifest SHA-256: `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`.
- `SEMANTIC_CASES.json`: exact file-byte SHA-256 `aadc23bbcd8efb180fbccbe54f127024c7b4ea5593b60ca18afb5d4baaa0c819`; LF-normalized digest `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d`.
- Exact C01/C02 packet and wire-body digests are in `provider-preflight/gate10-c01-c02-ifs-no-dispatch-cap-proposal-1500000-20261009-r2.json`.
- Current full v5 packet audit: `packet-verification/v5-gate10-final.json`.
- Current full v5 offline matrix: `v5-offline-run-gate10-final/gate10-post-budget-current-v5-full-matrix-20261009/`.
- Current normal/strict parity results: `routing-parity-gate10-final/summary.json`, `normal.result.json`, `strict.result.json`.

The v5 fixtures are historical fictional source input, not sessions newly executed under this candidate. The review should not infer qualification from 25 completed routes or 125 mock report results.

## Requested verdicts

Return `PASS`, `FAIL`, `PARTIAL`, or `UNREVIEWED` for each independent capability below, with scoped evidence and residual limits:

### A. Occurrence integrity

- New occurrence identifiers originate from the server.
- Same topic does not imply the same event; repeated questions for one event do not prove independent recurrence.
- Distinct occasions require the permitted explicit respondent confirmation.
- `same`, `unknown`, `no_event`, and `skip` do not create confirmed-distinct comparisons.
- Correcting a replay decision invalidates dependent comparisons.

### B. Routing and target lifecycle

- Outward action is not automatically labeled protective.
- Practical alternatives may close psychological targets; closed targets emit no follow-up candidate.
- Missingness does not strengthen a hypothesis; counterexamples can narrow or overturn it.
- Priority and stopping rules are finite and deterministic.

### C. Corrections and currentness

- Superseded answers do not support active target conclusions.
- Parent corrections invalidate dependent descendants while unrelated observations survive.
- Resume/replay cannot restore stale interpretations.
- Report packets use current, canonical evidence, not historical superseded evidence.

### D. Sequence and comparison integrity

- Sequence observations remain bound to the right occurrence and step; overlap does not become succession and unknown order remains unknown.
- D36 preserves only its explicitly selected partial order and actual selection order.
- C07 D56/D57/D77 comparisons use the respondent-confirmed pair.
- C08 return and C09 genuine-ending evidence remain distinguishable.
- C12's known-delay occasion remains separate from the original delayed-message event.

### E. Completion and packet release

- Mapping and Deepening completion follow authored readiness/stopping contracts.
- A completed report packet binds to current session/source state.
- Invalid/stale packets and references whose live source was removed fail closed.
- Inspect canonical snapshot response evidence through production workflow and PDF boundaries.

### F. Provider dispatch and budgets

- Enumerate every normal, debug, qualification, reviewer, repair, and escalation provider dispatch path.
- Confirm an actual PWRP 7.1 network call requires a one-use authorization only issued after a durable journal reservation.
- Challenge exact outgoing-body matching, endpoint/model/prompt/schema/pricing/cap fingerprint binding, unknown-cost reservations, recovery, and concurrent budget consumption.
- Clearly distinguish locally enforced per-run reservations from provider-dependent billing and any estimate-only ceiling.

## Required overall questions

1. Are the source contracts complete enough to define report-material behavior?
2. Are router outputs consistent with those contracts?
3. Is evidence lineage correct across controlled replay and correction?
4. Can negative alternatives remain valid conclusions without default psychological interpretation?
5. Do the remaining strict parity omissions materially undermine report correctness? Is a source-contract oracle adequate for each production-only capability?
6. Does independent evidence justify a scoped or full routing qualification?
7. What exact defects, missing receipts, compatibility checks, or human actions block the first C01 IFS diagnostic?
8. What exact source, fixture, packet, request-body, and attempt-contract hashes were reviewed?

At minimum inspect C01/C02, C07 replay binding, C08/C09 ending contrast, C10 D36 order/correction, C11 company/aftermath, C12 separate D42 occasion, and C15/C16 encouragement/permission. Inspect raw route response and packet records, not only summary evidence. Challenge packet rehash/mutation tests and attempt-store process-race tests.

## Reviewer record

Record reviewer identity and role, date, isolated checkout path, exact candidate commit/tree, reviewed source/fixture/packet/body digests, per-capability decision, source locations, reproductions, limitations, and the mechanism (if any) that authenticates the decision. If this is only an agent technical review, label it as such; it cannot substitute for a trusted human qualification receipt, spend authorization, or activation approval.

The fresh scoped agent technical review of `bbd3573` is retained in [bbd3573-independent-technical-review.md](bbd3573-independent-technical-review.md). Its A–E findings are PARTIAL; a trusted qualification receipt remains outstanding. The report also identifies that the current routing-evidence validator checks identity digests but has no reviewer signature/key authentication. It proposes an additive, deployment-trusted signature check without creating or accepting a qualification receipt.
