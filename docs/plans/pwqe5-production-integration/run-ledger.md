# PWQE 5 production integration run ledger

- State: `IMPLEMENTED; PRODUCTION ACTIVATION BLOCKED ON REVIEWED QUALIFICATION`.
- Base commit: `487cf4426dc037b5aa47c32201efdf0c6461a4b0`.
- Branch: `codex/question-engine-v3-1-openrouter`.
- Worktree at entry: already contained extensive user changes across assessment, report delivery, retention, exports, and Prisma. Those changes are preserved and are part of this baseline.
- Authority: production repository owns auth, persistence, workflows, report delivery, and source integrity; `Patternwork_Router_2026-10-06.zip` owns PWQE 5 authored semantics. User clarification: no legacy support is required for absent old assessments; new sessions must use PWQE 5.
- Orchestration enforcement: procedural. Independent source/router, UI/API, and report-generation workstreams used disjoint file ownership; the primary agent integrated service activation, snapshot binding, and closeout checks.

## Gate 0 — baseline

Status: `PASS` for baseline establishment; Prisma validation is environment-blocked.

Source revision: base commit above plus the pre-existing dirty worktree.

Commands and results:

| Command | Result |
|---|---|
| `npm ls --depth=0` | Exit 0; all 29 direct dependencies resolve. |
| `npm run lint` | Exit 0; 0 errors, 1 existing unused-disable warning in generated `.well-known` workflow output. |
| `npm run typecheck` | Exit 0. |
| `npm test` | Exit 0; 157 passed, 0 failed. |
| `npm run test:contracts` | Exit 0; 19 passed, 0 failed. |
| `npx prisma validate` | Exit 1, P1012; `DATABASE_URL` is not configured in this environment. |
| `npm run build` | Exit 0; Next.js production build succeeded and generated 28/28 static pages. Existing stale `baseline-browser-mapping` data warning. |

Failures found: no baseline code/test failures. Prisma schema validation cannot run without `DATABASE_URL`; this is an environment dependency, not yet a migration result.

Files changed for Gate 0: this ledger only. Application changes are recorded under the gate that introduced them.

## Crosswalk disposition

| PWQE 5 component | Production starting point | Initial disposition |
|---|---|---|
| Canonical questions/options | `specs/patternwork/question-engine-v5/`, `lib/question-engine/pwqe5-source.ts` | Imported byte-for-byte and loaded through exact manifest/hash and reference checks. |
| Routing/evidence | `lib/server/assessment/pwqe5-router.ts` | Implemented deterministic replay, server-owned episode binding, missingness, correction invalidation, stop controls, and authored M10 variant selection. |
| Session/source/snapshots | `lib/server/assessment/service.ts`, Prisma `PatternworkV31*` models | New sessions are bound to PWQE5; encrypted response/snapshot persistence reuses the existing generic fields. No PWQE5 database migration was added. Old assessment sessions are not supported, per user clarification. |
| UI | `app/assessment/page.tsx`, `ui-state.ts`, response/state/control APIs | Renders canonical questions/options, answer modes, missingness controls, correction history, opt-in topics, pause, shorten, and end actions. |
| Reports/prompts | `lib/server/reports/pwqe6-*`, report worker and PDF renderer | PWQE6 packet, prompt, draft schema, lineage validation, artifact binding, and atomic release are integrated with existing persistence/delivery. |
| Provider qualification | `lib/server/openrouter/pwqe5-provider-qualification.ts`, `policy.ts`, qualification CLI | Offline source fixtures and the PWQE5/PWQE6 mock path pass. The authorized live OpenRouter attempt returned HTTP 400 before usage metadata; no reviewed activation manifest was created. |

## Subsequent gates

Gate 1: complete; source package, manifest pin, loader, and drift/reference tests pass.
Gate 2: complete; production TypeScript router and fictional/negative-case projections pass focused tests. The supplied Python suite's one Windows environment failure is recorded above.
Gate 3: complete in code; persistence uses existing encrypted generic fields and source/snapshot bindings. Prisma validation is repeated with a dummy local URL because it validates schema without connecting; no database-backed deployment check was possible here.
Gate 4: complete in code and focused UI-state tests. Browser end-to-end testing is blocked by the deliberately absent reviewed activation manifest.
Gate 5: complete; PWQE6 packet, prompt/schema validation, lineage validation, artifact binding, PDF verification, and atomic release are integrated and covered by focused tests.
Gate 6: offline source qualification passes. Live qualification is blocked by an OpenRouter HTTP 400 response before usage metadata; human review cannot start until machine qualification produces a complete pending-review package. No production activation manifest was created.
Full regression: run at closeout; results are recorded below.

## Gate 1 — source release integrity (in progress)

Status: `PASS`; source assets, integrity tests, and production session pinning are wired.

Files changed by the migration so far:

- `specs/patternwork/question-engine-v5/` — byte-preserved 14 authored assets, package README, and release manifest.
- `lib/question-engine/source-integrity.ts` — the existing SHA/byte-manifest verifier extended for PWQE 5; package population and manifest identity are pinned.
- `lib/question-engine/pwqe5-source.ts` and `lib/question-engine/index.ts` — canonical loader and referential checks.
- `tests/contracts/pwqe5-source.test.ts` — source population, exact loaded bank, references, manifest drift, extra-file, and stale-ID checks.

Commands and results:

| Command | Result |
|---|---|
| `npx tsx --test tests/contracts/pwqe5-source.test.ts` | Exit 0; 5 passed, 0 failed. |
| `npm run typecheck` | Exit 0. |
| `git diff --check` | Exit 0; only expected CRLF conversion warnings on pre-existing dirty files. |

Source audit: the supplied question bank is canonical JSON with 94 distinct templates (30 Mapping, 64 conditional Deepening), 550 base options, one separately authored render variant, 53 targets, and 29 item gates. All 14 imported assets match their upstream byte/hash entries. The package root `RELEASE_MANIFEST.json` has a stale `verification/router/pytest.log` hash and omits later verification artifacts; `ROUTER_DELIVERABLE_MANIFEST.json` entries match. On native Windows, the reference suite collected 715 cases: 714 pass and one cross-process hash-seed test fails because its child-process `PYTHONPATH` uses POSIX separators. The router package explicitly makes no native Windows runtime claim. These reference-package limitations do not affect the imported authored assets and remain recorded as evidence limits.

Gate 1 closure: new sessions, resume lookups, and report links are constrained to the pinned PWQE5 assessment key. The service rejects any other stored assessment contract; no legacy assessment binding is retained.

## Closeout — implementation complete, activation pending

- Live session start and report generation both require the reviewed PWQE5 qualification manifest and its deployment-pinned canonical digest. The source loader also validates the release manifest, v6 prompts, router packet schema, and report draft schema.
- The authored package remains `PWQE-5.0.0-design.1` with router candidate `PW-ROUTER-1.0.0-candidate.1`. This work does not claim clinical validation or provider approval.
- The respondent-facing consent release is `PWQE5-CONSENT-1`. The app does not accept a different consent version for new sessions.
- No database migration was introduced for PWQE5. Existing encrypted state and snapshot fields store the release-bound canonical records. There are no legacy assessment records to migrate or preserve, per the user.
- Offline fixture qualification validates all 9 fictional worked profiles and all 14 negative cases with zero provider calls and no approval status.
- The provider workflow now builds 45 profile/report pairs, supports same-profile synthesis, persists attempts for safe resume, validates full drafts locally, and writes human-readable reports. Mock tests cover the complete path through reviewed-manifest activation.
- The authorized live run reached OpenRouter but returned HTTP 400 before usage metadata. Its qualification record has zero usage cost and is `machine_failed`; provider qualification, human review, and activation remain pending.
- Production cannot start new PWQE5 sessions or generate live reports until a complete provider run succeeds, a human reviewer approves its exact outputs, and the deployment receives the matching activation manifest and digest.

## Current verification closeout — 2026-10-07

Full regression and deployment-readiness evidence is recorded in [verification.md](verification.md): 208 unit tests and 29 contract tests pass; typecheck, production build, Prisma schema validation, offline source qualification, lint (0 errors), and whitespace checks pass. The only lint output is the existing unused-disable warning in generated workflow output.

The provider qualification is not complete: the live request returned HTTP 400 before usage metadata, and the run is machine-failed with zero recorded usage. No human review or activation manifest was created. Browser end-to-end and deployment checks remain pending until a complete provider run is available.
