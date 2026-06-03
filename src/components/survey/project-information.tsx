"use client";

import type { SurveyData } from "@/lib/survey-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: SurveyData["narrative"]["projectInformation"];
  onChange: (data: SurveyData["narrative"]["projectInformation"]) => void;
}

export function ProjectInformationForm({ data, onChange }: Props) {
  function update(field: string, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Information</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="projectTitle">Project Title</Label>
            <Input
              id="projectTitle"
              value={data.projectTitle}
              onChange={(e) => update("projectTitle", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectNumber">Project Number</Label>
            <Input
              id="projectNumber"
              value={data.projectNumber}
              onChange={(e) => update("projectNumber", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reportingPeriod">Reporting Period</Label>
            <Input
              id="reportingPeriod"
              value={data.reportingPeriod}
              onChange={(e) => update("reportingPeriod", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="projectManager">Project Manager</Label>
            <Input
              id="projectManager"
              value={data.projectManager}
              onChange={(e) => update("projectManager", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={data.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="totalBudget">Total Budget</Label>
            <Input
              id="totalBudget"
              value={data.totalBudget}
              onChange={(e) => update("totalBudget", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="startDate">Start Date</Label>
            <Input
              id="startDate"
              type="date"
              value={data.startDate}
              onChange={(e) => update("startDate", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">End Date</Label>
            <Input
              id="endDate"
              type="date"
              value={data.endDate}
              onChange={(e) => update("endDate", e.target.value)}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="summary">Project Summary</Label>
            <Textarea
              id="summary"
              rows={4}
              value={data.summary}
              onChange={(e) => update("summary", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
