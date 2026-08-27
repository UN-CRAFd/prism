import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { badRequest, invalidJson, serverError } from "@/lib/http";

// A lock is considered stale — and may be claimed by another session —
// once last_seen_at goes this many milliseconds without a heartbeat.
const LOCK_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

type LockRow = {
  project_id: number;
  session_id: string;
  holder_name: string;
  holder_role: string;
  acquired_at: string;
  last_seen_at: string;
};

function expiresAt(lastSeenAt: string): Date {
  return new Date(new Date(lastSeenAt).getTime() + LOCK_TIMEOUT_MS);
}

function isStale(lastSeenAt: string): boolean {
  return expiresAt(lastSeenAt) <= new Date();
}

// GET ?project_id=X&session_id=Y
// Returns the current lock state for the caller. A stale lock reports as not
// held. session_id is required so byMe can be computed server-side.
export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  const callerSessionId = req.nextUrl.searchParams.get("session_id");
  if (!projectId) return badRequest("project_id is required");
  if (!callerSessionId) return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query<LockRow>(
      `SELECT project_id, session_id, holder_name, holder_role, acquired_at, last_seen_at
         FROM reporting_platform.prodoc_editor_locks
        WHERE project_id = $1`,
      [projectId]
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
    logger.error("GET /api/prodoc-lock error:", err);
    return serverError();
  }
}

// POST { project_id, session_id }
// Acquire the lock, heartbeat it, or (admin only) take it over from another session.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return invalidJson();
  }

  const { project_id, session_id } = body;
  if (!project_id) return badRequest("project_id is required");
  if (!session_id || typeof session_id !== "string") return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  try {
    // Atomic acquire-or-heartbeat in one statement so two simultaneous requests
    // cannot both win. The WHERE on the DO UPDATE limits the write to:
    //   • locks that have gone stale (no heartbeat within LOCK_TIMEOUT_MS), OR
    //   • the same session renewing its own lock (heartbeat).
    // When neither holds, the INSERT is skipped entirely and RETURNING is empty.
    //
    // acquired_at is preserved on a heartbeat (THEN branch) so that
    // (acquired_at = last_seen_at) reliably distinguishes a new acquisition
    // (both = now() from the same statement) from a heartbeat (acquired_at < last_seen_at).
    const rows = await query<LockRow & { was_acquired: boolean }>(
      `INSERT INTO reporting_platform.prodoc_editor_locks
         (project_id, session_id, holder_name, holder_role, acquired_at, last_seen_at)
       VALUES ($1, $2, $3, $4, now(), now())
       ON CONFLICT (project_id) DO UPDATE
         SET session_id   = EXCLUDED.session_id,
             holder_name  = EXCLUDED.holder_name,
             holder_role  = EXCLUDED.holder_role,
             acquired_at  = CASE
                              WHEN prodoc_editor_locks.session_id = EXCLUDED.session_id
                              THEN prodoc_editor_locks.acquired_at
                              ELSE now()
                            END,
             last_seen_at = now()
         WHERE prodoc_editor_locks.last_seen_at < now() - ($5 * INTERVAL '1 millisecond')
            OR prodoc_editor_locks.session_id = EXCLUDED.session_id
       RETURNING *,
         (acquired_at = last_seen_at) AS was_acquired`,
      [project_id, session_id, session.name, session.role, LOCK_TIMEOUT_MS]
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

    // Lock is live and held by a different session.
    // Admins may explicitly request an override; without override: true they
    // get the same 409 as anyone else, plus can_override: true so the client
    // can offer a "take over" confirmation step.

    if (session.role === "admin" && body.override === true) {
      // Explicit admin takeover: force-update regardless of staleness or holder.
      const taken = await query<LockRow>(
        `UPDATE reporting_platform.prodoc_editor_locks
            SET session_id   = $2,
                holder_name  = $3,
                holder_role  = $4,
                acquired_at  = now(),
                last_seen_at = now()
          WHERE project_id = $1
          RETURNING *`,
        [project_id, session_id, session.name, session.role]
      );
      // If the lock was released in the window between our INSERT attempt and this
      // UPDATE, the row is gone. Return acquired anyway — the lock is now free.
      const row = taken[0];
      if (!row) {
        return NextResponse.json({ status: "acquired", takeover: true });
      }
      return NextResponse.json({
        status: "acquired",
        takeover: true,
        holder_name: row.holder_name,
        holder_role: row.holder_role,
        acquired_at: row.acquired_at,
        last_seen_at: row.last_seen_at,
        expires_at: expiresAt(row.last_seen_at).toISOString(),
      });
    }

    // Report who holds the lock. Admins learn they can retry with override: true.
    const current = await query<Pick<LockRow, "holder_name" | "holder_role">>(
      `SELECT holder_name, holder_role
         FROM reporting_platform.prodoc_editor_locks
        WHERE project_id = $1`,
      [project_id]
    );
    const holder = current[0];
    return NextResponse.json(
      {
        error: "Document is currently being edited",
        holder_name: holder?.holder_name ?? null,
        holder_role: holder?.holder_role ?? null,
        ...(session.role === "admin" && { can_override: true }),
      },
      { status: 409 }
    );
  } catch (err) {
    logger.error("POST /api/prodoc-lock error:", err);
    return serverError();
  }
}

// DELETE { project_id, session_id }
// Release the lock. session_id must match the holder, unless the caller is admin.
export async function DELETE(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return invalidJson();
  }

  const { project_id, session_id } = body;
  if (!project_id) return badRequest("project_id is required");
  if (!session_id || typeof session_id !== "string") return badRequest("session_id is required");

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  try {
    if (session.role === "admin") {
      await query(
        `DELETE FROM reporting_platform.prodoc_editor_locks WHERE project_id = $1`,
        [project_id]
      );
    } else {
      await query(
        `DELETE FROM reporting_platform.prodoc_editor_locks
          WHERE project_id = $1 AND session_id = $2`,
        [project_id, session_id]
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/prodoc-lock error:", err);
    return serverError();
  }
}
