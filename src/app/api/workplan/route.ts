import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { quarterFromDate } from "@/lib/workplan";

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

// Flat cross-report listing (admin "Full Data" view): one row per workplan entry
// (a report's progress on an activity) — i.e. one row per year-entry.
const SELECT_ALL = `
  SELECT e.id, e.report_id, e.activity_id,
         e.updated_quarters, e.status, e.comment,
         a.outcome, a.objective_num, a.objective_text,
         a.activity_num, a.activity_text, a.implementing_agent,
         a.planned_quarters, a.sort_order,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.workplan_entries e
    JOIN reporting_platform.workplan_activities a ON a.id = e.activity_id
    JOIN reporting_platform.reports  r  ON r.id  = e.report_id
    JOIN reporting_platform.projects p  ON p.id  = r.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
   WHERE r.data_type = 'report'
   ORDER BY r.year DESC, pt.short_name, p.project_title, a.sort_order ASC, a.id ASC`;

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) {
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      console.error("GET /api/workplan (all) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  try {
    // Resolve the project + current year + derive the quarter range from
    // start + duration.
    const projRows = await query<{
      project_id: number;
      year: number;
      start_date: string | null;
      end_date: string | null;
    }>(
      `SELECT p.id AS project_id, r.year,
              TO_CHAR(p.project_start_date, 'YYYY-MM-DD') AS start_date,
              TO_CHAR((p.project_start_date + (p.project_duration_months * INTERVAL '1 month'))::date, 'YYYY-MM-DD') AS end_date
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE r.id = $1`,
      [reportId]
    );
    if (!projRows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const { project_id, year: currentYear, start_date, end_date } = projRows[0];

    // Project structure + baseline (admin-owned; read-only to partners).
    const activities = await query<Record<string, unknown> & { id: number }>(
      `SELECT
         a.id,
         a.outcome,
         a.objective_num,
         a.objective_text,
         a.activity_num,
         a.activity_text,
         a.implementing_agent,
         a.planned_quarters,
         a.sort_order
       FROM reporting_platform.workplan_activities a
      WHERE a.project_id = $1
      ORDER BY a.sort_order ASC, a.id ASC`,
      [project_id]
    );

    // Every reporting year for this project — drives one progress line per report.
    const yearRows = await query<{ year: number }>(
      `SELECT DISTINCT year FROM reporting_platform.reports
        WHERE project_id = $1 AND data_type = 'report' ORDER BY year ASC`,
      [project_id]
    );
    const years = yearRows.map((y) => y.year);

    // Every report's progress entry across the project, pivoted per activity/year.
    const entryRows = await query<{
      activity_id: number;
      year: number;
      updated_quarters: string[] | null;
      status: string | null;
      comment: string | null;
    }>(
      `SELECT e.activity_id, r.year, e.updated_quarters, e.status, e.comment
         FROM reporting_platform.workplan_entries e
         JOIN reporting_platform.reports r ON r.id = e.report_id
        WHERE r.project_id = $1 AND r.data_type = 'report'`,
      [project_id]
    );

    const byActivity = new Map<number, Record<number, unknown>>();
    for (const e of entryRows) {
      let m = byActivity.get(e.activity_id);
      if (!m) { m = {}; byActivity.set(e.activity_id, m); }
      m[e.year] = { updated_quarters: e.updated_quarters ?? [], status: e.status, comment: e.comment };
    }

    return NextResponse.json({
      range: { start: quarterFromDate(start_date), end: quarterFromDate(end_date) },
      currentYear,
      years,
      activities: activities.map((a) => ({ ...a, byYear: byActivity.get(a.id) ?? {} })),
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
