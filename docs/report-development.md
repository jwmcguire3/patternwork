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

`npm test` discovers active `.test.ts` and `.test.mjs` files under `app/`, `lib/`, `tests/` and `scripts/`, with Node's module-mocking flag enabled for the customer workflow regression. Historical qualification archives are excluded: some archived test programs rewrite their own receipts and must not run against preserved evaluation outputs. Run any historical experiment explicitly in an isolated copy.

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
npm run reports:dev -- --assessment "$mara" --reports IFS --mode generate --allow-spend --budget 3.00 --per-call 0.30 --identity-file ".report-dev/mara/reviewed-identities.json"
npm run reports:dev -- --assessment "$mara" --reports all --mode generate --allow-spend --budget 3.00 --per-call 0.30 --identity-file ".report-dev/mara/reviewed-identities.json"
```

The report-development and journaled qualification paths use the shared OpenRouter client and durable attempt journal. The journal reserves budget before dispatch, distinguishes uncertain outcomes and reuses settled matching calls. Do not edit journals to force retries. Automated tests inject a deterministic transport; those outputs are not model-generated psychological reports. The legacy `reports:codex` command is disabled for external report generation because it does not enforce the OpenRouter data-collection-denial and spend policy.

`OPENROUTER_TIMEOUT_MS` sets the complete HTTP response deadline, including success and error body reads; the default is 1,200,000 milliseconds (20 minutes). A constructor `timeoutMs` takes precedence for controlled callers and tests. The value must be a positive integer within the Node timer range. A timeout keeps its conservative billing reservation and does not prove provider cancellation or zero cost. Do not redispatch an unresolved attempt. This operational deadline does not establish that every 128,000-token response can finish within that time.

## Provider data handling

The PWRP policy permits assessment evidence for every report type when respondent names, account IDs, and email addresses are omitted. The active session record has no respondent-name column; account-like user IDs and encrypted email fields stay in the session and delivery layer. Name, account, and email values found in the decrypted snapshot or session are held only in memory for the egress check. Report generation uses an explicit evidence-field projection that excludes identity fields and respondent-authored notes. Identity field names are rejected across report contracts, while direct contact patterns and exact local identity values are checked in structured request data, schema text, correlation IDs, encoded strings, and outbound metadata. Every provider request requires a reviewed local identity inventory; source-bound fictional qualification fixtures use an empty reviewed inventory, while production extracts it at the snapshot/session boundary. The durable qualification journal checks the fully assembled request before storing it; the HTTP client checks the serialized request before dispatch. Identity values are never attached to provider requests or saved in journals. The only session and snapshot identifiers allowed through are validated opaque IDs. Schema-validated, author-generated IFS-part and pattern labels are allowed; they still pass the direct-identifier checks.

For live `reports:dev` generation or continuation, `--identity-file <path>` is required. The local-only JSON must set `identityInventoryReviewed` to `true` and include `respondentNames`, `accountIds`, `emails`, and `otherIdentityTokens` arrays; use an empty array only when that category is absent for the subject. The sidecar values are used locally and are excluded from run bindings, summaries, request bodies, and attempt journals. The development assessments are source-validated against authored answer choices; the reviewed inventory adds exact-value checks for known names and account values that cannot be inferred from those choices. A missing or unreviewed inventory stops before provider dispatch. The guard also rejects direct email and labeled account-number patterns; generic detection cannot identify an arbitrary unknown name or unlabelled ID unless it is in the reviewed local inventory.

No additional PWRP privacy approval is required for test assessment evidence that meets this identity-free policy. Paid requests still require explicit per-run `--allow-spend`, aggregate-budget, and per-call limits; OpenRouter requests require provider data collection to be denied. The route does not require a zero-data-retention flag and makes no zero-retention promise. The file-based development harness normally sends a derived `snapshot_id` such as `dev-<assessment-digest>-2` rather than reading an account session. Live test generation must use `reports:dev` or the journaled PWRP 7.1 qualification runner. Production activation still requires its separate reviewed qualification manifest and release approval.

Every PWRP 7.1 writer and reviewer request also receives the pinned authored question prompt, selected option, variant, and capture context for each observation. This prevents an answer such as “it varied” from being interpreted without the question it answers. This runtime projection is versioned separately from immutable saved packets and prepared inputs; unresolved question context stops before dispatch and the final request still passes the identity guard.

The context instructs the model to preserve each question's condition, referent, timing, and response-to-aim binding. Fresh writer requests, repairs, and escalation requests constrain evidence and scope references to the current packet using the versioned reference schema. Reviewer acceptance and full local validation remain mandatory. All provider attempts remain unchanged in the journal, including rejected drafts and invalid reviewer responses.

Every runtime request also receives the packet-derived observation/occurrence/context inventory and explicit scope-construction guidance. The authoritative context is `episodes[].context`; multiple occurrences or episode families do not by themselves justify a cross-context scope. Scope repair must reconcile the actual assertion and reader prose with the cited experiences, rather than only adding occurrence IDs.

## Inspect, compare and validate

### Pipeline evaluation outputs

When evaluating the pipeline, preserve the exact provider writer and reviewer outputs as the primary result, including rejected drafts and failures. Readable exports must render the saved draft without changing its prose. Keep the original inputs, model settings, journal, validation events, and run outcome bound to that output. A failed or rejected run remains failed or rejected in the evaluation record.

External reviews may diagnose problems. External revisions belong in a clearly labelled comparison location and must not replace the measured pipeline output or supply its acceptance verdict. Improve the pipeline itself and measure a new official run; passing existing validators on externally revised prose does not establish an end-to-end pipeline success.

Fresh development generation budgets one additional model correction when a review-requested replacement fails structural validation. It receives the exact failed replacement, validator issues, original source, and semantic review; it must repair the supported claim graph and reader coverage rather than mechanically adding citations or claim IDs. The full validator runs again, followed by a fresh official reviewer only if valid. A second structural failure or final non-accept stops the run. Other generator callers retain the default disabled behavior unless they explicitly budget this option.

The active fresh IFS development candidate is `report-dev-luna-high-128k-v2`: `openai/gpt-6-luna`, high effort, exactly 128,000 output tokens for writers and reviewers. It is the default for fresh IFS preparation/generation. Historical 20k candidates retain their objects and hashes for audit/replay, but cannot dispatch new calls. Default report policies for all report types also use 128,000. The journal rejects a new request or wire request with any other output limit. No production qualification is implied.

`--mode inspect --run <directory>` prints a saved summary and files. `--mode compare --left <directory> --right <directory>` requires matching assessment identities and compares source identities, report metadata and reviews. Counts are not a semantic quality judgment.

`--mode validate --assessment <assessment.json> --reports IFS --artifact <artifact.json> --review <review.json>` checks the real artifact and a review bound to the exact draft/evidence. It does not create a fresh model judgment. A well-formed `revise` verdict exits unsuccessfully. Omitting `--review` is structural-only validation, not semantic acceptance.

Generated runs retain prepared inputs, outcomes, validation events, artifacts, reviews and `report.md` for each layer. Exact effective system/user prompts, local schemas, and the canonical serialized wire payload are saved under `provider/requests/` after local privacy checks; the attempt journal binds their hashes. This includes runtime question context and repair/review instructions, not just the Markdown prompt files. `summary.json` separates structural/review status from operational approval. Stage and field-level failures remain in outcomes; failed assessment construction retains partial state separately.

Add `--pdf` to `--mode generate` to export accepted reports through the application's canonical renderer, source/digest validation, text extraction and PNG verification. Each `report.pdf` has a `pdf-verification.json` receipt. Poppler `pdfinfo` and `pdftoppm` are required. Text extraction uses `pdftotext`, or an explicitly configured `PDF_PYTHON_PATH` with `pypdf` when that binary is absent. Set `PDFINFO_PATH`, `PDFTOPPM_PATH`, or `PDFTOTEXT_PATH` for absolute tool paths. A missing tool or verification failure fails the export; it does not turn an unverified PDF into a release artifact.

## Actual execution map

Application: assessment handlers -> `lib/server/assessment/service.ts` -> `pwqe51-session.ts` and `pwqe51-router.ts` -> application snapshot -> `lib/server/reports/steps.ts` -> `pwqe51-packet.ts` -> `pwrp71-adapter.ts` -> `generator.ts` -> structural validation and independent `pwrp71-review.ts` -> renderer/artifact persistence -> existing account-protected report/download/delivery paths.

The customer PWRP 7.1 path requires `createProductionPwrp71Provider`: the real OpenRouter client runs through the same admission and accounting logic as the development journal. Production stores the journal encrypted in `PatternworkV31ReportProviderLedger`, with one aggregate per assessment session across report types, snapshots and workflow attempts. Configure `OPENROUTER_MAX_COST_PER_ASSESSMENT_USD`; `OPENROUTER_MAX_COST_PER_CALL_USD` defaults to `0.50`. The explicit development-run caps are separate from production configuration.

Deployment requires the additive `20261018120000_encrypted_report_provider_ledger` migration and a regenerated Prisma client. Preflight checks the new table. Applying this migration is a deployment operation, not part of local report evaluation. Existing recorded USD costs form a conservative opening balance; incomplete historical billing blocks admission for that session until reconciled. An initialized, unstarted current workflow does not count as unknown historical spending.

Admission atomically verifies the current snapshot and workflow owner and reserves cost before HTTP dispatch. An already admitted request can finish after ownership changes; its receipt still settles, while the stale owner cannot admit another request. Unknown billing retains its reservation. Account deletion cascades to the encrypted session journal, and a late completion cannot recreate it. The production workflow regression exercises the actual client/factory with simulated HTTP and transactional storage; it does not establish a deployed database migration, customer email delivery or production release qualification.

Development: `scripts/report-dev/index.ts` -> `assessment.ts` calls the same session/router -> `verify-assessment.ts` checks saved history -> `workflow.ts` calls the same packet builder, adapter, generator, reviewer and renderer. Its storage boundary is an isolated directory, not the customer database. There is no second report generator.

Interpretation and composition remain parts of one structured writer output: source-linked claims, names and relationships accompany the narrative. A separate reviewer checks source fidelity, substantive coverage and narrative quality. An extra interpretation-model call is deferred until controlled model runs show sufficient benefit to justify its cost and complexity.

## Ownership and safeguards

The router owns issuance, option eligibility, occurrence/step binding and completion. Saved assessments require route replay rather than a JSON hash alone. New recordings use a versioned operation transcript through the production session APIs, including corrections, controls, comparison and replay binding. Captured runtime UUIDs are consumed in exact order during replay because their ordering can affect routing. Historical version-1 assessments remain readable with their original restricted verifier; unrecorded operations in those files fail closed. Neither format requires repeating an unchanged questionnaire when report prose changes.

The packet builder owns source selection/currentness; the adapter owns the minimized model view. New development response records and provider requests contain no respondent-origin classification. Historical archives retain their original bytes, but old warnings and approvals cannot flow into new requests. Retained qualification packets are rebuilt from canonical selections and revalidated against the current report contract. Their old writer-prompt hash does not require repeating an unchanged questionnaire.

The generator owns bounded repair/escalation. Review contract candidate.3 accounts for current evidence, identifies material omissions and separates source fidelity, semantic completeness and narrative quality. Evidence-linked explanatory judgments address functions, triggers, costs, vulnerabilities, relationships and choice where supported by the selected report layer, plus whether a material synthesis opportunity was realized. A reviewer may identify absent support; a schema check cannot establish the truth of that judgment. Human-authored positive, negative and borderline cases calibrate the contract, while real model outputs still need semantic assessment. No word-count or part-count gate determines acceptance. The journal owns dispatch identity, cost reservations and uncertain billing. Account authorization, encrypted persistence, deletion and delivery remain at the existing application boundaries.

## Retired path

The dated October 11–15 direct-provider diagnostic and its 29 fixed-epoch tests are retained as `.ts.txt` in `qualification/pwrp71/archived-diagnostic-contract/`. They are neither executable modules nor passing tests. The old CLI always stops with a migration notice, so its dated approvals cannot authorize another run. Its parallel transport/recovery orchestration is replaced for development by the shared provider and journal.

Earlier stored-report compatibility and historical qualification material remain outside the new PWRP 7.1 prompt path. This continuation does not migrate customer records or change production activation.

## Qualification boundary and next work

See `qualification/pwrp71/report-development-20261016/verification.json` and logs. Two real router-driven assessment profiles and all five report paths are covered offline. The deterministic five-report fixture is not proof of actual psychological prose quality, independent model judgment, provider access or real account delivery.

The remaining empirical gate is a budget-authorized baseline/revised model run against the same saved assessments, followed by content review. Production provider/account-delivery qualification follows. Current version-2 operation transcripts already express corrections, comparisons, controls and replay bindings and must pass exact operation replay. A second interpretation model is not justified before these measurements.

The Python CLI under `reporting/implementation/` is an offline reference boundary, not the paid report pipeline. It resolves the integrated byte-pinned router under `specs/patternwork/question-engine-v5.1/assessment_runtime`; callers using a standalone package can pass an explicit `router_root` to `ReportContract`. Its source/composition regression is run separately with `python -B -m unittest discover -s tests/reporting-reference`.

The high candidate binds `unsuccessfulResponsePolicy: stop-v1` into its configuration and run identity. Every unsuccessful provider response stops that run before another repair or escalation, including missing/empty content and malformed JSON. The original failed response and usage remain in the journal. Historical medium behavior is unchanged.



Report generation in this workflow is authorized only for `openai/gpt-6-luna`. The fixed candidate allowlist and billing admission reject other models. Historical rejected non-Luna attempts remain audit evidence and cannot enable future selection. Sol may review code and diagnostics; it does not replace the report model or pipeline acceptance.

Authored question context v4 explicitly projects D02 response-to-aim relationships using validated option text and exact occurrence/step matches. One action resolves a single relationship; multiple candidates remain ambiguous and missing actions unbound. This D02 list is not an exhaustive inventory of authored relationships: M03 refers to M02's preparation or leaving it alone, and D43 refers to M17's contact response in the same occurrence and step. Preserve those referents using the full question and selected answer; an absent D02-list entry is not evidence that their relationship is unknown. Controls and an explicitly absent particular aim remain distinct from positive stated aims. The model still decides interpretation and prose. No purpose, part, success or recurrence is assigned mechanically. The same projection reaches writers and reviewers; original packets/prepared files and historical outputs remain unchanged. A fresh context version requires a fresh run; historical requests are never rewritten.

The 128,000-token output limit is a shared policy constant, not a CLI-only override. Its conservative full-context price quote is $0.169 per call at the pinned Luna rate ceilings. It remains below the user's $0.50 call cap. Historical completed results can be read without sending a new request; old lower-cap recovery configurations fail before dispatch.
