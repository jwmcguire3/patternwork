# C01/C02 live semantic evaluation

**Status: unavailable.** No complete report was generated, so there is no report text or claim set to grade against CQ01.

## C01

- **Applicable case:** CQ01, positive internal-exclusion case.
- **Packet:** C01 IFS packet SHA-256 `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036`.
- **Source distinction:** The packet retains the authored observations `D20.need`, `D65.judge`, `D66.compelled`, `D67.not_allowed`, `D68.pushed`, `D69.less_notice`, and `D92.more_hidden`. These support examining how an outwardly minimized help request coexists with judgment, compulsion, concealment, help offered, and remaining need.
- **Provider result:** One OpenAI-only C01 IFS request received HTTP 200. The completed response used 21,376 input tokens and 20,000 output tokens, all 20,000 counted as reasoning, and returned finish reason `length`. The provider client recorded `invalid_json`: the response had no string JSON content. There is no C01 report artifact, report passage, validation result, or reviewer receipt.
- **Evaluation:** Evidence faithfulness, coverage, alternatives, missingness discipline, specificity, and narrative quality are **not evaluable**. The source packet is suitable for the intended contrast, but no report demonstrated or contradicted it. Do not interpret the failed generation as `insufficient_evidence` or as a semantic judgment.

## C02

- **Applicable case:** CQ01, negative-control contrast to C01.
- **Packet:** C02 IFS packet SHA-256 `c14bbcbd4ff8b6f69c1074b12a15d9132be9d3373d5d825257ff5dcf8ad61055`.
- **Source distinction:** The packet retains `D20.none`, `D65.patient`, `D66.choice`, `D69.hidden_only`, `D92.more_asked`, and `D23.stay`. D67/D68 remain unadministered under the authored source condition for `D20.none`. This supports restraint about inventing internal exclusion, an exile, or a pathological protector from the similar outward behavior.
- **Provider result:** C02 was not dispatched because C01 failed generation before validation and automated review. There is no C02 report, output passage, usage, validation result, or reviewer receipt.
- **Evaluation:** C02 report quality and model discrimination of the negative control are **not evaluable**. The packet contrast remains present in the source evidence, but the model was never tested on C02.

## Comparison verdict

The source packets preserve the intended positive/negative distinction. The live experiment produced no complete report for C01 and no C02 report; therefore no independent report-quality comparison can be made. No human approval, semantic approval, router qualification, or production activation follows from this run.
