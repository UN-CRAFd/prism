import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireSession, guardProject } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Project-level funding tranches for the project document. The grant
// (projects.grant_size_usd) is subdivided into one or more disbursement
// tranches, each with an amount, a date and an optional comment; the amounts
// are intended to sum to the grant size (a soft rule enforced in the UI).
// Shared by the admin and partner sides, mirroring project_sdg_targets.
//
//   GET  ?project_id=X   → all tranche rows for the project (in order)
//   PUT  { project_id, tranches: [{ amount, tranche_date, comment }] }
//                        → replace the whole set for the project (transactional)

interface TrancheInput {
  amount: number;
  tranche_date: string | null;
  comment: string | null;
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
      `SELECT id, project_id, amount, tranche_date, comment, sort_order
         FROM reporting_platform.project_tranches
        WHERE project_id = $1
        ORDER BY sort_order, id`,
      [projectId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/project-tranches error:", err);
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
  if (!Array.isArray(body.tranches)) {
    return NextResponse.json({ error: "tranches must be an array" }, { status: 400 });
  }

  // Validate + normalise each tranche before touching the DB.
  const tranches: TrancheInput[] = [];
  for (const raw of body.tranches as unknown[]) {
    const t = raw as Record<string, unknown>;
    const amount = Number(t.amount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: `Invalid tranche amount: ${t.amount}` }, { status: 400 });
    }
    let date: string | null = null;
    if (typeof t.tranche_date === "string" && t.tranche_date.trim()) {
      date = t.tranche_date.slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: `Invalid tranche_date: ${t.tranche_date}` }, { status: 400 });
      }
    }
    const comment = typeof t.comment === "string" && t.comment.trim() ? t.comment.trim() : null;
    tranches.push({ amount, tranche_date: date, comment });
  }

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardProject(session, project_id as string | number);
  if (gate) return gate;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `DELETE FROM reporting_platform.project_tranches WHERE project_id = $1`,
      [project_id]
    );
    for (let i = 0; i < tranches.length; i++) {
      const t = tranches[i];
      await client.query(
        `INSERT INTO reporting_platform.project_tranches
           (project_id, amount, tranche_date, comment, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [project_id, t.amount, t.tranche_date, t.comment, i]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    logger.error("PUT /api/project-tranches error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  } finally {
    client.release();
  }

  const rows = await query(
    `SELECT id, project_id, amount, tranche_date, comment, sort_order
       FROM reporting_platform.project_tranches
      WHERE project_id = $1
      ORDER BY sort_order, id`,
    [project_id]
  );
  return NextResponse.json(rows);
}
