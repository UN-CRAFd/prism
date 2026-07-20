import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET /api/reports/activity?limit=5
// Reports ordered by their most recent partner edit. A report's own updated_at
// only bumps on overview/status changes, so "last edited" is the greatest
// updated_at across every per-report section table (surveys, indicators, …).
// Static route — resolves before /api/reports/[id].
export async function GET(req: NextRequest) {
  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 5, 1), 50);

  try {
    const rows = await query(
      // NOTE: surveys is intentionally excluded — the live table lacks an
      // updated_at column (schema drift), so survey edits don't count toward
      // last-activity yet. Add the column + trigger to include them.
      `WITH activity AS (
         SELECT report_id, updated_at FROM reporting_platform.indicator_data
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.risk_management
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.key_achievements
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.partnerships
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.results
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.lessons_learned
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.external_coverage
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.testimonials
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.workplan_entries
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.expenditure_entries
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.transfer_data
         UNION ALL SELECT report_id, updated_at FROM reporting_platform.complementary_data
       )
       SELECT r.id, r.project_id, r.year, r.report_type, r.status, r.authorized, r.created_at,
              p.project_title,
              p.short_name  AS project_short_name,
              pt.short_name AS partner_short_name,
              GREATEST(r.updated_at, COALESCE(MAX(a.updated_at), r.updated_at)) AS last_activity
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p  ON p.id  = r.project_id
         JOIN reporting_platform.partners pt ON pt.id = p.partner_id
         LEFT JOIN activity a ON a.report_id = r.id
        WHERE r.data_type = 'report'
        GROUP BY r.id, r.project_id, r.year, r.report_type, r.status, r.authorized, r.created_at,
                 p.project_title, p.short_name, pt.short_name, r.updated_at
        ORDER BY last_activity DESC
        LIMIT $1`,
      [limit]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/reports/activity error:", err);
    return NextResponse.json({ error: "Failed to load recent activity" }, { status: 500 });
  }
}
