import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (reportId) {
    const rows = await query(
      `SELECT id, report_id, context, data_driven_decision, resulting_impact, links, sort_order
       FROM reporting_platform.results
       WHERE report_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  }

  const rows = await query(
    `SELECT
       r.id,
       r.report_id,
       r.context,
       r.data_driven_decision,
       r.resulting_impact,
       r.links,
       r.sort_order,
       rp.year,
       rp.report_type,
       p.project_title,
       p.short_name   AS project_short_name,
       pt.short_name  AS partner_short_name,
       pt.long_name   AS partner_long_name
     FROM reporting_platform.results r
     JOIN reporting_platform.reports  rp ON rp.id  = r.report_id
     JOIN reporting_platform.projects p  ON p.id   = rp.project_id
     JOIN reporting_platform.partners pt ON pt.id  = p.partner_id
     WHERE rp.data_type = 'report'
     ORDER BY rp.year DESC, pt.short_name, p.project_title, r.sort_order`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reportId, context, data_driven_decision, resulting_impact, links } = body as {
    reportId: number;
    context: string | null;
    data_driven_decision: string | null;
    resulting_impact: string | null;
    links: string | null;
  };

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const existing = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM reporting_platform.results WHERE report_id = $1`,
    [reportId]
  );
  const nextOrder = Number(existing[0].count) + 1;

  const rows = await query(
    `INSERT INTO reporting_platform.results
       (report_id, context, data_driven_decision, resulting_impact, links, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [reportId, context ?? null, data_driven_decision ?? null, resulting_impact ?? null, links ?? null, nextOrder]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, context, data_driven_decision, resulting_impact, links } = body as {
    id: number;
    context: string | null;
    data_driven_decision: string | null;
    resulting_impact: string | null;
    links: string | null;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const rows = await query(
    `UPDATE reporting_platform.results
     SET context = $1, data_driven_decision = $2, resulting_impact = $3, links = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [context ?? null, data_driven_decision ?? null, resulting_impact ?? null, links ?? null, id]
  );

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.results WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
