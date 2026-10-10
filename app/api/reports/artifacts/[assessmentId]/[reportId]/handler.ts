import { authorizeReportRequest, loadAuthorizedArtifact } from "@/app/reports/_server/access";

export async function GET(request: Request, context: { readonly params: Promise<{ assessmentId: string; reportId: string }> }) {
  const { assessmentId, reportId } = await context.params;
  if (!authorizeReportRequest(request, assessmentId)) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const value = await loadAuthorizedArtifact(assessmentId, reportId);
  if (!value) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return Response.json(value.artifact, { headers: { "Cache-Control": "no-store, private", "Content-Disposition": `attachment; filename="patternwork-${value.reportType.toLowerCase()}-canonical.json"`, "X-Content-SHA256": value.digest, Digest: `sha-256=:${Buffer.from(value.digest, "hex").toString("base64")}:`, "X-Content-Type-Options": "nosniff" } });
}
