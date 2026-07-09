import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Calculate report completion as (filled fields / total editable fields).
// Counts rows in each section table (achievements, partnerships, results, lessons,
// external_coverage, workplan_entries, expenditure_entries) per report.
// workplan_entries and expenditure_entries may be sparse (one per activity/category),
// so we count non-null values.

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    // Count rows in each section (achievement, partnership, result, lesson, coverage rows).
    const [ka, pa, res, les, cov, wpak, exp] = await Promise.all([
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.key_achievements WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.partnerships WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.results WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.lessons_learned WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.external_coverage WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.workplan_entries WHERE report_id = $1`,
        [reportId]
      ),
      query<{ c: number }>(
        `SELECT COUNT(*) AS c FROM reporting_platform.expenditure_entries WHERE report_id = $1`,
        [reportId]
      ),
    ]);

    // Count sections that have at least one entry (out of 7 sections total).
    const sections = [ka, pa, res, les, cov, wpak, exp];
    const sectionsStarted = sections.filter((s) => Number(s[0]?.c ?? 0) > 0).length;

    return NextResponse.json({ sectionsStarted, total: 7 });
  } catch (err) {
    console.error("GET /api/report-completion error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
