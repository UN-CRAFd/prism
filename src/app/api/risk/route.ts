import { NextRequest, NextResponse } from "next/server";
import type { PoolClient } from "pg";
import pool, { query } from "@/lib/db";
import { requireSession, requireAdmin, guardReport, guardRow } from "@/lib/authz";
import { parseBody, invalidJson, badRequest, serverError, deleted, toNumber } from "@/lib/http";
import { logger } from "@/lib/logger";

// risk_category was normalized out of risk_management into the risk_categories
// junction table (migration 014). Every read assembles it back into a string[]
// under the `risk_category` key the client expects; every write syncs the
// junction rows separately from the risk_management column update.
const CATEGORY_AGG = `COALESCE(
  (SELECT ARRAY_AGG(rc.category ORDER BY rc.category)
     FROM reporting_platform.risk_categories rc
    WHERE rc.risk_id = rm.id),
  '{}'
) AS risk_category`;

function normalizeCategories(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((c) => String(c).trim()).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split(",").map((c) => c.trim()).filter(Boolean);
  return [];
}

// Runs on a caller-supplied client so it can share the enclosing transaction —
// the risk_management write and its category sync must commit together.
async function syncCategories(client: PoolClient, riskId: number, categories: string[]) {
  await client.query(`DELETE FROM reporting_platform.risk_categories WHERE risk_id = $1`, [riskId]);
  if (categories.length) {
    await client.query(
      `INSERT INTO reporting_platform.risk_categories (risk_id, category)
       SELECT $1, unnest($2::text[])
       ON CONFLICT (risk_id, category) DO NOTHING`,
      [riskId, categories]
    );
  }
}

async function fetchRisk(id: number) {
  const rows = await query(
    `SELECT rm.*, ${CATEGORY_AGG} FROM reporting_platform.risk_management rm WHERE rm.id = $1`,
    [id]
  );
  return rows[0];
}

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  try {
    if (reportId) {
      const gate = await guardReport(session, reportId);
      if (gate) return gate;
      const rows = await query(
        `SELECT rm.*, ${CATEGORY_AGG}
           FROM reporting_platform.risk_management rm
          WHERE rm.report_id = $1
          ORDER BY rm.id`,
        [reportId]
      );
      return NextResponse.json(rows);
    }
    const adminGate = await requireAdmin();
    if (adminGate instanceof NextResponse) return adminGate;
    const rows = await query(`
      SELECT
        rm.*,
        ${CATEGORY_AGG},
        r.year,
        r.report_type,
        pr.project_title,
        pr.short_name AS project_short_name,
        p.short_name  AS partner_short_name,
        p.long_name   AS partner_long_name
      FROM reporting_platform.risk_management rm
      JOIN reporting_platform.reports  r  ON r.id  = rm.report_id
      JOIN reporting_platform.projects pr ON pr.id = r.project_id
      JOIN reporting_platform.partners p  ON p.id  = pr.partner_id
      ORDER BY r.year DESC, p.short_name, rm.id
    `);
    return NextResponse.json(rows);
  } catch (err) {
    logger.error("GET /api/risk error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return invalidJson();

  const { reportId, risk_name, risk_category, approved_mitigation } = body;
  if (!reportId || !risk_name) {
    return badRequest("reportId and risk_name required");
  }

  const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
  if (gate) return gate;

  const categories = normalizeCategories(risk_category);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.risk_management (report_id, risk_name, approved_mitigation)
       VALUES ($1, $2, $3) RETURNING id`,
      [reportId, risk_name, (approved_mitigation as string) || null]
    );
    const id = rows.rows[0].id;
    await syncCategories(client, id, categories);
    await client.query("COMMIT");
    return NextResponse.json(await fetchRisk(id), { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/risk error:", err);
    return serverError();
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return invalidJson();

  const { id, ...fields } = body;
  if (!id) return badRequest("id required");

  const gate = await guardRow(session, "risk_management", id as string | number, { requireOpen: true });
  if (gate) return gate;

  // risk_category lives in the junction table, not on risk_management.
  const allowed = ["risk_name", "likelihood", "impact", "approved_mitigation", "updated_mitigation", "project_revision"] as const;
  const updates: string[] = [];
  const values: unknown[] = [id];

  for (const field of allowed) {
    if (!(field in fields)) continue;
    let val: unknown = fields[field];
    if (field === "likelihood" || field === "impact") val = toNumber(val);
    else if (field === "project_revision") val = Boolean(val);
    else val = val || null;
    values.push(val);
    updates.push(`${field} = $${values.length}`);
  }

  const hasCategories = "risk_category" in fields;
  if (updates.length === 0 && !hasCategories) {
    return badRequest("No fields to update");
  }

  // The column update and the category sync must commit together.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (updates.length > 0) {
      await client.query(
        `UPDATE reporting_platform.risk_management SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`,
        values
      );
    }
    if (hasCategories) {
      await syncCategories(client, Number(id), normalizeCategories(fields.risk_category));
    }
    await client.query("COMMIT");
    return NextResponse.json(await fetchRisk(Number(id)));
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/risk error:", err);
    return serverError();
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("id required");
  const gate = await guardRow(session, "risk_management", id, { requireOpen: true });
  if (gate) return gate;

  try {
    // risk_categories cascade-delete via FK.
    await query(`DELETE FROM reporting_platform.risk_management WHERE id = $1`, [id]);
    return deleted();
  } catch (err) {
    logger.error("DELETE /api/risk error:", err);
    return serverError();
  }
}
