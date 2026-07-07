import { NextResponse } from "next/server";
import pool, { query } from "@/lib/db";

const MIN_YEAR = 2020;
const MAX_YEAR = 2050;

// GET /api/reports — list all reports with project + partner info
// Optional query param: ?data_type=report|prodoc
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get("data_type");

    const rows = await query(`
      SELECT
        r.id,
        r.project_id,
        r.year,
        TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date,
        r.authorized,
        r.created_at,
        r.data_type,
        r.report_type,
        pr.project_title,
        pr.short_name                                   AS project_short_name,
        pr.mptfo_project_number,
        pr.grant_size_usd,
        pr.project_duration,
        pr.geographic_scope,
        TO_CHAR(pr.project_start_date, 'YYYY-MM-DD')   AS project_start_date,
        p.short_name                                    AS partner_short_name,
        p.long_name                                     AS partner_long_name,
        p.organization_website
      FROM reporting_platform.reports r
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      ${dataType ? `WHERE r.data_type = '${dataType === "prodoc" ? "prodoc" : "report"}'` : ""}
      ORDER BY r.year DESC, p.short_name, pr.project_title
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

function parseYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

// Shared SQL: seed overview rows for a given set of newly inserted report IDs.
// Uses LATERAL to find the most recent previous overview for the same project.
// If none exists, falls back to project/partner table data.
const SEED_OVERVIEW_SQL = `
  INSERT INTO reporting_platform.overview (
    reportid, project_title, mptfo_project_number, organization_name, organization_website,
    project_duration_months, grant_size_usd, implementing_partners, geographic_scope,
    report_submission_date, starting_date, end_date, project_lead, authorized
  )
  SELECT
    r.id,
    COALESCE(prev_o.project_title,           proj.project_title),
    COALESCE(prev_o.mptfo_project_number,     proj.mptfo_project_number),
    COALESCE(prev_o.organization_name,        part.long_name),
    COALESCE(prev_o.organization_website,     part.organization_website),
    COALESCE(prev_o.project_duration_months,  NULLIF(REGEXP_REPLACE(proj.project_duration, '[^0-9]', '', 'g'), '')::numeric),
    COALESCE(prev_o.grant_size_usd,           proj.grant_size_usd::numeric),
    prev_o.implementing_partners,
    COALESCE(prev_o.geographic_scope,         proj.geographic_scope),
    COALESCE(prev_o.report_submission_date,   r.report_submission_date),
    COALESCE(prev_o.starting_date,            proj.project_start_date),
    prev_o.end_date,
    prev_o.project_lead,
    false
  FROM reporting_platform.reports r
  JOIN reporting_platform.projects proj ON proj.id = r.project_id
  JOIN reporting_platform.partners part ON part.id = proj.partner_id
  LEFT JOIN LATERAL (
    SELECT o.*
    FROM reporting_platform.overview o
    JOIN reporting_platform.reports old_r ON old_r.id = o.reportid
    WHERE old_r.project_id = r.project_id
      AND old_r.id != r.id
    ORDER BY old_r.year DESC
    LIMIT 1
  ) prev_o ON true
  WHERE r.id = ANY($1::int[])
  ON CONFLICT (reportid) DO NOTHING
`;

// POST /api/reports
// Single report: { project_id, year, report_submission_date? }
// Annual report (all projects): { year, annual: true, report_submission_date? }
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const year = parseYear(body.year);
  if (year === null) {
    return NextResponse.json(
      { error: `year is required and must be between ${MIN_YEAR} and ${MAX_YEAR}` },
      { status: 400 }
    );
  }
  const submissionDate = (body.report_submission_date as string) || null;
  const dataType = body.data_type === "prodoc" ? "prodoc" : "report";
  const reportType = body.report_type === "final" ? "final" : "annual";

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Annual report: one report per project, seeded in two set-based queries ──
    if (body.annual) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type, report_type)
         SELECT pr.id, $1, $2, $3, $4 FROM reporting_platform.projects pr
         ON CONFLICT (project_id, year, data_type) DO NOTHING
         RETURNING id`,
        [year, submissionDate, dataType, reportType]
      );

      const totalProjects = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM reporting_platform.projects`
      );

      if (inserted.rows.length > 0) {
        const newIds = inserted.rows.map((r) => r.id);
        await client.query(SEED_OVERVIEW_SQL, [newIds]);
      }

      await client.query("COMMIT");
      return NextResponse.json(
        {
          created: inserted.rows.length,
          skipped: totalProjects.rows[0].count - inserted.rows.length,
        },
        { status: 201 }
      );
    }

    // ── Single report ──
    const projectId = Number(body.project_id);
    if (!Number.isInteger(projectId) || projectId <= 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "project_id is required for a single report" },
        { status: 400 }
      );
    }

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type, report_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, year, data_type) DO NOTHING
       RETURNING *`,
      [projectId, year, submissionDate, dataType, reportType]
    );

    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `A ${dataType === "prodoc" ? "project document" : "report"} already exists for this project and year` },
        { status: 409 }
      );
    }

    await client.query(SEED_OVERVIEW_SQL, [[inserted.rows[0].id]]);

    await client.query("COMMIT");
    return NextResponse.json(inserted.rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/reports error:", err);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  } finally {
    client.release();
  }
}
