# Gate 10 command results

All outputs and exit codes below are saved alongside this file. The first full-suite run is retained because it exposed the legacy C10 candidate packet mismatch; after the test was changed to require that pending archive to stay rejected, the complete suite passed.

| Command | Exit | Result |
|---|---:|---|
| `npm test` (final) | 0 | 402 passed, 0 failed. |
| `npm test` (post-review-candidate verification) | 0 | Fresh full-suite rerun after the final focused regressions: 402 passed, 0 failed. |
| `npm run typecheck` (final) | 0 | Passed. |
| `npm run build` (default workspace sandbox) | 1 | SWC could not canonicalize the workspace path; Windows returned access denied. This matches the recorded baseline environment restriction. |
| `npm run build` (workspace-access retry) | 0 | Production build passed. Both attempts are retained. |
| Changed-file `npx eslint ...` | 0 | Passed without warnings or errors. |
| `npx tsx scripts/pwqe51-parity/index.ts` | 0 | `completed; not a parity-pass assertion`; strict summary is incomplete with 893 unsupported surfaces and zero unexplained differences. Full 12.8 MB JSON retained. |
| `npx tsx scripts/pwqe51-parity/index.ts --strict` | 1 | Expected strict gate result: `incomplete_unsupported_coverage`, 893 overlapping unsupported surfaces, zero unexplained differences. Full 12.8 MB JSON retained. |
| `npm run reports:verify:v5-packets` | 0 | 25/25 profiles; 100/100 MAP/IFS/PV/ATT packets passed current source-to-packet and adapter checks. |
| `npm run reports:qualify:pwrp71 -- offline --fixture-set route-replays-v5 ... --reports ALL` | 0 | 125/125 structural acceptances; 250 zero-cost mock attempts; 25/25 same-profile synthesis prerequisite sets; `routeParity: pending`. Every report draft is `insufficient_evidence`. |
| `npm run reports:preflight:pwrp71 -- --run-id gate10-c01-c02-ifs-no-dispatch-current ...` | 0 | `BLOCKED`; two request bodies prepared, dispatch false, provider calls zero, API key not read. |
| `npx tsx --test` focused budget/OpenRouter cases | 0 | 29 tests passed, including cross-process lock retention, missing usage, unknown billing, interrupted receipt, and exact request fingerprint controls. The full suite also covers session, correction, packet, and adapter regressions. |
| `npx tsx --test` final focused regression selection | 0 | 66 passed, 0 failed across session replay, source-to-packet evidence, correction/currentness, adapter mutation rejection, budget journal, generator/runner, fixture provenance, and OpenRouter wire compatibility. |

## Detailed receipts

- `npm-test-final.log`, `npm-test-final.exit-code.txt`
- `npm-test-post-review-final.log`, `npm-test-post-review-final.exit-code.txt` (fresh 402 passed, 0 failed)
- `npm-test-initial-review-discovery.log`, `npm-test-initial-review-discovery.exit-code.txt` (401 passed, 1 stale candidate expectation; corrected and rerun)
- `focused-regressions-final.log`, `focused-regressions-final.exit-code.txt` (66 passed, 0 failed)
- `typecheck-final.log`, `typecheck-final.exit-code.txt`
- `build-final.log`, `build-final.exit-code.txt` (sandbox path restriction)
- `build-final-escalated.log`, `build-final-escalated.exit-code.txt` (successful retry)
- `scoped-eslint-final.log`, `scoped-eslint-final.exit-code.txt`
- `../routing-parity-current/normal.json`, `normal.exit-code.txt`
- `../routing-parity-current/strict.json`, `strict.exit-code.txt`
- `../routing-parity-current/strict-parity-gap-ledger.json`
- `../packet-verification/verification.log`, `verification.exit-code.txt`, and `v5-current-contract-verification.json`
- `../provider-preflight/c01-c02-ifs-no-dispatch-current.json`
- `../v5-offline-run/gate10-v5-offline-full-matrix/run.json`, `attempts.json`, reports, and runner log/exit receipt
- `../source-hash-manifest.json`

The source hash manifest records exact code-file hashes, all 25 normalized v5 artifact hashes, all 100 packet digests, both exact no-dispatch request fingerprints/body digests, current parity outputs, offline run/attempts, and the primary command receipts. The focused regression receipt is retained here alongside the complete 402-test suite receipt.
