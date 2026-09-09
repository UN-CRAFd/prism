import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";

// GET /api/version-log — admin-only list of every status-transition entry.
// Entries are written by src/lib/version-log.ts and the table is append-only
// (prism_app has INSERT and SELECT only). No write methods are exposed here.
export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  try {
    const rawLimit = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(rawLimit ? Math.max(1, parseInt(rawLimit, 10) || 200) : 200, 500);

    const rows = await query(
      `SELECT
         vl.id,
         vl.entity_type,
         vl.entity_id,
         vl.entity_label,
         vl.project_id,
         vl.from_status,
         vl.to_status,
         vl.actor_role,
         vl.actor_org,
         vl.actor_name,
         vl.reason,
         vl.created_at,
         p.project_title,
         p.short_name  AS project_short_name,
         pt.short_name AS partner_short_name
       FROM reporting_platform.version_log vl
       JOIN reporting_platform.projects p  ON p.id  = vl.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
       ORDER BY vl.created_at DESC, vl.id DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/version-log error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
