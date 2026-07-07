import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }
  const rows = await query(
    `SELECT id, reportid, question, assessment, context
     FROM reporting_platform.surveys
     WHERE reportid = $1
     ORDER BY id ASC`,
    [reportId]
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reportId, question } = body as { reportId: number; question: string };
  if (!reportId || !question?.trim()) {
    return NextResponse.json({ error: "reportId and question are required" }, { status: 400 });
  }
  const rows = await query(
    `INSERT INTO reporting_platform.surveys (reportid, question) VALUES ($1, $2) RETURNING *`,
    [reportId, question.trim()]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.surveys WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
