# Raw-hash lineage note

The earlier artifacts in this directory were composed offline. A separate Sol review compared their embedded contract strings and candidate-pair content with the PR #20 merged commit `f7ebd87894e972c16bf9e38b955c2e0003a1aca6` and found them equal after normalizing Windows CRLF line endings and terminal newlines. The raw SHA-256 values and derived experiment hash differ because the merged Git blobs use LF; the semantic text/pair content is unchanged.

These earlier drafts remain useful offline comparison artifacts. They are not provider-generated outputs, and their old experiment hash is not interchangeable with the fresh hash produced by the byte-for-byte merged-commit restaging in `../20261014-openai-contract-run-v1/`.
