"use client";

import { Fragment, useMemo, type CSSProperties } from "react";
import { Loader2, Plus, Info, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ItemComments } from "@/components/report-editor/comments-context";
import { MatrixTableShell } from "@/components/report-editor/matrix-table";
import { Badge } from "@/components/report-editor/scale-select";
import { FALLBACK_COLORS } from "@/lib/risk";
import { STATUS_KEYS, statusLabel, cycleLabel, STATUS_COLORS, type IndicatorStatus } from "@/lib/indicators";
import type { IndicatorMatrixRow, IndicatorState } from "@/components/report-editor/types";

function StatusBadge({ value }: { value: IndicatorStatus }) {
  return <Badge colors={STATUS_COLORS[value] ?? FALLBACK_COLORS}>{statusLabel(value)}</Badge>;
}

// Frozen left columns for the indicator matrix (name + baseline + target stay put
// while the per-year columns scroll horizontally — mirrors the expenditure grid).
const ICOL = {
  ind:      { left: 0,   w: 300 },
  baseline: { left: 300, w: 120 },
  target:   { left: 420, w: 120 },
} as const;
const IND_FROZEN_WIDTH = 540;

function ifz(key: keyof typeof ICOL, z = 20): CSSProperties {
  const c = ICOL[key];
  return { position: "sticky", left: c.left, width: c.w, minWidth: c.w, maxWidth: c.w, zIndex: z };
}

// "value (year)" for the baseline / target reference cells.
function ValueYear({ value, year }: { value: string | null; year: number | null }) {
  if (!value) return <span className="text-muted-foreground/40">—</span>;
  return <>{value}{year ? <span className="text-muted-foreground"> ({year})</span> : null}</>;
}

export interface IndicatorsSectionProps {
  indicatorRows: IndicatorMatrixRow[];
  indicatorYears: number[];
  indicatorCurrentYear: number | null;
  indicatorStates: Record<number, IndicatorState>;

  // Add-a-custom-indicator form
  newIndicatorName: string;
  setNewIndicatorName: (v: string) => void;
  newIndicatorBaselineValue: string;
  setNewIndicatorBaselineValue: (v: string) => void;
  newIndicatorBaselineYear: string;
  setNewIndicatorBaselineYear: (v: string) => void;
  newIndicatorTargetValue: string;
  setNewIndicatorTargetValue: (v: string) => void;
  newIndicatorTargetYear: string;
  setNewIndicatorTargetYear: (v: string) => void;
  addingIndicator: boolean;
  handleIndicatorAdd: () => void;

  updateIndicator: (id: number, patch: Partial<IndicatorState>) => void;
}

export function IndicatorsSection({
  indicatorRows,
  indicatorYears,
  indicatorCurrentYear,
  indicatorStates,
  newIndicatorName,
  setNewIndicatorName,
  newIndicatorBaselineValue,
  setNewIndicatorBaselineValue,
  newIndicatorBaselineYear,
  setNewIndicatorBaselineYear,
  newIndicatorTargetValue,
  setNewIndicatorTargetValue,
  newIndicatorTargetYear,
  setNewIndicatorTargetYear,
  addingIndicator,
  handleIndicatorAdd,
  updateIndicator,
}: IndicatorsSectionProps) {
  return (
    <div className="space-y-4">
      {/* Add a custom, partner-defined indicator (project-scoped) */}
      <div className="flex gap-2">
        <Input placeholder={labels.placeholders.indicatorName} value={newIndicatorName} onChange={(e) => setNewIndicatorName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newIndicatorName.trim()) handleIndicatorAdd(); }} className="flex-[5]" />
        <Input placeholder={labels.indicators.columns.baselineValue} value={newIndicatorBaselineValue} onChange={(e) => setNewIndicatorBaselineValue(e.target.value)} className="flex-[1.5]" />
        <Input placeholder={labels.indicators.columns.baselineYear} type="number" value={newIndicatorBaselineYear} onChange={(e) => setNewIndicatorBaselineYear(e.target.value)} className="flex-[1]" />
        <Input placeholder={labels.indicators.columns.targetValue} value={newIndicatorTargetValue} onChange={(e) => setNewIndicatorTargetValue(e.target.value)} className="flex-[1.5]" />
        <Input placeholder={labels.indicators.columns.targetYear} type="number" value={newIndicatorTargetYear} onChange={(e) => setNewIndicatorTargetYear(e.target.value)} className="flex-[1]" />
        <Button onClick={handleIndicatorAdd} disabled={addingIndicator || !newIndicatorName.trim()} size="sm" className="shrink-0">
          {addingIndicator ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
        </Button>
      </div>

      {indicatorRows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {labels.partnerEditor.emptyIndicators}
        </div>
      ) : (() => {
        const grouped = useMemo(() => {
          const map = new Map<string, typeof indicatorRows>();
          for (const row of indicatorRows) {
            const cat = row.category || "(No category)";
            if (!map.has(cat)) map.set(cat, []);
            map.get(cat)!.push(row);
          }
          return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        }, [indicatorRows]);

        return (
      <MatrixTableShell
        minWidth={IND_FROZEN_WIDTH}
        leadingCols={[
          { label: labels.indicators.columns.indicator, style: ifz("ind", 30) },
          { label: labels.indicators.columns.baseline, style: ifz("baseline", 30) },
          { label: labels.indicators.columns.target, style: ifz("target", 30) },
        ]}
        years={indicatorYears}
        currentYear={indicatorCurrentYear}
        subCols={[
          { label: labels.indicators.columns.achievedValue, minWidth: "min-w-[130px]" },
          { label: labels.indicators.columns.status, minWidth: "min-w-[140px]" },
          { label: labels.indicators.columns.comment, minWidth: "min-w-[200px]" },
        ]}
      >
          <tbody>
            {grouped.map(([category, rows]) => [
              <tr key={`cat-${category}`} className="bg-muted/40">
                <td colSpan={3 + indicatorYears.length * 3} style={ifz("ind")} className="px-3 py-2.5">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <Layers className="size-3.5 text-muted-foreground" />
                    {category}
                    <span className="text-xs text-muted-foreground font-normal">({rows.length})</span>
                  </div>
                </td>
              </tr>,
              ...rows.map((row) => {
              const state = indicatorStates[row.currentLineId];
              if (!state) return null;
              return (
                <tr key={row.indicator_id} className="align-top">
                  {/* Frozen: indicator name + baseline + target */}
                  <td style={ifz("ind")} className={cn("px-3 py-2 border-r border-t bg-card", state.dirty && "bg-amber-50/60")}>
                    <div className="flex items-start gap-2">
                      <p className="font-medium leading-snug flex-1">{row.indicator_name}</p>
                      {row.indicator_description && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Info className="size-4 text-muted-foreground flex-shrink-0 mt-0.5 cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">{row.indicator_description}</TooltipContent>
                        </Tooltip>
                      )}
                      <ItemComments section="indicators" itemId={row.currentLineId} />
                    </div>
                    {row.means_of_verification && (
                      <p className="text-xs text-muted-foreground mt-1">{row.means_of_verification}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {row.category && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{row.category}</span>}
                      {row.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(row.cycle)}</span>}
                    </div>
                  </td>
                  <td style={ifz("baseline")} className={cn("px-3 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                    <ValueYear value={row.baseline_value} year={row.baseline_year} />
                  </td>
                  <td style={ifz("target")} className={cn("px-3 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                    <ValueYear value={row.target_value} year={row.target_year} />
                  </td>

                  {/* Scrollable per-year cells */}
                  {indicatorYears.map((year) => {
                    const current = year === indicatorCurrentYear;
                    if (current) {
                      return (
                        <Fragment key={year}>
                          <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                            <Input
                              value={state.achieved_value}
                              onChange={(e) => updateIndicator(row.currentLineId, { achieved_value: e.target.value })}
                              placeholder={labels.placeholders.achievedValue}
                              className="text-sm h-8"
                            />
                          </td>
                          <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                            <Select
                              value={state.status ?? "none"}
                              onValueChange={(v) => updateIndicator(row.currentLineId, { status: v === "none" ? null : v })}
                            >
                              <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
                                {state.status
                                  ? <StatusBadge value={state.status as IndicatorStatus} />
                                  : <span className="text-muted-foreground text-sm px-1">—</span>}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                {STATUS_KEYS.map((k) => (
                                  <SelectItem key={k} value={k}><StatusBadge value={k} /></SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                            <Textarea
                              value={state.comment}
                              onChange={(e) => updateIndicator(row.currentLineId, { comment: e.target.value })}
                              placeholder={labels.placeholders.indicatorComment}
                              className="text-sm min-h-[36px] resize-y"
                            />
                          </td>
                        </Fragment>
                      );
                    }
                    const cell = row.byYear[year];
                    return (
                      <Fragment key={year}>
                        <td className="px-2 py-2 border-l border-t text-muted-foreground tabular-nums">
                          {cell?.achieved_value || <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-2 py-2 border-t">
                          {cell?.status ? <StatusBadge value={cell.status as IndicatorStatus} /> : <span className="text-muted-foreground/40">—</span>}
                        </td>
                        <td className="px-2 py-2 border-t text-muted-foreground">
                          {cell?.comment
                            ? <p className="line-clamp-3 text-xs">{cell.comment}</p>
                            : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            }),
            ]).flat()}
          </tbody>
      </MatrixTableShell>
        );
      })()}
    </div>
  );
}
