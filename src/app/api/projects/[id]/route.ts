import { NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      partner_id,
      project_title,
      mptfo_project_number,
      grant_size_usd,
      project_duration,
      geographic_scope,
    } = body;

    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (partner_id !== undefined) {
      setClauses.push(`partner_id = $${idx++}`);
      values.push(partner_id);
    }
    if (project_title !== undefined) {
      setClauses.push(`project_title = $${idx++}`);
      values.push(project_title);
    }
    if (mptfo_project_number !== undefined) {
      setClauses.push(`mptfo_project_number = $${idx++}`);
      values.push(mptfo_project_number);
    }
    if (grant_size_usd !== undefined) {
      setClauses.push(`grant_size_usd = $${idx++}`);
      values.push(grant_size_usd);
    }
    if (project_duration !== undefined) {
      setClauses.push(`project_duration = $${idx++}`);
      values.push(project_duration);
    }
    if (geographic_scope !== undefined) {
      setClauses.push(`geographic_scope = $${idx++}`);
      values.push(geographic_scope);
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

    await query(`DELETE FROM reporting_platform.implementing_partners WHERE project_id = $1`, [id]);
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
