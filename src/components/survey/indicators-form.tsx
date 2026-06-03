"use client";

import { useState } from "react";
import type { IndicatorResponses, IndicatorResponse } from "@/lib/survey-data";
import {
  DEFAULT_INDICATORS,
  INDICATOR_STATUS_OPTIONS,
} from "@/lib/indicator-definitions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  responses: IndicatorResponses;
  onChange: (responses: IndicatorResponses) => void;
}

const STATUS_STYLES: Record<string, string> = {
  "Ahead of schedule": "bg-green-50 text-green-700 border-green-200",
  "On track": "bg-blue-50 text-blue-700 border-blue-200",
  "Off track": "bg-rose-50 text-rose-700 border-rose-200",
  "Not started": "bg-neutral-100 text-neutral-500 border-neutral-200",
  "N/A": "bg-neutral-100 text-neutral-400 border-neutral-200",
};

const selectClassName =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus:border-ring focus:ring-ring/50 focus:ring-[3px] outline-none";

export function IndicatorsForm({ responses, onChange }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  function getResponse(id: string): IndicatorResponse {
    return responses[id] ?? { achievedValue: "", status: "", comment: "" };
  }

  function update(id: string, field: keyof IndicatorResponse, value: string) {
    onChange({
      ...responses,
      [id]: { ...getResponse(id), [field]: value },
    });
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>1. Indicators</CardTitle>
          <CardDescription className="leading-relaxed">
            Report the achieved value for each indicator for this reporting period.
            Only enter numbers. Leave blank if not applicable.
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium text-muted-foreground pb-3 w-10">#</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[260px]">Indicator</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-28 text-center">Baseline</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-24 text-center">Target</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-32">Achieved value</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 w-44">Status</th>
                  <th className="text-left font-medium text-muted-foreground pb-3 min-w-[180px]">Comment</th>
                </tr>
              </thead>
              <tbody>
                {DEFAULT_INDICATORS.map((def) => {
                  const resp = getResponse(def.id);
                  const isOpen = expanded[def.id];
                  const status = resp.status;
                  const isSubIndicator = def.number.includes(".");

                  return (
                    <tr key={def.id} className="border-b last:border-0 align-top">
                      <td className={cn(
                        "py-3 pr-2 font-mono text-xs text-muted-foreground",
                        isSubIndicator && "pl-3"
                      )}>
                        {def.number}
                      </td>
                      <td className="py-3 pr-4">
                        <div className={cn(isSubIndicator && "pl-2 border-l-2 border-muted")}>
                          <p className={cn(
                            "font-medium leading-snug",
                            isSubIndicator && "text-muted-foreground font-normal"
                          )}>
                            {def.title}
                          </p>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1 transition-colors"
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [def.id]: !prev[def.id] }))
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="size-3" />
                            ) : (
                              <ChevronRight className="size-3" />
                            )}
                            {isOpen ? "Hide" : "Show"} description
                          </button>
                          {isOpen && (
                            <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed border-t pt-1.5">
                              {def.description}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs text-muted-foreground">
                          {def.baselineValue}
                          <span className="block text-muted-foreground/50">({def.baselineYear})</span>
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-center">
                        <span className="text-xs text-muted-foreground">
                          {def.targetValue}
                          <span className="block text-muted-foreground/50">({def.targetYear})</span>
                        </span>
                      </td>
                      <td className="py-3 pr-3">
                        <Input
                          type="number"
                          className="text-sm w-28"
                          placeholder="—"
                          value={resp.achievedValue}
                          onChange={(e) => update(def.id, "achievedValue", e.target.value)}
                        />
                      </td>
                      <td className="py-3 pr-3">
                        <div className="space-y-1.5">
                          <select
                            className={selectClassName}
                            value={status}
                            onChange={(e) => update(def.id, "status", e.target.value)}
                          >
                            <option value="">Select status</option>
                            {INDICATOR_STATUS_OPTIONS.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                          {status && STATUS_STYLES[status] && (
                            <span className={cn(
                              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                              STATUS_STYLES[status]
                            )}>
                              {status}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3">
                        <Textarea
                          rows={2}
                          className="text-sm min-h-[60px]"
                          placeholder={status === "Off track" ? "Required if off track…" : ""}
                          value={resp.comment}
                          onChange={(e) => update(def.id, "comment", e.target.value)}
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
    </div>
  );
}
