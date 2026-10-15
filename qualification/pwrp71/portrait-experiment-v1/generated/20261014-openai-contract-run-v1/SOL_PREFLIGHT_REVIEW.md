# Sol preflight review record

A separate read-only `gpt-6-sol` review compared the previous staged contracts/pair against PR #20 merge commit `f7ebd87894e972c16bf9e38b955c2e0003a1aca6`.

Finding: the old contract hashes differ from merged blob hashes because the old files were read with Windows CRLF line endings and terminal newline normalization. The contract text and parsed candidate-pair content are substantively the same. The old reports can remain as offline comparison artifacts, but they cannot be relabeled as provider output or carry the new experiment hash.

Action: preserve the old folder; stage new P02/C10 inputs byte-for-byte from the merged commit and v5 fixture blobs; use only those staged inputs for this provider run; verify exact contract, fixture, source, and packet pins before the first generation request.

This model review is not human approval, semantic approval, router qualification, or production authorization.
