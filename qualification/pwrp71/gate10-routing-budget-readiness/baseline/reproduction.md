# Gate 10 baseline reproduction

## Starting identity

The requested v5 commit was verified at `8dd192a7076ae535b90f340a778d915a8a2338bd`, branch `codex/pwrp71-semantic-evidence-v5`. A new branch, `codex/pwrp71-gate10-routing-budget-readiness`, was created from that commit. At baseline, the v5 branch was four commits ahead of `main` and zero commits behind; no relevant newer `main` change was found to reconcile. The prior v5 evidence and all v2/v3/v4/v5 source fixture directories were left in place.

## v5 claims checked

The retained artifacts and baseline receipts confirm the v5 release claims: 25/25 Mapping and Deepening routes; 25/25 source-to-packet verifier results; 14 authored semantic cases; 125/125 offline structural mock acceptances; 25/25 normalized replay hashes matched; 380 baseline tests; typecheck, build, and scoped lint passed in the supplied v5 qualification. Mock reports are empty `insufficient_evidence` drafts and do not establish report quality.

The v5 replay manifest remains an internal fictional-session replay, explicitly not independent routing qualification. The retained source pins are in `qualification/pwrp71/route_replays_v5/manifest.json`; Gate 10 records the current runtime separately rather than editing that manifest.

## Baseline commands and receipts

Baseline stdout and exit codes are retained under this directory:

| Check | Result | Evidence |
|---|---|---|
| `npm test` | 380 passed, 0 failed | `npm-test.log`, `npm-test.exit-code.txt` |
| `npm run typecheck` | exit 0 | `typecheck.log`, `typecheck.exit-code.txt` |
| `npm run build` | exit 0 on the supplied baseline | `build.log`, `build.exit-code.txt` |
| `pwqe51:parity` | exit 0; not a parity-pass assertion | `parity-normal.log`, `parity-normal.exit-code.txt` |
| `pwqe51:parity:strict` | exit 1; incomplete unsupported coverage | `parity-strict.log`, `parity-strict.exit-code.txt` |
| Packet/provenance regressions | exit 0 | `packet-provenance-regressions.log`, `packet-provenance-regressions.exit-code.txt` |

Baseline strict parity was `incomplete_unsupported_coverage`: 893 overlapping unsupported surfaces, zero unexplained differences among compared surfaces. It is not full parity.

The current-tree verification and the complete new offline matrix are recorded separately under `../verification/`, `../routing-parity-current/`, and `../v5-offline-run/`.
