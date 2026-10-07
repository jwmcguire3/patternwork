# Remaining production work

The local PWQE5/PWQE6 integration and machine qualification workflow are implemented. Production remains fail closed while the live OpenRouter qualification and human review finish.

## Required before production

1. Let the current capped qualification finish and confirm it writes a complete pending-review package.
2. Review every generated report draft and qualification reference. Approve the claim-safety, traceability, fixture-comparability, and model-pin checklist as a named reviewer.
3. Produce the reviewed activation manifest from the exact successful run and reviewer approval. Do not hand-edit or invent its run, approval, or digest fields.
4. Configure `OPENROUTER_QUALIFICATION_MANIFEST_JSON` and the exact canonical digest in `OPENROUTER_QUALIFICATION_MANIFEST_SHA256` in the deployment. The application verifies both values and all pinned PWQE5 identities before creating sessions or generating reports.
5. In the deployment environment, run report preflight, apply the debug-report migration, configure `PATTERNWORK_DEBUG_TOKEN`, confirm delivery services, and complete one browser-to-report flow with the approved manifest.

## Current evidence boundary

- Offline source qualification passes for 9 fictional worked profiles, 14 negative cases, 9 Mapping packets, and 9 Pass 2 packets with zero provider calls. Approval remains not reviewed.
- Mock provider tests pass all 45 profile/report pairs, repair, same-profile synthesis, cost-cap blocking, resume without duplicate calls, and approval-to-activation validation.
- The current capped OpenRouter run is in progress. At 11:31 EDT, 69 attempts were complete: 65 passed and 4 failed at $0.749516 of the $1 cap. `MAP`, `IFS`, `PV`, and `ATT` selected GPT-6 Luna at max; SYNTHESIS P07 was in progress. Three `direct_pii` failures are old-detector false positives (`account doesn`, `account records`, and `account without`); one P03 failure is `evidence_occurrence_scope`. The account-ID matcher has since been tightened and its focused regression tests pass.
- No named reviewer approval or activation manifest has been produced.
- The ZIP's authored package root release manifest has a stale pytest-log hash and omits later verification artifacts. The separate router deliverable manifest matches its entries. The native Windows Python reference run had one `PYTHONPATH` separator failure; the router package makes no native Windows runtime claim.
- The user confirmed there are no old assessments to migrate or preserve and no legacy support is needed. The application rejects old assessment contract keys for new sessions.
