// --- Narrative types ---

export interface ProjectInformation {
  projectTitle: string;
  mptfoProjectNumber: string;
  organizationName: string;
  organizationWebsite: string;
  projectStartDate: string;
  projectDuration: string;
  grantSize: string;
  implementingPartners: string;
  geographicScope: string;
  reportSubmissionDate: string;
  authorizationGranted: boolean;
}

export interface AssessmentAnswer {
  rating: string;
  justification: string;
}

export type SelfAssessmentData = Record<string, AssessmentAnswer>;

export interface AchievementEntry {
  achievement: string;
  significance: string;
  links: string;
}

export interface PartnershipEntry {
  partnerOrganization: string;
  result: string;
  links: string;
}

export interface DataUptakeEntry {
  context: string;
  dataDrivenDecision: string;
  resultingImpact: string;
  links: string;
}

export interface KeyAchievementsData {
  achievements: AchievementEntry[];
  ecosystemPartnerships: PartnershipEntry[];
  dataUptakeResults: DataUptakeEntry[];
}

export interface LessonEntry {
  category: string;
  lessonLearned: string;
  adjustmentInformed: string;
}

export interface CoverageEntry {
  type: string;
  description: string;
  reachIndicator: string;
  links: string;
}

export interface PhotoEntry {
  photoLabel: string;
  description: string;
  photoCredits: string;
}

export interface LeadershipTestimonial {
  quote: string;
  fullName: string;
  title: string;
  photoLabel: string;
  photoCredits: string;
}

export interface PartnerTestimonialEntry {
  quote: string;
  fullName: string;
  titleOrganization: string;
  photoCredits: string;
}

export interface VisibilityData {
  externalCoverage: CoverageEntry[];
  implementationPhotos: PhotoEntry[];
  leadershipTestimonial: LeadershipTestimonial;
  partnerTestimonials: PartnerTestimonialEntry[];
}

// --- Quantitative types (unchanged) ---

export interface IndicatorRow {
  id: string;
  indicator: string;
  baseline: string;
  target: string;
  achieved: string;
  comments: string;
}

// IndicatorRow kept for type compatibility (no longer used in form)
export interface IndicatorRow {
  id: string;
  indicator: string;
  baseline: string;
  target: string;
  achieved: string;
  comments: string;
}

// --- New quantitative types ---

export interface IndicatorResponse {
  achievedValue: string;
  status: string;
  comment: string;
}

export type IndicatorResponses = Record<string, IndicatorResponse>;

export interface ExpenditureEntry {
  category: string;
  approvedAnnualBudget: number;
  annualExpenditure: number;
  description: string;
  comment: string;
}

export interface RiskEntry {
  id: string;
  isExisting: boolean;
  number: number;
  title: string;
  categories: string;
  likelihood: string;
  impact: string;
  mitigationStrategy: string;
}

// Legacy — still used by work plan / funding transfer / complementary forms
export interface ExpenditureRow {
  id: string;
  category: string;
  budgeted: number;
  spent: number;
  variance: number;
  comments: string;
}

export interface WorkPlanRow {
  id: string;
  activity: string;
  q1: string;
  q2: string;
  q3: string;
  q4: string;
  status: string;
  comments: string;
}

// Legacy RiskRow kept for reference
export interface RiskRow {
  id: string;
  risk: string;
  likelihood: string;
  impact: string;
  mitigation: string;
  status: string;
}

export interface FundingTransferRow {
  id: string;
  organizationName: string;
  websiteLink: string;
  partnerType: string;
  amountTransferred: number;
  linkedActivity: string;
}

export interface ComplementaryFundingRow {
  id: string;
  contributorName: string;
  websiteLink: string;
  fundingType: string;
  totalContribution: number;
  linkedActivities: string;
}

// --- Main survey data ---

export interface SurveyData {
  partnerId: string;
  year: number;
  narrative: {
    projectInformation: ProjectInformation;
    selfAssessment: SelfAssessmentData;
    keyAchievements: KeyAchievementsData;
    lessonsLearned: LessonEntry[];
    visibilityEngagement: VisibilityData;
  };
  quantitative: {
    indicators: { responses: IndicatorResponses };
    expenditures: { entries: ExpenditureEntry[] };
    workPlan: { rows: WorkPlanRow[] };
    riskManagement: { entries: RiskEntry[] };
    fundingTransfer: { rows: FundingTransferRow[] };
    complementaryFunding: { rows: ComplementaryFundingRow[] };
  };
}

// --- Self-assessment question IDs ---

export const ASSESSMENT_QUESTION_IDS = [
  "a", "b", "c", "d", "e",
  "f", "g", "h", "i",
  "j", "k", "l", "m",
  "n", "o", "p", "r",
] as const;

// --- Defaults ---

function createEmptyAssessment(): SelfAssessmentData {
  const result: SelfAssessmentData = {};
  for (const id of ASSESSMENT_QUESTION_IDS) {
    result[id] = { rating: "", justification: "" };
  }
  return result;
}

function createEmptyEntries<T>(template: T, count: number): T[] {
  return Array.from({ length: count }, () => ({ ...template }));
}

function createEmptySurvey(partnerId: string, year: number): SurveyData {
  return {
    partnerId,
    year,
    narrative: {
      projectInformation: {
        projectTitle: "",
        mptfoProjectNumber: "",
        organizationName: "",
        organizationWebsite: "",
        projectStartDate: "",
        projectDuration: "",
        grantSize: "",
        implementingPartners: "",
        geographicScope: "",
        reportSubmissionDate: "",
        authorizationGranted: false,
      },
      selfAssessment: createEmptyAssessment(),
      keyAchievements: {
        achievements: createEmptyEntries(
          { achievement: "", significance: "", links: "" },
          3
        ),
        ecosystemPartnerships: createEmptyEntries(
          { partnerOrganization: "", result: "", links: "" },
          3
        ),
        dataUptakeResults: createEmptyEntries(
          { context: "", dataDrivenDecision: "", resultingImpact: "", links: "" },
          3
        ),
      },
      lessonsLearned: createEmptyEntries(
        { category: "", lessonLearned: "", adjustmentInformed: "" },
        5
      ),
      visibilityEngagement: {
        externalCoverage: createEmptyEntries(
          { type: "", description: "", reachIndicator: "", links: "" },
          3
        ),
        implementationPhotos: createEmptyEntries(
          { photoLabel: "", description: "", photoCredits: "" },
          5
        ),
        leadershipTestimonial: {
          quote: "",
          fullName: "",
          title: "",
          photoLabel: "",
          photoCredits: "",
        },
        partnerTestimonials: createEmptyEntries(
          { quote: "", fullName: "", titleOrganization: "", photoCredits: "" },
          3
        ),
      },
    },
    quantitative: {
      indicators: { responses: {} },
      expenditures: { entries: [] },
      workPlan: { rows: [] },
      riskManagement: { entries: [] },
      fundingTransfer: { rows: [] },
      complementaryFunding: { rows: [] },
    },
  };
}

// --- Storage ---

const STORAGE_KEY = "crafd-survey-data-v3";

export function getAllSurveyData(): SurveyData[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function getSurveyData(partnerId: string, year: number): SurveyData {
  const all = getAllSurveyData();
  const existing = all.find(
    (s) => s.partnerId === partnerId && s.year === year
  );
  return existing || createEmptySurvey(partnerId, year);
}

export function saveSurveyData(data: SurveyData): void {
  const all = getAllSurveyData();
  const index = all.findIndex(
    (s) => s.partnerId === data.partnerId && s.year === data.year
  );
  if (index >= 0) {
    all[index] = data;
  } else {
    all.push(data);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export const YEARS = [2023, 2024, 2025, 2026] as const;

export const PARTNERS = [
  { id: "acled", name: "ACLED", fullName: "Armed Conflict Location & Event Data Project" },
  { id: "iom", name: "IOM", fullName: "International Organization for Migration" },
  { id: "fhn", name: "FHN", fullName: "Famine and Hunger Network" },
] as const;

// --- Tab definitions ---

export const NARRATIVE_TABS = [
  { id: "project-info", label: "Project Information", number: "1" },
  { id: "self-assessment", label: "Self-Assessment Survey", number: "2" },
  { id: "achievements", label: "Key Achievements", number: "3" },
  { id: "lessons", label: "Lessons Learned", number: "4" },
  { id: "visibility", label: "Visibility & Engagement", number: "5" },
] as const;

export const QUANTITATIVE_TABS = [
  { id: "indicators", label: "Indicators", number: "1" },
  { id: "expenditures", label: "Expenditures", number: "2" },
  { id: "work-plan", label: "Work Plan", number: "3" },
  { id: "risk", label: "Risk Management", number: "4" },
  { id: "funding-transfer", label: "Funding Transfer", number: "5" },
  { id: "complementary", label: "Complementary Funding", number: "6" },
] as const;
