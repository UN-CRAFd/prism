import labels from "@/lib/labels.json";

// Stable slugs stored in the DB (indicator_data.status CHECK, indicators.cycle CHECK).
// Display text lives in labels.json so it stays editable without a migration.

export type IndicatorStatus = "on_track" | "off_track" | "ahead_of_schedule";
export type IndicatorCycle = "yearly" | "at_closure";

export const STATUS_KEYS: IndicatorStatus[] = ["on_track", "off_track", "ahead_of_schedule"];
export const CYCLE_KEYS: IndicatorCycle[] = ["yearly", "at_closure"];

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
  on_track:          { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  off_track:         { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};
