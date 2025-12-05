// app/api/save-assessment/route.ts
import { NextResponse } from "next/server";
import { Pool } from "pg";
import { Resend } from "resend";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const resend =
  process.env.RESEND_API_KEY && new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.EMAIL_FROM || "Patternwork <noreply@example.com>";
const WORKBOOK_URL = "https://patternwork.io/workbook.pdf"; // adjust when you have it

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

    // Fire-and-forget email (don’t block response if it fails)
    if (resend && userEmail) {
      const miniKitSnippet = JSON.stringify(answers).slice(0, 800); // placeholder; you can format better later

      const html = `
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
          <p><a href="${WORKBOOK_URL}">${WORKBOOK_URL}</a></p>

          <h3>Mini AI reflection (for free ChatGPT)</h3>
          <p>Copy the summary you downloaded (or the attached mini kit) into ChatGPT and ask for:</p>
          <ul>
            <li>A short reflection on your nervous-system and protector patterns</li>
            <li>3 concrete daily experiments</li>
            <li>3 journal questions</li>
          </ul>

          <h3>Upgrade: Full Patternwork Profile</h3>
          <p>The full Patternwork Profile gives you a deeper, structured map of your states, protectors, attachment patterns, and rituals that fit how your system actually behaves.</p>
          <p><strong>When this is live:</strong> this section will include a direct purchase link with your assessment already attached.</p>

          <hr />
          <p style="font-size: 12px; color: #666;">Internal reference: ${row.id}</p>
        </div>
      `;

      // You can make this await, but non-blocking is nice for user experience
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
