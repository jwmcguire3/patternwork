import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    POSTGRES_URL: process.env.POSTGRES_URL ?? null,
    PRISMA_DATABASE_URL: process.env.PRISMA_DATABASE_URL ?? null,
    ALL_ENV: process.env,
  });
}
