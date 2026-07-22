import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Approved annual budgets + indirect rate for a project (admin-owned).
//
// GET   ?projectId=  → { indirectRate, years, budgets: [{category_id, year, approved_amount}] }
// PATCH { projectId, indirect_cost_rate }                       → set the rate
// PATCH { projectId, categoryId, year, approved_amount }        → upsert one cell

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  try {
    // Uses single source of truth: project_year_range() function in database.
    const proj = await query<{ indirect_cost_rate: string; years: number[] }>(
      `SELECT
         p.indirect_cost_rate,
         reporting_platform.project_year_range(p.project_start_date, p.project_duration_months) AS years
       FROM reporting_platform.projects p
       WHERE p.id = $1`,
      [projectId]
    );
    if (!proj[0]) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const budgets = await query<{ category_id: number; year: number; approved_amount: string | null }>(
      `SELECT category_id, year, approved_amount
         FROM reporting_platform.expenditure_budgets WHERE project_id = $1`,
      [projectId]
    );
    return NextResponse.json({
      indirectRate: Number(proj[0].indirect_cost_rate),
      years: proj[0].years ?? [],
      budgets: budgets.map((b) => ({ ...b, approved_amount: toAmount(b.approved_amount) })),
    });
  } catch (err) {
    console.error("GET /api/expenditure-budgets error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    // Branch 1: set the indirect rate.
    if ("indirect_cost_rate" in body && body.categoryId === undefined) {
      const rate = toAmount(body.indirect_cost_rate) ?? 0.07;
      await query(
        `UPDATE reporting_platform.projects SET indirect_cost_rate = $2 WHERE id = $1`,
        [projectId, rate]
      );
      return NextResponse.json({ ok: true, indirectRate: rate });
    }

    // Branch 2: upsert one approved-amount cell.
    const { categoryId, year } = body;
    if (!categoryId || year === undefined) {
      return NextResponse.json({ error: "categoryId and year required" }, { status: 400 });
    }
    const rows = await query(
      `INSERT INTO reporting_platform.expenditure_budgets
         (project_id, category_id, year, approved_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, category_id, year) DO UPDATE
         SET approved_amount = EXCLUDED.approved_amount, updated_at = NOW()
       RETURNING category_id, year, approved_amount`,
      [projectId, categoryId, year, toAmount(body.approved_amount)]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/expenditure-budgets error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
