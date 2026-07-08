import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (reportId) {
    const rows = await query(
      `SELECT id, report_id, category, lesson_learned, adjustment_informed, sort_order
       FROM reporting_platform.lessons_learned
       WHERE report_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  }

  const rows = await query(
    `SELECT
       l.id,
       l.report_id,
       l.category,
       l.lesson_learned,
       l.adjustment_informed,
       l.sort_order,
       r.year,
       r.report_type,
       p.project_title,
       p.short_name   AS project_short_name,
       pt.short_name  AS partner_short_name,
       pt.long_name   AS partner_long_name
     FROM reporting_platform.lessons_learned l
     JOIN reporting_platform.reports  r  ON r.id  = l.report_id
     JOIN reporting_platform.projects p  ON p.id  = r.project_id
     JOIN reporting_platform.partners pt ON pt.id = p.partner_id
     WHERE r.data_type = 'report'
     ORDER BY r.year DESC, pt.short_name, p.project_title, l.sort_order`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reportId, category, lesson_learned, adjustment_informed } = body as {
    reportId: number;
    category: string | null;
    lesson_learned: string | null;
    adjustment_informed: string | null;
  };

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const existing = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM reporting_platform.lessons_learned WHERE report_id = $1`,
    [reportId]
  );
  if (Number(existing[0].count) >= 5) {
    return NextResponse.json({ error: "Maximum of 5 lessons per report" }, { status: 400 });
  }
  const nextOrder = Number(existing[0].count) + 1;

  const rows = await query(
    `INSERT INTO reporting_platform.lessons_learned
       (report_id, category, lesson_learned, adjustment_informed, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [reportId, category ?? null, lesson_learned ?? null, adjustment_informed ?? null, nextOrder]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, category, lesson_learned, adjustment_informed } = body as {
    id: number;
    category: string | null;
    lesson_learned: string | null;
    adjustment_informed: string | null;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const rows = await query(
    `UPDATE reporting_platform.lessons_learned
     SET category = $1, lesson_learned = $2, adjustment_informed = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [category ?? null, lesson_learned ?? null, adjustment_informed ?? null, id]
  );

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.lessons_learned WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
