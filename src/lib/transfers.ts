import labels from "@/lib/labels.json";

// Transfers to implementing partners: the receiving organisation's "type" is a
// free string chosen from a fixed list (same pattern as external-coverage types
// and lessons categories — stored verbatim, no slug mapping needed).

export const PARTNER_TYPES: string[] = labels.transfers.partnerTypes;

export interface ActivityRef {
  id: number;
  activity_num: string | null;
  activity_text: string | null;
}

// "Activity 3.1: Develop and implement…" — mirrors the reference spreadsheet.
export function activityLabel(a: ActivityRef | null | undefined): string {
  if (!a) return "";
  const num = a.activity_num ? `Activity ${a.activity_num}` : "Activity";
  return a.activity_text ? `${num}: ${a.activity_text}` : num;
}

// Format a stored numeric amount for display, grouped with thousands separators.
export function formatAmount(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "";
  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
