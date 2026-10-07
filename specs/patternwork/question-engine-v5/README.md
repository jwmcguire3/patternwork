# Patternwork Question Engine v5 Design Package

This directory contains a byte-preserved design-candidate source release and the matching router candidate and v6 report prompts. It is source material for production integration; it is not an activated or validated production release.

## Release identities

- Question release: `PWQE-5.0.0-design.1`
- Router candidate: `PW-ROUTER-1.0.0-candidate.1`
- Prompt release: `6.0`
- Upstream source digest: `bc94e4f06e8331725df477f258754e807bae9ad9e22a2987bcffed67fa839b7c` (from the supplied router package release manifest)

`release-manifest.json` binds these identities to the SHA-256 digest and byte size of every imported source asset. The imported assets are copied byte-for-byte from the supplied release ZIP and checked against its `RELEASE_MANIFEST.json`. This README and the generated `release-manifest.json` are package metadata; they are not part of the imported source asset hashes.

## Included source assets

- `assessment/question_bank.json`: authoritative question bank.
- `architecture/routing_targets.json` and `architecture/item_gates.json`: routing target catalog and per-item gates.
- `examples/worked_paths.json` and `examples/negative_cases.json`: reference paths and negative cases.
- `reports/*.md`: all seven supplied v6 report prompt Markdown files, including the shared contract and reviewer prompt.
- `schemas/report_draft.schema.json` and `schemas/router_packet.schema.json`: report draft and router packet schemas.

The reference Python router/runtime and its tests are not included in this production package. The authored material remains marked as a design candidate pending production integration and qualification.

## Migration policy

The user explicitly states that there are no old assessments requiring preservation and waives legacy assessment compatibility. Production migration may replace the prior assessment system without retaining old records on the prior contract. This policy is documentation only and is not included in the immutable imported-source asset hashes.
