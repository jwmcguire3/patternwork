import { authorizeReportRequest, loadAuthorizedPdf } from "@/app/reports/_server/access";

const names: Readonly<Record<string, string>> = { MAP: "patternwork-mapping-summary.pdf", IFS: "patternwork-ifs-report.pdf", PV: "patternwork-polyvagal-report.pdf", ATT: "patternwork-attachment-report.pdf", SYNTHESIS: "patternwork-synthesis-report.pdf" };

export async function GET(request: Request, context: { readonly params: Promise<{ assessmentId: string; reportId: string }> }) {
  const { assessmentId, reportId } = await context.params;
  if (!authorizeReportRequest(request, assessmentId)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const value = await loadAuthorizedPdf(assessmentId, reportId);
  if (!value) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(value.pdf), { headers: { "Cache-Control": "no-store, private", "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${names[value.reportType] ?? "patternwork-report.pdf"}"`, "Content-Length": String(value.pdf.byteLength), "X-Content-SHA256": value.digest, Digest: `sha-256=:${Buffer.from(value.digest, "hex").toString("base64")}:`, "X-Content-Type-Options": "nosniff" } });
}
