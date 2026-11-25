import type { PoolClient } from "pg";
import { query } from "@/lib/db";
import { workplanStatusNeedsDetail } from "@/lib/workplan";
import type { QuantApplyPayload } from "@/lib/report-import";

// ─────────────────────────────────────────────────────────────────────────────
// Report import — the quantitative sections other than indicators: risks, work
// plan, budget (expenditure), transfers to implementing partners and
// complementary funding. Server only.
//
// Writes follow the report editor's own rules (see the section API routes):
//   • Risks: report risks are seeded from the project document / earlier years
//     (source_risk_id set). The partner fills updated_likelihood / _impact /
//     _mitigation and project_revision; new risks have source_risk_id NULL (the
//     risk_set_origin trigger sets origin_risk_id). Categories in risk_categories.
//   • Work plan: entries belong to the (project, year, AR|FR) window
//     (workplan_updates); updated_quarters is kept only for Delayed / At Risk /
//     Suspended, as /api/workplan does. Activities live on the project.
//   • Budget: expenditure_entries per global category (annual_expenditure,
//     comment); indirect support costs on reports.indirect_expenditure.
//   • Transfers / complementary: organisations live on the project and are
//     reused by name; a data row per report; adding one clears the report's
//     "none this year" flag, which can also be confirmed.
// As everywhere in the importer, only empty fields are filled.
// ─────────────────────────────────────────────────────────────────────────────

export interface QuantReport {
  id: number;
  project_id: number;
  year: number;
  report_type: string | null;
}

export interface QuantContext {
  risks: {
    id: number;
    risk_name: string;
    risk_description: string | null;
    carried: boolean;
    updated_likelihood: number | null;
    updated_impact: number | null;
    updated_mitigation: string | null;
    project_revision: boolean;
  }[];
  activities: {
    id: number;
    objective_num: string | null;
    activity_num: string | null;
    activity_text: string | null;
    planned_quarters: string[];
    entry_status: string | null;
    entry_comment: string | null;
  }[];
  categories: { id: number; name: string; annual_expenditure: string | null; comment: string | null }[];
  indirect_expenditure: string | null;
  transfers: { name: string; amount: string | null }[];
  complementary: { name: string; amount: string | null }[];
  no_transfers_confirmed: boolean;
  no_complementary_confirmed: boolean;
}

const typeCode = (r: QuantReport) => (r.report_type === "final" ? "FR" : "AR");

export async function loadQuantContext(r: QuantReport): Promise<QuantContext> {
  const [risks, activities, categories, flags, transfers, complementary] = await Promise.all([
    query<QuantContext["risks"][number]>(
      `SELECT id, risk_name, risk_description, (source_risk_id IS NOT NULL) AS carried,
              updated_likelihood, updated_impact, updated_mitigation, project_revision
         FROM reporting_platform.risk_management WHERE report_id = $1 ORDER BY id`,
      [r.id]
    ),
    query<QuantContext["activities"][number]>(
      `SELECT a.id, a.objective_num, a.activity_num, a.activity_text, a.planned_quarters,
              e.status AS entry_status, e.comment AS entry_comment
         FROM reporting_platform.workplan_activities a
         LEFT JOIN reporting_platform.workplan_updates u
           ON u.project_id = a.project_id AND u.year = $2 AND u.type_code = $3
         LEFT JOIN reporting_platform.workplan_entries e
           ON e.update_id = u.id AND e.activity_id = a.id
        WHERE a.project_id = $1
        ORDER BY a.sort_order, a.id`,
      [r.project_id, r.year, typeCode(r)]
    ),
    query<QuantContext["categories"][number]>(
      `SELECT c.id, c.name, e.annual_expenditure::text AS annual_expenditure, e.comment
         FROM reporting_platform.expenditure_categories c
         LEFT JOIN reporting_platform.expenditure_entries e ON e.category_id = c.id AND e.report_id = $1
        ORDER BY c.sort_order, c.id`,
      [r.id]
    ),
    query<{ indirect_expenditure: string | null; no_transfers_confirmed: boolean; no_complementary_confirmed: boolean }>(
      `SELECT indirect_expenditure::text AS indirect_expenditure, no_transfers_confirmed, no_complementary_confirmed
         FROM reporting_platform.reports WHERE id = $1`,
      [r.id]
    ),
    query<{ name: string; amount: string | null }>(
      `SELECT COALESCE(p.organization_name, '') AS name, d.amount_transferred::text AS amount
         FROM reporting_platform.transfer_data d
         JOIN reporting_platform.transfer_partners p ON p.id = d.transfer_partner_id
        WHERE d.report_id = $1 ORDER BY d.sort_order, d.id`,
      [r.id]
    ),
    query<{ name: string; amount: string | null }>(
      `SELECT COALESCE(c.contributor_name, '') AS name, d.contribution_amount::text AS amount
         FROM reporting_platform.complementary_data d
         JOIN reporting_platform.complementary_contributors c ON c.id = d.contributor_id
        WHERE d.report_id = $1 ORDER BY d.sort_order, d.id`,
      [r.id]
    ),
  ]);
  return {
    risks,
    activities: activities.map((a) => ({ ...a, planned_quarters: Array.isArray(a.planned_quarters) ? a.planned_quarters : [] })),
    categories,
    indirect_expenditure: flags[0]?.indirect_expenditure ?? null,
    transfers,
    complementary,
    no_transfers_confirmed: flags[0]?.no_transfers_confirmed ?? false,
    no_complementary_confirmed: flags[0]?.no_complementary_confirmed ?? false,
  };
}

// ── Apply ────────────────────────────────────────────────────────────────────

const MAX_TEXT = 20_000;
const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, MAX_TEXT) : null);
const scale = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);
const amount = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e13 ? v : null);
const quarterList = (v: unknown) =>
  Array.isArray(v) ? [...new Set(v.filter((q): q is string => typeof q === "string" && /^\d{4}-Q[1-4]$/.test(q)))].sort() : [];
const EMPTY = (col: string) => `(${col} IS NULL OR btrim(${col}::text) = '')`;

/**
 * Write the approved quantitative rows. Runs inside the caller's transaction.
 * Returns counts per section and appends anything not written to `skipped`.
 */
export async function applyQuant(
  client: PoolClient,
  r: QuantReport,
  body: QuantApplyPayload,
  options: { riskCategory: string[]; workplanStatus: string[]; transferPartnerType: string[]; complementaryFundingType: string[] },
  skipped: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const bump = (k: string) => (out[k] = (out[k] ?? 0) + 1);

  // ── Risks ──
  for (const risk of Array.isArray(body.risks) ? body.risks : []) {
    const ul = scale(risk.updated_likelihood);
    const ui = scale(risk.updated_impact);
    const um = text(risk.updated_mitigation);
    const pr = typeof risk.project_revision === "boolean" ? risk.project_revision : null;
    let riskId = typeof risk.risk_id === "number" ? risk.risk_id : null;
    if (!riskId && risk.create) {
      const name = text(risk.create.name);
      if (!name) {
        skipped.push("Risk without a name: not added");
        continue;
      }
      // Importing the same file twice must not duplicate risks: reuse the
      // report's risk of the same name.
      riskId =
        (
          await client.query<{ id: number }>(
            `SELECT id FROM reporting_platform.risk_management
              WHERE report_id = $1 AND lower(btrim(risk_name)) = lower($2) ORDER BY id LIMIT 1`,
            [r.id, name]
          )
        ).rows[0]?.id ?? null;
    }
    if (!riskId && risk.create) {
      const name = text(risk.create.name) as string;
      riskId = (
        await client.query<{ id: number }>(
          `INSERT INTO reporting_platform.risk_management (report_id, risk_name, risk_description)
           VALUES ($1, $2, $3) RETURNING id`,
          [r.id, name, text(risk.create.description)]
        )
      ).rows[0].id;
      for (const cat of risk.create.categories ?? []) {
        if (!options.riskCategory.includes(cat)) continue;
        await client.query(
          `INSERT INTO reporting_platform.risk_categories (risk_id, category) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [riskId, cat]
        );
      }
      bump("risks_added");
    }
    if (!riskId) continue;
    const res = await client.query(
      `UPDATE reporting_platform.risk_management
          SET updated_likelihood = COALESCE(updated_likelihood, $1),
              updated_impact     = COALESCE(updated_impact, $2),
              updated_mitigation = CASE WHEN ${EMPTY("updated_mitigation")} THEN $3 ELSE updated_mitigation END,
              project_revision   = CASE WHEN project_revision = FALSE AND $4::boolean IS TRUE THEN TRUE ELSE project_revision END,
              updated_at = NOW()
        WHERE id = $5 AND report_id = $6
          AND ((updated_likelihood IS NULL AND $1::smallint IS NOT NULL)
            OR (updated_impact IS NULL AND $2::smallint IS NOT NULL)
            OR (${EMPTY("updated_mitigation")} AND $3::text IS NOT NULL)
            OR (project_revision = FALSE AND $4::boolean IS TRUE))`,
      [ul, ui, um, pr, riskId, r.id]
    );
    if ((res.rowCount ?? 0) > 0) bump("risks_updated");
  }

  // ── Work plan ──
  const plan = Array.isArray(body.workplan) ? body.workplan : [];
  if (plan.length) {
    const code = typeCode(r);
    // The report's window, created the way report creation seeds it.
    await client.query(
      `INSERT INTO reporting_platform.workplan_updates (project_id, year, type_code, sort_order)
       SELECT $1, $2, $3, COALESCE((SELECT MAX(sort_order) FROM reporting_platform.workplan_updates WHERE project_id = $1), 0) + 1
        WHERE NOT EXISTS (SELECT 1 FROM reporting_platform.workplan_updates WHERE project_id = $1 AND year = $2 AND type_code = $3)`,
      [r.project_id, r.year, code]
    );
    const updateId = (
      await client.query<{ id: number }>(
        `SELECT id FROM reporting_platform.workplan_updates WHERE project_id = $1 AND year = $2 AND type_code = $3 ORDER BY id LIMIT 1`,
        [r.project_id, r.year, code]
      )
    ).rows[0].id;

    for (const a of plan) {
      let activityId = typeof a.activity_id === "number" ? a.activity_id : null;
      if (activityId) {
        const owns = await client.query(
          `SELECT 1 FROM reporting_platform.workplan_activities WHERE id = $1 AND project_id = $2`,
          [activityId, r.project_id]
        );
        if (!owns.rowCount) activityId = null;
      }
      if (!activityId && a.create) {
        const actText = text(a.create.activity_text);
        if (!actText) {
          skipped.push("Work plan activity without a description: not added");
          continue;
        }
        // Reuse the project's activity with the same description (no duplicates
        // when the same file is imported twice).
        activityId =
          (
            await client.query<{ id: number }>(
              `SELECT id FROM reporting_platform.workplan_activities
                WHERE project_id = $1 AND lower(btrim(activity_text)) = lower($2) ORDER BY id LIMIT 1`,
              [r.project_id, actText]
            )
          ).rows[0]?.id ?? null;
      }
      if (!activityId && a.create) {
        const actText = text(a.create.activity_text) as string;
        activityId = (
          await client.query<{ id: number }>(
            `INSERT INTO reporting_platform.workplan_activities
               (project_id, objective_num, objective_text, activity_num, activity_text, implementing_agent, planned_quarters, sort_order)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb,
                     COALESCE((SELECT MAX(sort_order) FROM reporting_platform.workplan_activities WHERE project_id = $1), 0) + 1)
             RETURNING id`,
            [
              r.project_id,
              text(a.create.objective_num),
              text(a.create.objective_text),
              text(a.create.activity_num),
              actText,
              text(a.create.implementing_agent),
              JSON.stringify(quarterList(a.create.planned_quarters)),
            ]
          )
        ).rows[0].id;
        bump("activities_added");
      }
      if (!activityId) continue;

      const status = text(a.status);
      const validStatus = status && options.workplanStatus.includes(status) ? status : null;
      if (status && !validStatus) skipped.push(`Work plan: status "${status}" is not in PRISM's list`);
      const comment = text(a.comment);
      // Same rule as /api/workplan: a revised timeline only with a status that needs detail.
      const quarters = validStatus && workplanStatusNeedsDetail(validStatus) ? quarterList(a.updated_quarters) : [];
      const updated = quarters.length ? JSON.stringify(quarters) : null;
      if (!validStatus && !comment) continue;

      const existing = (
        await client.query<{ status: string | null; comment: string | null }>(
          `SELECT status, comment FROM reporting_platform.workplan_entries WHERE update_id = $1 AND activity_id = $2`,
          [updateId, activityId]
        )
      ).rows[0];
      if (!existing) {
        await client.query(
          `INSERT INTO reporting_platform.workplan_entries (update_id, report_id, activity_id, updated_quarters, status, comment)
           VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
          [updateId, r.id, activityId, updated, validStatus, comment]
        );
        bump("workplan_entries");
      } else if ((!existing.status?.trim() && validStatus) || (!existing.comment?.trim() && comment)) {
        // Fill what is empty; a timeline only comes with the status it belongs to.
        const fillStatus = !existing.status?.trim() && validStatus;
        await client.query(
          `UPDATE reporting_platform.workplan_entries
              SET status = CASE WHEN ${EMPTY("status")} THEN $1 ELSE status END,
                  comment = CASE WHEN ${EMPTY("comment")} THEN $2 ELSE comment END,
                  updated_quarters = CASE WHEN $4 THEN $3::jsonb ELSE updated_quarters END,
                  report_id = $5, updated_at = NOW()
            WHERE update_id = $6 AND activity_id = $7`,
          [validStatus, comment, updated, !!fillStatus, r.id, updateId, activityId]
        );
        bump("workplan_entries");
      } else {
        skipped.push(`Work plan activity #${activityId}: already reported`);
      }
    }
  }

  // ── Budget ──
  for (const e of Array.isArray(body.expenditure) ? body.expenditure : []) {
    const value = amount(e.annual_expenditure);
    const comment = text(e.comment);
    if (value === null && !comment) continue;
    const res = await client.query(
      `INSERT INTO reporting_platform.expenditure_entries (report_id, category_id, annual_expenditure, comment)
       SELECT $1, c.id, $3, $4 FROM reporting_platform.expenditure_categories c WHERE c.id = $2
       ON CONFLICT (report_id, category_id) DO UPDATE
         SET annual_expenditure = COALESCE(reporting_platform.expenditure_entries.annual_expenditure, EXCLUDED.annual_expenditure),
             comment = CASE WHEN reporting_platform.expenditure_entries.comment IS NULL
                              OR btrim(reporting_platform.expenditure_entries.comment) = ''
                            THEN EXCLUDED.comment ELSE reporting_platform.expenditure_entries.comment END,
             updated_at = NOW()
         WHERE (reporting_platform.expenditure_entries.annual_expenditure IS NULL AND EXCLUDED.annual_expenditure IS NOT NULL)
            OR ((reporting_platform.expenditure_entries.comment IS NULL OR btrim(reporting_platform.expenditure_entries.comment) = '')
                AND EXCLUDED.comment IS NOT NULL)`,
      [r.id, e.category_id, value, comment]
    );
    if ((res.rowCount ?? 0) > 0) bump("budget_categories");
  }
  const isc = amount(body.indirect_expenditure);
  if (isc !== null) {
    const res = await client.query(
      `UPDATE reporting_platform.reports SET indirect_expenditure = $1, updated_at = NOW()
        WHERE id = $2 AND indirect_expenditure IS NULL`,
      [isc, r.id]
    );
    if ((res.rowCount ?? 0) > 0) bump("indirect_costs");
    else skipped.push("Indirect support costs: already entered");
  }

  // ── Transfers / complementary funding ──
  const fundingSections = [
    {
      key: "transfers",
      rows: body.transfers,
      none: body.transfers_none,
      master: "transfer_partners",
      nameCol: "organization_name",
      typeCol: "partner_type",
      types: options.transferPartnerType,
      data: "transfer_data",
      fk: "transfer_partner_id",
      amountCol: "amount_transferred",
      flag: "no_transfers_confirmed",
    },
    {
      key: "complementary",
      rows: body.complementary,
      none: body.complementary_none,
      master: "complementary_contributors",
      nameCol: "contributor_name",
      typeCol: "funding_type",
      types: options.complementaryFundingType,
      data: "complementary_data",
      fk: "contributor_id",
      amountCol: "contribution_amount",
      flag: "no_complementary_confirmed",
    },
  ] as const;

  for (const s of fundingSections) {
    const rows = Array.isArray(s.rows) ? s.rows : [];
    let added = 0;
    for (const row of rows) {
      const name = text(row.name);
      if (!name) continue;
      // Reuse the project's organisation of the same name (keeps it on one row across years).
      let masterId = (
        await client.query<{ id: number }>(
          `SELECT id FROM reporting_platform.${s.master}
            WHERE project_id = $1 AND lower(btrim(${s.nameCol})) = lower($2) AND archived_at IS NULL
            ORDER BY id LIMIT 1`,
          [r.project_id, name]
        )
      ).rows[0]?.id;
      if (!masterId) {
        const type = text(row.type);
        masterId = (
          await client.query<{ id: number }>(
            `INSERT INTO reporting_platform.${s.master} (project_id, ${s.nameCol}, website, ${s.typeCol}, sort_order)
             VALUES ($1, $2, $3, $4,
                     COALESCE((SELECT MAX(sort_order) FROM reporting_platform.${s.master} WHERE project_id = $1), 0) + 1)
             RETURNING id`,
            [r.project_id, name, text(row.website), type && s.types.includes(type) ? type : null]
          )
        ).rows[0].id;
      }
      const value = amount(row.amount);
      const res = await client.query(
        `INSERT INTO reporting_platform.${s.data} (report_id, ${s.fk}, ${s.amountCol}, sort_order)
         VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) FROM reporting_platform.${s.data} WHERE report_id = $1), 0) + 1)
         ON CONFLICT (report_id, ${s.fk}) DO UPDATE
           SET ${s.amountCol} = EXCLUDED.${s.amountCol}, updated_at = NOW()
           WHERE reporting_platform.${s.data}.${s.amountCol} IS NULL AND EXCLUDED.${s.amountCol} IS NOT NULL`,
        [r.id, masterId, value]
      );
      if ((res.rowCount ?? 0) > 0) added++;
    }
    if (added) {
      out[s.key] = added;
      await client.query(`UPDATE reporting_platform.reports SET ${s.flag} = FALSE WHERE id = $1`, [r.id]);
    } else if (s.none) {
      // "None this year" only counts while the report has no rows (as in the editor).
      const res = await client.query(
        `UPDATE reporting_platform.reports SET ${s.flag} = TRUE
          WHERE id = $1 AND ${s.flag} = FALSE
            AND NOT EXISTS (SELECT 1 FROM reporting_platform.${s.data} WHERE report_id = $1)`,
        [r.id]
      );
      if ((res.rowCount ?? 0) > 0) out[`${s.key}_none`] = 1;
    }
  }

  return out;
}
