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

// origin_year: the year of the report where this risk was first added.
// NULL when the origin is the ProDoc (not a report year).
const ORIGIN_YEAR_EXPR = `
  CASE WHEN orig_r.data_type = 'prodoc' THEN NULL ELSE orig_r.year END AS origin_year`;

const ORIGIN_JOIN = `
  LEFT JOIN reporting_platform.risk_management orig ON orig.id = rm.origin_risk_id
  LEFT JOIN reporting_platform.reports orig_r ON orig_r.id = orig.report_id`;

const RISK_STATUSES = ["unchanged", "changed", "happened"];

// The assessment "has not changed" carries forward: for each of likelihood / impact, the
// value from the most recent EARLIER report of the same project that has one for this
// risk (matched by origin_risk_id), otherwise the ProDoc baseline value. Looks at every
// earlier report year, whether or not the admin has shared it with the partner.
async function latestPreviousAssessment(
  projectId: number,
  year: number,
  originRiskId: number | null
): Promise<{ likelihood: number | null; impact: number | null }> {
  if (originRiskId === null) return { likelihood: null, impact: null };
  const latest = async (col: "updated_likelihood" | "updated_impact") => {
    const rows = await query<{ v: number | null }>(
      `SELECT rm.${col} AS v
         FROM reporting_platform.risk_management rm
         JOIN reporting_platform.reports r ON r.id = rm.report_id AND r.data_type = 'report'
        WHERE r.project_id = $1 AND r.year < $2 AND rm.origin_risk_id = $3 AND rm.${col} IS NOT NULL
        ORDER BY r.year DESC, r.id DESC
        LIMIT 1`,
      [projectId, year, originRiskId]
    );
    return rows.length ? rows[0].v : null;
  };
  const [l, i] = await Promise.all([latest("updated_likelihood"), latest("updated_impact")]);
  if (l !== null && i !== null) return { likelihood: l, impact: i };
  const base = await query<{ likelihood: number | null; impact: number | null }>(
    `SELECT rm.likelihood, rm.impact
       FROM reporting_platform.risk_management rm
       JOIN reporting_platform.reports pd ON pd.id = rm.report_id AND pd.data_type = 'prodoc'
      WHERE pd.project_id = $1 AND rm.origin_risk_id = $2
      LIMIT 1`,
    [projectId, originRiskId]
  );
  return { likelihood: l ?? base[0]?.likelihood ?? null, impact: i ?? base[0]?.impact ?? null };
}

async function fetchRisk(id: number) {
  const rows = await query(
    `SELECT rm.*, ${CATEGORY_AGG}, ${ORIGIN_YEAR_EXPR}
       FROM reporting_platform.risk_management rm ${ORIGIN_JOIN}
      WHERE rm.id = $1`,
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
      // previous_likelihood / previous_impact: for carried-over risks (source_risk_id NOT
      // NULL), the latest PREVIOUS assessment — the most recent earlier report of the
      // project (data_type 'report', year < this one) with a value for the risk's
      // origin_risk_id, else the ProDoc value; NULL for risks added in this report. Same
      // logic as latestPreviousAssessment, computed for every risk in this one query.
      const rows = await query(
        `SELECT rm.*, ${CATEGORY_AGG}, ${ORIGIN_YEAR_EXPR},
                CASE WHEN rm.source_risk_id IS NULL THEN NULL
                     ELSE COALESCE(pl.v, pdb.likelihood) END AS previous_likelihood,
                CASE WHEN rm.source_risk_id IS NULL THEN NULL
                     ELSE COALESCE(pi.v, pdb.impact) END     AS previous_impact
           FROM reporting_platform.risk_management rm ${ORIGIN_JOIN}
           JOIN reporting_platform.reports cur ON cur.id = rm.report_id
           LEFT JOIN LATERAL (
             SELECT rm2.updated_likelihood AS v
               FROM reporting_platform.risk_management rm2
               JOIN reporting_platform.reports r2 ON r2.id = rm2.report_id AND r2.data_type = 'report'
              WHERE r2.project_id = cur.project_id AND r2.year < cur.year
                AND rm2.origin_risk_id = rm.origin_risk_id AND rm2.updated_likelihood IS NOT NULL
              ORDER BY r2.year DESC, r2.id DESC LIMIT 1
           ) pl ON TRUE
           LEFT JOIN LATERAL (
             SELECT rm2.updated_impact AS v
               FROM reporting_platform.risk_management rm2
               JOIN reporting_platform.reports r2 ON r2.id = rm2.report_id AND r2.data_type = 'report'
              WHERE r2.project_id = cur.project_id AND r2.year < cur.year
                AND rm2.origin_risk_id = rm.origin_risk_id AND rm2.updated_impact IS NOT NULL
              ORDER BY r2.year DESC, r2.id DESC LIMIT 1
           ) pi ON TRUE
           LEFT JOIN LATERAL (
             SELECT pdm.likelihood, pdm.impact
               FROM reporting_platform.risk_management pdm
               JOIN reporting_platform.reports pd ON pd.id = pdm.report_id AND pd.data_type = 'prodoc'
              WHERE pd.project_id = cur.project_id AND pdm.origin_risk_id = rm.origin_risk_id
              LIMIT 1
           ) pdb ON TRUE
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

  const { reportId, risk_name, risk_description, risk_category, approved_mitigation, likelihood, impact } = body;
  if (!reportId || !risk_name) {
    return badRequest("reportId and risk_name required");
  }

  const gate = await guardReport(session, reportId as string | number, { requireOpen: true });
  if (gate) return gate;

  const categories = normalizeCategories(risk_category);
  const lh = toNumber(likelihood);
  const imp = toNumber(impact);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const rows = await client.query<{ id: number }>(
      `INSERT INTO reporting_platform.risk_management (report_id, risk_name, risk_description, likelihood, impact, approved_mitigation)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [reportId, risk_name, (risk_description as string) || null, lh, imp, (approved_mitigation as string) || null]
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

  const isAdmin = session.role === "admin";
  if (!isAdmin) {
    // Enforce per-report field restrictions based on whether the risk originated
    // from the ProDoc (source_risk_id NOT NULL = "old") or was added during
    // reporting (source_risk_id NULL = "new"). ProDoc risks are unrestricted.
    const meta = await query<{ data_type: string; source_risk_id: number | null }>(
      `SELECT r.data_type, rm.source_risk_id
         FROM reporting_platform.risk_management rm
         JOIN reporting_platform.reports r ON r.id = rm.report_id
        WHERE rm.id = $1`,
      [id]
    );
    if (meta.length && meta[0].data_type !== "prodoc") {
      const isOld = meta[0].source_risk_id !== null;
      const locked = isOld
        ? ["risk_name", "risk_description", "risk_category", "approved_mitigation", "likelihood", "impact"]
        : ["approved_mitigation", "likelihood", "impact"];
      if (locked.some((f) => f in fields)) {
        return NextResponse.json(
          { error: "This risk comes from the project document and can't be changed here." },
          { status: 403 }
        );
      }
    }
  }

  // risk_status (carried-over risks only): what happened since the last report.
  // Choosing 'unchanged' copies the latest previous likelihood / impact SERVER-SIDE and
  // clears the updated mitigation — the client's own values for those three fields are
  // ignored (overwritten below), so autosave can't replace the copy with stale values.
  if ("risk_status" in fields) {
    const rs = fields.risk_status;
    if (rs !== null && rs !== "" && !RISK_STATUSES.includes(rs as string)) {
      return badRequest("risk_status must be 'unchanged', 'changed', 'happened' or null");
    }
    if (rs) {
      const info = await query<{ source_risk_id: number | null; origin_risk_id: number | null; project_id: number; year: number }>(
        `SELECT rm.source_risk_id, rm.origin_risk_id, r.project_id, r.year
           FROM reporting_platform.risk_management rm
           JOIN reporting_platform.reports r ON r.id = rm.report_id
          WHERE rm.id = $1`,
        [id]
      );
      if (!info.length) return NextResponse.json({ error: "Risk not found" }, { status: 404 });
      if (info[0].source_risk_id === null) {
        return badRequest("Only risks carried over from earlier reports have a status");
      }
      if (rs === "unchanged") {
        const prev = await latestPreviousAssessment(info[0].project_id, info[0].year, info[0].origin_risk_id);
        fields.updated_likelihood = prev.likelihood;
        fields.updated_impact = prev.impact;
        fields.updated_mitigation = null;
      }
    }
  }

  // risk_category lives in the junction table, not on risk_management.
  const allowed = ["risk_name", "risk_description", "likelihood", "impact", "approved_mitigation", "updated_mitigation", "updated_likelihood", "updated_impact", "project_revision", "risk_status"] as const;
  const updates: string[] = [];
  const values: unknown[] = [id];

  for (const field of allowed) {
    if (!(field in fields)) continue;
    let val: unknown = fields[field];
    if (field === "likelihood" || field === "impact" || field === "updated_likelihood" || field === "updated_impact") val = toNumber(val);
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

  if (session.role !== "admin") {
    const meta = await query<{ data_type: string; source_risk_id: number | null }>(
      `SELECT r.data_type, rm.source_risk_id
         FROM reporting_platform.risk_management rm
         JOIN reporting_platform.reports r ON r.id = rm.report_id
        WHERE rm.id = $1`,
      [id]
    );
    if (meta.length && meta[0].data_type !== "prodoc" && meta[0].source_risk_id !== null) {
      return NextResponse.json(
        { error: "This risk comes from the project document and can't be changed here." },
        { status: 403 }
      );
    }
  }

  try {
    // risk_categories cascade-delete via FK.
    await query(`DELETE FROM reporting_platform.risk_management WHERE id = $1`, [id]);
    return deleted();
  } catch (err) {
    logger.error("DELETE /api/risk error:", err);
    return serverError();
  }
}
