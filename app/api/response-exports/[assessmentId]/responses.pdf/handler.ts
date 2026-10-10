import { authorizeResponseExportRequest, loadPinnedResponseExport, renderAndVerifyResponseExportPdf } from "@/lib/server/exports";

const unavailable = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function GET(request: Request, context: { readonly params: Promise<{ assessmentId: string }> }): Promise<Response> {
  const { assessmentId } = await context.params;
  const grant = authorizeResponseExportRequest(request, assessmentId);
  if (!grant) return unavailable();
  const envelope = await loadPinnedResponseExport(grant);
  if (!envelope) return unavailable();
  const pdf = await renderAndVerifyResponseExportPdf(envelope);
  return new Response(new Uint8Array(pdf.bytes), { headers: {
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "Content-Type": "application/pdf",
    "Content-Disposition": "attachment; filename=\"patternwork-responses.pdf\"",
    "Content-Length": String(pdf.bytes.byteLength),
    "X-Patternwork-Export-SHA256": pdf.contentSha256,
    Digest: `sha-256=:${Buffer.from(pdf.sha256, "hex").toString("base64")}:`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  } });
}
