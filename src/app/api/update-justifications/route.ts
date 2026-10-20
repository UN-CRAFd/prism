import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/http";
import { GENERAL_JUSTIFICATION_KEY, isJustificationKey } from "@/lib/update-justifications";

// One open justification per update type on a project update — "why are you
// applying for a no cost extension?" answered separately from "why a budget
// revision?". Storage: db/add-update-justifications.sql.
//
// GET  ?reportId=  → [{ update_type, justification }]
// PUT  { reportId, update_type, justification } → upsert one field

// Same migration guard the rest of the project-update code uses: the app keeps
// working before the table exists, it just has nothing to show.
let hasTableCache: boolean | null = null;

async function hasJustificationTable(): Promise<boolean> {
  if (hasTableCache !== null) return hasTableCache;
  const rows = await query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'reporting_platform' AND table_name = 'update_justifications'`
  );
  hasTableCache = rows.length === 1;
  return hasTableCache;
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  if (!reportId) return NextResponse.json({ error: "reportId required" }, { status: 400 });

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    if (!(await hasJustificationTable())) return NextResponse.json([]);
    const rows = await query(
      `SELECT update_type, justification
         FROM reporting_platform.update_justifications
        WHERE report_id = $1
        ORDER BY update_type`,
      [reportId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/update-justifications error:", err);
    return NextResponse.json({ error: "Failed to load justifications" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { reportId, update_type: updateType, justification } = body as {
    reportId?: number | string;
    update_type?: string;
    justification?: string;
  };
  if (!reportId) return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  // Only a known matrix column key (or the 'general' sentinel) — never free text,
  // which would let a stale client scatter unreadable rows across the table.
  if (typeof updateType !== "string" || !isJustificationKey(updateType)) {
    return NextResponse.json(
      { error: `update_type must be a known update type or "${GENERAL_JUSTIFICATION_KEY}"` },
      { status: 400 }
    );
  }

  const gate = await guardReport(session, reportId, { requireOpen: true });
  if (gate) return gate;

  try {
    if (!(await hasJustificationTable())) {
      return NextResponse.json(
        { error: "Justifications are not available on this database — run db/add-update-justifications.sql" },
        { status: 400 }
      );
    }
    const rows = await query(
      `INSERT INTO reporting_platform.update_justifications (report_id, update_type, justification)
       VALUES ($1, $2, $3)
       ON CONFLICT (report_id, update_type)
       DO UPDATE SET justification = EXCLUDED.justification, updated_at = NOW()
       RETURNING update_type, justification`,
      [reportId, updateType, typeof justification === "string" ? justification : ""]
    );
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PUT /api/update-justifications error:", err);
    return NextResponse.json({ error: "Failed to save justification" }, { status: 500 });
  }
}
