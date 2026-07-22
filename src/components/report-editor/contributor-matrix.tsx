"use client";

import { Fragment, useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import { MatrixTableShell } from "@/components/report-editor/matrix-table";
import { FALLBACK_COLORS } from "@/lib/risk";
import { PARTNER_TYPES, activityLabel, formatAmount } from "@/lib/transfers";
import { FUNDING_TYPES, FUNDING_TYPE_COLORS } from "@/lib/complementary";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

// ─────────────────────────────────────────────────────────────────────────────
// Shared editor for the two near-identical "contributor year-matrix" report
// sections — transfers to implementing partners and complementary funding. Both
// pivot a project-scoped organisation (the "master") across every report year,
// with an editable amount + linked activity for the current year only. The five
// differences between them (endpoint, labels, id/identity field names, the type
// column, and single- vs multi-activity linking) are captured in the config
// passed in; everything else — state map, load, add, delete, master/cell dirty
// split, autosave, totals — lives here once.
//
// Slots in like the other report child editors (SectionTableEditor, expenditure,
// workplan): owns its own data + debounced autosave and reports its save state up
// via onSaveStateChange. It additionally pushes each edit/delete onto the parent
// undo/redo stack (pushCommand) and surfaces errors through the parent's shared
// banner (onError), matching the behaviour these sections had inline.
// ─────────────────────────────────────────────────────────────────────────────

// Frozen left columns for the matrix (org identity stays put while the per-year
// amount/linked-activity columns scroll horizontally).
const TCOL = {
  org:     { left: 0,   w: 220 },
  website: { left: 220, w: 170 },
  type:    { left: 390, w: 170 },
} as const;
const TRANSFER_FROZEN_WIDTH = 560;

function tfz(key: keyof typeof TCOL, z = 20): CSSProperties {
  const c = TCOL[key];
  return { position: "sticky", left: c.left, width: c.w, minWidth: c.w, maxWidth: c.w, zIndex: z };
}

// Coloured word-badge for the (optional) type column — mirrors the report editor.
function Badge({ colors, children }: { colors: { bg: string; text: string; border: string }; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", colors.bg, colors.text, colors.border)}>
      {children}
    </span>
  );
}

// A command that knows how to reverse and replay itself on the parent undo stack.
export interface HistoryCommand {
  undo: () => void;
  redo: () => void;
}

export interface ContributorActivity {
  id: number;
  activity_num: string | null;
  activity_text: string | null;
  objective_num: string | null;
  objective_text: string | null;
  sort_order: number;
}

// The five real differences between the transfers and complementary sections.
export interface ContributorMatrixConfig {
  section: string;                  // comment anchor + tab identity
  dataEndpoint: string;             // per-report line endpoint (matrix GET, POST/PATCH/DELETE)
  masterEndpoint: string;           // project-scoped organisation endpoint (POST/PATCH)
  entityIdField: string;            // "transfer_partner_id" | "contributor_id"
  identityField: string;            // "organization_name" | "contributor_name"
  typeField: string;                // "partner_type" | "funding_type"
  amountField: string;              // "amount_transferred" | "contribution_amount"
  activityField: string;            // "linked_activity_id" | "linked_activity_ids"
  activityMode: "single" | "multi"; // single Select vs multi-select dropdown
  typeOptions: string[];            // PARTNER_TYPES | FUNDING_TYPES
  typeBadgeColors?: Record<string, { bg: string; text: string; border: string }>;
  deleteAriaLabel: string;
  deleteConfirm: (name: string) => string;
  messages: {
    loadFail: string;
    createMaster: string;
    addLine: string;
    deleteLine: string;
    restore: string;
  };
  labels: {
    addEntry: string;
    empty: string;
    identityColumn: string;
    websiteColumn: string;
    typeColumn: string;
    amountColumn: string;
    activityColumn: string;
    subTotalColumn: string;
    totalColumn: string;
    selectType: string;
    selectActivity: string;
    identityPlaceholder: string;
    websitePlaceholder: string;
    amountPlaceholder: string;
    amountMinWidth: string;
    activityMinWidth: string;
  };
}

// Normalised internal shapes — the config maps the section-specific field names
// onto these so the render + save logic can stay generic. Activity linking is
// always kept as an id array (single-mode holds 0 or 1).
interface YearCell {
  id: number;
  report_id: number;
  amount: string | null;
  activityIds: number[];
}

interface MatrixRow {
  entityId: number;
  name: string | null;
  website: string | null;
  type: string | null;
  currentLineId: number;
  byYear: Record<number, YearCell | undefined>;
}

// Identity (name/website/type) is master-level and editable anytime; the amount +
// linked activity are per-year and only editable for the current report.
interface RowState {
  name: string;
  website: string;
  type: string | null;
  amount: string;
  activityIds: number[];
  masterDirty: boolean;
  cellDirty: boolean;
}

type RawCell = { id: number; report_id: number } & Record<string, unknown>;
type RawRow = { currentLineId: number; website: string | null; byYear: Record<number, RawCell | undefined> } & Record<string, unknown>;
type MatrixResponse = { years: number[]; currentYear: number | null; rows: RawRow[]; activities: ContributorActivity[] };

interface ContributorMatrixProps {
  reportId: number;
  projectId: number | null;
  config: ContributorMatrixConfig;
  pushCommand: (cmd: HistoryCommand) => void;
  onSaveStateChange?: (s: SaveState) => void;
  onError: (msg: string | null) => void;
}

// Owns the state map + load/add/delete/update logic and the debounced autosave.
function useContributorMatrix({ reportId, projectId, config, pushCommand, onSaveStateChange, onError }: ContributorMatrixProps) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [currentYear, setCurrentYear] = useState<number | null>(null);
  const [activities, setActivities] = useState<ContributorActivity[]>([]);
  const [states, setStates] = useState<Record<number, RowState>>({});
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Normalise a raw per-year cell onto the generic { amount, activityIds } shape.
  const normCell = useCallback((raw: RawCell): YearCell => {
    const av = raw[config.activityField];
    return {
      id: raw.id,
      report_id: raw.report_id,
      amount: (raw[config.amountField] as string | null) ?? null,
      activityIds: config.activityMode === "single"
        ? (av != null ? [av as number] : [])
        : ((av as number[] | null) ?? []),
    };
  }, [config]);

  const load = useCallback(async () => {
    setLoading(true);
    onError(null);
    try {
      const res = await fetch(`${config.dataEndpoint}?reportId=${reportId}&matrix=1`);
      if (!res.ok) throw new Error(config.messages.loadFail);
      const data: MatrixResponse = await res.json();
      setRows(data.rows.map((raw) => {
        const byYear: Record<number, YearCell | undefined> = {};
        for (const [year, cell] of Object.entries(raw.byYear)) {
          byYear[Number(year)] = cell ? normCell(cell) : undefined;
        }
        return {
          entityId: raw[config.entityIdField] as number,
          name: (raw[config.identityField] as string | null) ?? null,
          website: raw.website ?? null,
          type: (raw[config.typeField] as string | null) ?? null,
          currentLineId: raw.currentLineId,
          byYear,
        };
      }));
      setYears(data.years);
      setCurrentYear(data.currentYear);
      setActivities(data.activities);
      const next: Record<number, RowState> = {};
      for (const raw of data.rows) {
        const cell = data.currentYear != null ? raw.byYear[data.currentYear] : undefined;
        const norm = cell ? normCell(cell) : undefined;
        next[raw[config.entityIdField] as number] = {
          name: (raw[config.identityField] as string | null) ?? "",
          website: raw.website ?? "",
          type: (raw[config.typeField] as string | null) ?? null,
          amount: norm?.amount != null ? String(norm.amount) : "",
          activityIds: norm?.activityIds ?? [],
          masterDirty: false,
          cellDirty: false,
        };
      }
      setStates(next);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [reportId, config, onError, normCell]);

  useEffect(() => { load(); }, [load]);

  // Master PATCH body (project-scoped identity fields).
  const masterBody = useCallback((entityId: number, st: RowState) => ({
    id: entityId,
    [config.identityField]: st.name || null,
    website: st.website || null,
    [config.typeField]: st.type || null,
  }), [config]);

  // Per-year cell PATCH/create body from raw amount + activity ids.
  const cellBody = useCallback((lineId: number, amount: string, activityIds: number[]) => ({
    id: lineId,
    [config.amountField]: amount || null,
    [config.activityField]: config.activityMode === "single" ? (activityIds[0] ?? null) : activityIds,
  }), [config]);

  // Save every dirty master + cell. A dirty flag is only cleared if the content is
  // unchanged since the snapshot, so edits made mid-save aren't dropped.
  const flush = useCallback(async () => {
    if (!reportId) return;
    const dirtyMasters = rows.filter((r) => states[r.entityId]?.masterDirty);
    const masterSnap = new Map(dirtyMasters.map((r) => [r.entityId, JSON.stringify({ n: states[r.entityId].name, w: states[r.entityId].website, t: states[r.entityId].type })]));
    const dirtyCells = rows.filter((r) => states[r.entityId]?.cellDirty);
    const cellSnap = new Map(dirtyCells.map((r) => [r.entityId, JSON.stringify({ a: states[r.entityId].amount, l: states[r.entityId].activityIds })]));

    const ok = (r: Response) => { if (!r.ok) throw new Error(labels.common.saveFailed); };
    try {
      await Promise.all([
        ...dirtyMasters.map((r) => {
          const st = states[r.entityId];
          return fetch(config.masterEndpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(masterBody(r.entityId, st)) }).then(ok);
        }),
        ...dirtyCells.map((r) => {
          const st = states[r.entityId];
          return fetch(config.dataEndpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cellBody(r.currentLineId, st.amount, st.activityIds)) }).then(ok);
        }),
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : labels.common.saveFailed);
      throw e;
    }

    if (dirtyMasters.length || dirtyCells.length) setStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyMasters) { const cur = prev[r.entityId]; if (cur && JSON.stringify({ n: cur.name, w: cur.website, t: cur.type }) === masterSnap.get(r.entityId)) n[r.entityId] = { ...n[r.entityId], masterDirty: false }; }
      for (const r of dirtyCells) { const cur = prev[r.entityId]; if (cur && JSON.stringify({ a: cur.amount, l: cur.activityIds }) === cellSnap.get(r.entityId)) n[r.entityId] = { ...n[r.entityId], cellDirty: false }; }
      return n;
    });
  }, [reportId, rows, states, config, onError, masterBody, cellBody]);

  const autosave = useAutosave(flush, { onStateChange: onSaveStateChange });
  const { schedule } = autosave;

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => { autosave.flushNow(); }, [autosave.flushNow]);

  // A single-field edit on the keyed-state map. Captures before/after so undo
  // restores the previous value (re-flagged dirty so autosave persists it) and
  // redo re-applies; both re-schedule the autosave.
  const pushMapEdit = useCallback((id: number, patch: Partial<RowState>, dirty: Partial<RowState>) => {
    const before = states[id];
    const after = { ...before, ...patch, ...dirty } as RowState;
    setStates({ ...states, [id]: after });
    pushCommand({
      undo: () => { setStates((m) => ({ ...m, [id]: { ...before, ...dirty } as RowState })); schedule(); },
      redo: () => { setStates((m) => ({ ...m, [id]: after })); schedule(); },
    });
    schedule();
  }, [states, pushCommand, schedule]);

  const updateMaster = useCallback((entityId: number, patch: Partial<Pick<RowState, "name" | "website" | "type">>) => {
    pushMapEdit(entityId, patch, { masterDirty: true });
  }, [pushMapEdit]);

  const updateCell = useCallback((entityId: number, patch: Partial<Pick<RowState, "amount" | "activityIds">>) => {
    pushMapEdit(entityId, patch, { cellDirty: true });
  }, [pushMapEdit]);

  // Toggle a workplan activity in a contribution's multi-select set.
  const toggleActivity = useCallback((entityId: number, activityId: number) => {
    const cur = states[entityId];
    if (!cur) return;
    const has = cur.activityIds.includes(activityId);
    const activityIds = has ? cur.activityIds.filter((x) => x !== activityId) : [...cur.activityIds, activityId];
    pushMapEdit(entityId, { activityIds }, { cellDirty: true });
  }, [states, pushMapEdit]);

  // Add a blank entry: create an empty project-scoped organisation and attach it
  // to this report. The partner fills every field inline in the row below.
  const onAdd = useCallback(async () => {
    if (!reportId || !projectId) return;
    setAdding(true);
    onError(null);
    try {
      const mRes = await fetch(config.masterEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId }),
      });
      if (!mRes.ok) throw new Error(config.messages.createMaster);
      const master = await mRes.json();

      const lRes = await fetch(config.dataEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, [config.entityIdField]: master.id }),
      });
      if (!lRes.ok) throw new Error(config.messages.addLine);

      await load();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }, [reportId, projectId, config, onError, load]);

  // Remove this report's line (the organisation's records for other years are
  // left intact). Undoable: re-create the line for the still-existing entity.
  const onDelete = useCallback(async (row: MatrixRow) => {
    if (!reportId) return;
    const rid = reportId;
    const entityId = row.entityId;
    const st = states[entityId];
    const amount = st?.amount ?? "";
    const activityIds = st?.activityIds ?? [];
    const hasContent = amount || activityIds.length > 0 || row.name?.trim();
    if (hasContent && !await confirm({ message: config.deleteConfirm(row.name ?? ""), confirmLabel: "Delete" })) return;
    setDeleting(entityId);
    onError(null);
    try {
      const res = await fetch(`${config.dataEndpoint}?id=${row.currentLineId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(config.messages.deleteLine);
      await load();

      let lineId = row.currentLineId;
      pushCommand({
        undo: async () => {
          try {
            const cRes = await fetch(config.dataEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reportId: rid, [config.entityIdField]: entityId }),
            });
            if (!cRes.ok) throw new Error(config.messages.restore);
            const created = await cRes.json();
            lineId = created.id;
            if (amount || activityIds.length) {
              await fetch(config.dataEndpoint, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(cellBody(created.id, amount, activityIds)),
              });
            }
            await load();
          } catch (e) {
            onError(e instanceof Error ? e.message : config.messages.restore);
          }
        },
        redo: async () => {
          try {
            const r = await fetch(`${config.dataEndpoint}?id=${lineId}`, { method: "DELETE" });
            if (!r.ok) throw new Error(config.messages.deleteLine);
            await load();
          } catch (e) {
            onError(e instanceof Error ? e.message : config.messages.deleteLine);
          }
        },
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeleting(null);
    }
  }, [reportId, states, config, confirm, onError, load, pushCommand, cellBody]);

  return { rows, years, currentYear, activities, states, loading, adding, deleting, onAdd, onDelete, updateMaster, updateCell, toggleActivity };
}

export function ContributorMatrix(props: ContributorMatrixProps) {
  const { config } = props;
  const { rows, years, currentYear, activities, states, loading, adding, deleting, onAdd, onDelete, updateMaster, updateCell, toggleActivity } = useContributorMatrix(props);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const cellAmount = (row: MatrixRow, year: number) => {
    const raw = year === currentYear
      ? states[row.entityId]?.amount
      : row.byYear[year]?.amount;
    const v = Number(raw);
    return raw == null || raw === "" || Number.isNaN(v) ? 0 : v;
  };
  const rowSubtotal = (row: MatrixRow) => years.reduce((s, y) => s + cellAmount(row, y), 0);
  const yearTotal = (year: number) => rows.reduce((s, r) => s + cellAmount(r, year), 0);
  const grandTotal = rows.reduce((s, r) => s + rowSubtotal(r), 0);

  return (
    <div className="space-y-4">
      {/* Add a blank row — the partner fills every field inline below */}
      <div>
        <Button onClick={onAdd} disabled={adding} size="sm">
          {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{config.labels.addEntry}</>}
        </Button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {config.labels.empty}
        </div>
      ) : (
        <MatrixTableShell
          minWidth={TRANSFER_FROZEN_WIDTH}
          leadingCols={[
            { label: config.labels.identityColumn, style: tfz("org", 30) },
            { label: config.labels.websiteColumn, style: tfz("website", 30) },
            { label: config.labels.typeColumn, style: tfz("type", 30) },
          ]}
          years={years}
          currentYear={currentYear}
          subCols={[
            { label: config.labels.amountColumn, minWidth: config.labels.amountMinWidth },
            { label: config.labels.activityColumn, minWidth: config.labels.activityMinWidth },
          ]}
          trailingCols={[
            { label: config.labels.subTotalColumn, className: "px-3 py-2 text-right font-medium text-muted-foreground border-l border-b bg-neutral-100 align-bottom min-w-[150px]" },
            { className: "px-2 py-2 border-l border-b bg-neutral-100 w-12" },
          ]}
        >
            <tbody>
              {rows.map((row) => {
                const state = states[row.entityId];
                if (!state) return null;
                const dirty = state.masterDirty || state.cellDirty;
                return (
                  <tr key={row.entityId} className="align-top">
                    {/* Frozen: organisation identity (master, editable anytime) */}
                    <td style={tfz("org")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                      <div className="flex items-center gap-1">
                        <Input value={state.name} onChange={(e) => updateMaster(row.entityId, { name: e.target.value })} placeholder={config.labels.identityPlaceholder} className="text-sm h-8 flex-1" />
                        <ItemComments section={config.section} itemId={row.entityId} />
                      </div>
                    </td>
                    <td style={tfz("website")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                      <Input value={state.website} onChange={(e) => updateMaster(row.entityId, { website: e.target.value })} placeholder={config.labels.websitePlaceholder} className="text-sm h-8" />
                    </td>
                    <td style={tfz("type")} className={cn("px-2 py-1 border-r border-t bg-card", dirty && "bg-amber-50/60")}>
                      <Select value={state.type || "none"} onValueChange={(v) => updateMaster(row.entityId, { type: v === "none" ? null : v })}>
                        <SelectTrigger className="w-full h-8 px-2">
                          {state.type
                            ? (config.typeBadgeColors
                                ? <Badge colors={config.typeBadgeColors[state.type] ?? FALLBACK_COLORS}>{state.type}</Badge>
                                : <span className="truncate text-left">{state.type}</span>)
                            : <span className="text-muted-foreground">{config.labels.selectType}</span>}
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none"><span className="text-muted-foreground">{config.labels.selectType}</span></SelectItem>
                          {config.typeOptions.map((t) => (
                            <SelectItem key={t} value={t}>
                              {config.typeBadgeColors ? <Badge colors={config.typeBadgeColors[t] ?? FALLBACK_COLORS}>{t}</Badge> : t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Scrollable per-year cells */}
                    {years.map((year) => {
                      const current = year === currentYear;
                      if (current) {
                        return (
                          <Fragment key={year}>
                            <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                              <Input type="number" min={0} value={state.amount} onChange={(e) => updateCell(row.entityId, { amount: e.target.value })} placeholder={config.labels.amountPlaceholder} className="text-sm h-8 text-right tabular-nums" />
                            </td>
                            <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                              {config.activityMode === "single" ? (
                                <Select value={state.activityIds[0] != null ? String(state.activityIds[0]) : "none"} onValueChange={(v) => updateCell(row.entityId, { activityIds: v === "none" ? [] : [Number(v)] })}>
                                  <SelectTrigger className="w-full h-8 px-2">
                                    {state.activityIds[0] != null
                                      ? <span className="truncate text-left text-xs">{activityLabel(activityById.get(state.activityIds[0]))}</span>
                                      : <span className="text-muted-foreground">{config.labels.selectActivity}</span>}
                                  </SelectTrigger>
                                  <SelectContent className="max-w-[440px]">
                                    <SelectItem value="none"><span className="text-muted-foreground">{config.labels.selectActivity}</span></SelectItem>
                                    {activities.length === 0 && (
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No workplan activities yet.</div>
                                    )}
                                    {activities.map((a) => (<SelectItem key={a.id} value={String(a.id)}>{activityLabel(a)}</SelectItem>))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <button className="w-full min-h-8 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-accent/40 flex flex-col gap-0.5">
                                      {state.activityIds.length === 0
                                        ? <span className="text-muted-foreground py-0.5">{config.labels.selectActivity}</span>
                                        : state.activityIds.map((aid) => (
                                            <span key={aid} className="line-clamp-1 font-medium">{activityLabel(activityById.get(aid))}</span>
                                          ))}
                                    </button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="start" className="max-h-72 w-[380px] overflow-auto">
                                    {activities.length === 0 && (
                                      <div className="px-2 py-1.5 text-xs text-muted-foreground">No workplan activities yet.</div>
                                    )}
                                    {activities.map((a) => (
                                      <DropdownMenuCheckboxItem
                                        key={a.id}
                                        checked={state.activityIds.includes(a.id)}
                                        onCheckedChange={() => toggleActivity(row.entityId, a.id)}
                                        onSelect={(e) => e.preventDefault()}
                                        className="text-xs"
                                      >
                                        <span className="line-clamp-2">{activityLabel(a)}</span>
                                      </DropdownMenuCheckboxItem>
                                    ))}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </td>
                          </Fragment>
                        );
                      }
                      const cell = row.byYear[year];
                      return (
                        <Fragment key={year}>
                          <td className="px-2 py-2 border-l border-t text-muted-foreground text-right tabular-nums">
                            {cell?.amount != null ? formatAmount(cell.amount) : <span className="text-muted-foreground/40">—</span>}
                          </td>
                          <td className="px-2 py-2 border-t text-muted-foreground">
                            {config.activityMode === "single" ? (
                              cell != null && cell.activityIds.length > 0
                                ? <p className="line-clamp-2 text-xs">{activityLabel(activityById.get(cell.activityIds[0]))}</p>
                                : <span className="text-muted-foreground/40">—</span>
                            ) : (
                              cell && cell.activityIds.length > 0
                                ? (
                                  <div className="flex flex-col gap-0.5">
                                    {cell.activityIds.map((aid) => (
                                      <span key={aid} className="line-clamp-1 text-xs font-medium">{activityLabel(activityById.get(aid))}</span>
                                    ))}
                                  </div>
                                )
                                : <span className="text-muted-foreground/40">—</span>
                            )}
                          </td>
                        </Fragment>
                      );
                    })}

                    {/* Sub-total across all years */}
                    <td className="px-3 py-2 border-l border-t text-right font-medium tabular-nums bg-muted/20">
                      {formatAmount(rowSubtotal(row))}
                    </td>
                    <td className="px-2 py-2 border-l border-t text-center">
                      <button onClick={() => onDelete(row)} disabled={deleting === row.entityId} className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40" aria-label={config.deleteAriaLabel}>
                        {deleting === row.entityId ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-sm font-semibold">
                <td style={tfz("org", 30)} className="px-3 py-3 border-r border-t bg-neutral-100 whitespace-nowrap">{config.labels.totalColumn}</td>
                <td style={tfz("website", 30)} className="border-r border-t bg-neutral-100" />
                <td style={tfz("type", 30)} className="border-r border-t bg-neutral-100" />
                {years.map((year) => (
                  <Fragment key={year}>
                    <td className={cn("px-2 py-3 border-l border-t text-right tabular-nums", year === currentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")}>{formatAmount(yearTotal(year))}</td>
                    <td className={cn("border-t", year === currentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")} />
                  </Fragment>
                ))}
                <td className="px-3 py-3 border-l border-t text-right tabular-nums bg-neutral-100">{formatAmount(grandTotal)}</td>
                <td className="border-l border-t bg-neutral-100" />
              </tr>
            </tfoot>
        </MatrixTableShell>
      )}
    </div>
  );
}

// ── Per-section configs ──────────────────────────────────────────────────────

export const TRANSFERS_MATRIX_CONFIG: ContributorMatrixConfig = {
  section: "transfers",
  dataEndpoint: "/api/transfer-data",
  masterEndpoint: "/api/transfer-partners",
  entityIdField: "transfer_partner_id",
  identityField: "organization_name",
  typeField: "partner_type",
  amountField: "amount_transferred",
  activityField: "linked_activity_id",
  activityMode: "single",
  typeOptions: PARTNER_TYPES,
  deleteAriaLabel: "Delete transfer",
  deleteConfirm: (name) => `Delete transfer for "${name}"? You can undo this with the Undo button.`,
  messages: {
    loadFail: "Failed to load transfers",
    createMaster: "Failed to create transfer partner",
    addLine: "Failed to add transfer to report",
    deleteLine: "Failed to delete transfer",
    restore: "Failed to restore transfer",
  },
  labels: {
    addEntry: labels.transfers.addEntry,
    empty: labels.transfers.empty,
    identityColumn: labels.transfers.columns.organizationName,
    websiteColumn: labels.transfers.columns.website,
    typeColumn: labels.transfers.columns.partnerType,
    amountColumn: labels.transfers.columns.amountTransferred,
    activityColumn: labels.transfers.columns.linkedActivity,
    subTotalColumn: labels.transfers.columns.subTotal,
    totalColumn: labels.transfers.columns.total,
    selectType: labels.transfers.selectPartnerType,
    selectActivity: labels.transfers.selectActivity,
    identityPlaceholder: labels.common.placeholders.organizationName,
    websitePlaceholder: labels.common.placeholders.url,
    amountPlaceholder: labels.placeholders.transferAmount,
    amountMinWidth: "min-w-[140px]",
    activityMinWidth: "min-w-[220px]",
  },
};

export const COMPLEMENTARY_MATRIX_CONFIG: ContributorMatrixConfig = {
  section: "complementary",
  dataEndpoint: "/api/complementary-data",
  masterEndpoint: "/api/complementary-contributors",
  entityIdField: "contributor_id",
  identityField: "contributor_name",
  typeField: "funding_type",
  amountField: "contribution_amount",
  activityField: "linked_activity_ids",
  activityMode: "multi",
  typeOptions: FUNDING_TYPES,
  typeBadgeColors: FUNDING_TYPE_COLORS,
  deleteAriaLabel: "Delete contribution",
  deleteConfirm: (name) => `Delete contribution from "${name}"? You can undo this with the Undo button.`,
  messages: {
    loadFail: "Failed to load complementary funding",
    createMaster: "Failed to create contributor",
    addLine: "Failed to add contribution to report",
    deleteLine: "Failed to delete contribution",
    restore: "Failed to restore contribution",
  },
  labels: {
    addEntry: labels.complementary.addEntry,
    empty: labels.complementary.empty,
    identityColumn: labels.complementary.columns.contributorName,
    websiteColumn: labels.complementary.columns.website,
    typeColumn: labels.complementary.columns.fundingType,
    amountColumn: labels.complementary.columns.contributionAmount,
    activityColumn: labels.complementary.columns.linkedActivities,
    subTotalColumn: labels.complementary.columns.subTotal,
    totalColumn: labels.complementary.columns.total,
    selectType: labels.complementary.selectFundingType,
    selectActivity: labels.complementary.selectActivities,
    identityPlaceholder: labels.placeholders.complementaryContributorName,
    websitePlaceholder: labels.common.placeholders.url,
    amountPlaceholder: labels.placeholders.complementaryAmount,
    amountMinWidth: "min-w-[150px]",
    activityMinWidth: "min-w-[240px]",
  },
};
