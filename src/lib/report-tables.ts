// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for the set of tables that hold a report's / prodoc's
// content. Several endpoints need to know "which child tables belong to a
// report" (last-edited aggregation in /api/reports, recent-activity in
// /api/reports/activity). These lists were previously hand-maintained inline in
// each file and had already drifted (activity omitted `surveys`). Keep them here
// so they can never diverge again.
//
//  • REPORT_SCOPED_TABLES        — keyed by report_id; count for every report AND
//                                  the prodoc.
//  • PRODOC_PROJECT_SCOPED_TABLES — keyed by project_id; the prodoc IS the project
//                                  definition, so these count only for the prodoc.
//                                  Counting them for annual reports would make
//                                  every year of a project share one timestamp.
//
// NOTE: `indicators` is intentionally absent — it is now a shared global
// vocabulary with no project_id, so an indicator edit is no longer one project's
// prodoc edit.
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_SCOPED_TABLES = [
  "risk_management",
  "indicator_data",
  "key_achievements",
  "partnerships",
  "results",
  "lessons_learned",
  "external_coverage",
  "testimonials",
  "surveys",
  "workplan_entries",
  "expenditure_entries",
  "transfer_data",
  "complementary_data",
] as const;

export const PRODOC_PROJECT_SCOPED_TABLES = [
  "project_narratives",
  "project_sdg_targets",
  "prodoc_signatures",
  "workplan_activities",
  "expenditure_budgets",
] as const;

export type ReportScopedTable = (typeof REPORT_SCOPED_TABLES)[number];
export type ProdocProjectScopedTable = (typeof PRODOC_PROJECT_SCOPED_TABLES)[number];
