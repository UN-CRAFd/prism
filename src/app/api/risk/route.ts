import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  try {
    if (reportId) {
      const rows = await query(
        `SELECT * FROM reporting_platform.risk_management WHERE report_id = $1 ORDER BY id`,
        [reportId]
      );
      return NextResponse.json(rows);
    }
    const rows = await query(`
      SELECT
        rm.*,
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

  const { reportId, risk_name, risk_category } = body;
  if (!reportId || !risk_name) {
    return NextResponse.json({ error: "reportId and risk_name required" }, { status: 400 });
  }

  const categories = Array.isArray(risk_category)
    ? risk_category
    : typeof risk_category === "string" && risk_category.trim()
      ? risk_category.split(",").map((c: string) => c.trim()).filter(Boolean)
      : null;

  try {
    const rows = await query(
      `INSERT INTO reporting_platform.risk_management (report_id, risk_name, risk_category)
       VALUES ($1, $2, $3) RETURNING *`,
      [reportId, risk_name, categories]
    );
    return NextResponse.json(rows[0], { status: 201 });
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

  const toCategories = (v: unknown) => {
    if (Array.isArray(v)) return v.length ? v : null;
    if (typeof v === "string" && v.trim()) return v.split(",").map((c: string) => c.trim()).filter(Boolean);
    return null;
  };

  const allowed = ["risk_name", "risk_category", "likelihood", "impact", "approved_mitigation", "updated_mitigation", "project_revision"] as const;
  const updates: string[] = [];
  const values: unknown[] = [id];

  for (const field of allowed) {
    if (!(field in fields)) continue;
    let val: unknown = fields[field];
    if (field === "likelihood" || field === "impact") val = toNum(val);
    else if (field === "risk_category") val = toCategories(val);
    else if (field === "project_revision") val = Boolean(val);
    else val = val || null;
    values.push(val);
    updates.push(`${field} = $${values.length}`);
  }

  if (updates.length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  try {
    const rows = await query(
      `UPDATE reporting_platform.risk_management SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      values
    );
    return NextResponse.json(rows[0]);
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
