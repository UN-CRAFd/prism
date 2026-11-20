import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import type { PoolClient } from "pg";
import { requireSession, requireAdmin, guardReport, guardRow } from "@/lib/authz";
import { logger } from "@/lib/logger";

// Per-report transfer lines. Keyed by reportId for consistency with every other
// section route. Each row joins its master transfer partner for display fields.
//
//   GET    ?reportId=X            → lines for a report (with org name/website/type)
//   GET    ?reportId=X&matrix=1   → pivot each transfer partner across every year
//                                   of the project (+ the project's workplan
//                                   activities for the linked-activity dropdown)
//   POST   { reportId, transfer_partner_id, amount_transferred?, linked_activity_ids? }
//   PATCH  { id, amount_transferred?, linked_activity_ids? }
//   DELETE ?id=X

// A transfer can link to SEVERAL workplan activities (like complementary funding).
// The links live in the transfer_data_activities junction table; the API exposes
// them as a `linked_activity_ids` integer array (empty array when none).
const ACTIVITY_IDS_AGG = `
  COALESCE(
    (SELECT jsonb_agg(tda.activity_id ORDER BY tda.activity_id)
       FROM reporting_platform.transfer_data_activities tda
      WHERE tda.transfer_data_id = d.id),
    '[]'::jsonb
  ) AS linked_activity_ids`;

const SELECT_WITH_PARTNER = `
  SELECT d.id, d.report_id, d.transfer_partner_id,
         d.amount_transferred, ${ACTIVITY_IDS_AGG}, d.sort_order,
         tp.organization_name, tp.website, tp.partner_type
    FROM reporting_platform.transfer_data d
    JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id`;

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

// Replace a transfer's linked activities with `ids`, keeping only ids that resolve
// to a real workplan activity (the FK would otherwise abort the txn).
async function syncActivities(client: PoolClient, dataId: number, ids: number[]) {
  await client.query(
    `DELETE FROM reporting_platform.transfer_data_activities WHERE transfer_data_id = $1`,
    [dataId]
  );
  if (ids.length) {
    await client.query(
      `INSERT INTO reporting_platform.transfer_data_activities (transfer_data_id, activity_id)
       SELECT $1, x FROM unnest($2::int[]) AS x
       JOIN reporting_platform.workplan_activities wa ON wa.id = x
       ON CONFLICT DO NOTHING`,
      [dataId, ids]
    );
  }
}

// Flat cross-report listing (admin "Full Data" view): one row per transfer line
// per report, with the receiving org + linked activities + project/partner joined.
// `linked_activities` aggregates the linked workplan activities into a readable
// label string (same as the complementary listing).
const SELECT_ALL = `
  SELECT d.id, d.report_id, d.transfer_partner_id,
         d.amount_transferred, ${ACTIVITY_IDS_AGG}, d.sort_order,
         tp.organization_name, tp.website, tp.partner_type,
         (SELECT string_agg(COALESCE(a.activity_num, a.activity_text), ', ' ORDER BY a.sort_order)
            FROM reporting_platform.transfer_data_activities tda
            JOIN reporting_platform.workplan_activities a ON a.id = tda.activity_id
           WHERE tda.transfer_data_id = d.id) AS linked_activities,
         r.year, r.report_type,
         p.project_title, p.short_name AS project_short_name,
         pt.short_name AS partner_short_name, pt.long_name AS partner_long_name
    FROM reporting_platform.transfer_data d
    JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
    JOIN reporting_platform.reports  r  ON r.id  = d.report_id
    JOIN reporting_platform.projects p  ON p.id  = r.project_id
    JOIN reporting_platform.partners pt ON pt.id = p.partner_id
   WHERE r.data_type = 'report'
   ORDER BY r.year DESC, pt.short_name, p.project_title, d.sort_order ASC, d.id ASC`;

export async function GET(req: NextRequest) {
  const session = await requireSession();
  if (session instanceof NextResponse) return session;

  const reportId = req.nextUrl.searchParams.get("reportId");
  const matrix = req.nextUrl.searchParams.get("matrix");
  if (!reportId) {
    const gate = await requireAdmin();
    if (gate instanceof NextResponse) return gate;
    try {
      return NextResponse.json(await query(SELECT_ALL));
    } catch (err) {
      logger.error("GET /api/transfer-data (all) error:", err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
    }
  }

  const gate = await guardReport(session, reportId);
  if (gate) return gate;

  if (matrix) {
    try {
      return await getMatrix(reportId);
    } catch (err) {
      logger.error("GET /api/transfer-data (matrix) error:", err);
      return NextResponse.json({ error: "Request failed" }, { status: 500 });
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
    logger.error("GET /api/transfer-data error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}

type MatrixRawRow = {
  id: number;
  report_id: number;
  transfer_partner_id: number;
  amount_transferred: string | null;
  linked_activity_ids: number[] | null;
  sort_order: number;
  master_sort: number;
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

  // Every transfer line across the whole project, all years — so an organisation
  // entered in any report shows in every year's matrix (prior years read-only).
  const rows = await query<MatrixRawRow>(
    `SELECT d.id, d.report_id, d.transfer_partner_id,
            d.amount_transferred, ${ACTIVITY_IDS_AGG}, d.sort_order,
            tp.sort_order AS master_sort,
            r.year AS report_year, (r.id = $2) AS is_current,
            tp.organization_name, tp.website, tp.partner_type
       FROM reporting_platform.transfer_data d
       JOIN reporting_platform.reports r ON r.id = d.report_id
       JOIN reporting_platform.transfer_partners tp ON tp.id = d.transfer_partner_id
      WHERE r.project_id = $1
      ORDER BY r.year ASC`,
    [projectId, reportId]
  );

  // One skeleton row per project organisation that has data in ANY year, ordered
  // by the project-level (master) order so rows stay put across years. The current
  // report may not have a line yet → currentLineId is null (created on first edit).
  const byPartner = new Map<number, Record<string, unknown>>();
  for (const r of [...rows].sort((a, b) => a.master_sort - b.master_sort)) {
    if (byPartner.has(r.transfer_partner_id)) continue;
    byPartner.set(r.transfer_partner_id, {
      transfer_partner_id: r.transfer_partner_id,
      organization_name: r.organization_name,
      website: r.website,
      partner_type: r.partner_type,
      currentLineId: null,
      byYear: {} as Record<number, unknown>,
    });
  }

  const yearsSet = new Set<number>();
  for (const r of rows) {
    yearsSet.add(r.report_year);
    const row = byPartner.get(r.transfer_partner_id);
    if (!row) continue;
    if (r.is_current) row.currentLineId = r.id;
    (row.byYear as Record<number, unknown>)[r.report_year] = {
      id: r.id,
      report_id: r.report_id,
      amount_transferred: r.amount_transferred,
      linked_activity_ids: r.linked_activity_ids ?? [],
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

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
  if (gate) return gate;

  // The referenced transfer partner must belong to this report's own project;
  // otherwise a caller could link (and read back) another project's partner.
  const scoped = await query(
    `SELECT 1
       FROM reporting_platform.transfer_partners tp
       JOIN reporting_platform.reports r ON r.project_id = tp.project_id
      WHERE tp.id = $1 AND r.id = $2
      LIMIT 1`,
    [transfer_partner_id, reportId]
  );
  if (!scoped.length) {
    return NextResponse.json(
      { error: "transfer_partner_id does not belong to this report's project" },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const existing = await client.query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM reporting_platform.transfer_data WHERE report_id = $1`,
      [reportId]
    );
    const nextOrder = Number(existing.rows[0].count) + 1;

    const inserted = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.transfer_data
         (report_id, transfer_partner_id, amount_transferred, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [reportId, transfer_partner_id, toAmount(body.amount_transferred), nextOrder]
    );
    await syncActivities(client, inserted.rows[0].id, toActivityIds(body.linked_activity_ids));

    // A row now exists, so any "No transfers to report" confirmation no longer applies.
    await client.query(
      `UPDATE reporting_platform.reports SET no_transfers_confirmed = FALSE WHERE id = $1 AND no_transfers_confirmed`,
      [reportId]
    );

    await client.query("COMMIT");

    const rows = await query(`${SELECT_WITH_PARTNER} WHERE d.id = $1`, [inserted.rows[0].id]);
    return NextResponse.json(rows[0], { status: 201 });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/transfer-data error:", err);
    if (String(err).includes("duplicate key")) {
      return NextResponse.json({ error: "This organization is already on the report" }, { status: 409 });
    }
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
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

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "transfer_data", id as string | number, { requireOpen: true });
  if (gate) return gate;

  const hasAmount = "amount_transferred" in body;
  const hasActivities = "linked_activity_ids" in body;
  if (!hasAmount && !hasActivities) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (hasAmount) {
      await client.query(
        `UPDATE reporting_platform.transfer_data
            SET amount_transferred = $2, updated_at = NOW()
          WHERE id = $1`,
        [id, toAmount(body.amount_transferred)]
      );
    }
    if (hasActivities) {
      await syncActivities(client, Number(id), toActivityIds(body.linked_activity_ids));
      // Touch updated_at even when only the activity links changed.
      if (!hasAmount) {
        await client.query(
          `UPDATE reporting_platform.transfer_data SET updated_at = NOW() WHERE id = $1`,
          [id]
        );
      }
    }

    await client.query("COMMIT");

    const rows = await query(`${SELECT_WITH_PARTNER} WHERE d.id = $1`, [id]);
    if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("PATCH /api/transfer-data error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  const gate = await guardRow(session, "transfer_data", id, { requireOpen: true });
  if (gate) return gate;

  try {
    await query(`DELETE FROM reporting_platform.transfer_data WHERE id = $1`, [id]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    logger.error("DELETE /api/transfer-data error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
