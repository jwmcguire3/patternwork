// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Expecting { answers: { [questionId]: { choice?: string; text?: string; altIndex: number } } }
    const { answers } = body ?? {};

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'answers' payload." },
        { status: 400 }
      );
    }

    // 🔍 This is where you'd save to a database later.
    // For now, just log it so you can verify it's working:
    console.log("Received assessment answers:", answers);

    // You could also generate a simple ID here:
    const assessmentId = crypto.randomUUID();

    return NextResponse.json(
      {
        ok: true,
        assessmentId,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("Error in /api/save-assessment:", err);
    return NextResponse.json(
      { error: "Failed to process assessment." },
      { status: 500 }
    );
  }
}
