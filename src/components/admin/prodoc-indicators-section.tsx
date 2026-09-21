"use client";

import { useRef, useState, type CSSProperties } from "react";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComboboxItem } from "@/components/ui/combobox";
import { InfoPopover } from "@/components/ui/info-popover";
import { HEAD_TEXT, TableExpandToggle } from "@/components/report-editor/matrix-table";
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

// The tab renders one table per kind, each with its own independent height toggle.
const PRODOC_TABLE_TYPES = ["standard", "custom"] as const;
type ProdocTableType = (typeof PRODOC_TABLE_TYPES)[number];

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

  // Expanded tables drop their height cap and show every row at once. Only
  // meaningful under fillHeight, where the two tables otherwise split the tab's
  // height and each scrolls in a short box. Once either is expanded this section
  // takes over scrolling and the expanded table runs to its natural height.
  const [expanded, setExpanded] = useState<Record<ProdocTableType, boolean>>({ standard: false, custom: false });
  const anyExpanded = fillHeight && (expanded.standard || expanded.custom);

  // Expanding is a layout change for *both* tables: the section starts scrolling,
  // so neither can keep its flex share any more. Left alone, the table nobody
  // clicked would silently resize to whatever cap replaced its share. So at the
  // moment the split is abandoned, measure each card and pin the ones that stay
  // collapsed to the height they already had — the toggle then only ever changes
  // its own table. Cleared when both are collapsed and the flex split resumes.
  const [pinnedHeights, setPinnedHeights] = useState<Partial<Record<ProdocTableType, number>>>({});
  const cardRefs = useRef<Record<ProdocTableType, HTMLDivElement | null>>({ standard: null, custom: null });

  function toggleExpanded(type: ProdocTableType) {
    const next = { ...expanded, [type]: !expanded[type] };
    const wasAny = expanded.standard || expanded.custom;
    const nowAny = next.standard || next.custom;
    if (!wasAny && nowAny) {
      const measured: Partial<Record<ProdocTableType, number>> = {};
      for (const key of PRODOC_TABLE_TYPES) {
        const el = cardRefs.current[key];
        if (el) measured[key] = el.getBoundingClientRect().height;
      }
      setPinnedHeights(measured);
    } else if (wasAny && !nowAny) {
      setPinnedHeights({});
    }
    setExpanded(next);
  }

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

  // How tall a card is allowed to get:
  //   expanded            — uncapped, every row on screen (the section scrolls)
  //   sibling expanded    — pinned to the height it had before the split was
  //                         abandoned, so expanding one table never resizes the other
  //   fillHeight, neither — the default even split of the tab's height
  //   no fillHeight       — the page already scrolls; keep the standing cap
  function heightCap(type: ProdocTableType): { className: string; style?: CSSProperties } {
    if (!fillHeight) return { className: "max-h-[28rem]" };
    if (expanded[type]) return { className: "" };
    if (anyExpanded) return { className: "", style: { maxHeight: pinnedHeights[type] } };
    return { className: "max-h-full" };
  }

  function renderTable(tableLines: ProdocIndicatorLine[], type: ProdocTableType) {
    const cap = heightCap(type);
    return (
      // Two nested elements with different jobs. The outer one is an invisible layout
      // slot: `flex-1 min-h-0` claims an equal share of whatever height the tab has
      // left, which is what keeps the two boxes in the same proportion regardless of
      // how many rows each holds. (`min-h-0` is load-bearing — without it flexbox
      // floors the slot at the table's natural height and the page scrolls again.)
      //
      // The inner one is the visible card. It is sized by its content and only capped
      // at `max-h-full`, so with a handful of rows the border closes under the last
      // one and the rest of the slot is left blank, while a full table fills the slot
      // and scrolls inside itself. `overflow-auto` covers both axes: the table's
      // 1100px min-width still needs the horizontal scroll on a narrow window.
      <div className={fillHeight && !anyExpanded ? "flex-1 min-h-0" : ""}>
      <div
        ref={(el) => { cardRefs.current[type] = el; }}
        style={cap.style}
        className={"rounded-xl border bg-card overflow-auto " + cap.className}
      >
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr>
              <th className={headCell} style={headShadow}>
                <span className="flex items-center gap-1.5">
                  {type === "standard" ? labels.indicators.columns.standardIndicator : labels.indicators.columns.customIndicator}
                  <InfoPopover description={type === "standard"
                    ? "These are standard indicators used across all CRAF'd-supported projects."
                    : "These are custom indicators specific to this project document."}
                  />
                  {/* Height toggle, pushed to the right edge of the first column.
                      Only earns its place under fillHeight — anywhere else the
                      table is already at its natural height. */}
                  {fillHeight && (
                    <span className="ml-auto pl-2">
                      <TableExpandToggle expanded={expanded[type]} onToggle={() => toggleExpanded(type)} />
                    </span>
                  )}
                </span>
              </th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.baselineValue}</th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.baselineYear}</th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.targetValue}</th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.targetYear}</th>
              <th className={headCell + " w-48"} style={headShadow}>Linked activity</th>
              <th className={headCell + " w-24 text-right"} style={headShadow} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableLines.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">{type === "standard" ? "No standard indicators added yet." : "No custom indicators added yet."}</td></tr>
            ) : tableLines.map((line) => {
              const isEditing = editingId === line.id && draft;
              const values = valuesFor(line);
              return (
                <tr key={line.id} className="align-top transition-colors hover:bg-muted/20">
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
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex items-center justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => save(line)} disabled={savingId === line.id || !draft.name.trim()}>{savingId === line.id ? <Loader2 className="size-3 animate-spin" /> : labels.adminEditor.save}</Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(null); }} disabled={savingId === line.id}>{labels.common.cancel}</Button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-end gap-3">
                        {(isAdmin || !line.is_standard) && <button disabled={readOnly} onClick={() => startEdit(line)} className="text-muted-foreground hover:text-foreground disabled:opacity-40" title="Edit indicator" aria-label={`Edit indicator ${line.indicator_name}`}><Pencil className="size-3.5" /></button>}
                        {!line.is_standard && <button disabled={readOnly || deletingId === line.id} onClick={async () => { setDeletingId(line.id); try { await onDelete(line.id); } finally { setDeletingId(null); } }} className="text-muted-foreground hover:text-destructive disabled:opacity-40" title="Remove indicator" aria-label={`Remove indicator ${line.indicator_name}`}>{deletingId === line.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    );
  }

  const standardLines = lines.filter((line) => line.is_standard);
  const customLines = lines.filter((line) => !line.is_standard);

  return (
    // anyExpanded moves the scrolling here: the tab above is overflow-hidden, so
    // without it an expanded table's extra rows would simply be clipped.
    <div className={"flex flex-col gap-4 " + (fillHeight ? "flex-1 min-h-0 " : "") + (anyExpanded ? "overflow-auto" : "")}>
      {renderTable(standardLines, "standard")}
      {!readOnly && (
        <div className="flex shrink-0 justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => creating ? cancelCreate() : openCreate("")} className="gap-1">
            {creating ? <X className="size-4" /> : <Plus className="size-4" />}
            {creating ? "Cancel" : "Add indicator"}
          </Button>
        </div>
      )}
      {creating && (
        <div className="flex w-full shrink-0 flex-col gap-2 rounded-lg border bg-muted/20 p-3">
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
      {renderTable(customLines, "custom")}
    </div>
  );
}
