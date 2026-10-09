# Gate 10 command results

The table records the latest successful verification against implementation candidate `bbd357322191364d2b2e0306a8b7f9f76ca2c267`, plus expected or diagnosed failures. Logs and exit receipts are retained beside this file or in the linked run folders. No paid request was sent.

| Command | Exit | Result and receipt |
|---|---:|---|
| `npm test` | 0 | **406 passed, 0 failed**. `npm-test-gate10-final.log` and `.exit-code.txt`. |
| `npm run typecheck` | 0 | Passed. `typecheck-gate10-post-budget-authorization.log` and `.exit-code.txt`. |
| `npm run build` (default workspace sandbox) | 1 | SWC could not canonicalize the OneDrive workspace because Windows returned access denied. Retained as `build-gate10-default.log` and `.exit-code.txt`. |
| `npm run build` (workspace-access retry) | 0 | Production build passed. `build-gate10-escalated.log` and `.exit-code.txt`; only an outdated `baseline-browser-mapping` advisory was printed. |
| Changed-file `npx eslint ...` | 0 | Passed without diagnostics. `scoped-eslint-gate10-final.log` and `.exit-code.txt`. |
| Focused routing/packet/budget/OpenRouter test selection | 0 | **57 passed, 0 failed**, including D36 stale-response reinsertion, budget reservation/current attempt identity, dispatch authorization, and request usage serialization. `focused-gate10-post-budget-authorization.log` and `.exit-code.txt`. |
| `npm run reports:verify:v5-packets -- qualification/pwrp71/gate10-routing-budget-readiness/packet-verification/v5-gate10-final.json` | 0 | **25/25 profiles; 100/100 packets** verified. See `verification/v5-packet-verification-gate10.log`, its exit receipt, and the JSON output. |
| Full `reports:qualify:pwrp71 offline` run against `route-replays-v5`, all 25 profiles and all report types | 0 | `offline_complete`; **125/125** structurally accepted mock outputs, 250 completed attempts, zero cost, zero unknown-cost reservation, and 25 same-profile synthesis prerequisite sets. `routeParity` remains pending. See `verification/v5-offline-gate10-final.log`, its exit receipt, and `v5-offline-run-gate10-final/gate10-post-budget-current-v5-full-matrix-20261009/`. Drafts are `insufficient_evidence`; this is not report-quality evidence. |
| `npm run pwqe51:parity` | 0 | `completed; not a parity-pass assertion`. See `routing-parity-gate10-final/normal.result.json`, `normal.exit-code.txt`, and `summary.json`. |
| `npm run pwqe51:parity:strict` | 1 | Expected incomplete gate: `incomplete_unsupported_coverage`, 893 overlapping unsupported surfaces, zero unexplained differences among compared surfaces. See `strict.result.json`, `strict.exit-code.txt`, and `summary.json`. |
| `npm run reports:preflight:pwrp71 -- --run-id gate10-c01-c02-ifs-no-dispatch-cap-proposal-1500000-20261009-r2 --max-call-cost-micros 115000 --aggregate-cost-cap-micros 1500000 --output ...` | 0 | Machine-readable result `BLOCKED`; two exact request bodies prepared, `dispatchPerformed=false`, `providerCalls=0`, `apiKeyRead=false`. The cap values are a proposal and do not authorize spend. See `preflight-capped-1500000-post-usage.log`, its exit receipt, and the exact JSON under `provider-preflight/`. |

## Failure and recovery record

- An earlier full v5 matrix stopped after 123 outputs when Windows/OneDrive returned `EPERM` during an atomic `attempts.json` rename. The reservation had not reached provider dispatch. That failed run is retained under `v5-offline-run-post-d36/`. Bounded retry and cleanup were added without removing the run lock or weakening reservation semantics; the full matrix then completed in the retained retry run and again in the final run above.
- A test run during that recovery had 1 failure among 405 tests because the legacy PWQE 5 qualification writer hit the same transient rename failure. The shared atomic-write retry was fixed and covered. The current complete suite is 406/406.
- The default sandbox build failed for workspace access; the explicitly authorized workspace-access retry passed. Both logs and exit codes remain available.
- Normal parity success is an audit execution status only. Strict parity remains incomplete; neither result has been rewritten as a parity pass.

## Receipt index

- Full suite: `npm-test-gate10-final.log`, `npm-test-gate10-final.exit-code.txt`.
- Typecheck: `typecheck-gate10-post-budget-authorization.log`, corresponding exit receipt.
- Build attempts: `build-gate10-default.log`, `build-gate10-escalated.log`, corresponding exit receipts.
- Scoped lint: `scoped-eslint-gate10-final.log`, corresponding exit receipt.
- Focused tests: `focused-gate10-post-budget-authorization.log`, corresponding exit receipt.
- Packet audit: `v5-packet-verification-gate10.log`, corresponding exit receipt, and `../packet-verification/v5-gate10-final.json`.
- Offline matrix: `v5-offline-gate10-final.log`, corresponding exit receipt, and `../v5-offline-run-gate10-final/gate10-post-budget-current-v5-full-matrix-20261009/`.
- Parity: `../routing-parity-gate10-final/normal.result.json`, `strict.result.json`, `summary.json`, and exit receipts.
- No-dispatch preflight: `preflight-capped-1500000-post-usage.log`, corresponding exit receipt, and `../provider-preflight/gate10-c01-c02-ifs-no-dispatch-cap-proposal-1500000-20261009-r2.json`.
- Exact source/evidence pins: `../source-hash-manifest.json` (updated after the final evidence snapshot commit).
