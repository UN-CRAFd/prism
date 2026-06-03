"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  getSurveyData,
  saveSurveyData,
  YEARS,
  type SurveyData,
} from "@/lib/survey-data";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Save, CheckCircle } from "lucide-react";

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

export default function SurveyPage() {
  const { user } = useAuth();
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [data, setData] = useState<SurveyData | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState("project-info");

  useEffect(() => {
    if (user?.id) {
      setData(getSurveyData(user.id, selectedYear));
      setSaved(false);
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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b px-8 py-4">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">
            Annual Report
          </h1>
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
          <Button onClick={handleSave} className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 font-semibold">
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
        <div className="mb-4">
          <Badge variant="outline" className="mr-2 text-xs">Narrative Report</Badge>
          <Badge variant="secondary" className="text-xs">Quantitative Report</Badge>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex flex-wrap h-auto gap-1 bg-transparent p-0 mb-6">
            <Separator orientation="vertical" className="hidden" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2 self-center">
              Narrative
            </p>
            <TabsTrigger value="project-info" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              1. Project Information
            </TabsTrigger>
            <TabsTrigger value="self-assessment" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              2. Self Assessment
            </TabsTrigger>
            <TabsTrigger value="achievements" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              3. Key Achievements
            </TabsTrigger>
            <TabsTrigger value="lessons" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              4. Lessons Learned
            </TabsTrigger>
            <TabsTrigger value="visibility" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              5. Visibility
            </TabsTrigger>

            <Separator orientation="vertical" className="mx-2 h-6" />

            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2 self-center">
              Quantitative
            </p>
            <TabsTrigger value="indicators" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              1. Indicators
            </TabsTrigger>
            <TabsTrigger value="expenditures" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              2. Expenditures
            </TabsTrigger>
            <TabsTrigger value="work-plan" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              3. Work Plan
            </TabsTrigger>
            <TabsTrigger value="risk" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              4. Risk Management
            </TabsTrigger>
            <TabsTrigger value="funding-transfer" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              5. Funding Transfer
            </TabsTrigger>
            <TabsTrigger value="complementary" className="data-[state=active]:bg-crafd-yellow/10 data-[state=active]:text-crafd-yellow">
              6. Complementary Funding
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project-info">
            <ProjectInformationForm
              data={data.narrative.projectInformation}
              onChange={(v) => updateNarrative("projectInformation", v)}
            />
          </TabsContent>

          <TabsContent value="self-assessment">
            <SelfAssessmentForm
              data={data.narrative.selfAssessment}
              onChange={(v) => updateNarrative("selfAssessment", v)}
            />
          </TabsContent>

          <TabsContent value="achievements">
            <KeyAchievementsForm
              data={data.narrative.keyAchievements}
              onChange={(v) => updateNarrative("keyAchievements", v)}
            />
          </TabsContent>

          <TabsContent value="lessons">
            <LessonsLearnedForm
              data={data.narrative.lessonsLearned}
              onChange={(v) => updateNarrative("lessonsLearned", v)}
            />
          </TabsContent>

          <TabsContent value="visibility">
            <VisibilityEngagementForm
              data={data.narrative.visibilityEngagement}
              onChange={(v) => updateNarrative("visibilityEngagement", v)}
            />
          </TabsContent>

          <TabsContent value="indicators">
            <IndicatorsForm
              rows={data.quantitative.indicators.rows}
              onChange={(rows) => updateQuantitative("indicators", { rows })}
            />
          </TabsContent>

          <TabsContent value="expenditures">
            <ExpendituresForm
              rows={data.quantitative.expenditures.rows}
              onChange={(rows) => updateQuantitative("expenditures", { rows })}
            />
          </TabsContent>

          <TabsContent value="work-plan">
            <WorkPlanForm
              rows={data.quantitative.workPlan.rows}
              onChange={(rows) => updateQuantitative("workPlan", { rows })}
            />
          </TabsContent>

          <TabsContent value="risk">
            <RiskManagementForm
              rows={data.quantitative.riskManagement.rows}
              onChange={(rows) => updateQuantitative("riskManagement", { rows })}
            />
          </TabsContent>

          <TabsContent value="funding-transfer">
            <FundingTransferForm
              rows={data.quantitative.fundingTransfer.rows}
              onChange={(rows) => updateQuantitative("fundingTransfer", { rows })}
            />
          </TabsContent>

          <TabsContent value="complementary">
            <ComplementaryFundingForm
              rows={data.quantitative.complementaryFunding.rows}
              onChange={(rows) =>
                updateQuantitative("complementaryFunding", { rows })
              }
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
