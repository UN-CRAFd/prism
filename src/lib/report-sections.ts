import labels from "@/lib/labels";

// The ordered list of partner-report sections. Shared by the report-editor tab
// bar and the sidebar sub-menu so the two can never drift. `value` is the URL
// segment used in /partner/report-editor/[project]/[year]/[section].

export type ReportSectionGroup = "Qualitative" | "Quantitative";

export interface ReportSection {
  value: string;
  label: string;
  group: ReportSectionGroup;
}

// Per-group accent colors, so the two report-section groups are visually
// distinct wherever they're listed. Shared by the partner sidebar sub-menu and
// the admin tab bar so the colors can never drift. Qualitative keeps the CRAF'd
// brand yellow; Quantitative uses a contrasting blue. Class strings are written
// out in full (not composed) so Tailwind's scanner keeps them.
export interface GroupStyle {
  /** Active pill in the partner sidebar (soft tinted background + colored text). */
  sidebarActive: string;
  /** Active underline tab in the admin tab bar. */
  tabActive: string;
  /** Group header / label text. */
  header: string;
}

export const GROUP_STYLES: Record<ReportSectionGroup, GroupStyle> = {
  Qualitative: {
    sidebarActive: "bg-crafd-yellow/10 text-crafd-yellow",
    tabActive: "border-crafd-yellow text-crafd-yellow",
    header: "text-crafd-yellow",
  },
  Quantitative: {
    sidebarActive: "bg-sky-500/10 text-sky-600",
    tabActive: "border-sky-500 text-sky-600",
    header: "text-sky-600",
  },
};

// `label` is a getter so it re-reads the (possibly admin-overridden) labels
// singleton on every access, rather than snapshotting the default at module load
// — the array itself is built once at import, before overrides are applied.
export const REPORT_SECTIONS: ReportSection[] = [
  // Qualitative: Overview → External Coverage
  { value: "overview", get label() { return labels.sections.overview; }, group: "Qualitative" },
  { value: "surveys", get label() { return labels.sections.surveys; }, group: "Qualitative" },
  { value: "achievements", get label() { return labels.sections.keyAchievements; }, group: "Qualitative" },
  { value: "partnerships", get label() { return labels.sections.partnerships; }, group: "Qualitative" },
  { value: "results", get label() { return labels.sections.results; }, group: "Qualitative" },
  { value: "lessons", get label() { return labels.sections.lessons; }, group: "Qualitative" },
  { value: "external-coverage", get label() { return labels.sections.externalCoverage; }, group: "Qualitative" },
  { value: "testimonials", get label() { return labels.sections.testimonials; }, group: "Qualitative" },
  // Quantitative: Indicators → Complementary Funding
  { value: "indicators", get label() { return labels.sections.indicators; }, group: "Quantitative" },
  { value: "workplan", get label() { return labels.sections.workplan; }, group: "Quantitative" },
  { value: "expenditure", get label() { return labels.sections.expenditure; }, group: "Quantitative" },
  { value: "risk", get label() { return labels.sections.risk; }, group: "Quantitative" },
  { value: "transfers", get label() { return labels.sections.transfers; }, group: "Quantitative" },
  { value: "complementary", get label() { return labels.sections.complementary; }, group: "Quantitative" },
];

// Sections grouped in order, for rendering group headers in the sidebar.
export const REPORT_SECTION_GROUPS: { label: ReportSectionGroup; sections: ReportSection[] }[] = [
  { label: "Qualitative", sections: REPORT_SECTIONS.filter((s) => s.group === "Qualitative") },
  { label: "Quantitative", sections: REPORT_SECTIONS.filter((s) => s.group === "Quantitative") },
];

// Given a pathname, return the report context when the user is inside the
// report editor (/partner/report-editor/{project}/{year}/{section}), else null.
export function parseReportPath(pathname: string): { project: string; year: string; section: string } | null {
  const parts = pathname.split("/").filter(Boolean); // ["partner", "report-editor", project, year, section]
  if (parts[0] !== "partner" || parts[1] !== "report-editor" || parts.length < 5) return null;
  // A report path always has a 4-digit year in the fourth slot.
  if (!/^\d{4}$/.test(parts[3])) return null;
  return { project: parts[2], year: parts[3], section: parts[4] };
}
