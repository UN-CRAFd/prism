// Workplan domain helpers: quarter-key math + status metadata.
// Quarter keys are self-describing strings in the form "YYYY-Qn" (e.g. "2024-Q3").

import { optionValues, optionItems, optionLabel, optionDescription } from "@/lib/options";

// Status values are admin-editable (Settings → Dropdown options), so this is a
// plain string rather than a fixed union.
export type WorkplanStatus = string;

// Progress scale for a workplan activity (ordered as configured), read live from
// the options registry. Stored verbatim in workplan_entries.status.
export function workplanStatuses(): string[] {
  return optionValues("workplanStatus");
}

// One-line meaning shown beside the status name in the progress dropdown.
export function workplanStatusDescription(status: string): string {
  return optionDescription("workplanStatus", status);
}

// Update-window types (the configurable legend). A window is labelled [YEAR] + [code].
// The stored code is the option `value`; the full name is the option `label`.
export function workplanUpdateTypes(): { code: string; label: string }[] {
  return optionItems("workplanUpdateType").map((i) => ({ code: i.value, label: i.label }));
}
export function workplanUpdateTypeCodes(): string[] {
  return optionValues("workplanUpdateType");
}
export function workplanUpdateTypeLabel(code: string): string {
  return optionLabel("workplanUpdateType", code);
}

// Short row label for a window, e.g. "2025 · BR".
export function workplanUpdateWindowLabel(u: { year: number; type_code: string }): string {
  return `${u.year} · ${u.type_code}`;
}

// Colour treatments for the status badge, echoing the reference spreadsheet. Kept
// in code (valid Tailwind classes) and keyed by the status text; unknown/added
// statuses fall back to a neutral treatment.
const WORKPLAN_STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "Achieved": { bg: "bg-green-700", text: "text-white", border: "border-green-700" },
  "On Track": { bg: "bg-green-100", text: "text-green-800", border: "border-green-300" },
  "Delayed": { bg: "bg-yellow-100", text: "text-yellow-800", border: "border-yellow-300" },
  "At Risk": { bg: "bg-orange-100", text: "text-orange-800", border: "border-orange-300" },
  "Suspended": { bg: "bg-red-700", text: "text-white", border: "border-red-700" },
};
const WORKPLAN_STATUS_FALLBACK_COLOR = { bg: "bg-zinc-100", text: "text-zinc-700", border: "border-zinc-300" };
export function workplanStatusColor(status: string): { bg: string; text: string; border: string } {
  return WORKPLAN_STATUS_COLORS[status] ?? WORKPLAN_STATUS_FALLBACK_COLOR;
}

export interface Quarter {
  key: string; // "2024-Q3"
  year: number;
  q: number; // 1-4
}

export function formatQuarterKey(year: number, q: number): string {
  return `${year}-Q${q}`;
}

export function parseQuarter(key: string): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key.trim());
  if (!m) return null;
  return { key, year: Number(m[1]), q: Number(m[2]) };
}

// Ordered, inclusive list of quarter keys between two quarter keys.
// Returns [] for missing/invalid input. Caps at 40 quarters (10 years) as a guard.
export function quarterRange(start?: string | null, end?: string | null): string[] {
  if (!start || !end) return [];
  const s = parseQuarter(start);
  const e = parseQuarter(end);
  if (!s || !e) return [];

  const startIdx = s.year * 4 + (s.q - 1);
  const endIdx = e.year * 4 + (e.q - 1);
  if (endIdx < startIdx) return [];

  const out: string[] = [];
  for (let i = startIdx; i <= endIdx && out.length < 40; i++) {
    out.push(formatQuarterKey(Math.floor(i / 4), (i % 4) + 1));
  }
  return out;
}

// Group an ordered quarter-key list by year, preserving order.
export function groupQuartersByYear(keys: string[]): { year: number; quarters: Quarter[] }[] {
  const groups: { year: number; quarters: Quarter[] }[] = [];
  for (const key of keys) {
    const q = parseQuarter(key);
    if (!q) continue;
    let group = groups[groups.length - 1];
    if (!group || group.year !== q.year) {
      group = { year: q.year, quarters: [] };
      groups.push(group);
    }
    group.quarters.push(q);
  }
  return groups;
}

// Derive the quarter that a date falls in, as a key. Accepts "YYYY-MM-DD" etc.
export function quarterFromDate(dateStr?: string | null): string | null {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return formatQuarterKey(year, Math.floor((month - 1) / 3) + 1);
}
