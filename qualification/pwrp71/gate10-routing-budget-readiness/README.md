# Gate 10 — routing and budget readiness

**Decision: BLOCKED ON EXTERNAL REVIEW OR AUTHORIZATION.** Gate 10 implemented source-bound no-dispatch preparation and local per-run budget reservations, corrected packet lineage validation findings, and reran the v5 offline matrix. No provider request was sent, no API key was read by preflight, no approval manifest was created, and production activation is unchanged.

## Verified candidate

- Starting revision: `8dd192a7076ae535b90f340a778d915a8a2338bd` (`codex/pwrp71-semantic-evidence-v5`), verified before implementation.
- Working branch: `codex/pwrp71-gate10-routing-budget-readiness`.
- Current router runtime SHA-256: `d08a7da2c6e3119c75e3e60917da42a60bbe6615024f901ac5b11ed26fa06d7d`.
- Question release/source: `PWQE-5.1.0-candidate.1`, `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`.
- Question source manifest SHA-256: `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Report release/manifest: `PWRP-7.1.0-candidate.1`, `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- Semantic case set: 14 cases; source bytes SHA-256 `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d`.
- v5 replay input manifest SHA-256: `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`; input commit recorded in that manifest: `e3cb96593bd232f346cb561cda98b4d4c863a4cb`.
- Candidate model: `openai/gpt-6-luna`, reasoning `max`; source policy is unchanged.

The retained v5 corpus is an input and remains unchanged. Its original generation commit is older than the current packet-builder runtime; the current packet verifier and current runtime pins are retained separately here. The preflight does not represent the old fixtures as newly routed sessions.

## Results

- Full test suite: **402 passed, 0 failed**. One initial run surfaced a stale C10 candidate-archive D36 ordering mismatch under the strengthened validator; that archived candidate is now explicitly expected to remain rejected and unqualified. The v5 current-packet audit passes.
- Typecheck: passed.
- Production build: passed after the default sandbox denied SWC workspace canonicalization; the initial failure and successful retry are both logged.
- Changed-file ESLint: passed with no diagnostics.
- Normal parity: exit 0, `completed; not a parity-pass assertion`.
- Strict parity: exit 1 as expected, `incomplete_unsupported_coverage`, 893 overlapping unsupported surfaces and zero unexplained differences among compared surfaces.
- Current retained v5 packet audit: **25/25 profiles and 100/100 MAP, IFS, PV, ATT packets** passed content-manifest, source-to-packet, provenance, lineage, privacy, sequence, and adapter checks.
- New v5 offline matrix: **125/125 structurally accepted mock outputs**, 250 mock attempts, zero cost/tokens, all drafts `insufficient_evidence`; route qualification remains pending.
- C01/C02 IFS no-dispatch preflight: two exact wire requests prepared; status `BLOCKED`, 0 provider calls, no API key read.
- Live generation, semantic report-quality review, human approval, and activation: not performed / pending / unchanged.

## Evidence map

- [Baseline reproduction](baseline/reproduction.md)
- [Independent reviewer handoff](independent-review/reviewer-handoff.md)
- [Prior v5 independent technical findings](independent-review/v5-review.md)
- [Current strict parity gap ledger](routing-parity-current/gap-ledger.md)
- [Provider billing and budget assumptions](budget/provider-billing-assumptions.md)
- [Exact C01/C02 no-dispatch requests](provider-preflight/c01-c02-ifs-no-dispatch-current.json)
- [Current v5 source-to-packet verification](packet-verification/v5-current-contract-verification.json)
- [Current v5 offline run](v5-offline-run/gate10-v5-offline-full-matrix/run.json)
- [Current command results](verification/command-results.md)
- [Final release gate ledger](release-gate-ledger.md)

See the JSON hash inventory for exact digests of source pins, fixtures, packets, outputs, and logs.
