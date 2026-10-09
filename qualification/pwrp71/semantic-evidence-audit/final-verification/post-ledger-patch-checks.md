# Post-ledger-patch verification

These checks were rerun after adding explicit records of outcomes that the experimental Mapping-entry consent branch no longer administers.

| Command | Exit | Result |
|---|---:|---|
| `npm run typecheck` | 0 | Passed. |
| `npx eslint scripts/audit-pwrp71-semantic-evidence/index.ts` | 0 | Passed. |
| `npx tsx scripts/audit-pwrp71-semantic-evidence/index.ts` | 0 | Audited 14 cases; v5 packet verifier passed for all 25 profiles with zero failures; v4 and v5 offline summaries each retained 125 accepted results. |
| `npm test` on pushed revision `1b6225dec8124074e278a521a3652925c7d64551` | 0 | 380 passed; 0 failed. Full output is in `npm-test-pushed-commit.log`. |

The regenerated `fixture-change-ledger.json` records baseline branch outcomes that were not issued in the Mapping-entry arm: P05 9, C10 10, and C11 9. The M10.observable items are recorded as skips; their selected option lists are empty, and they are not represented as responses to the base M10 question. The coverage matrix classifies all 14 semantic cases as `fully_evidenced` for the v5 fictional packet corpus. This remains fixture evidence, not report-quality approval or empirical evidence.
