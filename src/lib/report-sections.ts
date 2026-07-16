import labels from "@/lib/labels.json";

// The ordered list of partner-report sections. Shared by the report-editor tab
// bar and the sidebar sub-menu so the two can never drift. `value` is the URL
// segment used in /partner/[project]/[year]/[section].

export type ReportSectionGroup = "Qualitative" | "Quantitative";

export interface ReportSection {
  value: string;
  label: string;
  group: ReportSectionGroup;
}

export const REPORT_SECTIONS: ReportSection[] = [
  // Qualitative: Overview → External Coverage
  { value: "overview", label: labels.sections.overview, group: "Qualitative" },
  { value: "surveys", label: labels.sections.surveys, group: "Qualitative" },
  { value: "achievements", label: labels.sections.keyAchievements, group: "Qualitative" },
  { value: "partnerships", label: labels.sections.partnerships, group: "Qualitative" },
  { value: "results", label: labels.sections.results, group: "Qualitative" },
  { value: "lessons", label: labels.sections.lessons, group: "Qualitative" },
  { value: "external-coverage", label: labels.sections.externalCoverage, group: "Qualitative" },
  // Quantitative: Risk Management → Complementary
  { value: "risk", label: labels.sections.risk, group: "Quantitative" },
  { value: "indicators", label: labels.sections.indicators, group: "Quantitative" },
  { value: "workplan", label: labels.sections.workplan, group: "Quantitative" },
  { value: "expenditure", label: labels.sections.expenditure, group: "Quantitative" },
  { value: "transfers", label: labels.sections.transfers, group: "Quantitative" },
  { value: "complementary", label: labels.sections.complementary, group: "Quantitative" },
];

// Sections grouped in order, for rendering group headers in the sidebar.
export const REPORT_SECTION_GROUPS: { label: ReportSectionGroup; sections: ReportSection[] }[] = [
  { label: "Qualitative", sections: REPORT_SECTIONS.filter((s) => s.group === "Qualitative") },
  { label: "Quantitative", sections: REPORT_SECTIONS.filter((s) => s.group === "Quantitative") },
];

// Given a pathname, return the report context when the user is inside the
// report editor (/partner/{project}/{year}/{section}), else null.
export function parseReportPath(pathname: string): { project: string; year: string; section: string } | null {
  const parts = pathname.split("/").filter(Boolean); // ["partner", project, year, section]
  if (parts[0] !== "partner" || parts.length < 4) return null;
  return { project: parts[1], year: parts[2], section: parts[3] };
}
