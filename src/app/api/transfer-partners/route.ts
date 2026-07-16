import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Master "transfer partner" records — the receiving organisation (name, website,
// type), project-scoped. Created on the fly while a partner edits a report, and
// edited in place (the identity columns are the same across every year).
//
//   POST   { project_id, organization_name, website, partner_type }
//   PATCH  { id, organization_name?, website?, partner_type? }
//   DELETE ?id=X   (cascades to transfer_data)

const ALLOWED = ["organization_name", "website", "partner_type"] as const;

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  try {
    const maxRow = await query<{ max: number | null }>(
      `SELECT MAX(sort_order) AS max FROM reporting_platform.transfer_partners WHERE project_id = $1`,
      [project_id]
    );
    const sortOrder = (maxRow[0]?.max ?? 0) + 1;

    const rows = await query(
      `INSERT INTO reporting_platform.transfer_partners
         (project_id, organization_name, website, partner_type, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        project_id,
        (body.organization_name as string) || null,
        (body.website as string) || null,
        (body.partner_type as string) || null,
        sortOrder,
      ]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/transfer-partners error:", err);
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
  for (const field of ALLOWED) {
    if (!(field in body)) continue;
    values.push((body[field] as string) || null);
    updates.push(`${field} = $${values.length}`);
  }
  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    const rows = await query(
      `UPDATE reporting_platform.transfer_partners
          SET ${updates.join(", ")}
        WHERE id = $1
      RETURNING *`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/transfer-partners error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.transfer_partners WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transfer-partners error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
