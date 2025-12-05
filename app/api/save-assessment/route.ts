// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ ok: true, route: "save-assessment" });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { answers, userEmail } = body ?? {};

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'answers' payload." },
        { status: 400 }
      );
    }

    // Just generate a fake ID for now
    const assessmentId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `fake-${Date.now()}`;

    console.log("Received assessment:", {
      assessmentId,
      userEmail: userEmail ?? null,
      answers,
    });

    return NextResponse.json(
      {
        ok: true,
        assessmentId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/save-assessment:", err);

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
        ? err
        : "Unknown error";

    return NextResponse.json(
      { error: "Failed to process assessment.", detail: message },
      { status: 500 }
    );
  }
}
