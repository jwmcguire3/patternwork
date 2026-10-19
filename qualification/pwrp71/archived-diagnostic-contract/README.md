# Retired one-off provider diagnostic

These `.ts.txt` files preserve the previously executable October 11–15 diagnostic and its historical contract tests. They are not runtime modules or active test targets.

The old program coupled dated approvals, report-source hashes, provider pricing epochs, routing qualification and recovery receipts to a parallel orchestration path. It must not be adapted by relabeling past authorization as permission for new calls. The old CLI now always stops with a migration notice.

Current implementation: `scripts/report-dev/` calls the production generator, packet adapter, independent review and the shared durable provider journal. Current safeguards are tested by `tests/report-dev/`, `tests/report-workflow/pwrp71-generation.test.ts`, `pwrp71-review.test.ts`, `pwrp71-qualification-attempts.test.ts`, `pwrp71-qualification-runner.test.ts` and `tests/openrouter/`.

Historical tests are preserved as text rather than reported as passed or silently skipped. Their fixed-source success expectations do not apply to the new reporting contract. This retirement is not provider qualification or production activation.
