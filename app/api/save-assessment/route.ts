// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const resend =
  process.env.RESEND_API_KEY && new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.EMAIL_FROM || "test@patternwork.io";

// TODO: Replace with real workbook URL when ready
const WORKBOOK_URL = "https://patternwork.io/workbook.pdf";

export async function POST(req: Request) {
  let client;
  try {
    const body = await req.json();
    const { answers, userEmail } = body ?? {};

    if (!answers || typeof answers !== "object" || !userEmail) {
      return NextResponse.json(
        { error: "Missing 'answers' or 'userEmail'." },
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
      [JSON.stringify(answers), userEmail]
    );

    const row = result.rows[0];

    // Build a very compact summary we can drop into the email (optional)
    const miniSummary = buildMiniSummary(answers);

    // Fire-and-forget email (don’t block response if it fails)
    if (resend && userEmail) {
      const html = buildEmailHtml({
        workbookUrl: WORKBOOK_URL,
        miniSummary,
        assessmentId: row.id,
      });

      resend.emails
        .send({
          from: FROM_EMAIL,
          to: userEmail,
          subject: "Your Patternwork Assessment – Mini Pack & Next Steps",
          html,
        })
        .catch((err) => {
          console.error("Error sending email via Resend:", err);
        });
    }

    return NextResponse.json(
      {
        ok: true,
        assessmentId: row.id,
        createdAt: row.created_at,
      },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("Error in /api/save-assessment:", err);
    return NextResponse.json(
      {
        error: "Failed to process assessment.",
        detail: err?.message ?? String(err),
      },
      { status: 500 }
    );
  } finally {
    if (client) {
      client.release();
    }
  }
}

function buildMiniSummary(answers: any): string {
  // For now: just stringify and truncate; you can replace this with
  // something smarter or with your pre-rendered mini blocks later.
  try {
    const raw = JSON.stringify(answers);
    return raw.length > 1500 ? raw.slice(0, 1500) + " …" : raw;
  } catch {
    return "";
  }
}

function buildEmailHtml({
  workbookUrl,
  miniSummary,
  assessmentId,
}: {
  workbookUrl: string;
  miniSummary: string;
  assessmentId: string;
}) {
  return `
  <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; line-height: 1.5;">
    <h2>Thanks for completing the Patternwork Assessment</h2>
    <p>This email includes:</p>
    <ul>
      <li>A link to the starter workbook</li>
      <li>Instructions for a mini AI reflection using your answers</li>
      <li>An invitation to upgrade to the full Patternwork Profile</li>
    </ul>

    <h3>Your starter workbook</h3>
    <p>You can download the workbook here:</p>
    <p><a href="${workbookUrl}">${workbookUrl}</a></p>

    <h3>Mini AI reflection (for free ChatGPT)</h3>
    <p>Copy the kit from the site (or the block below) into ChatGPT and ask:</p>
    <ul>
      <li>“Give me a short reflection on my nervous-system and protector patterns.”</li>
      <li>“Give me 3 concrete daily experiments I can try this week.”</li>
      <li>“Give me 3 journal questions to go deeper.”</li>
    </ul>

    ${
      miniSummary
        ? `<h4>Compact answer snapshot</h4>
           <pre style="white-space: pre-wrap; font-size: 12px; background:#f7f7f7; padding:0.75rem; border-radius:6px;">${miniSummary}</pre>`
        : ""
    }

    <h3>Upgrade: Full Patternwork Profile</h3>
    <p>The full Patternwork Profile gives you a deeper, structured map of your states, protectors, attachment patterns, and rituals built specifically around your patterns.</p>
    <p>When this is live, this section will contain a direct link to purchase your full Profile with this assessment already attached.</p>

    <hr />
    <p style="font-size: 12px; color: #666;">Internal reference: ${assessmentId}</p>
  </div>
  `;
}
