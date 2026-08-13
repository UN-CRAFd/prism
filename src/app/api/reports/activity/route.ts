import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { REPORT_SCOPED_TABLES } from "@/lib/report-tables";

// GET /api/reports/activity?limit=5
// Reports ordered by their most recent partner edit. A report's own updated_at
// only bumps on overview/status changes, so "last edited" is the greatest
// updated_at across every per-report section table (surveys, indicators, …).
// Static route — resolves before /api/reports/[id].

// The per-report child tables come from the shared registry so this endpoint and
// /api/reports agree on the set. The live DB has drifted from db/schema.sql — not
// every table actually carries `updated_at` (e.g. surveys historically lacked it)
// — so we introspect once which of the registry tables really have the column and
// UNION only those. Referencing a missing column would 500 the whole endpoint.
// Cached module-side; the set only changes on a migration, never at runtime.
let activityUnionCache: string | null = null;

async function getActivityUnion(): Promise<string> {
  if (activityUnionCache) return activityUnionCache;
  const present = await query<{ table_name: string }>(
    `SELECT table_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND column_name  = 'updated_at'
        AND table_name   = ANY($1::text[])`,
    [[...REPORT_SCOPED_TABLES]]
  );
  const have = new Set(present.map((r) => r.table_name));
  const parts = REPORT_SCOPED_TABLES.filter((t) => have.has(t)).map(
    (t) => `SELECT report_id, updated_at FROM reporting_platform.${t}`
  );
  // No child table has updated_at yet → an empty relation, so last_activity falls
  // back to the report's own updated_at.
  activityUnionCache =
    parts.length > 0
      ? parts.join("\n         UNION ALL ")
      : `SELECT NULL::int AS report_id, NULL::timestamptz AS updated_at WHERE FALSE`;
  return activityUnionCache;
}

export async function GET(req: NextRequest) {
  // Cross-tenant listing of every report's last activity — admin only.
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const limit = Math.min(Math.max(Number(req.nextUrl.searchParams.get("limit")) || 5, 1), 50);

  try {
    const activityUnion = await getActivityUnion();
    const rows = await query(
      `WITH activity AS (
         ${activityUnion}
       )
       SELECT r.id, r.project_id, r.year, r.report_type, r.status, r.authorized, r.created_at,
              p.project_title,
              p.short_name  AS project_short_name,
              pt.short_name AS partner_short_name,
              GREATEST(r.updated_at, COALESCE(MAX(a.updated_at), r.updated_at)) AS last_activity
         FROM reporting_platform.reports r
         JOIN reporting_platform.projects p  ON p.id  = r.project_id
         JOIN reporting_platform.partners pt ON pt.id = p.partner_id
         LEFT JOIN activity a ON a.report_id = r.id
        WHERE r.data_type = 'report'
        GROUP BY r.id, r.project_id, r.year, r.report_type, r.status, r.authorized, r.created_at,
                 p.project_title, p.short_name, pt.short_name, r.updated_at
        ORDER BY last_activity DESC
        LIMIT $1`,
      [limit]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/reports/activity error:", err);
    return NextResponse.json({ error: "Failed to load recent activity" }, { status: 500 });
  }
}
