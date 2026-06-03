"use client";

import type { SurveyData } from "@/lib/survey-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: SurveyData["narrative"]["keyAchievements"];
  onChange: (data: SurveyData["narrative"]["keyAchievements"]) => void;
}

export function KeyAchievementsForm({ data, onChange }: Props) {
  function update(field: string, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Key Achievements</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="achievements">
              Describe key achievements and results
            </Label>
            <Textarea
              id="achievements"
              rows={4}
              value={data.achievements}
              onChange={(e) => update("achievements", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unexpectedResults">
              Describe any unexpected results
            </Label>
            <Textarea
              id="unexpectedResults"
              rows={4}
              value={data.unexpectedResults}
              onChange={(e) => update("unexpectedResults", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contributions">
              Describe contributions to CRAF'd objectives
            </Label>
            <Textarea
              id="contributions"
              rows={4}
              value={data.contributions}
              onChange={(e) => update("contributions", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
