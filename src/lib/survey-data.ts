export interface SurveyData {
  partnerId: string;
  year: number;
  narrative: {
    projectInformation: {
      projectTitle: string;
      projectNumber: string;
      reportingPeriod: string;
      projectManager: string;
      email: string;
      totalBudget: string;
      startDate: string;
      endDate: string;
      summary: string;
    };
    selfAssessment: {
      overallProgress: string;
      timelinessRating: string;
      budgetUtilization: string;
      partnershipQuality: string;
      comments: string;
    };
    keyAchievements: {
      achievements: string;
      unexpectedResults: string;
      contributions: string;
    };
    lessonsLearned: {
      lessons: string;
      challenges: string;
      recommendations: string;
    };
    visibilityEngagement: {
      publications: string;
      events: string;
      mediaEngagement: string;
      partnerships: string;
    };
  };
  quantitative: {
    indicators: {
      rows: IndicatorRow[];
    };
    expenditures: {
      rows: ExpenditureRow[];
    };
    workPlan: {
      rows: WorkPlanRow[];
    };
    riskManagement: {
      rows: RiskRow[];
    };
    fundingTransfer: {
      rows: FundingTransferRow[];
    };
    complementaryFunding: {
      rows: ComplementaryFundingRow[];
    };
  };
}

export interface IndicatorRow {
  id: string;
  indicator: string;
  baseline: string;
  target: string;
  achieved: string;
  comments: string;
}

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
  implementingPartner: string;
  amount: number;
  dateTransferred: string;
  purpose: string;
  status: string;
}

export interface ComplementaryFundingRow {
  id: string;
  source: string;
  amount: number;
  purpose: string;
  status: string;
}

function createEmptySurvey(partnerId: string, year: number): SurveyData {
  return {
    partnerId,
    year,
    narrative: {
      projectInformation: {
        projectTitle: "",
        projectNumber: "",
        reportingPeriod: `January - December ${year}`,
        projectManager: "",
        email: "",
        totalBudget: "",
        startDate: "",
        endDate: "",
        summary: "",
      },
      selfAssessment: {
        overallProgress: "",
        timelinessRating: "",
        budgetUtilization: "",
        partnershipQuality: "",
        comments: "",
      },
      keyAchievements: {
        achievements: "",
        unexpectedResults: "",
        contributions: "",
      },
      lessonsLearned: {
        lessons: "",
        challenges: "",
        recommendations: "",
      },
      visibilityEngagement: {
        publications: "",
        events: "",
        mediaEngagement: "",
        partnerships: "",
      },
    },
    quantitative: {
      indicators: { rows: [] },
      expenditures: { rows: [] },
      workPlan: { rows: [] },
      riskManagement: { rows: [] },
      fundingTransfer: { rows: [] },
      complementaryFunding: { rows: [] },
    },
  };
}

const STORAGE_KEY = "crafd-survey-data";

export function getAllSurveyData(): SurveyData[] {
  if (typeof window === "undefined") return [];
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
}

export function getSurveyData(
  partnerId: string,
  year: number
): SurveyData {
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
