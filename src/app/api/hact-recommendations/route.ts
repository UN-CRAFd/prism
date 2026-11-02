import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardProject, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/http";

// HACT recommendations. Storage: db/add-hact-recommendations.sql, made
// project-scoped by db/hact-recommendations-project-scope.sql, plus the
// "Should be addressed by" column from db/hact-addressed-by.sql.
//
// One list per project. CRAF'd maintains it on /admin/hact-recommendations, and
// the HACT page of every project update of that project reads and writes the
// same rows — so an edit in either place shows up in the other.
//
// CRAF'd owns the table: only an admin adds or removes rows, and only an admin
// writes finding / recommendation / addressed_by / status. The partner answers each
// recommendation in `partner_comment` and may write nothing else — a partner
// PATCH carrying any other field is rejected outright rather than silently
// trimmed, so a client bug can never look like a successful save. A partner
// writes from a project update, which must be Open and of the row's project,
// and not once the recommendation is Implemented — that locks their comment.
//
// "No." is the row's position (1, 2, 3, …), numbered by the client from the
// returned order; it is not stored.
//
// GET    ?projectId= | ?reportId=                  → rows, in order
// POST   { projectId | reportId }                  → new empty row      (admin)
// PATCH  { id, reportId?, ...fields }              → update one row     (admin: any field; partner: partner_comment + reportId)
// DELETE ?id=                                      → remove one row     (admin)

const TABLE = "hact_recommendations";
const ADMIN_FIELDS = ["finding", "recommendation", "addressed_by", "partner_comment", "status"] as const;
const PARTNER_FIELDS = ["partner_comment"] as const;

// Same migration guard the rest of the project-update code uses: the page keeps
// working before the table is project-scoped, it just has nothing to show.
// Only a positive result is cached, so running the migration takes effect
// without restarting the server.
let hasTableCache = false;

async function hasTable(): Promise<boolean> {
  if (hasTableCache) return true;
  const rows = await query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'reporting_platform' AND table_name = $1
        AND column_name IN ('project_id', 'addressed_by')`,
    [TABLE]
  );
  hasTableCache = rows.length === 2;
  return hasTableCache;
}

// A function, not a shared constant: a Response body can only be read once.
function missing() {
  return NextResponse.json(
    { error: "HACT recommendations are not available on this database — run db/add-hact-recommendations.sql, db/hact-recommendations-project-scope.sql and db/hact-addressed-by.sql" },
    { status: 400 }
  );
}

async function projectOfReport(reportId: number | string): Promise<number | null> {
  const rows = await query<{ project_id: number }>(
    `SELECT project_id FROM reporting_platform.reports WHERE id = $1`,
    [reportId]
  );
  return rows.length ? rows[0].project_id : null;
}

const COLUMNS = "id, project_id, finding, recommendation, addressed_by, partner_comment, status, sort_order";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const projectIdParam = req.nextUrl.searchParams.get("projectId");
  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!projectIdParam && !reportId) {
    return NextResponse.json({ error: "projectId or reportId required" }, { status: 400 });
  }

  const gate = projectIdParam
    ? await guardProject(session, projectIdParam)
    : await guardReport(session, reportId);
  if (gate) return gate;

  try {
    if (!(await hasTable())) return NextResponse.json([]);
    const projectId = projectIdParam ?? (await projectOfReport(reportId!));
    if (projectId == null) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const rows = await query(
      `SELECT ${COLUMNS}
         FROM reporting_platform.${TABLE}
        WHERE project_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/hact-recommendations error:", err);
    return NextResponse.json({ error: "Failed to load HACT recommendations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = (await parseBody(req)) as { projectId?: number | string; reportId?: number | string } | null;
  const reportId = body?.reportId ?? null;
  if (!body || (!body.projectId && !reportId)) {
    return NextResponse.json({ error: "projectId or reportId is required" }, { status: 400 });
  }

  try {
    if (!(await hasTable())) return missing();
    const projectId = body.projectId ?? (await projectOfReport(reportId!));
    if (projectId == null) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    // New rows go to the end of the project's list. report_id notes the update
    // the row was added from, if any.
    const rows = await query(
      `INSERT INTO reporting_platform.${TABLE} (project_id, report_id, sort_order)
       SELECT $1, $2, COALESCE(MAX(sort_order), 0) + 1
         FROM reporting_platform.${TABLE}
        WHERE project_id = $1
       RETURNING ${COLUMNS}`,
      [projectId, reportId]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/hact-recommendations error:", err);
    return NextResponse.json({ error: "Failed to add recommendation" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = (await parseBody(req)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const id = body.id as number | string | undefined;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const reportId = body.reportId as number | string | undefined;

  const isAdmin = session.role === "admin";
  const allowed: readonly string[] = isAdmin ? ADMIN_FIELDS : PARTNER_FIELDS;
  const sent = Object.keys(body).filter((k) => k !== "id" && k !== "reportId");
  const forbiddenFields = sent.filter((k) => !allowed.includes(k));
  if (forbiddenFields.length) {
    return NextResponse.json(
      { error: `Not allowed to edit: ${forbiddenFields.join(", ")}` },
      { status: 403 }
    );
  }
  if (!sent.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  try {
    if (!(await hasTable())) return missing();

    // Partners: must write from an Open update they own, of this row's project.
    if (!isAdmin) {
      if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
      const gate = await guardReport(session, reportId, { requireOpen: true });
      if (gate) return gate;
      const match = await query<{ status: string | null }>(
        `SELECT t.status
           FROM reporting_platform.${TABLE} t
           JOIN reporting_platform.reports r ON r.project_id = t.project_id
          WHERE t.id = $1 AND r.id = $2`,
        [id, reportId]
      );
      if (!match.length) {
        return NextResponse.json({ error: "You don't have access to this resource" }, { status: 403 });
      }
      if (match[0].status === "Implemented") {
        return NextResponse.json({ error: "This recommendation is implemented and can no longer be edited" }, { status: 409 });
      }
    }

    const sets = sent.map((k, i) => `${k} = $${i + 2}`);
    const values = sent.map((k) => {
      const v = body[k];
      // `status` may be cleared; the text columns are NOT NULL and store "" instead.
      if (k === "status") return typeof v === "string" && v.trim() ? v : null;
      return typeof v === "string" ? v : "";
    });
    const rows = await query(
      `UPDATE reporting_platform.${TABLE}
          SET ${sets.join(", ")}
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [id, ...values]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/hact-recommendations error:", err);
    return NextResponse.json({ error: "Failed to save recommendation" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    if (!(await hasTable())) return missing();
    await query(`DELETE FROM reporting_platform.${TABLE} WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/hact-recommendations error:", err);
    return NextResponse.json({ error: "Failed to delete recommendation" }, { status: 500 });
  }
}
