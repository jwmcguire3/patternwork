// This named command remains as an explicit, fail-closed migration notice.
// No dated authorization, journal, source pin or provider transport is reused.
console.error("The October 2026 one-off diagnostic is retired. Use npm run reports:dev -- --case mara --reports all for offline preparation. Paid generation requires a fresh --mode generate --allow-spend --budget and --per-call invocation. See docs/report-development.md.");
process.exitCode = 1;
