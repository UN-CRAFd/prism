import { NextRequest, NextResponse } from "next/server";
import pool, { query } from "@/lib/db";
import { requireAdmin } from "@/lib/authz";
import { parseBody, invalidJson, badRequest, notFound, serverError, toIntId } from "@/lib/http";
import { logger } from "@/lib/logger";
import { loadOptionOverrides } from "@/lib/option-settings";
import { optionValues } from "@/lib/options";
import {
  LIST_SECTIONS,
  TESTIMONIAL_FIELDS,
  TESTIMONIAL_KIND_MAX,
  matchOption,
  year,
  type ApplyResult,
  type QuantApplyPayload,
} from "@/lib/report-import";
import { reportIndicatorLines } from "@/lib/indicator-sync";
import { applyQuant, loadQuantContext } from "@/lib/report-import-quant";
import { DEFAULT_CYCLE, isValidCycle, statusKeysFor } from "@/lib/indicators";
import type { PoolClient } from "pg";

// ─────────────────────────────────────────────────────────────────────────────
// Report import (admin only).
//   GET  ?reportId=  → what the report currently holds, for the side-by-side review
//   POST { ApplyPayload } → write the items the admin approved
//
// Apply only ever ADDS: it fills empty survey answers and empty indicator
// results (achieved value / status / comment), sets the submission date when
// none is set, and appends rows to list sections up to each section's cap.
// When the admin chooses to, indicators the project does not have yet are
// added to its project document first (createProjectIndicator).
// Existing content is never overwritten. Everything runs in one transaction, so
// a failure leaves the report (and the project document) untouched.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_TEXT = 20_000;

function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, MAX_TEXT) : null;
}

/**
 * Add an indicator from a partner's quantitative report to the project: a new
 * custom indicator on the project document, carried to every report and update
 * of the project (as the project-document editor does). If the project
 * document already has an indicator with the same name, that one is reused.
 * Returns this report's line for the indicator.
 */
async function createProjectIndicator(
  client: PoolClient,
  projectId: number,
  reportId: number,
  c: Record<string, unknown>
): Promise<{ lineId: number; created: boolean } | { error: string }> {
  const name = text(c.name);
  const description = text(c.description);
  const mov = text(c.means_of_verification);
  const label = name ? `"${name.slice(0, 60)}"` : "Indicator";
  if (!name || !description || !mov) {
    return { error: `${label}: not added — name, description and means of verification are required` };
  }
  const cycle = isValidCycle(c.cycle) ? c.cycle : DEFAULT_CYCLE;
  const category =
    typeof c.category === "string" && optionValues("indicatorCategory").includes(c.category) ? c.category : null;

  const prodoc = (
    await client.query<{ id: number }>(
      `SELECT id FROM reporting_platform.reports WHERE project_id = $1 AND data_type = 'prodoc' LIMIT 1`,
      [projectId]
    )
  ).rows[0];
  if (!prodoc) return { error: `${label}: not added — the project has no project document` };

  const existing = (
    await client.query<{ indicator_id: number }>(
      `SELECT d.indicator_id
         FROM reporting_platform.indicator_data d
         JOIN reporting_platform.indicators i ON i.id = d.indicator_id
        WHERE d.report_id = $1 AND lower(btrim(i.name)) = lower($2)
        LIMIT 1`,
      [prodoc.id, name]
    )
  ).rows[0];

  let indicatorId: number;
  let created = false;
  if (existing) {
    indicatorId = existing.indicator_id;
  } else {
    indicatorId = (
      await client.query<{ id: number }>(
        `INSERT INTO reporting_platform.indicators (name, description, means_of_verification, category, cycle, is_standard)
         VALUES ($1, $2, $3, $4, $5, FALSE)
         RETURNING id`,
        [name, description, mov, category, cycle]
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO reporting_platform.indicator_data
         (report_id, indicator_id, baseline_value, baseline_year, target_value, target_year, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6,
               COALESCE((SELECT MAX(sort_order) FROM reporting_platform.indicator_data WHERE report_id = $1), 0) + 1)`,
      [prodoc.id, indicatorId, text(c.baseline_value), year(c.baseline_year), text(c.target_value), year(c.target_year)]
    );
    created = true;
  }

  // Carry it to every report and update of the project (as /api/indicator-data does).
  await client.query(
    `INSERT INTO reporting_platform.indicator_data
       (report_id, indicator_id, baseline_value, baseline_year, target_value, target_year, sort_order)
     SELECT r.id, pd.indicator_id, pd.baseline_value, pd.baseline_year, pd.target_value, pd.target_year,
            COALESCE((SELECT MAX(x.sort_order) FROM reporting_platform.indicator_data x WHERE x.report_id = r.id), 0) + 1
       FROM reporting_platform.reports r
       JOIN reporting_platform.indicator_data pd ON pd.report_id = $2 AND pd.indicator_id = $3
      WHERE r.project_id = $1 AND r.data_type IN ('report', 'update')
     ON CONFLICT (report_id, indicator_id) DO NOTHING`,
    [projectId, prodoc.id, indicatorId]
  );

  const line = (
    await client.query<{ id: number }>(
      `SELECT id FROM reporting_platform.indicator_data WHERE report_id = $1 AND indicator_id = $2`,
      [reportId, indicatorId]
    )
  ).rows[0];
  return line ? { lineId: line.id, created } : { error: `${label}: added to the project but not found on this report` };
}

async function loadReport(reportId: number) {
  const rows = await query<{
    id: number;
    project_id: number;
    year: number;
    status: string;
    data_type: string;
    report_type: string | null;
    report_submission_date: string | null;
    project_title: string;
    project_short_name: string | null;
    partner_short_name: string;
  }>(
    `SELECT r.id, r.project_id, r.year, r.status, r.data_type, r.report_type, r.report_submission_date,
            p.project_title, p.short_name AS project_short_name, pt.short_name AS partner_short_name
       FROM reporting_platform.reports r
       JOIN reporting_platform.projects p  ON p.id  = r.project_id
       JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.id = $1`,
    [reportId]
  );
  return rows[0] ?? null;
}

export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const reportId = toIntId(req.nextUrl.searchParams.get("reportId"));
  if (!reportId) return badRequest("reportId is required");

  try {
    const report = await loadReport(reportId);
    if (!report) return notFound("Report not found");
    if (report.data_type !== "report") return badRequest("Only annual/final reports can be imported into");

    const surveys = await query(
      `SELECT id, question, assessment, context
         FROM reporting_platform.surveys WHERE report_id = $1 ORDER BY id`,
      [reportId]
    );

    const sections: Record<string, unknown[]> = {};
    for (const def of LIST_SECTIONS) {
      // Table and column names come from our own constant, never from input.
      sections[def.key] = await query(
        `SELECT id, ${def.fields.map((f) => f.key).join(", ")}
           FROM reporting_platform.${def.key}
          WHERE report_id = $1 ORDER BY sort_order, id`,
        [reportId]
      );
    }

    const testimonials = await query(
      `SELECT id, kind, ${TESTIMONIAL_FIELDS.map((f) => f.key).join(", ")}
         FROM reporting_platform.testimonials
        WHERE report_id = $1 AND kind IN ('leadership', 'partner')
        ORDER BY kind, sort_order, id`,
      [reportId]
    );

    const indicators = await reportIndicatorLines(reportId, report.project_id);
    // New indicators are added to the project document, so the review shows its status.
    const prodoc =
      (
        await query<{ id: number; status: string }>(
          `SELECT id, status FROM reporting_platform.reports WHERE project_id = $1 AND data_type = 'prodoc' LIMIT 1`,
          [report.project_id]
        )
      )[0] ?? null;

    const quant = await loadQuantContext(report);

    await loadOptionOverrides();
    return NextResponse.json({
      report,
      surveys,
      sections,
      testimonials,
      indicators,
      indicatorStatuses: statusKeysFor(report.report_type),
      prodoc,
      quant,
      options: {
        lessonsCategory: optionValues("lessonsCategory"),
        externalCoverageType: optionValues("externalCoverageType"),
        indicatorCategory: optionValues("indicatorCategory"),
        riskCategory: optionValues("riskCategory"),
        workplanStatus: optionValues("workplanStatus"),
        transferPartnerType: optionValues("transferPartnerType"),
        complementaryFundingType: optionValues("complementaryFundingType"),
      },
    });
  } catch (err) {
    logger.error("GET /api/report-import error:", err);
    return serverError();
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (session instanceof NextResponse) return session;

  const body = await parseBody(req);
  if (!body) return invalidJson();
  const reportId = toIntId(body.reportId);
  if (!reportId) return badRequest("reportId is required");

  const report = await loadReport(reportId).catch(() => null);
  if (!report) return notFound("Report not found");
  if (report.data_type !== "report") return badRequest("Only annual/final reports can be imported into");

  await loadOptionOverrides();
  const allowedOptions: Record<string, string[]> = {
    lessonsCategory: optionValues("lessonsCategory"),
    externalCoverageType: optionValues("externalCoverageType"),
  };

  const result: ApplyResult = {
    ok: true,
    surveys_updated: 0,
    indicators_updated: 0,
    indicators_created: 0,
    rows_added: {},
    submission_date_set: false,
    skipped: [],
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialise concurrent imports into the same report so caps hold.
    await client.query(`SELECT id FROM reporting_platform.reports WHERE id = $1 FOR UPDATE`, [reportId]);

    // ── Submission date: only when none is set ──
    const date = text(body.report_submission_date);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const r = await client.query(
        `UPDATE reporting_platform.reports
            SET report_submission_date = $1, updated_at = NOW()
          WHERE id = $2 AND report_submission_date IS NULL`,
        [date, reportId]
      );
      result.submission_date_set = (r.rowCount ?? 0) > 0;
      if (!result.submission_date_set) result.skipped.push("Submission date: already set");
    }

    // ── Indicators: fill empty achieved value / status / comment of this
    //    report's indicator lines (never overwrite what is there) ──
    const allowedStatuses: string[] = statusKeysFor(report.report_type);
    const indicators = Array.isArray(body.indicators) ? (body.indicators as Record<string, unknown>[]) : [];
    const seenLines = new Set<number>();
    for (const ind of indicators) {
      let lineId = toIntId(ind?.line_id);
      if (!lineId && ind?.create && typeof ind.create === "object") {
        // Not in the project yet: add it to the project document (and with that
        // to every report of the project), then fill this report's new line.
        const created = await createProjectIndicator(client, report.project_id, reportId, ind.create as Record<string, unknown>);
        if ("error" in created) {
          result.skipped.push(created.error);
          continue;
        }
        if (created.created) result.indicators_created++;
        lineId = created.lineId;
      }
      if (!lineId || seenLines.has(lineId)) continue;
      seenLines.add(lineId);
      const achieved = text(ind.achieved_value);
      const rawStatus = text(ind.status);
      const status = rawStatus && allowedStatuses.includes(rawStatus) ? rawStatus : null;
      if (rawStatus && !status) result.skipped.push(`Indicator line #${lineId}: status "${rawStatus}" is not used in this report type`);
      const comment = text(ind.comment);
      if (achieved === null && status === null && comment === null) continue;
      const r = await client.query(
        `UPDATE reporting_platform.indicator_data
            SET achieved_value = CASE WHEN achieved_value IS NULL OR btrim(achieved_value) = '' THEN $1 ELSE achieved_value END,
                status         = CASE WHEN status IS NULL OR btrim(status) = '' THEN $2 ELSE status END,
                comment        = CASE WHEN comment IS NULL OR btrim(comment) = '' THEN $3 ELSE comment END,
                updated_at     = NOW()
          WHERE id = $4 AND report_id = $5
            AND (((achieved_value IS NULL OR btrim(achieved_value) = '') AND $1::text IS NOT NULL)
              OR ((status IS NULL OR btrim(status) = '') AND $2::text IS NOT NULL)
              OR ((comment IS NULL OR btrim(comment) = '') AND $3::text IS NOT NULL))`,
        [achieved, status, comment, lineId, reportId]
      );
      if ((r.rowCount ?? 0) > 0) result.indicators_updated++;
      else result.skipped.push(`Indicator line #${lineId}: already filled`);
    }

    // ── Surveys: fill empty rating / justification of this report's questions ──
    const surveys = Array.isArray(body.surveys) ? body.surveys : [];
    for (const s of surveys as Record<string, unknown>[]) {
      const id = toIntId(s?.id);
      if (!id) continue;
      const a = typeof s.assessment === "number" && Number.isInteger(s.assessment) &&
        s.assessment >= 1 && s.assessment <= 5 ? s.assessment : null;
      const c = text(s.context);
      if (a === null && c === null) continue;
      const r = await client.query(
        `UPDATE reporting_platform.surveys
            SET assessment = COALESCE(assessment, $1),
                context    = CASE WHEN context IS NULL OR btrim(context) = '' THEN $2 ELSE context END,
                updated_at = NOW()
          WHERE id = $3 AND report_id = $4
            AND ((assessment IS NULL AND $1::smallint IS NOT NULL)
              OR ((context IS NULL OR btrim(context) = '') AND $2::text IS NOT NULL))`,
        [a, c, id, reportId]
      );
      if ((r.rowCount ?? 0) > 0) result.surveys_updated++;
      else result.skipped.push(`Survey question #${id}: already answered`);
    }

    // ── List sections: append up to the cap ──
    const bodySections = (body.sections && typeof body.sections === "object" ? body.sections : {}) as Record<string, unknown>;
    for (const def of LIST_SECTIONS) {
      const incoming = Array.isArray(bodySections[def.key]) ? (bodySections[def.key] as Record<string, unknown>[]) : [];
      if (!incoming.length) continue;
      const cnt = await client.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM reporting_platform.${def.key} WHERE report_id = $1`,
        [reportId]
      );
      let count = Number(cnt.rows[0].n);
      let added = 0;
      const cols = def.fields.map((f) => f.key);
      for (const row of incoming) {
        if (def.max !== undefined && count >= def.max) {
          result.skipped.push(`${def.label}: limit of ${def.max} reached, row not added`);
          continue;
        }
        const values = def.fields.map((f) => {
          const v = text(row?.[f.key]);
          return "optionGroup" in f && f.optionGroup ? matchOption(v, allowedOptions[f.optionGroup] ?? []) : v;
        });
        if (values.every((v) => v === null)) continue;
        count++;
        await client.query(
          `INSERT INTO reporting_platform.${def.key} (report_id, ${cols.join(", ")}, sort_order)
           VALUES ($1, ${cols.map((_, i) => `$${i + 2}`).join(", ")}, $${cols.length + 2})`,
          [reportId, ...values, count]
        );
        added++;
      }
      if (added) result.rows_added[def.key] = added;
    }

    // ── Testimonials: leadership (max 1) and partner (max 3) quotes ──
    const testimonials = Array.isArray(body.testimonials) ? (body.testimonials as Record<string, unknown>[]) : [];
    const tCols = TESTIMONIAL_FIELDS.map((f) => f.key);
    for (const kind of Object.keys(TESTIMONIAL_KIND_MAX) as (keyof typeof TESTIMONIAL_KIND_MAX)[]) {
      const incoming = testimonials.filter((t) => t?.kind === kind);
      if (!incoming.length) continue;
      const cnt = await client.query<{ n: string }>(
        `SELECT COUNT(*) AS n FROM reporting_platform.testimonials WHERE report_id = $1 AND kind = $2`,
        [reportId, kind]
      );
      let count = Number(cnt.rows[0].n);
      let added = 0;
      for (const t of incoming) {
        if (count >= TESTIMONIAL_KIND_MAX[kind]) {
          result.skipped.push(`Testimonials (${kind}): limit of ${TESTIMONIAL_KIND_MAX[kind]} reached, quote not added`);
          continue;
        }
        const values = tCols.map((c) => text(t[c]));
        if (values.every((v) => v === null)) continue;
        count++;
        await client.query(
          `INSERT INTO reporting_platform.testimonials (report_id, kind, ${tCols.join(", ")}, sort_order)
           VALUES ($1, $2, ${tCols.map((_, i) => `$${i + 3}`).join(", ")}, $${tCols.length + 3})`,
          [reportId, kind, ...values, count]
        );
        added++;
      }
      if (added) result.rows_added[`testimonials_${kind}`] = added;
    }

    // ── Risks, work plan, budget, transfers, complementary funding ──
    result.quant = await applyQuant(
      client,
      report,
      body as QuantApplyPayload,
      {
        riskCategory: optionValues("riskCategory"),
        workplanStatus: optionValues("workplanStatus"),
        transferPartnerType: optionValues("transferPartnerType"),
        complementaryFundingType: optionValues("complementaryFundingType"),
      },
      result.skipped
    );

    await client.query("COMMIT");
    logger.info("Report import applied", {
      reportId,
      actor: session.name,
      source_file: text(body.source_file),
      surveys_updated: result.surveys_updated,
      indicators_updated: result.indicators_updated,
      rows_added: result.rows_added,
      quant: result.quant,
    });
    return NextResponse.json(result);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    logger.error("POST /api/report-import error:", err, { reportId });
    return serverError();
  } finally {
    client.release();
  }
}
