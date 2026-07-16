import labels from "@/lib/labels.json";

// The ordered list of partner-report sections. Shared by the report-editor tab
// bar and the sidebar sub-menu so the two can never drift. `value` is the URL
// segment used in /partner/[project]/[year]/[section].

export interface ReportSection {
  value: string;
  label: string;
}

export const REPORT_SECTIONS: ReportSection[] = [
  { value: "overview", label: labels.sections.overview },
  { value: "surveys", label: labels.sections.surveys },
  { value: "achievements", label: labels.sections.keyAchievements },
  { value: "partnerships", label: labels.sections.partnerships },
  { value: "results", label: labels.sections.results },
  { value: "lessons", label: labels.sections.lessons },
  { value: "external-coverage", label: labels.sections.externalCoverage },
  { value: "risk", label: labels.sections.risk },
  { value: "indicators", label: labels.sections.indicators },
  { value: "workplan", label: labels.sections.workplan },
  { value: "expenditure", label: labels.sections.expenditure },
  { value: "transfers", label: labels.sections.transfers },
  { value: "complementary", label: labels.sections.complementary },
];

// Given a pathname, return the report context when the user is inside the
// report editor (/partner/{project}/{year}/{section}), else null.
export function parseReportPath(pathname: string): { project: string; year: string; section: string } | null {
  const parts = pathname.split("/").filter(Boolean); // ["partner", project, year, section]
  if (parts[0] !== "partner" || parts.length < 4) return null;
  return { project: parts[1], year: parts[2], section: parts[3] };
}
