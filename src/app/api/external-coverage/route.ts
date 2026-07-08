import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (reportId) {
    const rows = await query(
      `SELECT id, report_id, type, description, reach_indicator, links, sort_order
       FROM reporting_platform.external_coverage
       WHERE report_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  }

  const rows = await query(
    `SELECT
       ec.id,
       ec.report_id,
       ec.type,
       ec.description,
       ec.reach_indicator,
       ec.links,
       ec.sort_order,
       r.year,
       r.report_type,
       p.project_title,
       p.short_name   AS project_short_name,
       pt.short_name  AS partner_short_name,
       pt.long_name   AS partner_long_name
     FROM reporting_platform.external_coverage ec
     JOIN reporting_platform.reports  r  ON r.id  = ec.report_id
     JOIN reporting_platform.projects p  ON p.id  = r.project_id
     JOIN reporting_platform.partners pt ON pt.id = p.partner_id
     WHERE r.data_type = 'report'
     ORDER BY r.year DESC, pt.short_name, p.project_title, ec.sort_order`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reportId, type, description, reach_indicator, links } = body as {
    reportId: number;
    type: string | null;
    description: string | null;
    reach_indicator: string | null;
    links: string | null;
  };

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const existing = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM reporting_platform.external_coverage WHERE report_id = $1`,
    [reportId]
  );
  const nextOrder = Number(existing[0].count) + 1;

  const rows = await query(
    `INSERT INTO reporting_platform.external_coverage
       (report_id, type, description, reach_indicator, links, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [reportId, type ?? null, description ?? null, reach_indicator ?? null, links ?? null, nextOrder]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, type, description, reach_indicator, links } = body as {
    id: number;
    type: string | null;
    description: string | null;
    reach_indicator: string | null;
    links: string | null;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const rows = await query(
    `UPDATE reporting_platform.external_coverage
     SET type = $1, description = $2, reach_indicator = $3, links = $4, updated_at = NOW()
     WHERE id = $5
     RETURNING *`,
    [type ?? null, description ?? null, reach_indicator ?? null, links ?? null, id]
  );

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.external_coverage WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
