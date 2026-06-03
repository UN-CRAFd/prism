"use client";

import type { SelfAssessmentData, AssessmentAnswer } from "@/lib/survey-data";
import type { AssessmentSection } from "@/lib/survey-template";
import { DEFAULT_SECTIONS } from "@/lib/survey-template";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface Props {
  data: SelfAssessmentData;
  onChange: (data: SelfAssessmentData) => void;
  sections?: AssessmentSection[];
}

const RATINGS: { value: string; label: string }[] = [
  { value: "1", label: "Not at all" },
  { value: "2", label: "To a limited extent" },
  { value: "3", label: "To a moderate extent" },
  { value: "4", label: "To a significant extent" },
  { value: "5", label: "To a very significant extent" },
];

const RATING_STYLES: Record<string, string> = {
  "1": "bg-rose-50 text-rose-700 border-rose-200",
  "2": "bg-orange-50 text-orange-700 border-orange-200",
  "3": "bg-amber-50 text-amber-700 border-amber-200",
  "4": "bg-lime-50 text-lime-700 border-lime-200",
  "5": "bg-green-50 text-green-700 border-green-200",
};

function RatingBadge({ value }: { value: string }) {
  const rating = RATINGS.find((r) => r.value === value);
  if (!rating) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
        RATING_STYLES[value]
      )}
    >
      <span className="font-bold">{value}</span>
      <span className="opacity-80">—</span>
      {rating.label}
    </span>
  );
}

export function SelfAssessmentForm({ data, onChange, sections }: Props) {
  const activeSections = sections ?? DEFAULT_SECTIONS;

  function updateAnswer(id: string, field: keyof AssessmentAnswer, value: string) {
    onChange({
      ...data,
      [id]: { ...data[id], [field]: value },
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>2. Project Self-Assessment Survey</CardTitle>
          <CardDescription className="leading-relaxed">
            Use this section to self-assess your project&apos;s performance across four areas:
            data quality, ecosystem and collaboration, data uptake and use, and the contribution
            of pooled funding. For each question, select a rating and explain your choice clearly
            and concisely, using evidence from the reporting period.
          </CardDescription>
        </CardHeader>
      </Card>

      {activeSections.map((section) => (
        <Card key={section.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {section.number}. {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {section.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">No questions in this section.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left font-medium text-muted-foreground pb-3 min-w-[300px]">Question</th>
                      <th className="text-left font-medium text-muted-foreground pb-3 w-56 pr-4">Rating</th>
                      <th className="text-left font-medium text-muted-foreground pb-3 min-w-[250px]">Justification (evidence-based)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.questions.map((q) => {
                      const currentRating = data[q.id]?.rating || "";
                      return (
                        <tr key={q.id} className="border-b last:border-0 align-top">
                          <td className="py-3 pr-4 leading-relaxed">{q.text}</td>
                          <td className="py-3 pr-4">
                            <Select
                              value={currentRating}
                              onValueChange={(v) => updateAnswer(q.id, "rating", v)}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a rating">
                                  {currentRating ? (
                                    <RatingBadge value={currentRating} />
                                  ) : undefined}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {RATINGS.map((r) => (
                                  <SelectItem key={r.value} value={r.value}>
                                    <RatingBadge value={r.value} />
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="py-3">
                            <Textarea
                              rows={3}
                              className="min-h-[72px] text-sm"
                              value={data[q.id]?.justification || ""}
                              onChange={(e) =>
                                updateAnswer(q.id, "justification", e.target.value)
                              }
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
