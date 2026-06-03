export interface AssessmentQuestion {
  id: string;
  text: string;
}

export interface AssessmentSection {
  id: string;
  number: string;
  title: string;
  questions: AssessmentQuestion[];
}

export interface SurveyTemplate {
  partnerId: string; // "default" = applies to all partners
  year: number | null; // null = applies to all years
  selfAssessmentSections: AssessmentSection[];
  updatedAt: string;
}

export const DEFAULT_SECTIONS: AssessmentSection[] = [
  {
    id: "s1",
    number: "2.1",
    title: "Data quality",
    questions: [
      { id: "a", text: "To what extent has the project ensured transparency and public accessibility of its data, insights, and methodologies?" },
      { id: "b", text: "To what extent has the project applied open standards, machine-readable formats, and interoperable approaches (e.g. APIs)?" },
      { id: "c", text: "To what extent has the project ensured the accuracy, completeness, and reliability of its data or insights through validation or peer-review processes?" },
      { id: "d", text: "To what extent has the project implemented responsible data practices, including informed consent, privacy, confidentiality, fairness, and risk mitigation?" },
      { id: "e", text: "To what extent has gender expertise or inclusive analysis (e.g. sex, age, disability) been incorporated into the design, collection, or validation of the data or insights?" },
    ],
  },
  {
    id: "s2",
    number: "2.2",
    title: "Ecosystem and collaboration",
    questions: [
      { id: "f", text: "To what extent has the project strengthened data- or insights-sharing and collaboration among ecosystem partners?" },
      { id: "g", text: "To what extent has the project strengthened sustained partnerships with organizations operating in fragile and crisis-affected settings?" },
      { id: "h", text: "To what extent have local and national actors been meaningfully involved in the design, collection, validation, or use of the project's data or insights?" },
      { id: "i", text: "To what extent has the project built or strengthened partnerships with women-led or feminist organizations that influenced the analysis or use of data or insights?" },
    ],
  },
  {
    id: "s3",
    number: "2.3",
    title: "Data uptake and use",
    questions: [
      { id: "j", text: "To what extent have the project's data or insights informed funding or resource allocation decisions that improved the timing, targeting, or dignity of crisis action in fragile and crisis-affected settings?" },
      { id: "k", text: "To what extent have the project's data or insights strengthened anticipatory action or early warning / early action capabilities of partners?" },
      { id: "l", text: "To what extent have the project's data or insights contributed to earlier, faster, or more targeted assistance to affected populations?" },
      { id: "m", text: "To what extent have the project's data or insights enabled partners to analyze and address the gendered impacts of crises?" },
    ],
  },
  {
    id: "s4",
    number: "2.4",
    title: "Contribution of CRAF'd funding",
    questions: [
      { id: "n", text: "To what extent has CRAF'd funding enabled your organization to pursue new or expanded areas of work that would otherwise not have been possible?" },
      { id: "o", text: "To what extent has CRAF'd funding strengthened your organization's data, analytical, or technical capabilities and the overall quality of your work?" },
      { id: "p", text: "To what extent has CRAF'd funding helped reduce transaction costs and improve the efficiency of grant management or delivery?" },
      { id: "r", text: "To what extent has CRAF'd funding supported the development of a more sustainable or predictable funding model for your project or organization?" },
    ],
  },
];

const STORAGE_KEY = "crafd-survey-templates";

function loadAll(): SurveyTemplate[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

function saveAll(templates: SurveyTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function templateKey(partnerId: string, year: number | null) {
  return `${partnerId}::${year ?? "all"}`;
}

export function getAllTemplates(): SurveyTemplate[] {
  return loadAll();
}

export function getStoredTemplate(
  partnerId: string,
  year: number | null
): SurveyTemplate | null {
  const all = loadAll();
  return (
    all.find(
      (t) => t.partnerId === partnerId && t.year === year
    ) ?? null
  );
}

/** Resolution order: partner+year → partner+null → default+year → default+null → hardcoded */
export function resolveTemplate(
  partnerId: string,
  year: number
): { sections: AssessmentSection[]; source: string } {
  const candidates: [string, number | null][] = [
    [partnerId, year],
    [partnerId, null],
    ["default", year],
    ["default", null],
  ];

  for (const [pid, y] of candidates) {
    const t = getStoredTemplate(pid, y);
    if (t) {
      const label =
        pid === "default" && y === null
          ? "Global default (custom)"
          : pid === "default"
          ? `Global default for ${y} (custom)`
          : y === null
          ? `${pid.toUpperCase()} (all years, custom)`
          : `${pid.toUpperCase()} ${y} (custom)`;
      return { sections: t.selfAssessmentSections, source: label };
    }
  }

  return { sections: DEFAULT_SECTIONS, source: "Built-in default" };
}

export function saveTemplate(template: SurveyTemplate): void {
  const all = loadAll();
  const idx = all.findIndex(
    (t) => t.partnerId === template.partnerId && t.year === template.year
  );
  if (idx >= 0) {
    all[idx] = template;
  } else {
    all.push(template);
  }
  saveAll(all);
}

export function deleteTemplate(partnerId: string, year: number | null): void {
  const all = loadAll().filter(
    (t) => !(t.partnerId === partnerId && t.year === year)
  );
  saveAll(all);
}

export function hasCustomTemplate(
  partnerId: string,
  year: number | null
): boolean {
  return getStoredTemplate(partnerId, year) !== null;
}

export function renumberSections(sections: AssessmentSection[]): AssessmentSection[] {
  return sections.map((s, i) => ({ ...s, number: `2.${i + 1}` }));
}
