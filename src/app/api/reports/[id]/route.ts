import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport, forbidden } from "@/lib/authz";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import { logger } from "@/lib/logger";
import { logStatusChange } from "@/lib/version-log";

const ALLOWED_FIELDS = ["year", "report_submission_date", "authorized", "status"];

// GET /api/reports/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    const gate = await guardReport(session, id);
    if (gate) return gate;

    const rows = await query(
      `SELECT
         r.id, r.project_id, r.year, r.report_type, r.data_type,
         r.report_submission_date, r.authorized, r.status, r.created_at,
         p.project_title,
         p.short_name   AS project_short_name,
         pt.short_name  AS partner_short_name,
         pt.long_name   AS partner_long_name
       FROM reporting_platform.reports  r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       WHERE r.id = $1`,
      [id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("GET /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to fetch report" }, { status: 500 });
  }
}

// PUT /api/reports/[id] — update report fields
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    const gate = await guardReport(session, id);
    if (gate) return gate;

    const body = await request.json();

    // Partners cannot change status — only the submit endpoint may do that.
    if (body.status !== undefined && session.role !== "admin") {
      return forbidden();
    }

    await loadOptionOverrides(); // editable report statuses reflect admin overrides
    const validStatuses = new Set(optionValues("reportStatus"));

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (body[field] === undefined) continue;
      if (field === "status" && !validStatuses.has(body[field] as string)) {
        return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
      }
      setClauses.push(`${field} = $${idx++}`);
      values.push(body[field]);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Fetch current state before updating, so we can detect a status change and
    // record the log entry with the correct from_status and entity context.
    const current = await query<{ status: string; data_type: string; year: number; report_type: string; project_id: number }>(
      `SELECT status, data_type, year, report_type, project_id
         FROM reporting_platform.reports WHERE id = $1`,
      [id]
    );
    if (current.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    const { status: fromStatus, data_type, year, report_type, project_id } = current[0];

    const newStatus = body.status as string | undefined;
    const statusChanging = newStatus !== undefined && newStatus !== fromStatus;

    if (!statusChanging) {
      // No status transition — plain update, no transaction needed.
      values.push(id);
      const rows = await query(
        `UPDATE reporting_platform.reports SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (rows.length === 0) {
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }
      return NextResponse.json(rows[0]);
    }

    // Status is changing — run the update and log write in one transaction so a
    // failed log entry rolls back the status change rather than leaving it unrecorded.
    const entityType = data_type === "prodoc" ? "prodoc" : "report";
    const entityLabel = data_type === "prodoc"
      ? "Project Document"
      : report_type
        ? `${report_type.charAt(0).toUpperCase()}${report_type.slice(1)} Report ${year}`
        : `Annual Report ${year}`;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      values.push(id);
      const updateResult = await client.query(
        `UPDATE reporting_platform.reports SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
        values
      );
      if (updateResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json({ error: "Report not found" }, { status: 404 });
      }

      await logStatusChange(
        {
          entity_type: entityType,
          entity_id: Number(id),
          entity_label: entityLabel,
          project_id,
          from_status: fromStatus,
          to_status: newStatus,
          actor_role: session.role,
          actor_org: session.org ?? null,
          actor_name: (body.actor_name as string | undefined) ?? null,
          reason: (body.reason as string | undefined) ?? null,
        },
        client
      );

      await client.query("COMMIT");
      return NextResponse.json(updateResult.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("PUT /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

// DELETE /api/reports/[id] — delete a report (indicator_data cascade)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const { id } = await params;
    // A project always keeps exactly one project document, so prodocs can't be
    // deleted — only reporting-year rows can.
    const rows = await query<{ id: number }>(
      `DELETE FROM reporting_platform.reports
        WHERE id = $1 AND data_type <> 'prodoc' RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      const existing = await query<{ data_type: string }>(
        `SELECT data_type FROM reporting_platform.reports WHERE id = $1`,
        [id]
      );
      if (existing.length && existing[0].data_type === "prodoc") {
        return NextResponse.json(
          { error: "Project documents cannot be deleted; each project keeps exactly one." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
