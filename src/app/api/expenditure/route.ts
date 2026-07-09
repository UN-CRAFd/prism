import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Per-report expenditure matrix (partner-owned).
//
// GET   ?reportId=  → { indirectRate, currentYear, categories, years,
//                       budgets: [...], expenditure: [...] }
// PATCH { reportId, categoryId, annual_expenditure, comment } → upsert one entry

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    const meta = await query<{ project_id: number; year: number; indirect_cost_rate: string }>(
      `SELECT r.project_id, r.year, p.indirect_cost_rate
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE r.id = $1`,
      [reportId]
    );
    if (!meta.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const { project_id, year, indirect_cost_rate } = meta[0];

    const categories = await query(
      `SELECT id, name, sort_order FROM reporting_platform.expenditure_categories
        ORDER BY sort_order ASC, id ASC`
    );
    const years = await query<{ year: number }>(
      `SELECT DISTINCT year FROM reporting_platform.reports
        WHERE project_id = $1 AND data_type = 'report' ORDER BY year ASC`,
      [project_id]
    );
    const budgets = await query<{ category_id: number; year: number; approved_amount: string | null }>(
      `SELECT category_id, year, approved_amount
         FROM reporting_platform.expenditure_budgets WHERE project_id = $1`,
      [project_id]
    );
    // Expenditure across all of the project's reports (for the per-year + Total columns).
    const expenditure = await query<{
      category_id: number; year: number; annual_expenditure: string | null; comment: string | null;
    }>(
      `SELECT e.category_id, r.year, e.annual_expenditure, e.comment
         FROM reporting_platform.expenditure_entries e
         JOIN reporting_platform.reports r ON r.id = e.report_id
        WHERE r.project_id = $1`,
      [project_id]
    );

    return NextResponse.json({
      indirectRate: Number(indirect_cost_rate),
      currentYear: year,
      categories,
      years: years.map((y) => y.year),
      budgets: budgets.map((b) => ({ ...b, approved_amount: toAmount(b.approved_amount) })),
      expenditure: expenditure.map((e) => ({ ...e, annual_expenditure: toAmount(e.annual_expenditure) })),
    });
  } catch (err) {
    console.error("GET /api/expenditure error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, categoryId } = body;
  if (!reportId || !categoryId) {
    return NextResponse.json({ error: "reportId and categoryId required" }, { status: 400 });
  }

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.expenditure_entries
         (report_id, category_id, annual_expenditure, comment)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (report_id, category_id) DO UPDATE
         SET annual_expenditure = EXCLUDED.annual_expenditure,
             comment            = EXCLUDED.comment,
             updated_at         = NOW()
       RETURNING *`,
      [reportId, categoryId, toAmount(body.annual_expenditure), (body.comment as string) || null]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/expenditure error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
