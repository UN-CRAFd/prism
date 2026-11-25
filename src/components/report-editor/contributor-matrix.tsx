"use client";

import { Fragment, useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { CircleCheck, Loader2, Plus, Trash2 } from "lucide-react";
import { RequiredMark } from "@/components/ui/required-mark";
import { LoadingState } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import { MatrixTableShell } from "@/components/report-editor/matrix-table";
import { usePastYears, PastYearChips } from "@/components/report-editor/past-year-chips";
import { FALLBACK_COLORS } from "@/lib/risk";
import { optionValues } from "@/lib/options";
import { useReadOnly } from "@/components/ui/read-only-context";
import { activityLabel, formatAmount } from "@/lib/transfers";
import { numericAmount } from "@/lib/numeric-input";
import { FUNDING_TYPE_COLORS } from "@/lib/complementary";
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
// The website column is optional (config.showWebsite), so offsets are
// computed per config rather than fixed.
const TCOL_W = { org: 220, website: 170, type: 170 } as const;
type TColKey = keyof typeof TCOL_W;

function frozenLayout(showWebsite: boolean) {
  const keys: TColKey[] = showWebsite ? ["org", "website", "type"] : ["org", "type"];
  const left: Partial<Record<TColKey, number>> = {};
  let x = 0;
  for (const k of keys) { left[k] = x; x += TCOL_W[k]; }
  const tfz = (key: TColKey, z = 20): CSSProperties => {
    const w = TCOL_W[key];
    return { position: "sticky", left: left[key] ?? 0, width: w, minWidth: w, maxWidth: w, zIndex: z };
  };
  return { tfz, frozenWidth: x };
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
  showWebsite?: boolean;            // website column (default true)
  showActivities?: boolean;         // linked-activity column (default true)
  typeOptionsKey: string;           // options-registry key resolved live at render
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
    noRows: string;           // checkbox label: "nothing to report"
    noRowsConfirmed: string;  // read-only line when that box is ticked
    identityColumn: string;
    websiteColumn: string;
    typeColumn: string;
    amountColumn: string;
    activityColumn: string;
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
  // Null when this organisation exists in the project (from another year) but has
  // no line on the current report yet — created on the first current-year edit.
  currentLineId: number | null;
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
type RawRow = { currentLineId: number | null; website: string | null; byYear: Record<number, RawCell | undefined> } & Record<string, unknown>;
type MatrixResponse = { years: number[]; currentYear: number | null; rows: RawRow[]; activities: ContributorActivity[] };

interface ContributorMatrixProps {
  reportId: number;
  projectId: number | null;
  config: ContributorMatrixConfig;
  pushCommand: (cmd: HistoryCommand) => void;
  onSaveStateChange?: (s: SaveState) => void;
  onError: (msg: string | null) => void;
  // Freeze the column headers to the top while the matrix body scrolls.
  fillHeight?: boolean;
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
  // Only a NEWLY ADDED row is highlighted yellow, fading back to white after ~2 s.
  const [freshId, setFreshId] = useState<number | null>(null);
  const freshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (freshTimer.current) clearTimeout(freshTimer.current); }, []);

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

  // POST body to create the current-year line for an entity that so far only has
  // data in other years (create-on-type). Carries the just-typed amount/activities.
  const createBody = useCallback((entityId: number, amount: string, activityIds: number[]) => ({
    reportId,
    [config.entityIdField]: entityId,
    [config.amountField]: amount || null,
    [config.activityField]: config.activityMode === "single" ? (activityIds[0] ?? null) : activityIds,
  }), [reportId, config]);

  // Save every dirty master + cell. A dirty flag is only cleared if the content is
  // unchanged since the snapshot, so edits made mid-save aren't dropped.
  const flush = useCallback(async () => {
    if (!reportId) return;
    const dirtyMasters = rows.filter((r) => states[r.entityId]?.masterDirty);
    const masterSnap = new Map(dirtyMasters.map((r) => [r.entityId, JSON.stringify({ n: states[r.entityId].name, w: states[r.entityId].website, t: states[r.entityId].type })]));
    const dirtyCells = rows.filter((r) => states[r.entityId]?.cellDirty);
    const cellSnap = new Map(dirtyCells.map((r) => [r.entityId, JSON.stringify({ a: states[r.entityId].amount, l: states[r.entityId].activityIds })]));

    const ok = (r: Response) => { if (!r.ok) throw new Error(labels.common.saveFailed); };
    // Entities surfaced as prior-year context that just got a current-year edit have
    // no line yet — create one (with the typed values) before the parallel saves.
    const createdLineIds = new Map<number, number>();
    try {
      for (const r of dirtyCells) {
        if (r.currentLineId != null) continue;
        const st = states[r.entityId];
        const res = await fetch(config.dataEndpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(createBody(r.entityId, st.amount, st.activityIds)) });
        ok(res);
        const created = await res.json();
        createdLineIds.set(r.entityId, created.id as number);
      }

      await Promise.all([
        ...dirtyMasters.map((r) => {
          const st = states[r.entityId];
          return fetch(config.masterEndpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(masterBody(r.entityId, st)) }).then(ok);
        }),
        // Existing current-year lines are PATCHed; freshly-created ones were already
        // persisted with their values by the POST above, so they're skipped here.
        ...dirtyCells.filter((r) => r.currentLineId != null).map((r) => {
          const st = states[r.entityId];
          return fetch(config.dataEndpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cellBody(r.currentLineId as number, st.amount, st.activityIds)) }).then(ok);
        }),
      ]);
    } catch (e) {
      onError(e instanceof Error ? e.message : labels.common.saveFailed);
      throw e;
    }

    // Record the new line ids so the next flush PATCHes instead of re-creating.
    if (createdLineIds.size) setRows((prev) => prev.map((r) => createdLineIds.has(r.entityId) ? { ...r, currentLineId: createdLineIds.get(r.entityId)! } : r));

    if (dirtyMasters.length || dirtyCells.length) setStates((prev) => {
      const n = { ...prev };
      for (const r of dirtyMasters) { const cur = prev[r.entityId]; if (cur && JSON.stringify({ n: cur.name, w: cur.website, t: cur.type }) === masterSnap.get(r.entityId)) n[r.entityId] = { ...n[r.entityId], masterDirty: false }; }
      for (const r of dirtyCells) { const cur = prev[r.entityId]; if (cur && JSON.stringify({ a: cur.amount, l: cur.activityIds }) === cellSnap.get(r.entityId)) n[r.entityId] = { ...n[r.entityId], cellDirty: false }; }
      return n;
    });
  }, [reportId, rows, states, config, onError, masterBody, cellBody, createBody]);

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
      if (freshTimer.current) clearTimeout(freshTimer.current);
      setFreshId(master.id as number);
      freshTimer.current = setTimeout(() => setFreshId(null), 2000);
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
    // Context-only row (data only in other years, no line on this report yet):
    // there's nothing to delete server-side — just discard any un-persisted
    // current-year edit so the row reverts to read-only context.
    if (row.currentLineId == null) {
      setStates((prev) => prev[entityId]
        ? { ...prev, [entityId]: { ...prev[entityId], amount: "", activityIds: [], cellDirty: false } }
        : prev);
      return;
    }
    const currentLineId = row.currentLineId;
    const hasContent = amount || activityIds.length > 0 || row.name?.trim();
    if (hasContent && !await confirm({ message: config.deleteConfirm(row.name ?? ""), confirmLabel: "Delete" })) return;
    setDeleting(entityId);
    onError(null);
    try {
      const res = await fetch(`${config.dataEndpoint}?id=${currentLineId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(config.messages.deleteLine);
      await load();

      let lineId = currentLineId;
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

  return { rows, years, currentYear, activities, states, loading, adding, deleting, freshId, onAdd, onDelete, updateMaster, updateCell };
}

// Linked-activity picker shared by BOTH matrix modes so transfers and
// complementary render the identical control. It's a checkbox dropdown over the
// project's workplan activities: in multi mode each box toggles independently; in
// single mode picking one replaces the selection (clicking the checked box clears
// it). Selection is always the generic number[] the row state already stores, so
// the caller just persists whatever ids come back. Read-only is inherited from
// the surrounding <ReadOnlyProvider> via DropdownMenuTrigger.
export function LinkedActivityPicker({
  activities,
  activityById,
  selected,
  multiple,
  emptyLabel,
  onChange,
}: {
  activities: ContributorActivity[];
  activityById: Map<number, ContributorActivity>;
  selected: number[];
  multiple: boolean;
  emptyLabel: string;
  onChange: (ids: number[]) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="w-full min-h-8 rounded-md border bg-background px-2 py-1 text-left text-xs hover:bg-accent/40 flex flex-col gap-0.5 disabled:cursor-not-allowed disabled:opacity-50">
          {selected.length === 0
            ? <span className="text-muted-foreground py-0.5">{emptyLabel}</span>
            : selected.map((aid) => (
                <span key={aid} className="line-clamp-1 font-medium">{activityLabel(activityById.get(aid))}</span>
              ))}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[380px] overflow-auto">
        {activities.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No work plan activities yet.</div>
        )}
        {activities.map((a) => {
          const checked = selected.includes(a.id);
          return (
            <DropdownMenuCheckboxItem
              key={a.id}
              checked={checked}
              onCheckedChange={() =>
                onChange(
                  multiple
                    ? checked ? selected.filter((x) => x !== a.id) : [...selected, a.id]
                    : checked ? [] : [a.id]
                )
              }
              onSelect={multiple ? (e) => e.preventDefault() : undefined}
              className="text-xs"
            >
              <span className="line-clamp-2">{activityLabel(a)}</span>
            </DropdownMenuCheckboxItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ContributorMatrix(props: ContributorMatrixProps) {
  const { config } = props;
  const { rows, years, currentYear, activities, states, loading, adding, deleting, freshId, onAdd, onDelete, updateMaster, updateCell } = useContributorMatrix(props);
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const { pastYears, shownYears, toggleYear, visibleYears } = usePastYears(years, currentYear, config.section);
  const readOnly = useReadOnly();

  // "Nothing to report" confirmation (reports.no_*_confirmed). The section counts as
  // complete with zero rows only when it is set; the server clears it when a row is
  // added, so it is mirrored here. "Rows" = this report's own lines — a project's
  // organisations from other years are context only and don't count.
  const [noRowsConfirmed, setNoRowsConfirmed] = useState(false);
  const [noRowsSaving, setNoRowsSaving] = useState(false);
  const lineCount = rows.filter((r) => r.currentLineId != null).length;
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/report-no-rows?reportId=${props.reportId}&section=${config.section}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled && data) setNoRowsConfirmed(data.confirmed === true); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [props.reportId, config.section]);
  useEffect(() => { if (lineCount > 0) setNoRowsConfirmed(false); }, [lineCount]);

  async function setNoRows(confirmed: boolean) {
    setNoRowsSaving(true);
    props.onError(null);
    // Report through the same save-state channel the autosave uses, so the editor
    // refetches completion (submit blockers) and the sidebar tick updates.
    props.onSaveStateChange?.("saving");
    try {
      const res = await fetch("/api/report-no-rows", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: props.reportId, section: config.section, confirmed }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || labels.common.saveFailed); }
      const data = await res.json();
      setNoRowsConfirmed(data.confirmed === true);
      props.onSaveStateChange?.("saved");
    } catch (e) {
      props.onSaveStateChange?.("error");
      props.onError(e instanceof Error ? e.message : labels.common.saveFailed);
    } finally {
      setNoRowsSaving(false);
    }
  }

  if (loading) return <LoadingState />;

  const activityById = new Map(activities.map((a) => [a.id, a]));
  const showWebsite = config.showWebsite !== false;
  const showActivities = config.showActivities !== false;
  const { tfz, frozenWidth } = frozenLayout(showWebsite);
  const cellAmount = (row: MatrixRow, year: number) => {
    const raw = year === currentYear
      ? states[row.entityId]?.amount
      : row.byYear[year]?.amount;
    const v = Number(raw);
    return raw == null || raw === "" || Number.isNaN(v) ? 0 : v;
  };
  const yearTotal = (year: number) => rows.reduce((s, r) => s + cellAmount(r, year), 0);

  // Add a blank row — the partner fills every field inline in the table. Sits directly
  // under the table (the shell's `footer` slot keeps it on the card's real bottom
  // edge, gap-2 like the other tables), right-aligned, with the "nothing to report"
  // checkbox on the left while the report has no rows of its own.
  const addRow = (
    <div className="flex shrink-0 items-center justify-between gap-3">
      {lineCount === 0 && noRowsConfirmed && readOnly ? (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700">
          <CircleCheck className="size-4" />{config.labels.noRowsConfirmed}
        </span>
      ) : lineCount === 0 && !readOnly ? (
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={noRowsConfirmed}
            disabled={noRowsSaving}
            onChange={(e) => setNoRows(e.target.checked)}
            className="size-4"
          />
          {config.labels.noRows}
          {noRowsSaving && <Loader2 className="size-3.5 animate-spin" />}
        </label>
      ) : <span />}
      <Button variant="add" onClick={onAdd} disabled={adding} size="sm" className="gap-1">
        {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4" />{config.labels.addEntry}</>}
      </Button>
    </div>
  );

  return (
    <div className={cn("space-y-4", props.fillHeight && "flex flex-col flex-1 min-h-0 space-y-0 gap-4")}>
      <div className="flex items-center gap-4 flex-wrap">
        <PastYearChips pastYears={pastYears} shownYears={shownYears} onToggle={toggleYear} />
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col gap-2">
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {config.labels.empty}
          </div>
          {addRow}
        </div>
      ) : (
        <MatrixTableShell
          fillHeight={props.fillHeight}
          hugContent
          footer={addRow}
          minWidth={frozenWidth}
          leadingCols={[
            { label: <>{config.labels.identityColumn}<RequiredMark /></>, style: tfz("org", 30) },
            ...(showWebsite ? [{ label: config.labels.websiteColumn, style: tfz("website", 30) }] : []),
            { label: config.labels.typeColumn, style: tfz("type", 30) },
          ]}
          years={visibleYears}
          currentYear={currentYear}
          subCols={[
            { label: <>{config.labels.amountColumn}<RequiredMark /></>, minWidth: config.labels.amountMinWidth },
            ...(showActivities ? [{ label: config.labels.activityColumn, minWidth: config.labels.activityMinWidth }] : []),
          ]}
          pastSubCols={[
            { label: config.labels.amountColumn, minWidth: "min-w-[110px]" },
          ]}
          trailingCols={[
            { className: "px-2 py-2 border-l border-b bg-neutral-100 w-12" },
          ]}
        >
            <tbody>
              {rows.map((row) => {
                const state = states[row.entityId];
                if (!state) return null;
                return (
                  <tr key={row.entityId} className="align-top">
                    {/* Frozen: organisation identity (master, editable anytime) */}
                    <td style={tfz("org")} className={cn("px-2 py-1 border-r border-t bg-card transition-colors duration-700", freshId === row.entityId && "bg-crafd-yellow-100")}>
                      <div className="flex items-center gap-1">
                        <Input value={state.name} onChange={(e) => updateMaster(row.entityId, { name: e.target.value })} placeholder={config.labels.identityPlaceholder} className="text-sm h-8 flex-1" />
                        <ItemComments section={config.section} itemId={row.entityId} />
                      </div>
                    </td>
                    {showWebsite && (
                      <td style={tfz("website")} className={cn("px-2 py-1 border-r border-t bg-card transition-colors duration-700", freshId === row.entityId && "bg-crafd-yellow-100")}>
                        <Input value={state.website} onChange={(e) => updateMaster(row.entityId, { website: e.target.value })} placeholder={config.labels.websitePlaceholder} className="text-sm h-8" />
                      </td>
                      )}
                    <td style={tfz("type")} className={cn("px-2 py-1 border-r border-t bg-card transition-colors duration-700", freshId === row.entityId && "bg-crafd-yellow-100")}>
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
                          {optionValues(config.typeOptionsKey).map((t) => (
                            <SelectItem key={t} value={t}>
                              {config.typeBadgeColors ? <Badge colors={config.typeBadgeColors[t] ?? FALLBACK_COLORS}>{t}</Badge> : t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>

                    {/* Scrollable per-year cells */}
                    {visibleYears.map((year) => {
                      const current = year === currentYear;
                      if (current) {
                        const cellKey = `${row.entityId}-${year}`;
                        const focused = focusedCellKey === cellKey;
                        const parsed = parseFloat(state.amount);
                        return (
                          <Fragment key={year}>
                            <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={focused ? state.amount : (state.amount.trim() !== "" && !isNaN(parsed) ? formatAmount(parsed) : state.amount)}
                                onChange={(e) => updateCell(row.entityId, { amount: numericAmount(e.target.value) })}
                                onFocus={() => setFocusedCellKey(cellKey)}
                                onBlur={() => {
                                  setFocusedCellKey(null);
                                  if (state.amount.trim() !== "" && !isNaN(parsed)) {
                                    updateCell(row.entityId, { amount: String(parsed) });
                                  }
                                }}
                                placeholder={config.labels.amountPlaceholder}
                                className="text-sm h-8 text-right tabular-nums"
                              />
                            </td>
                            {showActivities && (
                              <td className="px-1 py-1 border-t bg-crafd-yellow/10">
                                <LinkedActivityPicker
                                  activities={activities}
                                  activityById={activityById}
                                  selected={state.activityIds}
                                  multiple={config.activityMode === "multi"}
                                  emptyLabel={config.labels.selectActivity}
                                  onChange={(ids) => updateCell(row.entityId, { activityIds: ids })}
                                />
                              </td>
                              )}
                          </Fragment>
                        );
                      }
                      const cell = row.byYear[year];
                      return (
                        <td key={year} className="px-2 py-2 border-l border-t text-muted-foreground text-right tabular-nums bg-neutral-50 opacity-60">
                          {cell?.amount != null ? formatAmount(cell.amount) : <span className="text-muted-foreground/40">—</span>}
                        </td>
                      );
                    })}

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
                {showWebsite && <td style={tfz("website", 30)} className="border-r border-t bg-neutral-100" />}
                <td style={tfz("type", 30)} className="border-r border-t bg-neutral-100" />
                {visibleYears.map((year) => {
                  if (year === currentYear) {
                    return (
                      <Fragment key={year}>
                        <td className="px-2 py-3 border-l border-t text-right tabular-nums bg-crafd-yellow/20">{formatAmount(yearTotal(year))}</td>
                        {showActivities && <td className="border-t bg-crafd-yellow/20" />}
                      </Fragment>
                    );
                  }
                  return (
                    <td key={year} className="px-2 py-3 border-l border-t text-right tabular-nums bg-neutral-100 opacity-60">{formatAmount(yearTotal(year))}</td>
                  );
                })}
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
  activityField: "linked_activity_ids",
  activityMode: "multi",
  typeOptionsKey: "transferPartnerType",
  // Transfers only ask who received the money and how much.
  showWebsite: false,
  showActivities: false,
  deleteAriaLabel: "Delete transfer",
  deleteConfirm: (name) => `Delete transfer for "${name}"?`,
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
    noRows: labels.transfers.noRows,
    noRowsConfirmed: labels.transfers.noRowsConfirmed,
    identityColumn: labels.transfers.columns.organizationName,
    websiteColumn: labels.transfers.columns.website,
    typeColumn: labels.transfers.columns.partnerType,
    amountColumn: labels.transfers.columns.amountTransferred,
    activityColumn: labels.transfers.columns.linkedActivities,
    totalColumn: labels.transfers.columns.total,
    selectType: labels.transfers.selectPartnerType,
    selectActivity: labels.transfers.selectActivities,
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
  typeOptionsKey: "complementaryFundingType",
  typeBadgeColors: FUNDING_TYPE_COLORS,
  deleteAriaLabel: "Delete contribution",
  deleteConfirm: (name) => `Delete contribution from "${name}"?`,
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
    noRows: labels.complementary.noRows,
    noRowsConfirmed: labels.complementary.noRowsConfirmed,
    identityColumn: labels.complementary.columns.contributorName,
    websiteColumn: labels.complementary.columns.website,
    typeColumn: labels.complementary.columns.fundingType,
    amountColumn: labels.complementary.columns.contributionAmount,
    activityColumn: labels.complementary.columns.linkedActivities,
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
