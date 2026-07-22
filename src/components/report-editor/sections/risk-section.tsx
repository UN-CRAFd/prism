"use client";

import { Loader2, ChevronRight, ChevronDown, Plus, Trash2, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ItemComments } from "@/components/report-editor/comments-context";
import { Badge, ScaleSelect } from "@/components/report-editor/scale-select";
import { riskLevelLabel, computeRiskLevelKey, RISK_LEVEL_COLORS } from "@/lib/risk";
import type { Risk, RiskState } from "@/components/report-editor/types";

function RiskLevelBadge({ likelihood, impact }: { likelihood: number | null; impact: number | null }) {
  const key = computeRiskLevelKey(likelihood, impact);
  if (!key) return <span className="text-muted-foreground text-sm">—</span>;
  return <Badge colors={RISK_LEVEL_COLORS[key]}>{riskLevelLabel(key)}</Badge>;
}

export interface RiskSectionProps {
  risks: Risk[];
  riskStates: Record<number, RiskState>;
  collapsedRows: Record<number, boolean>;

  // Add-a-risk form
  newRiskName: string;
  setNewRiskName: (v: string) => void;
  newRiskCategory: string;
  setNewRiskCategory: (v: string) => void;
  newRiskApprovedMitigation: string;
  setNewRiskApprovedMitigation: (v: string) => void;
  addingRisk: boolean;
  handleRiskAdd: () => void;

  // Inline edit of core (admin-owned) fields
  editingRiskId: number | null;
  editingRiskName: string;
  setEditingRiskName: (v: string) => void;
  editingRiskCategory: string;
  setEditingRiskCategory: (v: string) => void;
  editingRiskApprovedMitigation: string;
  setEditingRiskApprovedMitigation: (v: string) => void;
  startRiskEdit: (risk: Risk) => void;
  cancelRiskEdit: () => void;
  handleRiskEditSave: (id: number) => void;

  deletingRiskId: number | null;
  handleRiskDelete: (id: number) => void;

  updateRisk: (id: number, patch: Partial<RiskState>) => void;
  toggleCollapse: (id: number) => void;
}

export function RiskSection({
  risks,
  riskStates,
  collapsedRows,
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
  toggleCollapse,
}: RiskSectionProps) {
  return (
    <div className="space-y-4">
      {/* Add a new risk (report-scoped, same as the admin editor) */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1 min-w-[200px]" />
        <Input placeholder={labels.placeholders.riskCategories} value={newRiskCategory} onChange={(e) => setNewRiskCategory(e.target.value)} className="flex-1 min-w-[160px]" />
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-12">{labels.risk.columns.number}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{labels.risk.columns.risk}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.risk.columns.likelihood}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-32">{labels.risk.columns.impact}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-28">{labels.risk.columns.riskLevel}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">{labels.risk.columns.approvedMitigation}</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-72">{labels.risk.columns.updatedMitigation}</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.risk.columns.revision}</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-muted-foreground w-24">{labels.risk.columns.actions}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {risks.map((risk, i) => {
              const state = riskStates[risk.id];
              if (!state) return null;
              const collapsed = collapsedRows[risk.id] ?? true;
              if (editingRiskId === risk.id) {
                return (
                  <tr key={risk.id} className="bg-amber-50/40">
                    <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
                    <td colSpan={6} className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        <Input value={editingRiskName} onChange={(e) => setEditingRiskName(e.target.value)} placeholder={labels.placeholders.riskName} className="text-sm" autoFocus />
                        <Input value={editingRiskCategory} onChange={(e) => setEditingRiskCategory(e.target.value)} placeholder={labels.placeholders.riskCategories} className="text-sm" />
                        <Textarea value={editingRiskApprovedMitigation} onChange={(e) => setEditingRiskApprovedMitigation(e.target.value)} placeholder={labels.placeholders.approvedMitigation} className="text-sm min-h-[80px] resize-y" />
                      </div>
                    </td>
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
                  {/* # + toggle */}
                  <td className="px-4 py-3 align-middle">
                    <button
                      onClick={() => toggleCollapse(risk.id)}
                      className="flex items-center gap-0.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {collapsed
                        ? <ChevronRight className="size-3 shrink-0" />
                        : <ChevronDown className="size-3 shrink-0" />}
                      {i + 1}.
                    </button>
                  </td>

                  {/* Risk name + categories */}
                  <td className="px-4 py-3 align-middle">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{risk.risk_name}</p>
                        {risk.risk_category && risk.risk_category.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {risk.risk_category.map((cat, ci) => (
                              <span key={ci} className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">{cat}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ItemComments section="risk" itemId={risk.id} />
                    </div>
                  </td>

                  {collapsed ? (
                    <>
                      <td className="px-4 py-3 align-middle">
                        <ScaleSelect
                          kind="likelihood"
                          value={state.likelihood}
                          onValueChange={(v) => updateRisk(risk.id, { likelihood: v })}
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <ScaleSelect
                          kind="impact"
                          value={state.impact}
                          onValueChange={(v) => updateRisk(risk.id, { impact: v })}
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <RiskLevelBadge likelihood={state.likelihood} impact={state.impact} />
                      </td>
                      <td className="px-4 py-3 align-middle max-w-[288px]">
                        {risk.approved_mitigation
                          ? <p className="text-sm text-muted-foreground truncate">{risk.approved_mitigation}</p>
                          : <span className="text-muted-foreground text-sm">—</span>}
                      </td>
                      <td className="px-4 py-3 align-middle max-w-[288px]">
                        <Textarea
                          value={state.updated_mitigation}
                          onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                          placeholder={labels.placeholders.updatedMitigation}
                          className="text-sm h-8 min-h-0 resize-none overflow-hidden py-1"
                        />
                      </td>
                      <td className="px-4 py-3 align-middle text-center">
                        <input
                          type="checkbox"
                          checked={state.project_revision}
                          onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                          className="size-4 rounded"
                        />
                      </td>
                      <td className="px-4 py-3 align-middle">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startRiskEdit(risk)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit risk"><Pencil className="size-3.5" /></button>
                          <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete risk">
                            {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 align-top">
                        <ScaleSelect
                          kind="likelihood"
                          value={state.likelihood}
                          onValueChange={(v) => updateRisk(risk.id, { likelihood: v })}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <ScaleSelect
                          kind="impact"
                          value={state.impact}
                          onValueChange={(v) => updateRisk(risk.id, { impact: v })}
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <RiskLevelBadge likelihood={state.likelihood} impact={state.impact} />
                      </td>
                      <td className="px-4 py-3 align-top">
                        {risk.approved_mitigation
                          ? <p className="text-sm text-muted-foreground leading-relaxed">{risk.approved_mitigation}</p>
                          : <span className="text-sm text-muted-foreground/40">—</span>}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <Textarea
                          value={state.updated_mitigation}
                          onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                          placeholder={labels.placeholders.updatedMitigation}
                          className="text-sm min-h-[80px] resize-y"
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-center">
                        <input
                          type="checkbox"
                          checked={state.project_revision}
                          onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                          className="size-4 rounded mt-1"
                        />
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => startRiskEdit(risk)} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Edit risk"><Pencil className="size-3.5" /></button>
                          <button onClick={() => handleRiskDelete(risk.id)} disabled={deletingRiskId === risk.id} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label="Delete risk">
                            {deletingRiskId === risk.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                          </button>
                        </div>
                      </td>
                    </>
                  )}
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
