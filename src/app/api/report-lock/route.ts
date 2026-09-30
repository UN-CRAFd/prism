import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardReport } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { badRequest, invalidJson, serverError } from "@/lib/http";
import { REPORT_LOCK_TIMEOUT_MS } from "@/lib/editor-lock";

type LockRow = {
  report_id: number;
  session_id: string;
  holder_name: string;
  holder_role: string;
  acquired_at: string;
  last_seen_at: string;
};

function expiresAt(lastSeenAt: string): Date {
  return new Date(new Date(lastSeenAt).getTime() + REPORT_LOCK_TIMEOUT_MS);
}

function isStale(lastSeenAt: string): boolean {
  return expiresAt(lastSeenAt) <= new Date();
}

// GET ?report_id=X&session_id=Y
// Returns the current lock state for the caller. A stale lock reports as not
// held. session_id is required so byMe can be computed server-side.
export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("report_id");
  const callerSessionId = req.nextUrl.searchParams.get("session_id");
  if (!reportId) return badRequest("report_id is required");
  if (!callerSessionId) return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  try {
    const rows = await query<LockRow>(
      `SELECT report_id, session_id, holder_name, holder_role, acquired_at, last_seen_at
         FROM reporting_platform.report_editor_locks
        WHERE report_id = $1`,
      [reportId]
    );

    if (rows.length === 0 || isStale(rows[0].last_seen_at)) {
      return NextResponse.json({
        held: false,
        byMe: false,
        holder_name: null,
        holder_role: null,
        acquired_at: null,
        last_seen_at: null,
        expires_at: null,
      });
    }

    const row = rows[0];
    return NextResponse.json({
      held: true,
      byMe: row.session_id === callerSessionId,
      holder_name: row.holder_name,
      holder_role: row.holder_role,
      acquired_at: row.acquired_at,
      last_seen_at: row.last_seen_at,
      expires_at: expiresAt(row.last_seen_at).toISOString(),
    });
  } catch (err) {
    logger.error("GET /api/report-lock error:", err);
    return serverError();
  }
}

// POST { report_id, session_id }
// Acquire or heartbeat the lock. A live lock held by another session always
// returns 409 regardless of the caller's role.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return invalidJson();
  }

  const { report_id, session_id } = body;
  if (!report_id) return badRequest("report_id is required");
  if (!session_id || typeof session_id !== "string") return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, report_id as string | number);
  if (gate) return gate;

  try {
    // Atomic acquire-or-heartbeat in one statement so two simultaneous requests
    // cannot both win. The WHERE on the DO UPDATE limits the write to:
    //   • locks that have gone stale (no heartbeat within REPORT_LOCK_TIMEOUT_MS), OR
    //   • the same session renewing its own lock (heartbeat).
    // When neither holds, the INSERT is skipped entirely and RETURNING is empty.
    const rows = await query<LockRow & { was_acquired: boolean }>(
      `INSERT INTO reporting_platform.report_editor_locks
         (report_id, session_id, holder_name, holder_role, acquired_at, last_seen_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (report_id) DO UPDATE
         SET session_id   = EXCLUDED.session_id,
             holder_name  = EXCLUDED.holder_name,
             holder_role  = EXCLUDED.holder_role,
             acquired_at  = CASE
                              WHEN report_editor_locks.session_id = EXCLUDED.session_id
                              THEN report_editor_locks.acquired_at
                              ELSE now()
                            END,
             last_seen_at = now()
         WHERE report_editor_locks.last_seen_at < now() - ($5 * INTERVAL '1 millisecond')
            OR report_editor_locks.session_id = EXCLUDED.session_id
       RETURNING *,
         (acquired_at = last_seen_at) AS was_acquired`,
      [report_id, session_id, session.name, session.role, REPORT_LOCK_TIMEOUT_MS]
    );

    if (rows.length > 0) {
      const row = rows[0];
      return NextResponse.json({
        status: row.was_acquired ? "acquired" : "held",
        holder_name: row.holder_name,
        holder_role: row.holder_role,
        acquired_at: row.acquired_at,
        last_seen_at: row.last_seen_at,
        expires_at: expiresAt(row.last_seen_at).toISOString(),
      });
    }

    // Lock is live and held by a different session. Report who holds it.
    const current = await query<Pick<LockRow, "holder_name" | "holder_role">>(
      `SELECT holder_name, holder_role
         FROM reporting_platform.report_editor_locks
        WHERE report_id = $1`,
      [report_id]
    );
    const holder = current[0];
    return NextResponse.json(
      {
        error: "Report is currently open",
        holder_name: holder?.holder_name ?? null,
        holder_role: holder?.holder_role ?? null,
      },
      { status: 409 }
    );
  } catch (err) {
    logger.error("POST /api/report-lock error:", err);
    return serverError();
  }
}

// DELETE { report_id, session_id }
// Release the lock. session_id must match the holder; a release only ever
// removes the caller's own lock regardless of role.
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return invalidJson();
  }

  const { report_id, session_id } = body;
  if (!report_id) return badRequest("report_id is required");
  if (!session_id || typeof session_id !== "string") return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, report_id as string | number);
  if (gate) return gate;

  try {
    await query(
      `DELETE FROM reporting_platform.report_editor_locks
        WHERE report_id = $1 AND session_id = $2`,
      [report_id, session_id]
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/report-lock error:", err);
    return serverError();
  }
}
