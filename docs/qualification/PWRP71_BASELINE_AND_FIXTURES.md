# PWRP 7.1 baseline and fixture inventory

## Gate 0 source-to-consumer crosswalk

| Qualification input or consumer | Source | Current role | Qualification status |
| --- | --- | --- | --- |
| PWQE 5.1 question bank, router source and packet schema | `specs/patternwork/question-engine-v5.1/assessment_runtime/` and its source manifest | Produces the report evidence packet and binds its release identity | Final routing-qualified source is pending; archived packets must be rebuilt against that source before full qualification |
| PWRP 7.1 policy, prompts and schemas | `reporting/contracts/`, `reporting/prompts/`, and `reporting/schemas/` | Loaded and pinned by `loadPwrp71SourcePackage` | Source-bound candidate inputs; no reviewed qualification manifest is present |
| Packet/report binding | `lib/server/reports/pwrp71-adapter.ts` | `preparePwrp71Request` builds the report request from one packet and the pinned sources | Existing production-path component |
| Draft and review contract | `lib/server/reports/pwrp71-validation.ts`, `pwrp71-review.ts` | Validate a candidate draft and reviewer receipt | Existing production-path components |
| Markdown rendering and artifact binding | `lib/server/reports/pwrp71-validation.ts`, `pwrp71-review.ts` | Render canonical Markdown and bind artifact/Markdown digests to the exact draft | Existing production-path components |
| Generation, repair and review loop | `lib/server/reports/generator.ts` | Uses the prepared PWRP request, active source prompts and schemas, then validates, repairs and reviews | Existing generation component; not a qualification runner by itself |
| Production activation gate | `lib/server/reports/pwrp71-readiness.ts` and `lib/server/reports/steps.ts` | Requires a reviewed manifest bound to source, semantic cases, provider evidence and explicit approval | Closed until the reviewed manifest is valid |
| Qualification fixture loader | `lib/server/reports/qualification/fixtures.ts` | Loads source-bound P01–P09 authored histories, canonical semantic cases and indexed C01–C16 candidate archives | Added in this work; all router parity remains pending |
| Command-line qualification and durable run records | `scripts/qualify-pwrp71/index.ts`, `lib/server/reports/qualification/` | Dedicated offline/live/resume/status/review/approval commands and persisted attempt ledger | Implemented on the isolated report-tooling branch; live qualification awaits final routing evidence |
| `/debug` qualification UI | `app/debug/`, `app/api/debug/reports/`, `lib/server/debug/report-runner.ts` | PWRP 7.1 fixture-only report selection and result inspection | Implemented on the isolated report-tooling branch; route-dependent runs fail closed until final parity evidence |

At baseline, the repository had report generation, PWRP 7.1 validation/review, and a production readiness gate. It did not have a native PWRP 7.1 qualification command that assembled source-pinned cases, durable provider attempts, review artifacts, and approval evidence. Existing `reports:qualify` and debug tooling target earlier qualification flows.

The dedicated `reports:qualify:pwrp71` command and PWRP 7.1 debug runner are now present on this branch. See [PWRP 7.1 runner operations and gate status](PWRP71_RUNNER.md) for invocation, verification, and current release blockers.

## Gate 0 baseline record

- Starting revision and isolated branch base: `8f5f9d8ee1d88ec7bd1c284d20327f8e52628f1c` (`codex/pwrp71-qualification-tooling`). The routing-reference workstream remains separate.
- Baseline before implementation: `npm test` passed 313/313; `npm run test:contracts` passed 36/36; `npm run typecheck` passed. No baseline test failures were recorded.
- Question release: `PWQE-5.1.0-candidate.1`; router identity: `PW-ROUTER-1.1.0-candidate.1`; question source SHA-256: `a1ec5e1aae86f28086ac84a42e33bfdca953870631b5d8dbec2a76cd0985f832`; source-manifest SHA-256: `144b796d9d1cb78055091e9cc18b5c4735657a9ba3bed6197330fb65da69eabc`.
- Report release: `PWRP-7.1.0-candidate.1`; report release-manifest SHA-256: `026c6fd11fe50adde790d1f62ac5e65794987ed195374b7e9f0c1f276b57a3c5`.
- Existing consumer separation: PWQE6 qualification/debug paths remain available for their release; they are not used to claim PWRP 7.1 qualification. PWRP activation continues through `assertPwrp71ReportActivationReady`.

## Fixture sources and handling

The P01–P09 records in `qualification/pwrp71/profiles/` are copied from the supplied archive `Patternwork_Coverage_Expansion_2026-10-07.zip` (SHA-256 `c99ab2c374f901757c3210190aaf2fe2c5227cb2c6f2f442cdb3309576c9a1c3`). Each profile preserves the archive's authored plan and `LOCAL_UNSIGNED_state` history with a byte digest and original archive path in `qualification/pwrp71/fixture-manifest.json`. The authored `source_kind` identifies these as adapted branch segments, not complete observed respondent histories. Their old route outputs are not loaded as expected answers. The loader carries the authored records forward without deriving targets from `routing_target` fields.

Every P profile has `routerParity: pending` and `qualificationStatus: pending_router_parity`. This records source lineage only; it does not claim the profiles pass PWQE 5.1 routing or PWRP 7.1 reporting. Full report qualification must use the final routing-qualified packet source.

The archive lists C01–C16 as coverage packet candidates. The fixture manifest indexes their original archive paths and labels them `candidate_archive_not_canonical_answer_history`, with router parity pending. Those packet archives are not loaded as canonical answer histories or treated as qualified outputs. The linked acceptance criteria live in the semantic case set; their `status` remains `authored_acceptance_criteria_not_provider_results`.

The copied `SEMANTIC_CASES.json` is the canonical local source file. The readiness constant `PWRP71_SEMANTIC_CASE_SET_SHA256` (`fec1752b4a4892da77fcadbf78688b23fd77e010b845ae6ddcd4523c0547569d`) matches the exact source file bytes, and the fixture loader enforces that source-asset pin plus the fixture-manifest byte digest. The parsed JSON's `sha256Canonical` is `ad48886eb708871933674f95f008edc08871be0a68d8b887571e430e174201e2`; that derived canonical JSON digest does not equal the readiness constant. The loader returns both values so run evidence cannot conflate the source-byte pin with the canonical JSON digest. The file is preserved unchanged and criteria are not reinterpreted.

## Gate 1 completion record

| Deliverable | State | Evidence or remaining dependency |
| --- | --- | --- |
| P01–P09 source lineage | Present; report use pending | Authored plans and unsigned history state are byte-pinned in the fixture manifest; all router parity is pending |
| C01–C16 source index | Present as candidate archive references | Candidate packets are not canonical answer histories; rebuild the cases against final routing-qualified source before full qualification |
| Canonical semantic case set | Present and source-byte-pinned | 14 authored acceptance criteria; the readiness pin equals raw file bytes. Its distinct canonical JSON digest is recorded above |
| Fixture drift and missing-file checks | Implemented | Focused tests cover profile identity, lineage, pending status, asset drift, missing history, and semantic source drift |
| Canonical C01–C16 answer histories | Pending | The archive's packet captures are candidates, not canonical answers; preserve this distinction during later replay/import |
| Report-ready packets from the final router | Pending | Wait for the routing-reference workstream's own verification and final source before rebuilding and qualifying outputs |

Gate 1 is only partially complete: the source-bound P history and canonical semantic case set are available, but the C case packet captures and all P histories still require final-source routing verification before they can count as report qualification fixtures. This deliverable makes no provider calls and creates no provider or human-review result.

### Report-adapter checkpoint on the isolated report-tooling branch

An offline `preparePwrp71Request` diagnostic against the current checkpoint found report-lineage validation failures that must remain visible until the routing-reference workstream supplies its final verified source. The source-bound history replay and router-packet schema checks succeed, but the report adapter does not accept every current packet:

| Profiles | Current adapter finding |
| --- | --- |
| P01 | `target_lineage` at target resolutions 2, 3, 8 and 9 |
| P02 | `target_lineage` at target resolution 1 |
| P03 | `target_lineage` at target resolution 3 |
| P04 | `target_lineage` at target resolution 2 |
| P05 | `sequence_lineage` at sequence edges 0 and 1 |
| P06 | `target_lineage` at target resolution 0 |
| P07 | `target_lineage` at target resolutions 0–5 |
| P08 | `target_lineage` at target resolution 0 |
| P09 | `target_lineage` at target resolutions 2–5 |
| C03, C04, C07–C10, C12–C13, C15–C16 | `target_lineage` or `sequence_lineage` validation findings |

C01, C02, C05, C06, C11 and C14 are structurally accepted by the adapter at this checkpoint. They remain candidate packet archives with pending router parity and are not live-qualification evidence. An offline C01 run of all five report layers completed with mocked provider/reviewer calls and zero reported cost. The P01 offline smoke was correctly recorded as blocked by its adapter findings. These outcomes do not make any packet router-qualified.

The exact validation issue codes and paths are asserted as lineage-only pending findings in `tests/report-workflow/pwrp71-qualification-fixtures.test.ts`. No target, sequence or observation data was edited to bypass those checks. After the routing-reference workstream completes, rebuild packet pins from its final source and rerun the same adapter checks before live qualification.
