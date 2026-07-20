import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// The project "overview" is no longer its own table — it is assembled read-only
// from `projects` (title, number, grant, dates, scope, implementing partners,
// project lead), `partners` (organization name + website) and `reports`
// (submission date, authorized). Admins enter the project fields on the project;
// partners only see them. The one thing a partner still sets here is the
// report authorization, which lives on reports.authorized.

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    const rows = await query(
      `SELECT
         p.project_title,
         p.mptfo_project_number,
         p.grant_size_usd,
         p.implementing_partners,
         p.geographic_scope,
         p.project_lead,
         TO_CHAR(p.project_start_date, 'YYYY-MM-DD')     AS project_start_date,
         p.project_duration_months,
         pt.long_name                                    AS organization_name,
         pt.organization_website,
         TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date,
         r.authorized
       FROM reporting_platform.reports  r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.id = $1`,
      [reportId]
    );

    if (rows.length === 0) return NextResponse.json(null);
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("GET /api/overview error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Partners can only toggle the report authorization from the overview section;
// the project fields are admin-owned and read-only here.
export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, authorized } = body;
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    const rows = await query(
      `UPDATE reporting_platform.reports
          SET authorized = $2
        WHERE id = $1
      RETURNING authorized`,
      [reportId, authorized ?? false]
    );
    if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/overview error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
