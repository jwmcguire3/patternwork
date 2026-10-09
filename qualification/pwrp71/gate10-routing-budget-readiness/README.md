# Gate 10 — routing and budget readiness

**Decision: BLOCKED ON EXTERNAL REVIEW OR AUTHORIZATION.** The candidate binds current PWRP 7.1 packet evidence, journals each qualification attempt before dispatch, blocks unbudgeted PWRP 7.1 OpenRouter dispatch, requests usage metadata, and prepares C01/C02 wire requests without sending them. No provider request was sent, the preflight did not read an API key, no qualification or activation receipt was created, and production activation is unchanged.

## Verified candidate

- Starting revision: `8dd192a7076ae535b90f340a778d915a8a2338bd` (`codex/pwrp71-semantic-evidence-v5`).
- Working branch: `codex/pwrp71-gate10-routing-budget-readiness`.
- Implementation candidate: `bbd357322191364d2b2e0306a8b7f9f76ca2c267`.
- Qualification evidence package: `c298205` (full v5 offline artifacts, final command receipts, parity outputs, no-dispatch preflight, and independent technical review).
- Question release/source: `PWQE-5.1.0-candidate.1`; source SHA-256 `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`; source-manifest SHA-256 `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Report release/manifest: `PWRP-7.1.0-candidate.1`; manifest SHA-256 `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- Semantic cases: 14 cases; raw file-byte SHA-256 `aadc23bbcd8efb180fbccbe54f127024c7b4ea5593b60ca18afb5d4baaa0c819`; LF-normalized digest `fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d`.
- v5 replay input manifest SHA-256: `17b1c8cd9e43f0d647733e0408e5e663490da52e261e8124df9243181512b19f`; original fixture commit `e3cb96593bd232f346cb561cda98b4d4c863a4cb`.
- Candidate model remains `openai/gpt-6-luna`, reasoning `max`.

The retained v5 corpus is historical fictional input. This candidate does not claim those artifacts were newly routed under the updated runtime. v2–v5 source fixtures and canonical question/report contracts are unchanged.

## Current results

- Full test suite: **406 passed, 0 failed**. Typecheck and changed-file ESLint passed.
- Production build passed in the workspace-access retry; the default sandbox attempt is retained and failed because SWC could not canonicalize the OneDrive path under access restrictions.
- Current v5 packet audit: **25/25 profiles and 100/100 MAP, IFS, PV, ATT packets** passed.
- Current v5 offline matrix: **125/125 structural mock outputs accepted**, 250 completed mock attempts, 25 same-profile synthesis prerequisite sets, zero cost/tokens. Drafts are `insufficient_evidence`; this does not establish report quality.
- Normal parity: exit 0, `completed; not a parity-pass assertion`.
- Strict parity: exit 1, `incomplete_unsupported_coverage`; 893 overlapping unsupported surfaces and zero unexplained differences among compared surfaces.
- C01/C02 IFS no-dispatch preflight: two exact requests prepared, status `BLOCKED`, `dispatchPerformed=false`, zero provider calls, and `apiKeyRead=false`. The $0.115 per-call / $1.50 pair-run values are an unapproved cap proposal.
- Independent routing review: a fresh isolated agent review of the exact candidate returned **PARTIAL** for capabilities A–E. It supports only narrow technical conclusions; no authenticated routing-qualification receipt was issued. See [the independent review record](independent-review/bbd3573-independent-technical-review.md).
- Provider compatibility: untested against an authenticated endpoint. Per-call charge containment is provider-dependent, not a guaranteed invoice ceiling. No real generation, report-quality review, human approval, or activation occurred.

## Evidence map

- [Baseline reproduction](baseline/reproduction.md)
- [Independent reviewer handoff](independent-review/reviewer-handoff.md)
- [Prior v5 independent technical findings](independent-review/v5-review.md)
- [Current strict-parity gap ledger](routing-parity-current/gap-ledger.md)
- [Provider billing and budget assumptions](budget/provider-billing-assumptions.md)
- [Cap-bound C01/C02 no-dispatch requests](provider-preflight/gate10-c01-c02-ifs-no-dispatch-cap-proposal-1500000-20261009-r2.json)
- [Current v5 source-to-packet verification](packet-verification/v5-gate10-final.json)
- [Current v5 offline run](v5-offline-run-gate10-final/gate10-post-budget-current-v5-full-matrix-20261009/run.json)
- [Current command results](verification/command-results.md)
- [Release gate ledger](release-gate-ledger.md)
- [Source and evidence hash manifest](source-hash-manifest.json)

The release decision remains **BLOCKED ON EXTERNAL REVIEW OR AUTHORIZATION**. The next actions are a fresh independent review that can issue a legitimately authenticated scoped routing receipt, an explicit human per-call and aggregate spend authorization, and an external provider-account/key spending guardrail before any live request.
