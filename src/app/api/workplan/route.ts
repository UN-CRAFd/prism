import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { quarterFromDate } from "@/lib/workplan";
import { requireSession, requireAdmin, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";

// ── Workplan progress, keyed by admin-managed update windows ─────────────────
//
// Progress rows attach to workplan_updates (project-level, [YEAR]+[code]) via
// update_id, not to reports. report_id on an entry is write provenance only.
//
// GET   ?reportId=  → { range, updates:[…], activeUpdateId, activities:[{…,byUpdate}] }
//                     Partners see non-hidden windows only.
// PATCH { reportId, updateId, activityId, updated_quarters, status, comment }
//                   → upsert the entry for (updateId, activityId), gated so
//                     partners may only write the active, visible window while
//                     their report is Open.

function toQuartersOrNull(v: unknown): string[] | null {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return null;
}

// Flat cross-project listing (admin "Full Data" view): one row per workplan entry
// (an activity's progress within an update window).
const SELECT_ALL = `
  SELECT e.id, e.report_id, e.activity_id,
         e.updated_quarters, e.status, e.comment,
         a.outcome, a.objective_num, a.objective_text,
         a.activity_num, a.activity_text, a.implementing_agent,
         a.planned_quarters, a.sort_order,
         wu.year, wu.type_code,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.workplan_entries e
    JOIN reporting_platform.workplan_activities a ON a.id = e.activity_id
    JOIN reporting_platform.workplan_updates  wu ON wu.id = e.update_id
    JOIN reporting_platform.projects p  ON p.id  = wu.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
   ORDER BY wu.year DESC, pt.short_name, p.project_title, wu.sort_order, a.sort_order ASC, a.id ASC`;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) {
    // Cross-report "Full Data" listing is admin-only.
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      logger.error("GET /api/workplan (all) error:", err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

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
              TO_CHAR(reporting_platform.project_end_date(p.project_start_date, p.project_duration_months), 'YYYY-MM-DD') AS end_date
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p ON p.id = r.project_id
        WHERE r.id = $1`,
      [reportId]
    );
    if (!projRows.length) return NextResponse.json({ error: "Report not found" }, { status: 404 });

    const { project_id, start_date, end_date } = projRows[0];
    const isAdmin = session.role === "admin";

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

    // Admin-managed update windows — one progress line per window. Partners only
    // see non-hidden windows.
    const updates = await query<{
      id: number;
      year: number;
      type_code: string;
      sort_order: number;
      is_active: boolean;
      hidden: boolean;
    }>(
      `SELECT id, year, type_code, sort_order, is_active, hidden
         FROM reporting_platform.workplan_updates
        WHERE project_id = $1 ${isAdmin ? "" : "AND hidden = FALSE"}
        ORDER BY sort_order, year, id`,
      [project_id]
    );
    // The active window is only exposed if it's visible to this caller.
    const activeUpdateId = updates.find((u) => u.is_active)?.id ?? null;

    // Every window's progress entry, pivoted per activity/window.
    const entryRows = await query<{
      activity_id: number;
      update_id: number;
      updated_quarters: string[] | null;
      status: string | null;
      comment: string | null;
    }>(
      `SELECT e.activity_id, e.update_id, e.updated_quarters, e.status, e.comment
         FROM reporting_platform.workplan_entries e
         JOIN reporting_platform.workplan_updates wu ON wu.id = e.update_id
        WHERE wu.project_id = $1`,
      [project_id]
    );

    const byActivity = new Map<number, Record<number, unknown>>();
    for (const e of entryRows) {
      let m = byActivity.get(e.activity_id);
      if (!m) { m = {}; byActivity.set(e.activity_id, m); }
      m[e.update_id] = { updated_quarters: e.updated_quarters ?? [], status: e.status, comment: e.comment };
    }

    return NextResponse.json({
      range: { start: quarterFromDate(start_date), end: quarterFromDate(end_date) },
      updates,
      activeUpdateId,
      activities: activities.map((a) => ({ ...a, byUpdate: byActivity.get(a.id) ?? {} })),
    });
  } catch (err) {
    logger.error("GET /api/workplan error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, updateId, activityId } = body;
  if (!reportId || !updateId || !activityId) {
    return NextResponse.json({ error: "reportId, updateId and activityId required" }, { status: 400 });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId as string | number);
  if (gate) return gate;

  const updatedQuarters = toQuartersOrNull(body.updated_quarters);
  const status = (body.status as string) || null;
  const comment = (body.comment as string) || null;

  try {
    // Validate the window against the report and enforce the edit gate. Partners
    // may only write the active, visible window of the report's own project while
    // that report is Open; admins bypass all four conditions.
    const ctx = await query<{
      window_project: number;
      is_active: boolean;
      hidden: boolean;
      report_status: string;
      report_project: number;
    }>(
      `SELECT wu.project_id AS window_project, wu.is_active, wu.hidden,
              r.status AS report_status, r.project_id AS report_project
         FROM reporting_platform.workplan_updates wu
         CROSS JOIN reporting_platform.reports r
        WHERE wu.id = $1 AND r.id = $2`,
      [updateId, reportId]
    );
    if (!ctx.length) return NextResponse.json({ error: "Window or report not found" }, { status: 404 });
    const c = ctx[0];

    if (session.role !== "admin") {
      const allowed =
        c.is_active && !c.hidden && c.report_status === "Open" &&
        c.window_project === c.report_project;
      if (!allowed) {
        return NextResponse.json({ error: "This update window is not editable" }, { status: 403 });
      }
    }

    const rows = await query(
      `INSERT INTO reporting_platform.workplan_entries
         (update_id, report_id, activity_id, updated_quarters, status, comment)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (update_id, activity_id) DO UPDATE
         SET updated_quarters = EXCLUDED.updated_quarters,
             status           = EXCLUDED.status,
             comment          = EXCLUDED.comment,
             report_id        = EXCLUDED.report_id,
             updated_at       = NOW()
       RETURNING *`,
      [
        updateId,
        reportId,
        activityId,
        updatedQuarters === null ? null : JSON.stringify(updatedQuarters),
        status,
        comment,
      ]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/workplan error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
