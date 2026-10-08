# PWQE 5.1 → PWRP 7.1 packet reconciliation

Basis: merged routing/tooling candidate at `ccce21c2`; source packages and authored question/report assets remain unchanged.

## Corrected consumer/producer disagreements

1. `target_resolutions[].comparison_ids` are occurrence IDs, whereas `context_comparisons[]` has no `id` field. Validate pair membership against current actual episodes and recorded distinctness.
2. A pair-scoped target can legitimately cite current observations from either side of an explicitly confirmed comparison. Other targets remain strictly same-occurrence.
3. Open/unresolved/unavailable/declined targets can refer to a prospective step without an observed `steps[]` row. An answer/resolution cannot be excused as merely prospective.
4. The router's replay-derived `distinctFrom` and `linkedFrom` now flow through the packet, even when no initial Mapping pass comparison decision exists.

Tests added for prospective target steps, allowed and rejected pair-wide evidence, and replay-derived comparison preservation. Full repository test execution has not been performed by this connector-based change.

## What the 125-output offline report actually means

The previously reported run produced 30 accepted mock outputs and 95 blocked outputs. The pattern `19 profiles × 5 report types = 95` indicates profile-level gating, not 95 unrelated model failures.

The reported blocked profile IDs are P01–P09, C03, C04, C07–C10, C12–C13, C15, C16 (19). The remaining C01, C02, C05, C06, C11, C14 comprise six profiles (30 mock outputs). The exact per-profile error-code distribution is not available in the pushed repository: the local `.qualification/pwrp71/.../pending-review-package.json` and full run artifact were not committed. Do not claim the precise causal split until the run ledger is retrieved or regenerated.

## Fixture classification and migration

- P01–P09: authored adapted branch histories from the first report system, not validated PWQE 5.1 session transcripts. Their current loader projects preauthored episode/answer relationships through `compilePwqe51Route`. Retain original signed byte-pinned archives as historical reference, and create separately versioned canonical PWQE 5.1 replay-derived fixture packets. Do not infer missing responses, root basis or distinctness from a desired report conclusion.
- C01–C16: archived candidate evidence packets, not the current public-session canonical answer history. Reconstruct qualified candidates by driving the actual new session/router APIs with `FICTIONAL_PLANS.json` authored answers and bindings; preserve the original originals for audit. Where a fictional plan does not yield a valid packet, mark missing evidence rather than invent it.
- Negative/semantic cases: keep as qualification criteria; they are not secretly additional user responses.
- Re-run each fixture through: authored answers → canonical current response log → router projection → `buildPwqe51RouterPacket` → pinned router schema → `preparePwrp71Request` for MAP/IFS/PV/ATT; synthesis only with accepted same-profile IFS/PV/ATT artifacts.

## Next executable acceptance

1. Run the focused packet/adapter tests and then full `npm test`, `npm run typecheck`, `npm run build`.
2. Export machine-readable per-profile blocked issue codes and JSON paths from the new offline runner; deduplicate by root cause, not by five report layers.
3. Rebuild P and C fictional cases as qualification v2 fixtures from the current public assessment semantics. Keep old asset digests and new packet digests side by side. Do not silently recast old profiles as independently qualified.
4. Re-run the 125-item mock matrix and prove each formerly blocked profile is either valid or has a specific evidence-supported missingness reason. Do not switch provider/human approvals on.
5. Run authenticated database/browser assessment including replay, correction, reload, resume and snapshot seal before paid provider qualification.

## Still requiring focused work

- D36 option-level ordering edges must have a consistent representation with the steps required by the report packet and its adapter. Do not fabricate extra observed situations to satisfy edge validators.
- Full correction/currentness of replay comparisons and end-to-end session credentials must be checked after fixture replay migration.
- If semantic approval involves source files/prompt updates, invalidate affected prior candidate report pins explicitly.
