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
        r.report_submission_date,
        r.authorized,
        r.created_at,
        r.data_type,
        pr.project_title,
        pr.short_name      AS project_short_name,
        p.short_name       AS partner_short_name,
        p.long_name        AS partner_long_name,
        COUNT(s.id)::int   AS indicator_count
      FROM reporting_platform.reports r
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      LEFT JOIN reporting_platform.indicator_sections s ON s.report_id = r.id
      ${dataType ? `WHERE r.data_type = '${dataType === "prodoc" ? "prodoc" : "report"}'` : ""}
      GROUP BY r.id, pr.project_title, pr.short_name, p.short_name, p.long_name
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

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Annual report: one report per project, seeded in two set-based queries ──
    if (body.annual) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type)
         SELECT pr.id, $1, $2, $3 FROM reporting_platform.projects pr
         ON CONFLICT (project_id, year, data_type) DO NOTHING
         RETURNING id`,
        [year, submissionDate, dataType]
      );

      if (inserted.rows.length > 0) {
        const ids = inserted.rows.map((r) => r.id);
        await client.query(
          `INSERT INTO reporting_platform.indicator_sections (report_id, indicator_id)
           SELECT r.id, i.id
           FROM unnest($1::int[]) AS r(id)
           CROSS JOIN reporting_platform.indicators i
           ON CONFLICT (report_id, indicator_id) DO NOTHING`,
          [ids]
        );
      }

      const totalProjects = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM reporting_platform.projects`
      );

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
      `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, year, data_type) DO NOTHING
       RETURNING *`,
      [projectId, year, submissionDate, dataType]
    );

    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: `A ${dataType === "prodoc" ? "project document" : "report"} already exists for this project and year` },
        { status: 409 }
      );
    }

    await client.query(
      `INSERT INTO reporting_platform.indicator_sections (report_id, indicator_id)
       SELECT $1, i.id FROM reporting_platform.indicators i
       ON CONFLICT (report_id, indicator_id) DO NOTHING`,
      [inserted.rows[0].id]
    );

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
