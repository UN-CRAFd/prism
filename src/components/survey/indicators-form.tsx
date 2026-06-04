"use client";

import { useState, useEffect, useCallback } from "react";
import { Input } from "@/components/ui/input";
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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, Save, CheckCircle } from "lucide-react";
import { INDICATOR_STATUS_OPTIONS } from "@/lib/indicator-definitions";

export interface DbIndicatorRow {
  id: number;
  indicator_id: number;
  indicator_title: string;
  description: string;
  means_of_verification: string;
  category: string;
  value_type: string;
  baseline_value: string | null;
  target_value: string | null;
  target_year: number | null;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
}

interface EditableValues {
  achieved_value: string;
  status: string;
  comment: string;
}

interface Props {
  projectId: string | null;
  year: number;
}

const STATUS_STYLES: Record<string, string> = {
  "Ahead of schedule": "bg-green-50 text-green-700 border-green-200",
  "On track": "bg-blue-50 text-blue-700 border-blue-200",
  "Off track": "bg-rose-50 text-rose-700 border-rose-200",
  "Not started": "bg-neutral-100 text-neutral-500 border-neutral-200",
  "N/A": "bg-neutral-100 text-neutral-400 border-neutral-200",
};

function StatusBadge({ value }: { value: string }) {
  const style = STATUS_STYLES[value];
  if (!style) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        style
      )}
    >
      {value}
    </span>
  );
}

export function IndicatorsForm({ projectId, year }: Props) {
  const [rows, setRows] = useState<DbIndicatorRow[]>([]);
  const [edits, setEdits] = useState<Record<number, EditableValues>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    setLoading(true);
    fetch(`/api/indicator-sections?project_id=${projectId}&year=${year}`)
      .then((r) => r.json())
      .then((data: DbIndicatorRow[]) => {
        setRows(data);
        const initial: Record<number, EditableValues> = {};
        for (const row of data) {
          initial[row.id] = {
            achieved_value: row.achieved_value ?? "",
            status: row.status ?? "",
            comment: row.comment ?? "",
          };
        }
        setEdits(initial);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [projectId, year]);

  const update = useCallback(
    (id: number, field: keyof EditableValues, value: string) => {
      setEdits((prev) => ({
        ...prev,
        [id]: { ...(prev[id] ?? { achieved_value: "", status: "", comment: "" }), [field]: value },
      }));
      setSaved(false);
    },
    []
  );

  async function handleSave() {
    if (!projectId) return;
    setSaving(true);
    try {
      const payload = rows.map((row) => ({
        id: row.id,
        ...(edits[row.id] ?? { achieved_value: "", status: "", comment: "" }),
      }));
      await fetch(`/api/indicator-sections?project_id=${projectId}&year=${year}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: payload }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>1. Indicators</CardTitle>
              <CardDescription className="leading-relaxed mt-1">
                Report the achieved value for each indicator for this reporting period.
                Only enter numbers. Leave blank if not applicable.
              </CardDescription>
            </div>
            {rows.length > 0 && (
              <Button
                onClick={handleSave}
                disabled={saving}
                className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90 font-semibold shrink-0"
              >
                {saved ? (
                  <>
                    <CheckCircle className="size-4" />
                    Saved
                  </>
                ) : (
                  <>
                    <Save className="size-4" />
                    Save
                  </>
                )}
              </Button>
            )}
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Loading indicators...</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No indicators found for this report. Indicator sections must be seeded for your project before they appear here.
            </p>
          ) : (
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
                  {rows.map((row, index) => {
                    const edit = edits[row.id] ?? { achieved_value: "", status: "", comment: "" };
                    const isOpen = expanded[row.id];
                    const status = edit.status;

                    return (
                      <tr key={row.id} className="border-b last:border-0 align-top">
                        <td className="py-3 pr-2 font-mono text-xs text-muted-foreground">
                          {index + 1}
                        </td>
                        <td className="py-3 pr-4">
                          <p className="font-medium leading-snug">{row.indicator_title}</p>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground mt-1 transition-colors"
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [row.id]: !prev[row.id] }))
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
                              {row.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className="text-xs text-muted-foreground">
                            {row.baseline_value ?? "---"}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-center">
                          <span className="text-xs text-muted-foreground">
                            {row.target_value ?? "---"}
                            {row.target_year && (
                              <span className="block text-muted-foreground/50">({row.target_year})</span>
                            )}
                          </span>
                        </td>
                        <td className="py-3 pr-3">
                          <Input
                            type="number"
                            className="text-sm w-28"
                            placeholder="--"
                            value={edit.achieved_value}
                            onChange={(e) => update(row.id, "achieved_value", e.target.value)}
                          />
                        </td>
                        <td className="py-3 pr-3">
                          <Select
                            value={status}
                            onValueChange={(v) => update(row.id, "status", v)}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select status">
                                {status ? <StatusBadge value={status} /> : undefined}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {INDICATOR_STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  <StatusBadge value={opt} />
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-3">
                          <Textarea
                            rows={2}
                            className="text-sm min-h-[60px]"
                            placeholder={status === "Off track" ? "Required if off track..." : ""}
                            value={edit.comment}
                            onChange={(e) => update(row.id, "comment", e.target.value)}
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
    </div>
  );
}
