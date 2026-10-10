import { NextRequest, NextResponse } from "next/server";
import { requestReportAccessLink } from "@/lib/server/assessment";
import { publicBaseUrl } from "@/lib/server/assessment/http";

const generic = { accepted: true, message: "If a current assessment exists, a secure link will be sent." };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  let body: { email?: unknown } = {};
  try { body = await request.json(); } catch { /* Keep enumeration-safe behavior. */ }
  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (emailPattern.test(email)) {
    try { await requestReportAccessLink({ email, baseUrl: publicBaseUrl(request) }); }
    catch (error) { console.error("Resume-link request delivery failed", error); }
  }
  return NextResponse.json(generic, { status: 202, headers: { "Cache-Control": "no-store" } });
}
