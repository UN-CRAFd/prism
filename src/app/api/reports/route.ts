import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/reports — list all reports with project + partner info
export async function GET() {
  try {
    const rows = await query(`
      SELECT
        r.id,
        r.project_id,
        r.year,
        r.report_submission_date,
        r.authorized,
        r.created_at,
        pr.project_title,
        pr.short_name      AS project_short_name,
        p.short_name       AS partner_short_name,
        p.long_name        AS partner_long_name,
        (SELECT COUNT(*) FROM reporting_platform.indicator_sections s WHERE s.report_id = r.id) AS indicator_count
      FROM reporting_platform.reports r
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      ORDER BY r.year DESC, p.short_name, pr.project_title
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// Seeds indicator_sections for a report from the master indicators table.
async function seedIndicatorSections(reportId: number) {
  await query(
    `INSERT INTO reporting_platform.indicator_sections (report_id, indicator_id)
     SELECT $1, i.id
     FROM reporting_platform.indicators i
     ON CONFLICT (report_id, indicator_id) DO NOTHING`,
    [reportId]
  );
}

// POST /api/reports
// Single report: { project_id, year, report_submission_date?, authorized? }
// Annual report (all active projects): { year, annual: true, report_submission_date?, authorized? }
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { year, annual, report_submission_date, authorized } = body;

    if (!year) {
      return NextResponse.json({ error: "year is required" }, { status: 400 });
    }

    // ── Annual report: create one report per project ──
    if (annual) {
      const projects = await query<{ id: number }>(
        `SELECT id FROM reporting_platform.projects`
      );

      const created: number[] = [];
      for (const proj of projects) {
        const inserted = await query<{ id: number }>(
          `INSERT INTO reporting_platform.reports
             (project_id, year, report_submission_date, authorized)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (project_id, year) DO NOTHING
           RETURNING id`,
          [proj.id, year, report_submission_date || null, authorized ?? false]
        );
        if (inserted.length > 0) {
          await seedIndicatorSections(inserted[0].id);
          created.push(inserted[0].id);
        }
      }

      return NextResponse.json(
        { created: created.length, skipped: projects.length - created.length },
        { status: 201 }
      );
    }

    // ── Single report ──
    const { project_id } = body;
    if (!project_id) {
      return NextResponse.json(
        { error: "project_id is required for a single report" },
        { status: 400 }
      );
    }

    const existing = await query(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 AND year = $2 LIMIT 1`,
      [project_id, year]
    );
    if (existing.length > 0) {
      return NextResponse.json(
        { error: "A report already exists for this project and year" },
        { status: 409 }
      );
    }

    const rows = await query<{ id: number }>(
      `INSERT INTO reporting_platform.reports
         (project_id, year, report_submission_date, authorized)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [project_id, year, report_submission_date || null, authorized ?? false]
    );

    await seedIndicatorSections(rows[0].id);

    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/reports error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
