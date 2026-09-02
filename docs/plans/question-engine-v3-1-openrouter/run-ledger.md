# Hub run ledger

- State: phase 2 implementation active
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
- Active ownership: hub plus bounded Phase-2 assessment, persistence, and workflow workers.
- Current checkpoint: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1` accepted 2026-09-02 after hub verification.
- Findings: none
- Verification: 15/15 contract tests, TypeScript check, and Prisma schema validation passed. Canonical source integrity covers 26 files and source-derived authored definitions cover all 112 bank items.
