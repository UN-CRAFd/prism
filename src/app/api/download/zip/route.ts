import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { zipSync, strToU8 } from "fflate";

// ── CSV helpers ────────────────────────────────────────────────────────────

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = Array.isArray(v) ? v.join(", ") : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines: string[] = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n") + "\n";
}

function slug(s: string): string {
  return (s ?? "unknown").toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
}

// Split a section's flat rows into one CSV file per partner + year.
function writeGrouped(
  files: Record<string, Uint8Array>,
  section: string,
  headers: string[],
  rows: Record<string, unknown>[]
) {
  const groups = new Map<string, { partner: string; year: number; rows: Record<string, unknown>[] }>();
  for (const row of rows) {
    const partner = (row.partner as string) ?? "unknown";
    const year = row.year as number;
    const key = `${partner}::${year}`;
    if (!groups.has(key)) groups.set(key, { partner, year, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  for (const { partner, year, rows: groupRows } of groups.values()) {
    files[`${section}_${slug(partner)}_${year}.csv`] = strToU8(toCsv(headers, groupRows));
  }
}

// ── Section export definitions ───────────────────────────────────────────────
// Each query returns flat rows carrying `year` + `partner` (used to group/name
// files) plus the section's own columns; only `report` rows are exported.

interface SectionExport {
  headers: string[];
  sql: string;
}

const REPORT_JOIN = `
  JOIN reporting_platform.reports  r  ON r.id  = %KEY%
  JOIN reporting_platform.projects p  ON p.id  = r.project_id
  JOIN reporting_platform.partners pt ON pt.id = p.partner_id
 WHERE r.data_type = 'report'`;

// Build the common report/project/partner join for a report-scoped table.
function reportScoped(table: string, alias: string, keyCol: string, cols: string, order: string): string {
  return `
    SELECT r.year, p.project_title AS project_name, pt.short_name AS partner, ${cols}
      FROM reporting_platform.${table} ${alias}
      ${REPORT_JOIN.replace("%KEY%", `${alias}.${keyCol}`)}
     ORDER BY r.year, pt.short_name, p.project_title, ${order}`;
}

const EXPORTS: Record<string, SectionExport> = {
  overview: {
    headers: [
      "year", "project_name", "partner", "project_title", "mptfo_project_number",
      "organization_name", "organization_website",
      "grant_size_usd", "project_start_date", "project_duration_months", "implementing_partners",
      "geographic_scope", "report_submission_date", "authorized",
    ],
    sql: `
      SELECT
        r.year,
        p.project_title  AS project_name,
        pt.short_name    AS partner,
        p.project_title,
        p.mptfo_project_number,
        pt.long_name     AS organization_name,
        pt.organization_website,
        p.grant_size_usd,
        TO_CHAR(p.project_start_date, 'YYYY-MM-DD') AS project_start_date,
        p.project_duration_months,
        p.implementing_partners,
        p.geographic_scope,
        TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date,
        r.authorized
      FROM reporting_platform.reports  r
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title`,
  },

  surveys: {
    headers: ["year", "project_name", "partner", "question", "assessment", "context"],
    sql: reportScoped("surveys", "s", "report_id", "s.question, s.assessment, s.context", "s.id"),
  },

  achievements: {
    headers: ["year", "project_name", "partner", "achievement", "significance", "links"],
    sql: reportScoped("key_achievements", "ka", "report_id", "ka.achievement, ka.significance, ka.links", "ka.sort_order, ka.id"),
  },

  partnerships: {
    headers: ["year", "project_name", "partner", "partner_organization", "result", "links"],
    sql: reportScoped("partnerships", "pn", "report_id", "pn.partner_organization, pn.result, pn.links", "pn.sort_order, pn.id"),
  },

  results: {
    headers: ["year", "project_name", "partner", "context", "data_driven_decision", "resulting_impact", "links"],
    sql: reportScoped("results", "rs", "report_id", "rs.context, rs.data_driven_decision, rs.resulting_impact, rs.links", "rs.sort_order, rs.id"),
  },

  lessons: {
    headers: ["year", "project_name", "partner", "category", "lesson_learned", "adjustment_informed"],
    sql: reportScoped("lessons_learned", "ll", "report_id", "ll.category, ll.lesson_learned, ll.adjustment_informed", "ll.sort_order, ll.id"),
  },

  external_coverage: {
    headers: ["year", "project_name", "partner", "type", "description", "reach_indicator", "links"],
    sql: reportScoped("external_coverage", "ec", "report_id", "ec.type, ec.description, ec.reach_indicator, ec.links", "ec.sort_order, ec.id"),
  },

  testimonials: {
    headers: ["year", "project_name", "partner", "kind", "quote", "person_name", "person_title", "photo_label", "photo_link", "photo_credits"],
    sql: reportScoped("testimonials", "t", "report_id", "t.kind, t.quote, t.person_name, t.person_title, t.photo_label, t.photo_link, t.photo_credits", "t.kind, t.sort_order, t.id"),
  },

  risk: {
    headers: [
      "year", "project_name", "partner", "risk_name", "risk_category",
      "likelihood", "impact", "approved_mitigation", "updated_mitigation", "project_revision",
    ],
    sql: reportScoped(
      "risk_management", "rm", "report_id",
      `rm.risk_name,
       (SELECT string_agg(rc.category, ', ' ORDER BY rc.category)
          FROM reporting_platform.risk_categories rc
         WHERE rc.risk_id = rm.id) AS risk_category,
       rm.likelihood, rm.impact, rm.approved_mitigation, rm.updated_mitigation, rm.project_revision`,
      "rm.id"
    ),
  },

  indicators: {
    headers: [
      "year", "project_name", "partner", "indicator_name", "category",
      "baseline_value", "baseline_year", "target_value", "target_year", "achieved_value", "status", "comment",
    ],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        i.name AS indicator_name, i.category,
        d.baseline_value, d.baseline_year, d.target_value, d.target_year,
        d.achieved_value, d.status, d.comment
      FROM reporting_platform.indicator_data d
      JOIN reporting_platform.indicators i ON i.id = d.indicator_id
      JOIN reporting_platform.reports  r  ON r.id  = d.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title, d.sort_order, d.id`,
  },

  workplan: {
    headers: [
      "year", "project_name", "partner", "outcome", "objective_num", "objective_text",
      "activity_num", "activity_text", "implementing_agent", "planned_quarters", "updated_quarters", "status", "comment",
    ],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        a.outcome, a.objective_num, a.objective_text, a.activity_num, a.activity_text, a.implementing_agent,
        a.planned_quarters, e.updated_quarters, e.status, e.comment
      FROM reporting_platform.workplan_entries e
      JOIN reporting_platform.workplan_activities a ON a.id = e.activity_id
      JOIN reporting_platform.reports  r  ON r.id  = e.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title, a.sort_order, a.id`,
  },

  expenditure: {
    headers: ["year", "project_name", "partner", "category", "approved_amount", "annual_expenditure", "comment"],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        c.name AS category, b.approved_amount, e.annual_expenditure, e.comment
      FROM reporting_platform.expenditure_entries e
      JOIN reporting_platform.expenditure_categories c ON c.id = e.category_id
      JOIN reporting_platform.reports  r  ON r.id  = e.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      LEFT JOIN reporting_platform.expenditure_budgets b
        ON b.project_id = p.id AND b.category_id = e.category_id AND b.year = r.year
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title, c.sort_order, e.id`,
  },

  transfers: {
    headers: ["year", "project_name", "partner", "transfer_partner", "partner_type", "amount_transferred", "linked_activity"],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        tp.organization_name AS transfer_partner, tp.partner_type, td.amount_transferred,
        NULLIF(TRIM(COALESCE(wa.activity_num, '') || ' ' || COALESCE(wa.activity_text, '')), '') AS linked_activity
      FROM reporting_platform.transfer_data td
      JOIN reporting_platform.transfer_partners tp ON tp.id = td.transfer_partner_id
      JOIN reporting_platform.reports  r  ON r.id  = td.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      LEFT JOIN reporting_platform.workplan_activities wa ON wa.id = td.linked_activity_id
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title, td.sort_order, td.id`,
  },

  complementary: {
    headers: ["year", "project_name", "partner", "contributor", "funding_type", "contribution_amount", "linked_activities"],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        cc.contributor_name AS contributor, cc.funding_type, cd.contribution_amount,
        (SELECT string_agg(NULLIF(TRIM(COALESCE(wa.activity_num, '') || ' ' || COALESCE(wa.activity_text, '')), ''), '; ' ORDER BY wa.sort_order)
           FROM reporting_platform.workplan_activities wa
          WHERE wa.id = ANY (SELECT jsonb_array_elements_text(cd.linked_activity_ids)::int)) AS linked_activities
      FROM reporting_platform.complementary_data cd
      JOIN reporting_platform.complementary_contributors cc ON cc.id = cd.contributor_id
      JOIN reporting_platform.reports  r  ON r.id  = cd.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = 'report'
      ORDER BY r.year, pt.short_name, p.project_title, cd.sort_order, cd.id`,
  },
};

// ── Route ──────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const sections = req.nextUrl.searchParams.getAll("sections");
  if (sections.length === 0) {
    return NextResponse.json({ error: "At least one section is required" }, { status: 400 });
  }

  const files: Record<string, Uint8Array> = {};

  try {
    for (const section of sections) {
      const cfg = EXPORTS[section];
      if (!cfg) continue;
      const rows = (await query(cfg.sql)) as Record<string, unknown>[];
      writeGrouped(files, section, cfg.headers, rows);
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "No data found for the selected sections" }, { status: 404 });
    }

    const zipped = zipSync(files);
    return new Response(zipped, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="export.zip"',
      },
    });
  } catch (err) {
    console.error("GET /api/download/zip error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
