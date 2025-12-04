// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@vercel/postgres";

export async function GET() {
  return NextResponse.json({ ok: true, route: "save-assessment" });
}

export async function POST(req: Request) {
  let client;
  try {
    const body = await req.json();
    const { answers, userEmail } = body ?? {};

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'answers' payload." },
        { status: 400 }
      );
    }

    console.log("API HIT, answers:", answers);

    // Use a direct client with the connection string from env
    client = createClient({
      connectionString: process.env.POSTGRES_URL,
    });

    await client.connect();

    const result = await client.sql`
      INSERT INTO assessments (answers, user_email)
      VALUES (${answers}::jsonb, ${userEmail ?? null})
      RETURNING id, created_at;
    `;

    const row = result.rows[0];

    return NextResponse.json(
      {
        ok: true,
        assessmentId: row.id,
        createdAt: row.created_at,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
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
  } finally {
    if (client) {
      try {
        await client.end();
      } catch {
        // ignore
      }
    }
  }
}
