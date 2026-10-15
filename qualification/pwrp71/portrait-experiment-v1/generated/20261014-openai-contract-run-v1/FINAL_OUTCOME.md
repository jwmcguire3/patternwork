# P02/C10 fictional IFS report diagnostic — final outcome

**Run status:** Complete for the authorized P02/C10 fictional diagnostic. No further provider requests were sent.

## Reports

| Profile | PWRP 7.1 draft validation | Independent semantic result | Report |
|---|---|---|---|
| P02 | Pass, zero issues | Revise: two moderate evidence-linkage/context findings | `outputs/P02.report.attempt-2.schema-projection-v3.md` |
| C10 | Pass, zero issues | Partial: no material unsupported claim; several supported details are omitted | `outputs/C10.report.attempt-3.md` |

P02's independent review finds that D02's broad aim (“what might happen next”) and D03's separately stated concern (losing contact or not knowing where they stood) are linked too definitively in the prose. It also asks the report to surface unresolved practical context and the possibility of concurrent aims. The generated prose remains unedited and preserved. Its hash-bound review is `outputs/P02.report.attempt-2.schema-projection-v3.sol-semantic-review-20261015.md`.

C10's reviewer finds the report faithful, but notes omissions of the coarse first-easing time estimate, moves toward less input, and difficulty speaking despite wanting to. The hash-bound review is `outputs/C10.composition.attempt-3.sol-semantic-review-20261015.md`.

## P02 adapter correction

The report validator initially rejected intermediate graph labels that do not exist in the pinned PWRP schema. The local, versioned normalization now maps candidate response functions to `descriptive_pattern` without asserting IFS part identity; omits `reported_temporal_sequence` from the closed relationship enum while preserving the source-linked temporal claim and prose; and retains the premise observations required by the report validator for the derived exit claim. The provider response, composition, interpretation graph, prompts and schemas remain unchanged. The normalization receipt records those projections and the retained evidence lineage. Earlier rejected drafts and receipts are preserved.

## Provider and budget record

- Provider/model: direct OpenAI API, `gpt-6-luna`, `max` reasoning.
- The successful P02 composition request used a 128,000 output-token cap and returned 5,855 input / 14,334 output tokens. Its conservative usage-derived estimate is $0.012215.
- Six generation attempts received HTTP 200 responses; three P02 interpretation attempts have unknown billing outcomes and retain $0.90 in locked reservations. Two DNS failures were independently reconciled as pre-provider no-dispatches.
- Total settled token-derived upper-bound estimate: $0.164404. Remaining authorization after settled usage and the locked reserves: $1.935596 of $3.00. These are journal estimates, not invoice amounts.
- No attempt with unknown billing was automatically repeated. No more provider calls are planned for this run.

## Verification

- Full test suite: 482/482 passed.
- Focused normalization tests: 7/7 passed.
- Typecheck: passed.
- Production build: passed; existing broad dynamic-file-pattern and stale browser-mapping warnings remain.
- Scoped ESLint: passed without findings.
- P02 and C10 final report-draft validation: passed with zero issues each.

This is fictional diagnostic evidence only. The independent reviews are model reviews, not human approval or routing qualification. Production activation is unchanged.
