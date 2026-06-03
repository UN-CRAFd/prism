"use client";

import type { SelfAssessmentData, AssessmentAnswer } from "@/lib/survey-data";
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

interface QuestionDef {
  id: string;
  text: string;
}

const SECTIONS: { title: string; number: string; questions: QuestionDef[] }[] = [
  {
    title: "Data quality",
    number: "2.1",
    questions: [
      { id: "a", text: "To what extent has the project ensured transparency and public accessibility of its data, insights, and methodologies?" },
      { id: "b", text: "To what extent has the project applied open standards, machine-readable formats, and interoperable approaches (e.g. APIs)?" },
      { id: "c", text: "To what extent has the project ensured the accuracy, completeness, and reliability of its data or insights through validation or peer-review processes?" },
      { id: "d", text: "To what extent has the project implemented responsible data practices, including informed consent, privacy, confidentiality, fairness, and risk mitigation?" },
      { id: "e", text: "To what extent has gender expertise or inclusive analysis (e.g. sex, age, disability) been incorporated into the design, collection, or validation of the data or insights?" },
    ],
  },
  {
    title: "Ecosystem and collaboration",
    number: "2.2",
    questions: [
      { id: "f", text: "To what extent has the project strengthened data- or insights-sharing and collaboration among ecosystem partners?" },
      { id: "g", text: "To what extent has the project strengthened sustained partnerships with organizations operating in fragile and crisis-affected settings?" },
      { id: "h", text: "To what extent have local and national actors been meaningfully involved in the design, collection, validation, or use of the project's data or insights?" },
      { id: "i", text: "To what extent has the project built or strengthened partnerships with women-led or feminist organizations that influenced the analysis or use of data or insights?" },
    ],
  },
  {
    title: "Data uptake and use",
    number: "2.3",
    questions: [
      { id: "j", text: "To what extent have the project's data or insights informed funding or resource allocation decisions that improved the timing, targeting, or dignity of crisis action in fragile and crisis-affected settings?" },
      { id: "k", text: "To what extent have the project's data or insights strengthened anticipatory action or early warning / early action capabilities of partners?" },
      { id: "l", text: "To what extent have the project's data or insights contributed to earlier, faster, or more targeted assistance to affected populations?" },
      { id: "m", text: "To what extent have the project's data or insights enabled partners to analyze and address the gendered impacts of crises?" },
    ],
  },
  {
    title: "Contribution of CRAF'd funding",
    number: "2.4",
    questions: [
      { id: "n", text: "To what extent has CRAF'd funding enabled your organization to pursue new or expanded areas of work that would otherwise not have been possible?" },
      { id: "o", text: "To what extent has CRAF'd funding strengthened your organization's data, analytical, or technical capabilities and the overall quality of your work?" },
      { id: "p", text: "To what extent has CRAF'd funding helped reduce transaction costs and improve the efficiency of grant management or delivery?" },
      { id: "r", text: "To what extent has CRAF'd funding supported the development of a more sustainable or predictable funding model for your project or organization?" },
    ],
  },
];

export function SelfAssessmentForm({ data, onChange }: Props) {
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

      {SECTIONS.map((section) => (
        <Card key={section.number}>
          <CardHeader>
            <CardTitle className="text-base">
              {section.number}. {section.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                        <td className="py-3 pr-4 leading-relaxed">
                          {q.text}
                        </td>
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
