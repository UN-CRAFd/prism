"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  getSurveyData,
  saveSurveyData,
  YEARS,
  NARRATIVE_TABS,
  QUANTITATIVE_TABS,
  type SurveyData,
} from "@/lib/survey-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Save, CheckCircle } from "lucide-react";

import { resolveTemplate, type AssessmentSection } from "@/lib/survey-template";
import { ProjectInformationForm } from "@/components/survey/project-information";
import { SelfAssessmentForm } from "@/components/survey/self-assessment";
import { KeyAchievementsForm } from "@/components/survey/key-achievements";
import { LessonsLearnedForm } from "@/components/survey/lessons-learned";
import { VisibilityEngagementForm } from "@/components/survey/visibility-engagement";
import { IndicatorsForm } from "@/components/survey/indicators-form";
import { ExpendituresForm } from "@/components/survey/expenditures-form";
import { WorkPlanForm } from "@/components/survey/work-plan-form";
import { RiskManagementForm } from "@/components/survey/risk-management-form";
import { FundingTransferForm } from "@/components/survey/funding-transfer-form";
import { ComplementaryFundingForm } from "@/components/survey/complementary-funding-form";

function SurveyContent() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "project-info";

  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [data, setData] = useState<SurveyData | null>(null);
  const [saved, setSaved] = useState(false);
  const [assessmentSections, setAssessmentSections] = useState<AssessmentSection[] | undefined>(undefined);

  useEffect(() => {
    if (user?.id) {
      setData(getSurveyData(user.id, selectedYear));
      setSaved(false);
      const { sections } = resolveTemplate(user.id, selectedYear);
      setAssessmentSections(sections);
    }
  }, [user?.id, selectedYear]);

  const updateNarrative = useCallback(
    <K extends keyof SurveyData["narrative"]>(
      section: K,
      value: SurveyData["narrative"][K]
    ) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          narrative: { ...prev.narrative, [section]: value },
        };
      });
      setSaved(false);
    },
    []
  );

  const updateQuantitative = useCallback(
    <K extends keyof SurveyData["quantitative"]>(
      section: K,
      value: SurveyData["quantitative"][K]
    ) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          quantitative: { ...prev.quantitative, [section]: value },
        };
      });
      setSaved(false);
    },
    []
  );

  function handleSave() {
    if (data) {
      saveSurveyData(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  if (!data) return null;

  const narrativeTab = NARRATIVE_TABS.find((t) => t.id === activeTab);
  const quantitativeTab = QUANTITATIVE_TABS.find((t) => t.id === activeTab);
  const isNarrative = !!narrativeTab;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold font-qanelas">
              {narrativeTab?.label || quantitativeTab?.label || "Survey"}
            </h1>
            <Badge
              variant="outline"
              className={
                isNarrative
                  ? "border-crafd-yellow/40 text-crafd-yellow"
                  : "border-blue-500/40 text-blue-600"
              }
            >
              {isNarrative ? "Narrative" : "Quantitative"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            {user?.organization} &mdash; Reporting Year {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select
            value={String(selectedYear)}
            onValueChange={(v) => setSelectedYear(Number(v))}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleSave}
            className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 font-semibold"
          >
            {saved ? (
              <>
                <CheckCircle className="size-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="size-4" />
                Save
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {activeTab === "project-info" && (
          <ProjectInformationForm
            data={data.narrative.projectInformation}
            onChange={(v) => updateNarrative("projectInformation", v)}
          />
        )}
        {activeTab === "self-assessment" && (
          <SelfAssessmentForm
            data={data.narrative.selfAssessment}
            onChange={(v) => updateNarrative("selfAssessment", v)}
            sections={assessmentSections}
          />
        )}
        {activeTab === "achievements" && (
          <KeyAchievementsForm
            data={data.narrative.keyAchievements}
            onChange={(v) => updateNarrative("keyAchievements", v)}
          />
        )}
        {activeTab === "lessons" && (
          <LessonsLearnedForm
            data={data.narrative.lessonsLearned}
            onChange={(v) => updateNarrative("lessonsLearned", v)}
          />
        )}
        {activeTab === "visibility" && (
          <VisibilityEngagementForm
            data={data.narrative.visibilityEngagement}
            onChange={(v) => updateNarrative("visibilityEngagement", v)}
          />
        )}

        {activeTab === "indicators" && (
          <IndicatorsForm
            responses={data.quantitative.indicators.responses}
            onChange={(responses) => updateQuantitative("indicators", { responses })}
          />
        )}
        {activeTab === "expenditures" && (
          <ExpendituresForm
            entries={data.quantitative.expenditures.entries}
            onChange={(entries) => updateQuantitative("expenditures", { entries })}
          />
        )}
        {activeTab === "work-plan" && (
          <WorkPlanForm
            rows={data.quantitative.workPlan.rows}
            onChange={(rows) => updateQuantitative("workPlan", { rows })}
          />
        )}
        {activeTab === "risk" && (
          <RiskManagementForm
            entries={data.quantitative.riskManagement.entries}
            onChange={(entries) => updateQuantitative("riskManagement", { entries })}
          />
        )}
        {activeTab === "funding-transfer" && (
          <FundingTransferForm
            rows={data.quantitative.fundingTransfer.rows}
            onChange={(rows) => updateQuantitative("fundingTransfer", { rows })}
          />
        )}
        {activeTab === "complementary" && (
          <ComplementaryFundingForm
            rows={data.quantitative.complementaryFunding.rows}
            onChange={(rows) =>
              updateQuantitative("complementaryFunding", { rows })
            }
          />
        )}
      </div>
    </div>
  );
}

export default function SurveyPage() {
  return (
    <Suspense>
      <SurveyContent />
    </Suspense>
  );
}
