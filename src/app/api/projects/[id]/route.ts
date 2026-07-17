import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const ALLOWED_FIELDS = [
  "partner_id", "project_title", "short_name",
  "mptfo_project_number", "grant_size_usd", "project_start_date", "project_duration_months", "geographic_scope",
  "implementing_partners",
];

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
  try {
    const { id } = await params;

    const reports = await query(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 LIMIT 1`,
      [id]
    );
    if (reports.length > 0) {
      return NextResponse.json(
        { error: "Cannot delete project with existing reports. Remove reports first." },
        { status: 409 }
      );
    }

    const rows = await query(`DELETE FROM reporting_platform.projects WHERE id = $1 RETURNING id`, [id]);
    if (rows.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    console.error("DELETE /api/projects/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
