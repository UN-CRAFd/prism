// Read-only diagnostic: shows which indicator_data rows block report completion
// and whether those rows are visible on the Indicators tab.
//
// Usage: node db/check-indicator-completion.cjs <project-short-name> <year>
// Example: node db/check-indicator-completion.cjs v2prism 2026

"use strict";

const fs   = require("fs");
const path = require("path");
const { Client } = require("pg");

// ── Args ─────────────────────────────────────────────────────────────────────

const [,, shortName, yearArg] = process.argv;
if (!shortName || !yearArg) {
  console.error("Usage: node db/check-indicator-completion.cjs <project-short-name> <year>");
  process.exit(1);
}
const year = parseInt(yearArg, 10);
if (!Number.isFinite(year)) {
  console.error("year must be an integer");
  process.exit(1);
}

// ── Parse .env (same logic as check-columns.cjs — no extra dependency) ───────

const env = {};
fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8")
  .split("\n")
  .forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    env[key] = val;
  });

// ── Connect ───────────────────────────────────────────────────────────────────

const client = new Client({
  host:     env.AZURE_POSTGRES_HOST,
  port:     5432,
  database: env.AZURE_POSTGRES_DB,
  user:     env.AZURE_POSTGRES_USER,
  password: env.AZURE_POSTGRES_PASSWORD,
  ssl: { rejectUnauthorized: true },
});

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  await client.connect();

  // 1. Find the report
  const reportRows = await client.query(
    `SELECT r.id AS report_id, r.project_id, p.short_name AS project_short_name, p.project_title
       FROM reporting_platform.reports r
       JOIN reporting_platform.projects p ON p.id = r.project_id
      WHERE lower(p.short_name) = lower($1)
        AND r.year = $2
        AND r.data_type = 'report'`,
    [shortName, year]
  );

  if (reportRows.rows.length === 0) {
    console.error(`No annual report found for project "${shortName}" year ${year}`);
    await client.end();
    process.exit(1);
  }

  const { report_id: reportId, project_id: projectId, project_short_name, project_title } = reportRows.rows[0];
  console.log(`\nProject : ${project_title} (${project_short_name})`);
  console.log(`Report  : id=${reportId}  year=${year}`);

  // 2. Completion counts — same rule as src/app/api/report-completion/route.ts
  const countRows = await client.query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE achieved_value IS NOT NULL
                AND achieved_value <> ''
                AND status IS NOT NULL
            )::int AS complete
       FROM reporting_platform.indicator_data
      WHERE report_id = $1`,
    [reportId]
  );

  const { total, complete } = countRows.rows[0];
  const incomplete = total - complete;
  console.log(`\nIndicator rows : ${total} total,  ${complete} complete,  ${incomplete} incomplete`);
  console.log(`Section done   : ${total > 0 && complete === total}`);

  if (incomplete === 0) {
    console.log("\nAll rows satisfy the completion rule — nothing to investigate.");
    await client.end();
    return;
  }

  // 3. Failing rows with indicator detail
  //
  // "linked to project" = the indicator appears in the prodoc's indicator_data,
  // which is what the annual report's Indicators tab filters by. A row that is
  // NOT linked is counted by the completion query but never shown on that tab.
  const failRows = await client.query(
    `SELECT
       d.id                AS line_id,
       d.indicator_id,
       i.name              AS indicator_name,
       i.is_standard,
       i.archived_at       IS NOT NULL   AS archived,
       d.achieved_value,
       d.status,
       EXISTS (
         SELECT 1
           FROM reporting_platform.indicator_data pd
           JOIN reporting_platform.reports prodoc ON prodoc.id = pd.report_id
          WHERE prodoc.project_id = $2
            AND prodoc.data_type  = 'prodoc'
            AND pd.indicator_id   = d.indicator_id
       ) AS linked_to_project
     FROM reporting_platform.indicator_data d
     JOIN reporting_platform.indicators i ON i.id = d.indicator_id
    WHERE d.report_id = $1
      AND NOT (
        d.achieved_value IS NOT NULL
        AND d.achieved_value <> ''
        AND d.status IS NOT NULL
      )
    ORDER BY d.sort_order, d.id`,
    [reportId, projectId]
  );

  console.log(`\n── Incomplete rows (${failRows.rows.length}) ──────────────────────────────────────────────────\n`);

  for (const row of failRows.rows) {
    const kind     = row.is_standard ? "standard" : "custom";
    const archived = row.archived     ? "ARCHIVED"  : "active";
    const linked   = row.linked_to_project ? "linked to project" : "NOT linked to project ⚠";
    const av       = row.achieved_value === null ? "NULL" : row.achieved_value === "" ? '""' : JSON.stringify(row.achieved_value);
    const st       = row.status === null          ? "NULL" : JSON.stringify(row.status);

    console.log(`  line_id        : ${row.line_id}`);
    console.log(`  indicator_id   : ${row.indicator_id}`);
    console.log(`  name           : ${row.indicator_name}`);
    console.log(`  kind           : ${kind}  |  ${archived}  |  ${linked}`);
    console.log(`  achieved_value : ${av}`);
    console.log(`  status         : ${st}`);
    console.log();
  }

  await client.end();
})().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
