import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { renderAndVerifyCanonicalPdf, renderMarkdownPdf, verifyExtractedText } from "../../lib/server/pdf/renderer.ts";
import type { MappingSummaryArtifact } from "../../lib/report-contracts/types.ts";

test("canonical PDF binds source text, page count, PNG verification, and byte digest", async () => {
  const artifact = JSON.parse(await readFile("specs/patternwork/question-engine-v3.1/12c_mapping_summary_artifact.json", "utf8")) as MappingSummaryArtifact;
  const extractedText = artifact.report_markdown;
  const pdf = await renderAndVerifyCanonicalPdf({ reportType: "MAP", artifact, verification: { async verify(bytes) {
    assert.equal(bytes.subarray(0, 5).toString("ascii"), "%PDF-");
    const pageCount = Math.max(...Array.from(bytes.toString("latin1").matchAll(/\/Count (\d+)/gu), (match) => Number(match[1])));
    const pngPages = Array.from({ length: pageCount }, () => { const value = Buffer.alloc(128); Buffer.from("89504e47", "hex").copy(value); return value; });
    return { extractedText, pageCount, pngPages };
  } } });
  assert.match(pdf.sha256, /^[a-f0-9]{64}$/u);
  assert.equal(pdf.pageCount, pdf.layout.pageCount);
  assert.equal(pdf.pngPageCount, pdf.pageCount);
  assert.throws(() => verifyExtractedText(artifact.report_markdown, "unrelated output"), /coverage/u);
});

test("long Markdown paginates within layout guardrails", async () => {
  const markdown = Array.from({ length: 100 }, (_, index) => `## Reflection ${index + 1}\n\nThis is a deliberately long descriptive paragraph for pagination and overflow verification.`).join("\n\n");
  const rendered = await renderMarkdownPdf(markdown, "Long-content layout test");
  assert.ok(rendered.layout.pageCount > 5);
  assert.ok(rendered.layout.pageCount <= 80);
  assert.ok(rendered.layout.minimumRemainingPoints >= 0);
  assert.equal(rendered.bytes.subarray(0, 5).toString("ascii"), "%PDF-");
});
