import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { logStatusChange } from "@/lib/version-log";

// POST /api/prodoc-submit — partner submits their project document for review.
// Transitions status Open → Under Review, which locks partner editing.
// Blocked if required fields are missing or if the tranche/budget totals don't
// match the requested funding amount within the allowed tolerance ($1 rounding).
export async function POST(request: NextRequest) {
  try {
    const session = await requireSession();
    if (session instanceof NextResponse) return session;

    const body = await request.json();
    const projectId = body.project_id;
    const checkOnly = body.check_only === true;
    if (!projectId) {
      return NextResponse.json({ error: "project_id is required" }, { status: 400 });
    }

    const gate = await guardProject(session, projectId);
    if (gate) return gate;

    const prodocRows = await query<{ id: number; status: string }>(
      `SELECT r.id, r.status
         FROM reporting_platform.reports r
        WHERE r.project_id = $1 AND r.data_type = 'prodoc'
        LIMIT 1`,
      [projectId]
    );
    if (prodocRows.length === 0) {
      return NextResponse.json({ error: "Project document not found" }, { status: 404 });
    }
    const prodoc = prodocRows[0];

    if (prodoc.status !== "Open") {
      if (checkOnly) {
        return NextResponse.json({ ok: true, alreadySubmitted: true });
      }
      return NextResponse.json(
        { error: "This project document has already been submitted and cannot be submitted again." },
        { status: 409 }
      );
    }

    // Validate required project fields, tranche total, and budget total in one query.
    const fundingRows = await query<{
      project_title: string | null;
      grant_size_usd: string | null;
      project_start_date: string | null;
      project_duration_months: number | null;
      geographic_scope: string | null;
      description: string | null;
      tranche_total: string;
      budget_total: string;
    }>(
      `SELECT
         p.project_title, p.grant_size_usd, p.project_start_date,
         p.project_duration_months, p.geographic_scope, p.description,
         COALESCE(SUM(tc.amount), 0) AS tranche_total,
         ROUND(COALESCE(
           (SELECT SUM(b.approved_amount)
            FROM reporting_platform.expenditure_budgets b
            WHERE b.project_id = p.id
              AND b.year = ANY (reporting_platform.project_year_range(p.project_start_date, p.project_duration_months))
           ), 0
         ) * (1 + COALESCE(p.indirect_cost_rate, 0.07)), 2) AS budget_total
         FROM reporting_platform.projects p
         LEFT JOIN reporting_platform.project_tranche_cells tc ON tc.project_id = p.id
        WHERE p.id = $1
        GROUP BY p.id`,
      [projectId]
    );
    if (fundingRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const proj = fundingRows[0];

    // Check required fields before validating the tranche total.
    const emptyFields: string[] = [];
    if (!proj.project_title?.trim()) emptyFields.push("Project name");
    if (!proj.grant_size_usd) emptyFields.push("Requested funding amount");
    if (!proj.project_start_date) emptyFields.push("Start date");
    if (proj.project_duration_months == null) emptyFields.push("Duration (months)");
    if (!proj.geographic_scope?.trim()) emptyFields.push("Geographic scope");
    if (!proj.description?.trim()) emptyFields.push("Description");
    if (emptyFields.length > 0) {
      return NextResponse.json(
        { error: `Complete required fields in General: ${emptyFields.join(", ")}.` },
        { status: 422 }
      );
    }

    // Validate tranche and budget totals against the requested funding amount.
    // Tolerance: each total must be within [grant_size_usd − $1, grant_size_usd].
    // Exceeding the requested amount is never accepted; being more than $1 short
    // is also rejected. A gap of up to $1.00 (e.g. from rounding) is allowed.
    const fmt = (v: number) =>
      v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const approved = parseFloat(proj.grant_size_usd!);

    const trancheTotal = parseFloat(proj.tranche_total);
    const trancheDiffCents = Math.round(approved * 100) - Math.round(trancheTotal * 100);
    if (trancheDiffCents < 0 || trancheDiffCents > 100) {
      return NextResponse.json(
        {
          error: trancheDiffCents < 0
            ? `The tranche release schedule exceeds the requested funding amount by ${fmt(Math.abs(trancheDiffCents) / 100)}.`
            : `${fmt(trancheDiffCents / 100)} remains to be scheduled in the tranche release schedule.`,
        },
        { status: 422 }
      );
    }

    const budgetTotal = parseFloat(proj.budget_total);
    const budgetDiffCents = Math.round(approved * 100) - Math.round(budgetTotal * 100);
    if (budgetDiffCents < 0 || budgetDiffCents > 100) {
      return NextResponse.json(
        {
          error: budgetDiffCents < 0
            ? `The total budget exceeds the requested funding amount by ${fmt(Math.abs(budgetDiffCents) / 100)}.`
            : `${fmt(budgetDiffCents / 100)} remains to be budgeted.`,
        },
        { status: 422 }
      );
    }

    const missingDatesRows = await query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM reporting_platform.project_tranche_cells
        WHERE project_id = $1 AND amount > 0 AND release_date IS NULL`,
      [projectId]
    );
    if ((missingDatesRows[0]?.count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Add a release date for every tranche with an amount in the tranche release schedule." },
        { status: 422 }
      );
    }

    if (checkOnly) return NextResponse.json({ ok: true });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updated = await client.query<{ id: number; status: string }>(
        `UPDATE reporting_platform.reports
            SET status = 'Under Review',
                submitted_at = now()
          WHERE id = $1 AND status = 'Open'
          RETURNING id, status`,
        [prodoc.id]
      );
      if (updated.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: "This project document has already been submitted and cannot be submitted again." },
          { status: 409 }
        );
      }

      await logStatusChange(
        {
          entity_type: "prodoc",
          entity_id: prodoc.id,
          entity_label: "Project Document",
          project_id: Number(projectId),
          from_status: "Open",
          to_status: "Under Review",
          actor_role: session.role,
          actor_org: session.org ?? null,
          actor_name: null,
          reason: null,
        },
        client
      );

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }

    logger.info("ProDoc submitted", { project_id: projectId, prodoc_id: prodoc.id, org: session.org });
    return NextResponse.json({ ok: true, status: "Under Review" });
  } catch (err) {
    logger.error("POST /api/prodoc-submit error:", err);
    return NextResponse.json({ error: "Failed to submit project document" }, { status: 500 });
  }
}
