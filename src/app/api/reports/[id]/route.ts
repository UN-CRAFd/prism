import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const ALLOWED_FIELDS = ["year", "report_submission_date", "authorized"];

// PUT /api/reports/[id] — update report fields
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
      `UPDATE reporting_platform.reports SET ${setClauses.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to update report" }, { status: 500 });
  }
}

// DELETE /api/reports/[id] — delete a report (indicator_sections cascade)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const rows = await query(
      `DELETE FROM reporting_platform.reports WHERE id = $1 RETURNING id`,
      [id]
    );
    if (rows.length === 0) {
      return NextResponse.json({ error: "Report not found" }, { status: 404 });
    }
    return NextResponse.json({ deleted: id });
  } catch (err) {
    console.error("DELETE /api/reports/[id] error:", err);
    return NextResponse.json({ error: "Failed to delete report" }, { status: 500 });
  }
}
