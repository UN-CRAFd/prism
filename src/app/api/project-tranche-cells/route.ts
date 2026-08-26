import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Tranche matrix cells for the project document. Each cell is one position in a
// (organization × tranche_number) grid; organisation rows come from
// project_organizations and tranche columns are added dynamically.
//
//   GET  ?project_id=X   → all cells for the project (ordered by org, then tranche)
//   PUT  { project_id, cells: [{ organization_id, tranche_number, amount,
//                                date_description }] }
//                        → replace the whole set for the project (transactional)

interface CellInput {
  organization_id: number;
  tranche_number: number;
  amount: number;
  date_description: string | null;
}

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get("project_id");
  if (!projectId) return NextResponse.json({ error: "project_id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, projectId);
  if (gate) return gate;

  try {
    const rows = await query(
      `SELECT id, project_id, organization_id, tranche_number, amount, date_description
         FROM reporting_platform.project_tranche_cells
        WHERE project_id = $1
        ORDER BY organization_id, tranche_number`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-tranche-cells error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { project_id } = body;
  if (!project_id) return NextResponse.json({ error: "project_id is required" }, { status: 400 });
  if (!Array.isArray(body.cells)) {
    return NextResponse.json({ error: "cells must be an array" }, { status: 400 });
  }

  // Validate + normalise each cell before touching the DB.
  const cells: CellInput[] = [];
  for (const raw of body.cells as unknown[]) {
    const c = raw as Record<string, unknown>;

    const orgId = Number(c.organization_id);
    if (!Number.isInteger(orgId) || orgId <= 0) {
      return NextResponse.json({ error: `Invalid organization_id: ${c.organization_id}` }, { status: 400 });
    }

    const trancheNumber = Number(c.tranche_number);
    if (!Number.isInteger(trancheNumber) || trancheNumber < 1) {
      return NextResponse.json({ error: `Invalid tranche_number: ${c.tranche_number}` }, { status: 400 });
    }

    const amount = Number(c.amount ?? 0);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: `Invalid amount: ${c.amount}` }, { status: 400 });
    }

    const dateDescription =
      typeof c.date_description === "string" && c.date_description.trim()
        ? c.date_description.trim()
        : null;

    cells.push({ organization_id: orgId, tranche_number: trancheNumber, amount, date_description: dateDescription });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Verify every supplied organization_id belongs to this project.
    const orgResult = await client.query(
      `SELECT id FROM reporting_platform.project_organizations WHERE project_id = $1`,
      [project_id]
    );
    const validOrgIds = new Set<number>(orgResult.rows.map((r: { id: number }) => r.id));
    for (const cell of cells) {
      if (!validOrgIds.has(cell.organization_id)) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { error: `organization_id ${cell.organization_id} does not belong to this project` },
          { status: 400 }
        );
      }
    }

    await client.query(
      `DELETE FROM reporting_platform.project_tranche_cells WHERE project_id = $1`,
      [project_id]
    );
    for (const cell of cells) {
      await client.query(
        `INSERT INTO reporting_platform.project_tranche_cells
           (project_id, organization_id, tranche_number, amount, date_description)
         VALUES ($1, $2, $3, $4, $5)`,
        [project_id, cell.organization_id, cell.tranche_number, cell.amount, cell.date_description]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("PUT /api/project-tranche-cells error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  } finally {
    client.release();
  }

  try {
    const rows = await query(
      `SELECT id, project_id, organization_id, tranche_number, amount, date_description
         FROM reporting_platform.project_tranche_cells
        WHERE project_id = $1
        ORDER BY organization_id, tranche_number`,
      [project_id]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("PUT /api/project-tranche-cells read-back error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
