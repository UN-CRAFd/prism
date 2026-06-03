"use client";

import { useMemo } from "react";
import type { RiskEntry } from "@/lib/survey-data";
import {
  DEFAULT_RISKS,
  LIKELIHOOD_OPTIONS,
  IMPACT_OPTIONS,
  computeRiskLevel,
  RISK_LEVEL_STYLES,
} from "@/lib/indicator-definitions";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  entries: RiskEntry[];
  onChange: (entries: RiskEntry[]) => void;
}

const selectClassName =
  "flex h-8 rounded-md border border-input bg-transparent px-2 text-sm focus:border-ring outline-none";

function initDefaultEntries(existing: RiskEntry[]): RiskEntry[] {
  return DEFAULT_RISKS.map((def) => {
    const found = existing.find((e) => e.id === def.id);
    return found ?? {
      id: def.id,
      isExisting: true,
      number: def.number,
      title: def.title,
      categories: def.categories,
      likelihood: "",
      impact: "",
      mitigationStrategy: "",
    };
  });
}

export function RiskManagementForm({ entries, onChange }: Props) {
  // Separate pre-existing (template) from new (partner-added)
  const defaultEntries = useMemo(
    () => initDefaultEntries(entries.filter((e) => e.isExisting)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const allEntries: RiskEntry[] = useMemo(() => {
    const existingUpdated = defaultEntries.map((def) => {
      const stored = entries.find((e) => e.id === def.id);
      return stored ?? def;
    });
    const newEntries = entries.filter((e) => !e.isExisting);
    return [...existingUpdated, ...newEntries];
  }, [entries, defaultEntries]);

  function updateEntry(id: string, field: keyof RiskEntry, value: string) {
    const next = allEntries.map((e) =>
      e.id !== id ? e : { ...e, [field]: value }
    );
    onChange(next);
  }

  function addNewRisk() {
    const maxNum = allEntries.reduce((m, e) => Math.max(m, e.number), 0);
    const newEntry: RiskEntry = {
      id: `new-${Date.now()}`,
      isExisting: false,
      number: maxNum + 1,
      title: "",
      categories: "",
      likelihood: "",
      impact: "",
      mitigationStrategy: "",
    };
    onChange([...allEntries, newEntry]);
  }

  function removeNew(id: string) {
    onChange(allEntries.filter((e) => e.id !== id));
  }

  const existingRows = allEntries.filter((e) => e.isExisting);
  const newRows = allEntries.filter((e) => !e.isExisting);

  return (
    <div className="space-y-6">
      <Card className="border-0 py-0 gap-0">
        <CardHeader className="px-0">
          <CardTitle>4. Risk Management</CardTitle>
          <CardDescription className="leading-relaxed">
            Update the status of existing risks and add any new risks identified during
            the reporting period. Risk level is computed automatically from Likelihood × Impact.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Risk level:</span>
        {["Low", "Medium", "High", "Extreme"].map((level) => (
          <span
            key={level}
            className={cn(
              "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
              RISK_LEVEL_STYLES[level]
            )}
          >
            {level}
          </span>
        ))}
      </div>

      {/* Existing risks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Existing risks</CardTitle>
        </CardHeader>
        <CardContent>
          <RiskTable
            rows={existingRows}
            onUpdate={updateEntry}
            onRemove={undefined}
            showTitleEdit={false}
          />
        </CardContent>
      </Card>

      {/* New risks */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">New risks</CardTitle>
            <Button variant="outline" size="sm" onClick={addNewRisk}>
              <Plus className="size-3.5" />
              Add risk
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {newRows.length === 0 ? (
            <p className="text-sm text-muted-foreground italic py-2">
              No new risks added for this period.
            </p>
          ) : (
            <RiskTable
              rows={newRows}
              onUpdate={updateEntry}
              onRemove={removeNew}
              showTitleEdit
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RiskTable({
  rows,
  onUpdate,
  onRemove,
  showTitleEdit,
}: {
  rows: RiskEntry[];
  onUpdate: (id: string, field: keyof RiskEntry, value: string) => void;
  onRemove: ((id: string) => void) | undefined;
  showTitleEdit: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium text-muted-foreground pb-3 w-8">#</th>
            <th className="text-left font-medium text-muted-foreground pb-3 min-w-[200px]">Risk description</th>
            <th className="text-left font-medium text-muted-foreground pb-3 min-w-[140px]">Categories</th>
            <th className="text-left font-medium text-muted-foreground pb-3 w-36">Likelihood</th>
            <th className="text-left font-medium text-muted-foreground pb-3 w-36">Impact</th>
            <th className="text-left font-medium text-muted-foreground pb-3 w-28">Risk level</th>
            <th className="text-left font-medium text-muted-foreground pb-3 min-w-[160px]">Mitigation strategy</th>
            {onRemove && <th className="w-8" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const riskCalc = computeRiskLevel(row.likelihood, row.impact);

            return (
              <tr key={row.id} className="border-b last:border-0 align-top">
                <td className="py-3 pr-2 text-muted-foreground font-mono text-xs">
                  {row.number}.
                </td>

                {/* Title */}
                <td className="py-3 pr-3">
                  {showTitleEdit ? (
                    <Textarea
                      rows={2}
                      className="text-sm min-h-[60px]"
                      placeholder="Describe the risk…"
                      value={row.title}
                      onChange={(e) => onUpdate(row.id, "title", e.target.value)}
                    />
                  ) : (
                    <p className="leading-snug">{row.title}</p>
                  )}
                </td>

                {/* Categories */}
                <td className="py-3 pr-3">
                  {showTitleEdit ? (
                    <Input
                      className="text-sm"
                      placeholder="e.g. Operational"
                      value={row.categories}
                      onChange={(e) => onUpdate(row.id, "categories", e.target.value)}
                    />
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {row.categories.split(",").map((c) => c.trim()).filter(Boolean).map((cat) => (
                        <Badge key={cat} variant="outline" className="text-xs font-normal">
                          {cat}
                        </Badge>
                      ))}
                    </div>
                  )}
                </td>

                {/* Likelihood */}
                <td className="py-3 pr-3">
                  <select
                    className={selectClassName}
                    value={row.likelihood}
                    onChange={(e) => onUpdate(row.id, "likelihood", e.target.value)}
                  >
                    <option value="">Select</option>
                    {LIKELIHOOD_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>

                {/* Impact */}
                <td className="py-3 pr-3">
                  <select
                    className={selectClassName}
                    value={row.impact}
                    onChange={(e) => onUpdate(row.id, "impact", e.target.value)}
                  >
                    <option value="">Select</option>
                    {IMPACT_OPTIONS.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </td>

                {/* Risk level (computed) */}
                <td className="py-3 pr-3">
                  {riskCalc ? (
                    <span className={cn(
                      "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
                      RISK_LEVEL_STYLES[riskCalc.level]
                    )}>
                      {riskCalc.level}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">—</span>
                  )}
                </td>

                {/* Mitigation */}
                <td className="py-3 pr-3">
                  <Textarea
                    rows={2}
                    className="text-sm min-h-[60px]"
                    placeholder="Describe mitigation strategy…"
                    value={row.mitigationStrategy}
                    onChange={(e) => onUpdate(row.id, "mitigationStrategy", e.target.value)}
                  />
                </td>

                {onRemove && (
                  <td className="py-3">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemove(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
