import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const rows = await query(
    `SELECT * FROM reporting_platform.overview WHERE reportid = $1`,
    [reportId]
  );
  return NextResponse.json(rows[0] ?? null);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const {
    reportId,
    project_title,
    mptfo_project_number,
    organization_name,
    organization_website,
    project_duration_months,
    grant_size_usd,
    implementing_partners,
    geographic_scope,
    report_submission_date,
    starting_date,
    end_date,
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

  const rows = await query(
    `INSERT INTO reporting_platform.overview (
       reportid, project_title, mptfo_project_number, organization_name, organization_website,
       project_duration_months, grant_size_usd, implementing_partners, geographic_scope,
       report_submission_date, starting_date, end_date, project_lead, authorized
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     ON CONFLICT (reportid) DO UPDATE SET
       project_title           = EXCLUDED.project_title,
       mptfo_project_number    = EXCLUDED.mptfo_project_number,
       organization_name       = EXCLUDED.organization_name,
       organization_website    = EXCLUDED.organization_website,
       project_duration_months = EXCLUDED.project_duration_months,
       grant_size_usd          = EXCLUDED.grant_size_usd,
       implementing_partners   = EXCLUDED.implementing_partners,
       geographic_scope        = EXCLUDED.geographic_scope,
       report_submission_date  = EXCLUDED.report_submission_date,
       starting_date           = EXCLUDED.starting_date,
       end_date                = EXCLUDED.end_date,
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
      toNum(project_duration_months),
      toNum(grant_size_usd),
      implementing_partners || null,
      geographic_scope || null,
      toDate(report_submission_date),
      toDate(starting_date),
      toDate(end_date),
      project_lead || null,
      authorized ?? false,
    ]
  );
  return NextResponse.json(rows[0]);
}
