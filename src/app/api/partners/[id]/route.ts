import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { organization_name, organization_website, password, mail_account } = body;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (organization_name !== undefined) {
      setClauses.push(`organization_name = $${idx++}`);
      values.push(organization_name);
    }
    if (organization_website !== undefined) {
      setClauses.push(`organization_website = $${idx++}`);
      values.push(organization_website);
    }
    if (password !== undefined && password !== "") {
      setClauses.push(`password_hash = $${idx++}`);
      values.push(password);
    }
    if (mail_account !== undefined) {
      setClauses.push(`mail_account = $${idx++}`);
      values.push(mail_account);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.partners SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/partners/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const projects = await query(
      `SELECT id FROM reporting_platform.projects WHERE partner_id = $1 LIMIT 1`,
      [id]
    );
    if (projects.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete partner with existing projects. Remove projects first." },
        { status: 409 }
      );
    }

    await query(`DELETE FROM reporting_platform.implementing_partners WHERE partner_id = $1`, [id]);
    const rows = await query(`DELETE FROM reporting_platform.partners WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/partners/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
