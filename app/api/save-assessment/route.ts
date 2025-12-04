import { NextResponse } from "next/server";
import { createClient } from "@vercel/postgres";

export async function GET() {
  return NextResponse.json({ ok: true, route: "save-assessment" });
}

export async function POST(req: Request) {
  let client = null;

  try {
    console.log("save-assessment POST hit");

    const body = await req.json();
    const { answers, userEmail } = body ?? {};

    if (!answers || typeof answers !== "object") {
      return NextResponse.json(
        { error: "Missing or invalid 'answers' payload." },
        { status: 400 }
      );
    }

    const connString = process.env.POSTGRES_URL;

    if (!connString) {
      console.error("POSTGRES_URL is not defined");
      return NextResponse.json(
        { error: "Database connection not configured." },
        { status: 500 }
      );
    }

    client = createClient({ connectionString: connString });
    await client.connect();
    console.log("Connected to DB");

    const result = await client.sql`
      INSERT INTO assessments (answers, user_email)
      VALUES (${answers}, ${userEmail ?? null})
      RETURNING id, created_at;
    `;

    const row = result.rows[0];
    console.log("Insert complete:", row);

    return NextResponse.json(
      {
        ok: true,
        assessmentId: row.id,
        createdAt: row.created_at,
      },
      { status: 200 }
    );
  } catch (err) {
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
      } catch {}
    }
  }
}
