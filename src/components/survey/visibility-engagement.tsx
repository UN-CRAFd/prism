"use client";

import type { SurveyData } from "@/lib/survey-data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  data: SurveyData["narrative"]["visibilityEngagement"];
  onChange: (data: SurveyData["narrative"]["visibilityEngagement"]) => void;
}

export function VisibilityEngagementForm({ data, onChange }: Props) {
  function update(field: string, value: string) {
    onChange({ ...data, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visibility and Engagement</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <Label htmlFor="publications">List publications and reports</Label>
            <Textarea
              id="publications"
              rows={4}
              value={data.publications}
              onChange={(e) => update("publications", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="events">
              Events participated in or organized
            </Label>
            <Textarea
              id="events"
              rows={4}
              value={data.events}
              onChange={(e) => update("events", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="mediaEngagement">
              Media engagement and coverage
            </Label>
            <Textarea
              id="mediaEngagement"
              rows={4}
              value={data.mediaEngagement}
              onChange={(e) => update("mediaEngagement", e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="partnerships">New partnerships developed</Label>
            <Textarea
              id="partnerships"
              rows={4}
              value={data.partnerships}
              onChange={(e) => update("partnerships", e.target.value)}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
