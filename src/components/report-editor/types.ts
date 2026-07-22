// Internal state shapes for the parent-managed report-editor sections
// (surveys, overview, risk, indicators). The canonical Report type lives in
// @/lib/types; these are only the editor's per-section working state.

export interface Survey {
  id: number;
  report_id: number;
  question: string;
  assessment: number | null;
  context: string | null;
}

export interface RowState {
  assessment: number | null;
  context: string;
  dirty: boolean;
}

export interface OverviewData {
  project_title: string;
  mptfo_project_number: string;
  organization_name: string;
  organization_website: string;
  grant_size_usd: string;
  implementing_partners: string;
  geographic_scope: string;
  report_submission_date: string;
  project_start_date: string;
  project_duration_months: string;
  authorized: boolean;
}

export const EMPTY_OVERVIEW: OverviewData = {
  project_title: "",
  mptfo_project_number: "",
  organization_name: "",
  organization_website: "",
  grant_size_usd: "",
  implementing_partners: "",
  geographic_scope: "",
  report_submission_date: "",
  project_start_date: "",
  project_duration_months: "",
  authorized: false,
};

export interface Risk {
  id: number;
  report_id: number;
  risk_name: string;
  risk_category: string[] | null;
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string | null;
  updated_mitigation: string | null;
  project_revision: boolean;
}

export interface RiskState {
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string;
  updated_mitigation: string;
  project_revision: boolean;
  dirty: boolean;
}

export interface IndicatorYearCell {
  id: number;
  report_id: number;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
}

export interface IndicatorMatrixRow {
  indicator_id: number;
  indicator_name: string;
  indicator_description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  currentLineId: number;
  byYear: Record<number, IndicatorYearCell | undefined>;
}

export interface IndicatorState {
  achieved_value: string;
  status: string | null;
  comment: string;
  dirty: boolean;
}

// Undo/redo is command-based: each edit (and each row delete) pushes a command
// that knows how to reverse and replay itself. Delete commands re-create the row
// on the server, so an undone deletion is fully restored (not just re-typed).
export interface HistoryCommand {
  undo: () => void;
  redo: () => void;
}
