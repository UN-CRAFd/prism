import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import { logStatusChange } from "@/lib/version-log";

// Automatic project status. For every project whose status_manual is false:
//
//   ProDoc workflow is not "Approved"                          → Idea
//   else the Final Report (report_type 'final', not a project
//        update) has status Closed                             → Operationally Closed
//   else the end date has passed (start + duration < today)    → Project Closed
//   else                                                       → Ongoing
//
// The ProDoc workflow status is the status of the project's reports row with
// data_type = 'prodoc' — the same source as the Projects page's "Workflow" column.
// A project is only updated when the computed value differs from its current one AND
// that value exists in the (admin-editable) projectStatus options. Each change is
// written to the version log with actor "Automatic".
//
// Pass `client` to run inside the caller's transaction (errors are rethrown so the
// caller rolls back); without it the statement runs on its own and failures are
// logged, never thrown. Pass `projectId` to refresh one project, else all of them.

const AUTO_ACTOR = "Automatic";
const AUTO_REASON = "Set automatically from workflow and dates";

const REFRESH_SQL = `
  WITH calc AS (
    SELECT pr.id, pr.project_title, pr.status AS old_status,
           CASE
             WHEN COALESCE((SELECT r.status FROM reporting_platform.reports r
                             WHERE r.project_id = pr.id AND r.data_type = 'prodoc' LIMIT 1), '') <> 'Approved'
               THEN 'Idea'
             WHEN EXISTS (SELECT 1 FROM reporting_platform.reports r
                           WHERE r.project_id = pr.id AND r.report_type = 'final'
                             AND r.data_type <> 'update' AND r.status = 'Closed')
               THEN 'Operationally Closed'
             WHEN pr.project_start_date IS NOT NULL AND pr.project_duration_months IS NOT NULL
                  AND (pr.project_start_date + make_interval(months => pr.project_duration_months))::date < CURRENT_DATE
               THEN 'Project Closed'
             ELSE 'Ongoing'
           END AS new_status
      FROM reporting_platform.projects pr
     WHERE pr.status_manual = false
       AND ($2::int IS NULL OR pr.id = $2::int)
  )
  UPDATE reporting_platform.projects p
     SET status = c.new_status
    FROM calc c
   WHERE p.id = c.id
     AND p.status IS DISTINCT FROM c.new_status
     AND c.new_status = ANY($1::text[])
  RETURNING p.id, c.project_title, c.old_status, c.new_status`;

type Changed = { id: number; project_title: string; old_status: string | null; new_status: string };

export async function refreshProjectStatuses(client?: PoolClient, projectId?: number): Promise<void> {
  try {
    await loadOptionOverrides(); // projectStatus options may be admin-edited
    const params = [optionValues("projectStatus"), projectId ?? null];
    const changed: Changed[] = client
      ? (await client.query<Changed>(REFRESH_SQL, params)).rows
      : await query<Changed>(REFRESH_SQL, params);

    for (const c of changed) {
      await logStatusChange(
        {
          entity_type: "project",
          entity_id: c.id,
          entity_label: c.project_title,
          project_id: c.id,
          from_status: c.old_status,
          to_status: c.new_status,
          actor_role: "admin", // VersionLogEntry only allows "admin" | "partner"
          actor_org: null,
          actor_name: AUTO_ACTOR,
          reason: AUTO_REASON,
        },
        client
      );
    }
  } catch (err) {
    if (client) throw err;
    console.error("refreshProjectStatuses failed:", err);
  }
}
