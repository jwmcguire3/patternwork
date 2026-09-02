# Patternwork v3.1 Assessment and AI Report Pipeline

Status: active
Branch: `codex/question-engine-v3-1-openrouter`
Contract: `PWQE3-CONTRACT-2` / `PWQE3-INTEGRITY-1`

## Finished state

- `/assessment` runs the deterministic two-pass v3.1 instrument with durable save/resume.
- Pass 1 produces a validated Mapping Summary through OpenRouter; Pass 2 optionally produces IFS, PV, ATT, and synthesis artifacts.
- Canonical JSON and derived PDFs are stored, exposed through secure links, and delivered through Resend with configured BCC.
- A local Codex CLI command produces the same artifact contracts from exported results or packets.

## Build sequence

1. Freeze the instrument, schema, validator, and persistence contracts.
2. Implement assessment UI, session persistence, and report workflow in disjoint scopes.
3. Add report viewing, PDF/email delivery, and local Codex CLI generation.
4. Integrate, freeze a checkpoint, independently review, fix accepted findings, and retest.

## Activation gates

- Mocked provider and email paths must pass before credentials are required.
- Live report generation remains disabled until `OPENROUTER_API_KEY` is supplied and fixture outputs are accepted.
- Production email remains disabled until Resend credentials, sender domain, and `REPORT_BCC_EMAIL` are configured.

