# C01 IFS error-detail resend

Date: 2026-10-12
Run: `gate11-c01-error-detail-resend-20261012`
Parent run digest: `3959ea731dc6effa86703060023007bb1a9f97fbbb8a0c3eff1d0f0a0ea254c6`

## Outcome

One provider request was dispatched for fictional profile C01, IFS, using `openai/gpt-6-luna` at reasoning effort `max`. The live OpenRouter endpoint preflight identified three matching OpenAI endpoints; the request pinned OpenAI only and disabled provider fallbacks. Non-ZDR was explicitly allowed for this request, with `data_collection: deny` retained.

The request received HTTP 400 from OpenAI. The upstream code was `invalid_json_schema`. The captured provider message was:

> Invalid schema for response_format 'patternwork_ifs_pwrp71_candidate_1': In context=('properties', 'report_release'), schema must have a 'type' key.

This identifies the immediate rejection: the transmitted `report_release` property schema is represented by a `const` without an explicit JSON Schema `type`. The authoritative draft schema at `reporting/schemas/report_draft.schema.json` has the same shape for that property. The error is about strict response-schema validation, not provider permissions, ZDR routing, model availability, or lack of an HTTP response.

Other property schemas in the same draft contract also use `enum` or `const` without an explicit `type`: `report_type`, `content_status`, `claims[].kind`, `claims[].scope.level`, `name_registry[].entity_kind`, `name_registry[].role`, and `relationships[].relation`. They have not each been individually rejected by OpenAI in this run; they are additional candidates for source-contract review. The current wire projection removes the schema's `allOf` keyword, so its nested conditional branches were not part of this provider request.

No question source, report prompt, report schema, or fixture was changed for this resend. No automatic correction, repair, second generation, reviewer call, or C02 request ran. The provider error detail is retained in `attempts.json` under `diagnostic.providerErrorRaw`; dispatch and final run receipts are in `dispatches.json` and `run.json`.

## Request and spend evidence

- Packet SHA-256: `c4b8363436f22b34b28095b155158cb5716bc397d6231a284b5c6d710df4e036`.
- Serialized body SHA-256: `4db2ad54d5fcb3de6d1753c0d3f90dfd169983beb668e8cf15e0a5bad93e735c`; this matches the prior rejected OpenAI non-ZDR request exactly.
- Response-schema SHA-256: `8f0f6f91d4037a2c929253bc21e35c96bc3f86c4c28193cafefe22640fb5b451`.
- Reservation: $0.115 for this request. The two earlier unresolved attempts in the same $3 epoch retain $0.230 in reservations.
- Total held against the epoch after this request: $0.345; remaining authorization by reservation accounting: $2.655.
- Provider-reported token usage and cost: none. Invoice status for all three unresolved attempts remains unknown; the reservation is not a guaranteed invoice maximum.

## Execution record

- Initial sandboxed run stopped at DNS preflight (`ENOTFOUND`) and dispatched no generation request.
- The authorized network-enabled run dispatched exactly one generation request and recorded its HTTP 400 response. A local receipt finalization step then failed on an absent optional request ID; the durable attempt journal already contained the provider error detail.
- The receipt was finalized offline from the attempt and dispatch ledgers. No additional provider request was made.
- Routing qualification remains `not_claimed`; production activation effect is `none`.
