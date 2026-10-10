import { authorizeResponseExportRequest, loadPinnedResponseExport, serializePwre1Envelope } from "@/lib/server/exports";
import { sha256 } from "@/lib/server/security";

const unavailable = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });

export async function GET(request: Request, context: { readonly params: Promise<{ assessmentId: string }> }): Promise<Response> {
  const { assessmentId } = await context.params;
  const grant = authorizeResponseExportRequest(request, assessmentId);
  if (!grant) return unavailable();
  const envelope = await loadPinnedResponseExport(grant);
  if (!envelope) return unavailable();
  const bytes = serializePwre1Envelope(envelope);
  const fileDigest = sha256(bytes);
  return new Response(new Uint8Array(bytes), { headers: {
    "Cache-Control": "no-store, private",
    Pragma: "no-cache",
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": "attachment; filename=\"patternwork-responses.json\"",
    "Content-Length": String(bytes.byteLength),
    "X-Patternwork-Export-SHA256": envelope.contentSha256,
    Digest: `sha-256=:${Buffer.from(fileDigest, "hex").toString("base64")}:`,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  } });
}
