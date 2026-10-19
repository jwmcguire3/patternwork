# Network and route-policy fix verification

Date: 2026-10-11  
Working branch: `codex/pwrp71-authorized-fictional-ifs-diagnostic`

## Verification results

| Command | Result |
|---|---|
| `node --import tsx --test tests/report-workflow/pwrp71-fictional-ifs-diagnostic.test.ts` | Exit 0; 17 passed, 0 failed. |
| `npm test` | Exit 0; 423 passed, 0 failed. |
| `npm run typecheck` | Exit 0. |
| `npx eslint scripts/pwrp71-fictional-ifs-diagnostic/diagnostic.ts scripts/pwrp71-fictional-ifs-diagnostic/index.ts scripts/pwrp71-fictional-ifs-diagnostic/connectivity.ts scripts/pwrp71-fictional-ifs-diagnostic/generate-fresh-budget-preflight.ts lib/server/reports/qualification/attempt-store.ts tests/report-workflow/pwrp71-fictional-ifs-diagnostic.test.ts` | Exit 0. |
| `npm run build` | Exit 0. Existing warnings note broad dynamic file patterns in report-runner, source-integrity, and fixtures, plus stale `baseline-browser-mapping` data. |
| `git diff --check` | Exit 0. |

The route check tests confirm an empty OpenAI/ZDR intersection creates no attempt or dispatch, consumes no reservation, and permits a safe public-catalog recheck. The exact fetch is unauthenticated and does not call the generation endpoint.

## Live diagnostic status

The owner-authorized fresh $3 budget epoch made one C01 IFS request to OpenRouter. OpenRouter returned HTTP 404 before selecting a provider, so C02 was not sent and there is no generated report to review. Provider usage/cost was not returned; the attempt remains conservatively reserved as unknown. See [the live blocker report](../provider-preflight/openai-only-zdr-blocker-20261011.md) and [the retained run record](../live/gate11-c01-c02-ifs-owner-authorized-diagnostic-20261011-fresh-budget-epoch-2/run.json).

No routing qualification, human semantic approval, or production activation is claimed.
