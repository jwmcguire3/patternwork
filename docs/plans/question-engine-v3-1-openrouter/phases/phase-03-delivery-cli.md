# Phase 3 - Delivery and local generation

Implement secure report views, canonical Markdown-to-PDF rendering, idempotent Resend delivery with BCC, webhook status handling, and the local `reports:codex` command.

Done when the web and local paths produce the same validated artifact contracts and delivery cannot release partial or invalid reports.

Status: complete. Secure single-use report access, encrypted artifact/PDF retrieval, PDF verification, idempotent Resend delivery and webhook state, 40 MB attachment splitting, resume-link delivery, local Codex execution, and fail-closed live qualification tooling are integrated. Mocked delivery/CLI tests and the production build pass; live provider, database, and email checks remain activation gates.
