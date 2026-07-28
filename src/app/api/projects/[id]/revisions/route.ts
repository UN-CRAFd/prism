import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardProject } from "@/lib/authz";

// List the revisions logged on a project, newest first.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await requireSession();
    if (session instanceof NextResponse) return session;
    const gate = await guardProject(session, id);
    if (gate) return gate;

    const rows = await query(
      `SELECT id, project_id, revision_date, comment, created_at
         FROM reporting_platform.project_revisions
        WHERE project_id = $1
        ORDER BY revision_date DESC, id DESC`,
      [id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/projects/[id]/revisions error:", err);
    return NextResponse.json({ error: "Failed to load revisions" }, { status: 500 });
  }
}

// Log a project revision — a date + optional comment. Purely a record; nothing
// derived from the project changes.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const revisionDate = typeof body.revision_date === "string" ? body.revision_date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(revisionDate)) {
    return NextResponse.json({ error: "revision_date must be a YYYY-MM-DD date" }, { status: 400 });
  }
  const comment = typeof body.comment === "string" && body.comment.trim() ? body.comment.trim() : null;

  try {
    // Guard against a revision on a project that doesn't exist.
    const exists = await query(`SELECT 1 FROM reporting_platform.projects WHERE id = $1`, [id]);
    if (exists.length === 0) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const rows = await query(
      `INSERT INTO reporting_platform.project_revisions (project_id, revision_date, comment)
       VALUES ($1, $2, $3)
       RETURNING id, project_id, revision_date, comment, created_at`,
      [id, revisionDate, comment]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/projects/[id]/revisions error:", err);
    return NextResponse.json({ error: "Failed to log revision" }, { status: 500 });
  }
}
