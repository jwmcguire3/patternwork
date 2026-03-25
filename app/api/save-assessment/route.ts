import { NextResponse } from "next/server";
import { Pool } from "pg";

import { sendAssessmentSubmissionEmail } from "@/lib/server/assessment-submission-email";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

type SaveAssessmentPayload = {
  userEmail?: unknown;
  log?: unknown;
  answers?: unknown;
};

function answeredCountFromAnswers(answers: unknown): number | undefined {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return undefined;
  }

  return Object.values(answers).filter((answer) => {
    if (!answer || typeof answer !== "object") {
      return false;
    }

    const maybeSelected = (answer as { selected?: unknown }).selected;
    return Array.isArray(maybeSelected) && maybeSelected.length > 0;
  }).length;
}

async function saveAssessmentToDatabase(
  userEmail: string,
  answers: unknown
): Promise<{ assessmentId: string | null; createdAt: string | null }> {
  if (!process.env.DATABASE_URL) {
    return { assessmentId: null, createdAt: null };
  }

  const client = await pool.connect();

  try {
    const result = await client.query(
      `
        INSERT INTO assessments (answers, user_email)
        VALUES ($1::jsonb, $2)
        RETURNING id, created_at
      `,
      [JSON.stringify(answers ?? {}), userEmail]
    );

    return {
      assessmentId: result.rows[0]?.id ?? null,
      createdAt: result.rows[0]?.created_at?.toISOString?.() ?? null,
    };
  } finally {
    client.release();
  }
}

export async function POST(req: Request) {
  let body: SaveAssessmentPayload;

  try {
    body = (await req.json()) as SaveAssessmentPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const userEmail =
    typeof body.userEmail === "string" ? body.userEmail.trim().toLowerCase() : "";
  const log = typeof body.log === "string" ? body.log.trim() : "";

  if (!userEmail || !emailPattern.test(userEmail)) {
    return NextResponse.json(
      { error: "A valid 'userEmail' is required." },
      { status: 400 }
    );
  }

  if (!log) {
    return NextResponse.json(
      { error: "Missing required 'log' field." },
      { status: 400 }
    );
  }

  const submittedAt = new Date().toISOString();
  const answeredCount = answeredCountFromAnswers(body.answers);

  try {
    await sendAssessmentSubmissionEmail({
      userEmail,
      submissionTimestampIso: submittedAt,
      answeredCount,
      log,
      answers: body.answers,
    });
  } catch (error) {
    console.error("Error sending internal assessment email:", error);
    return NextResponse.json(
      { error: "Failed to send assessment submission email." },
      { status: 502 }
    );
  }

  try {
    const { assessmentId, createdAt } = await saveAssessmentToDatabase(
      userEmail,
      body.answers
    );

    return NextResponse.json(
      {
        ok: true,
        assessmentId,
        createdAt,
        submittedAt,
        message:
          "Assessment received. Patternwork will follow up with your free report within 48 hours.",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error saving assessment after email delivery:", error);

    return NextResponse.json(
      {
        ok: true,
        assessmentId: null,
        createdAt: null,
        submittedAt,
        message:
          "Assessment received. Patternwork will follow up with your free report within 48 hours.",
        warning: "Email delivered, but database save failed.",
      },
      { status: 200 }
    );
  }
}
