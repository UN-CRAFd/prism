/**
 * Single source of truth for the report STATUS badge colours
 * (Open / Under Review / Partner Review / Closed; project documents use Open /
 * Under Review / Partner Review / Approved). Open and Partner Review are the
 * partner-editable statuses (see ./report-status.ts). This is REPORT status — distinct from the
 * indicator status colours in ./indicators.ts.
 *
 * Two visual variants exist: the default "light" badge (used on the admin
 * report list + cards) and the "dark" badge shown on the dark editor header.
 */

// Status VALUES are fixed (Settings only lets admins rename the labels), but this
// stays a plain string. Badge styles below are keyed by the status value with a
// neutral fallback for anything unknown.
export type ReportStatus = string;

export type ReportStatusVariant = "light" | "dark";

export const LIGHT_STATUS_STYLES: Record<string, string> = {
  Open:           "bg-crafd-yellow-100 text-crafd-grey-800 border-crafd-yellow-600",
  "Under Review": "bg-crafd-grey-100 text-crafd-grey-800 border-crafd-grey-200",
  "Partner Review": "bg-crafd-yellow-100 text-crafd-grey-800 border-crafd-yellow-600",
  Closed:         "bg-white text-crafd-grey-400 border-crafd-grey-100",
  Approved:       "bg-green-50 text-green-900 border-green-200",
};

// Icon colour per status, shared by the admin report + project-update lists.
export const REPORT_STATUS_ICON_COLORS: Record<string, string> = {
  Open:           "text-crafd-yellow-900",
  "Under Review": "text-crafd-grey-600",
  "Partner Review": "text-crafd-yellow-900",
  Closed:         "text-crafd-grey-400",
  Approved:       "text-green-600",
};

const DARK_STATUS_STYLES: Record<string, string> = {
  Open:           "bg-crafd-yellow-600 text-crafd-grey-900",
  "Under Review": "bg-crafd-grey-100 text-crafd-grey-900",
  "Partner Review": "bg-crafd-yellow-600 text-crafd-grey-900",
  Closed:         "bg-crafd-grey-100 text-crafd-grey-900",
  Approved:       "bg-green-100 text-green-900",
};

export function reportStatusStyle(
  status: ReportStatus,
  variant: ReportStatusVariant = "light",
): string {
  const styles = variant === "dark" ? DARK_STATUS_STYLES : LIGHT_STATUS_STYLES;
  return styles[status] ?? styles.Closed;
}
