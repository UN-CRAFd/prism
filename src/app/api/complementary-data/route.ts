import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import type { PoolClient } from "pg";

// Per-report complementary funding lines. Sibling of transfer-data, but a single
// contribution can link to SEVERAL workplan activities. Those links live in the
// complementary_data_activities junction table (real FKs); the API still exposes
// them to the client as a `linked_activity_ids` integer array for compatibility.
//
//   GET    ?reportId=X            → lines for a report (with contributor fields)
//   GET    ?reportId=X&matrix=1   → pivot each contributor across every year of
//                                   the project (+ the project's workplan activities)
//   POST   { reportId, contributor_id, contribution_amount?, linked_activity_ids? }
//   PATCH  { id, contribution_amount?, linked_activity_ids? }
//   DELETE ?id=X

// Aggregates the junction rows for a complementary_data row `d` back into the
// `linked_activity_ids` int array the client expects (empty array when none).
const ACTIVITY_IDS_AGG = `
  COALESCE(
    (SELECT jsonb_agg(cda.activity_id ORDER BY cda.activity_id)
       FROM reporting_platform.complementary_data_activities cda
      WHERE cda.complementary_data_id = d.id),
    '[]'::jsonb
  ) AS linked_activity_ids`;

const SELECT_WITH_CONTRIBUTOR = `
  SELECT d.id, d.report_id, d.contributor_id,
         d.contribution_amount, ${ACTIVITY_IDS_AGG}, d.sort_order,
         c.contributor_name, c.website, c.funding_type
    FROM reporting_platform.complementary_data d
    JOIN reporting_platform.complementary_contributors c ON c.id = d.contributor_id`;

const toAmount = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

function toActivityIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = Number(x);
    if (Number.isInteger(n)) out.push(n);
  }
  return out;
}

// Replace a contribution's linked activities with `ids`, keeping only ids that
// resolve to a real workplan activity (the FK would otherwise abort the txn).
async function syncActivities(client: PoolClient, dataId: number, ids: number[]) {
  await client.query(
    `DELETE FROM reporting_platform.complementary_data_activities WHERE complementary_data_id = $1`,
    [dataId]
  );
  if (ids.length) {
    await client.query(
      `INSERT INTO reporting_platform.complementary_data_activities (complementary_data_id, activity_id)
       SELECT $1, x FROM unnest($2::int[]) AS x
       JOIN reporting_platform.workplan_activities wa ON wa.id = x
       ON CONFLICT DO NOTHING`,
      [dataId, ids]
    );
  }
}

// Flat cross-report listing (admin "Full Data" view): one row per contribution
// line per report. `linked_activities` aggregates the linked workplan activities
// into a readable label string; project/partner context is joined in.
const SELECT_ALL = `
  SELECT d.id, d.report_id, d.contributor_id,
         d.contribution_amount, ${ACTIVITY_IDS_AGG}, d.sort_order,
         c.contributor_name, c.website, c.funding_type,
         (SELECT string_agg(COALESCE(a.activity_num, a.activity_text), ', ' ORDER BY a.sort_order)
            FROM reporting_platform.complementary_data_activities cda
            JOIN reporting_platform.workplan_activities a ON a.id = cda.activity_id
           WHERE cda.complementary_data_id = d.id) AS linked_activities,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.complementary_data d
    JOIN reporting_platform.complementary_contributors c ON c.id = d.contributor_id
    JOIN reporting_platform.reports  r  ON r.id  = d.report_id
    JOIN reporting_platform.projects p  ON p.id  = r.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
   WHERE r.data_type = 'report'
   ORDER BY r.year DESC, pt.short_name, p.project_title, d.sort_order ASC, d.id ASC`;

export async function GET(req: NextRequest) {
  const reportId = req.nextUrl.searchParams.get("reportId");
  const matrix = req.nextUrl.searchParams.get("matrix");
  if (!reportId) {
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      console.error("GET /api/complementary-data (all) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  if (matrix) {
    try {
      return await getMatrix(reportId);
    } catch (err) {
      console.error("GET /api/complementary-data (matrix) error:", err);
      return NextResponse.json({ error: String(err) }, { status: 500 });
    }
  }

  try {
    const rows = await query(
      `${SELECT_WITH_CONTRIBUTOR}
        WHERE d.report_id = $1
        ORDER BY d.sort_order ASC, d.id ASC`,
      [reportId]
    );
    return NextResponse.json(rows);
  } catch (err) {
    console.error("GET /api/complementary-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

type MatrixRawRow = {
  id: number;
  report_id: number;
  contributor_id: number;
  contribution_amount: string | null;
  linked_activity_ids: number[] | null;
  sort_order: number;
  report_year: number;
  is_current: boolean;
  contributor_name: string | null;
  website: string | null;
  funding_type: string | null;
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
    `SELECT d.id, d.report_id, d.contributor_id,
            d.contribution_amount, ${ACTIVITY_IDS_AGG}, d.sort_order,
            r.year AS report_year, (r.id = $2) AS is_current,
            c.contributor_name, c.website, c.funding_type
       FROM reporting_platform.complementary_data d
       JOIN reporting_platform.reports r ON r.id = d.report_id
       JOIN reporting_platform.complementary_contributors c ON c.id = d.contributor_id
      WHERE r.project_id = $1
        AND d.contributor_id IN (
          SELECT contributor_id FROM reporting_platform.complementary_data WHERE report_id = $2
        )
      ORDER BY r.year ASC`,
    [projectId, reportId]
  );

  // Row skeleton + order come from the current report's lines.
  const byContributor = new Map<number, Record<string, unknown>>();
  for (const r of rows.filter((r) => r.is_current).sort((a, b) => a.sort_order - b.sort_order)) {
    byContributor.set(r.contributor_id, {
      contributor_id: r.contributor_id,
      contributor_name: r.contributor_name,
      website: r.website,
      funding_type: r.funding_type,
      currentLineId: r.id,
      byYear: {} as Record<number, unknown>,
    });
  }

  const yearsSet = new Set<number>();
  for (const r of rows) {
    yearsSet.add(r.report_year);
    const row = byContributor.get(r.contributor_id);
    if (!row) continue;
    (row.byYear as Record<number, unknown>)[r.report_year] = {
      id: r.id,
      report_id: r.report_id,
      contribution_amount: r.contribution_amount,
      linked_activity_ids: r.linked_activity_ids ?? [],
    };
  }

  const activities = await query(
    `SELECT id, activity_num, activity_text, objective_num, objective_text, sort_order
       FROM reporting_platform.workplan_activities
      WHERE project_id = $1
      ORDER BY sort_order ASC, id ASC`,
    [projectId]
  );

  const years = [...yearsSet].sort((a, b) => a - b);
  return NextResponse.json({ years, currentYear, rows: [...byContributor.values()], activities });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { reportId, contributor_id } = body;
  if (!reportId || !contributor_id) {
    return NextResponse.json({ error: "reportId and contributor_id are required" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.complementary_data WHERE report_id = $1`,
      [reportId]
    );
    const nextOrder = Number(existing.rows[0].count) + 1;

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.complementary_data
         (report_id, contributor_id, contribution_amount, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [reportId, contributor_id, toAmount(body.contribution_amount), nextOrder]
    );
    await syncActivities(client, inserted.rows[0].id, toActivityIds(body.linked_activity_ids));

    await client.query("COMMIT");

    const rows = await query(`${SELECT_WITH_CONTRIBUTOR} WHERE d.id = $1`, [inserted.rows[0].id]);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("POST /api/complementary-data error:", err);
    const msg = String(err);
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: "This contributor is already on the report" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function PATCH(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { id } = body;
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const hasAmount = "contribution_amount" in body;
  const hasActivities = "linked_activity_ids" in body;
  if (!hasAmount && !hasActivities) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (hasAmount) {
      await client.query(
        `UPDATE reporting_platform.complementary_data
            SET contribution_amount = $2, updated_at = NOW()
          WHERE id = $1`,
        [id, toAmount(body.contribution_amount)]
      );
    }
    if (hasActivities) {
      await syncActivities(client, Number(id), toActivityIds(body.linked_activity_ids));
      // Touch updated_at even when only the activity links changed.
      if (!hasAmount) {
        await client.query(
          `UPDATE reporting_platform.complementary_data SET updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }

    await client.query("COMMIT");

    const rows = await query(`${SELECT_WITH_CONTRIBUTOR} WHERE d.id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("PATCH /api/complementary-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  try {
    await query(`DELETE FROM reporting_platform.complementary_data WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/complementary-data error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
