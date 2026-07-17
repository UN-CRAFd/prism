import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Report completion, per section.
//
//   • `sections` — a { [sectionValue]: boolean } map: true when the section
//     fulfils its fill-out criteria (used for the sidebar checkmarks).
//   • `sectionsStarted` / `total` — legacy coarse progress (# of the 7 list/grid
//     sections that have at least one row) kept for the report list page.
//
// A section is "complete" only when it is actually filled out — an empty section
// is never complete (so the checkmark means "done", not "nothing to do").

type Row = Record<string, unknown>;
const n = (v: unknown) => Number((v as { toString: () => string })?.toString?.() ?? v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    const meta = await query<{ project_id: number }>(
      `SELECT project_id FROM reporting_platform.reports WHERE id = $1`,
      [reportId]
    );
    if (meta.length === 0) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const projectId = meta[0].project_id;

    // A row-list section: complete when it has >= min filled rows and no empty ones.
    const listSection = (table: string, field: string, min: number) =>
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE ${field} IS NOT NULL AND ${field} <> '')::int AS filled
           FROM reporting_platform.${table} WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.filled) >= min && n(r[0]?.filled) === n(r[0]?.total));

    const [
      overview, surveys, risk, indicators, transfers, complementary,
      achievements, partnerships, results, lessons, coverage,
      workplan, expenditure,
    ] = await Promise.all([
      // Overview — all required fields present (project dates live on the project).
      query<Row>(
        `SELECT (o.project_title IS NOT NULL
              AND o.mptfo_project_number IS NOT NULL
              AND o.organization_name IS NOT NULL
              AND o.organization_website IS NOT NULL
              AND o.grant_size_usd IS NOT NULL
              AND o.geographic_scope IS NOT NULL
              AND p.project_start_date IS NOT NULL
              AND p.project_duration_months IS NOT NULL) AS complete
           FROM reporting_platform.overview o
           JOIN reporting_platform.reports  r ON r.id = o.reportid
           JOIN reporting_platform.projects p ON p.id = r.project_id
          WHERE o.reportid = $1`,
        [reportId]
      ).then((r) => r[0]?.complete === true),

      // Surveys — every question assessed.
      query<Row>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE assessment IS NOT NULL)::int AS ok
           FROM reporting_platform.surveys WHERE reportid = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Risk — every risk scored (likelihood + impact).
      query<Row>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE likelihood IS NOT NULL AND impact IS NOT NULL)::int AS ok
           FROM reporting_platform.risk_management WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Indicators — every line has an achieved value + status.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE achieved_value IS NOT NULL AND achieved_value <> '' AND status IS NOT NULL)::int AS ok
           FROM reporting_platform.indicator_data WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Transfers — every row has amount + linked activity.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE amount_transferred IS NOT NULL AND linked_activity_id IS NOT NULL)::int AS ok
           FROM reporting_platform.transfer_data WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Complementary — every row has amount + at least one linked activity.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE contribution_amount IS NOT NULL AND jsonb_array_length(linked_activity_ids) > 0)::int AS ok
           FROM reporting_platform.complementary_data WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      listSection("key_achievements", "achievement", 1),
      listSection("partnerships", "partner_organization", 1),
      listSection("results", "context", 3),
      listSection("lessons_learned", "lesson_learned", 1),
      listSection("external_coverage", "description", 3),

      // Workplan — every activity has a progress status for this report.
      query<Row>(
        `SELECT (SELECT COUNT(*) FROM reporting_platform.workplan_activities WHERE project_id = $2)::int AS activities,
                (SELECT COUNT(*) FROM reporting_platform.workplan_activities a
                   JOIN reporting_platform.workplan_entries e ON e.activity_id = a.id AND e.report_id = $1
                  WHERE a.project_id = $2 AND e.status IS NOT NULL)::int AS done`,
        [reportId, projectId]
      ).then((r) => n(r[0]?.activities) > 0 && n(r[0]?.done) === n(r[0]?.activities)),

      // Expenditure — every category has an entered amount for this report.
      query<Row>(
        `SELECT (SELECT COUNT(*) FROM reporting_platform.expenditure_categories)::int AS cats,
                (SELECT COUNT(*) FROM reporting_platform.expenditure_entries
                  WHERE report_id = $1 AND annual_expenditure IS NOT NULL)::int AS filled`,
        [reportId]
      ).then((r) => n(r[0]?.cats) > 0 && n(r[0]?.filled) >= n(r[0]?.cats)),
    ]);

    const sections: Record<string, boolean> = {
      overview,
      surveys,
      achievements,
      partnerships,
      results,
      lessons,
      "external-coverage": coverage,
      risk,
      indicators,
      workplan,
      expenditure,
      transfers,
      complementary,
    };

    // Legacy coarse progress: the 7 list/grid sections that have any content.
    const startedKeys = ["achievements", "partnerships", "results", "lessons", "external-coverage", "workplan", "expenditure"] as const;
    const sectionsStarted = startedKeys.filter((k) => sections[k]).length;

    return NextResponse.json({ sections, sectionsStarted, total: startedKeys.length });
  } catch (err) {
    console.error("GET /api/report-completion error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
