# Hub run ledger

- State: phase 4 remediation integrated; independent retest pending
- Status: active
- Accepted contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`
- Base commit: `aa8f50a901ffbd62ad33a35343bfcb4bf6418fba`
- Branch: `codex/question-engine-v3-1-openrouter`
- Population closure: the 26 versioned files under `specs/patternwork/` are canonical implementation inputs.
- Identity/provenance: source-file hashes, bank item/version IDs, snapshot revisions, and artifact digests bind derivatives.
- Artifact closure: canonical JSON is authoritative; Markdown and PDFs are validated derivatives.
- Atomicity/timing: pass completion freezes one immutable snapshot and starts one idempotent report run.
- Historical semantics: artifacts remain bound to their immutable snapshot; no live-answer substitution.
- Comparison equivalence: model qualification uses the same fixture set and acceptance checks for every tier.
- Generated artifacts: source manifests and schemas are committed; drift checks must fail on unreviewed changes.
- Active ownership: hub; all editing workers stopped before the frozen acceptance checkpoint.
- Current checkpoint: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1` accepted 2026-09-02 after hub verification.
- Findings: `PWQE3-ACC-1` through `PWQE3-ACC-8` accepted and remediated; independent retest pending on the next frozen checkpoint.
- Verification: 104/104 integrated tests, TypeScript, Prisma validation, and two consecutive Next.js production builds pass, including 14 durable Workflow steps. Browser acceptance covers consent, semantic/safety controls, encrypted private-note labeling, the static non-saving test, desktop/mobile responsiveness, report landing, and the `/selfmap` redirect with no console errors. A representative Mapping Summary PDF passed text extraction, page-count, rasterization, and visual inspection. Lint has no errors; two generated Workflow routes contain redundant suppression comments.
- Activation remains blocked on production credentials, a live PostgreSQL migration, reviewed OpenRouter qualification output, representative report acceptance, and verified Resend configuration.
