"use client";

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, Check, FileQuestion, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import {
  WORKPLAN_STATUSES,
  WORKPLAN_STATUS_COLORS,
  quarterRange,
  groupQuartersByYear,
  type WorkplanStatus,
} from "@/lib/workplan";

// ── Shared types ─────────────────────────────────────────────────────────────

interface Activity {
  id: number;
  outcome: string | null;
  objective_num: string | null;
  objective_text: string | null;
  activity_num: string | null;
  activity_text: string | null;
  implementing_agent: string | null;
  planned_quarters: string[];
  sort_order: number;
  // partner GET only:
  entry_id?: number | null;
  updated_quarters?: string[] | null;
  status?: string | null;
  comment?: string | null;
}

interface Range {
  start: string | null;
  end: string | null;
}

export interface WorkplanHandle {
  save: () => Promise<void>;
}

// ── Shared bits ────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: WorkplanStatus }) {
  const c = WORKPLAN_STATUS_COLORS[value];
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", c.bg, c.text, c.border)}>
      {value}
    </span>
  );
}

// A single quarter cell: filled check when set. Read-only (baseline) or toggle.
function QuarterCell({
  checked,
  variant,
  onToggle,
}: {
  checked: boolean;
  variant: "baseline" | "editable";
  onToggle?: () => void;
}) {
  const box = (
    <span
      className={cn(
        "inline-flex size-5 items-center justify-center rounded border",
        checked
          ? variant === "baseline"
            ? "bg-neutral-300 border-neutral-300 text-neutral-600"
            : "bg-crafd-yellow border-crafd-yellow text-black"
          : "border-neutral-300 bg-white text-transparent"
      )}
    >
      <Check className="size-3.5" strokeWidth={3} />
    </span>
  );
  if (variant === "baseline" || !onToggle) {
    return <div className="flex justify-center">{box}</div>;
  }
  return (
    <button type="button" onClick={onToggle} className="flex w-full justify-center" aria-pressed={checked}>
      {box}
    </button>
  );
}

// Two-row year/quarter header shared by both grids.
function QuarterHeader({ quarters, leadCols, trailCols }: { quarters: string[]; leadCols: ReactNode; trailCols: ReactNode }) {
  const groups = groupQuartersByYear(quarters);
  return (
    <thead>
      <tr className="border-b bg-muted/40">
        {leadCols}
        {groups.map((g) => (
          <th key={g.year} colSpan={g.quarters.length} className="px-1 py-2 text-center text-xs font-semibold border-l">
            {g.year}
          </th>
        ))}
        {trailCols}
      </tr>
      <tr className="border-b bg-muted/20">
        {groups.map((g) =>
          g.quarters.map((q, i) => (
            <th key={q.key} className={cn("px-1 py-1 text-center text-[11px] font-medium text-muted-foreground w-9", i === 0 && "border-l")}>
              {q.q}
            </th>
          ))
        )}
      </tr>
    </thead>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Partner editor — check off the timeline + report progress for one report.
// Save is driven by the parent page's top-bar button via a ref.
// ═══════════════════════════════════════════════════════════════════════════

interface PartnerRowState {
  updated_quarters: string[];
  status: WorkplanStatus | null;
  comment: string;
  dirty: boolean;
}

export const WorkplanPartnerEditor = forwardRef<
  WorkplanHandle,
  {
    reportId: number;
    onDirtyChange?: (dirty: boolean) => void;
    onLoadingChange?: (loading: boolean) => void;
  }
>(function WorkplanPartnerEditor({ reportId, onDirtyChange, onLoadingChange }, ref) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [range, setRange] = useState<Range>({ start: null, end: null });
  const [states, setStates] = useState<Record<number, PartnerRowState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workplan?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load workplan");
      const data: { range: Range; activities: Activity[] } = await res.json();
      setRange(data.range);
      setActivities(data.activities);
      const next: Record<number, PartnerRowState> = {};
      for (const a of data.activities) {
        next[a.id] = {
          // Default the updated timeline to the baseline until the partner adjusts it.
          updated_quarters: a.updated_quarters ?? a.planned_quarters ?? [],
          status: (a.status as WorkplanStatus) ?? null,
          comment: a.comment ?? "",
          dirty: false,
        };
      }
      setStates(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { onLoadingChange?.(loading); }, [loading, onLoadingChange]);

  const quarters = useMemo(() => quarterRange(range.start, range.end), [range]);
  const anyDirty = useMemo(() => Object.values(states).some((s) => s.dirty), [states]);

  useEffect(() => { onDirtyChange?.(anyDirty); }, [anyDirty, onDirtyChange]);

  function update(id: number, patch: Partial<PartnerRowState>) {
    setStates((prev) => ({ ...prev, [id]: { ...prev[id], ...patch, dirty: true } }));
  }

  function toggleQuarter(id: number, key: string) {
    const cur = states[id]?.updated_quarters ?? [];
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    update(id, { updated_quarters: next });
  }

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const dirtyIds = activities.filter((a) => states[a.id]?.dirty).map((a) => a.id);
        await Promise.all(
          dirtyIds.map((id) => {
            const s = states[id];
            return fetch("/api/workplan", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                reportId,
                activityId: id,
                updated_quarters: s.updated_quarters,
                status: s.status,
                comment: s.comment || null,
              }),
            }).then((r) => { if (!r.ok) throw new Error(`Failed to save activity ${id}`); });
          })
        );
        setStates((prev) => {
          const n = { ...prev };
          for (const id of dirtyIds) n[id] = { ...n[id], dirty: false };
          return n;
        });
      },
    }),
    [activities, states, reportId]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  }

  if (!quarters.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">The workplan timeline has not been configured for this project yet.</p>
      </div>
    );
  }

  if (!activities.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">No workplan activities have been defined for this project yet.</p>
      </div>
    );
  }

  let lastOutcome: string | null = null;
  let lastObjective: string | null = null;
  const totalCols = 2 + quarters.length + 3;

  return (
    <div className="rounded-xl border bg-card overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <QuarterHeader
          quarters={quarters}
          leadCols={
            <>
              <th rowSpan={2} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[280px] align-bottom">Activity</th>
              <th rowSpan={2} className="text-left px-2 py-2 text-xs font-medium text-muted-foreground min-w-[100px] align-bottom">Timeline</th>
            </>
          }
          trailCols={
            <>
              <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[120px] align-bottom">Agent</th>
              <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[110px] align-bottom">Progress update</th>
              <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[200px] align-bottom">Comment</th>
            </>
          }
        />
        <tbody>
          {activities.map((a) => {
            const s = states[a.id];
            if (!s) return null;
            const showOutcome = a.outcome && a.outcome !== lastOutcome;
            if (a.outcome) lastOutcome = a.outcome;
            const objKey = `${a.objective_num ?? ""}|${a.objective_text ?? ""}`;
            const showObjective = objKey.trim() !== "|" && objKey !== lastObjective;
            if (objKey.trim() !== "|") lastObjective = objKey;

            return (
              <Fragment key={a.id}>
                {showOutcome && (
                  <tr className="bg-neutral-100 border-y">
                    <td colSpan={totalCols} className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-700">{a.outcome}</td>
                  </tr>
                )}
                {showObjective && (
                  <tr className="bg-blue-50/60 border-y">
                    <td colSpan={totalCols} className="px-3 py-1.5 text-sm font-semibold text-blue-900">
                      {a.objective_num ? `Objective ${a.objective_num}: ` : ""}{a.objective_text}
                    </td>
                  </tr>
                )}

                {/* Baseline row */}
                <tr className={cn("border-t", s.dirty && "bg-amber-50/40")}>
                  <td rowSpan={2} className="px-3 py-2 align-top border-r">
                    <p className="text-sm font-medium leading-snug">
                      {a.activity_num ? <span className="text-muted-foreground mr-1">{a.activity_num}</span> : null}
                      {a.activity_text}
                    </p>
                  </td>
                  <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap">Baseline</td>
                  {quarters.map((q, i) => (
                    <td key={q} className={cn("px-1 py-1.5", i === 0 && "border-l")}>
                      <QuarterCell checked={(a.planned_quarters ?? []).includes(q)} variant="baseline" />
                    </td>
                  ))}
                  <td rowSpan={2} className="px-2 py-2 text-xs align-middle border-l text-muted-foreground">{a.implementing_agent ?? "—"}</td>
                  <td rowSpan={2} className="px-2 py-2 align-top border-l w-[100px]">
                    <Select value={s.status ?? "none"} onValueChange={(v) => update(a.id, { status: v === "none" ? null : (v as WorkplanStatus) })}>
                      <SelectTrigger className="h-8 px-1 w-[140px]">
                        {s.status ? <StatusBadge value={s.status} /> : <span className="text-muted-foreground text-sm">—</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                        {WORKPLAN_STATUSES.map((st) => (
                          <SelectItem key={st} value={st}><StatusBadge value={st} /></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td rowSpan={2} className="px-2 py-2 align-middle border-l">
                    <Textarea
                      value={s.comment}
                      onChange={(e) => update(a.id, { comment: e.target.value })}
                      placeholder="Add a progress note…"
                      className="text-xs min-h-[56px] resize-y"
                    />
                  </td>
                </tr>

                {/* Updated (editable) row */}
                <tr className={cn("border-b", s.dirty && "bg-amber-50/40")}>
                  <td className="px-2 py-2 text-[11px] font-medium text-neutral-700 whitespace-nowrap">Updated</td>
                  {quarters.map((q, i) => (
                    <td key={q} className={cn("px-1 py-1.5", i === 0 && "border-l")}>
                      <QuarterCell checked={s.updated_quarters.includes(q)} variant="editable" onToggle={() => toggleQuarter(a.id, q)} />
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
// Admin editor — define the activity hierarchy + baseline timeline.
// Organised by objective section; every change auto-saves.
// ═══════════════════════════════════════════════════════════════════════════

interface AdminRow {
  key: number; // stable client id
  id: number | null;
  clusterId: number; // stable client-side grouping for the outcome level
  sectionId: number; // stable client-side grouping for the objective level
  outcome: string;
  objective_num: string;
  objective_text: string;
  activity_num: string;
  activity_text: string;
  implementing_agent: string;
  planned_quarters: string[];
  sort_order: number;
  dirty: boolean;
  rev: number; // bumped on every edit; guards against clearing dirty over a newer edit
}

// When `reportId` is supplied the editor doubles as the partner view: alongside
// the (project-level) structure it also renders and auto-saves each report's
// progress — the updated timeline, status and comment held in workplan_entries.
interface ProgressState {
  updated_quarters: string[];
  status: WorkplanStatus | null;
  comment: string;
}

export function WorkplanAdminEditor({ projectId, defaultAgent, reportId, onSaveStateChange }: { projectId: number; defaultAgent?: string | null; reportId?: number; onSaveStateChange?: (s: SaveState) => void }) {
  const partnerMode = reportId != null;

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [collapsedClusters, setCollapsedClusters] = useState<Record<number, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Report the autosave state up so a parent (the partner editor) can render a
  // single shared indicator instead of the inline one below.
  useEffect(() => { onSaveStateChange?.(saveState); }, [saveState, onSaveStateChange]);

  // Per-report progress (partner mode only), keyed by activity id.
  const [progress, setProgress] = useState<Record<number, ProgressState>>({});
  const progressRef = useRef<Record<number, ProgressState>>({});
  const progressDirtyRef = useRef<Set<number>>(new Set());
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushProgressRef = useRef<() => void>(() => {});
  useEffect(() => { progressRef.current = progress; }, [progress]);

  const keyRef = useRef(0);
  const sectionIdRef = useRef(0);
  const clusterIdRef = useRef(0);
  const rowsRef = useRef<AdminRow[]>([]);
  const idByKeyRef = useRef<Map<number, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});
  const scheduleFlushRef = useRef<() => void>(() => {});
  const normalizeRef = useRef<(list: AdminRow[]) => AdminRow[]>((l) => l);

  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Partner mode loads via /api/workplan so the response carries both the
      // project structure and this report's progress entries in one shot.
      const res = await fetch(
        partnerMode ? `/api/workplan?reportId=${reportId}` : `/api/workplan-activities?projectId=${projectId}`
      );
      if (!res.ok) throw new Error("Failed to load workplan structure");
      const data: { range: Range; activities: Activity[] } = await res.json();
      setStart(data.range.start);
      setEnd(data.range.end);

      if (partnerMode) {
        const prog: Record<number, ProgressState> = {};
        for (const a of data.activities) {
          prog[a.id] = {
            // Default the updated timeline to the baseline until the partner adjusts it.
            updated_quarters: a.updated_quarters ?? a.planned_quarters ?? [],
            status: (a.status as WorkplanStatus) ?? null,
            comment: a.comment ?? "",
          };
        }
        setProgress(prog);
      }

      // Group consecutive rows by outcome (cluster) then by
      // objective (section). A cluster boundary always starts a new section.
      let sid = 0;
      let cid = 0;
      let prevObjKey: string | null = null;
      let prevInter: string | null = null;
      const mapped: AdminRow[] = data.activities.map((a, i) => {
        const inter = a.outcome ?? "";
        if (inter !== prevInter) { cid++; prevInter = inter; prevObjKey = null; }
        const gk = `${a.objective_num ?? ""}|${a.objective_text ?? ""}`;
        if (gk !== prevObjKey) { sid++; prevObjKey = gk; }
        return {
          key: i + 1,
          id: a.id,
          clusterId: cid,
          sectionId: sid,
          outcome: inter,
          objective_num: a.objective_num ?? "",
          objective_text: a.objective_text ?? "",
          activity_num: a.activity_num ?? "",
          activity_text: a.activity_text ?? "",
          implementing_agent: a.implementing_agent ?? "",
          planned_quarters: a.planned_quarters ?? [],
          sort_order: i,
          dirty: false,
          rev: 0,
        };
      });
      keyRef.current = data.activities.length;
      sectionIdRef.current = sid;
      clusterIdRef.current = cid;
      idByKeyRef.current = new Map(mapped.filter((r) => r.id != null).map((r) => [r.key, r.id as number]));
      // Reconcile numbering with position; persist any drift from older/manual data.
      const numbered = normalizeRef.current(mapped);
      setRows(numbered);
      if (numbered.some((r) => r.dirty)) scheduleFlushRef.current();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId, partnerMode, reportId]);

  useEffect(() => { load(); }, [load]);

  const quarters = useMemo(() => quarterRange(start, end), [start, end]);

  // ── Per-report progress auto-save (partner mode) ──────────────────────────

  const flushProgress = useCallback(async () => {
    if (!partnerMode) return;
    const ids = Array.from(progressDirtyRef.current);
    if (!ids.length) return;
    progressDirtyRef.current.clear();
    setSaveState("saving");
    try {
      await Promise.all(
        ids.map((activityId) => {
          const s = progressRef.current[activityId];
          if (!s) return Promise.resolve();
          return fetch("/api/workplan", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reportId,
              activityId,
              updated_quarters: s.updated_quarters,
              status: s.status,
              comment: s.comment || null,
            }),
          }).then((r) => { if (!r.ok) throw new Error(`Failed to save progress ${activityId}`); });
        })
      );
      setSaveState("saved");
    } catch (e) {
      // Re-queue the failed ids so the next change retries them.
      ids.forEach((id) => progressDirtyRef.current.add(id));
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveState("error");
    }
  }, [partnerMode, reportId]);
  flushProgressRef.current = flushProgress;

  const scheduleProgressFlush = useCallback(() => {
    setSaveState("saving");
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = setTimeout(() => { flushProgressRef.current(); }, 700);
  }, []);

  function updateProgress(activityId: number, patch: Partial<ProgressState>) {
    setProgress((prev) => {
      const base: ProgressState = prev[activityId] ?? { updated_quarters: [], status: null, comment: "" };
      return { ...prev, [activityId]: { ...base, ...patch } };
    });
    progressDirtyRef.current.add(activityId);
    scheduleProgressFlush();
  }

  function toggleUpdatedQuarter(activityId: number, q: string) {
    const cur = progressRef.current[activityId]?.updated_quarters ?? [];
    updateProgress(activityId, { updated_quarters: cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q] });
  }

  // ── Auto-save ─────────────────────────────────────────────────────────────

  const flush = async () => {
    if (savingRef.current) { pendingRef.current = true; return; }
    savingRef.current = true;
    setSaveState("saving");
    try {
      for (const row of rowsRef.current) {
        // Prefer an id already minted for this key (a POST that React hasn't committed yet)
        // so a re-entrant flush never creates the same activity twice.
        const effectiveId = row.id ?? idByKeyRef.current.get(row.key) ?? null;
        const savedRev = row.rev;
        const payload = {
          outcome: row.outcome || null,
          objective_num: row.objective_num || null,
          objective_text: row.objective_text || null,
          activity_num: row.activity_num || null,
          activity_text: row.activity_text || null,
          implementing_agent: row.implementing_agent || null,
          planned_quarters: row.planned_quarters,
          sort_order: row.sort_order,
        };
        // Only clear dirty if the row hasn't been edited again since we snapshotted it.
        const clearIfUnchanged = (r: AdminRow, extra: Partial<AdminRow>) =>
          r.key === row.key ? { ...r, ...extra, dirty: r.rev === savedRev ? false : r.dirty } : r;

        if (effectiveId === null) {
          const res = await fetch("/api/workplan-activities", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectId, ...payload }),
          });
          if (!res.ok) throw new Error("Failed to create activity");
          const saved: Activity = await res.json();
          idByKeyRef.current.set(row.key, saved.id);
          setRows((prev) => prev.map((r) => clearIfUnchanged(r, { id: saved.id })));
        } else if (row.dirty) {
          const res = await fetch("/api/workplan-activities", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: effectiveId, ...payload }),
          });
          if (!res.ok) throw new Error(`Failed to save activity ${effectiveId}`);
          setRows((prev) => prev.map((r) => clearIfUnchanged(r, { id: effectiveId })));
        }
      }
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaveState("error");
    } finally {
      savingRef.current = false;
      // Re-run through the debounce so React has committed the ids/dirty flags first.
      if (pendingRef.current) { pendingRef.current = false; scheduleFlushRef.current(); }
    }
  };
  flushRef.current = flush;

  const scheduleFlush = useCallback(() => {
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flushRef.current(); }, 700);
  }, []);
  scheduleFlushRef.current = scheduleFlush;

  // Flush any pending edits on unmount so nothing is lost.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rowsRef.current.some((r) => r.dirty || r.id === null)) flushRef.current();
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      if (progressDirtyRef.current.size) flushProgressRef.current();
    };
  }, []);

  // Keep sort_order + numbering aligned with array position; mark changed rows dirty.
  // Objectives are numbered by section order (1, 2, …); activities as "<objective>.<n>".
  function normalize(list: AdminRow[]): AdminRow[] {
    let objOrdinal = 0;
    let lastSection: number | null = null;
    let activityCount = 0;
    return list.map((r, i) => {
      if (r.sectionId !== lastSection) { objOrdinal++; lastSection = r.sectionId; activityCount = 0; }
      activityCount++;
      const objective_num = String(objOrdinal);
      const activity_num = `${objOrdinal}.${activityCount}`;
      if (r.sort_order === i && r.objective_num === objective_num && r.activity_num === activity_num) return r;
      return { ...r, sort_order: i, objective_num, activity_num, dirty: true, rev: r.rev + 1 };
    });
  }
  normalizeRef.current = normalize;

  // ── Mutations ───────────────────────────────────────────────────────────

  function updateRow(key: number, patch: Partial<AdminRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, dirty: true, rev: r.rev + 1 } : r)));
    scheduleFlush();
  }

  function toggleQuarter(key: number, q: string) {
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        const has = r.planned_quarters.includes(q);
        return { ...r, planned_quarters: has ? r.planned_quarters.filter((x) => x !== q) : [...r.planned_quarters, q], dirty: true, rev: r.rev + 1 };
      })
    );
    scheduleFlush();
  }

  function updateSection(sectionId: number, patch: { objective_num?: string; objective_text?: string }) {
    setRows((prev) => prev.map((r) => (r.sectionId === sectionId ? { ...r, ...patch, dirty: true, rev: r.rev + 1 } : r)));
    scheduleFlush();
  }

  // Rename an outcome cluster — the heading is stored on every
  // activity row in the cluster (workplan_activities.outcome).
  function updateCluster(clusterId: number, v: string) {
    setRows((prev) => prev.map((r) => (r.clusterId === clusterId ? { ...r, outcome: v, dirty: true, rev: r.rev + 1 } : r)));
    scheduleFlush();
  }

  function addActivity(sectionId: number) {
    setRows((prev) => {
      const section = prev.filter((r) => r.sectionId === sectionId);
      const template = section[0];
      const lastIdx = prev.map((r) => r.sectionId).lastIndexOf(sectionId);
      const newRow: AdminRow = {
        key: ++keyRef.current,
        id: null,
        clusterId: template?.clusterId ?? 0,
        sectionId,
        outcome: template?.outcome ?? "",
        objective_num: template?.objective_num ?? "",
        objective_text: template?.objective_text ?? "",
        activity_num: "",
        activity_text: "",
        implementing_agent: defaultAgent ?? "",
        planned_quarters: [],
        sort_order: 0,
        dirty: true,
        rev: 0,
      };
      const next = [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)];
      return normalize(next);
    });
    scheduleFlush();
  }

  // Add a new objective within a specific outcome cluster.
  function addObjective(clusterId: number) {
    setRows((prev) => {
      const cluster = prev.filter((r) => r.clusterId === clusterId);
      const template = cluster[0];
      const lastIdx = prev.map((r) => r.clusterId).lastIndexOf(clusterId);
      const newRow: AdminRow = {
        key: ++keyRef.current,
        id: null,
        clusterId,
        sectionId: ++sectionIdRef.current,
        outcome: template?.outcome ?? "",
        objective_num: "",
        objective_text: "",
        activity_num: "",
        activity_text: "",
        implementing_agent: defaultAgent ?? "",
        planned_quarters: [],
        sort_order: 0,
        dirty: true,
        rev: 0,
      };
      const next = lastIdx >= 0 ? [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)] : [...prev, newRow];
      return normalize(next);
    });
    scheduleFlush();
  }

  // Add a new outcome cluster, seeded with one empty objective.
  function addOutcome() {
    setRows((prev) => {
      const newRow: AdminRow = {
        key: ++keyRef.current,
        id: null,
        clusterId: ++clusterIdRef.current,
        sectionId: ++sectionIdRef.current,
        outcome: "",
        objective_num: "",
        objective_text: "",
        activity_num: "",
        activity_text: "",
        implementing_agent: defaultAgent ?? "",
        planned_quarters: [],
        sort_order: 0,
        dirty: true,
        rev: 0,
      };
      return normalize([...prev, newRow]);
    });
    scheduleFlush();
  }

  async function deleteActivity(key: number) {
    const row = rowsRef.current.find((r) => r.key === key);
    const hasContent = row && (row.activity_text?.trim() || row.implementing_agent?.trim());
    if (hasContent && !confirm("Delete this activity? This cannot be undone.")) return;
    if (row?.id != null) await fetch(`/api/workplan-activities?id=${row.id}`, { method: "DELETE" });
    setRows((prev) => normalize(prev.filter((r) => r.key !== key)));
    scheduleFlush();
  }

  async function deleteObjective(sectionId: number) {
    const activities = rowsRef.current.filter((r) => r.sectionId === sectionId);
    const count = activities.length;
    const label = count === 1 ? "1 activity" : `${count} activities`;
    if (!confirm(`Delete this Objective and its ${label}? This cannot be undone.`)) return;
    const ids = activities.filter((r) => r.id != null).map((r) => r.id);
    await Promise.all(ids.map((id) => fetch(`/api/workplan-activities?id=${id}`, { method: "DELETE" })));
    setRows((prev) => normalize(prev.filter((r) => r.sectionId !== sectionId)));
    scheduleFlush();
  }

  async function deleteCluster(clusterId: number) {
    const activities = rowsRef.current.filter((r) => r.clusterId === clusterId);
    const count = activities.length;
    const label = count === 1 ? "1 activity" : `${count} activities`;
    if (!confirm(`Delete this Outcome and all its Objectives and ${label}? This cannot be undone.`)) return;
    const ids = activities.filter((r) => r.id != null).map((r) => r.id);
    await Promise.all(ids.map((id) => fetch(`/api/workplan-activities?id=${id}`, { method: "DELETE" })));
    setRows((prev) => normalize(prev.filter((r) => r.clusterId !== clusterId)));
    scheduleFlush();
  }


  // ── Derive sections for render ────────────────────────────────────────────

  const clusters = useMemo(() => {
    type Section = { sectionId: number; objective_num: string; objective_text: string; rows: AdminRow[] };
    const out: { clusterId: number; outcome: string; sections: Section[] }[] = [];
    for (const r of rows) {
      let cluster = out[out.length - 1];
      if (!cluster || cluster.clusterId !== r.clusterId) {
        cluster = { clusterId: r.clusterId, outcome: r.outcome, sections: [] };
        out.push(cluster);
      }
      let sec = cluster.sections[cluster.sections.length - 1];
      if (!sec || sec.sectionId !== r.sectionId) {
        sec = { sectionId: r.sectionId, objective_num: r.objective_num, objective_text: r.objective_text, rows: [] };
        cluster.sections.push(sec);
      }
      sec.rows.push(r);
    }
    return out;
  }, [rows]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    );
  }

  // Columns: [activity] (+[timeline label] in partner mode) + quarters + [agent]
  // (+[status]+[comment] in partner mode) + [delete].
  const totalCols = partnerMode ? 2 + quarters.length + 4 : 1 + quarters.length + 2;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>
      )}

      {/* Autosave status — only when no parent renders a shared indicator */}
      {!onSaveStateChange && (
        <div className="flex justify-end mb-0">
          <AutosaveIndicator state={saveState} />
        </div>
      )}

      {/* Outcomes → objectives → activities */}
      {quarters.length === 0 && (
        <p className="text-sm text-muted-foreground">Set the timeline range above to enable quarter selection.</p>
      )}

      {clusters.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No outcomes yet. Add one to start building the workplan.
        </div>
      ) : (
        <div className="rounded-xl border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <QuarterHeader
              quarters={quarters}
              leadCols={
                <>
                  <th rowSpan={2} className="text-left px-3 py-2 text-xs font-medium text-muted-foreground min-w-[320px] align-bottom">Activity</th>
                  {partnerMode && <th rowSpan={2} className="text-left px-2 py-2 text-xs font-medium text-muted-foreground min-w-[100px] align-bottom">Timeline</th>}
                </>
              }
              trailCols={
                <>
                  <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[120px] align-bottom">Agent</th>
                  {partnerMode && <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[110px] align-bottom">Progress update</th>}
                  {partnerMode && <th rowSpan={2} className="px-2 py-2 text-xs font-medium text-muted-foreground border-l min-w-[200px] align-bottom">Comment</th>}
                  <th rowSpan={2} className="px-2 py-2 w-10 align-bottom" />
                </>
              }
            />
            <tbody>
              {clusters.map((cluster, ci) => (
                <Fragment key={cluster.clusterId}>
                  {/* Outcome cluster header — top level of the hierarchy */}
                  <tr className="bg-neutral-800 text-white">
                    <td colSpan={totalCols} className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCollapsedClusters((p) => ({ ...p, [cluster.clusterId]: !p[cluster.clusterId] }))}
                          className="shrink-0 text-white/70 hover:text-white transition-colors"
                          aria-label={collapsedClusters[cluster.clusterId] ? "Expand outcome" : "Collapse outcome"}
                        >
                          {collapsedClusters[cluster.clusterId] ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                        <span className="rounded bg-white/15 px-2 py-0.5 text-xs font-bold uppercase tracking-wider shrink-0">Outcome {ci + 1}</span>
                        <Input
                          value={cluster.outcome}
                          onChange={(e) => updateCluster(cluster.clusterId, e.target.value)}
                          placeholder="Outcome heading…"
                          className="h-7 flex-1 text-sm bg-white text-neutral-900 placeholder:text-neutral-400"
                        />
                        <Button onClick={() => addObjective(cluster.clusterId)} variant="secondary" size="sm" className="h-7 shrink-0 gap-1">
                          <Plus className="size-3.5" /> Objective
                        </Button>
                        <button
                          onClick={() => deleteCluster(cluster.clusterId)}
                          className="text-white/60 hover:text-red-300 transition-colors shrink-0"
                          aria-label="Delete outcome"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {!collapsedClusters[cluster.clusterId] && cluster.sections.map((sec) => (
                    <Fragment key={sec.sectionId}>
                  <tr className="bg-blue-50/70 border-b">
                    <td colSpan={totalCols} className="py-2 pl-8 pr-3">
                      <div className="flex items-center gap-2 border-l-2 border-blue-300 pl-3">
                        <button
                          type="button"
                          onClick={() => setCollapsedSections((p) => ({ ...p, [sec.sectionId]: !p[sec.sectionId] }))}
                          className="shrink-0 text-blue-700 hover:text-blue-900 transition-colors"
                          aria-label={collapsedSections[sec.sectionId] ? "Expand objective" : "Collapse objective"}
                        >
                          {collapsedSections[sec.sectionId] ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                        <span className="text-xs font-semibold uppercase tracking-wide text-blue-900 shrink-0">Objective {sec.objective_num}</span>
                        <Input
                          value={sec.objective_text}
                          onChange={(e) => updateSection(sec.sectionId, { objective_text: e.target.value })}
                          placeholder="Objective description…"
                          className="h-7 flex-1 text-sm bg-white"
                        />
                        <Button onClick={() => addActivity(sec.sectionId)} variant="outline" size="sm" className="h-7 shrink-0 gap-1">
                          <Plus className="size-3.5" /> Activity
                        </Button>
                        <button
                          onClick={() => deleteObjective(sec.sectionId)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                          aria-label="Delete objective"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {!collapsedSections[sec.sectionId] && sec.rows.map((row) => {
                    const activityCell = (
                      <td rowSpan={partnerMode ? 2 : 1} className="px-3 py-2 align-top border-r">
                        <div className="flex gap-2">
                          <span className="text-xs font-mono text-muted-foreground pt-2 w-10 shrink-0">{row.activity_num}</span>
                          <Textarea
                            value={row.activity_text}
                            onChange={(e) => updateRow(row.key, { activity_text: e.target.value })}
                            placeholder="Activity description…"
                            className="text-sm min-h-[36px] resize-y flex-1"
                          />
                        </div>
                      </td>
                    );
                    const agentCell = (
                      <td rowSpan={partnerMode ? 2 : 1} className="px-2 py-2 align-top border-l w-[120px]">
                        <Input
                          value={row.implementing_agent}
                          onChange={(e) => updateRow(row.key, { implementing_agent: e.target.value })}
                          placeholder="Agent"
                          className="h-8 text-sm"
                        />
                      </td>
                    );
                    const deleteCell = (
                      <td rowSpan={partnerMode ? 2 : 1} className="px-2 py-2 align-middle text-center">
                        <button
                          onClick={() => deleteActivity(row.key)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete activity"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    );

                    if (!partnerMode) {
                      return (
                        <tr key={row.key} className={cn("border-t", row.dirty && "bg-amber-50/30")}>
                          {activityCell}
                          {quarters.map((q, i) => (
                            <td key={q} className={cn("px-1 py-2 align-middle", i === 0 && "border-l")}>
                              <QuarterCell checked={row.planned_quarters.includes(q)} variant="editable" onToggle={() => toggleQuarter(row.key, q)} />
                            </td>
                          ))}
                          {agentCell}
                          {deleteCell}
                        </tr>
                      );
                    }

                    // Partner mode: two rows — editable baseline (structure) on top,
                    // per-report updated timeline below, plus status + comment.
                    const pid = row.id;
                    const ps = pid != null ? progress[pid] : undefined;
                    const canProgress = pid != null;
                    const updatedQuarters = ps?.updated_quarters ?? row.planned_quarters;
                    return (
                      <Fragment key={row.key}>
                        <tr className={cn("border-t", row.dirty && "bg-amber-50/30")}>
                          {activityCell}
                          <td className="px-2 py-2 text-[11px] text-muted-foreground whitespace-nowrap">Baseline</td>
                          {quarters.map((q, i) => (
                            <td key={q} className={cn("px-1 py-1.5", i === 0 && "border-l")}>
                              <QuarterCell checked={row.planned_quarters.includes(q)} variant="editable" onToggle={() => toggleQuarter(row.key, q)} />
                            </td>
                          ))}
                          {agentCell}
                          <td rowSpan={2} className="px-2 py-2 align-top border-l w-[100px]">
                            <Select
                              value={ps?.status ?? "none"}
                              onValueChange={(v) => canProgress && updateProgress(pid!, { status: v === "none" ? null : (v as WorkplanStatus) })}
                              disabled={!canProgress}
                            >
                              <SelectTrigger className="h-8 px-1 w-[140px]">
                                {ps?.status ? <StatusBadge value={ps.status} /> : <span className="text-muted-foreground text-sm">—</span>}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                {WORKPLAN_STATUSES.map((st) => (
                                  <SelectItem key={st} value={st}><StatusBadge value={st} /></SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td rowSpan={2} className="px-2 py-2 align-middle border-l">
                            <Textarea
                              value={ps?.comment ?? ""}
                              onChange={(e) => canProgress && updateProgress(pid!, { comment: e.target.value })}
                              placeholder={canProgress ? "Add a progress note…" : "Save the activity first…"}
                              className="text-xs min-h-[56px] resize-y"
                              disabled={!canProgress}
                            />
                          </td>
                          {deleteCell}
                        </tr>
                        <tr className={cn("border-b", row.dirty && "bg-amber-50/30")}>
                          <td className="px-2 py-2 text-[11px] font-medium text-neutral-700 whitespace-nowrap">Updated</td>
                          {quarters.map((q, i) => (
                            <td key={q} className={cn("px-1 py-1.5", i === 0 && "border-l")}>
                              <QuarterCell
                                checked={updatedQuarters.includes(q)}
                                variant={canProgress ? "editable" : "baseline"}
                                onToggle={canProgress ? () => toggleUpdatedQuarter(pid!, q) : undefined}
                              />
                            </td>
                          ))}
                        </tr>
                      </Fragment>
                    );
                  })}
                </Fragment>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Button onClick={addOutcome} variant="outline" size="sm">
        <Plus className="size-4 mr-1" /> Add outcome
      </Button>
    </div>
  );
}
