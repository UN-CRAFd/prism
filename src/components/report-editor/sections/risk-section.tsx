"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { InfoPopover } from "@/components/ui/info-popover";
import { cn } from "@/lib/utils";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MultiSelect } from "@/components/ui/multi-select";
import { ItemComments } from "@/components/report-editor/comments-context";
import { ScaleSelect } from "@/components/report-editor/scale-select";
import type { Risk, RiskState } from "@/components/report-editor/types";

// Column layout (7 columns, ~928px total — fits at laptop width without horizontal scroll):
//   1:#(48) | 2:Risk(280) | 3:Upd.L(100) | 4:Upd.I(100)
//   5:Upd.Mit.(230) | 6:Revision(90) | 7:Actions(80)
// New risks (source_risk_id NULL): read-only by default with pencil+trash in actions.
//   Pencil opens inline edit mode for that row only (one at a time).
// Old risks (source_risk_id NOT NULL): read-only, no action buttons.

export interface RiskSectionProps {
  risks: Risk[];
  riskStates: Record<number, RiskState>;
  reportYear: number;

  // Add-a-risk form
  newRiskName: string;
  setNewRiskName: (v: string) => void;
  newRiskCategory: string[];
  setNewRiskCategory: (v: string[]) => void;
  addingRisk: boolean;
  handleRiskAdd: () => void;

  updateRisk: (id: number, patch: Partial<RiskState>) => void;
  handleRiskDelete: (id: number) => Promise<void>;
}

export function RiskSection({
  risks,
  riskStates,
  reportYear,
  newRiskName,
  setNewRiskName,
  newRiskCategory,
  setNewRiskCategory,
  addingRisk,
  handleRiskAdd,
  updateRisk,
  handleRiskDelete,
}: RiskSectionProps) {
  const [editingRiskId, setEditingRiskId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState<string[]>([]);

  function startEdit(risk: Risk, state: RiskState) {
    setEditingRiskId(risk.id);
    setDraftName(state.risk_name);
    setDraftCategory(state.risk_category);
  }

  function handleSaveEdit(id: number) {
    if (!draftName.trim()) return;
    updateRisk(id, { risk_name: draftName.trim(), risk_category: draftCategory });
    setEditingRiskId(null);
  }

  function handleCancelEdit() {
    setEditingRiskId(null);
  }

  return (
    <div className="space-y-4">
      {/* Add a new risk */}
      <div className="flex flex-wrap gap-2">
        <Input placeholder={labels.placeholders.riskName} value={newRiskName} onChange={(e) => setNewRiskName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newRiskName.trim()) handleRiskAdd(); }} className="flex-1 min-w-[200px]" />
        <div className="flex-1 min-w-[160px]">
          <MultiSelect optionKey="riskCategory" value={newRiskCategory} onChange={setNewRiskCategory} placeholder={labels.placeholders.riskCategories} />
        </div>
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
        <table className="text-sm" style={{ minWidth: "928px", width: "100%" }}>
          <thead>
            <tr className={cn("border-b bg-muted/30", HEAD_TEXT)}>
              <th className="text-left px-3 py-3 text-muted-foreground" style={{ width: "48px", minWidth: "48px" }}>{labels.risk.columns.number}</th>
              <th className="text-left px-3 py-3 text-muted-foreground" style={{ width: "280px", minWidth: "280px" }}>{labels.risk.columns.risk}</th>
              <th className="text-left px-3 py-3 text-muted-foreground" style={{ width: "100px", minWidth: "100px" }}>Updated likelihood</th>
              <th className="text-left px-3 py-3 text-muted-foreground" style={{ width: "100px", minWidth: "100px" }}>Updated impact</th>
              <th className="text-left px-3 py-3 text-muted-foreground" style={{ width: "230px", minWidth: "230px" }}>{labels.risk.columns.updatedMitigation}</th>
              <th className="text-center px-3 py-3 text-muted-foreground" style={{ width: "90px", minWidth: "90px" }}>
                <span className="inline-flex items-center justify-center gap-1">
                  {labels.risk.columns.revision}
                  <InfoPopover
                    description={labels.risk.remarks.revision}
                    triggerTitle="About project revisions"
                    descriptionHeading="What this means"
                  />
                </span>
              </th>
              <th className="px-3 py-3" style={{ width: "80px", minWidth: "80px" }} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {risks.map((risk, i) => {
              const state = riskStates[risk.id];
              if (!state) return null;
              const isNew = risk.source_risk_id === null;
              const isEditing = editingRiskId === risk.id;
              return (
                <tr key={risk.id} className={cn("transition-colors", state.dirty && "bg-amber-50/40")}>
                  {/* Col 1: # */}
                  <td className="px-3 py-3 align-top">
                    <span className="text-xs font-mono text-muted-foreground">{i + 1}.</span>
                  </td>

                  {/* Col 2: Risk name + categories */}
                  <td className="px-3 py-3 align-middle">
                    {isNew && isEditing ? (
                      <div className="space-y-1.5">
                        <Input
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && draftName.trim()) handleSaveEdit(risk.id); if (e.key === "Escape") handleCancelEdit(); }}
                          className="text-sm h-8"
                          autoFocus
                        />
                        <MultiSelect
                          optionKey="riskCategory"
                          value={draftCategory}
                          onChange={setDraftCategory}
                          placeholder={labels.placeholders.riskCategories}
                        />
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                            New · {reportYear}
                          </span>
                          <Button size="sm" className="h-6 px-2 text-xs" onClick={() => handleSaveEdit(risk.id)} disabled={!draftName.trim()}>Save</Button>
                          <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={handleCancelEdit}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{isNew ? state.risk_name : risk.risk_name}</p>
                          {(() => {
                            const cats = isNew ? state.risk_category : (risk.risk_category ?? []);
                            return cats.length > 0 ? (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {cats.map((cat) => (
                                  <span key={cat} className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                                    {cat}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          })()}
                          {isNew && (
                            <span className="mt-1.5 inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                              New · {reportYear}
                            </span>
                          )}
                        </div>
                        <ItemComments section="risk" itemId={risk.id} />
                      </div>
                    )}
                  </td>

                  {/* Col 3: Updated likelihood */}
                  <td className="px-3 py-3 align-top">
                    <ScaleSelect
                      kind="likelihood"
                      value={state.updated_likelihood}
                      onValueChange={(v) => updateRisk(risk.id, { updated_likelihood: v })}
                    />
                  </td>

                  {/* Col 4: Updated impact */}
                  <td className="px-3 py-3 align-top">
                    <ScaleSelect
                      kind="impact"
                      value={state.updated_impact}
                      onValueChange={(v) => updateRisk(risk.id, { updated_impact: v })}
                    />
                  </td>

                  {/* Col 5: Updated mitigation */}
                  <td className="px-3 py-3 align-top">
                    <Textarea
                      value={state.updated_mitigation}
                      onChange={(e) => updateRisk(risk.id, { updated_mitigation: e.target.value })}
                      placeholder={labels.placeholders.updatedMitigation}
                      className="text-sm min-h-[80px] resize-y w-full"
                    />
                  </td>

                  {/* Col 6: Revision */}
                  <td className="px-3 py-3 align-top text-center">
                    <input
                      type="checkbox"
                      checked={state.project_revision}
                      onChange={(e) => updateRisk(risk.id, { project_revision: e.target.checked })}
                      className="size-4 rounded mt-1"
                    />
                  </td>

                  {/* Col 7: Actions — pencil + trash for new risks (hidden during edit) */}
                  <td className="px-3 py-3 align-top">
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
