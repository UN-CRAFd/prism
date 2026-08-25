import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Approved annual budgets + indirect rate for a project (admin-owned).
//
// GET   ?projectId=  → { indirectRate, years, budgets: [{category_id, year, approved_amount}], categoryNotes: [{category_id, description}] }
// PATCH { projectId, indirect_cost_rate }                    → set the rate
// PATCH { projectId, categoryId, year, approved_amount }     → upsert one budget cell
// PATCH { projectId, categoryId, description }               → upsert per-category description

function toAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

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

    const [budgets, categoryNotes] = await Promise.all([
      query<{ category_id: number; year: number; approved_amount: string | null }>(
        `SELECT category_id, year, approved_amount
           FROM reporting_platform.expenditure_budgets WHERE project_id = $1`,
        [projectId]
      ),
      query<{ category_id: number; description: string | null }>(
        `SELECT category_id, description
           FROM reporting_platform.expenditure_budget_category_notes WHERE project_id = $1`,
        [projectId]
      ),
    ]);
    return NextResponse.json({
      indirectRate: Number(proj[0].indirect_cost_rate),
      years: proj[0].years ?? [],
      budgets: budgets.map((b) => ({ ...b, approved_amount: toAmount(b.approved_amount) })),
      categoryNotes,
    });
  } catch (err) {
    logger.error("GET /api/expenditure-budgets error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = Number(body.projectId);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }

  // Ownership check first — a partner must own the project before learning
  // anything about its status.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const ownerGate = await guardProject(session, projectId);
  if (ownerGate) return ownerGate;

  // Status lock — partners cannot write to a prodoc that is not Open.
  // Admins bypass this check entirely, consistent with all other routes.
  if (session.role !== "admin") {
    const prodoc = await query<{ status: string }>(
      `SELECT status FROM reporting_platform.reports
        WHERE project_id = $1 AND data_type = 'prodoc'
        LIMIT 1`,
      [projectId]
    );
    if (prodoc[0]?.status !== "Open") {
      return NextResponse.json({ error: "This report is not open for editing" }, { status: 409 });
    }
  }

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

    const { categoryId } = body;
    if (!categoryId) {
      return NextResponse.json({ error: "categoryId required" }, { status: 400 });
    }

    // Branch 2: upsert per-category description (no year in body).
    if ("description" in body && body.year === undefined) {
      const description =
        typeof body.description === "string" && body.description.trim() !== ""
          ? body.description.trim()
          : null;
      await query(
        `INSERT INTO reporting_platform.expenditure_budget_category_notes
           (project_id, category_id, description)
         VALUES ($1, $2, $3)
         ON CONFLICT (project_id, category_id) DO UPDATE
           SET description = EXCLUDED.description`,
        [projectId, categoryId, description]
      );
      return NextResponse.json({ ok: true });
    }

    // Branch 3: upsert one budget cell (approved amount).
    const { year } = body;
    if (year === undefined) {
      return NextResponse.json({ error: "year required" }, { status: 400 });
    }
    if (!("approved_amount" in body)) {
      return NextResponse.json({ error: "approved_amount required" }, { status: 400 });
    }
    const amount = toAmount(body.approved_amount);
    const rows = await query(
      `INSERT INTO reporting_platform.expenditure_budgets
         (project_id, category_id, year, approved_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (project_id, category_id, year) DO UPDATE
         SET approved_amount = EXCLUDED.approved_amount, updated_at = NOW()
       RETURNING category_id, year, approved_amount`,
      [projectId, categoryId, year, amount]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/expenditure-budgets error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
