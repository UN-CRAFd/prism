import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Links a project to its partner-org contacts (applicants + project contacts).
// The contact records themselves live in partner_contacts (org-scoped) and are
// created via /api/partner-contacts; this route only manages the link + its
// relationship / applicant attributes.
//
//   GET    ?project_id=X   → linked contacts for a project (joined w/ name…)
//   GET    ?contact_id=X   → linked projects for a contact (joined w/ title…)
//   GET                    → all links with project + contact context
//   POST   { project_id, contact_id, relationship?, is_applicant? }  → link
//   PATCH  { id, relationship?, is_applicant? }                      → update link
//   DELETE ?id=X                             → unlink

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  const contactId = req.nextUrl.searchParams.get("contact_id");
  try {
    if (projectId) {
      const rows = await query(
        `SELECT pc.id, pc.project_id, pc.contact_id, pc.relationship, pc.is_applicant, pc.sort_order,
                c.name, c.role, c.email
           FROM reporting_platform.project_contacts pc
           JOIN reporting_platform.partner_contacts c ON c.id = pc.contact_id
          WHERE pc.project_id = $1
          ORDER BY pc.sort_order ASC, pc.id ASC`,
        [projectId]
      );
      return NextResponse.json(rows);
    }

    if (contactId) {
      const rows = await query(
        `SELECT pc.id, pc.project_id, pc.contact_id, pc.relationship, pc.is_applicant, pc.sort_order,
                p.project_title, p.short_name AS project_short_name
           FROM reporting_platform.project_contacts pc
           JOIN reporting_platform.projects p ON p.id = pc.project_id
          WHERE pc.contact_id = $1
          ORDER BY p.project_title ASC, pc.id ASC`,
        [contactId]
      );
      return NextResponse.json(rows);
    }

    // Overview: every link with both project and contact context.
    const rows = await query(
      `SELECT pc.id, pc.project_id, pc.contact_id, pc.relationship, pc.is_applicant, pc.sort_order,
              p.project_title, p.short_name AS project_short_name,
              c.name, c.role, c.email
         FROM reporting_platform.project_contacts pc
         JOIN reporting_platform.projects p ON p.id = pc.project_id
         JOIN reporting_platform.partner_contacts c ON c.id = pc.contact_id
        ORDER BY pc.contact_id ASC, p.project_title ASC`
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/project-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id, contact_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!contact_id) return NextResponse.json({ error: "contact_id is required" }, { status: 400 });

  try {
    const maxRow = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM reporting_platform.project_contacts WHERE project_id = $1`,
      [project_id]
    );
    const sortOrder = (maxRow[0]?.max ?? 0) + 1;

    const rows = await query(
      `INSERT INTO reporting_platform.project_contacts
         (project_id, contact_id, relationship, is_applicant, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id, contact_id) DO NOTHING
       RETURNING id`,
      [
        project_id,
        contact_id,
        (body.relationship as string) || null,
        Boolean(body.is_applicant),
        sortOrder,
      ]
    );
    if (!rows.length) {
      return NextResponse.json({ error: "Contact is already linked to this project" }, { status: 409 });
    }
    // Return the joined shape (both project and contact context) so the client
    // can render it directly from either the project or the contact side.
    const created = await query(
      `SELECT pc.id, pc.project_id, pc.contact_id, pc.relationship, pc.is_applicant, pc.sort_order,
              p.project_title, p.short_name AS project_short_name,
              c.name, c.role, c.email
         FROM reporting_platform.project_contacts pc
         JOIN reporting_platform.projects p ON p.id = pc.project_id
         JOIN reporting_platform.partner_contacts c ON c.id = pc.contact_id
        WHERE pc.id = $1`,
      [rows[0].id]
    );
    return NextResponse.json(created[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/project-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: string[] = [];
  const values: unknown[] = [id];
  if ("relationship" in body) {
    values.push((body.relationship as string) || null);
    updates.push(`relationship = $${values.length}`);
  }
  if ("is_applicant" in body) {
    values.push(Boolean(body.is_applicant));
    updates.push(`is_applicant = $${values.length}`);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const rows = await query(
      `UPDATE reporting_platform.project_contacts
          SET ${updates.join(", ")}
        WHERE id = $1
      RETURNING id, project_id, contact_id, relationship, is_applicant, sort_order`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/project-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.project_contacts WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/project-contacts error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
