import { NextResponse } from "next/server";
import { query } from "@/lib/db";

const ALLOWED_FIELDS = [
  "name",
  "description",
  "means_of_verification",
  "category",
  "cycle",
] as const;

// PUT /api/indicators/[id] — partial update of a library indicator.
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
      if (!(field in body)) continue;
      const val = body[field];
      setClauses.push(`${field} = $${idx++}`);
      values.push(field === "name" ? String(val).trim() : val || null);
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    values.push(id);
    const rows = await query(
      `UPDATE reporting_platform.indicators SET ${setClauses.join(", ")}
        WHERE id = $${idx}
        RETURNING id, name, description, means_of_verification, category, cycle,
                  is_standard, project_id, archived_at, created_at, updated_at`,
      values
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    }
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PUT /api/indicators/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/indicators/[id]
//   ?restore=1 → un-archive.
//   otherwise  → if any report data still references it, soft-delete (archive) so
//                historical lines survive (FK is ON DELETE RESTRICT); if it is
//                used nowhere, remove the row entirely.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const restore = new URL(request.url).searchParams.get("restore") === "1";

    if (restore) {
      const rows = await query(
        `UPDATE reporting_platform.indicators SET archived_at = NULL
          WHERE id = $1 RETURNING id, archived_at`,
        [id]
      );
      if (rows.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
      return NextResponse.json({ ok: true, archived_at: rows[0].archived_at });
    }

    const usage = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.indicator_data WHERE indicator_id = $1`,
      [id]
    );

    // Not used anywhere → delete outright (no FK to block it).
    if (Number(usage[0]?.count ?? 0) === 0) {
      const del = await query(
        `DELETE FROM reporting_platform.indicators WHERE id = $1 RETURNING id`,
        [id]
      );
      if (del.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // Still referenced → archive.
    const rows = await query(
      `UPDATE reporting_platform.indicators SET archived_at = NOW()
        WHERE id = $1 RETURNING id, archived_at`,
      [id]
    );
    if (rows.length === 0) return NextResponse.json({ error: "Indicator not found" }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: false, archived_at: rows[0].archived_at });
  } catch (err) {
    console.error("DELETE /api/indicators/[id] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
