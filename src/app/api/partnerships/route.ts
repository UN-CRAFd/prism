import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");

  if (reportId) {
    const rows = await query(
      `SELECT id, report_id, partner_organization, result, links, sort_order
       FROM reporting_platform.partnerships
       WHERE report_id = $1
       ORDER BY sort_order ASC, id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  }

  const rows = await query(
    `SELECT
       p.id,
       p.report_id,
       p.partner_organization,
       p.result,
       p.links,
       p.sort_order,
       r.year,
       r.report_type,
       pr.project_title,
       pr.short_name  AS project_short_name,
       pt.short_name  AS partner_short_name,
       pt.long_name   AS partner_long_name
     FROM reporting_platform.partnerships p
     JOIN reporting_platform.reports  r  ON r.id  = p.report_id
     JOIN reporting_platform.projects pr ON pr.id = r.project_id
     JOIN reporting_platform.partners pt ON pt.id = pr.partner_id
     WHERE r.data_type = 'report'
     ORDER BY r.year DESC, pt.short_name, pr.project_title, p.sort_order`
  );
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { reportId, partner_organization, result, links } = body as {
    reportId: number;
    partner_organization: string | null;
    result: string | null;
    links: string | null;
  };

  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  const existing = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM reporting_platform.partnerships WHERE report_id = $1`,
    [reportId]
  );
  const nextOrder = Number(existing[0].count) + 1;

  const rows = await query(
    `INSERT INTO reporting_platform.partnerships
       (report_id, partner_organization, result, links, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [reportId, partner_organization ?? null, result ?? null, links ?? null, nextOrder]
  );
  return NextResponse.json(rows[0], { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, partner_organization, result, links } = body as {
    id: number;
    partner_organization: string | null;
    result: string | null;
    links: string | null;
  };

  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const rows = await query(
    `UPDATE reporting_platform.partnerships
     SET partner_organization = $1, result = $2, links = $3, updated_at = NOW()
     WHERE id = $4
     RETURNING *`,
    [partner_organization ?? null, result ?? null, links ?? null, id]
  );

  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(rows[0]);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await query(`DELETE FROM reporting_platform.partnerships WHERE id = $1`, [id]);
  return NextResponse.json({ ok: true });
}
