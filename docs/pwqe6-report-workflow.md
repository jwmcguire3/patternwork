# Report workflow contracts

The application selects a report contract from the immutable snapshot's question release. PWQE5.1 snapshots use PWRP 7.1; PWQE5 snapshots use the separate PWQE6 compatibility path. Neither path falls back to an older prompt when its source or activation is invalid.

## PWQE5.1 / PWRP 7.1

`prepareReportInputsStep` loads the exact reviewed activation and prepares source-bound packet inputs. `passReportWorkflow` runs MAP after pass 1, and IFS, PV, ATT followed by Synthesis after pass 2. Layer inputs carry the PWRP release and the frozen packet's actual question release, snapshot and evidence digest. Synthesis receives the accepted current layer drafts. Generation reopens the canonical snapshot and rechecks its response/packet bindings before each dispatch.

Writers, repairs and reviewers use the pinned shared/layer prompts and construct guide. Runtime supplements include authored question context, current observation/scope inventories, exact rejected drafts and feedback as appropriate. Review candidate.3 checks source fidelity, semantic completeness, narrative quality and evidence-linked explanatory adequacy. Model acceptance is a development result, not production qualification or proof of psychological accuracy.

The development CLI uses these same packet, adapter, generator, reviewer and optional canonical PDF implementations, with isolated files in place of customer persistence. It requires local reviewed identity checks, names-free assessment evidence, explicit aggregate/per-call caps and provider data-collection denial. Zero-data-retention routing is not required. Every new phase uses Luna and a 128,000-token output allowance. See `docs/report-development.md`.

## Rendering, release and access

PDF rendering repeats source, packet, claim, lineage and digest validation, then checks extracted text, page count and rendered PNGs. Application persistence encrypts canonical artifacts and PDFs and activates the complete expected pass set in one transaction. Partial generation or failed PDF verification cannot release a partial pass. Account-protected status, report, download, delivery and deletion boundaries remain responsible for customer access and retention.

Local tests use isolated transports/persistence/delivery boundaries. They do not send customer emails, migrate the live database or activate production. Live deployment still requires reviewed qualification, database/deployment readiness and verified delivery configuration.

## PWQE5 / PWQE6 compatibility

The separate v6 worker requires its own byte-pinned question source, v6 prompts/schema and reviewed qualification activation. It binds report type, release, snapshot, current claim references and PDF projection, and uses the same complete-set release boundary. Its historical design status does not confer PWRP 7.1 activation.
