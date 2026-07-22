import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db";

const MIN_YEAR = 2020;
const MAX_YEAR = 2050;

// GET /api/reports — list all reports with project + partner info
// Optional query param: ?data_type=report|prodoc
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const dataType = searchParams.get("data_type");

    const rows = await query(`
      SELECT
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
        p.short_name                                    AS partner_short_name,
        p.long_name                                     AS partner_long_name,
        p.organization_website
      FROM reporting_platform.reports r
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      ${dataType ? `WHERE r.data_type = '${dataType === "prodoc" ? "prodoc" : "report"}'` : ""}
      ORDER BY r.year DESC, p.short_name, pr.project_title
    `);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/reports error:", err);
    return NextResponse.json({ error: "Failed to load reports" }, { status: 500 });
  }
}

function parseYear(value: unknown): number | null {
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

// Seed a freshly-created report from its project's project document (prodoc):
// copy the baseline lines (survey questions, risk register, indicator lines with
// their baselines/targets) so the report opens as a snapshot of the prodoc. The
// partner then fills the per-report actuals (answers, scores, achieved values).
// Project-level definitions (workplan, expenditure budgets, transfer partners,
// complementary contributors) are shared by project_id and need no copy.
//
// Set-based over a list of new report ids so it serves both the single and the
// annual paths. Each new report is joined to its project's prodoc.
async function copyProdocBaseline(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  await client.query(
    `INSERT INTO reporting_platform.surveys (report_id, question)
     SELECT nr.id, s.question
       FROM reporting_platform.reports nr
       JOIN reporting_platform.reports pd
         ON pd.project_id = nr.project_id AND pd.data_type = 'prodoc'
       JOIN reporting_platform.surveys s ON s.report_id = pd.id
      WHERE nr.id = ANY($1::int[])`,
    [reportIds]
  );

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

// Populate expenditure entries for the report.
// Creates one row per category. approved_amount is GENERATED (always references
// current expenditure_budgets), so budget changes in prodoc automatically update all reports.
// Variance columns are auto-calculated when annual_expenditure is filled in.
async function populateExpenditureEntries(client: PoolClient, reportIds: number[]) {
  if (reportIds.length === 0) return;

  await client.query(
    `INSERT INTO reporting_platform.expenditure_entries
       (report_id, category_id, year)
     SELECT nr.id, ec.id, nr.year
       FROM reporting_platform.reports nr
       CROSS JOIN reporting_platform.expenditure_categories ec
      WHERE nr.id = ANY($1::int[])
        AND nr.data_type = 'report'
      ON CONFLICT (report_id, category_id) DO NOTHING`,
    [reportIds]
  );
}

// POST /api/reports
// Single report: { project_id, year, report_submission_date? }
// Annual report (all projects): { year, annual: true, report_submission_date? }
export async function POST(request: Request) {
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
  const reportType = body.report_type === "final" ? "final" : "annual";

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
        [year, submissionDate, dataType, reportType]
      );

      const totalProjects = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM reporting_platform.projects`
      );

      await copyProdocBaseline(client, inserted.rows.map((r) => r.id));
      await populateExpenditureEntries(client, inserted.rows.map((r) => r.id));

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
    await populateExpenditureEntries(client, [inserted.rows[0].id]);

    await client.query("COMMIT");
    return NextResponse.json(inserted.rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/reports error:", err);
    return NextResponse.json({ error: "Failed to create report" }, { status: 500 });
  } finally {
    client.release();
  }
}
