"use client";

import type { SurveyData } from "@/lib/survey-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: SurveyData["narrative"]["lessonsLearned"];
  onChange: (data: SurveyData["narrative"]["lessonsLearned"]) => void;
}

export function LessonsLearnedForm({ data, onChange }: Props) {
  function update(field: string, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lessons Learned</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="lessons">Key lessons learned</Label>
            <Textarea
              id="lessons"
              rows={4}
              value={data.lessons}
              onChange={(e) => update("lessons", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="challenges">Main challenges faced</Label>
            <Textarea
              id="challenges"
              rows={4}
              value={data.challenges}
              onChange={(e) => update("challenges", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="recommendations">
              Recommendations for improvement
            </Label>
            <Textarea
              id="recommendations"
              rows={4}
              value={data.recommendations}
              onChange={(e) => update("recommendations", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
