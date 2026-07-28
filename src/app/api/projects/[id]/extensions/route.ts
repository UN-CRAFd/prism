import { NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, guardProject } from "@/lib/authz";

// List the no-cost extensions granted on a project, newest first.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    const gate = await guardProject(session, id);
    if (gate) return gate;

    const rows = await query(
      `SELECT id, project_id, months_added, previous_duration_months,
              new_duration_months, note, created_at
         FROM reporting_platform.project_extensions
        WHERE project_id = $1
        ORDER BY created_at DESC, id DESC`,
      [id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/projects/[id]/extensions error:", err);
    return NextResponse.json({ error: "Failed to load extensions" }, { status: 500 });
  }
}

// Grant a no-cost extension: record it and lengthen the project period in one
// transaction. projects.project_duration_months is the source of truth, so
// budgets / workplan / Gantt recompute from the new total on next load.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const monthsAdded = Number(body.months_added);
  if (!Number.isInteger(monthsAdded) || monthsAdded <= 0) {
    return NextResponse.json({ error: "months_added must be a positive integer" }, { status: 400 });
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the project row so the read-modify-write of the duration is atomic.
    const cur = await client.query(
      `SELECT project_duration_months FROM reporting_platform.projects WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const prev: number | null = cur.rows[0].project_duration_months;
    if (prev == null) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Project has no duration to extend" }, { status: 400 });
    }
    const next = prev + monthsAdded;

    const inserted = await client.query(
      `INSERT INTO reporting_platform.project_extensions
         (project_id, months_added, previous_duration_months, new_duration_months, note)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, project_id, months_added, previous_duration_months, new_duration_months, note, created_at`,
      [id, monthsAdded, prev, next, note]
    );

    const updated = await client.query(
      `UPDATE reporting_platform.projects SET project_duration_months = $1 WHERE id = $2 RETURNING *`,
      [next, id]
    );

    await client.query("COMMIT");
    return NextResponse.json({ project: updated.rows[0], extension: inserted.rows[0] }, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/projects/[id]/extensions error:", err);
    return NextResponse.json({ error: "Failed to extend project" }, { status: 500 });
  } finally {
    client.release();
  }
}
