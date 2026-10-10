import { GET as getJson } from "./responses.json/handler.ts";
import { GET as getPdf } from "./responses.pdf/handler.ts";

export async function GET(request: Request, context: { readonly params: Promise<{ assessmentId: string }> }): Promise<Response> {
  const format = new URL(request.url).searchParams.get("format");
  if (format === "json") return getJson(request, context);
  if (format === "pdf") return getPdf(request, context);
  return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
