import { NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, editorProjectIds } from "@/lib/authz";
import { logger } from "@/lib/logger";

// The one project document every project owns is a reports row with
// data_type='prodoc'. Its year is cosmetic (a prodoc is not tied to a reporting
// year), so default to the project's start year, else the current year.
function prodocYearFor(startDate: unknown): number {
  const y = typeof startDate === "string" && startDate
    ? new Date(startDate).getFullYear()
    : new Date().getFullYear();
  return Math.min(2050, Math.max(2020, y));
}

export async function GET() {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  try {
    // Partners see their own organization's projects PLUS any project they were
    // granted edit rights on (project_editors); admins see all.
    const scoped = session.role !== "admin";
    const values: unknown[] = [];
    let where = "";
    if (scoped) {
      values.push(session.org);
      const editorIds = await editorProjectIds(session);
      if (editorIds.length) {
        values.push(editorIds);
        where = `WHERE (lower(p.short_name) = lower($1) OR pr.id = ANY($2::int[]))`;
      } else {
        where = `WHERE lower(p.short_name) = lower($1)`;
      }
    }
    const rows = await query(
      `SELECT pr.*, p.short_name AS partner_short_name, p.long_name AS partner_long_name,
              COALESCE(ext.months_total, 0)::int AS extension_months_total,
              COALESCE(ext.cnt, 0)::int          AS extension_count,
              COALESCE(ed.ids, ARRAY[]::int[])   AS editor_partner_ids
       FROM reporting_platform.projects pr
       JOIN reporting_platform.partners p ON p.id = pr.partner_id
       LEFT JOIN LATERAL (
         SELECT SUM(months_added) AS months_total, COUNT(*) AS cnt
           FROM reporting_platform.project_extensions e
          WHERE e.project_id = pr.id
       ) ext ON TRUE
       LEFT JOIN LATERAL (
         SELECT ARRAY_AGG(pe.partner_id) AS ids
           FROM reporting_platform.project_editors pe
          WHERE pe.project_id = pr.id
       ) ed ON TRUE
       ${where}
       ORDER BY p.short_name, pr.project_title`,
      values
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/projects error:", err);
    return NextResponse.json({ error: "Failed to load projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const {
    partner_id, project_title, short_name,
    mptfo_project_number, grant_size_usd, project_start_date, project_duration_months, geographic_scope,
    implementing_partners, editor_partner_ids,
  } = body;

  // Partners granted prodoc edit rights: sanitise to a distinct list of positive
  // ints, never including the lead (they already own the project).
  const editorIds = Array.isArray(editor_partner_ids)
    ? [...new Set(editor_partner_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n !== Number(partner_id)))]
    : [];

  if (!partner_id || !project_title) {
    return NextResponse.json(
      { error: "partner_id and project_title are required" },
      { status: 400 }
    );
  }

  // Create the project and its sole project document atomically, so a project
  // never exists without exactly one prodoc.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const inserted = await client.query(
      `INSERT INTO reporting_platform.projects
         (partner_id, project_title, short_name, mptfo_project_number, grant_size_usd, project_start_date, project_duration_months, geographic_scope, implementing_partners, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Idea')
       RETURNING *`,
      [
        partner_id, project_title,
        short_name || null,
        mptfo_project_number || null, grant_size_usd || null,
        project_start_date || null, project_duration_months || null, geographic_scope || null,
        implementing_partners || null,
      ]
    );
    const project = inserted.rows[0];

    if (editorIds.length) {
      await client.query(
        `INSERT INTO reporting_platform.project_editors (project_id, partner_id)
         SELECT $1, unnest($2::int[])
         ON CONFLICT DO NOTHING`,
        [project.id, editorIds]
      );
    }

    const prodoc = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.reports (project_id, year, data_type)
       VALUES ($1, $2, 'prodoc')
       RETURNING id`,
      [project.id, prodocYearFor(project_start_date)]
    );

    // Prepopulate the prodoc's indicators tab with every standard (admin-defined)
    // indicator. Partners then remove the ones irrelevant to their project rather
    // than starting from an empty tab. Annual/final reports later inherit these
    // lines from the prodoc via copyProdocBaseline.
    await client.query(
      `INSERT INTO reporting_platform.indicator_data (report_id, indicator_id, sort_order)
       SELECT $1, i.id, ROW_NUMBER() OVER (ORDER BY i.name)
         FROM reporting_platform.indicators i
        WHERE i.is_standard AND i.archived_at IS NULL`,
      [prodoc.rows[0].id]
    );

    // Snapshot the admin-authored narrative question set onto the project so its
    // project-document narratives tab opens with the current sections to fill out.
    // label + sort_order are copied so later edits to the library leave this
    // project untouched (mirrors survey seeding from standard_survey_questions).
    await client.query(
      `INSERT INTO reporting_platform.project_narratives (project_id, narrative_key, label, description, sort_order)
       SELECT $1, sq.narrative_key, sq.label, sq.description, sq.sort_order
         FROM reporting_platform.standard_narrative_questions sq
        ORDER BY sq.sort_order, sq.id`,
      [project.id]
    );

    await client.query("COMMIT");
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/projects error:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  } finally {
    client.release();
  }
}
