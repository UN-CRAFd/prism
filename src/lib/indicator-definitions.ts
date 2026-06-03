export interface IndicatorDefinition {
  id: string;
  number: string;
  title: string;
  description: string;
  meansOfVerification: string;
  category: string;
  valueType: "Number" | "Percentage" | "Text";
  baselineValue: string;
  baselineYear: number;
  targetValue: string;
  targetYear: number;
}

export const DEFAULT_INDICATORS: IndicatorDefinition[] = [
  {
    id: "FUNDING_CRISIS_SUPPORT",
    number: "1",
    title: "Funding allocated for crisis action with the support of project outputs",
    description:
      "This indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action. The indicator focuses on the amount of funding allocated to crisis action that can be directly / indirectly attributed to the use of project outputs, such as data, evidence, and analysis, in decision-making processes.",
    meansOfVerification: "Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.",
    category: "Investment",
    valueType: "Number",
    baselineValue: "0",
    baselineYear: 2023,
    targetValue: "0",
    targetYear: 2026,
  },
  {
    id: "FUNDING_FRAGILE_SETTINGS",
    number: "1.1",
    title: "Funding allocated for crisis action specifically in fragile settings",
    description:
      "This sub-indicator aims to measure the extent to which the project outputs are used to facilitate funding decisions related to crisis action specifically in fragile contexts. The indicator focuses on the amount of funding allocated to crisis action that can be directly / indirectly attributed to the use of project outputs, such as data, evidence, and analysis, in decision-making processes.",
    meansOfVerification: "Surveys, interviews, analysis of public policy documents / emergency response plans / reports, other documents.",
    category: "Investment",
    valueType: "Number",
    baselineValue: "0",
    baselineYear: 2023,
    targetValue: "0",
    targetYear: 2026,
  },
  {
    id: "PROJECT_PARTNERS_INVOLVED",
    number: "2",
    title: "Project partners involved in the implementation of the project",
    description:
      "This indicator aims to measure the number of project partners ('participating organizations' and 'implementing partners') involved in the implementation of the project.",
    meansOfVerification: "Internal tracking.",
    category: "Capacity",
    valueType: "Number",
    baselineValue: "0",
    baselineYear: 2024,
    targetValue: "0",
    targetYear: 2026,
  },
  {
    id: "PROJECT_PARTNERS_FRAGILE",
    number: "2.1",
    title: "Project partners from fragile and/or crisis-affected settings",
    description:
      "This sub-indicator aims to measure the number of project partners specifically from fragile and/or crisis affected settings directly (participating organizations) and indirectly (implementing partners) involved in the management of the project.",
    meansOfVerification: "Internal tracking.",
    category: "Capacity",
    valueType: "Number",
    baselineValue: "0",
    baselineYear: 2024,
    targetValue: "0",
    targetYear: 2026,
  },
  {
    id: "DATASETS_PROVIDED",
    number: "3",
    title: "Datasets provided by the project",
    description:
      "This indicator aims to measure the provision and dissemination of datasets by the project to stakeholders.",
    meansOfVerification: "Internal tracking.",
    category: "Capacity",
    valueType: "Number",
    baselineValue: "0",
    baselineYear: 2024,
    targetValue: "0",
    targetYear: 2026,
  },
];

export const INDICATOR_STATUS_OPTIONS = [
  "Ahead of schedule",
  "On track",
  "Off track",
  "Not started",
  "N/A",
];

// --- Expenditure categories ---

export interface ExpenditureCategoryDef {
  key: string;
  label: string;
  isSubtotal?: boolean;
  isTotal?: boolean;
  readOnly?: boolean; // computed rows
}

export const EXPENDITURE_CATEGORIES: ExpenditureCategoryDef[] = [
  { key: "staff", label: "Staff and other personnel" },
  { key: "supplies", label: "Supplies, commodities, materials" },
  { key: "equipment", label: "Equipment, vehicles, & furniture" },
  { key: "contractual", label: "Contractual services" },
  { key: "travel", label: "Travel" },
  { key: "transfers", label: "Transfers & grants to counterparts" },
  { key: "general", label: "General operating & other direct costs" },
  { key: "subtotal", label: "Project costs sub total", isSubtotal: true, readOnly: true },
  { key: "isc", label: "Indirect support costs (7%)", readOnly: true },
  { key: "total", label: "Total", isTotal: true, readOnly: true },
];

// --- Default risks ---

export interface RiskDefinition {
  id: string;
  number: number;
  title: string;
  categories: string;
  defaultLikelihood: string;
  defaultImpact: string;
  defaultMitigation: string;
}

export const DEFAULT_RISKS: RiskDefinition[] = [
  {
    id: "r1",
    number: 1,
    title: "High rates of hallucinations and other inaccuracies/error rates from LLM based front end",
    categories: "Technological",
    defaultLikelihood: "Possible",
    defaultImpact: "Minor",
    defaultMitigation: "",
  },
  {
    id: "r2",
    number: 2,
    title: "LLM interface with data warehouse/API is not developed accurately",
    categories: "Operational, Organizational, Political",
    defaultLikelihood: "Possible",
    defaultImpact: "Moderate",
    defaultMitigation: "",
  },
  {
    id: "r3",
    number: 3,
    title: "There is bias and lack of objectivity in the product development process. Inherent bias and systemic racism exist in LLM models already trained",
    categories: "Operational, Organizational, Political",
    defaultLikelihood: "Possible",
    defaultImpact: "Minor",
    defaultMitigation: "",
  },
  {
    id: "r4",
    number: 4,
    title: "Different data source owners can deploy their own LLMs to interact with data warehouses",
    categories: "Strategic",
    defaultLikelihood: "Rare",
    defaultImpact: "Extreme",
    defaultMitigation: "",
  },
  {
    id: "r5",
    number: 5,
    title: "Reduced demand for cleaned/structured based API datasets",
    categories: "Operational, Strategic",
    defaultLikelihood: "Unlikely",
    defaultImpact: "Minor",
    defaultMitigation: "",
  },
];

export const LIKELIHOOD_OPTIONS = [
  "Unlikely",
  "Rare",
  "Possible",
  "Likely",
  "Almost Certain",
];

export const IMPACT_OPTIONS = ["Minor", "Moderate", "Major", "Extreme"];

const LIKELIHOOD_SCORES: Record<string, number> = {
  Unlikely: 1, Rare: 2, Possible: 3, Likely: 4, "Almost Certain": 5,
};
const IMPACT_SCORES: Record<string, number> = {
  Minor: 1, Moderate: 2, Major: 3, Extreme: 4,
};

export function computeRiskLevel(
  likelihood: string,
  impact: string
): { level: string; score: number } | null {
  const l = LIKELIHOOD_SCORES[likelihood];
  const i = IMPACT_SCORES[impact];
  if (!l || !i) return null;
  const score = l * i;
  let level: string;
  if (score <= 2) level = "Low";
  else if (score <= 5) level = "Medium";
  else if (score <= 9) level = "High";
  else level = "Extreme";
  return { level, score };
}

export const RISK_LEVEL_STYLES: Record<string, string> = {
  Low: "bg-green-50 text-green-700 border-green-200",
  Medium: "bg-amber-50 text-amber-700 border-amber-200",
  High: "bg-orange-50 text-orange-700 border-orange-200",
  Extreme: "bg-rose-50 text-rose-700 border-rose-200",
};
