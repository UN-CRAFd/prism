import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";

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
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

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
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.filled) >= min && n(r[0]?.filled) === n(r[0]?.total));

    const [
      overview, surveys, risk, indicators, transfers, complementary,
      achievements, partnerships, results, lessons, coverage,
      workplan, expenditure, testimonials,
    ] = await Promise.all([
      // Overview — complete when the partner has ticked the authorization checkbox.
      query<Row>(
        `SELECT authorized FROM reporting_platform.reports WHERE id = $1`,
        [reportId]
      ).then((r) => r[0]?.authorized === true),

      // Surveys — every question assessed.
      query<Row>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE assessment IS NOT NULL)::int AS ok
           FROM reporting_platform.surveys WHERE report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Risk — every risk has a partner-entered updated assessment.
      // Uses updated_likelihood / updated_impact (not the approved ProDoc columns).
      query<Row>(
        `SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE updated_likelihood IS NOT NULL AND updated_impact IS NOT NULL)::int AS ok
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

      // Transfers — zero rows is OK (not all projects use this); non-zero rows require
      // the partner to be selected and the amount to be filled.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE tp.organization_name IS NOT NULL AND tp.organization_name <> ''
                                   AND d.amount_transferred IS NOT NULL)::int AS ok
           FROM reporting_platform.transfer_data d
           JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
          WHERE d.report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) === 0 || n(r[0]?.ok) === n(r[0]?.total)),

      // Complementary — zero rows is OK (not all projects use this); non-zero rows
      // require the contributor to be selected and the amount to be filled.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE c.contributor_name IS NOT NULL AND c.contributor_name <> ''
                                   AND cd.contribution_amount IS NOT NULL)::int AS ok
           FROM reporting_platform.complementary_data cd
           JOIN reporting_platform.complementary_contributors c ON c.id = cd.contributor_id
          WHERE cd.report_id = $1`,
        [reportId]
      ).then((r) => n(r[0]?.total) === 0 || n(r[0]?.ok) === n(r[0]?.total)),

      listSection("key_achievements", "achievement", 1),
      listSection("partnerships", "partner_organization", 1),
      listSection("results", "context", 3),
      listSection("lessons_learned", "lesson_learned", 1),
      listSection("external_coverage", "description", 3),

      // Workplan — every activity has a progress status in the project's ACTIVE
      // update window. Progress is now project-level (per window), so this check
      // is uniform across the project's reports; no active window ⇒ incomplete.
      query<Row>(
               `SELECT (SELECT COUNT(*) FROM reporting_platform.workplan_activities WHERE project_id = $1)::int AS activities,
                (SELECT COUNT(*) FROM reporting_platform.workplan_activities a
                   JOIN reporting_platform.workplan_entries e ON e.activity_id = a.id
                   JOIN reporting_platform.workplan_updates wu
                     ON wu.id = e.update_id AND wu.is_active AND wu.project_id = $1
                  WHERE a.project_id = $1 AND e.status IS NOT NULL)::int AS done`,
        [projectId]
      ).then((r) => n(r[0]?.activities) > 0 && n(r[0]?.done) === n(r[0]?.activities)),

      // Expenditure — every category has an entered amount for this report.
      query<Row>(
                `SELECT (SELECT COUNT(*) FROM reporting_platform.expenditure_categories)::int AS cats,
                (SELECT COUNT(*) FROM reporting_platform.expenditure_entries
                  WHERE report_id = $1 AND annual_expenditure IS NOT NULL)::int AS filled`,
        [reportId]
      ).then((r) => n(r[0]?.cats) > 0 && n(r[0]?.filled) >= n(r[0]?.cats)),

      // Testimonials — a leadership quote and at least one partner quote are both present.
      query<Row>(
        `SELECT EXISTS (SELECT 1 FROM reporting_platform.testimonials
                         WHERE report_id = $1 AND kind = 'leadership'
                           AND quote IS NOT NULL AND quote <> '') AS leadership_ok,
               EXISTS (SELECT 1 FROM reporting_platform.testimonials
                         WHERE report_id = $1 AND kind = 'partner'
                           AND quote IS NOT NULL AND quote <> '') AS partner_ok`,
        [reportId]
      ).then((r) => r[0]?.leadership_ok === true && r[0]?.partner_ok === true),
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
      testimonials,
    };

    // Legacy coarse progress: the 7 list/grid sections that have any content.
    const startedKeys = ["achievements", "partnerships", "results", "lessons", "external-coverage", "workplan", "expenditure"] as const;
    const sectionsStarted = startedKeys.filter((k) => sections[k]).length;

    return NextResponse.json({ sections, sectionsStarted, total: startedKeys.length });
  } catch (err) {
    logger.error("GET /api/report-completion error:", err);
    return NextResponse.json({ error: "Failed to load completion" }, { status: 500 });
  }
}
