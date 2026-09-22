"use client";

import { FileQuestion } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { ItemComments } from "@/components/report-editor/comments-context";
import { ScaleSelect } from "@/components/report-editor/scale-select";
import type { Survey, RowState } from "@/components/report-editor/types";
import { optionItems } from "@/lib/options";

export interface SurveysSectionProps {
  surveys: Survey[];
  rowStates: Record<number, RowState>;
  updateRow: (id: number, patch: Partial<RowState>) => void;
}

// Read-only is handled entirely by the parent's <fieldset disabled> (native
// textarea) + <ReadOnlyProvider> (Radix ScaleSelect) — no prop needed.
export function SurveysSection({ surveys, rowStates, updateRow }: SurveysSectionProps) {
  if (surveys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">{labels.partnerEditor.emptySurveys}</p>
      </div>
    );
  }

  // Determine whether any row carries a category — if not, render exactly as
  // before with no headings so uncategorised reports are unaffected.
  const hasCategories = surveys.some((s) => s.category !== null);

  if (!hasCategories) {
    return (
      <div className="space-y-4">
        {surveys.map((survey, i) => (
          <SurveyCard key={survey.id} survey={survey} index={i} rowStates={rowStates} updateRow={updateRow} />
        ))}
      </div>
    );
  }

  // Group by category following optionItems order, uncategorised last.
  const categoryItems = optionItems("surveyCategory");
  const byCategory = new Map<string | null, Survey[]>();
  for (const survey of surveys) {
    const k = survey.category ?? null;
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(survey);
  }

  // Build ordered groups — only emit a group that actually has questions.
  const groups: Array<{ heading: string | null; items: Survey[] }> = [];
  for (const cat of categoryItems) {
    const items = byCategory.get(cat.value);
    if (items && items.length > 0) groups.push({ heading: cat.label, items });
  }
  const uncategorised = byCategory.get(null);
  if (uncategorised && uncategorised.length > 0) groups.push({ heading: null, items: uncategorised });

  // Continuous numbering across groups.
  let globalIndex = 0;
  return (
    <div className="space-y-6">
      {groups.map((group, gi) => (
        <div key={group.heading ?? "__uncategorised__"}>
          {group.heading && (
            <h3 className="t-heading-sub mb-4">{group.heading}</h3>
          )}
          <div className="space-y-4">
            {group.items.map((survey) => {
              const index = globalIndex++;
              return (
                <SurveyCard key={survey.id} survey={survey} index={index} rowStates={rowStates} updateRow={updateRow} />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SurveyCardProps {
  survey: Survey;
  index: number;
  rowStates: Record<number, RowState>;
  updateRow: (id: number, patch: Partial<RowState>) => void;
}

function SurveyCard({ survey, index, rowStates, updateRow }: SurveyCardProps) {
  const state = rowStates[survey.id];
  if (!state) return null;
  return (
    <div
      className={cn("rounded-xl border bg-card p-5 space-y-4 transition-colors", state.dirty && "border-amber-200")}
    >
      <div className="flex items-start gap-3">
        <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{index + 1}.</span>
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
}
