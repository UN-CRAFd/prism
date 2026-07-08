import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// ── Master workplan structure (project-level, admin-owned) ───────────────────
//
// GET    ?projectId=  → { range: {start,end}, activities: [...] }
// POST   { projectId, ...activityFields }        → create activity
// PATCH  { id, ...activityFields }               → update one activity
// PATCH  { projectId, workplan_quarter_start, workplan_quarter_end } → set range
// DELETE ?id=         → delete activity

const ACTIVITY_FIELDS = [
  "intermediate",
  "objective_num",
  "objective_text",
  "activity_num",
  "activity_text",
  "implementing_agent",
  "planned_quarters",
] as const;

function toQuarters(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

async function loadRange(projectId: string | number) {
  const rows = await query<{ workplan_quarter_start: string | null; workplan_quarter_end: string | null }>(
    `SELECT workplan_quarter_start, workplan_quarter_end
       FROM reporting_platform.projects WHERE id = $1`,
    [projectId]
  );
  return {
    start: rows[0]?.workplan_quarter_start ?? null,
    end: rows[0]?.workplan_quarter_end ?? null,
  };
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  try {
    const activities = await query(
      `SELECT * FROM reporting_platform.workplan_activities
        WHERE project_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [projectId]
    );
    const range = await loadRange(projectId);
    return NextResponse.json({ range, activities });
  } catch (err) {
    console.error("GET /api/workplan-activities error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  try {
    let sortOrder: number;
    if (typeof body.sort_order === "number") {
      sortOrder = body.sort_order;
    } else {
      const maxRow = await query<{ max: number | null }>(
        `SELECT MAX(sort_order) AS max FROM reporting_platform.workplan_activities WHERE project_id = $1`,
        [projectId]
      );
      sortOrder = (maxRow[0]?.max ?? 0) + 1;
    }

    const rows = await query(
      `INSERT INTO reporting_platform.workplan_activities
         (project_id, intermediate, objective_num, objective_text,
          activity_num, activity_text, implementing_agent, planned_quarters, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       RETURNING *`,
      [
        projectId,
        (body.intermediate as string) || null,
        (body.objective_num as string) || null,
        (body.objective_text as string) || null,
        (body.activity_num as string) || null,
        (body.activity_text as string) || null,
        (body.implementing_agent as string) || null,
        JSON.stringify(toQuarters(body.planned_quarters)),
        sortOrder,
      ]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/workplan-activities error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Branch 1: set the project-level quarter range.
  if (!body.id && body.projectId) {
    try {
      const rows = await query(
        `UPDATE reporting_platform.projects
            SET workplan_quarter_start = $2, workplan_quarter_end = $3
          WHERE id = $1
        RETURNING workplan_quarter_start, workplan_quarter_end`,
        [
          body.projectId,
          (body.workplan_quarter_start as string) || null,
          (body.workplan_quarter_end as string) || null,
        ]
      );
      return NextResponse.json(rows[0] ?? {});
    } catch (err) {
      console.error("PATCH /api/workplan-activities (range) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  // Branch 2: update one activity.
  const { id } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const updates: string[] = [];
  const values: unknown[] = [id];
  for (const field of ACTIVITY_FIELDS) {
    if (!(field in body)) continue;
    if (field === "planned_quarters") {
      values.push(JSON.stringify(toQuarters(body[field])));
      updates.push(`planned_quarters = $${values.length}::jsonb`);
    } else {
      values.push((body[field] as string) || null);
      updates.push(`${field} = $${values.length}`);
    }
  }
  if (typeof body.sort_order === "number") {
    values.push(body.sort_order);
    updates.push(`sort_order = $${values.length}`);
  }
  if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  try {
    const rows = await query(
      `UPDATE reporting_platform.workplan_activities
          SET ${updates.join(", ")}
        WHERE id = $1
      RETURNING *`,
      values
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/workplan-activities error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.workplan_activities WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/workplan-activities error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
