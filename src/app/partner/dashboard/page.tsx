"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getSurveyData,
  YEARS,
  PARTNERS,
  type SurveyData,
} from "@/lib/survey-data";
import { DEFAULT_SECTIONS } from "@/lib/survey-template";
import { DEFAULT_INDICATORS, EXPENDITURE_CATEGORIES } from "@/lib/indicator-definitions";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, AlertCircle, ArrowRight, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

// ── Types ──────────────────────────────────────────────────────────────────

type SectionState = "complete" | "started" | "empty";

interface SectionStatus {
  id: string;
  label: string;
  state: SectionState;
  detail: string;
  tab: string;
}

interface YearProgress {
  year: number;
  percentage: number;
  completedSections: number;
  totalSections: number;
  hasAnyData: boolean;
}

// ── Completion helpers ─────────────────────────────────────────────────────

const TOTAL_ASSESSMENT_QUESTIONS = DEFAULT_SECTIONS.reduce(
  (n, s) => n + s.questions.length,
  0
);

function getSections(data: SurveyData | null): SectionStatus[] {
  if (!data) {
    const empty: SectionStatus[] = [
      { id: "project-info", label: "Project Information", state: "empty", detail: "Not started", tab: "project-info" },
      { id: "self-assessment", label: "Self-Assessment Survey", state: "empty", detail: "0 / " + TOTAL_ASSESSMENT_QUESTIONS + " questions rated", tab: "self-assessment" },
      { id: "achievements", label: "Key Achievements", state: "empty", detail: "Not started", tab: "achievements" },
      { id: "lessons", label: "Lessons Learned", state: "empty", detail: "Not started", tab: "lessons" },
      { id: "visibility", label: "Visibility & Engagement", state: "empty", detail: "Not started", tab: "visibility" },
      { id: "indicators", label: "Indicators", state: "empty", detail: "0 / " + DEFAULT_INDICATORS.length + " reported", tab: "indicators" },
      { id: "expenditures", label: "Expenditures", state: "empty", detail: "Not started", tab: "expenditures" },
      { id: "work-plan", label: "Work Plan", state: "empty", detail: "Not started", tab: "work-plan" },
      { id: "risk", label: "Risk Management", state: "empty", detail: "Not started", tab: "risk" },
      { id: "funding-transfer", label: "Funding Transfer to IPs", state: "empty", detail: "Not started", tab: "funding-transfer" },
      { id: "complementary", label: "Complementary Funding", state: "empty", detail: "Not started", tab: "complementary" },
    ];
    return empty;
  }

  const n = data.narrative;
  const q = data.quantitative;

  // Project Information
  const piFields = [n.projectInformation.projectTitle, n.projectInformation.organizationName, n.projectInformation.grantSize];
  const piFilled = piFields.filter(Boolean).length;
  const piTotal = piFields.length;

  // Self-Assessment
  const ratedQuestions = DEFAULT_SECTIONS.flatMap((s) =>
    s.questions.filter((q_) => n.selfAssessment[q_.id]?.rating)
  ).length;

  // Key Achievements
  const achievementsFilled = n.keyAchievements.achievements.filter((a) => a.achievement.trim()).length;

  // Lessons Learned
  const lessonsFilled = n.lessonsLearned.filter((l) => l.lessonLearned.trim()).length;

  // Visibility
  const coverageFilled = n.visibilityEngagement.externalCoverage.filter((c) => c.description.trim()).length;

  // Indicators
  const indicatorsFilled = Object.values(q.indicators.responses).filter((r) => r.achievedValue || r.status).length;

  // Expenditures
  const editableCats = EXPENDITURE_CATEGORIES.filter((c) => !c.readOnly).length;
  const expendituresFilled = q.expenditures.entries.filter((e) => e.annualExpenditure > 0).length;

  // Work Plan
  const workPlanRows = q.workPlan.rows.length;

  // Risk
  const risksAssessed = q.riskManagement.entries.filter((e) => e.likelihood && e.impact).length;
  const risksTotal = q.riskManagement.entries.length;

  // Funding Transfer
  const ftRows = q.fundingTransfer.rows.filter((r) => r.organizationName || r.amountTransferred > 0).length;

  // Complementary Funding
  const cfRows = q.complementaryFunding.rows.filter((r) => r.contributorName || r.totalContribution > 0).length;

  function state(filled: number, total: number, completeThreshold: number): SectionState {
    if (filled === 0) return "empty";
    if (filled >= completeThreshold) return "complete";
    return "started";
  }

  return [
    {
      id: "project-info",
      label: "Project Information",
      state: state(piFilled, piTotal, piTotal),
      detail: piFilled === piTotal ? "Filled" : `${piFilled} / ${piTotal} key fields`,
      tab: "project-info",
    },
    {
      id: "self-assessment",
      label: "Self-Assessment Survey",
      state: state(ratedQuestions, TOTAL_ASSESSMENT_QUESTIONS, TOTAL_ASSESSMENT_QUESTIONS),
      detail: `${ratedQuestions} / ${TOTAL_ASSESSMENT_QUESTIONS} questions rated`,
      tab: "self-assessment",
    },
    {
      id: "achievements",
      label: "Key Achievements",
      state: state(achievementsFilled, 3, 3),
      detail: achievementsFilled > 0 ? `${achievementsFilled} / 3 achievements entered` : "Not started",
      tab: "achievements",
    },
    {
      id: "lessons",
      label: "Lessons Learned",
      state: state(lessonsFilled, 5, 3),
      detail: lessonsFilled > 0 ? `${lessonsFilled} / 5 lessons entered` : "Not started",
      tab: "lessons",
    },
    {
      id: "visibility",
      label: "Visibility & Engagement",
      state: state(coverageFilled, 3, 3),
      detail: coverageFilled > 0 ? `${coverageFilled} / 3 examples entered` : "Not started",
      tab: "visibility",
    },
    {
      id: "indicators",
      label: "Indicators",
      state: state(indicatorsFilled, DEFAULT_INDICATORS.length, DEFAULT_INDICATORS.length),
      detail: `${indicatorsFilled} / ${DEFAULT_INDICATORS.length} indicators reported`,
      tab: "indicators",
    },
    {
      id: "expenditures",
      label: "Expenditures",
      state: state(expendituresFilled, editableCats, Math.ceil(editableCats / 2)),
      detail: expendituresFilled > 0 ? `${expendituresFilled} / ${editableCats} categories filled` : "Not started",
      tab: "expenditures",
    },
    {
      id: "work-plan",
      label: "Work Plan",
      state: workPlanRows > 0 ? (workPlanRows >= 3 ? "complete" : "started") : "empty",
      detail: workPlanRows > 0 ? `${workPlanRows} activit${workPlanRows === 1 ? "y" : "ies"} added` : "Not started",
      tab: "work-plan",
    },
    {
      id: "risk",
      label: "Risk Management",
      state: state(risksAssessed, Math.max(risksTotal, 1), risksTotal > 0 ? risksTotal : 1),
      detail: risksAssessed > 0 ? `${risksAssessed} risk${risksAssessed > 1 ? "s" : ""} assessed` : "Not started",
      tab: "risk",
    },
    {
      id: "funding-transfer",
      label: "Funding Transfer to IPs",
      state: ftRows > 0 ? (ftRows >= 2 ? "complete" : "started") : "empty",
      detail: ftRows > 0 ? `${ftRows} partner${ftRows > 1 ? "s" : ""} listed` : "Not started",
      tab: "funding-transfer",
    },
    {
      id: "complementary",
      label: "Complementary Funding",
      state: cfRows > 0 ? (cfRows >= 2 ? "complete" : "started") : "empty",
      detail: cfRows > 0 ? `${cfRows} source${cfRows > 1 ? "s" : ""} listed` : "Not started",
      tab: "complementary",
    },
  ];
}

function getYearProgress(sections: SectionStatus[]): { percentage: number; completedSections: number } {
  const completedSections = sections.filter((s) => s.state !== "empty").length;
  const percentage = Math.round((completedSections / sections.length) * 100);
  return { percentage, completedSections };
}

function firstIncompleteTab(sections: SectionStatus[]): string {
  return sections.find((s) => s.state !== "complete")?.tab ?? sections[0].tab;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StateIcon({ state }: { state: SectionState }) {
  if (state === "complete")
    return <CheckCircle2 className="size-4 text-green-500 shrink-0" />;
  if (state === "started")
    return <AlertCircle className="size-4 text-amber-400 shrink-0" />;
  return <Circle className="size-4 text-neutral-300 shrink-0" />;
}

function SectionRow({
  section,
  year,
  onClick,
}: {
  section: SectionStatus;
  year: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent/50 transition-colors group"
    >
      <StateIcon state={section.state} />
      <div className="flex-1 min-w-0">
        <p className={cn(
          "text-sm font-medium truncate",
          section.state === "empty" && "text-muted-foreground"
        )}>
          {section.label}
        </p>
        <p className="text-xs text-muted-foreground truncate">{section.detail}</p>
      </div>
      <ChevronRight className="size-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
    </button>
  );
}

function ProgressBar({ percentage, className }: { percentage: number; className?: string }) {
  const color =
    percentage >= 80 ? "bg-green-500"
    : percentage >= 40 ? "bg-crafd-yellow"
    : "bg-orange-400";

  return (
    <div className={cn("h-2 w-full rounded-full bg-muted overflow-hidden", className)}>
      <div
        className={cn("h-full rounded-full transition-all duration-700", color)}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

const CURRENT_YEAR = YEARS[YEARS.length - 1];

export default function DashboardPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [surveyDataByYear, setSurveyDataByYear] = useState<
    Record<number, SurveyData | null>
  >({});

  useEffect(() => {
    if (!user?.id) return;
    const byYear: Record<number, SurveyData | null> = {};
    YEARS.forEach((y) => {
      byYear[y] = getSurveyData(user.id, y);
    });
    setSurveyDataByYear(byYear);
  }, [user?.id]);

  // Greeting based on time of day
  const greeting = useMemo(() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  const partnerInfo = PARTNERS.find((p) => p.id === user?.id);

  // Current year sections
  const currentSections = useMemo(
    () => getSections(surveyDataByYear[CURRENT_YEAR] ?? null),
    [surveyDataByYear]
  );

  const { percentage: currentPct, completedSections } = getYearProgress(currentSections);

  const narrativeSections = currentSections.slice(0, 5);
  const quantitativeSections = currentSections.slice(5);

  function goToTab(tab: string, year: number) {
    router.push(`/partner/survey?tab=${tab}&year=${year}`);
  }

  // Previous years
  const previousYears = YEARS.slice(0, -1).reverse(); // [2025, 2024, 2023]

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header strip */}
      <div className="bg-neutral-950 text-white px-8 py-8">
        <p className="text-neutral-400 text-sm mb-1">
          {greeting}, {user?.name}
        </p>
        <h1 className="text-3xl font-bold font-qanelas">
          {partnerInfo?.fullName ?? user?.organization ?? user?.name}
        </h1>
        <p className="text-neutral-400 text-sm mt-2">
          CRAF&apos;d Annual Reporting Platform · Reporting cycle {CURRENT_YEAR}
        </p>
      </div>

      <div className="flex-1 px-8 py-8 max-w-5xl">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-8">

        {/* ── Current year card ── */}
        <section className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">
              {CURRENT_YEAR} Annual Report
              <Badge
                variant="outline"
                className={cn(
                  "ml-2 text-xs",
                  currentPct === 100
                    ? "border-green-300 text-green-700"
                    : currentPct > 0
                    ? "border-amber-300 text-amber-700"
                    : "border-neutral-300 text-neutral-500"
                )}
              >
                {currentPct === 100 ? "Complete" : currentPct > 0 ? "In progress" : "Not started"}
              </Badge>
            </h2>
            <span className="text-sm text-muted-foreground">
              {completedSections} / {currentSections.length} sections with data
            </span>
          </div>

          <div className="rounded-xl border bg-card overflow-hidden">
            {/* Progress bar header */}
            <div className="px-6 py-4 border-b bg-muted/30">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Overall progress</span>
                <span className="text-sm font-bold tabular-nums">{currentPct}%</span>
              </div>
              <ProgressBar percentage={currentPct} />
            </div>

            {/* Two-column section list */}
            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
              {/* Narrative */}
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-crafd-yellow px-3 mb-2">
                  Narrative Report
                </p>
                <div className="space-y-0.5">
                  {narrativeSections.map((s) => (
                    <SectionRow
                      key={s.id}
                      section={s}
                      year={CURRENT_YEAR}
                      onClick={() => goToTab(s.tab, CURRENT_YEAR)}
                    />
                  ))}
                </div>
              </div>

              {/* Quantitative */}
              <div className="p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-blue-500 px-3 mb-2">
                  Quantitative Report
                </p>
                <div className="space-y-0.5">
                  {quantitativeSections.map((s) => (
                    <SectionRow
                      key={s.id}
                      section={s}
                      year={CURRENT_YEAR}
                      onClick={() => goToTab(s.tab, CURRENT_YEAR)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Footer CTA */}
            <div className="px-6 py-4 border-t bg-muted/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                {currentPct === 0
                  ? "Start filling out your annual report for " + CURRENT_YEAR
                  : currentPct === 100
                  ? "All sections completed — remember to save."
                  : `Continue where you left off`}
              </p>
              <button
                onClick={() => goToTab(firstIncompleteTab(currentSections), CURRENT_YEAR)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-crafd-yellow px-4 py-2 text-sm font-semibold text-black hover:bg-crafd-yellow/90 transition-colors"
              >
                {currentPct === 0 ? "Start reporting" : currentPct === 100 ? "Review report" : "Continue"}
                <ArrowRight className="size-3.5" />
              </button>
            </div>
          </div>
        </section>

        {/* ── Previous years ── */}
        <section className="lg:col-span-1">
          <h2 className="text-base font-semibold mb-3">Previous years</h2>
          <div className="flex flex-col gap-3">
            {previousYears.map((year) => {
              const yearData = surveyDataByYear[year] ?? null;
              const sections = getSections(yearData);
              const { percentage, completedSections: cs } = getYearProgress(sections);
              const hasData = sections.some((s) => s.state !== "empty");

              return (
                <button
                  key={year}
                  onClick={() => goToTab(firstIncompleteTab(sections), year)}
                  className="group rounded-xl border bg-card p-5 text-left hover:border-neutral-300 transition-colors"
                >
                  <div className="flex items-start justify-between mb-3">
                    <span className="text-2xl font-bold font-qanelas">{year}</span>
                    <span className={cn(
                      "text-xs font-medium rounded-full px-2 py-0.5 border",
                      percentage === 100
                        ? "bg-green-50 text-green-700 border-green-200"
                        : hasData
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-neutral-100 text-neutral-400 border-neutral-200"
                    )}>
                      {percentage === 100 ? "Complete" : hasData ? `${percentage}%` : "Not started"}
                    </span>
                  </div>

                  <ProgressBar percentage={percentage} className="mb-2" />

                  <p className="text-xs text-muted-foreground">
                    {hasData
                      ? `${cs} of ${sections.length} sections filled`
                      : "No data entered yet"}
                  </p>

                  <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
                    Open report <ChevronRight className="size-3" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        </div>
      </div>
    </div>
  );
}
