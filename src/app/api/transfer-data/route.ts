import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

// Per-report transfer lines. Keyed by reportId for consistency with every other
// section route. Each row joins its master transfer partner for display fields.
//
//   GET    ?reportId=X            → lines for a report (with org name/website/type)
//   GET    ?reportId=X&matrix=1   → pivot each transfer partner across every year
//                                   of the project (+ the project's workplan
//                                   activities for the linked-activity dropdown)
//   POST   { reportId, transfer_partner_id, amount_transferred?, linked_activity_id? }
//   PATCH  { id, amount_transferred?, linked_activity_id? }
//   DELETE ?id=X

const SELECT_WITH_PARTNER = `
  SELECT d.id, d.report_id, d.transfer_partner_id,
         d.amount_transferred, d.linked_activity_id, d.sort_order,
         tp.organization_name, tp.website, tp.partner_type
    FROM reporting_platform.transfer_data d
    JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id`;

const toAmount = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

const toActivityId = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};

// Flat cross-report listing (admin "Full Data" view): one row per transfer line
// per report, with the receiving org + linked activity + project/partner joined.
const SELECT_ALL = `
  SELECT d.id, d.report_id, d.transfer_partner_id,
         d.amount_transferred, d.linked_activity_id, d.sort_order,
         tp.organization_name, tp.website, tp.partner_type,
         a.activity_num AS linked_activity_num, a.activity_text AS linked_activity_text,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.transfer_data d
    JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
    JOIN reporting_platform.reports  r  ON r.id  = d.report_id
    JOIN reporting_platform.projects p  ON p.id  = r.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
    LEFT JOIN reporting_platform.workplan_activities a ON a.id = d.linked_activity_id
   WHERE r.data_type = 'report'
   ORDER BY r.year DESC, pt.short_name, p.project_title, d.sort_order ASC, d.id ASC`;

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const matrix = req.nextUrl.searchParams.get("matrix");
  if (!reportId) {
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      console.error("GET /api/transfer-data (all) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  if (matrix) {
    try {
      return await getMatrix(reportId);
    } catch (err) {
      console.error("GET /api/transfer-data (matrix) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  try {
    const rows = await query(
      `${SELECT_WITH_PARTNER}
        WHERE d.report_id = $1
        ORDER BY d.sort_order ASC, d.id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/transfer-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

type MatrixRawRow = {
  id: number;
  report_id: number;
  transfer_partner_id: number;
  amount_transferred: string | null;
  linked_activity_id: number | null;
  sort_order: number;
  report_year: number;
  is_current: boolean;
  organization_name: string | null;
  website: string | null;
  partner_type: string | null;
};

async function getMatrix(reportId: string) {
  const meta = await query<{ project_id: number; year: number }>(
    `SELECT project_id, year FROM reporting_platform.reports WHERE id = $1`,
    [reportId]
  );
  if (meta.length === 0) {
    return NextResponse.json({ years: [], currentYear: null, rows: [], activities: [] });
  }
  const { project_id: projectId, year: currentYear } = meta[0];

  const rows = await query<MatrixRawRow>(
    `SELECT d.id, d.report_id, d.transfer_partner_id,
            d.amount_transferred, d.linked_activity_id, d.sort_order,
            r.year AS report_year, (r.id = $2) AS is_current,
            tp.organization_name, tp.website, tp.partner_type
       FROM reporting_platform.transfer_data d
       JOIN reporting_platform.reports r ON r.id = d.report_id
       JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
      WHERE r.project_id = $1
        AND d.transfer_partner_id IN (
          SELECT transfer_partner_id FROM reporting_platform.transfer_data WHERE report_id = $2
        )
      ORDER BY r.year ASC`,
    [projectId, reportId]
  );

  // Row skeleton + order come from the current report's lines.
  const byPartner = new Map<number, Record<string, unknown>>();
  for (const r of rows.filter((r) => r.is_current).sort((a, b) => a.sort_order - b.sort_order)) {
    byPartner.set(r.transfer_partner_id, {
      transfer_partner_id: r.transfer_partner_id,
      organization_name: r.organization_name,
      website: r.website,
      partner_type: r.partner_type,
      currentLineId: r.id,
      byYear: {} as Record<number, unknown>,
    });
  }

  const yearsSet = new Set<number>();
  for (const r of rows) {
    yearsSet.add(r.report_year);
    const row = byPartner.get(r.transfer_partner_id);
    if (!row) continue;
    (row.byYear as Record<number, unknown>)[r.report_year] = {
      id: r.id,
      report_id: r.report_id,
      amount_transferred: r.amount_transferred,
      linked_activity_id: r.linked_activity_id,
    };
  }

  // Workplan activities for this project drive the linked-activity dropdown and
  // let the client label the linked activity on read-only (past-year) cells.
  const activities = await query(
    `SELECT id, activity_num, activity_text, objective_num, objective_text, sort_order
       FROM reporting_platform.workplan_activities
      WHERE project_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [projectId]
  );

  const years = [...yearsSet].sort((a, b) => a - b);
  return NextResponse.json({ years, currentYear, rows: [...byPartner.values()], activities });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, transfer_partner_id } = body;
  if (!reportId || !transfer_partner_id) {
    return NextResponse.json({ error: "reportId and transfer_partner_id are required" }, { status: 400 });
  }

  try {
    const existing = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.transfer_data WHERE report_id = $1`,
      [reportId]
    );
    const nextOrder = Number(existing[0].count) + 1;

    const inserted = await query<{ id: number }>(
      `INSERT INTO reporting_platform.transfer_data
         (report_id, transfer_partner_id, amount_transferred, linked_activity_id, sort_order)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        reportId,
        transfer_partner_id,
        toAmount(body.amount_transferred),
        toActivityId(body.linked_activity_id),
        nextOrder,
      ]
    );

    const rows = await query(`${SELECT_WITH_PARTNER} WHERE d.id = $1`, [inserted[0].id]);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    console.error("POST /api/transfer-data error:", err);
    const msg = String(err);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "This organization is already on the report" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const updates: string[] = [];
  const values: unknown[] = [id];

  if ("amount_transferred" in body) {
    values.push(toAmount(body.amount_transferred));
    updates.push(`amount_transferred = $${values.length}`);
  }
  if ("linked_activity_id" in body) {
    values.push(toActivityId(body.linked_activity_id));
    updates.push(`linked_activity_id = $${values.length}`);
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    await query(
      `UPDATE reporting_platform.transfer_data SET ${updates.join(", ")}, updated_at = NOW() WHERE id = $1`,
      values
    );
    const rows = await query(`${SELECT_WITH_PARTNER} WHERE d.id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    console.error("PATCH /api/transfer-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.transfer_data WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/transfer-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
