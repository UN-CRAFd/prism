"use client";

import type { LessonEntry } from "@/lib/survey-data";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";

interface Props {
  data: LessonEntry[];
  onChange: (data: LessonEntry[]) => void;
}


const CATEGORY_OPTIONS = [
  "",
  "Communications",
  "Financial",
  "Methodology",
  "Operational",
  "Organizational",
  "Partnerships",
  "Others",
];

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none";

export function LessonsLearnedForm({ data, onChange }: Props) {
  function update(
    index: number,
    field: keyof LessonEntry,
    value: string
  ) {
    const updated = [...data];
    updated[index] = { ...updated[index], [field]: value };
    onChange(updated);
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>4. Lessons Learned</CardTitle>
          <CardDescription className="leading-relaxed">
            Provide up to five lessons from the reporting period that are relevant to the
            design, implementation, use, or sustainability of the project. For each lesson,
            clearly state the insight gained and describe how it informed an adjustment,
            improvement, or future approach. Focus on learning that led to action or change.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-48">Category</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[250px]">Lesson learned</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[250px]">Adjustment informed</th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry, i) => (
                  <tr key={i} className="border-b last:border-0 align-top">
                    <td className="py-3 pr-3">
                      <select
                        className={selectClassName}
                        value={entry.category}
                        onChange={(e) => update(i, "category", e.target.value)}
                      >
                        {CATEGORY_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt || "Select category"}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 pr-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Briefly describe what your organization learned while implementing the project..."
                        value={entry.lessonLearned}
                        onChange={(e) => update(i, "lessonLearned", e.target.value)}
                      />
                    </td>
                    <td className="py-3">
                      <Textarea
                        rows={4}
                        className="text-sm"
                        placeholder="Explain what you changed (or will change) in project implementation as a result..."
                        value={entry.adjustmentInformed}
                        onChange={(e) => update(i, "adjustmentInformed", e.target.value)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
