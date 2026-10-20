// Every page a project update can show, in the order they appear as tabs. Each
// one is produced by a module group in the matrix (see lib/update-modules.ts):
// an update unlocks exactly the pages its selected modules map to.
//
// `justification` and `hact` exist only on updates — they are not annual-report
// sections — which is why updates render from UPDATE_SECTIONS (lib/update-sections.ts)
// rather than REPORT_SECTIONS.
// Order follows the annual report's own tab order, with the two update-only
// pages slotted in: Justification leads (it is the "why" of the update) and HACT
// Recommendations sits with Risk Management, which it accompanies on a tranche
// release. `overview` is first and is not optional — see ALWAYS_UPDATE_SECTIONS.
export const PROJECT_UPDATE_SECTIONS = [
  "overview",
  "justification",
  "surveys",
  "achievements",
  "partnerships",
  "results",
  "lessons",
  "external-coverage",
  "testimonials",
  "workplan",
  "indicators",
  "expenditure",
  "hact",
  "risk",
  "transfers",
  "complementary",
] as const;

// Pages every project update carries, whatever its modules. Overview holds the
// project details and the authorization checkbox, exactly as on an annual report,
// so an update is never without them.
export const ALWAYS_UPDATE_SECTIONS: readonly ProjectUpdateSection[] = ["overview"];
export type ProjectUpdateSection = (typeof PROJECT_UPDATE_SECTIONS)[number];

// ── Addressing a document ───────────────────────────────────────────────────
//
// A project can carry several updates in the same year, so the path
// {project}/{year}/{section} does NOT identify one — all of 2027 "(2)", "(3)"
// and "(4)" collapse onto the same URL. The document id is appended as `?u=`
// to pin it exactly.
//
// The id is used rather than the index because it is unique by construction:
// no parsing rule, no reserved character and no duplicate index can make it
// ambiguous. `update_index` is free text and would need escaping rules that
// could themselves break.
//
// Reports and prodocs are already unique per (project, year, type), so they get
// no suffix and their URLs are unchanged.

export const DOC_ID_PARAM = "u";

export function documentQuery(r: { id: number; data_type?: string }): string {
  return r.data_type === "update" ? `?${DOC_ID_PARAM}=${r.id}` : "";
}

/** Pick the one document a URL refers to, out of those matching its path.
 *
 *  THE single resolver — every place that needs "which document is open" must
 *  call this. Anything matching by (project, year) on its own silently returns
 *  a sibling once a year holds more than one update.
 *
 *  `pinnedId` is honoured only if it is among `candidates`, which the caller has
 *  already narrowed to the URL's project and year. A pin for another project,
 *  another year, or nothing at all therefore cannot redirect the user — it falls
 *  through to the sorted fallback. That fallback is deterministic (the year's
 *  un-indexed original first, then lowest id), never "whatever the API returned
 *  first". */
export function resolveDocument<
  T extends { id: number; update_index?: string | null },
>(candidates: T[], pinnedId: number | null | undefined): T | undefined {
  const pinned = candidates.find((r) => r.id === pinnedId);
  if (pinned) return pinned;
  return [...candidates].sort(
    (a, b) =>
      Number(Boolean(a.update_index?.trim())) - Number(Boolean(b.update_index?.trim())) ||
      a.id - b.id
  )[0];
}

/** Full editor path for a document, pinned so it can never resolve to a sibling. */
export function documentPath(
  basePath: string,
  r: { id: number; data_type?: string; year: number },
  slug: string,
  section: string
): string {
  return `${basePath}/${slug}/${r.year}/${section}${documentQuery(r)}`;
}

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
  if (r.data_type === "prodoc") return "Project Document";
  // Capitalised here rather than left to a CSS `capitalize` at each call site,
  // so the title reads correctly wherever it is used — including as plain text.
  const type = r.report_type ?? "annual";
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} Report ${r.year}`;
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
