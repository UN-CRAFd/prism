import { NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin } from "@/lib/authz";

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
    // Partners see only their own organization's projects; admins see all.
    const scoped = session.role !== "admin";
    const rows = await query(
      `SELECT pr.*, p.short_name AS partner_short_name, p.long_name AS partner_long_name,
              COALESCE(ext.months_total, 0)::int AS extension_months_total,
              COALESCE(ext.cnt, 0)::int          AS extension_count
       FROM reporting_platform.projects pr
       JOIN reporting_platform.partners p ON p.id = pr.partner_id
       LEFT JOIN LATERAL (
         SELECT SUM(months_added) AS months_total, COUNT(*) AS cnt
           FROM reporting_platform.project_extensions e
          WHERE e.project_id = pr.id
       ) ext ON TRUE
       ${scoped ? "WHERE lower(p.short_name) = lower($1)" : ""}
       ORDER BY p.short_name, pr.project_title`,
      scoped ? [session.org] : []
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/projects error:", err);
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
    implementing_partners,
  } = body;

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

    await client.query(
      `INSERT INTO reporting_platform.reports (project_id, year, data_type)
       VALUES ($1, $2, 'prodoc')`,
      [project.id, prodocYearFor(project_start_date)]
    );

    await client.query("COMMIT");
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/projects error:", err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  } finally {
    client.release();
  }
}
