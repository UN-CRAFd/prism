import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { hasUpdateModuleColumns } from "@/lib/update-columns";
import { hasModule, sectionExtensionMonths } from "@/lib/update-modules";

// Per-report expenditure matrix (partner-owned).
//
// GET   ?reportId=  → { indirectRate, currentYear, categories, years,
//                       reportYears, budgets: [...], expenditure: [...],
//                       proposedBudget, extension }
// PATCH { reportId, categoryId, annual_expenditure, proposed_amount, comment }
//                   → upsert one entry
//
// THE FOUR VERSIONS. An annual report, and an update with neither Expenditure
// add-on, gets the plain actual-spending table. `proposedBudget` turns on the
// proposed-new-budget columns, `extension.months` stretches the year columns
// past the project's end, and an update carrying both add-ons gets both. Which
// add-ons are live is read off the update's modules here, so the client never
// has to work out its own version.

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// The proposed new budget ships in db/add-expenditure-proposed.sql. Same
// schema-drift guard the rest of the project-update code uses: a DB without the
// migration keeps working, it just cannot carry a budget revision.
let hasProposedCache: boolean | null = null;

async function hasProposedColumn(): Promise<boolean> {
  if (hasProposedCache !== null) return hasProposedCache;
  const rows = await query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND table_name   = 'expenditure_entries'
        AND column_name  = 'proposed_amount'`
  );
  hasProposedCache = rows.length === 1;
  return hasProposedCache;
}

// Indirect support costs actually spent, ships in db/add-expenditure-indirect.sql.
// Without it the page falls back to deriving the figure from the rate, which is
// what it always did.
let hasIndirectCache: boolean | null = null;

async function hasIndirectColumn(): Promise<boolean> {
  if (hasIndirectCache !== null) return hasIndirectCache;
  const rows = await query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND table_name   = 'reports'
        AND column_name  = 'indirect_expenditure'`
  );
  hasIndirectCache = rows.length === 1;
  return hasIndirectCache;
}

// Flat cross-report listing (admin "Full Data" view): one row per expenditure
// entry (a report's spend in a category) — i.e. one row per year-entry, with the
// matching approved budget for that category+year joined in.
const SELECT_ALL = `
  SELECT e.id, e.report_id, e.category_id,
         e.annual_expenditure, e.comment,
         cat.name AS category_name, cat.sort_order,
         b.approved_amount,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.expenditure_entries e
    JOIN reporting_platform.expenditure_categories cat ON cat.id = e.category_id
    JOIN reporting_platform.reports  r  ON r.id  = e.report_id
    JOIN reporting_platform.projects p  ON p.id  = r.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
    LEFT JOIN reporting_platform.expenditure_budgets b
      ON b.project_id = r.project_id AND b.category_id = e.category_id AND b.year = r.year
   WHERE r.data_type = 'report'
   ORDER BY r.year DESC, pt.short_name, p.project_title, cat.sort_order ASC, cat.id ASC`;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) {
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      logger.error("GET /api/expenditure (all) error:", err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    const moduleCols = await hasUpdateModuleColumns();
    const meta = await query<{
      project_id: number; year: number; data_type: string; indirect_cost_rate: string;
      update_types: string[] | null; update_modules: string[] | null; update_months: number | null;
    }>(
      `SELECT r.project_id, r.year, r.data_type, p.indirect_cost_rate,
              ${moduleCols
                ? "r.update_types, r.update_modules, r.update_months"
                : "NULL::text[] AS update_types, NULL::text[] AS update_modules, NULL::integer AS update_months"}
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE r.id = $1`,
      [reportId]
    );
    if (!meta.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const {
      project_id, year, data_type: reportDataType, indirect_cost_rate,
      update_types, update_modules, update_months,
    } = meta[0];

    // Which version of the page this document calls for. Both are 0/false for
    // anything that is not a project update carrying the add-on.
    const isUpdate = reportDataType === "update";
    const proposedBudget = isUpdate && hasModule(update_modules, "expenditure_budget");
    const extensionMonths = isUpdate
      ? sectionExtensionMonths("expenditure", update_modules, update_months)
      : 0;
    // An update that stands in for the annual report closes a full year. One
    // that does not — a budget revision, a no cost extension — reports the part
    // of the year spent so far, and its column says "to date".
    const standsInForAnnualReport = (update_types ?? []).includes("annual_report");

    const categories = await query(
      `SELECT id, name, sort_order FROM reporting_platform.expenditure_categories
        ORDER BY sort_order ASC, id ASC`
    );
    // Every year the admin can budget for — the full project period (same source
    // the admin budget editor uses) — so all year-wise budgets show in the report
    // editor even for years whose report hasn't been created yet. The current
    // report year is always included (it may fall outside the derived range).
    //
    // An extended time frame is simply a longer project: the SAME helper
    // functions, asked for duration + the extension (see
    // PROJECT_DATE_CALCULATION_STANDARD.md — the date logic is never redone
    // here). So `extended_years` answers "does the extension reach into another
    // year?" by itself: whatever it holds that the plain range does not is a
    // year the table has to grow a column for, and when the extension stays
    // inside the final year it holds nothing new and the table is unchanged.
    const range = await query<{ years: number[]; extended_years: number[]; extended_end: string | null }>(
      `SELECT reporting_platform.project_year_range(p.project_start_date, p.project_duration_months) AS years,
              reporting_platform.project_year_range(
                p.project_start_date, COALESCE(p.project_duration_months, 12) + $2) AS extended_years,
              TO_CHAR(reporting_platform.project_end_date(
                p.project_start_date, COALESCE(p.project_duration_months, 12) + $2), 'YYYY-MM-DD') AS extended_end
         FROM reporting_platform.projects p WHERE p.id = $1`,
      [project_id, extensionMonths]
    );
    const baseYears = new Set<number>(range[0]?.years ?? []);
    const extensionYears = (range[0]?.extended_years ?? []).filter((y) => !baseYears.has(y));

    // ── Which year this document reports spending for ──────────────────────
    //
    // For a report, its own year. For an UPDATE, the year after the last annual
    // report: that is the first year nobody has reported yet, and it is the one
    // the update has to account for. The update's own year label plays no part
    // — a document titled "Project Update 2028" on a project whose last annual
    // report was 2026 reports 2027, not 2028.
    //
    // "Last annual report" counts both a real annual/final report row and an
    // earlier update that stood in for one, since either closes its year. This
    // document itself is excluded, so an update that carries an annual report
    // does not read its own year back as already reported.
    // Only an update has to work this out — a report is its own year — so the
    // report path does not run the query at all.
    const lastAnnualRows = isUpdate
      ? await query<{ last_annual: number | null }>(
          `SELECT MAX(year) AS last_annual
             FROM reporting_platform.reports
            WHERE project_id = $1
              AND id <> $2
              AND (data_type = 'report'
                   ${moduleCols ? "OR (data_type = 'update' AND 'annual_report' = ANY(update_types))" : ""})`,
          [project_id, reportId]
        )
      : [];
    const lastAnnual = lastAnnualRows[0]?.last_annual ?? null;
    const firstProjectYear = baseYears.size ? Math.min(...baseYears) : year;
    // No annual report yet ⇒ the project's first year is the one still to report.
    const currentYear = isUpdate ? (lastAnnual != null ? lastAnnual + 1 : firstProjectYear) : year;

    const yearSet = new Set<number>([...baseYears, ...extensionYears]);
    yearSet.add(currentYear);
    const years = Array.from(yearSet).sort((a, b) => a - b);
    // Years that actually have a report: their expenditure columns are shown
    // (read-only unless it's the current report year); years without a report
    // show the approved budget only.
    const reportYearRows = await query<{ year: number }>(
      `SELECT DISTINCT year FROM reporting_platform.reports
        WHERE project_id = $1 AND data_type = 'report'`,
      [project_id]
    );
    const reportYears = reportYearRows.map((r) => r.year);
    // For updates, ensure the year being reported appears in reportYears so its
    // expenditure column is shown (the update owns that year's entries).
    if (isUpdate && !reportYears.includes(currentYear)) {
      reportYears.push(currentYear);
    }
    const budgets = await query<{ category_id: number; year: number; approved_amount: string | null; description: string | null }>(
      `SELECT category_id, year, approved_amount, description
         FROM reporting_platform.expenditure_budgets WHERE project_id = $1`,
      [project_id]
    );
    // Expenditure across all relevant reports. For an update: past years use the
    // report's entries; the update's own year uses the update's own entries.
    // The proposed new budget rides along on the update's own row (it is a
    // whole-period figure, not an annual one).
    const proposedCol = (await hasProposedColumn()) ? "e.proposed_amount" : "NULL::numeric AS proposed_amount";
    const expenditure = await query<{
      category_id: number; year: number; annual_expenditure: string | null;
      proposed_amount: string | null; comment: string | null;
    }>(
      isUpdate
        ? // The update's own entries belong to the year it reports, which is not
          // its year label (see above) — they are read back under that year so
          // what the partner typed comes back into the column they typed it in.
          `SELECT e.category_id,
                  CASE WHEN r.id = $2 THEN $3::int ELSE r.year END AS year,
                  e.annual_expenditure, ${proposedCol}, e.comment
             FROM reporting_platform.expenditure_entries e
             JOIN reporting_platform.reports r ON r.id = e.report_id
            WHERE r.project_id = $1
              AND ((r.data_type = 'report' AND r.year <> $3) OR r.id = $2)`
        : // A report has no budget revision to carry, so it never reads one.
          `SELECT e.category_id, r.year, e.annual_expenditure,
                  NULL::numeric AS proposed_amount, e.comment
             FROM reporting_platform.expenditure_entries e
             JOIN reporting_platform.reports r ON r.id = e.report_id
            WHERE r.project_id = $1
              AND r.data_type = 'report'`,
      isUpdate ? [project_id, reportId, currentYear] : [project_id]
    );

    // Indirect support costs actually spent, per year — the same documents the
    // expenditure rows come from, read off the report row rather than a category
    // entry. Updates only: on an annual report the row stays derived from the
    // rate, exactly as before. A year with no figure is simply absent, and the
    // page falls back to the rate for it.
    const indirect =
      isUpdate && (await hasIndirectColumn())
        ? await query<{ year: number; annual_expenditure: string | null }>(
            `SELECT CASE WHEN r.id = $2 THEN $3::int ELSE r.year END AS year,
                    r.indirect_expenditure AS annual_expenditure
               FROM reporting_platform.reports r
              WHERE r.project_id = $1
                AND r.indirect_expenditure IS NOT NULL
                AND ((r.data_type = 'report' AND r.year <> $3) OR r.id = $2)`,
            [project_id, reportId, currentYear]
          )
        : [];

    return NextResponse.json({
      indirectRate: Number(indirect_cost_rate),
      currentYear,
      // The reported year is only part of a year when the update is not also the
      // annual report — its column is labelled "to date" and asks for spending
      // so far rather than a closed annual figure.
      currentYearToDate: isUpdate && !standsInForAnnualReport,
      categories,
      years,
      reportYears,
      budgets: budgets.map((b) => ({ ...b, approved_amount: toAmount(b.approved_amount) })),
      expenditure: expenditure.map((e) => ({
        ...e,
        annual_expenditure: toAmount(e.annual_expenditure),
        proposed_amount: toAmount(e.proposed_amount),
      })),
      indirect: indirect.map((i) => ({ ...i, annual_expenditure: toAmount(i.annual_expenditure) })),
      // Everything the page does beyond the plain annual-report table — the
      // entered indirect support costs and the budget flags — is for updates.
      isUpdate,
      // The page's version (see the note at the top of this file).
      proposedBudget,
      extension: {
        months: extensionMonths,
        years: extensionYears,
        endDate: extensionMonths > 0 ? range[0]?.extended_end ?? null : null,
      },
    });
  } catch (err) {
    logger.error("GET /api/expenditure error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, categoryId } = body;
  // Indirect support costs are not a budget category, so they are saved on their
  // own: { reportId, indirect_expenditure } with no categoryId.
  const sentIndirect = Object.prototype.hasOwnProperty.call(body, "indirect_expenditure");
  if (!reportId || (!categoryId && !sentIndirect)) {
    return NextResponse.json(
      { error: "reportId and either categoryId or indirect_expenditure required" },
      { status: 400 }
    );
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
  if (gate) return gate;

  if (sentIndirect) {
    try {
      if (!(await hasIndirectColumn())) {
        return NextResponse.json(
          { error: "Indirect support costs are not available on this database — run db/add-expenditure-indirect.sql" },
          { status: 400 }
        );
      }
      const rows = await query(
        `UPDATE reporting_platform.reports
            SET indirect_expenditure = $2
          WHERE id = $1
          RETURNING id, indirect_expenditure`,
        [reportId, toAmount(body.indirect_expenditure)]
      );
      if (!rows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
      return NextResponse.json(rows[0]);
    } catch (err) {
      logger.error("PATCH /api/expenditure (indirect) error:", err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  try {
    // The proposed new budget is only written by the budget-revision versions of
    // the page. A body that does not mention it leaves the stored figure alone —
    // the plain page saving a comment must not wipe a budget revision that was
    // already typed — and a DB without the migration says so rather than
    // dropping a figure on the floor.
    const sentProposed = Object.prototype.hasOwnProperty.call(body, "proposed_amount");
    const withProposed = await hasProposedColumn();
    if (sentProposed && !withProposed) {
      return NextResponse.json(
        { error: "The proposed new budget is not available on this database — run db/add-expenditure-proposed.sql" },
        { status: 400 }
      );
    }
    const writeProposed = sentProposed && withProposed;
    const rows = await query(
      `INSERT INTO reporting_platform.expenditure_entries
         (report_id, category_id, annual_expenditure, comment${writeProposed ? ", proposed_amount" : ""})
       VALUES ($1, $2, $3, $4${writeProposed ? ", $5" : ""})
       ON CONFLICT (report_id, category_id) DO UPDATE
         SET annual_expenditure = EXCLUDED.annual_expenditure,
             comment            = EXCLUDED.comment,
             ${writeProposed ? "proposed_amount = EXCLUDED.proposed_amount," : ""}
             updated_at         = NOW()
       RETURNING *`,
      [
        reportId, categoryId, toAmount(body.annual_expenditure), (body.comment as string) || null,
        ...(writeProposed ? [toAmount(body.proposed_amount)] : []),
      ]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/expenditure error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
