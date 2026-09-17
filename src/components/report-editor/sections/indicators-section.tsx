"use client";

import { Fragment, useState, type CSSProperties } from "react";
import { Loader2, Plus, Trash2, X, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { useReadOnly } from "@/components/ui/read-only-context";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { InfoPopover } from "@/components/ui/info-popover";
import { ItemComments } from "@/components/report-editor/comments-context";
import { ClampedText } from "@/components/report-editor/clamped-text";
import { MatrixTableShell } from "@/components/report-editor/matrix-table";
import { Badge } from "@/components/report-editor/scale-select";
import { FALLBACK_COLORS } from "@/lib/risk";
import { STATUS_KEYS, statusLabel, cycleLabel, STATUS_COLORS, type IndicatorStatus } from "@/lib/indicators";
import { numericYear } from "@/lib/numeric-input";
import type { IndicatorMatrixRow, IndicatorState } from "@/components/report-editor/types";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
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

  // Add-a-custom-indicator form
  newIndicatorName: string;
  setNewIndicatorName: (v: string) => void;
  newIndicatorDescription: string;
  setNewIndicatorDescription: (v: string) => void;
  newIndicatorMeansOfVerification: string;
  setNewIndicatorMeansOfVerification: (v: string) => void;
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

  // Reuse an existing indicator from the shared vocabulary (standard + other
  // projects' customs, ranked by recurrence) instead of re-creating one.
  indicatorComboItems: ComboboxItem[];
  handleIndicatorSelectExisting: (indicatorId: number) => void;

  updateIndicator: (id: number, patch: Partial<IndicatorState>) => void;

  // Row removal. Admins may remove any indicator; partners only their own custom
  // (non-standard) ones — the button is hidden on standard rows for partners.
  isAdmin: boolean;
  deletingIndicatorLineId: number | null;
  handleIndicatorDelete: (row: IndicatorMatrixRow) => void;

  // Optional inline edit for custom indicators. When omitted, the Pencil button
  // is not rendered.
  onEditIndicator?: (indicatorId: number, patch: { name: string; description: string | null; means_of_verification: string | null }) => Promise<void>;
  // Annual reports only enter the current year's achieved value, status, and
  // comment. Indicator structure is managed from the project document.
  canManageIndicators?: boolean;

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
  newIndicatorName,
  setNewIndicatorName,
  newIndicatorDescription,
  setNewIndicatorDescription,
  newIndicatorMeansOfVerification,
  setNewIndicatorMeansOfVerification,
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
  indicatorComboItems,
  handleIndicatorSelectExisting,
  updateIndicator,
  isAdmin,
  deletingIndicatorLineId,
  handleIndicatorDelete,
  onEditIndicator,
  canManageIndicators = true,
  fillHeight = false,
  activities,
  activityById,
}: IndicatorsSectionProps) {
  const readOnly = useReadOnly();
  // Name, description and means of verification are all mandatory for a
  // partner-defined custom indicator; baseline/target remain optional.
  const canAddIndicator =
    !!newIndicatorName.trim() &&
    !!newIndicatorDescription.trim() &&
    !!newIndicatorMeansOfVerification.trim();

  // The create panel is hidden until the user chooses "create a new one" from the
  // search box (Combobox onCreate). At that point we pre-fill the typed text as the
  // name and reveal the description / means-of-verification / baseline / target
  // fields, which are required before the indicator can join the shared vocabulary.
  const [creating, setCreating] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  const [editingIndicatorId, setEditingIndicatorId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editMov, setEditMov] = useState("");
  const [editBaselineValue, setEditBaselineValue] = useState("");
  const [editBaselineYear, setEditBaselineYear] = useState("");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editTargetYear, setEditTargetYear] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function handleEditSave(indicatorId: number, lineId: number) {
    if (!editName.trim() || !onEditIndicator) return;
    setSavingEdit(true);
    try {
      await onEditIndicator(indicatorId, { name: editName, description: editDesc || null, means_of_verification: editMov || null });
      updateIndicator(lineId, {
        baseline_value: editBaselineValue,
        baseline_year: editBaselineYear,
        target_value: editTargetValue,
        target_year: editTargetYear,
      });
      setEditingIndicatorId(null);
    } finally {
      setSavingEdit(false);
    }
  }

  function openCreate(name: string) {
    setNewIndicatorName(name);
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setShowPicker(false);
    setNewIndicatorName("");
    setNewIndicatorDescription("");
    setNewIndicatorMeansOfVerification("");
    setNewIndicatorBaselineValue("");
    setNewIndicatorBaselineYear("");
    setNewIndicatorTargetValue("");
    setNewIndicatorTargetYear("");
  }

  async function submitCreate() {
    await handleIndicatorAdd();
    setCreating(false);
    setShowPicker(false);
  }

  const standardRows = indicatorRows.filter((row) => row.is_standard);
  const projectRows = indicatorRows.filter((row) => !row.is_standard);

  const renderIndicatorTable = (rows: IndicatorMatrixRow[], tableType: "standard" | "project") => {
    const tableDescription = tableType === "standard"
      ? "These are standard indicators which are used across all CRAF'd-supported projects."
      : "These are custom indicators added for this project specifically.";

    // The trailing column only ever holds the edit/delete controls, which are for
    // custom indicators on a surface that manages them. Anywhere else (the whole
    // annual report, where canManageIndicators is false, and the standard table) it
    // would be a permanently empty column, so it is dropped rather than rendered blank.
    const showActions = canManageIndicators && tableType === "project";

    // An empty table keeps its box, border and frozen header and says so on a row
    // inside — same as the project document's indicator tables. A separate dashed
    // placeholder would make the two boxes look unlike each other exactly when one
    // of them is empty. 3 frozen + 3 per year + the trailing column when present.
    const emptyColSpan = 3 + indicatorYears.length * 3 + 1 + (showActions ? 1 : 0);

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
        years={indicatorYears}
        currentYear={indicatorCurrentYear}
        subCols={[
          { label: labels.indicators.columns.achievedValue, minWidth: "min-w-[130px]" },
          { label: labels.indicators.columns.status, minWidth: "min-w-[140px]" },
          { label: labels.indicators.columns.comment, minWidth: "min-w-[200px]" },
        ]}
        trailingCols={[
          { label: "Linked activity", className: "px-3 py-2 border-l border-b bg-neutral-100 text-left text-sm font-bold text-muted-foreground align-bottom whitespace-nowrap w-48" },
          ...(showActions ? [{ className: "px-2 py-2 border-l border-b bg-neutral-100 w-12" }] : []),
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
          {rows.map((row) => {
            const state = indicatorStates[row.currentLineId];
            if (!state) return null;
            return (
              <tr key={row.indicator_id} className="align-top">
                <td style={ifz("ind")} className={cn("px-3 py-2 border-r border-t bg-card", state.dirty && "bg-amber-50/60")}>
                  {editingIndicatorId === row.indicator_id ? (
                    <div className="flex flex-col gap-1.5">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder={labels.placeholders.indicatorName} className="text-sm" autoFocus />
                      <Textarea value={editDesc} onChange={(e) => setEditDesc(e.target.value)} placeholder={labels.placeholders.indicatorDescription} className="text-sm min-h-[64px] resize-y" />
                      <Textarea value={editMov} onChange={(e) => setEditMov(e.target.value)} placeholder={labels.placeholders.meansOfVerification} className="text-sm min-h-[64px] resize-y" />
                    </div>
                  ) : (
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
                  )}
                </td>
                <td style={ifz("baseline")} className={cn("px-2 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                  {canManageIndicators && tableType === "project" && editingIndicatorId === row.indicator_id ? (
                    <div className="flex flex-col gap-1">
                      <Input type="number" value={editBaselineValue} onChange={(e) => setEditBaselineValue(e.target.value)} placeholder={labels.indicators.columns.baselineValue} className="h-8 text-sm" />
                      <Input type="text" inputMode="numeric" value={editBaselineYear} onChange={(e) => setEditBaselineYear(numericYear(e.target.value))} placeholder={labels.indicators.columns.baselineYear} className="h-8 text-sm" />
                    </div>
                  ) : <ValueYear value={tableType === "project" ? state.baseline_value : row.baseline_value} year={tableType === "project" ? (state.baseline_year ? Number(state.baseline_year) : null) : row.baseline_year} />}
                </td>
                <td style={ifz("target")} className={cn("px-2 py-2 border-r border-t bg-card tabular-nums", state.dirty && "bg-amber-50/60")}>
                  {canManageIndicators && tableType === "project" && editingIndicatorId === row.indicator_id ? (
                    <div className="flex flex-col gap-1">
                      <Input type="number" value={editTargetValue} onChange={(e) => setEditTargetValue(e.target.value)} placeholder={labels.indicators.columns.targetValue} className="h-8 text-sm" />
                      <Input type="text" inputMode="numeric" value={editTargetYear} onChange={(e) => setEditTargetYear(numericYear(e.target.value))} placeholder={labels.indicators.columns.targetYear} className="h-8 text-sm" />
                    </div>
                  ) : <ValueYear value={tableType === "project" ? state.target_value : row.target_value} year={tableType === "project" ? (state.target_year ? Number(state.target_year) : null) : row.target_year} />}
                </td>

                {indicatorYears.map((year) => {
                  const current = year === indicatorCurrentYear;
                  if (current) {
                    return (
                      <Fragment key={year}>
                        <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                          <Input
                            type="number"
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
                      <td className="px-2 py-2 border-t text-muted-foreground align-top">
                        {cell?.comment
                          ? <ClampedText text={cell.comment} className="text-xs" />
                          : <span className="text-muted-foreground/40">—</span>}
                      </td>
                    </Fragment>
                  );
                })}

                <td className="px-3 py-2 border-l border-t text-sm text-muted-foreground">
                  {row.linked_activity_id != null
                    ? activityLabel(activityById.get(row.linked_activity_id)) || "—"
                    : "—"}
                </td>

                {showActions && (
                <td className="px-2 py-2 border-l border-t text-center">
                  {editingIndicatorId === row.indicator_id ? (
                    <div className="flex flex-row items-center justify-center gap-3">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => handleEditSave(row.indicator_id, row.currentLineId)} disabled={savingEdit || !editName.trim()}>
                        {savingEdit ? <Loader2 className="size-3 animate-spin" /> : labels.adminEditor.save}
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setEditingIndicatorId(null)} disabled={savingEdit}>
                        {labels.common.cancel}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex flex-row items-center justify-center gap-3">
                      {!readOnly && !!onEditIndicator && (
                        <button
                          onClick={() => {
                            setEditingIndicatorId(row.indicator_id);
                            setEditName(row.indicator_name);
                            setEditDesc(row.indicator_description ?? "");
                            setEditMov(row.means_of_verification ?? "");
                            setEditBaselineValue(row.baseline_value ?? "");
                            setEditBaselineYear(row.baseline_year != null ? String(row.baseline_year) : "");
                            setEditTargetValue(row.target_value ?? "");
                            setEditTargetYear(row.target_year != null ? String(row.target_year) : "");
                          }}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={`Edit indicator ${row.indicator_name}`}
                          title="Edit indicator"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {(isAdmin || !row.is_standard) && (
                        <button
                          onClick={() => handleIndicatorDelete(row)}
                          disabled={deletingIndicatorLineId === row.currentLineId}
                          className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                          aria-label={`Remove indicator ${row.indicator_name}`}
                        >
                          {deletingIndicatorLineId === row.currentLineId
                            ? <Loader2 className="size-3.5 animate-spin" />
                            : <Trash2 className="size-3.5" />}
                        </button>
                      )}
                    </div>
                  )}
                </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </MatrixTableShell>
    );
  };

  return (
    // Same shape as the project document's indicators tab. fillHeight: the section
    // claims the tab's remaining height and never scrolls itself — the two tables
    // split that height between them and scroll internally, so the page stays put.
    // No wrapper around each table: MatrixTableShell brings its own layout slot, and
    // a second one would break the `max-h-full` cap by giving the card an
    // auto-height parent to measure against.
    <div className={cn("flex flex-col gap-4", fillHeight && "flex-1 min-h-0")}>
      {renderIndicatorTable(standardRows, "standard")}

      {canManageIndicators && (
      <div className="flex shrink-0 flex-col items-start gap-2">
        {showPicker && (
          <div className="max-w-xl">
            <Combobox
              items={indicatorComboItems}
              placeholder={labels.placeholders.indicatorSearch}
              onSelect={(item) => handleIndicatorSelectExisting(item.id)}
              onCreate={openCreate}
              createLabel={labels.adminEditor.createIndicator}
              busy={addingIndicator}
            />
          </div>
        )}
        {creating && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 w-full">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{labels.adminEditor.createIndicator}</p>
              <Button variant="ghost" size="sm" onClick={cancelCreate} className="h-7 px-2 text-muted-foreground">
                <X className="size-4 mr-1" />{labels.adminEditor.cancel ?? "Cancel"}
              </Button>
            </div>
            <div className="flex items-start gap-2">
              <Input required placeholder={labels.placeholders.indicatorName} value={newIndicatorName} onChange={(e) => setNewIndicatorName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && canAddIndicator) submitCreate(); }} className="flex-[2]" autoFocus />
              <Textarea required placeholder={labels.placeholders.indicatorDescription} value={newIndicatorDescription} onChange={(e) => setNewIndicatorDescription(e.target.value)} className="flex-[2] text-sm min-h-9 resize-y" />
              <Textarea required placeholder={labels.placeholders.meansOfVerification} value={newIndicatorMeansOfVerification} onChange={(e) => setNewIndicatorMeansOfVerification(e.target.value)} className="flex-[2] text-sm min-h-9 resize-y" />
            </div>
            <div className="flex gap-2">
              <Input type="number" placeholder={labels.indicators.columns.baselineValue} value={newIndicatorBaselineValue} onChange={(e) => setNewIndicatorBaselineValue(e.target.value)} className="flex-[1.5]" />
              <Input placeholder={labels.indicators.columns.baselineYear} type="text" inputMode="numeric" value={newIndicatorBaselineYear} onChange={(e) => setNewIndicatorBaselineYear(numericYear(e.target.value))} className="flex-[1.0]" />
              <Input type="number" placeholder={labels.indicators.columns.targetValue} value={newIndicatorTargetValue} onChange={(e) => setNewIndicatorTargetValue(e.target.value)} className="flex-[1.5]" />
              <Input placeholder={labels.indicators.columns.targetYear} type="text" inputMode="numeric" value={newIndicatorTargetYear} onChange={(e) => setNewIndicatorTargetYear(numericYear(e.target.value))} className="flex-[1.0]" />
              <Button onClick={submitCreate} disabled={addingIndicator || !canAddIndicator} size="sm" className="shrink-0 ml-auto">
                {addingIndicator ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
              </Button>
            </div>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => creating ? cancelCreate() : setShowPicker((visible) => !visible)} className="gap-1">
          {showPicker ? <X className="size-4" /> : <Plus className="size-4" />} {showPicker ? "Cancel" : "Add indicator"}
        </Button>
      </div>
      )}

      {renderIndicatorTable(projectRows, "project")}
    </div>
  );
}
