"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComboboxItem } from "@/components/ui/combobox";
import { InfoPopover } from "@/components/ui/info-popover";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import { IndicatorTableSwitch, type IndicatorTableKey } from "@/components/report-editor/indicator-table-switch";
import labels from "@/lib/labels";
import { numericYear } from "@/lib/numeric-input";
import { cycleLabel } from "@/lib/indicators";
import { type ContributorActivity, LinkedActivityPicker } from "@/components/report-editor/contributor-matrix";

export interface ProdocIndicatorLine {
  id: number;
  indicator_id: number;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  linked_activity_id: number | null;
  indicator_name: string;
  indicator_description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
  is_standard: boolean;
}

export interface ProdocIndicatorEdit {
  name: string;
  description: string | null;
  means_of_verification: string | null;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  linked_activity_id: number | null;
}

export function ProdocIndicatorsSection({
  lines,
  indicatorItems,
  onAdd,
  onCreate,
  onEdit,
  onUpdateValues,
  onDelete,
  isAdmin,
  readOnly,
  fillHeight,
  activities,
  activityById,
}: {
  lines: ProdocIndicatorLine[];
  indicatorItems: ComboboxItem[];
  onAdd: (item: ComboboxItem) => Promise<void>;
  onCreate: (name: string, description: string, meansOfVerification: string) => Promise<void>;
  onEdit: (indicatorId: number, lineId: number, patch: ProdocIndicatorEdit) => Promise<void>;
  onUpdateValues: (lineId: number, values: Pick<ProdocIndicatorEdit, "baseline_value" | "baseline_year" | "target_value" | "target_year" | "linked_activity_id">) => Promise<void>;
  onDelete: (lineId: number) => Promise<void>;
  isAdmin: boolean;
  readOnly: boolean;
  fillHeight: boolean;
  activities: ContributorActivity[];
  activityById: Map<number, ContributorActivity>;
}) {
  const [table, setTable] = useState<IndicatorTableKey>("standard");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProdocIndicatorEdit | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMeansOfVerification, setCreateMeansOfVerification] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [valueDrafts, setValueDrafts] = useState<Record<number, Pick<ProdocIndicatorEdit, "baseline_value" | "baseline_year" | "target_value" | "target_year" | "linked_activity_id">>>({});

  function startEdit(line: ProdocIndicatorLine) {
    setEditingId(line.id);
    setDraft({
      name: line.indicator_name,
      description: line.indicator_description,
      means_of_verification: line.means_of_verification,
      baseline_value: line.baseline_value,
      baseline_year: line.baseline_year,
      target_value: line.target_value,
      target_year: line.target_year,
      linked_activity_id: line.linked_activity_id,
    });
  }

  async function save(line: ProdocIndicatorLine) {
    if (!draft?.name.trim()) return;
    setSavingId(line.id);
    try {
      await onEdit(line.indicator_id, line.id, {
        ...draft,
        name: draft.name.trim(),
        description: draft.description?.trim() || null,
        means_of_verification: draft.means_of_verification?.trim() || null,
      });
      setEditingId(null);
      setDraft(null);
    } finally {
      setSavingId(null);
    }
  }

  function updateDraft(patch: Partial<ProdocIndicatorEdit>) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  function valuesFor(line: ProdocIndicatorLine) {
    const saved = {
      baseline_value: line.baseline_value,
      baseline_year: line.baseline_year,
      target_value: line.target_value,
      target_year: line.target_year,
      linked_activity_id: line.linked_activity_id,
    };
    return valueDrafts[line.id] ? { ...saved, ...valueDrafts[line.id] } : saved;
  }

  function updateValues(lineId: number, patch: Partial<ProdocIndicatorEdit>) {
    setValueDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  async function saveValues(line: ProdocIndicatorLine) {
    const values = valuesFor(line);
    setSavingId(line.id);
    try {
      await onUpdateValues(line.id, values);
      setValueDrafts((current) => {
        const next = { ...current };
        delete next[line.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  function openCreate(name: string) {
    setCreateName(name);
    setCreating(true);
  }

  function cancelCreate() {
    setCreating(false);
    setCreateName("");
    setCreateDescription("");
    setCreateMeansOfVerification("");
  }

  async function submitCreate() {
    if (!createName.trim() || !createDescription.trim() || !createMeansOfVerification.trim()) return;
    setCreatingBusy(true);
    try {
      await onCreate(createName.trim(), createDescription.trim(), createMeansOfVerification.trim());
      cancelCreate();
    } finally {
      setCreatingBusy(false);
    }
  }

  // Frozen column header: pin each header cell to the top of the box's scroll
  // area. The table is border-collapse, so the collapsed bottom border vanishes on
  // sticky cells — an inset box-shadow redraws it. The background has to be opaque
  // (not the old bg-muted/30) or scrolled rows show through; bg-neutral-100 matches
  // the frozen heads on the workplan / expenditure / risk tabs.
  const headCell = "sticky top-0 z-10 bg-neutral-100 px-4 py-3 text-left text-muted-foreground " + HEAD_TEXT;
  const headShadow = { boxShadow: "inset 0 -1px 0 var(--border)" };

  function renderTable(tableLines: ProdocIndicatorLine[], type: "standard" | "custom", footer?: React.ReactNode) {
    return (
      // Two nested elements with different jobs. The outer one is an invisible layout
      // slot: `flex-1 min-h-0` claims whatever height the tab has left, which is what
      // caps the table so it scrolls inside itself instead of growing the page.
      // (`min-h-0` is load-bearing — without it flexbox floors the slot at the
      // table's natural height and the page scrolls again.)
      //
      // `footer` rides INSIDE that slot, directly under the card, so it tracks the
      // card's real bottom edge. Left as a sibling of the slot it would be pinned to
      // the bottom of the tab, stranded far below a short table.
      //
      // The card is the visible box. As a `flex-1`-free flex item it keeps its content
      // height (`basis: auto`) and only shrinks when the slot runs out of room, so with
      // a handful of rows the border closes under the last one and the leftover space
      // falls below the footer, while a full table fills the slot and scrolls inside
      // itself. `min-h-0` lets that shrink actually happen. `overflow-auto` covers both
      // axes: the table's 1100px min-width still needs horizontal scroll when narrow.
      <div className={"flex flex-col gap-2 " + (fillHeight ? "flex-1 min-h-0" : "")}>
      <div className={"rounded-xl border bg-card overflow-auto min-h-0 " + (fillHeight ? "" : "max-h-[28rem]")}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr>
              <th className={headCell + " w-8 text-right pr-3"} style={headShadow}>#</th>
              <th className={headCell} style={headShadow}>
                <span className="inline-flex items-center gap-1.5">
                  {type === "standard" ? labels.indicators.columns.standardIndicator : labels.indicators.columns.customIndicator}
                  <InfoPopover description={type === "standard"
                    ? "These are standard indicators used across all CRAF'd-supported projects."
                    : "These are custom indicators specific to this project document."}
                  />
                </span>
              </th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.baselineValue}</th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.baselineYear}</th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.targetValue}</th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.targetYear}</th>
              <th className={headCell + " w-48"} style={headShadow}>Linked activity</th>
              {type === "custom" && <th className={headCell + " w-24 text-right"} style={headShadow} />}
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableLines.length === 0 ? (
              <tr><td colSpan={type === "custom" ? 8 : 7} className="px-4 py-8 text-center text-sm text-muted-foreground">{type === "standard" ? "No standard indicators added yet." : "No custom indicators added yet."}</td></tr>
            ) : tableLines.map((line, idx) => {
              const isEditing = editingId === line.id && draft;
              const values = valuesFor(line);
              return (
                <tr key={line.id} className="align-top transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 w-8 text-right text-xs tabular-nums text-muted-foreground align-top">{idx + 1}.</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <Input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder={labels.placeholders.indicatorName} autoFocus />
                        <Textarea value={draft.description ?? ""} onChange={(e) => updateDraft({ description: e.target.value })} placeholder={labels.placeholders.indicatorDescription} className="min-h-[64px] resize-y" />
                        <Textarea value={draft.means_of_verification ?? ""} onChange={(e) => updateDraft({ means_of_verification: e.target.value })} placeholder={labels.placeholders.meansOfVerification} className="min-h-[64px] resize-y" />
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">
                            {line.indicator_name}
                            <span className="ml-1.5 inline-block align-middle">
                              <InfoPopover description={line.indicator_description} meansOfVerification={line.means_of_verification} />
                            </span>
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {line.category && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{line.category}</span>}
                            {line.cycle && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{cycleLabel(line.cycle)}</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" value={values.baseline_value ?? ""} disabled={readOnly} onChange={(e) => updateValues(line.id, { baseline_value: e.target.value })} onBlur={() => saveValues(line)} placeholder={labels.indicators.columns.baselineValue} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <Input inputMode="numeric" value={values.baseline_year ?? ""} disabled={readOnly} onChange={(e) => { const year = numericYear(e.target.value); updateValues(line.id, { baseline_year: year ? Number(year) : null }); }} onBlur={() => saveValues(line)} placeholder={labels.indicators.columns.baselineYear} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <Input type="number" value={values.target_value ?? ""} disabled={readOnly} onChange={(e) => updateValues(line.id, { target_value: e.target.value })} onBlur={() => saveValues(line)} placeholder={labels.indicators.columns.targetValue} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <Input inputMode="numeric" value={values.target_year ?? ""} disabled={readOnly} onChange={(e) => { const year = numericYear(e.target.value); updateValues(line.id, { target_year: year ? Number(year) : null }); }} onBlur={() => saveValues(line)} placeholder={labels.indicators.columns.targetYear} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <div className={readOnly ? "pointer-events-none opacity-50" : ""}>
                      <LinkedActivityPicker
                        activities={activities}
                        activityById={activityById}
                        multiple={false}
                        selected={line.linked_activity_id != null ? [line.linked_activity_id] : []}
                        emptyLabel="No activity"
                        onChange={async (ids) => {
                          const linked_activity_id = ids[0] ?? null;
                          updateValues(line.id, { linked_activity_id });
                          await onUpdateValues(line.id, { ...valuesFor(line), linked_activity_id });
                        }}
                      />
                    </div>
                  </td>
                  {type === "custom" && (
                    <td className="px-4 py-3">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => save(line)} disabled={savingId === line.id || !draft.name.trim()}>{savingId === line.id ? <Loader2 className="size-3 animate-spin" /> : labels.adminEditor.save}</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(null); }} disabled={savingId === line.id}>{labels.common.cancel}</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-3">
                          <button disabled={readOnly} onClick={() => startEdit(line)} className="text-muted-foreground hover:text-foreground disabled:opacity-40" title="Edit indicator" aria-label={`Edit indicator ${line.indicator_name}`}><Pencil className="size-3.5" /></button>
                          <button disabled={readOnly || deletingId === line.id} onClick={async () => { setDeletingId(line.id); try { await onDelete(line.id); } finally { setDeletingId(null); } }} className="text-muted-foreground hover:text-destructive disabled:opacity-40" title="Remove indicator" aria-label={`Remove indicator ${line.indicator_name}`}>{deletingId === line.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {footer}
      </div>
    );
  }

  const standardLines = lines.filter((line) => line.is_standard);
  const customLines = lines.filter((line) => !line.is_standard);

  // Adding only ever creates a customised project indicator, so this rides with
  // that table only — tucked under its bottom-right corner, with the create form
  // opening downwards from there. The CRAF'd standard library is the controlled
  // vocabulary and is curated from the admin indicators page.
  //
  // Kept mounted when the document is read-only instead of hidden: the surrounding
  // <fieldset disabled> greys it out natively, the same way every input on this tab
  // is greyed rather than removed. Hiding it made the tab look broken whenever the
  // editing lock lapsed — a 15-minute idle timeout silently flips the whole prodoc
  // to read-only — with no hint that the control still exists and that "Start
  // editing" brings it back.
  const addIndicatorFooter = (
    <div className="flex shrink-0 flex-col items-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => creating ? cancelCreate() : openCreate("")} className="gap-1">
        {creating ? <X className="size-4" /> : <Plus className="size-4" />}
        {creating ? "Cancel" : "Add indicator"}
      </Button>
      {creating && (
        <div className="flex w-full flex-col gap-2 rounded-lg border bg-muted/20 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{labels.adminEditor.createIndicator}</p>
            <Button variant="ghost" size="sm" onClick={cancelCreate} className="h-7 px-2 text-muted-foreground">
              <X className="mr-1 size-4" />{labels.adminEditor.cancel ?? "Cancel"}
            </Button>
          </div>
          <div className="flex items-start gap-2">
            <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={labels.placeholders.indicatorName} className="flex-[2]" autoFocus />
            <Textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder={labels.placeholders.indicatorDescription} className="min-h-9 flex-[2] resize-y text-sm" />
            <Textarea value={createMeansOfVerification} onChange={(e) => setCreateMeansOfVerification(e.target.value)} placeholder={labels.placeholders.meansOfVerification} className="min-h-9 flex-[2] resize-y text-sm" />
            <Button onClick={submitCreate} disabled={creatingBusy || !createName.trim() || !createDescription.trim() || !createMeansOfVerification.trim()} size="sm" className="shrink-0">
              {creatingBusy ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="mr-1 size-4" />{labels.adminEditor.add}</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className={"flex flex-col gap-4 " + (fillHeight ? "flex-1 min-h-0" : "")}>
      <div className="flex shrink-0 justify-end">
        <IndicatorTableSwitch
          value={table}
          onChange={setTable}
          standardCount={standardLines.length}
          customCount={customLines.length}
        />
      </div>
      {table === "standard" && renderTable(standardLines, "standard")}
      {table === "custom" && renderTable(customLines, "custom", addIndicatorFooter)}
    </div>
  );
}
