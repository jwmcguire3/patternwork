# C01 / C02 — controlled reader-narrative experiment, v1

**Status:** Editorial prototype on already generated fictional IFS reports. No provider dispatch, production activation, source/router/prompt changes, or independent semantic acceptance.

## Hypothesis

A separate, audience-facing composition can express an already validated IFS claim graph more clearly than the original v7 sections, without changing what the system concluded.

This v1 experiment uses **two fixed, manually edited compositions** rather than another model call. It therefore tests the desired narrative contract and claim preservation, **not** whether an autonomous narrative composer can consistently produce that quality. A later experiment can replace the human-authored composition with a model candidate and compare blind.

## Controls and changes

The two original live IFS JSON artifacts are the control group. They are required input files, not reproduced or modified here. The JSON specs pin their artifact IDs, artifact SHA-256 digests and packet evidence digests.

The proposed drafts preserve `draft.claims`, `draft.relationships`, their claim identifiers, observation/sequence/currentness references, report source identity, and roles/name IDs. Editable surfaces are exactly: title, title-claim placement, section prose/order/headings/claim references, **name labels on existing IDs**, and reflection questions. Nothing can add an inferred part or revise its evidence basis. `N1` in C01 retains the original internal label `Need for care`; the narrative deliberately describes the vulnerable need naturally instead of forcing a third character name. C01's `N2/N3` become **Minimizer/Suppressor**, and C02's `N1` becomes **Minimizer**. This controlled pair does not establish a universal naming dictionary.

The reader previews put the required nonclinical frame at the bottom; this is **not** the canonical PWRP artifact. Canonical markdown keeps the existing fixed front disclaimer and may be passed to production draft validation. This experiment makes no change to production display, PDF, reviewer policy, or source manifest.

## Reproduce (from repository root)

Copy the actual accepted `C01_IFS.json` and `C02_IFS.json` files to a local, non-production working directory. They must match the hashes pinned in `C01.json` / `C02.json`.

```powershell
node scripts/experiment-pwrp71-narrative/index.mjs --c01 "C:\path\to\C01_IFS.json" --c02 "C:\path\to\C02_IFS.json" --output-dir .qualification/narrative-c01-c02-v1
node --test scripts/experiment-pwrp71-narrative/compose.test.mjs
npx tsx scripts/experiment-pwrp71-narrative/verify-production.ts --output-dir .qualification/narrative-c01-c02-v1
```

For integration checks against the real uploaded outputs, set `PWRP71_C01_IFS_SOURCE` and `PWRP71_C02_IFS_SOURCE` before `node --test`. The production verifier uses the **existing** `validatePwrp71ReportDraft` and the exact v5 packet of each profile. It only creates `production-validation.json` when both new drafts pass. If the repository's current question/report source or v5 packet has drifted, it fails closed; do not forge a new source identity.

Output per profile:

- `*_IFS.candidate.json`: new fully hashed, source-bound artifact with **frozen structured claims**.
- `*_IFS.canonical.md`: canonical prose under the *unchanged* v7 markdown frame.
- `*_IFS.reader-preview.md`: alternative editorial-facing preview, **not** a production artifact.
- `*_IFS.audit.json`: original/new digests, proof of frozen claims and parts/relationships, **pending** production/semantic review markers.

The control outputs remain unmodified. Existing reviewer receipts do not transfer to the new draft hashes. A new independent semantic/narrative reviewer must assess the new drafts before any consumer release.

## Target discrimination

- **C01:** An externally smaller help request coincides with internally judging and pushing away the need. Identifies a preventive **Minimizer** and a reactive **Suppressor**; preserves the supported vulnerable Exile formulation in structured claims without forcing an awkward public name. Help is offered but some of the need remains unspoken.
- **C02:** Externally similar smaller request, but the person can allow the need internally and says when more remains. Identifies a **Minimizer** but does **not** manufacture an Exile or Firefighter. The two reports must not converge into the same portrait.

## Acceptance criteria for a later independent review

Evaluate accuracy and readability separately. Check names are concise and used naturally; the lead communicates the central insight; the need/help outcome remains correct; practical constraints and other-context alternatives remain available without dominating the story; no unobserved childhood origin, handoff, causation, globally stable identity, or actual behavior of the other person is invented. Judge C02's absence of an Exile as a correct restraint result, not missing conceptual coverage.

Report claim coverage and independent reading quality separately. These curated prototypes are not evidence that a model can reliably produce reader-quality prose, and do not authorize production release.
