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
  authorized?: boolean;
  data_type?: "report" | "prodoc";
  partner_long_name?: string | null;
  indicator_count?: number;
  mptfo_project_number?: string | null;
  grant_size_usd?: string | null;
  geographic_scope?: string | null;
  project_start_date?: string | null;
  project_duration_months?: number | null;
  organization_website?: string | null;
}
