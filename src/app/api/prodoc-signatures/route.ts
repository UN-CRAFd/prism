import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardProject } from "@/lib/authz";

// Project-document sign-off. Two parties sign a prodoc:
//   * 'contact'     — a project contact (linked via project_contacts). Signed by
//                     the partner that owns the project (or an admin).
//   * 'secretariat' — the CRAF'd Secretariat. Signed by an admin only.
// Click-to-sign: POST stamps signed_at/signed_by, DELETE removes the stamp.
//
//   GET    ?project_id=X                          → all signature rows
//   POST   { project_id, party, contact_id? }     → sign
//   DELETE ?id=X                                   → un-sign

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT id, project_id, party, contact_id, signed_by, signed_at
         FROM reporting_platform.prodoc_signatures
        WHERE project_id = $1`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/prodoc-signatures error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id;
  const party = body.party;
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (party !== "contact" && party !== "secretariat") {
    return NextResponse.json({ error: "party must be 'contact' or 'secretariat'" }, { status: 400 });
  }

  // Secretariat sign-off is admin-only; contact sign-off requires owning the
  // project (admins pass either check).
  const session =
    party === "secretariat" ? await requireAdmin() : await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId as string | number);
  if (gate) return gate;

  const contactId = party === "contact" ? Number(body.contact_id) : null;
  if (party === "contact") {
    if (!Number.isInteger(contactId) || contactId! <= 0) {
      return NextResponse.json({ error: "contact_id is required for a contact signature" }, { status: 400 });
    }
    // The contact must actually be linked to this project.
    const linked = await query(
      `SELECT 1 FROM reporting_platform.project_contacts
        WHERE project_id = $1 AND contact_id = $2 LIMIT 1`,
      [projectId, contactId]
    );
    if (linked.length === 0) {
      return NextResponse.json({ error: "Contact is not linked to this project" }, { status: 400 });
    }
  }

  try {
    // Idempotent: a double-click on an already-signed row returns the existing one.
    const inserted = await query(
      `INSERT INTO reporting_platform.prodoc_signatures
         (project_id, party, contact_id, signed_by)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, project_id, party, contact_id, signed_by, signed_at`,
      [projectId, party, contactId, session.name]
    );
    if (inserted.length > 0) return NextResponse.json(inserted[0], { status: 201 });

    const existing = await query(
      party === "contact"
        ? `SELECT id, project_id, party, contact_id, signed_by, signed_at
             FROM reporting_platform.prodoc_signatures
            WHERE project_id = $1 AND party = 'contact' AND contact_id = $2`
        : `SELECT id, project_id, party, contact_id, signed_by, signed_at
             FROM reporting_platform.prodoc_signatures
            WHERE project_id = $1 AND party = 'secretariat'`,
      party === "contact" ? [projectId, contactId] : [projectId]
    );
    return NextResponse.json(existing[0] ?? null);
  } catch (err) {
    console.error("POST /api/prodoc-signatures error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    const rows = await query<{ project_id: number; party: string }>(
      `SELECT project_id, party FROM reporting_platform.prodoc_signatures WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const { project_id, party } = rows[0];

    // Only an admin may remove a Secretariat signature; contact signatures require
    // owning the project.
    if (party === "secretariat" && session.role !== "admin") {
      return NextResponse.json({ error: "You don't have access to this resource" }, { status: 403 });
    }
    const gate = await guardProject(session, project_id);
    if (gate) return gate;

    await query(`DELETE FROM reporting_platform.prodoc_signatures WHERE id = $1`, [id]);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("DELETE /api/prodoc-signatures error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
