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

To revise prose from a saved formulation, use the original saved assessment, exactly one report type, and its `formulation.json`:

```powershell
npm run reports:dev -- --assessment <saved-assessment.json> --reports IFS --mode generate --formulation <formulation.json> --identity-file <reviewed-local-identities.json> --allow-spend --budget <authorized-total-in-dollars> --per-call <authorized-per-call-in-dollars>
```

The formulation is bound to the assessment, report, and analytical source. Evidence, analytical prompt, schema, or relevant claim-graph changes reject reuse; compatible voice or narrative edits may reuse it. Narrative generation and fresh review still require explicit spend authorization. The accepted private artifact retains the saved formulation; it is not part of the rendered report.

`OPENROUTER_TIMEOUT_MS` sets the complete HTTP response deadline, including success and error body reads; the default is 1,200,000 milliseconds (20 minutes). A constructor `timeoutMs` takes precedence for controlled callers and tests. The value must be a positive integer within the Node timer range. A timeout keeps its conservative billing reservation and does not prove provider cancellation or zero cost. Do not redispatch an unresolved attempt. This operational deadline does not establish that every 128,000-token response can finish within that time.

## Provider data handling

The PWRP policy permits assessment evidence for every report type when respondent names, account IDs, and email addresses are omitted. The active session record has no respondent-name column; account-like user IDs and encrypted email fields stay in the session and delivery layer. Name, account, and email values found in the decrypted snapshot or session are held only in memory for the egress check. Report generation uses an explicit evidence-field projection that excludes identity fields and respondent-authored notes. Identity field names are rejected across report contracts, while direct contact patterns and exact local identity values are checked in structured request data, schema text, correlation IDs, encoded strings, and outbound metadata. Every provider request requires a reviewed local identity inventory; source-bound fictional qualification fixtures use an empty reviewed inventory, while production extracts it at the snapshot/session boundary. The durable qualification journal checks the fully assembled request before storing it; the HTTP client checks the serialized request before dispatch. Identity values are never attached to provider requests or saved in journals. The only session and snapshot identifiers allowed through are validated opaque IDs. Schema-validated, author-generated IFS-part and pattern labels are allowed; they still pass the direct-identifier checks.

For live `reports:dev` generation or continuation, `--identity-file <path>` is required. The local-only JSON must set `identityInventoryReviewed` to `true` and include `respondentNames`, `accountIds`, `emails`, and `otherIdentityTokens` arrays; use an empty array only when that category is absent for the subject. The sidecar values are used locally and are excluded from run bindings, summaries, request bodies, and attempt journals. The development assessments are source-validated against authored answer choices; the reviewed inventory adds exact-value checks for known names and account values that cannot be inferred from those choices. A missing or unreviewed inventory stops before provider dispatch. The guard also rejects direct email and labeled account-number patterns; generic detection cannot identify an arbitrary unknown name or unlabelled ID unless it is in the reviewed local inventory.

No additional PWRP privacy approval is required for test assessment evidence that meets this identity-free policy. Paid requests still require explicit per-run `--allow-spend`, aggregate-budget, and per-call limits; OpenRouter requests require provider data collection to be denied. The route does not require a zero-data-retention flag and makes no zero-retention promise. The file-based development harness normally sends a derived `snapshot_id` such as `dev-<assessment-digest>-2` rather than reading an account session. Live test generation must use `reports:dev` or the journaled PWRP 7.1 qualification runner. Production activation still requires its separate reviewed qualification manifest and release approval.

PWRP 7.1 now separates interpretation from reader-facing writing. The formulation request receives the current evidence, pinned authored question context, and source/reference bindings so it can preserve each question's conditions, referents, timing, and response-to-aim links. Its structurally validated result is saved before prose generation. The narrator receives an allowlisted projection of supported meaning units, applicability, entities, relationships, and development order; it does not receive authored questions, raw scenarios, evidence IDs, or private alternatives. Each paragraph names meaning-unit IDs, and deterministic code compiles those IDs and their claim dependencies into the validated report draft.

The reviewer receives the original source, saved formulation, and compiled draft. It can accept, request a formulation revision, request a narrative revision, or stop on invalid source. Narrative repair uses the same source-isolated projection as initial writing; formulation repair returns to the evidence-backed analyst stage. Reviewer acceptance and full local validation remain mandatory. All provider attempts remain unchanged in the journal, including rejected drafts and invalid reviewer responses.

Every runtime request also receives the packet-derived observation/occurrence/context inventory and explicit scope-construction guidance. The authoritative context is `episodes[].context`; multiple occurrences or episode families do not by themselves justify a cross-context scope. Scope repair must reconcile the actual assertion and reader prose with the cited experiences, rather than only adding occurrence IDs.

## Inspect, compare and validate

### Pipeline evaluation outputs

When evaluating the pipeline, preserve the exact provider writer and reviewer outputs as the primary result, including rejected drafts and failures. Readable exports must render the saved draft without changing its prose. Keep the original inputs, model settings, journal, validation events, and run outcome bound to that output. A failed or rejected run remains failed or rejected in the evaluation record.

External reviews may diagnose problems. External revisions belong in a clearly labelled comparison location and must not replace the measured pipeline output or supply its acceptance verdict. Improve the pipeline itself and measure a new official run; passing existing validators on externally revised prose does not establish an end-to-end pipeline success.

Each formulation and narrative stage permits one structural correction. The pipeline permits one semantic revision pass, then validates the replacement and obtains a fresh review; the bounded maximum is ten provider calls, subject to the authorized budget. No legacy combined-writer continuation, review-retry, citation-recovery, or review-closure dispatch is accepted for PWRP 7.1. Start a fresh run or reuse a source-bound saved formulation instead. Other report contracts retain their existing behavior.

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

Interpretation and composition are separate stages on the shared PWRP 7.1 path for Mapping, IFS, PV, ATT, and Synthesis. The private formulation retains the evidence-linked claim graph, meaningful units, alternatives, and review notes; the narrator sees only the allowlisted projection. Code compiles paragraph meaning-unit references into claims and citations, and the private formulation is attached to the accepted artifact. A separate reviewer checks both the formulation and prose against the original source. This source update remains a candidate: provider schema qualification, controlled report-quality evaluation, and release approval are still required.

## Ownership and safeguards

The router owns issuance, option eligibility, occurrence/step binding and completion. Saved assessments require route replay rather than a JSON hash alone. New recordings use a versioned operation transcript through the production session APIs, including corrections, controls, comparison and replay binding. Captured runtime UUIDs are consumed in exact order during replay because their ordering can affect routing. Historical version-1 assessments remain readable with their original restricted verifier; unrecorded operations in those files fail closed. Neither format requires repeating an unchanged questionnaire when report prose changes.

The packet builder owns source selection/currentness; the adapter owns the minimized model view. New development response records and provider requests contain no respondent-origin classification. Historical archives retain their original bytes, but old warnings and approvals cannot flow into new requests. Retained qualification packets are rebuilt from canonical selections and revalidated against the current report contract. Their old writer-prompt hash does not require repeating an unchanged questionnaire.

The generator owns stage-routed repair and review. Review contract candidate.4 accounts for the saved formulation, current evidence, material omissions, source fidelity, semantic completeness, and narrative quality. Evidence-linked judgments address functions, triggers, costs, vulnerabilities, relationships, choice, and material synthesis opportunities where supported. A reviewer may identify absent support; a schema check cannot establish the truth of that judgment. Human-authored positive, negative, and borderline cases calibrate the contract, while real model outputs still need semantic assessment. No word-count or part-count gate determines acceptance. The journal owns dispatch identity, cost reservations, and uncertain billing. Account authorization, encrypted persistence, deletion, and delivery remain at the existing application boundaries.

Formulation repair receives the original evidence and bound formulation issues. Narrative repair receives the formulation projection plus bounded editorial tasks; free-form reviewer commentary and raw source are not added to its input. Each replacement passes full validation and a fresh independent review. The interpretation guide's worked example calibrates how intact observations support a developed formulation without turning internal evidence limits into repeated reader caveats.

## Retired path

The dated October 11–15 direct-provider diagnostic and its 29 fixed-epoch tests are retained as `.ts.txt` in `qualification/pwrp71/archived-diagnostic-contract/`. They are neither executable modules nor passing tests. The old CLI always stops with a migration notice, so its dated approvals cannot authorize another run. Its parallel transport/recovery orchestration is replaced for development by the shared provider and journal.

Earlier stored-report compatibility and historical qualification material remain outside the new PWRP 7.1 prompt path. This continuation does not migrate customer records or change production activation.

## Qualification boundary and next work

See `qualification/pwrp71/report-development-20261016/verification.json` and logs. Two real router-driven assessment profiles and all five report paths are covered offline. The deterministic five-report fixture is not proof of actual psychological prose quality, independent model judgment, provider access or real account delivery.

The remaining empirical gate is a budget-authorized baseline/revised model run against the same saved assessments, followed by content review. Production provider/account-delivery qualification follows. Current version-2 operation transcripts already express corrections, comparisons, controls and replay bindings and must pass exact operation replay. A second interpretation model is not justified before these measurements.

The Python CLI under `reporting/implementation/` is an offline reference boundary, not the paid report pipeline. It resolves the integrated byte-pinned router under `specs/patternwork/question-engine-v5.1/assessment_runtime`; callers using a standalone package can pass an explicit `router_root` to `ReportContract`. Its source/composition regression is run separately with `python -B -m unittest discover -s tests/reporting-reference`.

The high candidate binds `unsuccessfulResponsePolicy: stop-v1` into its configuration and run identity. Every unsuccessful provider response stops that run before another repair or escalation, including missing/empty content and malformed JSON. The original failed response and usage remain in the journal. Historical medium behavior is unchanged.



Report generation in this workflow is authorized only for `openai/gpt-6-luna`. The fixed candidate allowlist and billing admission reject other models. Historical rejected non-Luna attempts remain audit evidence and cannot enable future selection. Sol may review code and diagnostics; it does not replace the report model or pipeline acceptance.

Authored question context v7 projects D02 response-to-aim relationships using validated option text and exact occurrence/step matches. One action resolves a single relationship; multiple candidates remain ambiguous and missing actions unbound. This D02 list is not an exhaustive inventory of authored relationships: M03 refers to M02's preparation or leaving it alone, and D43 refers to M17's contact response in the same occurrence and step. Preserve those referents using the full question and selected answer; an absent D02-list entry is not evidence that their relationship is unknown. Controls and an explicitly absent particular aim remain distinct from positive stated aims. The formulation stage sees this context; the narrator receives only the validated formulation projection. A fresh context or analytical-prompt version requires a fresh formulation; a voice-only change may reuse a compatible saved formulation. Historical requests are never rewritten.

The 128,000-token output limit is a shared policy constant, not a CLI-only override. Its conservative full-context price quote is $0.169 per call at the pinned Luna rate ceilings. It remains below the user's $0.50 call cap. Historical completed results can be read without sending a new request; old lower-cap recovery configurations fail before dispatch.

For a separately authorized max-reasoning IFS evaluation, explicitly select `--candidate report-dev-luna-max-128k-v1`. Initial generation, structural and semantic repairs, escalation, and review all use GPT-6 Luna with max reasoning. This candidate permits preparation and fresh generation only; historical recovery paths remain restricted to their original candidates. GPT-6 Luna's currently published maximum completion allowance is 128,000 tokens, including through OpenRouter; 256,000 is unsupported. The fixed candidate retains the 128k output ceiling, stop policy, identity guard, source binding, price ceilings, and explicit invocation budgets. It does not change production activation or the existing high-reasoning default.

## Portrait-quality contract

The current flow uses `PWRP-FORMULATION-3`, `pwrp71-portrait-first-3`, and reviewer candidate.5. Current stage schema names end in `formulation_3`, `narrative_2`, and `review_candidate_5`. Old formulations require fresh analysis; there is no migration that fills empty portraits or relabels old meaning.

Formulation assigns ordinary working names separately from roles, developed meaning units, private guardrails, a cumulative development order, and evidence-warranted IFS portrait facets. The narrator receives only the voice companion, narrative instructions, and the explicit writer projection. Analytical prompts and raw assessment evidence stay upstream. Guardrails constrain writing but cannot be cited as report topics.

Every vulnerability assessment records `examined_claim_ids` separately from its present affect/exclusion/protective-relationship warrants. All settled IFS vulnerability-tagged claims require explicit coverage, including later prospective references. The same assessment may cover a later reference when its reasoning actually applies; coverage is never inferred from dependencies. Warrant IDs must also be examined, but the examination list cannot satisfy a missing warrant. Errors identify the exact uncovered claim. Independent review checks the actual reasoning and rejects superficial coverage assignments. This changes the schema, runtime and analytical binding; the failed version-2 Ellis output cannot be used as a new seed.

A narrator may request a bounded expansion of existing meaning. This consumes the same single semantic revision allowance as reviewer repair, discards stale prose, and requires new narration and independent review. Repeated expansion stops without delivery. Nine anchored editorial judgments are mandatory; any deficient dimension blocks acceptance and routes correction to formulation or narration according to ownership. Mechanical anchors and regression signals are not proof of psychological truth or strong prose. Inspect fresh accepted text against the user's editorial objective as well as the recorded verdict.
