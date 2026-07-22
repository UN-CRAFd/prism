import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

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

async function syncCategories(riskId: number, categories: string[]) {
  await query(`DELETE FROM reporting_platform.risk_categories WHERE risk_id = $1`, [riskId]);
  if (categories.length) {
    await query(
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
  const reportId = req.nextUrl.searchParams.get("reportId");
  try {
    if (reportId) {
      const rows = await query(
        `SELECT rm.*, ${CATEGORY_AGG}
           FROM reporting_platform.risk_management rm
          WHERE rm.report_id = $1
          ORDER BY rm.id`,
        [reportId]
      );
      return NextResponse.json(rows);
    }
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
    console.error("GET /api/risk error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, risk_name, risk_category, approved_mitigation } = body;
  if (!reportId || !risk_name) {
    return NextResponse.json({ error: "reportId and risk_name required" }, { status: 400 });
  }

  const categories = normalizeCategories(risk_category);

  try {
    const rows = await query<{ id: number }>(
      `INSERT INTO reporting_platform.risk_management (report_id, risk_name, approved_mitigation)
       VALUES ($1, $2, $3) RETURNING id`,
      [reportId, risk_name, (approved_mitigation as string) || null]
    );
    const id = rows[0].id;
    await syncCategories(id, categories);
    return NextResponse.json(await fetchRisk(id), { status: 201 });
  } catch (err) {
    console.error("POST /api/risk error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const toNum = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  };

  // risk_category lives in the junction table, not on risk_management.
  const allowed = ["risk_name", "likelihood", "impact", "approved_mitigation", "updated_mitigation", "project_revision"] as const;
  const updates: string[] = [];
  const values: unknown[] = [id];

  for (const field of allowed) {
    if (!(field in fields)) continue;
    let val: unknown = fields[field];
    if (field === "likelihood" || field === "impact") val = toNum(val);
    else if (field === "project_revision") val = Boolean(val);
    else val = val || null;
    values.push(val);
    updates.push(`${field} = $${values.length}`);
  }

  const hasCategories = "risk_category" in fields;
  if (updates.length === 0 && !hasCategories) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    if (updates.length > 0) {
      await query(
        `UPDATE reporting_platform.risk_management SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`,
        values
      );
    }
    if (hasCategories) {
      await syncCategories(Number(id), normalizeCategories(fields.risk_category));
    }
    return NextResponse.json(await fetchRisk(Number(id)));
  } catch (err) {
    console.error("PATCH /api/risk error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.risk_management WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/risk error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
