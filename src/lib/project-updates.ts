export const PROJECT_UPDATE_SECTIONS = ["workplan", "expenditure", "risk"] as const;
export type ProjectUpdateSection = (typeof PROJECT_UPDATE_SECTIONS)[number];

// A project may carry more than one update for the same year. The extra ones are
// told apart by `update_index` — free text, shown in brackets after the year, so
// the second 2027 update reads "Project Update 2027 (2)". The first update of a
// year has an empty index and reads as it always did.
export function documentTitle(r: {
  data_type?: string;
  report_type?: string | null;
  year: number;
  update_index?: string | null;
}): string {
  if (r.data_type === "update") {
    const index = r.update_index?.trim();
    return index ? `Project Update ${r.year} (${index})` : `Project Update ${r.year}`;
  }
  return `${r.report_type ?? "annual"} Report ${r.year}`;
}

export function firstUnlockedSection(unlocked: string[] | null | undefined): string {
  if (unlocked) {
    for (const k of PROJECT_UPDATE_SECTIONS) {
      if (unlocked.includes(k)) return k;
    }
  }
  return "workplan";
}

export function isValidUpdateSections(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length === 0) return false;
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return false;
    if (!(PROJECT_UPDATE_SECTIONS as readonly string[]).includes(item)) return false;
    if (seen.has(item)) return false;
    seen.add(item);
  }
  return true;
}
