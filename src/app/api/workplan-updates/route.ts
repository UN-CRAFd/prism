import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, guardProject } from "@/lib/authz";
import { WORKPLAN_UPDATE_TYPE_CODES } from "@/lib/workplan";
import { logger } from "@/lib/logger";

// ── Workplan update windows (admin-owned) ────────────────────────────────────
//
// Windows are project-level, labelled [YEAR] + [TR/NCE/BR/AR/FR]. Exactly one
// window per project may be `is_active` (the only one partners may edit); windows
// may be `hidden` from partners. Progress rows (workplan_entries) attach here.
//
// GET    ?project_id=  → windows for the project (partners: non-hidden only)
// POST   { project_id, year, type_code }              (admin)
// PATCH  { id, is_active? | hidden? | sort_order? }   (admin)
// DELETE ?id=                                          (admin)

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  const isAdmin = session.role === "admin";
  try {
    const rows = await query(
      `SELECT id, project_id, year, type_code, sort_order, is_active, hidden
         FROM reporting_platform.workplan_updates
        WHERE project_id = $1 ${isAdmin ? "" : "AND hidden = FALSE"}
        ORDER BY sort_order, year, id`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/workplan-updates error:", err);
    return NextResponse.json({ error: "Failed to load update windows" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = Number(body.project_id);
  const year = Number(body.year);
  const typeCode = typeof body.type_code === "string" ? body.type_code : "";
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  }
  if (!Number.isInteger(year)) {
    return NextResponse.json({ error: "year must be an integer" }, { status: 400 });
  }
  if (!WORKPLAN_UPDATE_TYPE_CODES.includes(typeCode)) {
    return NextResponse.json({ error: "invalid type_code" }, { status: 400 });
  }

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.workplan_updates (project_id, year, type_code, sort_order)
       VALUES ($1, $2, $3, COALESCE(
         (SELECT MAX(sort_order) + 1 FROM reporting_platform.workplan_updates WHERE project_id = $1), 1))
       RETURNING id, project_id, year, type_code, sort_order, is_active, hidden`,
      [projectId, year, typeCode]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/workplan-updates error:", err);
    return NextResponse.json({ error: "Failed to add update window" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Activating a window is exclusive per project (the partial unique index would
  // otherwise reject a second active row) — clear siblings in one transaction.
  if (body.is_active === true) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `UPDATE reporting_platform.workplan_updates
            SET is_active = FALSE
          WHERE project_id = (SELECT project_id FROM reporting_platform.workplan_updates WHERE id = $1)
            AND id <> $1`,
        [id]
      );
      const res = await client.query(
        `UPDATE reporting_platform.workplan_updates
            SET is_active = TRUE
          WHERE id = $1
          RETURNING id, project_id, year, type_code, sort_order, is_active, hidden`,
        [id]
      );
      await client.query("COMMIT");
      if (res.rows.length === 0) return NextResponse.json({ error: "Window not found" }, { status: 404 });
      return NextResponse.json(res.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      logger.error("PATCH /api/workplan-updates (activate) error:", err);
      return NextResponse.json({ error: "Failed to update window" }, { status: 500 });
    } finally {
      client.release();
    }
  }

  // Non-activating patches: is_active:false, hidden, sort_order.
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (body.is_active === false) sets.push(`is_active = FALSE`);
  if (typeof body.hidden === "boolean") { params.push(body.hidden); sets.push(`hidden = $${params.length}`); }
  if (body.sort_order !== undefined && Number.isInteger(Number(body.sort_order))) {
    params.push(Number(body.sort_order));
    sets.push(`sort_order = $${params.length}`);
  }
  if (sets.length === 0) return NextResponse.json({ error: "No updatable fields" }, { status: 400 });

  try {
    const rows = await query(
      `UPDATE reporting_platform.workplan_updates
          SET ${sets.join(", ")}
        WHERE id = $1
        RETURNING id, project_id, year, type_code, sort_order, is_active, hidden`,
      params
    );
    if (rows.length === 0) return NextResponse.json({ error: "Window not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/workplan-updates error:", err);
    return NextResponse.json({ error: "Failed to update window" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  try {
    await query(`DELETE FROM reporting_platform.workplan_updates WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/workplan-updates error:", err);
    return NextResponse.json({ error: "Failed to delete update window" }, { status: 500 });
  }
}
