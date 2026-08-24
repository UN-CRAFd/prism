import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireSession, guardProject, guardProjectRow } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Project organizations — participating and implementing orgs listed on a project.
//   GET  ?project_id=X[&type=participating|implementing]
//   POST { project_id, name, type }
//   PATCH { id, name }
//   DELETE ?id=X
//
// Partners may write while the prodoc is Open; admins are never status-locked.

const ORG_NAME_MAX = 300;

async function prodocStatus(projectId: number | string): Promise<string | null> {
  const rows = await query<{ status: string }>(
    `SELECT status FROM reporting_platform.reports
      WHERE project_id = $1 AND data_type = 'prodoc' LIMIT 1`,
    [projectId]
  );
  return rows.length ? rows[0].status : null;
}

function locked() {
  return NextResponse.json(
    { error: "This project document is not open for editing" },
    { status: 409 }
  );
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  const type = req.nextUrl.searchParams.get("type");
  const validType = type === "participating" || type === "implementing" ? type : null;

  try {
    const params: unknown[] = [projectId];
    const typeSql = validType ? ` AND type = $2` : "";
    if (validType) params.push(validType);

    const rows = await query(
      `SELECT id, project_id, name, type, sort_order
         FROM reporting_platform.project_organizations
        WHERE project_id = $1${typeSql}
        ORDER BY type, sort_order ASC, id ASC`,
      params
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-organizations error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const projectId = body.project_id;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const type = body.type;

  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > ORG_NAME_MAX)
    return NextResponse.json({ error: `Name must be ${ORG_NAME_MAX} characters or fewer` }, { status: 400 });
  if (type !== "participating" && type !== "implementing")
    return NextResponse.json({ error: "type must be 'participating' or 'implementing'" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId as string | number);
  if (gate) return gate;

  if (session.role !== "admin") {
    const status = await prodocStatus(projectId as string | number);
    if (status !== "Open") return locked();
  }

  try {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.project_organizations
        WHERE project_id = $1 AND type = $2`,
      [projectId, type]
    );
    const nextOrder = Number(existing[0].count) + 1;

    const rows = await query(
      `INSERT INTO reporting_platform.project_organizations (project_id, name, type, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [projectId, name, type, nextOrder]
    );
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    logger.error("POST /api/project-organizations error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > ORG_NAME_MAX)
    return NextResponse.json({ error: `Name must be ${ORG_NAME_MAX} characters or fewer` }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProjectRow(session, "project_organizations", id as string | number);
  if (gate) return gate;

  if (session.role !== "admin") {
    const rowRows = await query<{ project_id: number }>(
      `SELECT project_id FROM reporting_platform.project_organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rowRows.length) {
      const status = await prodocStatus(rowRows[0].project_id);
      if (status !== "Open") return locked();
    }
  }

  try {
    const rows = await query(
      `UPDATE reporting_platform.project_organizations
          SET name = $1, updated_at = NOW()
        WHERE id = $2
      RETURNING *`,
      [name, id]
    );
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    logger.error("PATCH /api/project-organizations error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProjectRow(session, "project_organizations", id);
  if (gate) return gate;

  if (session.role !== "admin") {
    const rowRows = await query<{ project_id: number }>(
      `SELECT project_id FROM reporting_platform.project_organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (rowRows.length) {
      const status = await prodocStatus(rowRows[0].project_id);
      if (status !== "Open") return locked();
    }
  }

  try {
    await query(`DELETE FROM reporting_platform.project_organizations WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/project-organizations error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
