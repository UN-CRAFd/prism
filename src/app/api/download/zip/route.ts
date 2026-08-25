import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { zipSync, strToU8 } from "fflate";
import { requireAdmin } from "@/lib/authz";
import { logger } from "@/lib/logger";

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

// Keep a file name safe inside the ZIP while preserving its extension. Two
// uploads with the same name under one project would collide, so callers prefix
// with the row id.
function safeFileName(name: string): string {
  return (name || "file").replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

// Split a section's flat rows into one CSV file per partner + year, written
// under a folder (e.g. "reports/") so report and prodoc CSVs don't collide.
function writeGrouped(
  files: Record<string, Uint8Array>,
  folder: string,
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
    files[`${folder}${section}_${slug(partner)}_${year}.csv`] = strToU8(toCsv(headers, groupRows));
  }
}

// Prodoc CSVs are project-scoped (one row set per project, no report year), so
// they group by partner + project rather than by year.
function writeGroupedByProject(
  files: Record<string, Uint8Array>,
  folder: string,
  section: string,
  headers: string[],
  rows: Record<string, unknown>[]
) {
  const groups = new Map<string, { partner: string; project: string; rows: Record<string, unknown>[] }>();
  for (const row of rows) {
    const partner = (row.partner as string) ?? "unknown";
    const project = (row.project_name as string) ?? "unknown";
    const key = `${partner}::${project}`;
    if (!groups.has(key)) groups.set(key, { partner, project, rows: [] });
    groups.get(key)!.rows.push(row);
  }
  for (const { partner, project, rows: groupRows } of groups.values()) {
    files[`${folder}${section}_${slug(partner)}_${slug(project)}.csv`] = strToU8(toCsv(headers, groupRows));
  }
}

// ── Report section export definitions ────────────────────────────────────────
// Each query returns flat rows carrying `year` + `partner` (used to group/name
// files) plus the section's own columns. The %DATA_TYPES% placeholder is filled
// with the requested report data_type(s); %PROJECT_FILTER% with an optional
// project-id restriction.

interface SectionExport {
  headers: string[];
  sql: string;
}

const REPORT_JOIN = `
  JOIN reporting_platform.reports  r  ON r.id  = %KEY%
  JOIN reporting_platform.projects p  ON p.id  = r.project_id
  JOIN reporting_platform.partners pt ON pt.id = p.partner_id
 WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%`;

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
      "year", "project_name", "partner", "data_type", "project_title", "mptfo_project_number",
      "organization_name", "organization_website",
      "grant_size_usd", "project_start_date", "project_duration_months",
      "participating_organizations", "implementing_partners",
      "geographic_scope", "report_submission_date", "authorized",
    ],
    sql: `
      SELECT
        r.year,
        p.project_title  AS project_name,
        pt.short_name    AS partner,
        r.data_type,
        p.project_title,
        p.mptfo_project_number,
        pt.long_name     AS organization_name,
        pt.organization_website,
        p.grant_size_usd,
        TO_CHAR(p.project_start_date, 'YYYY-MM-DD') AS project_start_date,
        p.project_duration_months,
        COALESCE(
          (SELECT string_agg(po.name, ', ' ORDER BY po.sort_order, po.id)
             FROM reporting_platform.project_organizations po
            WHERE po.project_id = p.id AND po.type = 'participating'),
          ''
        ) AS participating_organizations,
        COALESCE(
          (SELECT string_agg(po.name, ', ' ORDER BY po.sort_order, po.id)
             FROM reporting_platform.project_organizations po
            WHERE po.project_id = p.id AND po.type = 'implementing'),
          ''
        ) AS implementing_partners,
        p.geographic_scope,
        TO_CHAR(r.report_submission_date, 'YYYY-MM-DD') AS report_submission_date,
        r.authorized
      FROM reporting_platform.reports  r
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
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
    // photo_link = external URL; photo_file = uploaded image's file name (the two
    // are mutually exclusive — a CSV can't embed the bytes, so its name is recorded;
    // the bytes themselves ship in files/ when "Include photos" is on).
    headers: ["year", "project_name", "partner", "kind", "quote", "person_name", "person_title", "photo_label", "photo_link", "photo_file", "photo_credits"],
    sql: reportScoped("testimonials", "t", "report_id", "t.kind, t.quote, t.person_name, t.person_title, t.photo_label, t.photo_link, t.photo_file_name AS photo_file, t.photo_credits", "t.kind, t.sort_order, t.id"),
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
      WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
      ORDER BY r.year, pt.short_name, p.project_title, d.sort_order, d.id`,
  },

  workplan: {
    headers: [
      "year", "update_type", "project_name", "partner", "outcome", "objective_num", "objective_text",
      "activity_num", "activity_text", "implementing_agent", "planned_quarters", "updated_quarters", "status", "comment",
    ],
    // Workplan updates are report-time entries; they belong to the annual report,
    // so this section is only meaningful when 'report' is among the data types.
    sql: `
      SELECT wu.year, wu.type_code AS update_type, p.project_title AS project_name, pt.short_name AS partner,
        a.outcome, a.objective_num, a.objective_text, a.activity_num, a.activity_text, a.implementing_agent,
        a.planned_quarters, e.updated_quarters, e.status, e.comment
      FROM reporting_platform.workplan_entries e
      JOIN reporting_platform.workplan_activities a ON a.id = e.activity_id
      JOIN reporting_platform.workplan_updates  wu ON wu.id = e.update_id
      JOIN reporting_platform.projects p  ON p.id  = wu.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE TRUE %PROJECT_FILTER%
      ORDER BY wu.year, pt.short_name, p.project_title, wu.sort_order, a.sort_order, a.id`,
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
      WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
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
      WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
      ORDER BY r.year, pt.short_name, p.project_title, td.sort_order, td.id`,
  },

  complementary: {
    headers: ["year", "project_name", "partner", "contributor", "funding_type", "contribution_amount", "linked_activities"],
    sql: `
      SELECT r.year, p.project_title AS project_name, pt.short_name AS partner,
        cc.contributor_name AS contributor, cc.funding_type, cd.contribution_amount,
        (SELECT string_agg(NULLIF(TRIM(COALESCE(wa.activity_num, '') || ' ' || COALESCE(wa.activity_text, '')), ''), '; ' ORDER BY wa.sort_order)
           FROM reporting_platform.complementary_data_activities cda
           JOIN reporting_platform.workplan_activities wa ON wa.id = cda.activity_id
          WHERE cda.complementary_data_id = cd.id) AS linked_activities
      FROM reporting_platform.complementary_data cd
      JOIN reporting_platform.complementary_contributors cc ON cc.id = cd.contributor_id
      JOIN reporting_platform.reports  r  ON r.id  = cd.report_id
      JOIN reporting_platform.projects p  ON p.id  = r.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      WHERE r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
      ORDER BY r.year, pt.short_name, p.project_title, cd.sort_order, cd.id`,
  },
};

// ── Prodoc (project-scoped) section export definitions ───────────────────────
// The project document is the project definition, so these tables are keyed by
// project_id (no report year). Each carries `partner` + `project_name` to group
// files. %PROJECT_FILTER% restricts to the selected projects.

const PROJECT_JOIN = `
  JOIN reporting_platform.projects p  ON p.id  = %KEY%
  JOIN reporting_platform.partners pt ON pt.id = p.partner_id
 WHERE TRUE %PROJECT_FILTER%`;

function projectScoped(table: string, alias: string, keyCol: string, cols: string, order: string): string {
  return `
    SELECT p.project_title AS project_name, pt.short_name AS partner, ${cols}
      FROM reporting_platform.${table} ${alias}
      ${PROJECT_JOIN.replace("%KEY%", `${alias}.${keyCol}`)}
     ORDER BY pt.short_name, p.project_title, ${order}`;
}

const PRODOC_EXPORTS: Record<string, SectionExport> = {
  prodoc_narratives: {
    headers: ["project_name", "partner", "narrative_key", "label", "answer"],
    sql: projectScoped(
      "project_narratives", "n", "project_id",
      "n.narrative_key, n.label, n.answer",
      "n.sort_order, n.id"
    ),
  },

  prodoc_sdg_targets: {
    headers: ["project_name", "partner", "sdg_goal", "target_code", "percentage", "priority"],
    sql: projectScoped(
      "project_sdg_targets", "sdg", "project_id",
      "sdg.sdg_goal, sdg.target_code, sdg.percentage, sdg.priority",
      "(sdg.priority = 'secondary'), sdg.sdg_goal, sdg.target_code"
    ),
  },

  prodoc_workplan: {
    // The baseline workplan defined in the project document (planned quarters,
    // no report-time updates).
    headers: ["project_name", "partner", "outcome", "objective_num", "objective_text", "activity_num", "activity_text", "implementing_agent", "planned_quarters"],
    sql: projectScoped(
      "workplan_activities", "a", "project_id",
      "a.outcome, a.objective_num, a.objective_text, a.activity_num, a.activity_text, a.implementing_agent, a.planned_quarters",
      "a.sort_order, a.id"
    ),
  },

  prodoc_budgets: {
    headers: ["project_name", "partner", "category", "description", "year", "approved_amount"],
    sql: `
      SELECT p.project_title AS project_name, pt.short_name AS partner,
        c.name AS category, ebn.description, b.year, b.approved_amount
      FROM reporting_platform.expenditure_budgets b
      JOIN reporting_platform.expenditure_categories c ON c.id = b.category_id
      JOIN reporting_platform.projects p  ON p.id  = b.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      LEFT JOIN reporting_platform.expenditure_budget_category_notes ebn
        ON ebn.project_id = b.project_id AND ebn.category_id = b.category_id
      WHERE TRUE %PROJECT_FILTER%
      ORDER BY pt.short_name, p.project_title, c.sort_order, b.year`,
  },

  prodoc_signatures: {
    headers: ["project_name", "partner", "party", "signer_name", "role", "relationship", "signed_at"],
    sql: `
      SELECT p.project_title AS project_name, pt.short_name AS partner,
        sig.party,
        COALESCE(pc.name, sig.signed_by) AS signer_name,
        pc.role, jc.relationship,
        TO_CHAR(sig.signed_at, 'YYYY-MM-DD') AS signed_at
      FROM reporting_platform.prodoc_signatures sig
      JOIN reporting_platform.projects p  ON p.id  = sig.project_id
      JOIN reporting_platform.partners pt ON pt.id = p.partner_id
      LEFT JOIN reporting_platform.partner_contacts pc ON pc.id = sig.contact_id
      LEFT JOIN reporting_platform.project_contacts jc
        ON jc.project_id = sig.project_id AND jc.contact_id = sig.contact_id
      WHERE TRUE %PROJECT_FILTER%
      ORDER BY pt.short_name, p.project_title, sig.party, signer_name`,
  },
};

// ── Query building ───────────────────────────────────────────────────────────

// Fill the SQL placeholders and return [sql, params]. %DATA_TYPES% → $1;
// %PROJECT_FILTER% → "AND p.id = ANY($2)" (or "" when no projects were chosen).
// Both are parameterized — no interpolation of user values into the SQL text.
function buildQuery(rawSql: string, dataTypes: string[], projectIds: number[]): [string, unknown[]] {
  const params: unknown[] = [dataTypes];
  let sql = rawSql.replace(/%DATA_TYPES%/g, `$${params.length}::text[]`);

  let projectClause = "";
  if (projectIds.length > 0) {
    params.push(projectIds);
    projectClause = `AND p.id = ANY($${params.length}::int[])`;
  }
  sql = sql.replace(/%PROJECT_FILTER%/g, projectClause);
  return [sql, params];
}

// ── Binary file collection ───────────────────────────────────────────────────

interface DocRow {
  partner: string;
  project_name: string;
  id: number;
  file_name: string;
  content: Buffer;
}

interface PhotoRow {
  partner: string;
  project_name: string;
  id: number;
  photo_file_name: string | null;
  photo_content: Buffer;
}

// ── Route ──────────────────────────────────────────────────────────────────

const REPORT_SECTIONS = new Set(Object.keys(EXPORTS));
const PRODOC_SECTIONS = new Set(Object.keys(PRODOC_EXPORTS));

export async function GET(req: NextRequest) {
  // Exports partner data as CSVs (+ optionally the uploaded files) — admin only.
  const gate = await requireAdmin();
  if (gate instanceof NextResponse) return gate;

  const sp = req.nextUrl.searchParams;
  const sections = sp.getAll("sections");
  if (sections.length === 0) {
    return NextResponse.json({ error: "At least one section is required" }, { status: 400 });
  }

  // Which report data_types to include. 'both' pulls reporting-year rows AND the
  // project document; the default matches the historic behaviour (reports only).
  const typeParam = sp.get("type") ?? "report";
  const dataTypes =
    typeParam === "both" ? ["report", "prodoc"]
    : typeParam === "prodoc" ? ["prodoc"]
    : ["report"];
  const wantReport = dataTypes.includes("report");
  const wantProdoc = dataTypes.includes("prodoc");

  // Optional project restriction. Empty → all projects. Non-numeric ids are
  // dropped rather than trusted.
  const projectIds = sp
    .getAll("projects")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);

  const includeDocuments = sp.get("documents") === "true";
  const includePhotos = sp.get("photos") === "true";

  const files: Record<string, Uint8Array> = {};

  try {
    // Report-scoped section CSVs → reports/. Prodoc-only exports skip these.
    if (wantReport || wantProdoc) {
      for (const section of sections) {
        if (!REPORT_SECTIONS.has(section)) continue;
        // Workplan updates are report-time only; they carry no prodoc rows.
        if (section === "workplan" && !wantReport) continue;
        const cfg = EXPORTS[section];
        const [sql, params] = buildQuery(cfg.sql, dataTypes, projectIds);
        const rows = (await query(sql, params)) as Record<string, unknown>[];
        writeGrouped(files, "reports/", section, cfg.headers, rows);
      }
    }

    // Prodoc project-scoped section CSVs → prodocs/. Requested via the same
    // `sections` list using the prodoc_* keys; only emitted when prodoc is wanted.
    if (wantProdoc) {
      for (const section of sections) {
        if (!PRODOC_SECTIONS.has(section)) continue;
        const cfg = PRODOC_EXPORTS[section];
        const [sql, params] = buildQuery(cfg.sql, dataTypes, projectIds);
        const rows = (await query(sql, params)) as Record<string, unknown>[];
        writeGroupedByProject(files, "prodocs/", section, cfg.headers, rows);
      }
    }

    // Uploaded project documents (annexes) → files/<partner>_<project>/documents/.
    // Project-scoped and independent of report data_type, so any project in scope
    // contributes its annexes.
    if (includeDocuments) {
      const [projSql, projParams] = buildQuery(
        `SELECT pt.short_name AS partner, p.project_title AS project_name,
                d.id, d.file_name, d.content
           FROM reporting_platform.project_documents d
           JOIN reporting_platform.projects p  ON p.id  = d.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE TRUE %PROJECT_FILTER%
          ORDER BY pt.short_name, p.project_title, d.id`,
        dataTypes,
        projectIds
      );
      const docs = (await query(projSql, projParams)) as unknown as DocRow[];
      for (const d of docs) {
        if (!d.content) continue;
        const dir = `files/${slug(d.partner)}_${slug(d.project_name)}/documents/`;
        files[`${dir}${d.id}_${safeFileName(d.file_name)}`] = new Uint8Array(d.content);
      }
    }

    // Testimonial photos → files/<partner>_<project>/photos/. These are
    // report-scoped, so respect the requested data_type(s) as well.
    if (includePhotos) {
      const [photoSql, photoParams] = buildQuery(
        `SELECT pt.short_name AS partner, p.project_title AS project_name,
                t.id, t.photo_file_name, t.photo_content
           FROM reporting_platform.testimonials t
           JOIN reporting_platform.reports  r  ON r.id  = t.report_id
           JOIN reporting_platform.projects p  ON p.id  = r.project_id
           JOIN reporting_platform.partners pt ON pt.id = p.partner_id
          WHERE t.photo_content IS NOT NULL
            AND r.data_type = ANY(%DATA_TYPES%) %PROJECT_FILTER%
          ORDER BY pt.short_name, p.project_title, t.id`,
        dataTypes,
        projectIds
      );
      const photos = (await query(photoSql, photoParams)) as unknown as PhotoRow[];
      for (const ph of photos) {
        if (!ph.photo_content) continue;
        const dir = `files/${slug(ph.partner)}_${slug(ph.project_name)}/photos/`;
        files[`${dir}${ph.id}_${safeFileName(ph.photo_file_name || `photo_${ph.id}`)}`] =
          new Uint8Array(ph.photo_content);
      }
    }

    if (Object.keys(files).length === 0) {
      return NextResponse.json({ error: "No data found for the current selection" }, { status: 404 });
    }

    const zipped = zipSync(files);
    return new Response(zipped, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="export.zip"',
      },
    });
  } catch (err) {
    logger.error("GET /api/download/zip error:", err);
    return NextResponse.json({ error: "Request failed" }, { status: 500 });
  }
}
