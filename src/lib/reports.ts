/**
 * Single source of truth for the report STATUS badge colours
 * (Open / Under Review / Closed). This is REPORT status — distinct from the
 * indicator status colours in ./indicators.ts.
 *
 * Two visual variants exist: the default "light" badge (used on the admin
 * report list + cards) and the "dark" badge shown on the dark editor header.
 */

// Report status values are admin-editable (Settings → Dropdown options), so this
// is a plain string. Badge styles below are keyed by the status text with a
// neutral fallback for unknown/added statuses.
export type ReportStatus = string;

export type ReportStatusVariant = "light" | "dark";

export const LIGHT_STATUS_STYLES: Record<string, string> = {
  Open:           "bg-crafd-yellow-100 text-crafd-yellow-900 border-crafd-yellow-600",
  "Under Review": "bg-crafd-grey-100 text-crafd-grey-800 border-crafd-grey-200",
  Closed:         "bg-white text-crafd-grey-400 border-crafd-grey-100",
};

// Icon colour per status, shared by the admin report + project-update lists.
export const REPORT_STATUS_ICON_COLORS: Record<string, string> = {
  Open:           "text-crafd-yellow-900",
  "Under Review": "text-crafd-grey-600",
  Closed:         "text-crafd-grey-400",
};

const DARK_STATUS_STYLES: Record<string, string> = {
  Open:           "bg-crafd-yellow/15 text-crafd-yellow-600",
  "Under Review": "bg-white/15 text-crafd-grey-200",
  Closed:         "bg-white/10 text-crafd-grey-400",
};

export function reportStatusStyle(
  status: ReportStatus,
  variant: ReportStatusVariant = "light",
): string {
  const styles = variant === "dark" ? DARK_STATUS_STYLES : LIGHT_STATUS_STYLES;
  return styles[status] ?? styles.Closed;
}
