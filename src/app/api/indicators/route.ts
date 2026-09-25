import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { DEFAULT_CYCLE, isValidCycle } from "@/lib/indicators";

// GET /api/indicators
//   Returns the shared indicator vocabulary to any authenticated caller.
//   Each row carries `usage_project_count` (distinct projects that reference it via
//   indicator_data) so the editors can surface recurring customs as suggestions.
//   ?project_id=X       → accepted for backwards-compat but no longer filters.
//   &include_archived=1 → also include soft-deleted (archived) rows.
//   &kind=standard      → only the CRAF'd standard library.
//   &kind=custom        → only partner-defined custom indicators.
//   (omitted)           → both standard and custom.
export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const includeArchived = req.nextUrl.searchParams.get("include_archived") === "1";
  const kind = req.nextUrl.searchParams.get("kind"); // "standard" | "custom" | null (all)

  try {
    const where: string[] = [];
    if (!includeArchived) where.push("i.archived_at IS NULL");
    if (kind === "standard") where.push("i.is_standard = TRUE");
    if (kind === "custom") where.push("i.is_standard = FALSE");

    const rows = await query(
      `SELECT i.id, i.name, i.description, i.means_of_verification, i.category, i.cycle,
              i.is_standard, i.archived_at, i.created_at, i.updated_at,
              COALESCE(u.project_count, 0)::int AS usage_project_count,
              COALESCE(u.usage, '[]'::json)      AS usage
         FROM reporting_platform.indicators i
         LEFT JOIN LATERAL (
           SELECT COUNT(DISTINCT p.id) AS project_count,
                  json_agg(DISTINCT jsonb_build_object(
                    'report_id', r.id,
                    'year', r.year,
                    'project_short_name', p.short_name,
                    'project_title', p.project_title
                  )) AS usage
             FROM reporting_platform.indicator_data d
             JOIN reporting_platform.reports  r ON r.id = d.report_id
             JOIN reporting_platform.projects p ON p.id = r.project_id
            WHERE d.indicator_id = i.id
         ) u ON TRUE
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY i.is_standard DESC, usage_project_count DESC, i.name`
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/indicators error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

// POST /api/indicators — create a standard (admin library) or custom indicator.
// Custom indicators are no longer tied to a project: any authenticated user may
// add one to the shared vocabulary, and it is immediately searchable everywhere.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  // Default to a CUSTOM indicator. "Standard" is the controlled CRAF'd
  // vocabulary and has to be asked for explicitly — the admin library page is the
  // only caller that does. Every other surface (the partner report editor and both
  // project-document editors) creates partner-defined indicators, and defaulting
  // the other way meant a single caller forgetting the flag would file them under
  // "CRAF'd standard indicators" on every project that reused them.
  const isStandard = Boolean(body.is_standard);

  // For custom (partner-defined) indicators, description and means of verification
  // are mandatory alongside the name.
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const meansOfVerification = typeof body.means_of_verification === "string" ? body.means_of_verification.trim() : "";
  if (!isStandard) {
    if (!description) {
      return NextResponse.json({ error: "description is required for custom indicators" }, { status: 400 });
    }
    if (!meansOfVerification) {
      return NextResponse.json({ error: "means_of_verification is required for custom indicators" }, { status: 400 });
    }
  }

  // Standard (library) indicators are admin-owned. Custom ones may be created by
  // any authenticated user (partner or admin) into the shared vocabulary.
  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (isStandard) {
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;
  }

  let cycleValue: string;
  if (!body.cycle) {
    cycleValue = DEFAULT_CYCLE;
  } else if (!isValidCycle(body.cycle)) {
    return NextResponse.json({ error: "Invalid cycle" }, { status: 400 });
  } else {
    cycleValue = body.cycle;
  }

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.indicators
         (name, description, means_of_verification, category, cycle, is_standard)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, name, description, means_of_verification, category, cycle,
                 is_standard, archived_at, created_at, updated_at`,
      [
        name,
        description || null,
        meansOfVerification || null,
        body.category || null,
        cycleValue,
        isStandard,
      ]
    );
    return NextResponse.json({ ...rows[0], usage_project_count: 0, usage: [] }, { status: 201 });
  } catch (err) {
    logger.error("POST /api/indicators error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
