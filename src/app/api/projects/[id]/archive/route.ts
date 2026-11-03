import { NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";
import { logStatusChange } from "@/lib/version-log";
import { documentTitle } from "@/lib/project-updates";
import { hasUpdateModuleColumns } from "@/lib/update-columns";

// ─────────────────────────────────────────────────────────────────────────────
// Archive / unarchive a project (admin only).
//
// Archiving is project-level: the project and every document under it (project
// document, reports, project updates) are flagged together, in one transaction,
// so the Reports and Project Updates overviews hide them along with the project.
// Nothing is deleted or locked — the flag only drives the overview filters.
//
// A project can only be archived once all its reports and project updates are
// Closed. GET returns the ones still in the way, so the UI can say so before
// asking for a name and reason; POST re-checks and refuses (409) regardless.
//
// The change is written to the version log like a status change
// (Active → Archived), with the admin's name and reason.
// ─────────────────────────────────────────────────────────────────────────────

const CLOSED = "Closed";

type Blocker = {
  id: number;
  data_type: string;
  report_type: string | null;
  year: number;
  update_index: string | null;
  update_types?: string[] | null;
  status: string;
};

// Pass `client` to run the check inside a transaction (POST does, under the
// project row lock); without it the check runs on the pool (GET).
async function openDocuments(projectId: number, client?: PoolClient): Promise<{ id: number; label: string; status: string }[]> {
  // update_types names an update ("2027-BR-TR-AR"); read it when the column exists.
  const withTypes = await hasUpdateModuleColumns();
  const sql = `SELECT id, data_type, report_type, year, update_index${withTypes ? ", update_types" : ""}, status
       FROM reporting_platform.reports
      WHERE project_id = $1
        AND data_type IN ('report', 'update')
        AND status <> $2
      ORDER BY year, data_type, id`;
  const values = [projectId, CLOSED];
  const rows = client ? (await client.query<Blocker>(sql, values)).rows : await query<Blocker>(sql, values);
  return rows.map((r) => ({
    id: r.id,
    label: documentTitle({ ...r, data_type: r.data_type }),
    status: r.status,
  }));
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// GET → { blockers: [{ id, label, status }] } — reports/updates not yet Closed.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  try {
    return NextResponse.json({ blockers: await openDocuments(id) });
  } catch (err) {
    logger.error("GET /api/projects/[id]/archive error:", err);
    return NextResponse.json({ error: "Failed to check project documents" }, { status: 500 });
  }
}

// POST { archived: boolean, actor_name?, reason? }
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;
  const id = parseId((await params).id);
  if (!id) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.archived !== "boolean") {
    return NextResponse.json({ error: "archived must be a boolean" }, { status: 400 });
  }
  const archived = body.archived;
  const actorName = typeof body.actor_name === "string" ? body.actor_name.trim().slice(0, 200) || null : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 2000) || null : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Lock the project row so two admins can't race the check below.
    const cur = await client.query<{ project_title: string; archived: boolean }>(
      `SELECT project_title, archived FROM reporting_platform.projects WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (cur.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    const { project_title, archived: wasArchived } = cur.rows[0];

    if (archived) {
      const blockers = await openDocuments(id, client);
      if (blockers.length) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            error: "All reports and project updates must be Closed before the project can be archived.",
            blockers,
          },
          { status: 409 }
        );
      }
    }

    await client.query(
      `UPDATE reporting_platform.projects SET archived = $1 WHERE id = $2`,
      [archived, id]
    );
    // Cascade to every document of the project (prodoc, reports, updates).
    await client.query(
      `UPDATE reporting_platform.reports SET archived = $1 WHERE project_id = $2 AND archived IS DISTINCT FROM $1`,
      [archived, id]
    );

    if (wasArchived !== archived) {
      await logStatusChange(
        {
          entity_type: "project",
          entity_id: id,
          entity_label: project_title,
          project_id: id,
          from_status: wasArchived ? "Archived" : "Active",
          to_status: archived ? "Archived" : "Active",
          actor_role: session.role,
          actor_org: session.org ?? null,
          actor_name: actorName,
          reason,
        },
        client
      );
    }

    await client.query("COMMIT");
    return NextResponse.json({ id, archived });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/projects/[id]/archive error:", err);
    return NextResponse.json(
      { error: "Failed to change the archive state. Has db/add-archived.sql been run?" },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
