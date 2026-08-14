import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, editorProjectIds } from "@/lib/authz";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import { logger } from "@/lib/logger";
import { REPORT_SCOPED_TABLES, PRODOC_PROJECT_SCOPED_TABLES } from "@/lib/report-tables";

const MIN_YEAR = 2020;
const MAX_YEAR = 2050;

// "Last edited" is content-aware: a report/prodoc is far more than its `reports`
// row — the real edits land in the section tables. So we take the GREATEST of the
// report row's own updated_at and the newest updated_at across every child table.
// (Postgres GREATEST ignores NULLs, so tables with no rows simply drop out.)
//
//  • report-scoped tables (report_id = r.id) count for every report AND the prodoc
//  • project-scoped definition tables (project_id) count only for the prodoc, which
//    IS the project definition — counting them for annual reports would make every
//    year of a project share one timestamp (editing 2025's workplan would bump 2024).
// The canonical table lists live in @/lib/report-tables so /api/reports and
// /api/reports/activity can never drift (see REPORT_SCOPED_TABLES import above).
// The live DB has drifted from db/schema.sql (see the schema-consolidation note):
// not every table actually carries `updated_at`. So we introspect once which of
// our candidate tables really have the column and build the GREATEST expression
// from just those — referencing a missing column would 500 the whole endpoint.
// Cached module-side; the set only changes on a migration, never at runtime.
let lastEditedExprCache: string | null = null;

async function getLastEditedExpr(): Promise<string> {
  if (lastEditedExprCache) return lastEditedExprCache;

  // reports/projects anchor the expression, so introspect them too — this DB may
  // not carry updated_at anywhere yet (schema drift). Any table without the column
  // is simply left out; if none have it, last_edited resolves to NULL (feature off).
  const present = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND column_name  = 'updated_at'
        AND table_name   = ANY($1::text[])`,
    [["reports", "projects", ...REPORT_SCOPED_TABLES, ...PRODOC_PROJECT_SCOPED_TABLES]]
  );
  const have = new Set(present.map((r) => r.table_name));

  // Each table that has an updated_at contributes its newest row.
  // Postgres GREATEST ignores NULLs, so empty child tables simply drop out.
  const parts: string[] = [];
  if (have.has("reports")) parts.push("r.updated_at");
  for (const t of REPORT_SCOPED_TABLES) {
    if (have.has(t)) {
      parts.push(`(SELECT MAX(le.updated_at) FROM reporting_platform.${t} le WHERE le.report_id = r.id)`);
    }
  }
  for (const t of PRODOC_PROJECT_SCOPED_TABLES) {
    if (have.has(t)) {
      parts.push(
        `CASE WHEN r.data_type = 'prodoc' THEN (SELECT MAX(le.updated_at) FROM reporting_platform.${t} le WHERE le.project_id = r.project_id) END`
      );
    }
  }
  if (have.has("projects")) parts.push("CASE WHEN r.data_type = 'prodoc' THEN pr.updated_at END");

  lastEditedExprCache =
    parts.length === 0
      ? "NULL::timestamptz"
      : `GREATEST(\n        ${parts.join(",\n        ")}\n      )`;
  return lastEditedExprCache;
}

// GET /api/reports — list all reports with project + partner info
// Optional query param: ?data_type=report|prodoc
export async function GET(request: Request) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get("data_type");

    // Partners see only their own organization's reports; admins see all.
    const scoped = session.role !== "admin";
    const conditions: string[] = [];
    const values: unknown[] = [];
    if (dataType) conditions.push(`r.data_type = '${dataType === "prodoc" ? "prodoc" : "report"}'`);
    if (scoped) {
      // A partner sees reports their org owns PLUS the prodocs of projects they
      // were granted edit rights on (project_editors). Editor rights cover the
      // prodoc only, never annual reports, so that arm is prodoc-scoped.
      values.push(session.org);
      const ownArm = `lower(p.short_name) = lower($${values.length})`;
      const editorIds = await editorProjectIds(session);
      if (editorIds.length) {
        values.push(editorIds);
        conditions.push(
          `(${ownArm} OR (r.data_type = 'prodoc' AND r.project_id = ANY($${values.length}::int[])))`
        );
      } else {
        conditions.push(ownArm);
      }
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    const lastEditedExpr = await getLastEditedExpr();
    const rows = await query(
      `SELECT
        r.id,
        r.project_id,
        r.year,
        TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date,
        r.authorized,
        r.status,
        r.created_at,
        r.data_type,
        r.report_type,
        pr.project_title,
        pr.short_name                                   AS project_short_name,
        pr.mptfo_project_number,
        pr.grant_size_usd,
        pr.geographic_scope,
        TO_CHAR(pr.project_start_date, 'YYYY-MM-DD')   AS project_start_date,
        pr.project_duration_months,
        pr.partner_id                                   AS owner_partner_id,
        p.short_name                                    AS partner_short_name,
        p.long_name                                     AS partner_long_name,
        p.organization_website,
        ${lastEditedExpr}                               AS last_edited
      FROM reporting_platform.reports r
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      ${where}
      ORDER BY r.year DESC, p.short_name, pr.project_title`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

function parseYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

// Seed a freshly-created report from its project's project document (prodoc):
// copy the baseline lines (risk register, indicator lines with their baselines/
// targets) so the report opens as a snapshot of the prodoc. The partner then
// fills the per-report actuals (scores, achieved values). Survey questions are
// NOT part of the prodoc — they are seeded separately (see seedReportSurveys).
// Project-level definitions (workplan, expenditure budgets, transfer partners,
// complementary contributors) are shared by project_id and need no copy.
//
// Set-based over a list of new report ids so it serves both the single and the
// annual paths. Each new report is joined to its project's prodoc.
async function copyProdocBaseline(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  await client.query(
    `INSERT INTO reporting_platform.risk_management
       (report_id, risk_name, approved_mitigation)
     SELECT nr.id, rm.risk_name, rm.approved_mitigation
       FROM reporting_platform.reports nr
       JOIN reporting_platform.reports pd
         ON pd.project_id = nr.project_id AND pd.data_type = 'prodoc'
       JOIN reporting_platform.risk_management rm ON rm.report_id = pd.id
      WHERE nr.id = ANY($1::int[])`,
    [reportIds]
  );

  await client.query(
    `INSERT INTO reporting_platform.indicator_data
       (report_id, indicator_id, baseline_value, baseline_year, target_value, target_year, sort_order)
     SELECT nr.id, d.indicator_id, d.baseline_value, d.baseline_year, d.target_value, d.target_year, d.sort_order
       FROM reporting_platform.reports nr
       JOIN reporting_platform.reports pd
         ON pd.project_id = nr.project_id AND pd.data_type = 'prodoc'
       JOIN reporting_platform.indicator_data d ON d.report_id = pd.id
      WHERE nr.id = ANY($1::int[])`,
    [reportIds]
  );
}

// Seed a new report's survey questions. Surveys are not stored on the prodoc; the
// template lives in standard_survey_questions (admin-authored, keyed by report
// type) and flows forward through each project's report chain:
//   • final report            → the standard FINAL questions
//   • first annual report      → the standard ANNUAL questions
//   • subsequent annual report → a copy of the previous annual report's questions,
//     so edits to one year's survey carry into the next
// Set-based over a list of new report ids; each report keys off its own
// report_type, so it serves both the single and the annual-batch paths.
// A brand-new report has no surveys yet, and the two inserts below are mutually
// exclusive per report (annual-with-prior vs. everything else) and each source is
// itself duplicate-free, so no de-dup is needed. (The live `surveys` table has no
// UNIQUE(report_id, question), so an ON CONFLICT arbiter on those columns can't be
// used regardless — the report re-insert is already guarded upstream.)
async function seedReportSurveys(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  // Annual reports that already have a prior annual report: copy that report's
  // questions (the most recent earlier year), so template changes propagate forward.
  await client.query(
    `INSERT INTO reporting_platform.surveys (report_id, question)
     SELECT nr.id, s.question
       FROM reporting_platform.reports nr
       JOIN LATERAL (
         SELECT pr.id
           FROM reporting_platform.reports pr
          WHERE pr.project_id = nr.project_id
            AND pr.data_type = 'report'
            AND pr.report_type = 'annual'
            AND pr.year < nr.year
          ORDER BY pr.year DESC, pr.id DESC
          LIMIT 1
       ) prev ON TRUE
       JOIN reporting_platform.surveys s ON s.report_id = prev.id
      WHERE nr.id = ANY($1::int[])
        AND nr.report_type = 'annual'
      ORDER BY nr.id, s.id`,
    [reportIds]
  );

  // The rest fall back to the global standard questions for their type: every
  // final report, plus the first annual report of a project (no prior annual to
  // copy from). Matched by report_type. The ::text casts bridge a live-schema
  // drift where reports.report_type is TEXT while standard_survey_questions
  // .report_type is the report_type_enum — a bare `=` would raise "operator does
  // not exist: report_type_enum = text".
  await client.query(
    `INSERT INTO reporting_platform.surveys (report_id, question)
     SELECT nr.id, sq.question
       FROM reporting_platform.reports nr
       JOIN reporting_platform.standard_survey_questions sq
         ON sq.report_type::text = nr.report_type::text
      WHERE nr.id = ANY($1::int[])
        AND (
          nr.report_type = 'final'
          OR NOT EXISTS (
            SELECT 1
              FROM reporting_platform.reports pr
             WHERE pr.project_id = nr.project_id
               AND pr.data_type = 'report'
               AND pr.report_type = 'annual'
               AND pr.year < nr.year
          )
        )
      ORDER BY nr.id, sq.sort_order, sq.id`,
    [reportIds]
  );
}

// Populate expenditure entries for the report.
// Creates one row per category. approved_amount is GENERATED — it derives both the
// project and the year from the entry's report (report_id → reports), so budget
// changes in the prodoc automatically update all reports and no year is stored on
// the row. Variance columns are auto-calculated when annual_expenditure is filled in.
async function populateExpenditureEntries(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  await client.query(
    `INSERT INTO reporting_platform.expenditure_entries
       (report_id, category_id)
     SELECT nr.id, ec.id
       FROM reporting_platform.reports nr
       CROSS JOIN reporting_platform.expenditure_categories ec
      WHERE nr.id = ANY($1::int[])
        AND nr.data_type = 'report'
      ON CONFLICT (report_id, category_id) DO NOTHING`,
    [reportIds]
  );
}

// Ensure each new report has its matching workplan update window, and make that
// window the project's active one. Workplan progress attaches to admin-managed
// update windows (workplan_updates), each labelled [YEAR]+[code]; a report with no
// active window shows partners the "No active update window has been set" notice.
// So we auto-create the window that corresponds to the report — annual → 'AR',
// final → 'FR', keyed on (project_id, year, type_code), mirroring the migration-046
// backfill mapping — then activate it so the partner can enter progress right away.
//
// Idempotent creation: a NOT EXISTS anti-join skips any (project, year, code)
// window that already exists, so re-creating a report (or an admin having added the
// window by hand) creates nothing. Exactly one report — and thus at most one new
// window — is created per project in both the single and annual-batch paths, so
// activating the freshly-inserted windows keeps the one-active-per-project invariant
// (partial unique index workplan_updates_one_active_uq) after we clear the prior
// active window for those projects.
async function seedWorkplanUpdateWindows(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  const inserted = await client.query<{ id: number; project_id: number }>(
    `INSERT INTO reporting_platform.workplan_updates (project_id, year, type_code, sort_order)
     SELECT nr.project_id, nr.year,
            CASE nr.report_type::text WHEN 'final' THEN 'FR' ELSE 'AR' END AS type_code,
            COALESCE(
              (SELECT MAX(wu.sort_order) FROM reporting_platform.workplan_updates wu
                WHERE wu.project_id = nr.project_id), 0)
              + ROW_NUMBER() OVER (PARTITION BY nr.project_id ORDER BY nr.year, nr.id) AS sort_order
       FROM reporting_platform.reports nr
      WHERE nr.id = ANY($1::int[])
        AND nr.data_type = 'report'
        AND NOT EXISTS (
          SELECT 1 FROM reporting_platform.workplan_updates wu
           WHERE wu.project_id = nr.project_id
             AND wu.year = nr.year
             AND wu.type_code = CASE nr.report_type::text WHEN 'final' THEN 'FR' ELSE 'AR' END
        )
     RETURNING id, project_id`,
    [reportIds]
  );

  const newWindowIds = inserted.rows.map((r) => r.id);
  if (newWindowIds.length === 0) return;

  const projectIds = inserted.rows.map((r) => r.project_id);
  // Clear the previously-active window on just these projects, then activate the
  // new windows — order matters so the one-active partial unique index never sees
  // two active rows for a project mid-statement.
  await client.query(
    `UPDATE reporting_platform.workplan_updates
        SET is_active = FALSE
      WHERE project_id = ANY($1::int[]) AND is_active AND id <> ALL($2::int[])`,
    [projectIds, newWindowIds]
  );
  await client.query(
    `UPDATE reporting_platform.workplan_updates
        SET is_active = TRUE
      WHERE id = ANY($1::int[])`,
    [newWindowIds]
  );
}

// POST /api/reports
// Single report: { project_id, year, report_submission_date? }
// Annual report (all projects): { year, annual: true, report_submission_date? }
export async function POST(request: Request) {
  // Creating reports (single or the annual batch) is an admin lifecycle operation.
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

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
  // Report types are admin-editable (Settings → Dropdown options). Accept any
  // configured value for a single report; fall back to "annual" (or the first
  // configured type) when unspecified/unknown. The annual batch below always
  // creates "annual" reports regardless, since its seeding logic is annual-specific.
  await loadOptionOverrides();
  const reportTypeValues = optionValues("reportType");
  const reportType =
    typeof body.report_type === "string" && reportTypeValues.includes(body.report_type)
      ? body.report_type
      : reportTypeValues.includes("annual")
        ? "annual"
        : reportTypeValues[0] ?? "annual";

  // Project documents are created automatically with their project (exactly one
  // per project), so they can't be added by hand here.
  if (dataType === "prodoc") {
    return NextResponse.json(
      { error: "Project documents are created automatically with their project." },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Annual report: one report per project, seeded in two set-based queries ──
    if (body.annual) {
      const inserted = await client.query<{ id: number }>(
        `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type, report_type)
         SELECT pr.id, $1, $2, $3, $4 FROM reporting_platform.projects pr
         ON CONFLICT (project_id, year, data_type) DO NOTHING
         RETURNING id`,
        [year, submissionDate, dataType, "annual"]
      );

      const totalProjects = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM reporting_platform.projects`
      );

      await copyProdocBaseline(client, inserted.rows.map((r) => r.id));
      await seedReportSurveys(client, inserted.rows.map((r) => r.id));
      await populateExpenditureEntries(client, inserted.rows.map((r) => r.id));
      await seedWorkplanUpdateWindows(client, inserted.rows.map((r) => r.id));

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
      `INSERT INTO reporting_platform.reports (project_id, year, report_submission_date, data_type, report_type)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, year, data_type) DO NOTHING
       RETURNING *`,
      [projectId, year, submissionDate, dataType, reportType]
    );

    if (inserted.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { error: "A report already exists for this project and year" },
        { status: 409 }
      );
    }

    await copyProdocBaseline(client, [inserted.rows[0].id]);
    await seedReportSurveys(client, [inserted.rows[0].id]);
    await populateExpenditureEntries(client, [inserted.rows[0].id]);
    await seedWorkplanUpdateWindows(client, [inserted.rows[0].id]);

    await client.query("COMMIT");
    return NextResponse.json(inserted.rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/reports error:", err);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  } finally {
    client.release();
  }
}
