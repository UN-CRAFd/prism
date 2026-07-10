import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Per-report indicator lines. Keyed by reportId for consistency with every other
// section route. Each row joins its master indicator for display fields.
//
//   GET    ?reportId=X  → lines for a report (with indicator name/description/…)
//   POST   { reportId, indicator_id, baseline_value, baseline_year, target_value, target_year }  (admin scaffold)
//   PATCH  { id, ...fields }  (admin: baseline/target; partner: achieved_value/status/comment)
//   DELETE ?id=X

const SELECT_WITH_INDICATOR = `
  SELECT d.id, d.report_id, d.indicator_id,
         d.baseline_value, d.baseline_year, d.target_value, d.target_year,
         d.achieved_value, d.status, d.comment, d.sort_order,
         i.name AS indicator_name,
         i.description AS indicator_description,
         i.means_of_verification,
         i.category,
         i.cycle,
         i.is_standard
    FROM reporting_platform.indicator_data d
    JOIN reporting_platform.indicators i ON i.id = d.indicator_id`;

const toYear = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const matrix = req.nextUrl.searchParams.get("matrix");
  if (!reportId) {
    return NextResponse.json({ error: "reportId is required" }, { status: 400 });
  }

  // Matrix view (partner report): pivot each indicator on the current report across
  // every year of the same project, so previous/later reports for that exact
  // indicator show alongside the current one.
  if (matrix) {
    try {
      return await getMatrix(reportId);
    } catch (err) {
      console.error("GET /api/indicator-data (matrix) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  try {
    const rows = await query(
      `${SELECT_WITH_INDICATOR}
        WHERE d.report_id = $1
        ORDER BY d.sort_order ASC, d.id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/indicator-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

type MatrixRawRow = {
  id: number;
  report_id: number;
  indicator_id: number;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
  sort_order: number;
  report_year: number;
  is_current: boolean;
  indicator_name: string;
  indicator_description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
};

async function getMatrix(reportId: string) {
  const meta = await query<{ project_id: number; year: number }>(
    `SELECT project_id, year FROM reporting_platform.reports WHERE id = $1`,
    [reportId]
  );
  if (meta.length === 0) {
    return NextResponse.json({ years: [], currentYear: null, rows: [] });
  }
  const { project_id: projectId, year: currentYear } = meta[0];

  const rows = await query<MatrixRawRow>(
    `SELECT d.id, d.report_id, d.indicator_id,
            d.baseline_value, d.baseline_year, d.target_value, d.target_year,
            d.achieved_value, d.status, d.comment, d.sort_order,
            r.year AS report_year, (r.id = $2) AS is_current,
            i.name AS indicator_name, i.description AS indicator_description,
            i.means_of_verification, i.category, i.cycle
       FROM reporting_platform.indicator_data d
       JOIN reporting_platform.reports r ON r.id = d.report_id
       JOIN reporting_platform.indicators i ON i.id = d.indicator_id
      WHERE r.project_id = $1
        AND d.indicator_id IN (
          SELECT indicator_id FROM reporting_platform.indicator_data WHERE report_id = $2
        )
      ORDER BY r.year ASC`,
    [projectId, reportId]
  );

  // Row skeleton + order come from the current report's lines.
  const byIndicator = new Map<number, Record<string, unknown>>();
  for (const r of rows.filter((r) => r.is_current).sort((a, b) => a.sort_order - b.sort_order)) {
    byIndicator.set(r.indicator_id, {
      indicator_id: r.indicator_id,
      indicator_name: r.indicator_name,
      indicator_description: r.indicator_description,
      means_of_verification: r.means_of_verification,
      category: r.category,
      cycle: r.cycle,
      baseline_value: r.baseline_value,
      baseline_year: r.baseline_year,
      target_value: r.target_value,
      target_year: r.target_year,
      currentLineId: r.id,
      byYear: {} as Record<number, unknown>,
    });
  }

  const yearsSet = new Set<number>();
  for (const r of rows) {
    yearsSet.add(r.report_year);
    const row = byIndicator.get(r.indicator_id);
    if (!row) continue;
    (row.byYear as Record<number, unknown>)[r.report_year] = {
      id: r.id,
      report_id: r.report_id,
      achieved_value: r.achieved_value,
      status: r.status,
      comment: r.comment,
    };
  }

  const years = [...yearsSet].sort((a, b) => a - b);
  return NextResponse.json({ years, currentYear, rows: [...byIndicator.values()] });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, indicator_id } = body;
  if (!reportId || !indicator_id) {
    return NextResponse.json({ error: "reportId and indicator_id are required" }, { status: 400 });
  }

  try {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.indicator_data WHERE report_id = $1`,
      [reportId]
    );
    const nextOrder = Number(existing[0].count) + 1;

    const inserted = await query<{ id: number }>(
      `INSERT INTO reporting_platform.indicator_data
         (report_id, indicator_id, baseline_value, baseline_year, target_value, target_year, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        reportId,
        indicator_id,
        body.baseline_value || null,
        toYear(body.baseline_year),
        body.target_value || null,
        toYear(body.target_year),
        nextOrder,
      ]
    );

    // Return the row joined with its indicator so the client can render immediately.
    const rows = await query(`${SELECT_WITH_INDICATOR} WHERE d.id = $1`, [inserted[0].id]);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/indicator-data error:", err);
    const msg = String(err);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "This indicator is already on the report" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id, ...fields } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const allowed = [
    "baseline_value", "baseline_year", "target_value", "target_year",
    "achieved_value", "status", "comment",
  ] as const;

  const updates: string[] = [];
  const values: unknown[] = [id];

  for (const field of allowed) {
    if (!(field in fields)) continue;
    let val: unknown = fields[field];
    if (field === "baseline_year" || field === "target_year") val = toYear(val);
    else val = val || null;
    values.push(val);
    updates.push(`${field} = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    await query(
      `UPDATE reporting_platform.indicator_data SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`,
      values
    );
    const rows = await query(`${SELECT_WITH_INDICATOR} WHERE d.id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/indicator-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.indicator_data WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/indicator-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
