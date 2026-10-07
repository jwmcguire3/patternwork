# Debug page and report tools

`/debug` is an unlisted, noindex operator page. Its APIs require the separate `PATTERNWORK_DEBUG_TOKEN`; a route name and a robots directive are not authorization. The token is kept in the browser tab's memory and sent as a bearer header. Do not reuse `CRON_SECRET`.

The database panel runs a connection check and returns aggregate counts only. It does not expose respondent rows, contact data, arbitrary queries, or write operations. Debug report jobs are stored in `PatternworkDebugReportRun`; they are separate from assessment sessions, released artifacts, PDFs, and delivery records.

The report runner offers P01–P09 and Mapping, Deepening, or all five reports. It validates each generated draft against the PWQE 6 source and evidence packet, persists completed drafts incrementally, and displays the workflow phase plus elapsed-time feedback while running. It polls the job every 30 seconds. Runs use the configured OpenRouter spend cap.

## Local setup

1. Set `PATTERNWORK_DEBUG_TOKEN` to a unique random value of at least 32 characters in `.env.local`.
2. Configure `OPENROUTER_API_KEY` and a positive `OPENROUTER_MAX_COST_PER_ASSESSMENT_USD`.
3. Apply the additive Prisma migration with `npx prisma migrate deploy` before opening the database panel.
4. Restart the local app after changing environment variables and open `/debug`.

## OpenRouter model

All report qualification candidates and debug report runs use `openai/gpt-6-luna` with `max` reasoning. The configured estimate is $0.10 per million input tokens and $0.50 per million output tokens, matching the [OpenRouter model listing](https://openrouter.ai/openai/gpt-6-luna/). OpenRouter's [chat API reference](https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion) lists `max` reasoning effort and `max_completion_tokens`.

Production report generation remains bound to its reviewed qualification manifest. Activation now rejects manifests pinned to an earlier model or reasoning effort. The debug report runner intentionally produces isolated drafts, so it can exercise the requested model without releasing or emailing them. After the new candidate set completes qualification and human review, deploy its reviewed manifest and digest to activate production generation.
