"use client";

import { FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { Textarea } from "@/components/ui/textarea";
import { ItemComments } from "@/components/report-editor/comments-context";
import { ScaleSelect } from "@/components/report-editor/scale-select";
import type { Survey, RowState } from "@/components/report-editor/types";

export interface SurveysSectionProps {
  surveys: Survey[];
  rowStates: Record<number, RowState>;
  updateRow: (id: number, patch: Partial<RowState>) => void;
}

export function SurveysSection({ surveys, rowStates, updateRow }: SurveysSectionProps) {
  if (surveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">{labels.partnerEditor.emptySurveys}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {surveys.map((survey, i) => {
        const state = rowStates[survey.id];
        if (!state) return null;
        return (
          <div
            key={survey.id}
            className={cn("rounded-xl border bg-card p-5 space-y-4 transition-colors", state.dirty && "border-amber-200")}
          >
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
              <p className="text-sm font-medium leading-snug flex-1">{survey.question}</p>
              <ItemComments section="surveys" itemId={survey.id} />
            </div>
            <div className="flex gap-6 items-start pl-8">
              <div className="shrink-0 space-y-1.5">
                <p className="text-xs text-muted-foreground">{labels.partnerEditor.assessmentLabel}</p>
                <ScaleSelect
                  kind="assessment"
                  value={state.assessment}
                  onValueChange={(v) => updateRow(survey.id, { assessment: v })}
                />
              </div>
              <div className="flex-1 space-y-1.5">
                <p className="text-xs text-muted-foreground">{labels.partnerEditor.contextLabel}</p>
                <Textarea
                  value={state.context}
                  onChange={(e) => updateRow(survey.id, { context: e.target.value })}
                  placeholder={labels.placeholders.assessmentContext}
                  className="text-sm min-h-[80px] resize-y"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
