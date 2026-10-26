import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/http";

// HACT recommendations on a project update. Storage: db/add-hact-recommendations.sql.
//
// CRAF'd owns the table: only an admin adds or removes rows, and only an admin
// writes No. / finding / recommendation / status. The partner answers each
// recommendation in `partner_comment` and may write nothing else — a partner
// PATCH carrying any other field is rejected outright rather than silently
// trimmed, so a client bug can never look like a successful save.
//
// GET    ?reportId=                                → rows, in order
// POST   { reportId }                              → new empty row      (admin)
// PATCH  { id, ...fields }                         → update one row     (admin: any field; partner: partner_comment)
// DELETE ?id=                                      → remove one row     (admin)

const TABLE = "hact_recommendations";
const ADMIN_FIELDS = ["number", "finding", "recommendation", "partner_comment", "status"] as const;
const PARTNER_FIELDS = ["partner_comment"] as const;

// Same migration guard the rest of the project-update code uses: the page keeps
// working before the table exists, it just has nothing to show.
let hasTableCache: boolean | null = null;

async function hasTable(): Promise<boolean> {
  if (hasTableCache !== null) return hasTableCache;
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'reporting_platform' AND table_name = $1`,
    [TABLE]
  );
  hasTableCache = rows.length === 1;
  return hasTableCache;
}

// A function, not a shared constant: a Response body can only be read once.
function missing() {
  return NextResponse.json(
    { error: "HACT recommendations are not available on this database — run db/add-hact-recommendations.sql" },
    { status: 400 }
  );
}

const COLUMNS = "id, report_id, number, finding, recommendation, partner_comment, status, sort_order";

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    if (!(await hasTable())) return NextResponse.json([]);
    const rows = await query(
      `SELECT ${COLUMNS}
         FROM reporting_platform.${TABLE}
        WHERE report_id = $1
        ORDER BY sort_order ASC, id ASC`,
      [reportId]
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

  const body = await parseBody(req);
  const reportId = (body as { reportId?: number | string } | null)?.reportId;
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });

  try {
    if (!(await hasTable())) return missing();
    // New rows go to the end and are pre-numbered with the next position, which
    // the admin can overwrite — "No." is free text (e.g. "2.a").
    const rows = await query(
      `INSERT INTO reporting_platform.${TABLE} (report_id, number, sort_order)
       SELECT $1,
              (COUNT(*) + 1)::text,
              COALESCE(MAX(sort_order), 0) + 1
         FROM reporting_platform.${TABLE}
        WHERE report_id = $1
       RETURNING ${COLUMNS}`,
      [reportId]
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

  const isAdmin = session.role === "admin";
  const allowed: readonly string[] = isAdmin ? ADMIN_FIELDS : PARTNER_FIELDS;
  const sent = Object.keys(body).filter((k) => k !== "id");
  const forbiddenFields = sent.filter((k) => !allowed.includes(k));
  if (forbiddenFields.length) {
    return NextResponse.json(
      { error: `Not allowed to edit: ${forbiddenFields.join(", ")}` },
      { status: 403 }
    );
  }
  if (!sent.length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  // Partners: must own the row's update, and the update must still be Open.
  const gate = await guardRow(session, TABLE, id, { requireOpen: true });
  if (gate) return gate;

  try {
    if (!(await hasTable())) return missing();
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
