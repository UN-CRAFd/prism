/**
 * Single source of truth for the report STATUS badge colours
 * (Open / Under Review / Closed). This is REPORT status — distinct from the
 * indicator status colours in ./indicators.ts.
 *
 * Two visual variants exist: the default "light" badge (used on the admin
 * report list + cards) and the "dark" badge shown on the dark editor header.
 */

export type ReportStatus = "Open" | "Under Review" | "Closed";

export type ReportStatusVariant = "light" | "dark";

const LIGHT_STATUS_STYLES: Record<ReportStatus, string> = {
  Open:           "bg-blue-50 text-blue-700 border-blue-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Closed:         "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const DARK_STATUS_STYLES: Record<ReportStatus, string> = {
  Open:           "bg-emerald-500/15 text-emerald-300",
  "Under Review": "bg-amber-500/15 text-amber-300",
  Closed:         "bg-neutral-500/20 text-neutral-300",
};

export function reportStatusStyle(
  status: ReportStatus,
  variant: ReportStatusVariant = "light",
): string {
  const styles = variant === "dark" ? DARK_STATUS_STYLES : LIGHT_STATUS_STYLES;
  return styles[status] ?? styles.Closed;
}
