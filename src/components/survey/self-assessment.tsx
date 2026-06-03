"use client";

import type { SurveyData } from "@/lib/survey-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: SurveyData["narrative"]["selfAssessment"];
  onChange: (data: SurveyData["narrative"]["selfAssessment"]) => void;
}

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs";

export function SelfAssessmentForm({ data, onChange }: Props) {
  function update(field: string, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Self Assessment</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="overallProgress">Overall Progress</Label>
            <select
              id="overallProgress"
              className={selectClassName}
              value={data.overallProgress}
              onChange={(e) => update("overallProgress", e.target.value)}
            >
              <option value="">Select...</option>
              <option value="On Track">On Track</option>
              <option value="Slightly Behind">Slightly Behind</option>
              <option value="Significantly Behind">Significantly Behind</option>
              <option value="Ahead of Schedule">Ahead of Schedule</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="timelinessRating">Timeliness Rating</Label>
            <select
              id="timelinessRating"
              className={selectClassName}
              value={data.timelinessRating}
              onChange={(e) => update("timelinessRating", e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Satisfactory">Satisfactory</option>
              <option value="Needs Improvement">Needs Improvement</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="budgetUtilization">Budget Utilization</Label>
            <select
              id="budgetUtilization"
              className={selectClassName}
              value={data.budgetUtilization}
              onChange={(e) => update("budgetUtilization", e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Under 50%">Under 50%</option>
              <option value="50-75%">50-75%</option>
              <option value="75-90%">75-90%</option>
              <option value="Over 90%">Over 90%</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="partnershipQuality">Partnership Quality</Label>
            <select
              id="partnershipQuality"
              className={selectClassName}
              value={data.partnershipQuality}
              onChange={(e) => update("partnershipQuality", e.target.value)}
            >
              <option value="">Select...</option>
              <option value="Excellent">Excellent</option>
              <option value="Good">Good</option>
              <option value="Satisfactory">Satisfactory</option>
              <option value="Needs Improvement">Needs Improvement</option>
            </select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              rows={4}
              value={data.comments}
              onChange={(e) => update("comments", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
