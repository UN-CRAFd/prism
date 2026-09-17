"use client";

import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { cn } from "@/lib/utils";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { ItemComments } from "@/components/report-editor/comments-context";
import { ClampedText } from "@/components/report-editor/clamped-text";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { riskLevelLabel, computeRiskLevelKey, RISK_LEVEL_COLORS, SCALE_COLORS, FALLBACK_COLORS, likelihoodLabel, impactLabel } from "@/lib/risk";
import type { Risk, RiskState } from "@/components/report-editor/types";

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

function ApprovedValueBadge({ value, label }: { value: number | null; label: (v: number) => string }) {
  if (value == null) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={SCALE_COLORS[value] ?? FALLBACK_COLORS}>{label(value)}</Badge>;
}

export interface RiskSectionProps {
  risks: Risk[];
  riskStates: Record<number, RiskState>;

  // Add-a-risk form
  newRiskName: string;
  setNewRiskName: (v: string) => void;
  newRiskCategory: string[];
  setNewRiskCategory: (v: string[]) => void;
  newRiskApprovedMitigation: string;
  setNewRiskApprovedMitigation: (v: string) => void;
  addingRisk: boolean;
  handleRiskAdd: () => void;

  // Inline edit of core (admin-owned) fields
  editingRiskId: number | null;
  editingRiskName: string;
  setEditingRiskName: (v: string) => void;
  editingRiskCategory: string[];
  setEditingRiskCategory: (v: string[]) => void;
  editingRiskApprovedMitigation: string;
  setEditingRiskApprovedMitigation: (v: string) => void;
  startRiskEdit: (risk: Risk) => void;
  cancelRiskEdit: () => void;
  handleRiskEditSave: (id: number) => void;

  deletingRiskId: number | null;
  handleRiskDelete: (id: number) => void;

  updateRisk: (id: number, patch: Partial<RiskState>) => void;
}

// Column layout (12 columns, ~2000px total):
//   1:#(60) | 2:Risk(380) | 3:Appr.L(115) | 4:Appr.I(115) | 5:Appr.RL(115)
//   6:Upd.L(115) | 7:Upd.I(115) | 8:Upd.RL(115)
//   9:Appr.Mit.(310) | 10:Upd.Mit.(310) | 11:Revision(120) | 12:Actions(100)
// Edit row: col 1 = #, cols 2–10 colSpan=9 (form), cols 11–12 colSpan=2 (buttons).

export function RiskSection({
  risks,
  riskStates,
  newRiskName,
  setNewRiskName,
  newRiskCategory,
  setNewRiskCategory,
  newRiskApprovedMitigation,
  setNewRiskApprovedMitigation,
  addingRisk,
  handleRiskAdd,
  editingRiskId,
  editingRiskName,
  setEditingRiskName,
  editingRiskCategory,
  setEditingRiskCategory,
  editingRiskApprovedMitigation,
  setEditingRiskApprovedMitigation,
  startRiskEdit,
  cancelRiskEdit,
  handleRiskEditSave,
  deletingRiskId,
  handleRiskDelete,
  updateRisk,
}: RiskSectionProps) {
  return (
    <div className="space-y-4">
      {/* Add a new risk (report-scoped, same as the admin editor) */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1 min-w-[200px]" />
        <div className="flex-1 min-w-[160px]">
          <MultiSelect optionKey="riskCategory" value={newRiskCategory} onChange={setNewRiskCategory} placeholder={labels.placeholders.riskCategories} />
        </div>
        <Input placeholder={labels.placeholders.approvedMitigation} value={newRiskApprovedMitigation} onChange={(e) => setNewRiskApprovedMitigation(e.target.value)} className="flex-1 min-w-[200px]" />
        <Button onClick={handleRiskAdd} disabled={addingRisk || !newRiskName.trim()} size="sm" className="shrink-0">
          {addingRisk ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.adminEditor.add}</>}
        </Button>
      </div>

      {risks.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {labels.partnerEditor.emptyRisks}
        </div>
      ) : (
      <div className="overflow-x-auto rounded-xl border">
        <table className="text-sm" style={{ minWidth: "2000px", width: "100%" }}>
          <thead>
            <tr className={cn("border-b bg-muted/30", HEAD_TEXT)}>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "60px", minWidth: "60px" }}>{labels.risk.columns.number}</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "380px", minWidth: "380px" }}>{labels.risk.columns.risk}</th>
              {/* Approved group */}
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Approved likelihood</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Approved impact</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Approved risk level</th>
              {/* Updated group */}
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Updated likelihood</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Updated impact</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "115px", minWidth: "115px" }}>Updated risk level</th>
              {/* Mitigation columns */}
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "310px", minWidth: "310px" }}>{labels.risk.columns.approvedMitigation}</th>
              <th className="text-left px-4 py-3 text-muted-foreground" style={{ width: "310px", minWidth: "310px" }}>{labels.risk.columns.updatedMitigation}</th>
              <th className="text-center px-4 py-3 text-muted-foreground" style={{ width: "120px", minWidth: "120px" }}>
                <span className="inline-flex items-center justify-center gap-1">
                  {labels.risk.columns.revision}
                  <InfoPopover
                    description={labels.risk.remarks.revision}
                    triggerTitle="About project revisions"
                    descriptionHeading="What this means"
                  />
                </span>
              </th>
              <th className="text-right px-4 py-3 text-muted-foreground" style={{ width: "100px", minWidth: "100px" }}>{labels.risk.columns.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {risks.map((risk, i) => {
              const state = riskStates[risk.id];
              if (!state) return null;
              if (editingRiskId === risk.id) {
                return (
                  <tr key={risk.id} className="bg-amber-50/40">
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    {/* Edit form spans cols 2–10: Risk, 6 assessment cols, both mitigation cols (9 cols) */}
                    <td colSpan={9} className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                        <MultiSelect optionKey="riskCategory" value={editingRiskCategory} onChange={setEditingRiskCategory} placeholder={labels.placeholders.riskCategories} />
                        <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                      </div>
                    </td>
                    {/* Cols 11–12: Revision + Actions */}
                    <td colSpan={2} className="px-4 py-3 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleRiskEditSave(risk.id)}>{labels.adminEditor.save}</Button>
                        <Button size="sm" variant="outline" onClick={cancelRiskEdit}>{labels.common.cancel}</Button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={risk.id} className={cn("transition-colors", state.dirty && "bg-amber-50/40")}>
                  {/* Col 1: # */}
                  <td className="px-4 py-3 align-top">
                    <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
                  </td>

                  {/* Col 2: Risk name + categories */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{risk.risk_name}</p>
                        {risk.risk_category && risk.risk_category.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {risk.risk_category.map((cat) => (
                              <span key={cat} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ItemComments section="risk" itemId={risk.id} />
                    </div>
                  </td>

                  {/* Col 3: Approved likelihood — read-only; sourced from the ProDoc */}
                  <td className="px-4 py-3 align-top">
                    <ApprovedValueBadge value={risk.likelihood} label={likelihoodLabel} />
                  </td>

                  {/* Col 4: Approved impact — read-only; sourced from the ProDoc */}
                  <td className="px-4 py-3 align-top">
                    <ApprovedValueBadge value={risk.impact} label={impactLabel} />
                  </td>

                  {/* Col 5: Approved risk level — computed from approved pair only */}
                  <td className="px-4 py-3 align-top">
                    <RiskLevelBadge likelihood={risk.likelihood} impact={risk.impact} />
                  </td>

                  {/* Col 6: Updated likelihood — partner-editable */}
                  <td className="px-4 py-3 align-top">
                    <ScaleSelect
                      kind="likelihood"
                      value={state.updated_likelihood}
                      onValueChange={(v) => updateRisk(risk.id, { updated_likelihood: v })}
                    />
                  </td>

                  {/* Col 7: Updated impact — partner-editable */}
                  <td className="px-4 py-3 align-top">
                    <ScaleSelect
                      kind="impact"
                      value={state.updated_impact}
                      onValueChange={(v) => updateRisk(risk.id, { updated_impact: v })}
                    />
                  </td>

                  {/* Col 8: Updated risk level — computed from updated pair only */}
                  <td className="px-4 py-3 align-top">
                    <RiskLevelBadge likelihood={state.updated_likelihood} impact={state.updated_impact} />
                  </td>

                  {/* Col 9: Approved mitigation */}
                  <td className="px-4 py-3 align-top">
                    {risk.approved_mitigation ? (
                      <ClampedText text={risk.approved_mitigation} className="text-sm text-muted-foreground leading-relaxed" />
                    ) : (
                      <span className="text-sm text-muted-foreground/40">—</span>
                    )}
                  </td>

                  {/* Col 10: Updated mitigation */}
                  <td className="px-4 py-3 align-top">
                    <Textarea
                      value={state.updated_mitigation}
                      onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                      placeholder={labels.placeholders.updatedMitigation}
                      className="text-sm min-h-[80px] resize-y w-full"
                    />
                  </td>

                  {/* Col 11: Revision */}
                  <td className="px-4 py-3 align-top text-center">
                    <input
                      type="checkbox"
                      checked={state.project_revision}
                      onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                      className="size-4 rounded mt-1"
                    />
                  </td>

                  {/* Col 12: Actions */}
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => startRiskEdit(risk)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit risk"><Pencil className="size-3.5" /></button>
                      <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete risk">
                        {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </div>
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
