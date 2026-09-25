"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { InfoPopover } from "@/components/ui/info-popover";
import { ItemComments } from "@/components/report-editor/comments-context";
import { MatrixTableShell } from "@/components/report-editor/matrix-table";
import { usePastYears, PastYearChips } from "@/components/report-editor/past-year-chips";
import { IndicatorTableSwitch, type IndicatorTableKey } from "@/components/report-editor/indicator-table-switch";
import { Badge } from "@/components/report-editor/scale-select";
import { FALLBACK_COLORS } from "@/lib/risk";
import { STATUS_KEYS, statusLabel, cycleLabel, STATUS_COLORS, type IndicatorStatus } from "@/lib/indicators";
import { numericAmount } from "@/lib/numeric-input";
import type { IndicatorMatrixRow, IndicatorState } from "@/components/report-editor/types";
import { type ContributorActivity } from "@/components/report-editor/contributor-matrix";
import { activityLabel } from "@/lib/transfers";

function StatusBadge({ value }: { value: IndicatorStatus }) {
  return <Badge colors={STATUS_COLORS[value] ?? FALLBACK_COLORS}>{statusLabel(value)}</Badge>;
}

// Frozen left columns for the indicator matrix (name + baseline + target stay put
// while the per-year columns scroll horizontally — mirrors the expenditure grid).
//
// These widths have to stay exact numbers rather than a min/max range: each
// column's `left` offset is the sum of the widths before it, so a fluid width
// would desync the sticky offsets and overlap the columns. The indicator column
// is the one that holds prose (name, and the description / means-of-verification
// editors), so it gets the extra room.
const ICOL = {
  ind:      { left: 0,   w: 380 },
  baseline: { left: 380, w: 120 },
  target:   { left: 500, w: 120 },
} as const;
const IND_FROZEN_WIDTH = 620;

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
  updateIndicator: (id: number, patch: Partial<IndicatorState>) => void;
  isAdmin: boolean;
  // Freeze the column headers to the top while the matrix body scrolls.
  fillHeight?: boolean;
  activities: ContributorActivity[];
  activityById: Map<number, ContributorActivity>;
}

export function IndicatorsSection({
  indicatorRows,
  indicatorYears,
  indicatorCurrentYear,
  indicatorStates,
  updateIndicator,
  isAdmin,
  fillHeight = false,
  activities,
  activityById,
}: IndicatorsSectionProps) {
  const { pastYears, shownYears, toggleYear, visibleYears } = usePastYears(indicatorYears, indicatorCurrentYear);
  const [table, setTable] = useState<IndicatorTableKey>("standard");

  const standardRows = indicatorRows.filter((row) => row.is_standard);
  const projectRows = indicatorRows.filter((row) => !row.is_standard);

  const renderIndicatorTable = (rows: IndicatorMatrixRow[], tableType: "standard" | "project") => {
    const tableDescription = tableType === "standard"
      ? "These are standard indicators which are used across all CRAF'd-supported projects."
      : "These are custom indicators added for this project specifically.";

    // An empty table keeps its box, border and frozen header and says so on a row
    // inside — same as the project document's indicator tables. A separate dashed
    // placeholder would make the two boxes look unlike each other exactly when one
    // of them is empty. 3 frozen + columns per visible year (3 for current, 2 for past) + trailing.
    const emptyColSpan = 3
      + visibleYears.reduce((acc, y) => acc + (y === indicatorCurrentYear ? 3 : 2), 0)
      + 1;

    const pastSubCols = [
      { label: labels.indicators.columns.achievedValue, minWidth: "min-w-[90px]" },
      { label: labels.indicators.columns.status, minWidth: "min-w-[110px]" },
    ];

    return (
      <MatrixTableShell
        fillHeight={fillHeight}
        hugContent
        minWidth={IND_FROZEN_WIDTH}
        leadingCols={[
          {
            label: (
              <div className="flex items-center gap-1.5">
                {tableType === "standard" ? labels.indicators.columns.standardIndicator : labels.indicators.columns.customIndicator}
                <InfoPopover description={tableDescription} triggerTitle={`${tableType === "standard" ? "Standard" : "Custom project"} indicator table information`} />
              </div>
            ),
            style: ifz("ind", 30),
          },
          { label: labels.indicators.columns.baseline, style: ifz("baseline", 30) },
          { label: labels.indicators.columns.target, style: ifz("target", 30) },
        ]}
        years={visibleYears}
        currentYear={indicatorCurrentYear}
        subCols={[
          { label: labels.indicators.columns.achievedValue, minWidth: "w-[100px] min-w-[100px]" },
          { label: labels.indicators.columns.status, minWidth: "w-px whitespace-nowrap" },
          { label: labels.indicators.columns.comment, minWidth: "min-w-[200px]" },
        ]}
        pastSubCols={pastSubCols}
        trailingCols={[
          { label: "Linked activity", className: "px-3 py-2 border-l border-b bg-neutral-100 text-left text-sm font-bold text-muted-foreground align-bottom whitespace-nowrap w-48" },
        ]}
      >
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={emptyColSpan} className="border-t px-4 py-8 text-center text-sm text-muted-foreground">
                {tableType === "standard"
                  ? "No CRAFd standard indicators are attached to this report yet."
                  : "No project indicators added yet."}
              </td>
            </tr>
          )}
          {rows.map((row, idx) => {
            const state = indicatorStates[row.currentLineId];
            if (!state) return null;
            return (
              <tr key={row.indicator_id} className="align-top">
                <td style={ifz("ind")} className={cn("px-3 py-2 border-r border-t bg-card", state.dirty && "bg-amber-50/60")}>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 w-6 text-xs tabular-nums text-muted-foreground text-right">{idx + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <>
                        <div className="flex items-start gap-2">
                          {/* The info icon sits inside the <p>, so it trails the name
                              directly and wraps with it. As a sibling it would be a
                              flex item and the flex-1 name would push it to the far
                              edge of the column. Only the comments button, which is a
                              row-level action rather than part of the label, stays
                              pinned right. Matches the project document's rows. */}
                          <p className="font-medium leading-snug flex-1">
                            {row.indicator_name}
                            <span className="ml-1.5 inline-block align-middle">
                              <InfoPopover description={row.indicator_description} meansOfVerification={row.means_of_verification} />
                            </span>
                          </p>
                          <ItemComments section="indicators" itemId={row.currentLineId} />
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {row.category && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{row.category}</span>}
                          {row.cycle && <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cycleLabel(row.cycle)}</span>}
                        </div>
                      </>
                    </div>
                  </div>
                </td>
                <td style={ifz("baseline")} className={cn("px-2 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                  <ValueYear value={tableType === "project" ? state.baseline_value : row.baseline_value} year={tableType === "project" ? (state.baseline_year ? Number(state.baseline_year) : null) : row.baseline_year} />
                </td>
                <td style={ifz("target")} className={cn("px-2 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                  <ValueYear value={tableType === "project" ? state.target_value : row.target_value} year={tableType === "project" ? (state.target_year ? Number(state.target_year) : null) : row.target_year} />
                </td>

                {visibleYears.map((year) => {
                  const current = year === indicatorCurrentYear;
                  if (current) {
                    return (
                      <Fragment key={year}>
                        <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                          <Input
                            inputMode="decimal"
                            value={state.achieved_value}
                            onChange={(e) => updateIndicator(row.currentLineId, { achieved_value: numericAmount(e.target.value) })}
                            placeholder={labels.placeholders.achievedValue}
                            className="text-sm h-8"
                          />
                        </td>
                        <td className="px-1 py-1 border-t bg-crafd-yellow/10 whitespace-nowrap">
                          <Select
                            value={state.status ?? "none"}
                            onValueChange={(v) => updateIndicator(row.currentLineId, { status: v === "none" ? null : v })}
                          >
                            <SelectTrigger className="w-auto h-8 px-2 gap-1.5">
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
                      <td className="px-2 py-2 border-l border-t text-muted-foreground tabular-nums bg-neutral-50 opacity-60">
                        {cell?.achieved_value || <span className="text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-2 py-2 border-t text-muted-foreground bg-neutral-50 opacity-60">
                        {cell?.status ? <StatusBadge value={cell.status as IndicatorStatus} /> : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </Fragment>
                  );
                })}

                <td className="px-3 py-2 border-l border-t text-sm text-muted-foreground">
                  {row.linked_activity_id != null
                    ? activityLabel(activityById.get(row.linked_activity_id)) || "—"
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </MatrixTableShell>
    );
  };

  return (
    // Same shape as the project document's indicators tab. fillHeight: the section
    // claims the tab's remaining height and never scrolls itself — the chosen table
    // claims that height and scrolls internally, so the page stays put.
    // No wrapper around each table: MatrixTableShell brings its own layout slot, and
    // a second one would break the `max-h-full` cap by giving the card an
    // auto-height parent to measure against.
    <div className={cn("flex flex-col gap-4", fillHeight && "flex-1 min-h-0")}>
      {/* Past-year chips keep the left of the row; the table switch sits on the
          right. PastYearChips renders nothing when there are no past years, so
          the switch is pushed right with ml-auto rather than justify-between. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <PastYearChips pastYears={pastYears} shownYears={shownYears} onToggle={toggleYear} />
        <div className="ml-auto">
          <IndicatorTableSwitch
            value={table}
            onChange={setTable}
            standardCount={standardRows.length}
            customCount={projectRows.length}
          />
        </div>
      </div>
      {table === "standard" && renderIndicatorTable(standardRows, "standard")}
      {table === "custom" && renderIndicatorTable(projectRows, "project")}
    </div>
  );
}
