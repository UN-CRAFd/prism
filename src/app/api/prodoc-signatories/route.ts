import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject, forbidden } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Standalone signatories for the Signatures tab. Not linked to partner_contacts.
// Both admins and partners may add and delete. Sorted by sort_order (auto-assigned
// as MAX + 1 on insert). PATCH supports field-level updates (for future inline
// editing). No signature flow — these rows appear in the printed prodoc with a
// blank signature line only.
//
//   GET    ?project_id=X                                        → rows for project
//   POST   { project_id, signee_name, title?, organization?, email? } → create
//   PATCH  { id, signee_name?, title?, organization?, email? }         → update
//   DELETE ?id=X                                                → delete

const RETURN_COLS = "id, project_id, title, signee_name, organization, email, sort_order, created_at";

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT ${RETURN_COLS}
         FROM reporting_platform.prodoc_signatories
        WHERE project_id = $1
        ORDER BY sort_order, id`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/prodoc-signatories error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, signee_name, title, organization, email } = body as Record<string, unknown>;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!signee_name || typeof signee_name !== "string" || !signee_name.trim()) {
    return NextResponse.json({ error: "signee_name is required" }, { status: 400 });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  try {
    const maxRow = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM reporting_platform.prodoc_signatories WHERE project_id = $1`,
      [project_id]
    );
    const sortOrder = (maxRow[0]?.max ?? 0) + 1;

    const rows = await query(
      `INSERT INTO reporting_platform.prodoc_signatories
         (project_id, title, signee_name, organization, email, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${RETURN_COLS}`,
      [
        project_id,
        (title as string | null | undefined) ?? null,
        signee_name.trim(),
        (organization as string | null | undefined) ?? null,
        (email as string | null | undefined) ?? null,
        sortOrder,
      ]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/prodoc-signatories error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, signee_name, title, organization, email } = body as Record<string, unknown>;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const existing = await query<{ project_id: number }>(
      `SELECT project_id FROM reporting_platform.prodoc_signatories WHERE id = $1`,
      [id]
    );
    if (existing.length === 0) {
      return session.role === "admin"
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : forbidden();
    }
    const gate = await guardProject(session, existing[0].project_id);
    if (gate) return gate;

    if (signee_name !== undefined && (typeof signee_name !== "string" || !signee_name.trim())) {
      return NextResponse.json({ error: "signee_name cannot be blank" }, { status: 400 });
    }

    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;
    if (title !== undefined)        { sets.push(`title = $${idx++}`);        values.push((title as string | null) ?? null); }
    if (signee_name !== undefined)  { sets.push(`signee_name = $${idx++}`);  values.push((signee_name as string).trim()); }
    if (organization !== undefined) { sets.push(`organization = $${idx++}`); values.push((organization as string | null) ?? null); }
    if (email !== undefined)        { sets.push(`email = $${idx++}`);        values.push((email as string | null) ?? null); }

    if (sets.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.prodoc_signatories
          SET ${sets.join(", ")}
        WHERE id = $${idx}
        RETURNING ${RETURN_COLS}`,
      values
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/prodoc-signatories error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const existing = await query<{ project_id: number }>(
      `SELECT project_id FROM reporting_platform.prodoc_signatories WHERE id = $1`,
      [id]
    );
    // Don't reveal existence to unauthorized callers.
    if (existing.length === 0) {
      return session.role === "admin"
        ? NextResponse.json({ error: "Not found" }, { status: 404 })
        : forbidden();
    }
    const gate = await guardProject(session, existing[0].project_id);
    if (gate) return gate;

    await query(`DELETE FROM reporting_platform.prodoc_signatories WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/prodoc-signatories error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
