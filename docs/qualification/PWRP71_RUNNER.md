# PWRP 7.1 runner operations and gate status

## Purpose and boundary

`npm run reports:qualify:pwrp71` runs the production PWRP 7.1 generator against source-pinned fictional fixtures. It uses `preparePwrp71Request`, the current PWRP 7.1 prompts and schemas, `generateCanonicalReport`, the production draft validator, reviewer, repair loop, and same-profile accepted-layer synthesis dependencies. It writes diagnostic qualification artifacts only; it does not deliver reports or activate a release.

Run commands from the repository root. By default, run records and review artifacts are written under `.qualification/pwrp71/<run-id>/`, which is ignored by Git. The command requires an explicit fixture profile, positive microdollar cost cap, and report selection for new runs. `ALL` selects MAP, IFS, PV, ATT, and SYNTHESIS; `DEEPENING` selects IFS, PV, and ATT.

## Commands

Offline structural run, using deterministic mock provider and reviewer results:

```powershell
npm run reports:qualify:pwrp71 -- offline --run-id offline-c01 --profiles C01 --reports ALL --cost-cap-micros 1000000
```

Live diagnostic run, only after the routing workstream provides final qualified PWQE 5.1 evidence for the selected profiles:

```powershell
npm run reports:qualify:pwrp71 -- live --diagnostic-only --run-id live-c01 --profiles C01 --reports ALL --cost-cap-micros 1000000 --routing-evidence .\route-qualification.json
```

The live mode requires `--diagnostic-only`, an explicit positive cap, the configured OpenRouter credential, and routing evidence matching the current question source, router runtime, release identity, and packet hashes. It blocks before provider dispatch when those checks fail. It is fixture-only and never sends or activates reports.

Inspect and resume a saved run; a live resume also requires explicit diagnostic permission:

```powershell
npm run reports:qualify:pwrp71 -- status offline-c01
npm run reports:qualify:pwrp71 -- resume offline-c01
npm run reports:qualify:pwrp71 -- resume live-c01 --diagnostic-only
```

Prepare human-review materials and compute the canonical digest of supplied semantic review evidence:

```powershell
npm run reports:qualify:pwrp71 -- review-package live-c01
npm run reports:qualify:pwrp71 -- semantic-digest .\semantic-review-evidence.json
```

The review package lists exact source and run pins, all selected outputs and paths, reviewer receipts, provider usage, cost, failed outputs, unresolved semantic cases, and pending checklist items. It contains no assumed reviewer identity or completed approval fields. Offline, blocked, partial, stale, or router-unqualified runs are marked ineligible.

After a completed, eligible live run, provide both machine-readable semantic evidence and the explicit approval input to validate the readiness contract or write a reviewed manifest:

```powershell
npm run reports:qualify:pwrp71 -- validate-approval live-c01 --approval .\approval.json --semantic-evidence .\semantic-review-evidence.json
npm run reports:qualify:pwrp71 -- manifest live-c01 --approval .\approval.json --semantic-evidence .\semantic-review-evidence.json --output .\reviewed-manifest.json
```

Manifest creation is local and does not activate production. Both commands reject evidence that does not bind to the exact run, output, source, fixture, prompt/schema/model settings, current router qualification, and explicit checklist. The approval command requires all 25 profiles, all five report types, complete actual provider usage, accepted outputs, fresh structural reviewer receipts, and complete semantic review evidence.

## Attempt and output records

Each provider attempt is journaled before dispatch with exact request and source fingerprints. Completed provider results and usage are persisted before returning. Replaying an identical completed call reuses its stored result. A started or unknown attempt is not automatically repeated; changing the request under an existing attempt identity is rejected. A run-level lock prevents concurrent mutation, and each dispatch checks the positive cost cap against reported plus reserved-unknown cost. Missing provider usage is represented as unknown usage rather than zero cost.

Run output includes the run record and hash, exact routing evidence when supplied, attempts, per-profile/report JSON artifacts and Markdown, and the pending review package/template. Candidate review receipts remain model outputs and are not human approvals.

## Current isolated-branch findings

The P01–P09 authored histories and C01–C16 packet archive bytes are source-pinned, but none is claimed routing-qualified here. The semantic case file is byte-pinned to the readiness contract. Current offline adapter replay finds `target_lineage` or `sequence_lineage` errors in P01–P09 and C03, C04, C07–C10, C12–C13, and C15–C16. C01, C02, C05, C06, C11, and C14 are structurally accepted by the current adapter; those archives remain candidates with pending routing parity.

An offline C01 run exercised all five report layers through the production generator and produced mock review receipts at zero reported cost. This checks the structural execution path only. Offline outputs do not qualify model behavior, route parity, or semantic quality and cannot authorize approval. The P01 offline smoke was blocked by adapter lineage findings. No target, sequence, or answer data was modified to make a fixture pass.

The all-fixture offline diagnostic run `gate7-offline-all-20261008` selected all 25 profiles and five report types and wrote 125 result records: 30 accepted mock outputs for C01, C02, C05, C06, C11 and C14, and 95 blocked outputs for the other profiles. It made no provider calls, recorded zero usage cost, and has run digest `e3ac4c6b183c9646f09fc0db401358a8c8e9b913cba4de2a62aa0e5768920c0c`. Its pending review package is [pending-review-package.json](../../.qualification/pwrp71/gate7-offline-all-20261008/pending-review-package.json) with SHA-256 `74d8098100de88df59db137ffe306ef100d3b6d5c03a26d136091f98aa4f7ef6`; its semantic evidence template is [semantic-review-evidence.template.json](../../.qualification/pwrp71/gate7-offline-all-20261008/semantic-review-evidence.template.json). The package records 14 unresolved semantic cases and four pending checklist items, and is explicitly `not_eligible_for_review` because it is offline, route parity is pending, and 95 outputs are blocked.

## Gate ledger at this checkpoint

| Gate | Status | Evidence and remaining condition |
| --- | --- | --- |
| 0 — Baseline | PASS | Baseline revision and tests are recorded in `PWRP71_BASELINE_AND_FIXTURES.md`; this branch is isolated from routing work. |
| 1 — Fixtures | BLOCKED | Canonical semantic set and authored/candidate source pins load; final-source replay and canonical C answer histories are pending. |
| 2 — Runner | PASS for offline and mocked attempt behavior | Deterministic offline generation, durable attempt replay, fingerprint conflicts, unknown-attempt handling, and pre-dispatch budget blocks are tested. |
| 3 — Production contracts | BLOCKED | Reuses and tests the production generator, adapter, validator, review, repair, and synthesis chain. All-five offline execution passes for six structurally accepted candidate packets; full case qualification awaits route-ready packets and provider evidence. |
| 4 — Provider compatibility | BLOCKED for live qualification | Wire-schema projection and local strict-validation tests pass. No live provider call was made because no final routing-qualified source was available. |
| 5 — `/debug` | BLOCKED | Profile/report selection, debug-token authorization, and pre-dispatch routing-gate tests pass. No fixture is currently eligible for provider runs, and browser verification against a running app remains outstanding. |
| 6 — Semantic qualification | BLOCKED | Acceptance criteria load unchanged; complete report outputs and independent semantic verdicts for all applicable cases require qualified inputs and genuine provider results. |
| 7 — Human review | BLOCKED, paused at this boundary | The offline pending-review package is inspectable but not eligible for human approval. Wait for final routing evidence and live outputs before human semantic review. No human approval or reviewed manifest has been fabricated or created. |
| 8 — Integration handoff | NOT RUN | Stopped at the requested Gate 7 boundary; no routing merge, full regression/build, browser E2E, live provider smoke, or activation was run. |

Do not merge with routing-reference changes until both branches have their own verification results. Then rebuild packet evidence against the final routing-qualified source, repeat live provider qualification under an approved cost cap, inspect the generated outputs, complete semantic review, and only then submit genuine explicit human approval evidence.
