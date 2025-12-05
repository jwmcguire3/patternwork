// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";

// One pool per lambda bundle
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL is not defined");
      return NextResponse.json(
        { error: "Database connection not configured." },
        { status: 500 }
      );
    }

    client = await pool.connect();

    const result = await client.query(
      `
        INSERT INTO assessments (answers, user_email)
        VALUES ($1::jsonb, $2)
        RETURNING id, created_at
      `,
      [JSON.stringify(answers), userEmail ?? null]
    );

    const row = result.rows[0];

    return NextResponse.json(
      {
        ok: true,
        assessmentId: row.id,
        createdAt: row.created_at,
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
  } finally {
    if (client) {
      client.release();
    }
  }
}
