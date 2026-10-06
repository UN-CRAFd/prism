import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { getCharLimits } from "@/lib/char-limits";
import { narrativeLimit } from "@/lib/limits";
import { richTextLength } from "@/lib/richtext";

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
    const [prodoc, limits] = await Promise.all([
      query<{ id: number }>(
        `SELECT id FROM reporting_platform.reports
          WHERE project_id = $1 AND data_type = 'prodoc'`,
        [projectId]
      ),
      getCharLimits(),
    ]);
    if (prodoc.length === 0) return NextResponse.json({ error: "Project document not found" }, { status: 404 });
    const prodocId = prodoc[0].id;

    const [general, narratives, indicators, risk, expenditure, workplan] = await Promise.all([
      // General — required fields present and description within char limit.
      query<Row>(
        `SELECT (p.project_title IS NOT NULL AND p.project_title <> ''
              AND p.grant_size_usd IS NOT NULL
              AND p.project_start_date IS NOT NULL
              AND p.project_duration_months IS NOT NULL
              AND p.geographic_scope IS NOT NULL AND p.geographic_scope <> ''
              AND p.description IS NOT NULL AND p.description <> '') AS complete,
              p.description
           FROM reporting_platform.projects p
          WHERE p.id = $1`,
        [projectId]
      ).then((r) => {
        const desc = r[0]?.description as string | null;
        if (r[0]?.complete !== true) return false;
        if (richTextLength(desc) === 0) return false;
        return richTextLength(desc) <= limits.description;
      }),

      // Narratives — every question answered and within its char limit.
      query<Row>(
        `SELECT narrative_key, answer FROM reporting_platform.project_narratives WHERE project_id = $1`,
        [projectId]
      ).then((rows) => {
        if (rows.length === 0) return false;
        return rows.every((r) => {
          const a = (r.answer as string | null) ?? "";
          if (richTextLength(a) === 0) return false;
          const lim = limits.narratives[r.narrative_key as string] ?? narrativeLimit(r.narrative_key as string);
          return richTextLength(a) <= lim;
        });
      }),

      // Indicators — every line has a baseline and a target.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE baseline_value IS NOT NULL AND baseline_value <> ''
                                   AND target_value  IS NOT NULL AND target_value  <> '')::int AS ok
           FROM reporting_platform.indicator_data WHERE report_id = $1`,
        [prodocId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Risk — every risk scored (likelihood + impact) and has a description.
      query<Row>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE likelihood IS NOT NULL AND impact IS NOT NULL
                                   AND risk_description IS NOT NULL AND risk_description <> '')::int AS ok
           FROM reporting_platform.risk_management WHERE report_id = $1`,
        [prodocId]
      ).then((r) => n(r[0]?.total) > 0 && n(r[0]?.ok) === n(r[0]?.total)),

      // Budgets — grant_size_usd set, budget total within [grant − 1, grant],
      // tranche total within [grant − 1, grant], and no missing release dates.
      query<Row>(
        `SELECT
                p.grant_size_usd,
                ROUND(COALESCE(
                  (SELECT SUM(b.approved_amount)
                   FROM reporting_platform.expenditure_budgets b
                   WHERE b.project_id = p.id
                     AND b.year = ANY (reporting_platform.project_year_range(p.project_start_date, p.project_duration_months))
                  ), 0
                ) * (1 + COALESCE(p.indirect_cost_rate, 0.07)), 2) AS budget_total,
                COALESCE(
                  (SELECT SUM(tc.amount)
                   FROM reporting_platform.project_tranche_cells tc
                   WHERE tc.project_id = p.id
                  ), 0
                ) AS tranche_total,
                (SELECT COUNT(*)
                   FROM reporting_platform.project_tranche_cells tc
                  WHERE tc.project_id = p.id
                    AND tc.amount > 0
                    AND tc.release_date IS NULL
                )::int AS missing_release_dates
           FROM reporting_platform.projects p WHERE p.id = $1`,
        [projectId]
      ).then((r) => {
        const row = r[0];
        if (!row?.grant_size_usd) return false;
        const grant = Number(row.grant_size_usd);
        const budgetTotal = Number(row.budget_total ?? 0);
        const trancheTotal = Number(row.tranche_total ?? 0);
        const budgetDiffCents = Math.round(grant * 100) - Math.round(budgetTotal * 100);
        const budgetOk = budgetDiffCents >= 0 && budgetDiffCents <= 100;
        const trancheDiffCents = Math.round(grant * 100) - Math.round(trancheTotal * 100);
        const trancheOk = trancheDiffCents >= 0 && trancheDiffCents <= 100;
        const releaseDatesOk = n(row.missing_release_dates) === 0;
        return budgetOk && trancheOk && releaseDatesOk;
      }),

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