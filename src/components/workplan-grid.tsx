"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import labels from "@/lib/labels";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, Check, FileQuestion, ChevronRight, ChevronDown } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { cn } from "@/lib/utils";
import { AutosaveIndicator, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import { HEAD_BG, HEAD_COLOR, HEAD_DIVIDER_COLOR, HEAD_TEXT, SUBHEAD_TEXT } from "@/components/report-editor/matrix-table";
import { useReadOnly } from "@/components/ui/read-only-context";
import { RequiredMark } from "@/components/ui/required-mark";
import { InfoPopover } from "@/components/ui/info-popover";
import {
  workplanStatuses,
  workplanStatusColor,
  workplanStatusDescription,
  quarterRange,
  quartersAfter,
  groupQuartersByYear,
  workplanUpdateWindowLabel,
  type WorkplanStatus,
  workplanStatusNeedsDetail,
} from "@/lib/workplan";

const AGENT_DELIM = " | ";
function parseAgents(v: string) { return v.split(AGENT_DELIM).map((s) => s.trim()).filter(Boolean); }
function joinAgents(vs: string[]) { return vs.join(AGENT_DELIM); }
// Short name for display: "ABBR: Full name" shows as "ABBR".
function agentAbbr(tok: string) { return tok.split(":")[0].trim(); }
// One selected partner per line, so several partners grow the cell downwards.
function AgentStack({ tokens, className }: { tokens: string[]; className?: string }) {
  return (
    <span className={cn("flex flex-col items-start", className)}>
      {tokens.map((t) => <span key={t} className="break-words">{agentAbbr(t)}</span>)}
    </span>
  );
}

// Sticky header edges drawn as inset box-shadow, not CSS borders: with
// border-collapse the collapsed borders don't travel with a sticky cell and
// vanish on scroll, whereas a box-shadow is painted with the cell.
const HEAD_SHADOW = `inset 0 -1px 0 ${HEAD_DIVIDER_COLOR}`; // bottom
const HEAD_SHADOW_L = `inset 1px 0 0 ${HEAD_DIVIDER_COLOR}, inset 0 -1px 0 ${HEAD_DIVIDER_COLOR}`; // left + bottom

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

// ── Shared bits ────────────────────────────────────────────────────────────

function StatusBadge({ value }: { value: WorkplanStatus }) {
  const c = workplanStatusColor(value);
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", c.bg, c.text, c.border)}>
      {value}
    </span>
  );
}

// Dropdown option: the coloured status name plus its one-line meaning, matching
// the reference progress legend.
function StatusOption({ value }: { value: WorkplanStatus }) {
  const c = workplanStatusColor(value);
  const description = workplanStatusDescription(value);
  return (
    <span className={cn("inline-flex w-full items-center rounded-md border px-2 py-0.5 text-xs whitespace-nowrap", c.bg, c.text, c.border)}>
      <span className="font-semibold">{value}</span>
      {description && <span className="opacity-90">&nbsp;– {description}</span>}
    </span>
  );
}

// Ticked, editable box: shared by the report's updated-timeline row and the project
// document's work plan so the two read identically.
const TICK_ON = "bg-crafd-yellow-400 border-crafd-yellow-600 text-crafd-grey-900";

// A single quarter cell: filled check when set. Read-only (baseline) or toggle.
function QuarterCell({
  checked,
  variant,
  onToggle,
  grey = false,
}: {
  checked: boolean;
  variant: "baseline" | "editable";
  onToggle?: () => void;
  // Editable and ticked like the report's updated-timeline row (the project document).
  grey?: boolean;
}) {
  const box = (
    <span
      className={cn(
        "inline-flex size-[18px] items-center justify-center rounded border",
        checked
          ? variant === "baseline"
            ? "bg-crafd-grey-200 border-crafd-grey-200 text-crafd-grey-600"
            : TICK_ON
          : "border-neutral-300 bg-white text-transparent"
      )}
    >
      <Check className="size-3" strokeWidth={3} />
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

// Quarters added by an extended time frame are tinted across both header rows
// and down the body, so the proposed extra time is never mistaken for the
// project's approved timeline. The header is a shade darker than the body so the
// two stay distinguishable.
const EXTENSION_HEAD = "bg-crafd-yellow-500 text-crafd-grey-800";
const EXTENSION_CELL = "bg-crafd-yellow-200";

// Hierarchy (outcome → output → activity), shared by both grids. Each level is
// a colour band that starts further in, leaving white space on its left:
//   Outcome  — yellow band from the left edge (OUTCOME_BG).
//   Output   — lighter yellow band starting 2rem in (OUTPUT_FILL).
//   Activity — warm off-white band starting 4rem in (ACTIVITY_FILL); the line
//              between activities starts there too, so the indent stays white.
// The fills are background layers offset from the left, so they cover the full
// cell height — also on the activity cell, which spans several rows.
// The outcome / output bands (and their text) fill only the leading column(s)
// and stop where the quarter grid begins; the rest of the row is BandFill —
// blank cells that keep the year separators and column rules running through,
// with the row's delete button in the last (bin) column.
const INDENT_OUTCOME = "pl-3";
const INDENT_OUTPUT = "pl-[2.75rem]";   // fill at 2rem + 0.75rem inner padding
const INDENT_ACTIVITY = "pl-[4.75rem]"; // fill at 4rem + 0.75rem inner padding
// Where each band starts (its left edge): the add buttons line up with these.
const BAND_EDGE_OUTCOME = "pl-0";
const BAND_EDGE_OUTPUT = "pl-8";   // = OUTPUT_FILL offset (2rem)
const BAND_EDGE_ACTIVITY = "pl-16"; // = ACTIVITY_FILL offset (4rem)
function indentFill(color: string, x: string, topLine = false, bottomLine = false): CSSProperties {
  const fill = `linear-gradient(${color}, ${color})`;
  const line = "linear-gradient(var(--border), var(--border))";
  const layers = [
    ...(topLine ? [{ img: line, size: "100% 1px", pos: `${x} 0` }] : []),
    ...(bottomLine ? [{ img: line, size: "100% 1px", pos: `${x} 100%` }] : []),
    { img: fill, size: "100% 100%", pos: `${x} 0` },
  ];
  return {
    backgroundImage: layers.map((l) => l.img).join(", "),
    backgroundRepeat: "no-repeat",
    backgroundSize: layers.map((l) => l.size).join(", "),
    backgroundPosition: layers.map((l) => l.pos).join(", "),
  };
}
// Ramp: outcome yellow-400 → output yellow-200 → activity yellow-50 (warm
// off-white). Soft on purpose: yellow-400 is the brightest band. Clear steps,
// and the activity rows — where partners work — stay calm. Kept apart from the
// "input" yellows (ticked quarters, extension tint).
const OUTCOME_BG = "bg-crafd-yellow-400";
const OUTPUT_FILL = indentFill("var(--color-crafd-yellow-200)", "2rem");
const ACTIVITY_FILL = indentFill("var(--color-crafd-yellow-50)", "4rem", true);
// The last activity of an output also closes off with a line below it, so the
// quarter grid doesn't stay open before the next output / add button.
const ACTIVITY_FILL_LAST = indentFill("var(--color-crafd-yellow-50)", "4rem", true, true);
// Bottom rule on every cell of that last row except the activity cell (which
// draws its own, starting at the activity indent).
const ACTIVITY_ROW_BOTTOM = "[&>td]:border-b [&>td:first-child]:border-b-0";
// Unsaved activity: a brand-yellow bar on the row's left edge (on the activity
// cell, which spans all of the activity's rows) rather than tinting the row, so
// it never competes with the hierarchy colours.
const UNSAVED_MARK = "shadow-[inset_3px_0_0_var(--color-crafd-yellow)]";
// Row separator on every cell except the (first) activity cell, which draws
// its own line starting at the activity indent.
const ACTIVITY_ROW_TOP = "[&>td]:border-t [&>td:first-child]:border-t-0";
// Quarter-grid column edges, down the body. The first quarter gets a full rule
// (it is the edge between the text columns and the grid); every later year
// start gets a short centred tick — a "|" that stops short of the horizontal
// lines — so the grid reads year by year without boxing every cell in.
const YEAR_TICK =
  "bg-[linear-gradient(var(--color-crafd-grey-400),var(--color-crafd-grey-400))] bg-no-repeat bg-[length:1px_50%] bg-[position:0_50%]";
function quarterEdge(q: string, quarters: string[], yearStart: Set<string>, ticks = true, firstRule = true) {
  if (q === quarters[0]) return firstRule ? "border-l" : undefined;
  return ticks && yearStart.has(q) ? YEAR_TICK : undefined;
}
function yearStartKeys(quarters: string[]): Set<string> {
  const out = new Set<string>();
  quarters.forEach((q, i) => { if (i === 0 || q.slice(0, 4) !== quarters[i - 1].slice(0, 4)) out.add(q); });
  return out;
}
// The quarter + trailing part of an outcome / output band row: blank cells with
// the same year separators, extension tint and column rules as the body rows.
// `action` (e.g. the delete button) goes in the last trailing cell. `leading`
// adds blank cells before the quarters (true = left rule), for columns that sit
// between the band text and the grid (the project document's "Project partner").
// `firstRule={false}` drops the rule before the first quarter (the partner grid,
// where the "Update" label column runs straight into the quarters).
function BandFill({ quarters, yearStart, extension, leading = [], trailing, action, firstRule = true }: { quarters: string[]; yearStart: Set<string>; extension?: Set<string>; leading?: boolean[]; trailing: boolean[]; action?: ReactNode; firstRule?: boolean }) {
  return (
    <>
      {leading.map((border, i) => (
        <td key={"l" + i} className={cn(border && "border-l")} />
      ))}
      {quarters.map((q) => (
        <td key={q} className={cn(quarterEdge(q, quarters, yearStart, false, firstRule), extension?.has(q) && EXTENSION_CELL)} />
      ))}
      {trailing.map((border, i) => (
        <td key={"t" + i} className={cn(border && "border-l", i === trailing.length - 1 && action && "px-2 py-2 align-middle text-center")}>
          {i === trailing.length - 1 ? action : null}
        </td>
      ))}
    </>
  );
}

// Two-row year/quarter header shared by both grids. `extension` holds the
// quarter keys that fall beyond the project's approved end date; a year is
// marked as extension only when every one of its quarters is.
// `firstRule={false}` drops the divider before the first year / quarter, to match
// the body (see BandFill).
function QuarterHeader({ quarters, leadCols, trailCols, extension, firstRule = true }: { quarters: string[]; leadCols: ReactNode; trailCols: ReactNode; extension?: Set<string>; firstRule?: boolean }) {
  const groups = groupQuartersByYear(quarters);
  const isExtension = (key: string) => extension?.has(key) ?? false;

  // Sticky two-row header pinned to the page's scroll container: the year row at
  // the top, the quarter row directly below it. That offset used to be a fixed
  // 32px (`top-8`), which held only while the year row was exactly one short
  // line tall — the row-spanning columns beside it ("Project partner",
  // "Progress update") can wrap and push it taller, and the quarter numbers
  // then stuck too high and slid under the years while scrolling. Measured
  // instead, and kept in step by a ResizeObserver.
  const yearRowRef = useRef<HTMLTableRowElement>(null);
  const [yearRowHeight, setYearRowHeight] = useState(32);
  useEffect(() => {
    const el = yearRowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setYearRowHeight(el.getBoundingClientRect().height || 32);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [quarters.length]);

  // Opaque bg + cell-level borders so body rows never bleed through on scroll.
  return (
    <thead>
      <tr ref={yearRowRef}>
        {leadCols}
        {groups.map((g, gi) => (
          <th
            key={g.year}
            colSpan={g.quarters.length}
            style={{ boxShadow: gi === 0 && !firstRule ? HEAD_SHADOW : HEAD_SHADOW_L }}
            className={cn(
              "sticky top-0 z-20 h-8 px-1 py-2 text-center",
              g.quarters.every((q) => isExtension(q.key)) ? EXTENSION_HEAD : cn(HEAD_BG, HEAD_COLOR),
              HEAD_TEXT
            )}
          >
            {g.year}
          </th>
        ))}
        {trailCols}
      </tr>
      <tr>
        {groups.map((g, gi) =>
          g.quarters.map((q, i) => (
            <th
              key={q.key}
              style={{ boxShadow: i === 0 && (gi > 0 || firstRule) ? HEAD_SHADOW_L : HEAD_SHADOW, top: yearRowHeight }}
              className={cn(
                "sticky z-20 px-0.5 py-1 text-center w-7 min-w-7",
                isExtension(q.key) ? EXTENSION_HEAD : cn(HEAD_BG, HEAD_COLOR),
                SUBHEAD_TEXT
              )}
            >
              {q.q}
            </th>
          ))
        )}
      </tr>
    </thead>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Partner editor — read-only project structure + baseline (admin-owned), with
// one progress line per admin-managed update window ([YEAR]+[TR/NCE/BR/AR/FR]).
// Every visible window is shown so the workplan's evolution is legible; only the
// admin-highlighted active window is editable (its checks, status and comment
// auto-save), and only while the report is Open.
// ═══════════════════════════════════════════════════════════════════════════

interface UpdateWindow {
  id: number;
  year: number;
  type_code: string;
  sort_order: number;
  is_active: boolean;
  hidden: boolean;
}

function sortUpdates(updates: UpdateWindow[]): UpdateWindow[] {
  return [...updates].sort((a, b) => a.year - b.year || a.sort_order - b.sort_order || a.id - b.id);
}

interface WindowEntry {
  updated_quarters: string[];
  status: string | null;
  comment: string | null;
}

interface MatrixActivity {
  id: number;
  outcome: string | null;
  objective_num: string | null;
  objective_text: string | null;
  activity_num: string | null;
  activity_text: string | null;
  implementing_agent: string | null;
  planned_quarters: string[];
  sort_order: number;
  byUpdate: Record<number, WindowEntry | undefined>;
}

// The activity's last submitted timeline before the current update window: the
// latest earlier window (usually the year before) whose entry changed it — only
// a delay (Delayed / At Risk / Suspended) carries a timeline; On Track /
// Achieved mean "unchanged" and are skipped — or the baseline from the project
// document when there is none. This is the greyed reference row on the partner
// grid. `sorted` must be in window order.
function lastSubmittedTimeline(a: MatrixActivity, sorted: UpdateWindow[], activeUpdateId: number | null): { label: string; quarters: string[] } {
  const activeIdx = sorted.findIndex((u) => u.id === activeUpdateId);
  const earlier = activeIdx === -1 ? sorted : sorted.slice(0, activeIdx);
  for (let i = earlier.length - 1; i >= 0; i--) {
    const u = earlier[i];
    if (u.id === activeUpdateId) continue;
    const entry = a.byUpdate[u.id];
    if (entry && workplanStatusNeedsDetail(entry.status)) return { label: workplanUpdateWindowLabel(u), quarters: entry.updated_quarters ?? [] };
  }
  return { label: labels.common.baseline, quarters: a.planned_quarters ?? [] };
}

// Quarters added beyond the project's approved end date, for an update whose
// Work Plan carries the "+ extended time frame" module. `quarters` is already
// derived from the months figure by the API (1–3 months → 1 quarter, 4–6 → 2, …);
// `months` is carried only so the page can name the extension. An annual report,
// and any update without the add-on, gets 0 — the general version of the grid.
interface WorkplanExtension {
  months: number | null;
  quarters: number;
}

interface WorkplanMatrix {
  range: Range;
  extension?: WorkplanExtension;
  updates: UpdateWindow[];
  activeUpdateId: number | null;
  activities: MatrixActivity[];
}

interface ProgressState {
  updated_quarters: string[];
  status: WorkplanStatus | null;
  comment: string;
}

export function WorkplanPartnerEditor({ reportId, onSaveStateChange, fillHeight, readOnly = false, pushCommand }: { reportId: number; onSaveStateChange?: (s: SaveState) => void; fillHeight?: boolean; readOnly?: boolean; pushCommand: (cmd: { undo: () => void; redo: () => void }) => void }) {
  const [data, setData] = useState<WorkplanMatrix | null>(null);
  const [progress, setProgress] = useState<Record<number, ProgressState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  useEffect(() => { onSaveStateChange?.(saveState); }, [saveState, onSaveStateChange]);

  // Autosave of the current report's progress (the only editable line).
  const progressRef = useRef<Record<number, ProgressState>>({});
  const dirtyRef = useRef<Set<number>>(new Set());
  const activeUpdateRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  useEffect(() => { progressRef.current = progress; }, [progress]);
  useEffect(() => { activeUpdateRef.current = data?.activeUpdateId ?? null; }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/workplan?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load work plan");
      const d: WorkplanMatrix = await res.json();
      setData(d);
      const prog: Record<number, ProgressState> = {};
      const sorted = sortUpdates(d.updates);
      for (const a of d.activities) {
        const cur = d.activeUpdateId != null ? a.byUpdate[d.activeUpdateId] : undefined;
        prog[a.id] = {
          // Until adjusted, the active window's timeline is the last submitted
          // one (the year before, or the baseline when there is none).
          updated_quarters: cur?.updated_quarters ?? lastSubmittedTimeline(a, sorted, d.activeUpdateId).quarters,
          status: (cur?.status as WorkplanStatus) ?? null,
          comment: cur?.comment ?? "",
        };
      }
      setProgress(prog);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  const flush = useCallback(async () => {
    const ids = Array.from(dirtyRef.current);
    if (!ids.length) return;
    const updateId = activeUpdateRef.current;
    // No active window ⇒ nothing is editable; drop any stray dirty ids.
    if (updateId == null) { dirtyRef.current.clear(); return; }
    dirtyRef.current.clear();
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
              updateId,
              activityId,
              // Ticks only count under a delay (the API enforces this too).
              updated_quarters: workplanStatusNeedsDetail(s.status) ? s.updated_quarters : null,
              status: s.status,
              comment: s.comment || null,
            }),
          }).then((r) => { if (!r.ok) throw new Error(`Failed to save progress ${activityId}`); });
        })
      );
      setSaveState("saved");
    } catch (e) {
      ids.forEach((id) => dirtyRef.current.add(id));
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
      setSaveState("error");
    }
  }, [reportId]);
  flushRef.current = flush;

  const schedule = useCallback(() => {
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { flushRef.current(); }, 700);
  }, []);

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirtyRef.current.size) flushRef.current();
  }, []);

  function updateProgress(activityId: number, patch: Partial<ProgressState>) {
    const before: ProgressState = progressRef.current[activityId] ?? { updated_quarters: [], status: null, comment: "" };
    const after: ProgressState = { ...before, ...patch };
    setProgress((prev) => {
      const base: ProgressState = prev[activityId] ?? { updated_quarters: [], status: null, comment: "" };
      return { ...prev, [activityId]: { ...base, ...patch } };
    });
    dirtyRef.current.add(activityId);
    schedule();
    if (!("comment" in patch)) {
      pushCommand({
        undo: () => { const comment = progressRef.current[activityId]?.comment ?? before.comment; setProgress((prev) => ({ ...prev, [activityId]: { ...before, comment } })); dirtyRef.current.add(activityId); schedule(); },
        redo: () => { const comment = progressRef.current[activityId]?.comment ?? after.comment; setProgress((prev) => ({ ...prev, [activityId]: { ...after, comment } })); dirtyRef.current.add(activityId); schedule(); },
      });
    }
  }

  function toggleQuarter(activityId: number, q: string) {
    const cur = progressRef.current[activityId]?.updated_quarters ?? [];
    updateProgress(activityId, { updated_quarters: cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q] });
  }

  // THE TWO VERSIONS OF THIS GRID. The general one runs over the project's own
  // quarters — exactly the annual report's table. The extended-time-frame one
  // adds the quarters that separate the project's end from its new one (the API
  // measures that against the real dates), continuing the sequence so the
  // partner can plan activities into the new time. Everything else about the
  // table is identical, which is the point: one grid, one extra block of
  // columns — and no extra column at all when the added months stay inside the
  // final quarter.
  const baseQuarters = useMemo(
    () => quarterRange(data?.range.start ?? null, data?.range.end ?? null),
    [data]
  );
  const extraQuarters = useMemo(
    () => quartersAfter(baseQuarters[baseQuarters.length - 1], data?.extension?.quarters ?? 0),
    [baseQuarters, data]
  );
  const quarters = useMemo(() => [...baseQuarters, ...extraQuarters], [baseQuarters, extraQuarters]);
  const extensionKeys = useMemo(() => new Set(extraQuarters), [extraQuarters]);

  if (loading) return <LoadingState />;

  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  }

  if (!quarters.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">The work plan timeline has not been configured for this project yet.</p>
      </div>
    );
  }

  if (!data || !data.activities.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
        <FileQuestion className="size-8 opacity-30" />
        <p className="text-sm">No work plan activities have been defined for this project yet.</p>
      </div>
    );
  }

  const { activities, activeUpdateId } = data;
  const updates = sortUpdates(data.updates);
  const activeUpdate = updates.find((u) => u.id === activeUpdateId) ?? null;

  // Picking a progress status. Leaving the delays (Delayed / At Risk /
  // Suspended) closes the second row, so the timeline goes back to the last
  // submitted one rather than keeping hidden edits that would still be saved.
  const setStatus = (a: MatrixActivity, v: string) => {
    const next = v === "none" ? null : v;
    updateProgress(a.id, workplanStatusNeedsDetail(next)
      ? { status: next }
      : { status: next, updated_quarters: lastSubmittedTimeline(a, updates, activeUpdateId).quarters });
  };

  const yearStart = yearStartKeys(quarters);
  let lastOutcome: string | null = null;
  let lastObjective: string | null = null;
  let outcomeOrdinal = 0;

  return (
    <div className={cn(fillHeight ? "flex flex-col flex-1 min-h-0" : "")}>
      <div className="mb-3">
        {!onSaveStateChange && <AutosaveIndicator state={saveState} />}
      </div>
      {/* No banner for the extended time frame: the added quarters announce
          themselves as the tinted columns past the project's own end. */}
      {activeUpdateId == null && (
        <div className="mb-3 rounded-lg border border-crafd-yellow-400 bg-crafd-yellow-100 px-4 py-2.5 text-sm text-crafd-grey-800">
          No active update window has been set for this project. Ask your administrator to add and activate one before entering progress.
        </div>
      )}
      {/* The box is sized by its rows, not by the window: `min-h-0` without
          `flex-1` means it takes its content's height when the activities are
          few — so the border closes under the last row instead of running to
          the bottom of the page — and flex-shrinks to the space available, with
          its own scrollbar, once they outgrow it. */}
      <div className={cn("scroll-fade rounded-xl border bg-card", fillHeight ? "min-h-0 overflow-auto" : "overflow-x-auto")}>
        <table className="w-full text-sm border-collapse">
          <QuarterHeader
            quarters={quarters}
            extension={extensionKeys}
            firstRule={false}
            // Column order: Activity | Project partner | Progress update |
            // Description | Update | quarters. The Update label (Baseline /
            // 2026 AR …) sits right beside the quarters it describes. Activity
            // takes the most room (~45%, at least 440px); the rest stay narrow.
            leadCols={
              <>
                <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW, width: "45%" }} className={cn("sticky top-0 z-20 text-left px-3 py-2 min-w-[440px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)} />
                <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 w-[80px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Project partner</th>
                <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 w-[112px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Progress update<RequiredMark /></th>
                <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 min-w-[150px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Description</th>
                <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 text-left px-2 py-2 w-[72px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Update</th>
              </>
            }
            trailCols={null}
          />
          <tbody>
            {activities.map((a, ai) => {
              const showOutcome = a.outcome && a.outcome !== lastOutcome;
              if (showOutcome) outcomeOrdinal++;
              if (a.outcome) lastOutcome = a.outcome;
              const objKey = `${a.objective_num ?? ""}|${a.objective_text ?? ""}`;
              const showObjective = objKey.trim() !== "|" && objKey !== lastObjective;
              if (objKey.trim() !== "|") lastObjective = objKey;
              // Last activity of its output (or of the table): gets a closing line.
              const next = activities[ai + 1];
              const lastInOutput = !next
                || next.outcome !== a.outcome
                || `${next.objective_num ?? ""}|${next.objective_text ?? ""}` !== objKey;

              const ps = progress[a.id];
              // Row 1 is the reference: the last submitted timeline (the year
              // before, or the baseline), greyed. A second quarter row for this
              // report opens only when its progress is Delayed / At Risk /
              // Suspended — and only the Update label + quarters split; the other
              // columns span both rows.
              const prev = lastSubmittedTimeline(a, updates, activeUpdateId);
              const status = ps?.status ?? null;
              const split = activeUpdate != null && workplanStatusNeedsDetail(status);
              const rowSpan = split ? 2 : 1;
              const editable = activeUpdate != null && !readOnly;
              // Spanning cells close the output off themselves when split (the
              // second row only holds the label + quarters).
              const closeSpan = lastInOutput && split ? "border-b" : undefined;

              const activityCell = (
                <td rowSpan={rowSpan} className={cn("pr-3 py-2 align-top border-r bg-card", INDENT_ACTIVITY)} style={lastInOutput ? ACTIVITY_FILL_LAST : ACTIVITY_FILL}>
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-medium leading-snug flex-1">
                      {/* "1.1.1. ACTIVITY", styled like the project document's label. */}
                      <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide tabular-nums text-crafd-grey-900">
                        {a.activity_num ? `${a.activity_num}. ` : ""}Activity:
                      </span>
                      {a.activity_text}
                    </p>
                    {/* Per-activity comment thread (admin↔partner), keyed on this
                        report + the activity row — same infra as risk/indicators. */}
                    <ItemComments section="workplan" itemId={a.id} />
                  </div>
                </td>
              );
              const agentCell = (
                <td rowSpan={rowSpan} className={cn("px-2 py-2 text-xs align-middle border-l text-muted-foreground", closeSpan)}>{a.implementing_agent ? <AgentStack tokens={parseAgents(a.implementing_agent)} /> : "—"}</td>
              );

              return (
                <Fragment key={a.id}>
                  {showOutcome && (
                    <tr>
                      <td className={cn(OUTCOME_BG, "pr-3 py-2 text-sm font-semibold text-crafd-grey-900", INDENT_OUTCOME)}><span className="mr-1.5 text-xs font-semibold uppercase tracking-wide tabular-nums">{outcomeOrdinal}. Outcome:</span>{a.outcome}</td>
                      <BandFill quarters={quarters} yearStart={yearStart} extension={extensionKeys} leading={[true, true, true, true]} trailing={[]} firstRule={false} />
                    </tr>
                  )}
                  {showObjective && (
                    <tr>
                      <td className={cn("pr-3 py-1.5 text-sm font-semibold text-crafd-grey-900", INDENT_OUTPUT)} style={OUTPUT_FILL}>
                        {a.objective_num && (
                          <span className="mr-1.5 text-xs font-semibold uppercase tracking-wide tabular-nums">{a.objective_num}. Output:</span>
                        )}
                        {a.objective_text}
                      </td>
                      <BandFill quarters={quarters} yearStart={yearStart} extension={extensionKeys} leading={[true, true, true, true]} trailing={[]} firstRule={false} />
                    </tr>
                  )}

                  {/* Row 1: activity, partner, progress and description (spanning)
                      + the last submitted timeline, greyed. */}
                  <tr className={cn(ACTIVITY_ROW_TOP, lastInOutput && !split && ACTIVITY_ROW_BOTTOM)}>
                    {activityCell}
                    {agentCell}
                    <td rowSpan={rowSpan} className={cn("px-2 py-2 align-middle border-l", closeSpan)}>
                      {/* Renders the dropdown even when read-only: the surrounding
                          <ReadOnlyProvider> disables it, as in every other section. */}
                      {activeUpdate ? (
                        <Select value={status ?? "none"} onValueChange={(v) => setStatus(a, v)}>
                          <SelectTrigger className="h-8 px-1 w-full min-w-0">
                            {status ? <StatusBadge value={status} /> : <span className="text-muted-foreground/60 text-sm">Select…</span>}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                            {workplanStatuses().map((st) => (
                              <SelectItem key={st} value={st}><StatusOption value={st} /></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td rowSpan={rowSpan} className={cn("px-2 py-2 border-l", closeSpan)}>
                      {!split ? null : editable ? (
                        <Textarea
                          value={ps?.comment ?? ""}
                          onChange={(e) => updateProgress(a.id, { comment: e.target.value })}
                          placeholder="Add a progress note."
                          className="text-xs min-h-[56px] resize-none placeholder:text-muted-foreground/60"
                        />
                      ) : ps?.comment ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{ps.comment}</p>
                      ) : (
                        <span className="text-muted-foreground/40 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 border-l text-xs text-muted-foreground whitespace-nowrap">{prev.label}</td>
                    {quarters.map((q) => (
                      <td key={q} className={cn("px-0.5 py-1.5", quarterEdge(q, quarters, yearStart, true, false), extensionKeys.has(q) && EXTENSION_CELL)}>
                        <QuarterCell checked={prev.quarters.includes(q)} variant="baseline" />
                      </td>
                    ))}
                  </tr>
                  {/* Row 2 (delays only): this report's updated timeline. */}
                  {split && activeUpdate && (
                    <tr className={cn("border-t", lastInOutput && "[&>td]:border-b")}>
                      <td className="px-2 py-2 border-l text-xs font-medium text-neutral-800 whitespace-nowrap">{workplanUpdateWindowLabel(activeUpdate)}</td>
                      {quarters.map((q) => (
                        <td key={q} className={cn("px-0.5 py-1.5", quarterEdge(q, quarters, yearStart, true, false), extensionKeys.has(q) && EXTENSION_CELL)}>
                          <QuarterCell
                            checked={(ps?.updated_quarters ?? []).includes(q)}
                            variant={editable ? "editable" : "baseline"}
                            onToggle={editable ? () => toggleQuarter(a.id, q) : undefined}
                          />
                        </td>
                      ))}
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

export function WorkplanAdminEditor({ projectId, defaultAgent, reportId, onSaveStateChange, fillHeight, pushCommand }: { projectId: number; defaultAgent?: string | null; reportId?: number; onSaveStateChange?: (s: SaveState) => void; fillHeight?: boolean; pushCommand: (cmd: { undo: () => void; redo: () => void }) => void }) {
  const partnerMode = reportId != null;
  const readOnly = useReadOnly();
  const confirm = useConfirm();

  const [rows, setRows] = useState<AdminRow[]>([]);
  const [collapsedClusters, setCollapsedClusters] = useState<Record<number, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<number, boolean>>({});
  const [start, setStart] = useState<string | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [agentOptions, setAgentOptions] = useState<string[]>([]);

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
      // Org options are fetched in parallel; failure is non-fatal.
      const [activitiesResult, orgsResult] = await Promise.allSettled([
        fetch(partnerMode ? `/api/workplan?reportId=${reportId}` : `/api/workplan-activities?projectId=${projectId}`),
        fetch(`/api/project-organizations?project_id=${projectId}&type=participating`),
      ]);
      if (activitiesResult.status === "rejected") throw new Error("Failed to load work plan structure");
      const res = activitiesResult.value;
      if (!res.ok) throw new Error("Failed to load work plan structure");

      if (orgsResult.status === "fulfilled" && orgsResult.value.ok) {
        try {
          const orgs: { name: string }[] = await orgsResult.value.json();
          const names = orgs.map((o) => o.name).filter(Boolean);
          if (defaultAgent && !names.includes(defaultAgent)) names.unshift(defaultAgent);
          setAgentOptions(names);
        } catch { /* ignore — fall back to text input */ }
      }
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
              // Ticks only count under a delay (the API enforces this too).
              updated_quarters: workplanStatusNeedsDetail(s.status) ? s.updated_quarters : null,
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
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
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
    const before = cur;
    const after = cur.includes(q) ? cur.filter((x) => x !== q) : [...cur, q];
    updateProgress(activityId, { updated_quarters: after });
    pushCommand({
      undo: () => {
        setProgress((prev) => {
          const base = prev[activityId] ?? { updated_quarters: [], status: null, comment: "" };
          return { ...prev, [activityId]: { ...base, updated_quarters: before } };
        });
        progressDirtyRef.current.add(activityId);
        scheduleProgressFlush();
      },
      redo: () => {
        setProgress((prev) => {
          const base = prev[activityId] ?? { updated_quarters: [], status: null, comment: "" };
          return { ...prev, [activityId]: { ...base, updated_quarters: after } };
        });
        progressDirtyRef.current.add(activityId);
        scheduleProgressFlush();
      },
    });
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
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
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
  // Outcomes 1, 2, …; Objectives 1.1, 1.2, …; Activities 1.1.1, 1.1.2, …
  function normalize(list: AdminRow[]): AdminRow[] {
    let outcomeOrdinal = 0;
    let objOrdinal = 0;
    let lastCluster: number | null = null;
    let lastSection: number | null = null;
    let activityCount = 0;
    return list.map((r, i) => {
      if (r.clusterId !== lastCluster) { outcomeOrdinal++; objOrdinal = 0; lastCluster = r.clusterId; lastSection = null; }
      if (r.sectionId !== lastSection) { objOrdinal++; lastSection = r.sectionId; activityCount = 0; }
      activityCount++;
      const objective_num = `${outcomeOrdinal}.${objOrdinal}`;
      const activity_num = `${outcomeOrdinal}.${objOrdinal}.${activityCount}`;
      if (r.sort_order === i && r.objective_num === objective_num && r.activity_num === activity_num) return r;
      return { ...r, sort_order: i, objective_num, activity_num, dirty: true, rev: r.rev + 1 };
    });
  }
  normalizeRef.current = normalize;

  function pushDeleteCommand(capturedRows: AdminRow[], capturedIndices: number[]) {
    // Insert at ascending original indices — each insertion restores the offset for the following one.
    const pairs = capturedIndices
      .map((idx, i) => ({ idx, row: capturedRows[i] }))
      .sort((a, b) => a.idx - b.idx);
    pushCommand({
      undo: () => {
        for (const { row } of pairs) idByKeyRef.current.delete(row.key);
        setRows((prev) => {
          const next = [...prev];
          for (const { idx, row } of pairs)
            next.splice(idx, 0, { ...row, id: null, dirty: true, rev: row.rev + 1 });
          return normalize(next);
        });
        scheduleFlush();
      },
      redo: async () => {
        const keys = new Set(capturedRows.map((r) => r.key));
        const toDelete = rowsRef.current.filter((r) => keys.has(r.key));
        await Promise.all(
          toDelete
            .map((r) => r.id ?? idByKeyRef.current.get(r.key) ?? null)
            .filter((id): id is number => id !== null)
            .map((id) => fetch(`/api/workplan-activities?id=${id}`, { method: "DELETE" }))
        );
        setRows((prev) => normalize(prev.filter((r) => !keys.has(r.key))));
        scheduleFlush();
      },
    });
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  function updateRow(key: number, patch: Partial<AdminRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch, dirty: true, rev: r.rev + 1 } : r)));
    scheduleFlush();
  }

  function toggleQuarter(key: number, q: string) {
    const row = rowsRef.current.find((r) => r.key === key);
    const before = row?.planned_quarters ?? [];
    const after = before.includes(q) ? before.filter((x) => x !== q) : [...before, q];
    setRows((prev) =>
      prev.map((r) => {
        if (r.key !== key) return r;
        return { ...r, planned_quarters: after, dirty: true, rev: r.rev + 1 };
      })
    );
    scheduleFlush();
    pushCommand({
      undo: () => {
        setRows((prev) => prev.map((r) => r.key !== key ? r : { ...r, planned_quarters: before, dirty: true, rev: r.rev + 1 }));
        scheduleFlush();
      },
      redo: () => {
        setRows((prev) => prev.map((r) => r.key !== key ? r : { ...r, planned_quarters: after, dirty: true, rev: r.rev + 1 }));
        scheduleFlush();
      },
    });
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
    const newKey = ++keyRef.current;
    setRows((prev) => {
      const section = prev.filter((r) => r.sectionId === sectionId);
      const template = section[0];
      const lastIdx = prev.map((r) => r.sectionId).lastIndexOf(sectionId);
      const newRow: AdminRow = {
        key: newKey,
        id: null,
        clusterId: template?.clusterId ?? 0,
        sectionId,
        outcome: template?.outcome ?? "",
        objective_num: template?.objective_num ?? "",
        objective_text: template?.objective_text ?? "",
        activity_num: "",
        activity_text: "",
        implementing_agent: "",
        planned_quarters: [],
        sort_order: 0,
        dirty: true,
        rev: 0,
      };
      const next = [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)];
      return normalize(next);
    });
    scheduleFlush();
    pushCommand({
      undo: async () => {
        const liveId = rowsRef.current.find((r) => r.key === newKey)?.id ?? idByKeyRef.current.get(newKey) ?? null;
        if (liveId != null) await fetch(`/api/workplan-activities?id=${liveId}`, { method: "DELETE" });
        idByKeyRef.current.delete(newKey);
        setRows((prev) => normalize(prev.filter((r) => r.key !== newKey)));
        scheduleFlush();
      },
      redo: () => {
        idByKeyRef.current.delete(newKey);
        setRows((prev) => {
          const section = prev.filter((r) => r.sectionId === sectionId);
          const template = section[0];
          const lastIdx = prev.map((r) => r.sectionId).lastIndexOf(sectionId);
          const reRow: AdminRow = {
            key: newKey, id: null, clusterId: template?.clusterId ?? 0, sectionId,
            outcome: template?.outcome ?? "", objective_num: template?.objective_num ?? "",
            objective_text: template?.objective_text ?? "", activity_num: "", activity_text: "",
            implementing_agent: "", planned_quarters: [], sort_order: 0, dirty: true, rev: 0,
          };
          return normalize([...prev.slice(0, lastIdx + 1), reRow, ...prev.slice(lastIdx + 1)]);
        });
        scheduleFlush();
      },
    });
  }

  // Add a new objective within a specific outcome cluster.
  function addObjective(clusterId: number) {
    const newKey = ++keyRef.current;
    const newSectionId = ++sectionIdRef.current;
    setRows((prev) => {
      const cluster = prev.filter((r) => r.clusterId === clusterId);
      const template = cluster[0];
      const lastIdx = prev.map((r) => r.clusterId).lastIndexOf(clusterId);
      const newRow: AdminRow = {
        key: newKey,
        id: null,
        clusterId,
        sectionId: newSectionId,
        outcome: template?.outcome ?? "",
        objective_num: "",
        objective_text: "",
        activity_num: "",
        activity_text: "",
        implementing_agent: "",
        planned_quarters: [],
        sort_order: 0,
        dirty: true,
        rev: 0,
      };
      const next = lastIdx >= 0 ? [...prev.slice(0, lastIdx + 1), newRow, ...prev.slice(lastIdx + 1)] : [...prev, newRow];
      return normalize(next);
    });
    scheduleFlush();
    pushCommand({
      undo: async () => {
        const liveId = rowsRef.current.find((r) => r.key === newKey)?.id ?? idByKeyRef.current.get(newKey) ?? null;
        if (liveId != null) await fetch(`/api/workplan-activities?id=${liveId}`, { method: "DELETE" });
        idByKeyRef.current.delete(newKey);
        setRows((prev) => normalize(prev.filter((r) => r.key !== newKey)));
        scheduleFlush();
      },
      redo: () => {
        idByKeyRef.current.delete(newKey);
        setRows((prev) => {
          const cluster = prev.filter((r) => r.clusterId === clusterId);
          const template = cluster[0];
          const lastIdx = prev.map((r) => r.clusterId).lastIndexOf(clusterId);
          const reRow: AdminRow = {
            key: newKey, id: null, clusterId, sectionId: newSectionId,
            outcome: template?.outcome ?? "", objective_num: "", objective_text: "",
            activity_num: "", activity_text: "", implementing_agent: "",
            planned_quarters: [], sort_order: 0, dirty: true, rev: 0,
          };
          const next = lastIdx >= 0 ? [...prev.slice(0, lastIdx + 1), reRow, ...prev.slice(lastIdx + 1)] : [...prev, reRow];
          return normalize(next);
        });
        scheduleFlush();
      },
    });
  }

  // Add a new outcome cluster, seeded with one empty objective.
  function addOutcome() {
    const newKey = ++keyRef.current;
    const newRow: AdminRow = {
      key: newKey,
      id: null,
      clusterId: ++clusterIdRef.current,
      sectionId: ++sectionIdRef.current,
      outcome: "",
      objective_num: "",
      objective_text: "",
      activity_num: "",
      activity_text: "",
      implementing_agent: "",
      planned_quarters: [],
      sort_order: 0,
      dirty: true,
      rev: 0,
    };
    setRows((prev) => normalize([...prev, newRow]));
    scheduleFlush();
    pushCommand({
      undo: async () => {
        const liveId = rowsRef.current.find((r) => r.key === newKey)?.id ?? idByKeyRef.current.get(newKey) ?? null;
        if (liveId != null) await fetch(`/api/workplan-activities?id=${liveId}`, { method: "DELETE" });
        idByKeyRef.current.delete(newKey);
        setRows((prev) => normalize(prev.filter((r) => r.key !== newKey)));
        scheduleFlush();
      },
      redo: () => {
        idByKeyRef.current.delete(newKey);
        setRows((prev) => normalize([...prev, { ...newRow, dirty: true, rev: newRow.rev + 1 }]));
        scheduleFlush();
      },
    });
  }

  async function deleteActivity(key: number) {
    const row = rowsRef.current.find((r) => r.key === key);
    const hasContent = row && (row.activity_text?.trim() || row.implementing_agent?.trim());
    if (hasContent && !await confirm({ message: "Delete this activity?" })) return;
    const capturedRows = row ? [row] : [];
    const capturedIndices = row ? [rowsRef.current.findIndex((r) => r.key === key)] : [];
    if (row?.id != null) await fetch(`/api/workplan-activities?id=${row.id}`, { method: "DELETE" });
    setRows((prev) => normalize(prev.filter((r) => r.key !== key)));
    scheduleFlush();
    if (capturedRows.length) pushDeleteCommand(capturedRows, capturedIndices);
  }

  async function deleteObjective(sectionId: number) {
    const activities = rowsRef.current.filter((r) => r.sectionId === sectionId);
    const count = activities.length;
    const label = count === 1 ? "1 activity" : `${count} activities`;
    if (!await confirm({ message: `Delete this Output and its ${label}?` })) return;
    const capturedRows = activities;
    const capturedIndices = activities.map((r) => rowsRef.current.findIndex((x) => x.key === r.key));
    const ids = activities.filter((r) => r.id != null).map((r) => r.id);
    await Promise.all(ids.map((id) => fetch(`/api/workplan-activities?id=${id}`, { method: "DELETE" })));
    setRows((prev) => normalize(prev.filter((r) => r.sectionId !== sectionId)));
    scheduleFlush();
    if (capturedRows.length) pushDeleteCommand(capturedRows, capturedIndices);
  }

  async function deleteCluster(clusterId: number) {
    const activities = rowsRef.current.filter((r) => r.clusterId === clusterId);
    const count = activities.length;
    const label = count === 1 ? "1 activity" : `${count} activities`;
    if (!await confirm({ message: `Delete this Outcome and all its Outputs and ${label}?` })) return;
    const capturedRows = activities;
    const capturedIndices = activities.map((r) => rowsRef.current.findIndex((x) => x.key === r.key));
    const ids = activities.filter((r) => r.id != null).map((r) => r.id);
    await Promise.all(ids.map((id) => fetch(`/api/workplan-activities?id=${id}`, { method: "DELETE" })));
    setRows((prev) => normalize(prev.filter((r) => r.clusterId !== clusterId)));
    scheduleFlush();
    if (capturedRows.length) pushDeleteCommand(capturedRows, capturedIndices);
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

  if (loading) return <LoadingState />;

  // Columns: [activity] + [project partner] (+[timeline label] in partner mode)
  // + quarters (+[status]+[comment] in partner mode) + [delete].
  const yearStart = yearStartKeys(quarters);
  // Band + add-button rows: content spans the activity column only and ends
  // before "Project partner"; the rest is BandFill, so the column rules
  // (partner | quarters | bin) run unbroken.
  const leadCols = 1;
  const leadBorders = partnerMode ? [true, false] : [true];
  const trailBorders = partnerMode ? [true, true, true] : [true];

  // Add controls use the platform's standard add button (as "Add risk" on the
  // ProDoc Risk tab), each on its own row. Every level reuses the padding
  // structure of its own row so the buttons step in outcome → output → activity.
  const addTierBar = (label: string, onAdd: () => void, level: "outcome" | "output" | "activity") => {
    // Each add button wears the colour of the level it adds (matching its band),
    // a shade darker on hover.
    const tone = {
      outcome: "border-crafd-yellow-600 bg-crafd-yellow-400 hover:border-crafd-yellow-700 hover:bg-crafd-yellow-500",
      output: "border-crafd-yellow-400 bg-crafd-yellow-200 hover:border-crafd-yellow-500 hover:bg-crafd-yellow-300",
      activity: "border-crafd-yellow-200 bg-crafd-yellow-50 hover:border-crafd-yellow-400 hover:bg-crafd-yellow-150",
    }[level];
    const button = (
      <Button type="button" variant="add" size="sm" onClick={onAdd} disabled={readOnly} className={cn("gap-1", tone)}>
        <Plus className="size-4" />{label}
      </Button>
    );
    // Each button's left edge lines up with where its level's colour band starts.
    if (level === "outcome") return <div className={cn("pr-3 py-1.5", BAND_EDGE_OUTCOME)}>{button}</div>;
    if (level === "output") {
      return (
        <div className={cn("pr-3 py-1.5", BAND_EDGE_OUTPUT)}>{button}</div>
      );
    }
    // Activity: at the start of the activity band.
    return (
      <div className={cn("pr-3 py-1.5", BAND_EDGE_ACTIVITY)}>{button}</div>
    );
  };

  // Sits at the foot of the table, where the new outcome actually appears.
  const addOutcomeBar = addTierBar("Add outcome", addOutcome, "outcome");

  return (
    <div className={cn(fillHeight ? "flex flex-col gap-5 flex-1 min-h-0" : "space-y-5")}>
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
        <>
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            No outcomes yet. Add one to start building the workplan.
          </div>
          <div>{addOutcomeBar}</div>
        </>
      ) : (
        <div className={cn("scroll-fade rounded-xl border bg-card", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto")}>
          <table className={cn("w-full text-sm border-collapse", fillHeight && "h-full")}>
            <QuarterHeader
              quarters={quarters}
              leadCols={
                <>
                  <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW }} className={cn("sticky top-0 z-20 text-left px-3 py-2 min-w-[360px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)} />
                  <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 min-w-[100px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Project partner</th>
                  {partnerMode && <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW }} className={cn("sticky top-0 z-20 text-left px-2 py-2 min-w-[100px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Timeline</th>}
                </>
              }
              trailCols={
                <>
                  {partnerMode && <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 min-w-[110px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Progress update<RequiredMark /></th>}
                  {partnerMode && <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 min-w-[160px] align-bottom", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>Description</th>}
                  <th rowSpan={2} style={{ boxShadow: HEAD_SHADOW_L }} className={cn("sticky top-0 z-20 px-2 py-2 w-10 align-bottom", HEAD_BG)} />
                </>
              }
            />
            <tbody>
              {clusters.map((cluster, ci) => (
                <Fragment key={cluster.clusterId}>
                  {/* Outcome cluster header — top level of the hierarchy */}
                  <tr>
                    <td colSpan={leadCols} className={cn(OUTCOME_BG, "text-crafd-grey-900 pr-3 py-2.5", INDENT_OUTCOME)}>
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setCollapsedClusters((p) => ({ ...p, [cluster.clusterId]: !p[cluster.clusterId] }))}
                          className="shrink-0 pt-2 text-crafd-grey-800 hover:text-crafd-grey-900 transition-colors"
                          aria-label={collapsedClusters[cluster.clusterId] ? "Expand outcome" : "Collapse outcome"}
                        >
                          {collapsedClusters[cluster.clusterId] ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
                        </button>
                        <span className="mt-1.5 rounded bg-white/70 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-crafd-grey-900 shrink-0">{ci + 1}. Outcome{!partnerMode && <RequiredMark />}</span>
                        <span className="mt-2 shrink-0"><InfoPopover description={labels.workplanHelp.outcome} triggerTitle="Outcome" descriptionHeading={labels.workplanHelp.heading} /></span>
                        {/* Grows with the text, so long outcome statements stay readable. */}
                        <Textarea
                          rows={1}
                          value={cluster.outcome}
                          onChange={(e) => updateCluster(cluster.clusterId, e.target.value)}
                          placeholder="Provide outcome heading."
                          className="min-h-9 flex-1 resize-none text-sm bg-white text-crafd-grey-900 placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </td>
                    <BandFill
                      quarters={quarters}
                      yearStart={yearStart}
                      leading={leadBorders}
                      trailing={trailBorders}
                      action={
                        <button
                          onClick={() => deleteCluster(cluster.clusterId)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete outcome"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      }
                    />
                  </tr>
                  {!collapsedClusters[cluster.clusterId] && cluster.sections.map((sec) => (
                    <Fragment key={sec.sectionId}>
                  <tr>
                    <td colSpan={leadCols} className={cn("py-2 pr-3", INDENT_OUTPUT)} style={OUTPUT_FILL}>
                      <div className="flex items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setCollapsedSections((p) => ({ ...p, [sec.sectionId]: !p[sec.sectionId] }))}
                          className="shrink-0 pt-2 text-crafd-grey-600 hover:text-crafd-grey-900 transition-colors"
                          aria-label={collapsedSections[sec.sectionId] ? "Expand output" : "Collapse output"}
                        >
                          {collapsedSections[sec.sectionId] ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                        </button>
                        <span className="pt-2.5 text-xs font-semibold uppercase tracking-wide text-crafd-grey-900 shrink-0">{sec.objective_num}. Output{!partnerMode && <RequiredMark className="text-crafd-yellow-900" />}</span>
                        <span className="pt-2 shrink-0"><InfoPopover description={labels.workplanHelp.output} triggerTitle="Output" descriptionHeading={labels.workplanHelp.heading} /></span>
                        <Textarea
                          rows={1}
                          value={sec.objective_text}
                          onChange={(e) => updateSection(sec.sectionId, { objective_text: e.target.value })}
                          placeholder="Describe output."
                          className="min-h-9 flex-1 resize-none text-sm bg-white placeholder:text-muted-foreground/60"
                        />
                      </div>
                    </td>
                    <BandFill
                      quarters={quarters}
                      yearStart={yearStart}
                      leading={leadBorders}
                      trailing={trailBorders}
                      action={
                        <button
                          onClick={() => deleteObjective(sec.sectionId)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Delete output"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      }
                    />
                  </tr>

                  {!collapsedSections[sec.sectionId] && sec.rows.map((row, ri) => {
                    // Last activity of the output: closing line below it.
                    const lastInOutput = ri === sec.rows.length - 1;
                    const activityCell = (
                      <td rowSpan={partnerMode ? 2 : 1} className={cn("pr-3 py-2 align-top border-r h-px bg-card", INDENT_ACTIVITY, row.dirty && UNSAVED_MARK)} style={lastInOutput ? ACTIVITY_FILL_LAST : ACTIVITY_FILL}>
                        <div className="flex gap-2 h-full">
                          {/* "1.1.1. Activity", styled like the "1.1. Output" label above it. */}
                          <span className="pt-2.5 text-xs font-semibold uppercase tracking-wide tabular-nums text-crafd-grey-900 shrink-0">
                            {row.activity_num ? `${row.activity_num}. ` : ""}Activity
                          </span>
                          <span className="pt-2 shrink-0"><InfoPopover description={labels.workplanHelp.activity} triggerTitle="Activity" descriptionHeading={labels.workplanHelp.heading} /></span>
                          <Textarea
                            value={row.activity_text}
                            onChange={(e) => updateRow(row.key, { activity_text: e.target.value })}
                            placeholder="Describe activity."
                            className="text-sm min-h-[36px] h-full resize-y flex-1 bg-white placeholder:text-muted-foreground/60"
                          />
                          {/* Per-activity comment thread — only once the activity has
                              been persisted (an unsaved row has no id to key on). */}
                          {row.id != null && (
                            <span className="pt-1.5 shrink-0">
                              <ItemComments section="workplan" itemId={row.id} />
                            </span>
                          )}
                        </div>
                      </td>
                    );
                    const agentCell = (() => {
                      if (agentOptions.length === 0) {
                        return (
                          <td rowSpan={partnerMode ? 2 : 1} className="px-2 py-2 align-top border-l w-[100px]">
                            <Input
                              value={row.implementing_agent}
                              onChange={(e) => updateRow(row.key, { implementing_agent: e.target.value })}
                              placeholder="Project partner"
                              className="h-8 text-sm"
                            />
                          </td>
                        );
                      }
                      const selected = parseAgents(row.implementing_agent);
                      const legacyTokens = selected.filter((t) => !agentOptions.includes(t));
                      return (
                        <td rowSpan={partnerMode ? 2 : 1} className="px-2 py-2 align-top border-l w-[100px]">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={cn("min-h-8 w-full rounded-md border border-input bg-transparent px-2 py-0.5 text-sm text-left flex justify-between gap-1", selected.length > 1 ? "items-start" : "items-center")}>
                                {selected.length
                                  ? <AgentStack tokens={selected} className="leading-5" />
                                  : <span className="text-muted-foreground/60">Select…</span>}
                                <ChevronDown className={cn("size-3 shrink-0 opacity-50", selected.length > 1 && "mt-1.5")} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="min-w-[180px]">
                              {agentOptions.map((opt) => (
                                <DropdownMenuCheckboxItem
                                  key={opt}
                                  checked={selected.includes(opt)}
                                  onCheckedChange={(on) => {
                                    const next = on ? [...selected, opt] : selected.filter((s) => s !== opt);
                                    const before = row.implementing_agent;
                                    const after = joinAgents(next);
                                    updateRow(row.key, { implementing_agent: after });
                                    pushCommand({
                                      undo: () => { updateRow(row.key, { implementing_agent: before }); },
                                      redo: () => { updateRow(row.key, { implementing_agent: after }); },
                                    });
                                  }}
                                  onSelect={(e) => e.preventDefault()}
                                >
                                  {opt}
                                </DropdownMenuCheckboxItem>
                              ))}
                              {legacyTokens.length > 0 && (
                                <>
                                  <DropdownMenuSeparator />
                                  {legacyTokens.map((tok) => (
                                    <DropdownMenuCheckboxItem
                                      key={tok}
                                      checked
                                      onCheckedChange={() => {
                                        const next = selected.filter((s) => s !== tok);
                                        const before = row.implementing_agent;
                                        const after = joinAgents(next);
                                        updateRow(row.key, { implementing_agent: after });
                                        pushCommand({
                                          undo: () => { updateRow(row.key, { implementing_agent: before }); },
                                          redo: () => { updateRow(row.key, { implementing_agent: after }); },
                                        });
                                      }}
                                      onSelect={(e) => e.preventDefault()}
                                    >
                                      {tok}
                                    </DropdownMenuCheckboxItem>
                                  ))}
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      );
                    })();
                    const deleteCell = (
                      <td rowSpan={partnerMode ? 2 : 1} className="px-2 py-2 align-middle text-center border-l">
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
                        <tr key={row.key} className={cn(ACTIVITY_ROW_TOP, lastInOutput && ACTIVITY_ROW_BOTTOM)}>
                          {activityCell}
                          {agentCell}
                          {quarters.map((q) => (
                            <td key={q} className={cn("px-0.5 py-2 align-middle", quarterEdge(q, quarters, yearStart))}>
                              <QuarterCell checked={row.planned_quarters.includes(q)} variant="editable" grey onToggle={() => toggleQuarter(row.key, q)} />
                            </td>
                          ))}
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
                        <tr className={ACTIVITY_ROW_TOP}>
                          {activityCell}
                          {agentCell}
                          <td className="px-2 py-2 text-xs text-muted-foreground whitespace-nowrap">Baseline</td>
                          {quarters.map((q) => (
                            <td key={q} className={cn("px-0.5 py-1.5", quarterEdge(q, quarters, yearStart))}>
                              <QuarterCell checked={row.planned_quarters.includes(q)} variant="editable" onToggle={() => toggleQuarter(row.key, q)} />
                            </td>
                          ))}
                          <td rowSpan={2} className="px-2 py-2 align-top border-l w-[100px]">
                            <Select
                              value={ps?.status ?? "none"}
                              onValueChange={(v) => canProgress && updateProgress(pid!, { status: v === "none" ? null : (v as WorkplanStatus) })}
                              disabled={!canProgress}
                            >
                              <SelectTrigger className="h-8 px-1 w-[140px]">
                                {ps?.status ? <StatusBadge value={ps.status} /> : <span className="text-muted-foreground text-sm">Select progress</span>}
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                                {workplanStatuses().map((st) => (
                                  <SelectItem key={st} value={st}><StatusOption value={st} /></SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                          <td rowSpan={2} className="px-2 py-2 align-middle border-l">
                            <Textarea
                              value={ps?.comment ?? ""}
                              onChange={(e) => canProgress && updateProgress(pid!, { comment: e.target.value })}
                              placeholder={canProgress ? "Add a progress note." : "Save the activity first."}
                              className="text-xs min-h-[56px] resize-y"
                              disabled={!canProgress}
                            />
                          </td>
                          {deleteCell}
                        </tr>
                        <tr className="border-b">
                          <td className="px-2 py-2 text-xs font-medium text-neutral-700 whitespace-nowrap">Updated</td>
                          {quarters.map((q) => (
                            <td key={q} className={cn("px-0.5 py-1.5", quarterEdge(q, quarters, yearStart))}>
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
                  {!collapsedSections[sec.sectionId] && (
                    <tr>
                      <td colSpan={leadCols} className="p-0">{addTierBar("Add activity", () => addActivity(sec.sectionId), "activity")}</td><BandFill quarters={quarters} yearStart={yearStart} leading={leadBorders} trailing={trailBorders} />
                    </tr>
                  )}
                </Fragment>
                  ))}
                  {!collapsedClusters[cluster.clusterId] && (
                    <tr>
                      <td colSpan={leadCols} className="p-0">{addTierBar("Add output", () => addObjective(cluster.clusterId), "output")}</td><BandFill quarters={quarters} yearStart={yearStart} leading={leadBorders} trailing={trailBorders} />
                    </tr>
                  )}
                </Fragment>
              ))}
              <tr>
                <td colSpan={leadCols} className="p-0">{addOutcomeBar}</td><BandFill quarters={quarters} yearStart={yearStart} leading={leadBorders} trailing={trailBorders} />
              </tr>
              {/* Filler: when the box is taller than the rows (fillHeight), the table
                  stretches to the box and this row takes the spare height, so the
                  column rules run to the bottom. Excess table height goes to
                  percentage-height rows first, so the real rows keep their size;
                  once the rows overflow, it collapses to nothing. */}
              {fillHeight && (
                <tr style={{ height: "100%" }}>
                  <td colSpan={leadCols} className="p-0" />
                  <BandFill quarters={quarters} yearStart={yearStart} leading={leadBorders} trailing={trailBorders} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

