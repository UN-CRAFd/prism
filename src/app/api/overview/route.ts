import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// The project start date + duration live on the `projects` table (project-level)
// but are surfaced and edited through the overview form. GET joins them in; PATCH
// writes them back to the project.

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    // Return saved row if it exists (with the project's dates joined in).
    const existing = await query(
      `SELECT o.*,
              TO_CHAR(p.project_start_date, 'YYYY-MM-DD') AS project_start_date,
              p.project_duration_months
         FROM reporting_platform.overview o
         JOIN reporting_platform.reports  r ON r.id = o.reportid
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE o.reportid = $1`,
      [reportId]
    );
    if (existing.length > 0) return NextResponse.json(existing[0]);

    // No saved row yet — seed defaults from related tables
    const defaults = await query(
      `SELECT
         p.project_title,
         p.mptfo_project_number,
         p.grant_size_usd,
         TO_CHAR(p.project_start_date, 'YYYY-MM-DD') AS project_start_date,
         p.project_duration_months,
         p.geographic_scope,
         pt.long_name                                   AS organization_name,
         pt.organization_website,
         TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date
       FROM reporting_platform.reports  r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.id = $1`,
      [reportId]
    );

    if (defaults.length === 0) return NextResponse.json(null);

    return NextResponse.json({
      ...defaults[0],
      implementing_partners: null,
      project_lead: null,
      authorized: false,
    });
  } catch (err) {
    console.error("GET /api/overview error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    reportId,
    project_title,
    mptfo_project_number,
    organization_name,
    organization_website,
    grant_size_usd,
    implementing_partners,
    geographic_scope,
    report_submission_date,
    project_start_date,
    project_duration_months,
    project_lead,
    authorized,
  } = body;

  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const toDate = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const toNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  try {
    // Project-level start date + duration (edited via the overview form).
    if ("project_start_date" in body || "project_duration_months" in body) {
      await query(
        `UPDATE reporting_platform.projects p
            SET project_start_date = $2, project_duration_months = $3
           FROM reporting_platform.reports r
          WHERE r.id = $1 AND p.id = r.project_id`,
        [reportId, toDate(project_start_date), toNum(project_duration_months)]
      );
    }

    const rows = await query(
      `INSERT INTO reporting_platform.overview (
         reportid, project_title, mptfo_project_number, organization_name, organization_website,
         grant_size_usd, implementing_partners, geographic_scope,
         report_submission_date, project_lead, authorized
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (reportid) DO UPDATE SET
         project_title           = EXCLUDED.project_title,
         mptfo_project_number    = EXCLUDED.mptfo_project_number,
         organization_name       = EXCLUDED.organization_name,
         organization_website    = EXCLUDED.organization_website,
         grant_size_usd          = EXCLUDED.grant_size_usd,
         implementing_partners   = EXCLUDED.implementing_partners,
         geographic_scope        = EXCLUDED.geographic_scope,
         report_submission_date  = EXCLUDED.report_submission_date,
         project_lead            = EXCLUDED.project_lead,
         authorized              = EXCLUDED.authorized,
         updated_at              = NOW()
       RETURNING *`,
      [
        reportId,
        project_title || null,
        mptfo_project_number || null,
        organization_name || null,
        organization_website || null,
        toNum(grant_size_usd),
        implementing_partners || null,
        geographic_scope || null,
        toDate(report_submission_date),
        project_lead || null,
        authorized ?? false,
      ]
    );

    // Echo the project start date + duration back so the client stays in sync.
    return NextResponse.json({
      ...rows[0],
      project_start_date: toDate(project_start_date),
      project_duration_months: toNum(project_duration_months),
    });
  } catch (err) {
    console.error("PATCH /api/overview error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
