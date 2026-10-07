# PWQE6 report workflow

The report worker consumes the router packet frozen into each PWQE5 assessment snapshot. It validates the packet against the byte-pinned source package, checks the packet and snapshot digests, and checks that current observations and sequence edges resolve before preparing provider input.

The worker loads the seven v6 prompt files and `report_draft.schema.json` through the pinned source loader. It requires the reviewed PWQE5 qualification activation to bind the question release, router release, prompt release, report contract, evidence contract, and source manifest. The same activation hash is stored in each generated artifact. Missing or mismatched activation fails before generation.

Generated drafts must match the v6 schema and the exact report type, release, and snapshot. Claim evidence references must resolve to current packet evidence. Occurrence scope must resolve to packet episodes; person scope is rejected because the packet establishes no person identities. The worker derives reader Markdown from validated draft fields and binds the report, snapshot, source, qualification manifest, packet, and Markdown digests in the stored artifact.

PDF rendering repeats schema, lineage, and digest checks. The existing workflow then stores artifacts and PDFs in one transaction and activates the complete report set together. A partial pass cannot become reader visible.

The authored question release remains marked `PWQE-5.0.0-design.1`, and its router is a candidate release. Installing the source files does not establish production validation or provider approval. Offline fixtures establish source-level consistency only; the deployment must have an exact human-reviewed qualification manifest before live generation. The supplied reviewer prompt remains a review aid and is not treated as approval evidence.

Migration policy follows the user's explicit waiver: there are no old assessments to preserve, and new assessments do not need legacy report or snapshot bindings. The workflow therefore accepts the pinned PWQE5 snapshot contract and fails closed for other snapshot contracts.
