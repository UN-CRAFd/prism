import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (reportId) {
    const rows = await query(
      `SELECT id, reportid, question, assessment, context
       FROM reporting_platform.surveys
       WHERE reportid = $1
       ORDER BY id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  }

  // No reportId — return all surveys with report/project/partner context
  const rows = await query(
    `SELECT
       s.id,
       s.reportid,
       s.question,
       s.assessment,
       s.context,
       r.year,
       r.report_type,
       p.project_title,
       p.short_name   AS project_short_name,
       pt.short_name  AS partner_short_name,
       pt.long_name   AS partner_long_name
     FROM reporting_platform.surveys s
     JOIN reporting_platform.reports  r  ON r.id  = s.reportid
     JOIN reporting_platform.projects p  ON p.id  = r.project_id
     JOIN reporting_platform.partners pt ON pt.id = p.partner_id
     WHERE r.data_type = 'report'
     ORDER BY r.year DESC, pt.short_name, p.project_title, s.id`
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

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, assessment, context } = body as { id: number; assessment: number | null; context: string | null };
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const rows = await query(
    `UPDATE reporting_platform.surveys
     SET assessment = $1, context = $2
     WHERE id = $3
     RETURNING *`,
    [assessment ?? null, context ?? null, id]
  );
  if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.surveys WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
