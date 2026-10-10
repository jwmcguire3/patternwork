import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    /**
     * Replace this with your real auth source.
     * For now, this assumes you have userId from session/auth middleware.
     */
    const userId = "replace-with-real-user-id";

    const saved = await prisma.selfMapAssessmentProgress.upsert({
      where: {
        userId_assessmentKey: {
          userId,
          assessmentKey: "selfmap_v4",
        },
      },
      update: {
        currentIndex: body.currentIndex ?? 0,
        responsesJson: body.responses ?? {},
        updatedAt: new Date(),
      },
      create: {
        userId,
        assessmentKey: "selfmap_v4",
        currentIndex: body.currentIndex ?? 0,
        responsesJson: body.responses ?? {},
      },
    });

    return NextResponse.json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("Failed to save SelfMap progress", error);
    return NextResponse.json(
      { ok: false, error: "Failed to save progress" },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const userId = "replace-with-real-user-id";

    const saved = await prisma.selfMapAssessmentProgress.findUnique({
      where: {
        userId_assessmentKey: {
          userId,
          assessmentKey: "selfmap_v4",
        },
      },
    });

    return NextResponse.json({
      ok: true,
      data: saved ?? null,
    });
  } catch (error) {
    console.error("Failed to load SelfMap progress", error);
    return NextResponse.json(
      { ok: false, error: "Failed to load progress" },
      { status: 500 }
    );
  }
}
