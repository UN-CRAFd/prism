import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// ── Per-report workplan progress (partner-owned) ─────────────────────────────
//
// GET   ?reportId=  → { range: {start,end}, activities: [{...activity, entry}] }
//                     where `entry` is this report's progress row (or null).
// PATCH { reportId, activityId, updated_quarters, status, comment }
//                   → upsert the entry for (reportId, activityId).

function toQuartersOrNull(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return null;
}

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  try {
    // Resolve the project + quarter range for this report.
    const projRows = await query<{
      project_id: number;
      workplan_quarter_start: string | null;
      workplan_quarter_end: string | null;
    }>(
      `SELECT p.id AS project_id, p.workplan_quarter_start, p.workplan_quarter_end
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE r.id = $1`,
      [reportId]
    );
    if (!projRows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const { project_id, workplan_quarter_start, workplan_quarter_end } = projRows[0];

    // Activities for the project, LEFT JOINed to this report's entry.
    const activities = await query(
      `SELECT
         a.id,
         a.intermediate,
         a.objective_num,
         a.objective_text,
         a.activity_num,
         a.activity_text,
         a.implementing_agent,
         a.planned_quarters,
         a.sort_order,
         e.id               AS entry_id,
         e.updated_quarters,
         e.status,
         e.comment
       FROM reporting_platform.workplan_activities a
       LEFT JOIN reporting_platform.workplan_entries e
         ON e.activity_id = a.id AND e.report_id = $2
      WHERE a.project_id = $1
      ORDER BY a.sort_order ASC, a.id ASC`,
      [project_id, reportId]
    );

    return NextResponse.json({
      range: { start: workplan_quarter_start, end: workplan_quarter_end },
      activities,
    });
  } catch (err) {
    console.error("GET /api/workplan error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, activityId } = body;
  if (!reportId || !activityId) {
    return NextResponse.json({ error: "reportId and activityId required" }, { status: 400 });
  }

  const updatedQuarters = toQuartersOrNull(body.updated_quarters);
  const status = (body.status as string) || null;
  const comment = (body.comment as string) || null;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.workplan_entries
         (report_id, activity_id, updated_quarters, status, comment)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       ON CONFLICT (report_id, activity_id) DO UPDATE
         SET updated_quarters = EXCLUDED.updated_quarters,
             status           = EXCLUDED.status,
             comment          = EXCLUDED.comment,
             updated_at       = NOW()
       RETURNING *`,
      [
        reportId,
        activityId,
        updatedQuarters === null ? null : JSON.stringify(updatedQuarters),
        status,
        comment,
      ]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/workplan error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
