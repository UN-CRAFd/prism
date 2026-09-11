import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Project-document completion, per section.
//
//   • `sections` — a { [sectionValue]: boolean } map: true when the section
//     fulfils its fill-out criteria (drives the prodoc tab checkmarks).
//
// Mirrors /api/report-completion, but project-scoped. A section is "complete"
// only when it is actually filled out — an empty section is never complete.
//
// `documents` and `signatures` are deliberately absent from the map: documents
// may legitimately stay empty, and signatures is admin-only.
//
// Note: indicators and risk hang off the project's PRODOC report row
// (reports.data_type = 'prodoc'), not off the project directly.

type Row = Record<string, unknown>;
const n = (v: unknown) => Number((v as { toString: () => string })?.toString?.() ?? v ?? 0) || 0;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    // The prodoc report row carries the indicator/risk children.
    const prodoc = await query<{ id: number }>(
      `SELECT id FROM reporting_platform.reports
        WHERE project_id = $1 AND data_type = 'prodoc'`,
      [projectId]
    );
    if (prodoc.length === 0) return NextResponse.json({ error: "Project document not found" }, { status: 404 });
    const prodocId = prodoc[0].id;

    const [general, narratives, indicators, risk, expenditure, workplan] = await Promise.all([
      // General — the project/partner header fields all present.
      query<Row>(
        `SELECT (p.project_title IS NOT NULL
              AND p.mptfo_project_number IS NOT NULL
              AND pt.long_name IS NOT NULL
              AND p.grant_size_usd IS NOT NULL
              AND p.geographic_scope IS NOT NULL
              AND p.project_start_date IS NOT NULL
              AND p.project_duration_months IS NOT NULL) AS complete
           FROM reporting_platform.projects p
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE p.id = $1`,
        [projectId]
      ).then((r) => r[0]?.complete === true),

      // Narratives — every question answered.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE answer IS NOT NULL AND answer <> '')::int AS ok
           FROM reporting_platform.project_narratives WHERE project_id = $1`,
        [projectId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Indicators — every line has a baseline and a target.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE baseline_value IS NOT NULL AND baseline_value <> ''
                                   AND target_value  IS NOT NULL AND target_value  <> '')::int AS ok
           FROM reporting_platform.indicator_data WHERE report_id = $1`,
        [prodocId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Risk — every risk scored (likelihood + impact).
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE likelihood IS NOT NULL AND impact IS NOT NULL)::int AS ok
           FROM reporting_platform.risk_management WHERE report_id = $1`,
        [prodocId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Budgets — every category x project-year cell has an approved amount.
      // 0 counts as filled; only NULL/missing does not.
      query<Row>(
        `SELECT (SELECT COUNT(*) FROM reporting_platform.expenditure_categories)::int
                  * COALESCE(ARRAY_LENGTH(
                      reporting_platform.project_year_range(p.project_start_date, p.project_duration_months), 1
                    ), 0)::int AS expected,
                (SELECT COUNT(*) FROM reporting_platform.expenditure_budgets b
                  WHERE b.project_id = p.id
                    AND b.approved_amount IS NOT NULL
                    AND b.year = ANY (reporting_platform.project_year_range(p.project_start_date, p.project_duration_months))
                )::int AS filled
           FROM reporting_platform.projects p WHERE p.id = $1`,
        [projectId]
      ).then((r) => n(r[0]?.expected) > 0 && n(r[0]?.filled) >= n(r[0]?.expected)),

      // Workplan — every activity has outcome, objective text and activity text.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE outcome        IS NOT NULL AND outcome        <> ''
                                   AND objective_text IS NOT NULL AND objective_text <> ''
                                   AND activity_text  IS NOT NULL AND activity_text  <> '')::int AS ok
           FROM reporting_platform.workplan_activities WHERE project_id = $1`,
        [projectId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),
    ]);

    const sections: Record<string, boolean> = {
      general,
      narratives,
      indicators,
      risk,
      expenditure,
      workplan,
    };

    return NextResponse.json({ sections });
  } catch (err) {
    logger.error("GET /api/prodoc-completion error:", err);
    return NextResponse.json({ error: "Failed to load completion" }, { status: 500 });
  }
}