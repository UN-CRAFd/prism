"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { RequiredMark } from "@/components/ui/required-mark";
import { cn } from "@/lib/utils";
import { HEAD_TEXT, SUBHEAD_TEXT, CURRENT_YEAR_HEAD, HEAD_BG, HEAD_COLOR, SUBHEAD_BG } from "@/components/report-editor/matrix-table";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { ItemComments } from "@/components/report-editor/comments-context";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { SCALE_COLORS, FALLBACK_COLORS, likelihoodLabel, impactLabel, computeRiskLevelKey, riskLevelLabel, RISK_LEVEL_COLORS } from "@/lib/risk";
import { FilterChip } from "@/components/report-editor/past-year-chips";
import { useStickySet } from "@/components/report-editor/sticky-filter";
import type { Risk, RiskState, RiskStatus } from "@/components/report-editor/types";
import type { RiskHistory } from "@/components/report-editor/report-editor";
import { Hint } from "@/components/ui/hint";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Tag } from "@/components/ui/tag";

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

// Column layout (base + 2 extra columns per selected comparison chip):
//   #(48) | Risk(280) | [chip: L(80)+I(80) each] | Last report L(80)+I(80) |
//   Status(170)+Upd.L(100)+Upd.I(100)+[Level]+Upd.Mit.(230) | Actions(80, only when the report has a new risk)
// "Last report" (always shown, read-only, greyed like the chips): the latest previous
// likelihood / impact of a carried-over risk, computed by GET /api/risk; "—" for new risks.
// New risks (source_risk_id NULL): editable with pencil+trash; no status ("—").
// Old risks (source_risk_id NOT NULL): no actions; the Status column ("Since the last
// report, this risk…") drives what the current-year cells show:
//   not answered / unchanged → likelihood, impact, level and mitigation cells are EMPTY
//                              (an 'unchanged' answer is copied into updated_* by the
//                              server for print / history, but not shown here)
//   changed   → likelihood, impact and mitigation editable, all required
//   happened  → likelihood empty; impact + mitigation editable and required

export interface RiskSectionProps {
  risks: Risk[];
  riskStates: Record<number, RiskState>;
  reportYear: number;
  riskHistory: RiskHistory | null;
  isAdmin: boolean;
  onShareYear: (year: number, shared: boolean) => Promise<void>;

  newRiskName: string;
  setNewRiskName: (v: string) => void;
  newRiskDescription: string;
  setNewRiskDescription: (v: string) => void;
  newRiskCategory: string[];
  setNewRiskCategory: (v: string[]) => void;
  addingRisk: boolean;
  handleRiskAdd: (assessment?: { updated_likelihood: number | null; updated_impact: number | null }) => Promise<boolean>;

  updateRisk: (id: number, patch: Partial<RiskState>) => void;
  handleRiskDelete: (id: number) => Promise<void>;
}

const HIST_COL_W = 80;     // width of each comparison sub-column (px)
const BASE_MIN_W = 1168;   // min-width with no comparison chips active (incl. the 160px "Last report" group and the 170px status column)

// Read-only badges for comparison columns. The wrapping cell already has
// opacity-60, so the colours show as suitably muted without further changes.
function HistLikelihood({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground/40">—</span>;
  return <Badge colors={SCALE_COLORS[v] ?? FALLBACK_COLORS}>{likelihoodLabel(v)}</Badge>;
}

function HistImpact({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-muted-foreground/40">—</span>;
  return <Badge colors={SCALE_COLORS[v] ?? FALLBACK_COLORS}>{impactLabel(v)}</Badge>;
}

// Sharing toggle — span role="button" so it works regardless of fieldset[disabled].
function ShareToggle({
  year,
  shared,
  onToggle,
}: {
  year: number;
  shared: boolean;
  onToggle: (year: number, shared: boolean) => void;
}) {
  return (
    <Hint label={shared ? "Shown to partner — click to hide" : "Hidden from partner — click to show"}>
      <span
        role="button"
        tabIndex={0}
        onClick={() => onToggle(year, !shared)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(year, !shared); }
        }}
        className={cn(
          "inline-flex items-center justify-center size-5 rounded cursor-pointer transition-colors",
          "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          shared ? "text-crafd-grey-900 hover:text-black" : "text-muted-foreground/40 hover:text-muted-foreground"
        )}
      >
        {shared ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
      </span>
    </Hint>
  );
}

// Small "Added in YYYY" badge shown under a risk name for non-ProDoc risks.
function AddedBadge({ year }: { year: number }) {
  return (
    <Tag variant="highlight" className="mt-1.5">
      Added in {year}
    </Tag>
  );
}

export function RiskSection({
  risks,
  riskStates,
  reportYear,
  riskHistory,
  isAdmin,
  onShareYear,
  newRiskName,
  setNewRiskName,
  newRiskDescription,
  setNewRiskDescription,
  newRiskCategory,
  setNewRiskCategory,
  addingRisk,
  handleRiskAdd,
  updateRisk,
  handleRiskDelete,
}: RiskSectionProps) {
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftCategory, setDraftCategory] = useState<string[]>([]);

  // The draft row for a new risk: opened by "Add risk", nothing is created until
  // Save. Its field values live in the parent (newRisk*), as the old form's did.
  const [showAddRow, setShowAddRow] = useState(false);
  const [addTried, setAddTried] = useState(false);
  const [newLikelihood, setNewLikelihood] = useState<number | null>(null);
  const [newImpact, setNewImpact] = useState<number | null>(null);
  const draftRowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (showAddRow) draftRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [showAddRow]);

  async function saveNewRisk() {
    if (!newRiskName.trim() || !newRiskDescription.trim() || newLikelihood == null || newImpact == null) {
      setAddTried(true);
      return;
    }
    if (await handleRiskAdd({ updated_likelihood: newLikelihood, updated_impact: newImpact })) {
      setShowAddRow(false);
      setAddTried(false);
      setNewLikelihood(null);
      setNewImpact(null);
    }
  }

  function cancelNewRisk() {
    setShowAddRow(false);
    setAddTried(false);
    setNewLikelihood(null);
    setNewImpact(null);
    setNewRiskName("");
    setNewRiskDescription("");
    setNewRiskCategory([]);
  }

  const [shownChips, updateShownChips] = useStickySet<string>("risk-history-chips");

  function toggleChip(key: string) {
    updateShownChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const historyYears = riskHistory?.years ?? [];
  // Past-year chips only (the ProDoc "Baseline" chip is gone: the "Last report" group
  // already shows the ProDoc values when there is no earlier report). No years → no row.
  const showChipsRow = historyYears.length > 0;

  // Ordered selected chip keys: years ascending.
  const selectedChipKeys: string[] = [];
  for (const { year } of historyYears) {
    if (shownChips.has(String(year))) selectedChipKeys.push(String(year));
  }

  // The Actions column only exists when there is something to act on: a
  // risk added in this report (carried-over risks can't be edited or deleted).
  const hasNewRisk = risks.some((r) => r.source_risk_id === null);
  const minWidth = BASE_MIN_W - (hasNewRisk ? 0 : 80) + selectedChipKeys.length * HIST_COL_W * 2;

  function getHistValue(chipKey: string, originRiskId: number | null) {
    if (originRiskId === null) return { likelihood: null, impact: null };
    const yearEntry = riskHistory?.years.find((y) => y.year === Number(chipKey));
    return yearEntry?.values[originRiskId] ?? { likelihood: null, impact: null };
  }

  // "Since the last report, this risk…": picking a response resets the current-year
  // assessment. 'changed' / 'happened' start from empty likelihood, impact and
  // mitigation ('happened' keeps likelihood null); on save 'unchanged' makes the server
  // copy the previous values into updated_* (its cells stay empty here).
  function setRiskStatus(riskId: number, next: RiskStatus) {
    updateRisk(riskId, {
      risk_status: next,
      updated_likelihood: null,
      updated_impact: null,
      updated_mitigation: "",
    });
  }

  function startEdit(risk: Risk, state: RiskState) {
    setEditingRiskId(risk.id);
    setDraftName(state.risk_name);
    setDraftDescription(state.risk_description);
    setDraftCategory(state.risk_category);
  }

  function handleSaveEdit(id: number) {
    if (!draftName.trim()) return;
    updateRisk(id, { risk_name: draftName.trim(), risk_description: draftDescription, risk_category: draftCategory });
    setEditingRiskId(null);
  }

  // Shared sub-header cell classes for comparison columns (read-only, greyed).
  const histSubHead = cn("px-2 py-1.5 text-left border-b", SUBHEAD_BG, HEAD_COLOR, SUBHEAD_TEXT);
  // Current-year sub-header cell classes.
  const curSubHead = cn("px-2 py-1.5 text-left border-b", SUBHEAD_TEXT, HEAD_COLOR, CURRENT_YEAR_HEAD);

  return (
    <div className="space-y-4">
      {/* Comparison chips — only when there is history to show */}
      {showChipsRow && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{labels.common.formerReports}</span>
          {historyYears.map(({ year, shared }) => (
            <span key={year} className="inline-flex items-center gap-1">
              <FilterChip on={shownChips.has(String(year))} onClick={() => toggleChip(String(year))}>
                {year}
              </FilterChip>
              {isAdmin && (
                <ShareToggle year={year} shared={shared} onToggle={onShareYear} />
              )}
            </span>
          ))}
        </div>
      )}

      {risks.length === 0 && !showAddRow ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {labels.partnerEditor.emptyRisks}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="text-sm border-separate border-spacing-0" style={{ minWidth: `${minWidth}px`, width: "100%" }}>
            <thead>
              {/* Row 1: group labels */}
              <tr className={HEAD_TEXT}>
                <th rowSpan={2} className={cn("text-left px-3 py-2 border-b align-bottom", HEAD_COLOR, HEAD_BG)} style={{ width: 48, minWidth: 48 }}>
                  {labels.risk.columns.number}
                </th>
                <th rowSpan={2} className={cn("text-left px-3 py-2 border-b align-bottom", HEAD_COLOR, HEAD_BG)} style={{ width: 280, minWidth: 280 }}>
                  {labels.risk.columns.risk}
                </th>

                {/* One group header per selected comparison chip */}
                {selectedChipKeys.map((key) => (
                  <th
                    key={key}
                    colSpan={2}
                    className={cn("px-2 py-2 text-center border-l border-b", HEAD_COLOR, HEAD_BG)}
                    style={{ width: HIST_COL_W * 2, minWidth: HIST_COL_W * 2 }}
                  >
                    {key}
                  </th>
                ))}

                {/* Last report: latest previous likelihood + impact (read-only) */}
                <th
                  colSpan={2}
                  className={cn("px-2 py-2 text-center border-l border-b", HEAD_COLOR, HEAD_BG)}
                  style={{ width: HIST_COL_W * 2, minWidth: HIST_COL_W * 2 }}
                >
                  {labels.risk.lastReport}
                </th>

                {/* Current-year group: Status + Likelihood + Impact + [Risk Level (admin)] + Mitigation */}
                <th colSpan={isAdmin ? 5 : 4} className={cn("px-2 py-2 text-center border-l border-b", HEAD_COLOR, CURRENT_YEAR_HEAD)}>
                  {reportYear}
                </th>

                {hasNewRisk && <th rowSpan={2} className={cn("border-b", HEAD_BG)} style={{ width: 80, minWidth: 80 }} />}
              </tr>

              {/* Row 2: sub-column labels */}
              <tr>
                {selectedChipKeys.map((key) => [
                  <th key={`${key}-l`} className={cn(histSubHead, "border-l")} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Likelihood</th>,
                  <th key={`${key}-i`} className={histSubHead} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Impact</th>,
                ])}
                <th className={cn(histSubHead, "border-l")} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Likelihood</th>
                <th className={histSubHead} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Impact</th>
                <th className={cn(curSubHead, "border-l")} style={{ width: 170, minWidth: 170 }}>{labels.risk.columns.status}<RequiredMark className="text-crafd-yellow-900" /></th>
                <th className={curSubHead} style={{ width: 100, minWidth: 100 }}>Likelihood<RequiredMark className="text-crafd-yellow-900" /></th>
                <th className={curSubHead} style={{ width: 100, minWidth: 100 }}>Impact<RequiredMark className="text-crafd-yellow-900" /></th>
                {isAdmin && <th className={curSubHead} style={{ width: 100, minWidth: 100 }}>{labels.risk.columns.riskLevel}</th>}
                <th className={curSubHead} style={{ width: 230, minWidth: 230 }}>Mitigation</th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {risks.map((risk, i) => {
                const state = riskStates[risk.id];
                if (!state) return null;
                const isNew = risk.source_risk_id === null;
                const isEditing = editingRiskId === risk.id;
                // Badge year: current report for newly-added risks, origin_year for
                // risks carried from a prior report year, null for ProDoc risks.
                const addedYear = isNew ? reportYear : risk.origin_year;
                // Carried-over risks: the current-year cells follow the status (see the
                // column-layout comment). New risks are always fully editable.
                const rs = isNew ? null : state.risk_status;
                const answeredChanged = !isNew && rs === "changed";
                const answeredHappened = !isNew && rs === "happened";
                const editLikelihood = isNew || answeredChanged;
                const editImpact = isNew || answeredChanged || answeredHappened;
                const editMitigation = isNew || answeredChanged || answeredHappened;
                const levelReady = state.updated_likelihood != null && state.updated_impact != null;

                return (
                  <tr key={risk.id} className={cn("align-top transition-colors", state.dirty && "bg-crafd-yellow-100")}>
                    {/* # */}
                    <td className="px-3 py-3 border-t">
                      <span className="text-sm tabular-nums text-crafd-grey-600">{i + 1}.</span>
                    </td>

                    {/* Risk name + description + categories + added-year badge */}
                    <td className="px-3 py-3 border-t border-l align-middle">
                      {isNew && isEditing ? (
                        <div className="space-y-1.5">
                          <Input
                            value={draftName}
                            onChange={(e) => setDraftName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") setEditingRiskId(null); }}
                            className="text-sm h-8"
                            autoFocus
                            placeholder={labels.placeholders.riskName}
                          />
                          <Textarea
                            value={draftDescription}
                            onChange={(e) => setDraftDescription(e.target.value)}
                            className="text-sm min-h-[60px] resize-y"
                            placeholder={labels.placeholders.riskDescription}
                          />
                          <MultiSelect
                            optionKey="riskCategory"
                            value={draftCategory}
                            onChange={setDraftCategory}
                            placeholder={labels.placeholders.riskCategories}
                          />
                          <div className="flex items-center gap-1.5 pt-0.5">
                            <AddedBadge year={reportYear} />
                            <Button size="sm" className="h-6 px-2 text-xs" onClick={() => handleSaveEdit(risk.id)} disabled={!draftName.trim()}>Save</Button>
                            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => setEditingRiskId(null)}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-sm">{isNew ? state.risk_name : risk.risk_name}</p>
                            {(isNew ? state.risk_description : risk.risk_description) && (
                              <p className="text-xs text-muted-foreground mt-0.5">{isNew ? state.risk_description : risk.risk_description}</p>
                            )}
                            {(() => {
                              const cats = isNew ? state.risk_category : (risk.risk_category ?? []);
                              return cats.length > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {cats.map((cat) => (
                                    <Tag key={cat}>{cat}</Tag>
                                  ))}
                                </div>
                              ) : null;
                            })()}
                            {addedYear !== null && <AddedBadge year={addedYear} />}
                          </div>
                          <ItemComments section="risk" itemId={risk.id} />
                        </div>
                      )}
                    </td>

                    {/* Comparison columns — greyed, read-only; opacity-60 on the cell mutes the badges */}
                    {selectedChipKeys.map((key) => {
                      const { likelihood, impact } = getHistValue(key, risk.origin_risk_id);
                      return [
                        <td key={`${key}-l`} className="px-3 py-3 border-t border-l bg-neutral-50 opacity-60">
                          <HistLikelihood v={likelihood} />
                        </td>,
                        <td key={`${key}-i`} className="px-3 py-3 border-t bg-neutral-50 opacity-60">
                          <HistImpact v={impact} />
                        </td>,
                      ];
                    })}

                    {/* Last report: latest previous likelihood / impact — greyed, read-only; "—" for new risks */}
                    <td className="px-3 py-3 border-t border-l bg-neutral-50 opacity-60">
                      <HistLikelihood v={isNew ? null : risk.previous_likelihood} />
                    </td>
                    <td className="px-3 py-3 border-t bg-neutral-50 opacity-60">
                      <HistImpact v={isNew ? null : risk.previous_impact} />
                    </td>

                    {/* Since the last report, this risk… (carried-over risks only) */}
                    <td className="px-3 py-3 border-t border-l">
                      {isNew ? (
                        <span className="text-muted-foreground text-sm">—</span>
                      ) : (
                        <Select value={state.risk_status ?? ""} onValueChange={(v) => setRiskStatus(risk.id, v as RiskStatus)}>
                          <SelectTrigger className="w-full h-8 px-2 gap-1.5">
                            {state.risk_status
                              ? <span className="text-sm truncate">{labels.risk.status[state.risk_status]}</span>
                              : <span className="text-muted-foreground text-sm px-1">{labels.risk.statusPlaceholder}</span>}
                          </SelectTrigger>
                          <SelectContent>
                            {(["unchanged", "changed", "happened"] as const).map((k) => (
                              <SelectItem key={k} value={k}>{labels.risk.status[k]}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </td>

                    {/* Updated likelihood (empty unless editable) */}
                    <td className="px-3 py-3 border-t">
                      {editLikelihood && (
                        <ScaleSelect
                          kind="likelihood"
                          value={state.updated_likelihood}
                          onValueChange={(v) => updateRisk(risk.id, { updated_likelihood: v })}
                        />
                      )}
                    </td>

                    {/* Updated impact (empty unless editable) */}
                    <td className="px-3 py-3 border-t">
                      {editImpact && (
                        <ScaleSelect
                          kind="impact"
                          value={state.updated_impact}
                          onValueChange={(v) => updateRisk(risk.id, { updated_impact: v })}
                        />
                      )}
                    </td>

                    {/* Risk level (admin only): new risks as before; carried-over only once both are set */}
                    {isAdmin && (
                      <td className="px-3 py-3 border-t">
                        {isNew
                          ? <RiskLevelBadge likelihood={state.updated_likelihood} impact={state.updated_impact} />
                          : (editImpact && levelReady && (
                              <RiskLevelBadge likelihood={state.updated_likelihood} impact={state.updated_impact} />
                            ))}
                      </td>
                    )}

                    {/* Updated mitigation (empty unless editable) */}
                    <td className="px-3 py-3 border-t">
                      {editMitigation && (
                        <Textarea
                          value={state.updated_mitigation}
                          onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                          placeholder={answeredHappened ? labels.risk.happenedMitigationPlaceholder : answeredChanged ? labels.risk.changedMitigationPlaceholder : labels.risk.newMitigationPlaceholder}
                          className="text-sm min-h-[80px] resize-y w-full"
                        />
                      )}
                    </td>

                    {/* Actions — pencil + trash for new risks only */}
                    {hasNewRisk && (
                      <td className="px-3 py-3 border-t border-l">
                        {isNew && !isEditing && (
                          <div className="flex items-center gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(risk, state)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              onClick={() => handleRiskDelete(risk.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}

              {/* Draft row for a new risk — nothing is created until Save. */}
              {showAddRow && (
                <tr ref={draftRowRef} className="align-top bg-muted/10">
                  <td className="px-3 py-3 border-t">
                    <span className="text-sm tabular-nums text-crafd-grey-600">{risks.length + 1}.</span>
                  </td>
                  {/* One full-width form cell spanning every column after the row number
                      (risk + comparison chips shown + last report + status +
                      updated-assessment + actions), so it always reaches the right edge. */}
                  <td colSpan={1 + selectedChipKeys.length * 2 + 2 + (isAdmin ? 5 : 4) + (hasNewRisk ? 1 : 0)} className="px-3 py-3 border-t border-l">
                    {/* w-0 + min-w-full: fills the cell exactly but adds nothing to the
                        table's column sizing, so the form can never push past the table. */}
                    <div className="w-0 min-w-full space-y-2">
                      <Input
                        value={newRiskName}
                        onChange={(e) => setNewRiskName(e.target.value)}
                        placeholder={labels.placeholders.riskName}
                        className={cn("text-sm h-8", addTried && !newRiskName.trim() && "border-destructive focus-visible:ring-destructive")}
                        autoFocus
                      />
                      <Textarea
                        value={newRiskDescription}
                        onChange={(e) => setNewRiskDescription(e.target.value)}
                        placeholder={labels.placeholders.riskDescription}
                        className={cn("text-sm min-h-[60px] resize-y", addTried && !newRiskDescription.trim() && "border-destructive focus-visible:ring-destructive")}
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="w-64 max-w-full">
                            <MultiSelect optionKey="riskCategory" value={newRiskCategory} onChange={setNewRiskCategory} placeholder={labels.placeholders.riskCategories} />
                          </div>
                          <div className={cn(addTried && newLikelihood == null && "rounded-md ring-1 ring-destructive")}>
                            <ScaleSelect kind="likelihood" value={newLikelihood} onValueChange={setNewLikelihood} placeholder="Likelihood" />
                          </div>
                          <div className={cn(addTried && newImpact == null && "rounded-md ring-1 ring-destructive")}>
                            <ScaleSelect kind="impact" value={newImpact} onValueChange={setNewImpact} placeholder="Impact" />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button size="sm" variant="outline" onClick={saveNewRisk} disabled={addingRisk}>
                            {addingRisk ? <Loader2 className="size-4 animate-spin" /> : labels.adminEditor.save}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelNewRisk} disabled={addingRisk}>{labels.common.cancel}</Button>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Below the table, right-aligned, like the project document's Risk tab. Hidden
          while the draft row is open (one draft at a time). */}
      {!showAddRow && (
        <div className="flex justify-end">
          <Button type="button" variant="add" size="sm" onClick={() => setShowAddRow(true)} className="gap-1">
            <Plus className="size-4" />Add risk
          </Button>
        </div>
      )}
    </div>
  );
}
