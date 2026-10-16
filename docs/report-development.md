# Reporting development

## Start here

Use Node 22 and `npm ci`. The development harness is local and file-based. It does not create customer accounts, write the application database, activate a release or silently substitute a mock model.

```text
npm run reports:dev -- --case mara --reports all
npm run reports:dev -- --case ellis --reports all
npm run reports:dev -- --case mara --mode assess
npm run reports:source -- --check
npm run typecheck
npm test
npm run build
```

The first two commands complete real router-issued Mapping and Deepening, validate actual packets and adapter inputs, and save provider-request preparation. They make no provider calls. Synthesis preparation waits for accepted generated layer drafts; that dependency state is not a successful synthesis report.

Each assessment command prints an immutable `.report-dev/assessments/<digest>.json` path. Retain it to change report prompts without repeating the questionnaire. PowerShell example:

```powershell
npm run reports:dev -- --case mara --mode assess --output .report-dev/mara
$mara = (Get-ChildItem .report-dev/mara/assessments/*.json | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
npm run reports:dev -- --assessment "$mara" --reports IFS
npm run reports:dev -- --assessment "$mara" --reports all
```

## Prompt iteration

Edit active files under `reporting/prompts/`, not historical experiments.

```text
npm run reports:source -- --sync --change prose
npm run reports:source -- --check
```

Then repeat the `--assessment` command. Use `--change interpretation` for non-schema contract changes and `--change schema` for schemas or executable reference contracts. Source sync updates the manifest and checked-in pin together. It rejects hidden new members, symlinks and schema changes misdeclared as prose. A source binding is not provider qualification or production approval.

## Actual provider generation

Configure `OPENROUTER_API_KEY` privately in the execution environment, never in code, answer plans, run artifacts or Git. Actual generation requires a fresh invocation authorizing both aggregate and per-call dollar limits. These are example caps, not price estimates or permission already granted:

```powershell
npm run reports:dev -- --assessment "$mara" --reports IFS --mode generate --allow-spend --budget 3.00 --per-call 0.30
npm run reports:dev -- --assessment "$mara" --reports all --mode generate --allow-spend --budget 3.00 --per-call 0.30
```

The existing configured model tiers, production OpenRouter client and durable attempt journal are shared. The journal reserves budget before dispatch, distinguishes uncertain outcomes and reuses settled matching calls. Do not edit journals to force retries. Automated tests inject a deterministic transport; there is no CLI mock switch, and those outputs are not model-generated psychological reports.

## Inspect, compare and validate

`--mode inspect --run <directory>` prints a saved summary and files. `--mode compare --left <directory> --right <directory>` requires matching assessment identities and compares source identities, report metadata and reviews. Counts are not a semantic quality judgment.

`--mode validate --assessment <assessment.json> --reports IFS --artifact <artifact.json> --review <review.json>` checks the real artifact and a review bound to the exact draft/evidence. It does not create a fresh model judgment. A well-formed `revise` verdict exits unsuccessfully. Omitting `--review` is structural-only validation, not semantic acceptance.

Generated runs retain prepared inputs, outcomes, validation events, artifacts, reviews and `report.md` for each layer. `summary.json` separates structural/review status from operational approval. Stage and field-level failures remain in outcomes; failed assessment construction retains partial state separately.

## Actual execution map

Application: assessment handlers -> `lib/server/assessment/service.ts` -> `pwqe51-session.ts` and `pwqe51-router.ts` -> application snapshot -> `lib/server/reports/steps.ts` -> `pwqe51-packet.ts` -> `pwrp71-adapter.ts` -> `generator.ts` -> structural validation and independent `pwrp71-review.ts` -> renderer/artifact persistence -> existing account-protected report/download/delivery paths.

Development: `scripts/report-dev/index.ts` -> `assessment.ts` calls the same session/router -> `verify-assessment.ts` checks saved history -> `workflow.ts` calls the same packet builder, adapter, generator, reviewer and renderer. Its storage boundary is an isolated directory, not the customer database. There is no second report generator.

Interpretation and composition remain parts of one structured writer output: source-linked claims, names and relationships accompany the narrative. A separate reviewer checks source fidelity, substantive coverage and narrative quality. An extra interpretation-model call is deferred until controlled model runs show sufficient benefit to justify its cost and complexity.

## Ownership and safeguards

The router owns issuance, option eligibility, occurrence/step binding and completion. Saved answer-plan records require route replay rather than a JSON hash alone. Version-1 answer plans do not encode correction, comparison or control decisions; records containing such unrecorded operations fail closed. Those operations remain supported by the production assessment service.

The packet builder owns source selection/currentness; the adapter owns the minimized model view. New development response records and provider requests contain no respondent-origin classification. Historical archives retain their original bytes, but old warnings and approvals cannot flow into new requests. Retained qualification packets are rebuilt from canonical selections and revalidated against the current report contract. Their old writer-prompt hash does not require repeating an unchanged questionnaire.

The generator owns bounded repair/escalation. The reviewer accounts for current evidence, identifies material omissions and separates source fidelity, semantic completeness and narrative quality. No word-count or part-count gate determines acceptance. The journal owns dispatch identity, cost reservations and uncertain billing. Account authorization, encrypted persistence, deletion and delivery remain at the existing application boundaries.

## Retired path

The dated October 11–15 direct-provider diagnostic and its 29 fixed-epoch tests are retained as `.ts.txt` in `qualification/pwrp71/archived-diagnostic-contract/`. They are neither executable modules nor passing tests. The old CLI always stops with a migration notice, so its dated approvals cannot authorize another run. Its parallel transport/recovery orchestration is replaced for development by the shared provider and journal.

Earlier stored-report compatibility and historical qualification material remain outside the new PWRP 7.1 prompt path. This continuation does not migrate customer records or change production activation.

## Qualification boundary and next work

See `qualification/pwrp71/report-development-20261016/verification.json` and logs. Two real router-driven assessment profiles and all five report paths are covered offline. The deterministic five-report fixture is not proof of actual psychological prose quality, independent model judgment, provider access or real account delivery.

The highest-value remaining gate is a newly budget-authorized baseline/revised model run against the same saved assessments, followed by content review. Production provider/account-delivery qualification follows. Expanding answer-plan transcripts to express corrections/comparison decisions is a separate medium-complexity task; do not accept such imports until their decisions can be replayed. A second interpretation model or more orchestration layers is not justified before these measurements.
