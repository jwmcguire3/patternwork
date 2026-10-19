# IFS system-portrait experiment — P02 / C10

Status: **experimental, no dispatch, not PWRP 7.1 active source**.

## Why this pair

- **P02 — manager/firefighter change of job:** an authored disagreement includes D61.explain, D02.prevent, D07.leave, D08.after_failed, D10.relief, D03.connection, and D09.relief on the same occurrence. The protected relational connection and reactive withdrawal are good material for a functional portrait, but do not establish a habitual sequence, enduring pair of independent parts, developmental history, or a recurring loop. One original D06 anchor did not enter the v5 canonical session.
- **C10 — functioning while strained and recovery conditions:** all 21 archived selected answers survive in v5, including D30.stuck, D34.words, D35.choice, D80.task, D81.steady_strained, D85.function_first, D36.input/words/think (two adjacent before-edges), D84.later_day, D86.setting and D100.same_less. This supports a substantial lived-state portrait, with attention, function, partial order and recovery meaning; it **does not necessarily establish multiple IFS protectors or an Exile**.
- They are two different fictional people; **not** a matched positive/negative pair. The pair tests whether the composer develops different internal architectures instead of imposing the same parts template on both. Use P07 later as a restraint control, not a third implied full report.

These 25 profiles have complete synthetic Mapping scaffolds. No individual v5 fictional case establishes an exhaustive real-person IFS system. A good report must be as developed as its actual observations allow, not artificially expanded to hit a word count. For the next experiment, evaluate **full-length style and structure within the supported scope**, explicitly recording what cannot legitimately be expanded.

## Candidate objective

Move from recounting interview episodes or auditing each assertion toward functional portraits: **In situations of this kind, [part] acts in this way to protect [need/concern]. Doing so changes [experience, behavior or available choice].** The sentence is an underlying *reasoning pattern*, not a mandatory prose template.

The report should:
- Lead with a recognizable account of how the person's internal system works.
- Use compact functional part names such as **Minimizer**, if the action warrants them; avoid fixed archetype lookup tables, theatrical names, or generic labels like “Manager” as names.
- Develop each important supported part's job, concerns, effects, tradeoffs, relationships and conditions of flexibility; preserve the difference between preventive and reactive jobs.
- Explain meaningful relationships, then context-specific alternatives, without treating separate scenarios as a transcript.
- Speak *to* the reader in plain second-person prose; do not talk about questionnaires, “the packet”, “in IFS terms”, or “an event-scoped formulation”.
- Avoid repetitive disclaimers and defensive hedging, **but preserve scope** in the underlying claims. Do not translate one recalled occurrence into “you always”, “whenever”, or a proven trait.
- Describe an underlying kind of situation rather than the literal test event or empty references to “in a different situation”.
- Put the nonclinical note outside the body as document framing.
- Write as much as the supported system requires. Neither the number of sections nor the number of parts is a quota.

## Files

1. `01_INTERPRETATION_CONTRACT.md` — fixed internal claims, part identity, names, functional relationships, uncertainty and evidence rules.
2. `02_IFS_NARRATIVE_COMPOSER.md` — writer-facing prose standard and output contract.
3. `03_NARRATIVE_REVIEW.md` — independent consumer and evidence review.
4. `04_ASTRA_ARCHITECTURE_HANDOFF.md` — integration map for all report types next pass.
5. `candidate-pair.json` — exact profile constraints and acceptance probes.
6. `scripts/experiment-pwrp71-narrative/prepare-system-portrait.mjs` — no-dispatch, hash-pinned prompt preparation from current v5 report evidence and source. It is *not* a qualified provider request or a production report-generation path.

## How to stage the next run

```powershell
node scripts/experiment-pwrp71-narrative/prepare-system-portrait.mjs --profile P02 --output <writable-dir>
node scripts/experiment-pwrp71-narrative/prepare-system-portrait.mjs --profile C10 --output <writable-dir>
node --test scripts/experiment-pwrp71-narrative/prepare-system-portrait.test.mjs
```

Pass the produced `*.interpretation.input.json` to a reasoning-capable interpretation model, validate its claim/part/relationship ledger against the production schema and current packet. Then pass only **validated claims**, accepted names/roles, scope, uncertainties and current supporting observations to the composer along with `02_IFS_NARRATIVE_COMPOSER.md`. A separate reviewer evaluates the composed reader narrative using `03_NARRATIVE_REVIEW.md`. Keep a claim-to-paragraph trace and new draft/review hashes. The files do **not** make provider calls or manufacture approval.

Do not edit active pinned `reporting/prompts/`, `reporting/schemas/`, the v5 fixtures, router, approved PWRP source manifest, qualification/activation gates, or current model pins in this pass.

## Success

P02: a developed portrait of how prevention and reaction relate, while remaining precise about the limits of their observed order and role identities.

C10: a comparably useful but *different* portrait of retained functioning amid internal constraint, recovery and agency. Its report must not invent firefighters or exiles to match P02.

Both: evidence-faithful prose where a person could describe the useful finding without learning IFS or recalling the questionnaire. No arbitrary report-length rule; no report-wide false certainty.
