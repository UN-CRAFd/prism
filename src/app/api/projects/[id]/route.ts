import { NextResponse } from "next/server";
import pool, { query } from "@/lib/db";

const ALLOWED_FIELDS = [
  "partner_id", "project_title", "short_name", "description", "status",
  "mptfo_project_number", "grant_size_usd", "project_start_date", "project_duration_months", "geographic_scope",
  "implementing_partners", "project_lead",
];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await query(
      `SELECT p.*, pr.short_name AS partner_short_name, pr.long_name AS partner_long_name
         FROM reporting_platform.projects p
         JOIN reporting_platform.partners pr ON pr.id = p.partner_id
        WHERE p.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("GET /api/projects/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    for (const field of ALLOWED_FIELDS) {
      if (body[field] === undefined) continue;
      setClauses.push(`${field} = $${idx++}`);
      values.push(body[field]);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.projects SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/projects/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // The prodoc (data_type='prodoc') is an inseparable part of the project and is
  // deleted with it. Real reporting-year rows (data_type='report') still block —
  // those carry submitted data and must be removed deliberately first.
  const client = await pool.connect();
  try {
    const realReports = await client.query(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 AND data_type = 'report' LIMIT 1`,
      [id]
    );
    if (realReports.rows.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete project with existing reports. Remove reports first." },
        { status: 409 }
      );
    }

    await client.query("BEGIN");
    // Drop the prodoc first (reports.project_id is ON DELETE RESTRICT); its
    // section data cascades via report_id. Project-level children cascade with
    // the project itself.
    await client.query(
      `DELETE FROM reporting_platform.reports WHERE project_id = $1 AND data_type = 'prodoc'`,
      [id]
    );
    const deleted = await client.query(
      `DELETE FROM reporting_platform.projects WHERE id = $1 RETURNING id`,
      [id]
    );
    if (deleted.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    await client.query("COMMIT");
    return NextResponse.json({ deleted: true });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("DELETE /api/projects/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}
