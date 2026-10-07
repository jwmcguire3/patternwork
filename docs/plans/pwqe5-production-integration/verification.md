# PWQE5 integration verification

Date: 2026-10-07

## Local gates

| Check | Result |
|---|---|
| `npm run typecheck` | Pass. |
| `npm test` | Pass: 212 passed, 0 failed before the final privacy-regression test was added. |
| Focused report/privacy tests | Pass: 13 passed, 0 failed after narrowing account-ID detection. |
| `npm run test:contracts` | Pass: 29 passed, 0 failed. |
| `npm run lint` | Pass with 0 errors and 1 existing unused-disable warning in generated `.well-known` workflow output. |
| `npm run build` | Pass; Next.js generated all 30 static pages. The build emitted the existing stale `baseline-browser-mapping` data notice. |
| `npx prisma validate` | Pass with a command-scoped dummy local `DATABASE_URL`. This validates the schema only and does not connect to a database. |
| `git diff --check` | Pass; Git emitted line-ending conversion notices for the pre-existing dirty worktree. |
| `npm run reports:qualify -- --offline-fixtures` | Pass: pinned source loaded; 9 Mapping packets, 9 Pass 2 packets, 14 negative cases; 0 provider calls; approval remains `not-reviewed`. |

Focused provider workflow tests verify all 45 profile/report combinations, a single repair, same-profile IFS/PV/ATT synthesis inputs, cost blocking before transport calls, persisted-attempt resume without a duplicate provider call, provider-compatible schema projection, and the mock approval-to-activation path. The new privacy regression test confirms ordinary account-related prose is accepted while an account-ID-shaped value remains blocked.

## Live provider boundary

- The configured OpenRouter candidate and $1 cost cap were loaded without printing credentials.
- The first HTTP 400 came from unsupported JSON Schema keywords inside schema nodes. The projection now removes unsupported keywords while preserving property names, and the request uses `reasoning.effort` and `max_completion_tokens`.
- The current capped qualification is still running at `output/qualification-pwqe6-gpt6-luna-max-2026-10-07-32768/pwqe5-qualification-run.json`. At 11:31 EDT, 69 attempts were complete: 65 passed and 4 failed, with $0.749516 recorded against the $1 cap. `MAP`, `IFS`, `PV`, and `ATT` selected GPT-6 Luna at max; SYNTHESIS P07 was in progress. Three `direct_pii` failures came from the old broad detector matching ordinary prose: `account doesn`, `account records`, and `account without`. The remaining failure was `evidence_occurrence_scope` at P03. The detector was subsequently narrowed, and the focused privacy regression tests pass.
- Account-ID detection now requires a labeled ID-shaped value or a digit-containing token after an account/member label. A regression test covers the prior false positives and a positive ID case. No human approval or activation manifest has been created.

## Not verified in this workspace

- No database connection, deployment environment, production migration, or delivery provider was exercised.
- Browser end-to-end assessment-to-report flow was not run because live qualification and human review are still pending.
- No human reviewer approved outputs. A named reviewer must inspect a complete pending-review package after the provider request issue is resolved.
- No legacy assessments were present or migrated, per the user's clarification. New sessions reject old assessment contract keys.
