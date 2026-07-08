import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/indicator-sections?project_id=X&year=Y
// Returns all indicator_sections rows joined with indicators for the matching report.
// Returns [] if no report exists yet.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const year = searchParams.get("year");

  if (!project_id || !year) {
    return NextResponse.json({ error: "project_id and year are required" }, { status: 400 });
  }

  try {
    // Find the report
    const reports = await query(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 AND year = $2 LIMIT 1`,
      [project_id, year]
    );

    if (reports.length === 0) {
      return NextResponse.json([]);
    }

    const report_id = reports[0].id;

    const rows = await query(
      `SELECT
         s.id,
         s.indicator_id,
         s.baseline_value,
         s.target_value,
         s.target_year,
         s.achieved_value,
         s.status,
         s.comment,
         i.indicator_title,
         i.description,
         i.means_of_verification,
         i.category,
         i.value_type
       FROM reporting_platform.indicator_sections s
       JOIN reporting_platform.indicators i ON i.id = s.indicator_id
       WHERE s.report_id = $1
       ORDER BY s.indicator_id`,
      [report_id]
    );

    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/indicator-sections error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// PATCH /api/indicator-sections?project_id=X&year=Y
// Body: { rows: { id: number; achieved_value: string; status: string; comment: string }[] }
// Gets or creates the report, then updates each indicator_section row.
export async function PATCH(request: Request) {
  const { searchParams } = new URL(request.url);
  const project_id = searchParams.get("project_id");
  const year = searchParams.get("year");

  if (!project_id || !year) {
    return NextResponse.json({ error: "project_id and year are required" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const rows: { id: number; achieved_value: string; status: string; comment: string }[] =
      body.rows ?? [];

    if (rows.length === 0) {
      return NextResponse.json({ updated: 0 });
    }

    // Get or create the report
    let reportRows = await query(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 AND year = $2 LIMIT 1`,
      [project_id, year]
    );

    if (reportRows.length === 0) {
      reportRows = await query(
        `INSERT INTO reporting_platform.reports (project_id, year) VALUES ($1, $2) RETURNING id`,
        [project_id, year]
      );
    }

    const report_id = reportRows[0].id;

    // Update each row (must belong to this report for safety)
    let updated = 0;
    for (const row of rows) {
      const result = await query(
        `UPDATE reporting_platform.indicator_sections
         SET achieved_value = $1, status = $2, comment = $3
         WHERE id = $4 AND report_id = $5`,
        [row.achieved_value || null, row.status || null, row.comment || null, row.id, report_id]
      );
      updated += (result as unknown as { rowCount: number }).rowCount >= 0 ? 1 : 0;
    }

    return NextResponse.json({ updated: rows.length });
  } catch (err) {
    console.error("PATCH /api/indicator-sections error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
