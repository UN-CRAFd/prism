import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { logStatusChange } from "@/lib/version-log";

// POST /api/prodoc-submit — partner submits their project document for review.
// Transitions status Open → Under Review, which locks partner editing.
// Blocked if the tranche total doesn't match the approved funding amount within
// the allowed tolerance (see validation below).
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

    // Validate required project fields and tranche total in one query.
    const fundingRows = await query<{
      project_title: string | null;
      grant_size_usd: string | null;
      project_start_date: string | null;
      project_duration_months: number | null;
      geographic_scope: string | null;
      description: string | null;
      tranche_total: string;
    }>(
      `SELECT
         p.project_title, p.grant_size_usd, p.project_start_date,
         p.project_duration_months, p.geographic_scope, p.description,
         COALESCE(SUM(tc.amount), 0) AS tranche_total
         FROM reporting_platform.projects p
         LEFT JOIN reporting_platform.project_tranche_cells tc ON tc.project_id = p.id
        WHERE p.id = $1
        GROUP BY p.project_title, p.grant_size_usd, p.project_start_date,
                 p.project_duration_months, p.geographic_scope, p.description`,
      [projectId]
    );
    if (fundingRows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const proj = fundingRows[0];

    // Check required fields before validating the tranche total.
    const emptyFields: string[] = [];
    if (!proj.project_title?.trim()) emptyFields.push("Project name");
    if (!proj.grant_size_usd) emptyFields.push("Funding amount (USD)");
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

    // Validate tranche total against approved funding amount.
    // Tolerance: total must be within [grant_size_usd − $1, grant_size_usd].
    // Exceeding the approved amount is never accepted; being more than $1 short
    // is also rejected. A gap of up to $1.00 (e.g. from rounding) is allowed.
    const approved = parseFloat(proj.grant_size_usd!);
    const total = parseFloat(proj.tranche_total);
    const diff = approved - total; // positive = total is short; negative = total exceeds approved

    if (diff < 0 || diff > 1) {
      const fmt = (n: number) =>
        n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return NextResponse.json(
        {
          error: `Tranche total is ${fmt(Math.abs(diff))} ${diff < 0 ? "over" : "short of"} the approved amount.`,
        },
        { status: 422 }
      );
    }

    if (checkOnly) return NextResponse.json({ ok: true });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const updated = await client.query<{ id: number; status: string }>(
        `UPDATE reporting_platform.reports
            SET status = 'Under Review'
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
