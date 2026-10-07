"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { cn } from "@/lib/utils";
import { HEAD_TEXT, SUBHEAD_TEXT, CURRENT_YEAR_HEAD } from "@/components/report-editor/matrix-table";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { ItemComments } from "@/components/report-editor/comments-context";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { SCALE_COLORS, FALLBACK_COLORS, likelihoodLabel, impactLabel } from "@/lib/risk";
import { FilterChip } from "@/components/report-editor/past-year-chips";
import { useStickySet } from "@/components/report-editor/sticky-filter";
import type { Risk, RiskState } from "@/components/report-editor/types";
import type { RiskHistory } from "@/components/report-editor/report-editor";

// Column layout (base + 2 extra columns per selected comparison chip):
//   #(48) | Risk(280) | [chip: L(80)+I(80) each] | Upd.L(100)+Upd.I(100)+Upd.Mit.(230) | Revision(90) | Actions(80)
// New risks (source_risk_id NULL): editable with pencil+trash.
// Old risks (source_risk_id NOT NULL): read-only, no actions.

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
  handleRiskAdd: () => void;

  updateRisk: (id: number, patch: Partial<RiskState>) => void;
  handleRiskDelete: (id: number) => Promise<void>;
}

const HIST_COL_W = 80;     // width of each comparison sub-column (px)
const BASE_MIN_W = 928;    // min-width with no comparison chips active

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
    <span
      role="button"
      tabIndex={0}
      title={shared ? "Shown to partner — click to hide" : "Hidden from partner — click to show"}
      onClick={() => onToggle(year, !shared)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(year, !shared); }
      }}
      className={cn(
        "inline-flex items-center justify-center size-5 rounded cursor-pointer transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        shared ? "text-blue-600 hover:text-blue-800" : "text-muted-foreground/40 hover:text-muted-foreground"
      )}
    >
      {shared ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
    </span>
  );
}

// Small "Added in YYYY" badge shown under a risk name for non-ProDoc risks.
function AddedBadge({ year }: { year: number }) {
  return (
    <span className="mt-1.5 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
      Added in {year}
    </span>
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

  const [shownChips, updateShownChips] = useStickySet<string>("risk-history-chips");

  function toggleChip(key: string) {
    updateShownChips((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasProdoc = riskHistory !== null && Object.keys(riskHistory.prodoc).length > 0;
  const historyYears = riskHistory?.years ?? [];
  const showChipsRow = hasProdoc || historyYears.length > 0;

  // Ordered selected chip keys: "prodoc" first, then years ascending.
  const selectedChipKeys: string[] = [];
  if (hasProdoc && shownChips.has("prodoc")) selectedChipKeys.push("prodoc");
  for (const { year } of historyYears) {
    if (shownChips.has(String(year))) selectedChipKeys.push(String(year));
  }

  const minWidth = BASE_MIN_W + selectedChipKeys.length * HIST_COL_W * 2;

  function getHistValue(chipKey: string, originRiskId: number | null) {
    if (originRiskId === null) return { likelihood: null, impact: null };
    if (chipKey === "prodoc") {
      return riskHistory?.prodoc[originRiskId] ?? { likelihood: null, impact: null };
    }
    const yearEntry = riskHistory?.years.find((y) => y.year === Number(chipKey));
    return yearEntry?.values[originRiskId] ?? { likelihood: null, impact: null };
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
  const histSubHead = cn("px-2 py-1.5 text-left border-b bg-neutral-50", SUBHEAD_TEXT);
  // Current-year sub-header cell classes.
  const curSubHead = cn("px-2 py-1.5 text-left border-b", SUBHEAD_TEXT, CURRENT_YEAR_HEAD);

  return (
    <div className="space-y-4">
      {/* Add-a-risk form */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} className="flex-1 min-w-[200px]" />
        <Input placeholder={labels.placeholders.riskDescription} value={newRiskDescription} onChange={(e) => setNewRiskDescription(e.target.value)} className="flex-1 min-w-[200px]" />
        <div className="flex-1 min-w-[160px]">
          <MultiSelect optionKey="riskCategory" value={newRiskCategory} onChange={setNewRiskCategory} placeholder={labels.placeholders.riskCategories} />
        </div>
        <Button onClick={handleRiskAdd} disabled={addingRisk || !newRiskName.trim()} size="sm" className="shrink-0">
          {addingRisk ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
        </Button>
      </div>

      {/* Comparison chips — only when there is history to show */}
      {showChipsRow && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">{labels.common.formerReports}</span>
          {hasProdoc && (
            <FilterChip on={shownChips.has("prodoc")} onClick={() => toggleChip("prodoc")}>
              Baseline
            </FilterChip>
          )}
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

      {risks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {labels.partnerEditor.emptyRisks}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="text-sm border-separate border-spacing-0" style={{ minWidth: `${minWidth}px`, width: "100%" }}>
            <thead>
              {/* Row 1: group labels */}
              <tr className={HEAD_TEXT}>
                <th rowSpan={2} className="text-left px-3 py-2 text-muted-foreground border-b bg-neutral-100 align-bottom" style={{ width: 48, minWidth: 48 }}>
                  {labels.risk.columns.number}
                </th>
                <th rowSpan={2} className="text-left px-3 py-2 text-muted-foreground border-b bg-neutral-100 align-bottom" style={{ width: 280, minWidth: 280 }}>
                  {labels.risk.columns.risk}
                </th>

                {/* One group header per selected comparison chip */}
                {selectedChipKeys.map((key) => (
                  <th
                    key={key}
                    colSpan={2}
                    className="px-2 py-2 text-center text-muted-foreground border-l border-b bg-neutral-100"
                    style={{ width: HIST_COL_W * 2, minWidth: HIST_COL_W * 2 }}
                  >
                    {key === "prodoc" ? "Baseline" : key}
                  </th>
                ))}

                {/* Current-year group: Likelihood + Impact + Mitigation */}
                <th colSpan={3} className={cn("px-2 py-2 text-center text-muted-foreground border-l border-b", CURRENT_YEAR_HEAD)}>
                  {reportYear}
                </th>

                <th rowSpan={2} className="px-3 py-2 text-center text-muted-foreground border-l border-b bg-neutral-100 align-bottom" style={{ width: 90, minWidth: 90 }}>
                  <span className="inline-flex items-center justify-center gap-1">
                    {labels.risk.columns.revision}
                    <InfoPopover
                      description={labels.risk.remarks.revision}
                      triggerTitle="About project revisions"
                      descriptionHeading="What this means"
                    />
                  </span>
                </th>
                <th rowSpan={2} className="border-b bg-neutral-100" style={{ width: 80, minWidth: 80 }} />
              </tr>

              {/* Row 2: sub-column labels */}
              <tr>
                {selectedChipKeys.map((key) => [
                  <th key={`${key}-l`} className={cn(histSubHead, "border-l")} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Likelihood</th>,
                  <th key={`${key}-i`} className={histSubHead} style={{ width: HIST_COL_W, minWidth: HIST_COL_W }}>Impact</th>,
                ])}
                <th className={cn(curSubHead, "border-l")} style={{ width: 100, minWidth: 100 }}>Likelihood</th>
                <th className={curSubHead} style={{ width: 100, minWidth: 100 }}>Impact</th>
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

                return (
                  <tr key={risk.id} className={cn("align-top transition-colors", state.dirty && "bg-amber-50/40")}>
                    {/* # */}
                    <td className="px-3 py-3 border-t">
                      <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
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
                                    <span key={cat} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">{cat}</span>
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

                    {/* Updated likelihood */}
                    <td className="px-3 py-3 border-t border-l">
                      <ScaleSelect
                        kind="likelihood"
                        value={state.updated_likelihood}
                        onValueChange={(v) => updateRisk(risk.id, { updated_likelihood: v })}
                      />
                    </td>

                    {/* Updated impact */}
                    <td className="px-3 py-3 border-t">
                      <ScaleSelect
                        kind="impact"
                        value={state.updated_impact}
                        onValueChange={(v) => updateRisk(risk.id, { updated_impact: v })}
                      />
                    </td>

                    {/* Updated mitigation */}
                    <td className="px-3 py-3 border-t">
                      <Textarea
                        value={state.updated_mitigation}
                        onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                        placeholder={labels.placeholders.updatedMitigation}
                        className="text-sm min-h-[80px] resize-y w-full"
                      />
                    </td>

                    {/* Revision */}
                    <td className="px-3 py-3 border-t border-l text-center">
                      <input
                        type="checkbox"
                        checked={state.project_revision}
                        onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                        className="size-4 rounded mt-1"
                      />
                    </td>

                    {/* Actions — pencil + trash for new risks only */}
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
