// Workplan domain helpers: quarter-key math + status metadata.
// Quarter keys are self-describing strings in the form "YYYY-Qn" (e.g. "2024-Q3").

export const WORKPLAN_STATUSES = ["Behind Schedule", "On Track", "Achieved"] as const;
export type WorkplanStatus = (typeof WORKPLAN_STATUSES)[number];

// Colour treatments for the status badge, echoing the reference spreadsheet.
export const WORKPLAN_STATUS_COLORS: Record<
  WorkplanStatus,
  { bg: string; text: string; border: string }
> = {
  "Behind Schedule": { bg: "bg-red-50", text: "text-red-700", border: "border-red-300" },
  "On Track": { bg: "bg-green-50", text: "text-green-700", border: "border-green-300" },
  "Achieved": { bg: "bg-green-700", text: "text-white", border: "border-green-700" },
};

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
