# Patternwork

Patternwork is a private, non-diagnostic self-reflection application. The current assessment is the deterministic Patternwork Question Engine v3.1: a two-pass, evidence-driven experience that saves progress, freezes immutable assessment snapshots, and turns validated evidence into client-facing reports.

The assessment does **not** use AI to ask, choose, route, score, or safety-check questions. AI is used only after a pass is complete, when a server-side workflow sends a pseudonymous, validated evidence packet to OpenRouter. The same report contracts can also be run locally through Codex CLI.

This instrument is not empirically validated and must not be presented as therapy, diagnosis, medical care, or a clinical assessment.

## Current status

The v3.1 implementation is complete and has passed its local acceptance gate. Production report delivery intentionally fails closed until all live activation requirements are met.

- The live assessment is at `/assessment`.
- A static, non-saving test is available from the consent and recovery screens.
- `/selfmap` redirects to `/assessment`.
- Pass 1 produces a Mapping Summary (`MAP`).
- Pass 2 is optional and produces IFS, polyvagal (`PV`), attachment (`ATT`), and synthesis reports.
- Answers, snapshots, report artifacts, encrypted PDFs, access tokens, and email delivery state are stored in PostgreSQL through Prisma.
- Canonical report JSON is authoritative. Markdown and PDF files are validated derivatives.
- Live database migration, OpenRouter qualification, representative report review, Vercel Workflow/cron deployment, and Resend verification remain deployment gates. Mocked or local success does not satisfy them.

The implementation record and latest gate status live in [`docs/plans/question-engine-v3-1-openrouter/run-ledger.md`](docs/plans/question-engine-v3-1-openrouter/run-ledger.md).

## End-to-end flow

```text
Consent + email
    -> encrypted assessment session + signed HTTP-only cookie
    -> deterministic Pass 1 routing and autosave
    -> immutable Pass 1 snapshot
    -> validated pseudonymous evidence packet
    -> durable Mapping Summary workflow
    -> secure result page + PDF + email
    -> user finishes OR chooses optional Pass 2
    -> deterministic deepening and safety routing
    -> immutable Pass 2 snapshot
    -> validated IFS/PV/ATT packets
    -> IFS, polyvagal, and attachment reports
    -> validated synthesis bundle and synthesis report
    -> atomic release of the complete report set
    -> secure pages/PDFs + idempotent email delivery
```

Completion is evidence-driven, so the UI shows stage progress rather than promising a fixed question count.

## Repository map

| Path | What it contains |
| --- | --- |
| [`app/assessment/`](app/assessment/) | The one-interaction-at-a-time assessment UI, interaction renderers, autosave client state, consent, pause/recovery, pass completion, and non-saving preview. |
| [`app/api/assessment/`](app/api/assessment/) | Session start/resume, authoritative state, response saving, pause/resume, pass completion, and user-initiated deletion. |
| [`app/reports/`](app/reports/) | Secure report landing, magic-link consumption, responsive report views, PDF links, and deletion control. |
| [`app/api/reports/`](app/api/reports/) | Authorized report status, artifact rendering, PDF downloads, and fresh access-link requests. |
| [`app/api/resend-webhook/route.ts`](app/api/resend-webhook/route.ts) | Resend delivery/bounce webhook handling. |
| [`app/api/cron/assessment-retention/route.ts`](app/api/cron/assessment-retention/route.ts) | Authenticated retention cleanup endpoint called by Vercel cron. |
| [`lib/question-engine/`](lib/question-engine/) | Typed instrument manifest, authored/renderable loaders, response libraries, source-integrity checks, executable routing contracts, and evidence-packet validation. |
| [`lib/report-contracts/`](lib/report-contracts/) | Canonical report and synthesis types, JSON Schema loaders, cross-object validation, canonical JSON, and digest checks. |
| [`lib/server/assessment/`](lib/server/assessment/) | Server-authoritative assessment service, deterministic router, trusted-evidence derivation, resume links, snapshot/workflow adapter, retention, and deletion. |
| [`lib/server/security/`](lib/server/security/) | AES-256-GCM envelopes, email lookup HMAC, signed session cookies, and scoped single-use token helpers. |
| [`lib/server/reports/`](lib/server/reports/) | Packet construction, prompt privacy, generation, validation, synthesis, workflow steps, persistence, and status authorization. |
| [`lib/server/openrouter/`](lib/server/openrouter/) | OpenRouter transport, zero-data-retention policy, qualification ladder, activation binding, retry/escalation, usage, and cost-cap enforcement. |
| [`lib/server/pdf/`](lib/server/pdf/) | Canonical Markdown-to-PDF rendering plus text, page-count, and rendered-page verification. |
| [`lib/server/email/`](lib/server/email/) and [`emails/`](emails/) | Resend transport, email composition, BCC, attachment splitting, webhook state, and replay-safe delivery. |
| [`workflows/pass-report.ts`](workflows/pass-report.ts) | Production Vercel Workflow entry point. Pass 1 generates `MAP`; Pass 2 generates `IFS`, `PV`, `ATT`, then `SYNTHESIS`. |
| [`prisma/schema.prisma`](prisma/schema.prisma) | PostgreSQL data model, including retained legacy models and additive v3.1 models. |
| [`prisma/migrations/20260902150000_patternwork_v31_persistence/`](prisma/migrations/20260902150000_patternwork_v31_persistence/) | Additive v3.1 migration. It does not delete historical assessment data. |
| [`specs/patternwork/`](specs/patternwork/) | Immutable, versioned Question Engine v3.1 and Report Prompts v4.1 source packages plus source hashes. |
| [`scripts/report-cli/`](scripts/report-cli/) | Local Codex report path reusing production packet, prompt, schema, validator, synthesis, PDF, and naming contracts. |
| [`scripts/qualify-openrouter/`](scripts/qualify-openrouter/) | Live OpenRouter model qualification and explicit human-approval tooling. |
| [`tests/`](tests/) | Contract, safety/routing, UI, persistence, privacy, workflow, delivery, PDF, CLI, qualification, retention, and replay tests. |
| [`docs/plans/question-engine-v3-1-openrouter/`](docs/plans/question-engine-v3-1-openrouter/) | Accepted plan, phase packets, contract IDs, run ledger, verification record, and activation gates. |

Other public pages such as `/`, `/method`, `/companion`, and `/cannawithdrawl` are existing site content and are not part of the v3.1 engine.

## Canonical contracts and source data

The implementation contract is `PWQE3-CONTRACT-2`; the source-integrity contract is `PWQE3-INTEGRITY-1`. The package is `3.1.0`, the prompt release is `4.1.0`, and the writer template is `PWRP-V4.1`.

The 26 files under [`specs/patternwork/`](specs/patternwork/) are canonical inputs. [`specs/patternwork/source-manifest.v3.1.json`](specs/patternwork/source-manifest.v3.1.json) binds them by SHA-256. The compiled instrument contains:

- 17 interaction families;
- 112 versioned inventory, Mapping, and Deepening items;
- 34 Mapping and 27 Deepening items in the 61-item active executable routing surface;
- 91 response libraries;
- evidence packet, report artifact, and synthesis schemas;
- Mapping, IFS, polyvagal, attachment, synthesis, and shared v4.1 prompt contracts.

[`lib/question-engine/routing-contracts.ts`](lib/question-engine/routing-contracts.ts) is the reviewed `PWQE3-ACC-2.1` executable routing layer. [`lib/question-engine/manifest.ts`](lib/question-engine/manifest.ts) is the typed identity/index layer; authored question text is loaded from the versioned source package rather than duplicated as another source of truth.

Do not casually edit a source file, prompt, option ID, bank item ID, routing contract, schema, or digest. These are contract changes and require updated source hashes, drift tests, fixtures, and review evidence.

## Assessment behavior and trust boundary

The UI supports consent and non-diagnostic language, one item at a time, stage progress, keyboard and screen-reader use, reduced motion, pause, skip, autosave status, recovery screens, and a list alternative to body maps.

The server—not the browser—decides what routing and report evidence is trustworthy:

- Responses use optimistic revisions; stale writes conflict instead of overwriting newer progress.
- `Idempotency-Key` makes response writes and pass completion safe to retry.
- The server derives `PWTE-1` trusted evidence from the authored item and allowed option IDs.
- Client-supplied `trustedEvidence`, `objectEvidence`, and answer order are not accepted as provenance.
- Private notes are encrypted, may be restored to the authorized user, and are excluded from routing and provider prompts.
- Routing enforces high-arousal limits, recovery/resource transitions, the post-body-map gate, contradiction handling, pause/skip behavior, and resource-oriented endings.
- Pass completion freezes an encrypted immutable snapshot before report work starts.

The static test uses the real assessment presentation but starts no session and saves nothing. It checks presentation only—not persistence, routing, or report generation.

## Persistence and privacy

The v3.1 Prisma models are prefixed `PatternworkV31`:

- `PatternworkV31SourceRelease`
- `PatternworkV31AssessmentSession`
- `PatternworkV31AccessToken`
- `PatternworkV31AssessmentResponse`
- `PatternworkV31AssessmentSnapshot`
- `PatternworkV31EvidencePacket`
- `PatternworkV31ReportRun`
- `PatternworkV31ReportArtifact`
- `PatternworkV31ReportDelivery`

Sensitive fields use versioned AES-256-GCM envelopes. Email lookup uses a separate HMAC so addresses can be matched without storing searchable plaintext. Session and report access use HTTP-only, SameSite=Lax cookies and scoped, hashed, single-use links; cookies are secure outside development.

Retention:

- abandoned/incomplete sessions: 30 days;
- completed sessions, answers, snapshots, artifacts, and PDFs: 365 days;
- user-authorized deletion: immediate purge through `DELETE /api/assessment`;
- scheduled cleanup: daily at `03:00 UTC` through [`vercel.json`](vercel.json), protected by `CRON_SECRET`, in batches capped at 100.

### Legacy code

The legacy `SelfMapAssessmentProgress` model and legacy `/api/save-assessment` and `/api/selfmap-progress` routes remain for compatibility. They are **not** part of the encrypted v3.1 workflow:

- `app/api/save-assessment/route.ts` writes raw answers to the older `assessments` table and uses the older submission-email path.
- `app/api/selfmap-progress/route.ts` contains a placeholder hard-coded user ID and must not be treated as production authentication.
- `app/selfmap/questions.ts` and `app/assessment/questions_data.ts` are legacy question data.

Do not extend these routes for v3.1, expose them as the new architecture, or remove them and their historical rows without a separate reviewed migration and explicit approval.

## HTTP interfaces

| Method and route | Purpose |
| --- | --- |
| `POST /api/assessment/start` | Create a consented session, or preserve an authenticated one; set the cookie and send a resume link. Email alone never authenticates an old session. |
| `GET /api/assessment/resume?token=…` | Consume a scoped, single-use token, establish the cookie, and redirect without retaining the token in browser history. |
| `GET /api/assessment/state` | Return authoritative stage, current interaction, saved draft, revision, and report status without caching. |
| `PUT /api/assessment/response` | Idempotently save a partial/completed/skipped response using `expectedRevision`, derive trusted evidence, and route deterministically. |
| `POST /api/assessment/pause` | Persist or resume the safe routing state. |
| `POST /api/assessment/complete-pass` | Freeze Pass 1 or Pass 2 and enqueue one idempotent workflow; accepts `continue` or `finish` where applicable. |
| `DELETE /api/assessment` | Purge the authenticated assessment and clear its session cookie. |
| `GET /api/reports/status` | Return report-run state only for an authorized assessment session. |
| `POST /api/reports/request-link` | Send a fresh secure link with an enumeration-resistant response. |
| `GET /api/reports/artifacts/:assessmentId/:reportId` | Return a validated, released artifact to an authorized viewer. |
| `GET /api/reports/download/:assessmentId/:reportId` | Return the bound decrypted PDF after authorization. |
| `POST /api/resend-webhook` | Verify and record Resend delivery events. |
| `GET /api/cron/assessment-retention` | Run bounded retention cleanup after bearer authentication. |

[`app/reports/consume/route.ts`](app/reports/consume/route.ts) exchanges a single-use `VIEW_REPORT` token for a scoped report-view cookie. Unauthorized report artifact and download requests intentionally return a non-revealing not-found response.

## Report workflow and release

[`workflows/pass-report.ts`](workflows/pass-report.ts) is production orchestration. [`lib/server/reports/pipeline.ts`](lib/server/reports/pipeline.ts) is the synchronous/test pipeline; do not mistake it for the deployed durable entry point.

The workflow validates the snapshot, constructs or loads packets, initializes idempotent runs, calls the model, validates canonical output, records usage, builds synthesis, renders and verifies PDFs, releases the complete set atomically, and delivers email.

Important invariants:

- OpenRouter receives only pseudonymous validated packets or a validated synthesis bundle—never email, private notes, access tokens, cookies, names, free text, or a flat raw-answer export.
- Provider requests require structured JSON output, zero-data-retention routing, and data collection denied.
- Outputs may not diagnose or infer unsupported trauma/origins/childhood, physiology or vagal state, global attachment style, exile, or advice beyond the supplied evidence.
- An invalid response gets one repair attempt at the same tier, then one escalation tier.
- Every call is checked against the remaining per-assessment cost cap before it is sent.
- Usage records model/provider identifiers, generation IDs, attempts, input/output/reasoning tokens, and returned cost.
- Invalid, incomplete, or over-budget work is not released or emailed.
- Pass 2 is all-or-nothing; partial layer reports are never activated for the client.
- Email uses deterministic idempotency keys. Completed parts are not resent; interrupted parts resume with the same provider key.
- Attachments split into at most two messages when necessary, with the secure bundle link in both.
- PDF verification checks page count, PNG rendering, and at least 97% extracted-text coverage.

## Local setup

Requirements:

- Node.js compatible with Next.js 16 and npm;
- PostgreSQL for saved sessions or database-backed tests;
- Poppler executables `pdfinfo`, `pdftotext`, and `pdftoppm` for full PDF verification;
- Codex CLI installed and authenticated for local report generation;
- Vercel CLI when developing or deploying Workflow features locally.

Install and initialize:

```bash
npm install
cp .env.template .env.local
npx prisma generate
npx prisma migrate deploy
npm run dev
```

On Windows PowerShell:

```powershell
Copy-Item .env.template .env.local
```

`prisma migrate deploy` changes the configured database. Confirm `DATABASE_URL` points to the intended database before running it.

## Environment variables

Use [`.env.template`](.env.template) as the sanitized variable-name inventory. It contains placeholders only. Local values belong in ignored `.env.local`; production values belong in Vercel environment variables. The developer-owned `.env.example` is also ignored because it may contain local values.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by Prisma. |
| `APP_DATA_ENCRYPTION_KEY` | Base64-encoded independent 32-byte AES key for assessment/report envelopes. |
| `APP_DATA_ENCRYPTION_KEY_VERSION` | Active envelope key version, normally `v1`. Old versions must remain available while old rows still exist. |
| `EMAIL_LOOKUP_HMAC_KEY` | Base64-encoded independent 32-byte key for normalized email lookup hashes. |
| `ASSESSMENT_COOKIE_SECRET` | Base64-encoded independent 32-byte key for assessment cookies and delivery-bound access. |
| `NEXT_PUBLIC_APP_URL` | Public canonical app origin used in resume/report links. |
| `RESEND_API_KEY` | Resend API key for resume and report email. |
| `EMAIL_FROM` | Verified sender address/domain in Resend. |
| `REPORT_BCC_EMAIL` | Owner BCC address; its fingerprint is stored with delivery state. |
| `RESEND_WEBHOOK_SECRET` | Signing secret for delivery/bounce webhook verification. |
| `CRON_SECRET` | Bearer secret protecting the retention endpoint. |
| `OPENROUTER_API_KEY` | OpenRouter credential. This is the exact name used by the app. |
| `OPENROUTER_MAX_COST_PER_ASSESSMENT_USD` | Positive explicit USD ceiling checked before each report call. Choose a value covering the reviewed pinned routes; never leave it blank in production. |
| `OPENROUTER_QUALIFICATION_MANIFEST_JSON` | Exact contents of `reviewed-activation-manifest.json` produced after live qualification and human approval. Never invent it. |
| `OPENROUTER_QUALIFICATION_MANIFEST_SHA256` | Canonical SHA-256 printed by the approval command for that exact manifest. Never use a placeholder or a differently serialized file hash. |
| `OPENROUTER_APP_URL` | Optional OpenRouter application/referrer URL. |
| `OPENROUTER_APP_NAME` | Optional OpenRouter application name. |
| `OPENROUTER_MODEL_LUNA`, `OPENROUTER_MODEL_TERRA`, `OPENROUTER_MODEL_SOL` | Optional qualification candidate overrides. Changing one requires requalification. |
| `OPENROUTER_MODEL_DEEPSEEK` | Not currently read by the application. Setting it has no effect unless the reviewed qualification policy is deliberately extended and requalified. |
| `NEXT_PUBLIC_SHOW_ASSESSMENT_DEVTOOLS` | Set to `true` only when browser development controls should be visible. |

Compatibility fallbacks `PATTERNWORK_APP_URL` and `PATTERNWORK_EMAIL_HMAC_KEY` exist in code, but new deployments should use the names in `.env.template`.

Generate each secret independently. Never reuse the encryption, HMAC, cookie, cron, or webhook secret for another purpose.

## OpenRouter qualification and activation

Runtime generation fails closed unless a reviewed manifest and its deployment-pinned digest validate exactly. The candidate ladder is Luna/low, Luna/medium, Terra/medium, then Sol/high. Mapping, layer, and synthesis routes are pinned independently to the lowest configuration that passes every machine and human gate.

1. Configure `OPENROUTER_API_KEY`, a deliberate `OPENROUTER_MAX_COST_PER_ASSESSMENT_USD`, and any model overrides.
2. Run live A/B/C fixture qualification:

   ```bash
   npm run reports:qualify -- --output .tmp/openrouter-qualification
   ```

3. Review the generated artifacts for prohibited claims, traceability, fixture comparability, and content quality. The result remains `pending_review` until human approval.
4. Create approval JSON bound to the `qualificationRunSha256` and `draftPinsSha256` in `pending-review.json`. Its exact type is `QualificationReviewApproval` in [`lib/server/openrouter/qualification.ts`](lib/server/openrouter/qualification.ts).
5. Bind that approval to the exact run:

   ```bash
   npm run reports:qualify -- --output .tmp/openrouter-qualification --approval approval.json
   ```

6. Put the full contents of `reviewed-activation-manifest.json` into `OPENROUTER_QUALIFICATION_MANIFEST_JSON`. Put the exact printed digest into `OPENROUTER_QUALIFICATION_MANIFEST_SHA256`.
7. Redeploy, run a representative end-to-end assessment, and approve the reports before enabling production delivery.

A changed prompt, schema, source manifest, candidate model, reasoning effort, output-token limit, pin set, approval, or digest invalidates activation and requires requalification.

## Local report generation with Codex CLI

```bash
npm run reports:codex -- --input <results-or-packet.json> --output <directory>
```

Accepted inputs are a raw canonical assessment result/snapshot, an array or wrapper of validated evidence packets, or a validated synthesis bundle. The command invokes `codex exec --ephemeral --sandbox read-only` with the production output schema and writes:

- `<report>.codex-response.json`;
- `<report>.validation.json`;
- `<report>.canonical.json`;
- `<report>.md`;
- `<report>.pdf`;
- output schemas, a synthesis bundle when required, and `manifest.json`.

These local outputs are **plaintext**. Store and share their directory accordingly.

Output remains local by default. To bind validated artifacts to an existing immutable database snapshot:

```bash
npm run reports:codex -- --input <input.json> --output <directory> --persist-assessment <assessment-session-id>
```

Persistence succeeds only when the input resolves to a matching stored snapshot. The CLI reuses production validators and artifact contracts, but its provider and zero-cost local usage record are intentionally distinct from OpenRouter.

## Commands and verification

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start local Next.js. |
| `npm run build` | Compile the production app and Workflow definitions. |
| `npm run start` | Serve a completed production build. |
| `npm run lint` | Run ESLint. |
| `npm run typecheck` | Run TypeScript without emitting files. |
| `npm test` | Run the complete TSX test suite. |
| `npm run test:contracts` | Run source, manifest, schema, packet, and delivery contract tests. |
| `npm run reports:qualify -- --output <dir>` | Run live OpenRouter qualification and create a pending review package. |
| `npm run reports:codex -- --input <file> --output <dir>` | Generate validated local reports through Codex CLI. |
| `npx prisma validate` | Validate the Prisma schema and datasource. |
| `npx prisma migrate deploy` | Apply committed migrations to the configured database. |

Before merging behavior or contract changes:

```bash
npm run lint
npm run typecheck
npm test
npx prisma validate
npm run build
```

For UI changes, also verify consent, static preview, pause/resume, every affected interaction family, recovery transitions, stage progress, desktop/mobile layout, keyboard operation, reduced motion, and browser console errors. For PDF changes, verify extracted text, page count, overflow, rendered PNG pages, and visual output—not just that a PDF exists.

## Vercel deployment checklist

1. Add every required environment variable for the intended Vercel environments.
2. Apply the committed Prisma migration to the production database.
3. Confirm the Workflow deployment compiles and resumes safely after retry/redeploy.
4. Confirm the daily retention cron is installed. Vercel cron does not run on preview deployments.
5. Complete live OpenRouter qualification and human review, then install the exact reviewed manifest and digest.
6. Verify the Resend sender domain, sender address, BCC, webhook secret, delivery events, replay behavior, and large-attachment split path.
7. Test the full user story: start, autosave, pause, cross-device resume, Pass 1, receive/view Mapping Summary, optional Pass 2, receive/view all four reports, then delete.
8. Review representative A/B/C outputs before treating delivery as production-ready.

## Guidance for coding agents and LLMs

Start with this README and repository instructions, then read the accepted [`plan.md`](docs/plans/question-engine-v3-1-openrouter/plan.md) and [`run-ledger.md`](docs/plans/question-engine-v3-1-openrouter/run-ledger.md). Before changing semantics, read the relevant canonical Question Engine file and corresponding Report Prompts shared contract.

Preserve these boundaries:

- Questions, routing, scoring, safety handling, and snapshot construction stay deterministic.
- Treat server-derived trusted evidence as the only routing/report provenance.
- Never send identity, private notes, free text, access tokens, cookies, or unfiltered raw answers to a provider.
- Keep canonical JSON authoritative and bind derivatives by digest.
- Keep report release all-or-nothing and delivery replay-safe.
- Keep authorization scoped; never authorize by email alone.
- Preserve immutable historical snapshots and legacy rows.
- Do not weaken schema, traceability, prohibited-claim, source-integrity, qualification, cost, or retention gates to make a test pass.
- Do not claim live PostgreSQL, OpenRouter, Resend, Workflow, or cron success unless exercised in that environment.
- Update tests and this README when paths, contracts, variables, or operational behavior change.

When investigating a bug, trace it in this order:

```text
browser state
  -> assessment API
  -> lib/server/assessment/service.ts
  -> routing.ts + trusted-evidence.ts
  -> Prisma snapshot
  -> workflow step
  -> packet/prompt validator
  -> provider result
  -> canonical artifact
  -> PDF + delivery authorization
```

This separates presentation problems from source-contract, persistence, provider, and delivery failures.

## Implementation history

The phased build record is under [`docs/plans/question-engine-v3-1-openrouter/`](docs/plans/question-engine-v3-1-openrouter/):

- [`plan.md`](docs/plans/question-engine-v3-1-openrouter/plan.md) — architecture and shared contracts;
- [`phase-01-contracts.md`](docs/plans/question-engine-v3-1-openrouter/phases/phase-01-contracts.md) — source import, manifest, schemas, validators, and persistence;
- [`phase-02-app-surfaces.md`](docs/plans/question-engine-v3-1-openrouter/phases/phase-02-app-surfaces.md) — assessment UI, APIs, resume, and workflow;
- [`phase-03-delivery-cli.md`](docs/plans/question-engine-v3-1-openrouter/phases/phase-03-delivery-cli.md) — report views, PDF/email, and Codex CLI;
- [`phase-04-acceptance.md`](docs/plans/question-engine-v3-1-openrouter/phases/phase-04-acceptance.md) — independent acceptance and release gates;
- [`run-ledger.md`](docs/plans/question-engine-v3-1-openrouter/run-ledger.md) — accepted checkpoint, verification, resolved findings, and live activation work.

If this README and an accepted versioned contract disagree, stop and reconcile the drift rather than silently choosing one.
