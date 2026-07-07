import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword } from "@/lib/password";

const ALLOWED_FIELDS: Record<string, string> = {
  short_name: "short_name",
  long_name: "long_name",
  organization_website: "organization_website",
  mail_account: "mail_account",
  password: "password_hash",
};

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

    for (const [bodyKey, dbCol] of Object.entries(ALLOWED_FIELDS)) {
      const val = body[bodyKey];
      if (val === undefined) continue;
      if (bodyKey === "password" && val === "") continue;
      setClauses.push(`${dbCol} = $${idx++}`);
      values.push(bodyKey === "password" ? hashPassword(val) : val);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.partners SET ${setClauses.join(", ")}
       WHERE id = $${idx}
       RETURNING id, short_name, long_name, organization_website, mail_account, created_at, updated_at`,
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
