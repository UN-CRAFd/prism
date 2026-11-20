"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ComboboxItem } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoPopover } from "@/components/ui/info-popover";
import { RequiredMark } from "@/components/ui/required-mark";
import { HEAD_TEXT, HEAD_BG, HEAD_COLOR, HEAD_DIVIDER_COLOR } from "@/components/report-editor/matrix-table";
import labels from "@/lib/labels";
import { optionValues } from "@/lib/options";
import { numericYear, isValidYear, numericAmount } from "@/lib/numeric-input";
import { cycleLabel, CYCLE_KEYS, DEFAULT_CYCLE } from "@/lib/indicators";
import { type ContributorActivity } from "@/components/report-editor/contributor-matrix";
import { resultOptions, resultLabel, uncoveredResults, type ResultOption } from "@/lib/workplan";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { Hint } from "@/components/ui/hint";
import { Tag } from "@/components/ui/tag";

export interface ProdocIndicatorLine {
  id: number;
  indicator_id: number;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  linked_results: string[];
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
  cycle: string | null;
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  linked_results: string[];
}

function LinkedResultsPicker({
  options,
  selected,
  onChange,
  missing = false,
}: {
  options: ResultOption[];
  selected: string[];
  onChange: (keys: string[]) => Promise<void>;
  missing?: boolean; // no outcome or output is linked
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={"w-full min-h-8 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-accent/40 flex items-start justify-between gap-2 disabled:cursor-not-allowed disabled:opacity-50" + (missing ? " border-crafd-yellow-400" : "")}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {selected.length === 0
              ? <span className="text-muted-foreground py-0.5">Select outcome / output</span>
              : selected.map((key) => (
                  <span key={key} className="line-clamp-1 font-medium">{options.find((o) => o.key === key)?.label ?? key}</span>
                ))}
          </div>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[380px] overflow-auto">
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No work plan results yet.</div>
        )}
        {options.map((opt) => {
          const checked = selected.includes(opt.key);
          return (
            <DropdownMenuCheckboxItem
              key={opt.key}
              checked={checked}
              onCheckedChange={() =>
                onChange(checked ? selected.filter((k) => k !== opt.key) : [...selected, opt.key])
              }
              onSelect={(e) => e.preventDefault()}
              className={"text-xs " + (opt.kind === "outcome" ? "" : "pl-14 [&>span:first-child]:left-8")}
            >
              <span className="line-clamp-2">{opt.label}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CATEGORY_NONE = "__none__";

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
}: {
  lines: ProdocIndicatorLine[];
  indicatorItems: ComboboxItem[];
  onAdd: (item: ComboboxItem) => Promise<void>;
  onCreate: (name: string, description: string, meansOfVerification: string, cycle: string, category: string | null) => Promise<void>;
  onEdit: (indicatorId: number, lineId: number, patch: ProdocIndicatorEdit) => Promise<void>;
  onUpdateValues: (lineId: number, values: Pick<ProdocIndicatorEdit, "baseline_value" | "baseline_year" | "target_value" | "target_year" | "linked_results">) => Promise<void>;
  onDelete: (lineId: number) => Promise<void>;
  isAdmin: boolean;
  readOnly: boolean;
  fillHeight: boolean;
  activities: ContributorActivity[];
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<ProdocIndicatorEdit | null>(null);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createMeansOfVerification, setCreateMeansOfVerification] = useState("");
  const [createCycle, setCreateCycle] = useState<string>(DEFAULT_CYCLE);
  // Optional category, same list as the standard indicators (e.g. Access & Usage).
  const [createCategory, setCreateCategory] = useState<string>(CATEGORY_NONE);
  const [creatingBusy, setCreatingBusy] = useState(false);
  // Set once Save has been tried, so missing required fields get a red outline.
  const [createTried, setCreateTried] = useState(false);
  const draftRowRef = useRef<HTMLTableRowElement>(null);
  const [valueDrafts, setValueDrafts] = useState<Record<number, Pick<ProdocIndicatorEdit, "baseline_value" | "baseline_year" | "target_value" | "target_year" | "linked_results">>>({});
  const [yearErrors, setYearErrors] = useState<Record<number, { baseline: boolean; target: boolean }>>({});
  // New-row feedback: after a custom indicator is created, scroll to its row and
  // flash it. The new row is detected by its id first appearing in `lines`.
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const awaitingNewRef = useRef(false);
  const knownIdsRef = useRef<Set<number> | null>(null);
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const known = knownIdsRef.current;
    knownIdsRef.current = new Set(lines.map((l) => l.id));
    if (!known || !awaitingNewRef.current) return;
    const added = lines.filter((l) => !known.has(l.id) && !l.is_standard);
    if (added.length === 0) return;
    awaitingNewRef.current = false;
    const newId = added[added.length - 1].id;
    rowRefs.current.get(newId)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    setHighlightId(newId);
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => setHighlightId(null), 1000);
  }, [lines]);

  useEffect(() => () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); }, []);

  // Bring the draft row into view when it opens (it is the last row of the table).
  useEffect(() => {
    if (creating) draftRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [creating]);

  function startEdit(line: ProdocIndicatorLine) {
    setEditingId(line.id);
    setDraft({
      name: line.indicator_name,
      description: line.indicator_description,
      means_of_verification: line.means_of_verification,
      cycle: line.cycle ?? DEFAULT_CYCLE,
      baseline_value: line.baseline_value,
      baseline_year: line.baseline_year,
      target_value: line.target_value,
      target_year: line.target_year,
      linked_results: line.linked_results,
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
      linked_results: line.linked_results,
    };
    return valueDrafts[line.id] ? { ...saved, ...valueDrafts[line.id] } : saved;
  }

  function updateValues(lineId: number, patch: Partial<ProdocIndicatorEdit>) {
    setValueDrafts((current) => ({ ...current, [lineId]: { ...current[lineId], ...patch } }));
  }

  function updateYear(lineId: number, side: "baseline" | "target", raw: string) {
    const sanitized = numericYear(raw);
    const num = sanitized ? Number(sanitized) : null;
    if (side === "baseline") updateValues(lineId, { baseline_year: num });
    else updateValues(lineId, { target_year: num });
    setYearErrors((prev) => ({
      ...prev,
      [lineId]: { ...prev[lineId], [side]: num !== null && !isValidYear(num) },
    }));
  }

  // The row's values as they should be sent: a side whose year is currently
  // invalid keeps its last persisted year (from the line itself, not the draft),
  // so the invalid year is skipped while everything else in the row still saves.
  function savableValues(line: ProdocIndicatorLine) {
    const errs = yearErrors[line.id];
    return {
      ...valuesFor(line),
      ...(errs?.baseline ? { baseline_year: line.baseline_year } : {}),
      ...(errs?.target ? { target_year: line.target_year } : {}),
    };
  }

  async function saveValues(line: ProdocIndicatorLine) {
    const errs = yearErrors[line.id];
    const values = savableValues(line);
    setSavingId(line.id);
    try {
      await onUpdateValues(line.id, values);
      // Clear the row's drafts, except an invalid year: that draft stays so the
      // value remains visible (red outline) until the user corrects it.
      setValueDrafts((current) => {
        const next = { ...current };
        const kept: Partial<(typeof current)[number]> = {};
        if (errs?.baseline && current[line.id]?.baseline_year !== undefined) kept.baseline_year = current[line.id].baseline_year;
        if (errs?.target && current[line.id]?.target_year !== undefined) kept.target_year = current[line.id].target_year;
        if (Object.keys(kept).length > 0) next[line.id] = kept as (typeof current)[number];
        else delete next[line.id];
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
    setCreateTried(false);
    setCreateName("");
    setCreateDescription("");
    setCreateMeansOfVerification("");
    setCreateCycle(DEFAULT_CYCLE);
    setCreateCategory(CATEGORY_NONE);
  }

  async function submitCreate() {
    if (!createName.trim() || !createDescription.trim() || !createMeansOfVerification.trim()) {
      setCreateTried(true);
      return;
    }
    setCreatingBusy(true);
    awaitingNewRef.current = true;
    try {
      await onCreate(createName.trim(), createDescription.trim(), createMeansOfVerification.trim(), createCycle, createCategory === CATEGORY_NONE ? null : createCategory);
      cancelCreate();
    } catch (e) {
      awaitingNewRef.current = false;
      throw e;
    } finally {
      setCreatingBusy(false);
    }
  }

  // Frozen column header: pin each header cell to the top of the box's scroll
  // area. The table is border-collapse, so the collapsed bottom border vanishes on
  // sticky cells — an inset box-shadow redraws it. The background has to be opaque
  // (not the old bg-muted/30) or scrolled rows show through; bg-neutral-100 matches
  // the frozen heads on the workplan / expenditure / risk tabs.
  const headCell = `sticky top-0 z-10 ${HEAD_BG} px-4 py-3 text-left whitespace-nowrap ${HEAD_COLOR} ${HEAD_TEXT}`;
  const headShadow = { boxShadow: `inset 0 -1px 0 ${HEAD_DIVIDER_COLOR}` };
  // Actions column header: same cell with tight horizontal padding.
  const headCellTight = headCell.replace(" px-4 ", " px-2 ");

  function renderTable(tableLines: ProdocIndicatorLine[], footer?: React.ReactNode) {
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
      <div className={"scroll-fade rounded-xl border bg-card overflow-auto min-h-0 " + (fillHeight ? "" : "max-h-[28rem]")}>
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr>
              <th className={headCell + " w-8 text-right pr-3"} style={headShadow}>#</th>
              <th className={headCell + " w-full"} style={headShadow}>Indicator</th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.baselineValue}<RequiredMark /></th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.baselineYear}</th>
              <th className={headCell + " w-32"} style={headShadow}>{labels.indicators.columns.targetValue}<RequiredMark /></th>
              <th className={headCell + " w-24"} style={headShadow}>{labels.indicators.columns.targetYear}</th>
              <th className={headCell + " w-48"} style={headShadow}>Linked outcome / output<RequiredMark /></th>
              <th className={headCellTight + " w-16 text-right"} style={headShadow} />
            </tr>
          </thead>
          <tbody className="divide-y">
            {tableLines.length === 0 && !creating ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">No indicators added yet.</td></tr>
            ) : tableLines.map((line, idx) => {
              const isEditing = editingId === line.id && draft;
              const values = valuesFor(line);
              return (
                <tr
                  key={line.id}
                  ref={(el) => { if (el) rowRefs.current.set(line.id, el); else rowRefs.current.delete(line.id); }}
                  className={"align-top transition-colors duration-700 hover:bg-muted/20" + (highlightId === line.id ? " bg-crafd-yellow-100" : "")}
                >
                  <td className="px-4 py-3 w-8 text-right text-sm tabular-nums text-crafd-grey-600 align-top">{idx + 1}.</td>
                  <td className="px-4 py-3">
                    {isEditing ? (
                      <div className="flex flex-col gap-1.5">
                        <Input value={draft.name} onChange={(e) => updateDraft({ name: e.target.value })} placeholder={labels.placeholders.indicatorName} autoFocus />
                        <Textarea value={draft.description ?? ""} onChange={(e) => updateDraft({ description: e.target.value })} placeholder={labels.placeholders.indicatorDescription} className="min-h-[64px] resize-y" />
                        <Textarea value={draft.means_of_verification ?? ""} onChange={(e) => updateDraft({ means_of_verification: e.target.value })} placeholder={labels.placeholders.meansOfVerification} className="min-h-[64px] resize-y" />
                        <Select value={draft.cycle ?? DEFAULT_CYCLE} onValueChange={(v) => updateDraft({ cycle: v })}>
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CYCLE_KEYS.map((k) => (
                              <SelectItem key={k} value={k}>{cycleLabel(k)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {line.category && <Hint label={labels.indicators.tagHelp.category}><Tag>{line.category}</Tag></Hint>}
                            {line.cycle && <Hint label={(labels.indicators.tagHelp.cycles as Record<string, string | undefined>)[line.cycle]}><Tag>{cycleLabel(line.cycle)}</Tag></Hint>}
                            <Hint label={line.is_standard ? labels.indicators.tagHelp.standard : labels.indicators.tagHelp.custom}>
                              {line.is_standard
                                ? <Tag>Standard</Tag>
                                : <Tag variant="highlight">Custom</Tag>}
                            </Hint>
                          </div>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Input inputMode="decimal" value={values.baseline_value ?? ""} disabled={readOnly || !!isEditing} onChange={(e) => updateValues(line.id, { baseline_value: numericAmount(e.target.value) })} onBlur={() => saveValues(line)} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <Input
                        inputMode="numeric"
                        value={values.baseline_year ?? ""}
                        disabled={readOnly || !!isEditing}
                        onChange={(e) => updateYear(line.id, "baseline", e.target.value)}
                        onBlur={() => saveValues(line)}
                        className={"h-8" + (yearErrors[line.id]?.baseline ? " border-destructive focus-visible:ring-destructive" : "")}
                        aria-invalid={yearErrors[line.id]?.baseline || undefined}
                      />
                      {yearErrors[line.id]?.baseline && (
                        <p className="mt-0.5 text-xs text-destructive">Enter a year between 2000 and 2050</p>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Input inputMode="decimal" value={values.target_value ?? ""} disabled={readOnly || !!isEditing} onChange={(e) => updateValues(line.id, { target_value: numericAmount(e.target.value) })} onBlur={() => saveValues(line)} className="h-8" />
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <Input
                        inputMode="numeric"
                        value={values.target_year ?? ""}
                        disabled={readOnly || !!isEditing}
                        onChange={(e) => updateYear(line.id, "target", e.target.value)}
                        onBlur={() => saveValues(line)}
                        className={"h-8" + (yearErrors[line.id]?.target ? " border-destructive focus-visible:ring-destructive" : "")}
                        aria-invalid={yearErrors[line.id]?.target || undefined}
                      />
                      {yearErrors[line.id]?.target && (
                        <p className="mt-0.5 text-xs text-destructive">Enter a year between 2000 and 2050</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 pl-4 pr-2">
                    <div className={"w-full " + (readOnly || isEditing ? "pointer-events-none opacity-50" : "")}>
                      <LinkedResultsPicker
                        options={resultOptions(activities)}
                        selected={values.linked_results}
                        missing={!readOnly && !(values.linked_results?.length)}
                        onChange={async (linked_results) => {
                          updateValues(line.id, { linked_results });
                          await onUpdateValues(line.id, { ...savableValues(line), linked_results });
                        }}
                      />
                    </div>
                  </td>
                  {line.is_standard ? (
                    <td className="px-2 py-3" />
                  ) : (
                    <td className="px-2 py-3">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => save(line)} disabled={savingId === line.id || !draft.name.trim()}>{savingId === line.id ? <Loader2 className="size-3 animate-spin" /> : labels.adminEditor.save}</Button>
                          <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setDraft(null); }} disabled={savingId === line.id}>{labels.common.cancel}</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-end gap-2">
                          <Hint label="Edit indicator" disabled>
                            <button disabled={readOnly} onClick={() => startEdit(line)} className="text-muted-foreground hover:text-foreground disabled:opacity-40" aria-label={`Edit indicator ${line.indicator_name}`}><Pencil className="size-3.5" /></button>
                          </Hint>
                          <Hint label="Remove indicator" disabled>
                            <button disabled={readOnly || deletingId === line.id} onClick={async () => { setDeletingId(line.id); try { await onDelete(line.id); } finally { setDeletingId(null); } }} className="text-muted-foreground hover:text-destructive disabled:opacity-40" aria-label={`Remove indicator ${line.indicator_name}`}>{deletingId === line.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>
                          </Hint>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
            {/* Draft row for a new custom indicator — nothing is created until Save. */}
            {creating && (
              <tr ref={draftRowRef} className="align-top bg-muted/10">
                <td className="px-4 py-3 w-8 text-right text-sm tabular-nums text-crafd-grey-600 align-top">{tableLines.length + 1}.</td>
                {/* One full-width form cell spanning every column after the row number. */}
                <td colSpan={7} className="px-4 py-3">
                  <div className="flex flex-col gap-2">
                    <Input value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder={labels.placeholders.indicatorName} className={createTried && !createName.trim() ? "border-destructive focus-visible:ring-destructive" : undefined} autoFocus />
                    <div className="grid grid-cols-2 gap-2">
                      <Textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder={labels.placeholders.indicatorDescription} className={"min-h-[64px] resize-y" + (createTried && !createDescription.trim() ? " border-destructive focus-visible:ring-destructive" : "")} />
                      <Textarea value={createMeansOfVerification} onChange={(e) => setCreateMeansOfVerification(e.target.value)} placeholder={labels.placeholders.meansOfVerification} className={"min-h-[64px] resize-y" + (createTried && !createMeansOfVerification.trim() ? " border-destructive focus-visible:ring-destructive" : "")} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1.5">
                        <Select value={createCategory} onValueChange={setCreateCategory}>
                          <SelectTrigger className="h-8 w-44" aria-label="Category">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={CATEGORY_NONE} className="text-muted-foreground">No category</SelectItem>
                            {optionValues("indicatorCategory").map((c) => (
                              <SelectItem key={c} value={c}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Select value={createCycle} onValueChange={setCreateCycle}>
                          <SelectTrigger className="h-8 w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CYCLE_KEYS.map((k) => (
                              <SelectItem key={k} value={k}>{cycleLabel(k)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={submitCreate} disabled={creatingBusy}>
                          {creatingBusy ? <Loader2 className="size-3 animate-spin" /> : labels.adminEditor.save}
                        </Button>
                        <Button size="sm" variant="outline" onClick={cancelCreate} disabled={creatingBusy}>{labels.common.cancel}</Button>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {footer}
      </div>
    );
  }

  const standardLines = lines.filter((line) => line.is_standard);
  const customLines = lines.filter((line) => !line.is_standard);

  // Adding only ever creates a customised project indicator — "Add indicator" sits
  // under the table's bottom-right corner and opens a draft row at the end of the
  // table. The CRAF'd standard library is the controlled
  // vocabulary and is curated from the admin indicators page.
  //
  // Kept mounted when the document is read-only instead of hidden: the surrounding
  // <fieldset disabled> greys it out natively, the same way every input on this tab
  // is greyed rather than removed. Hiding it made the tab look broken whenever the
  // editing lock lapsed — a 15-minute idle timeout silently flips the whole prodoc
  // to read-only — with no hint that the control still exists and that "Start
  // editing" brings it back.
  // Outcomes / outputs no indicator is linked to yet. Uses each row's current values
  // (including an unsaved link change) so the list updates live.
  const uncovered = readOnly
    ? []
    : uncoveredResults(activities, lines.map((l) => ({ linked_results: valuesFor(l).linked_results })));
  // Short names ("1. Outcome", "1.3. Output") for the inline hint; full labels in its tooltip.
  const shortName = (o: ResultOption) => `${o.key.slice(o.key.indexOf(":") + 1)}. ${o.kind === "outcome" ? "Outcome" : "Output"}`;
  const missingHint = uncovered.length === 0
    ? null
    : uncovered.length === 1
      ? `${shortName(uncovered[0])} has no indicator yet.`
      : `No indicator yet: ${uncovered.map(shortName).join(", ")}`;

  const addIndicatorFooter = (
    // The Add button is hidden while the draft row is open — one draft at a time, and
    // the row has its own Save / Cancel. The missing-results hint stays visible.
    (!creating || missingHint) && (
      <div className="flex shrink-0 items-center justify-between gap-3">
        {missingHint ? (
          <Hint label={uncovered.map((o) => o.label).join("\n")} multiline>
            <p className="min-w-0 text-xs text-crafd-yellow-900">{missingHint}</p>
          </Hint>
        ) : <span />}
        {!creating && (
          <Button type="button" variant="add" size="sm" onClick={() => openCreate("")} className="gap-1 shrink-0">
            <Plus className="size-4" />
            Add indicator
          </Button>
        )}
      </div>
    )
  );

  return (
    <div className={"flex flex-col gap-4 " + (fillHeight ? "flex-1 min-h-0" : "")}>
      {renderTable([...standardLines, ...customLines], addIndicatorFooter)}
    </div>
  );
}
