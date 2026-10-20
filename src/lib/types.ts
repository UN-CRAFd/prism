import type { ReportStatus } from "./reports";

/**
 * Canonical report shape. Superset of the per-file interfaces that used to be
 * copy-pasted around the app (report editor, admin lists, partner dashboard,
 * data explorer, PDF export). Fields present in every consumer are required;
 * anything only some consumers carry is optional so every call site stays sound.
 */
export interface Report {
  id: number;
  project_id: number;
  year: number;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  status: ReportStatus;
  created_at: string;

  report_type?: "annual" | "final" | null;
  report_submission_date?: string | null;
  submitted_at?: string | null;
  authorized?: boolean;
  data_type?: "report" | "prodoc" | "update";
  unlocked_sections?: string[];
  /** Project update only: the update categories it covers (matrix columns). */
  update_types?: string[];
  /** Project update only: the modules it contains (matrix rows). */
  update_modules?: string[];
  /** Project update only: extension length, when it includes a months module. */
  update_months?: number | null;
  /** Project update only: free-text tag telling apart several updates in one
   *  year ("Project Update 2027 (2)"). Empty for the year's first update. */
  update_index?: string | null;
  last_edited?: string | null;
  partner_long_name?: string | null;
  indicator_count?: number;
  mptfo_project_number?: string | null;
  grant_size_usd?: string | null;
  geographic_scope?: string | null;
  project_start_date?: string | null;
  project_duration_months?: number | null;
  organization_website?: string | null;
}
