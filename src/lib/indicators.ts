import labels from "@/lib/labels";

// Stable slugs stored in the DB (indicator_data.status CHECK, indicators.cycle CHECK).
// Display text lives in labels.json so it stays editable without a migration.

export type IndicatorStatus = "on_track" | "off_track" | "ahead_of_schedule" | "achieved" | "not_achieved";
export type IndicatorCycle = "yearly" | "at_closure";

// Which statuses a document offers depends on what it reports. An annual report
// (and a project update) is a progress check, so it asks whether the indicator is
// on track. A final report closes the project, so the only question left is
// whether the target was met. Statuses saved earlier still display wherever they
// appear (statusLabel / STATUS_COLORS cover every key); only the dropdown narrows.
export const PROGRESS_STATUS_KEYS: IndicatorStatus[] = ["on_track", "off_track", "ahead_of_schedule"];
export const FINAL_STATUS_KEYS: IndicatorStatus[] = ["achieved", "not_achieved"];

export function statusKeysFor(reportType: string | null | undefined): IndicatorStatus[] {
  return reportType === "final" ? FINAL_STATUS_KEYS : PROGRESS_STATUS_KEYS;
}
export const CYCLE_KEYS: IndicatorCycle[] = ["yearly", "at_closure"];
export const DEFAULT_CYCLE: IndicatorCycle = "at_closure";
export function isValidCycle(v: unknown): v is IndicatorCycle { return typeof v === "string" && (CYCLE_KEYS as string[]).includes(v); }

export function statusLabel(key: string | null | undefined): string {
  if (!key) return "";
  return labels.indicators.statuses[key as IndicatorStatus] ?? key;
}

export function cycleLabel(key: string | null | undefined): string {
  if (!key) return "";
  return labels.indicators.cycles[key as IndicatorCycle] ?? key;
}

export const STATUS_COLORS: Record<IndicatorStatus, { bg: string; text: string; border: string }> = {
  ahead_of_schedule: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  on_track:          { bg: "bg-crafd-yellow-300", text: "text-crafd-grey-800", border: "border-crafd-yellow-600" },
  off_track:         { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
  achieved:          { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  not_achieved:      { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};
