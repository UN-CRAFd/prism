"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import labels from "@/lib/labels";
import { numericAmount } from "@/lib/numeric-input";
import { Loader2, CheckCircle2, Wallet, AlertTriangle } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import { InfoPopover } from "@/components/ui/info-popover";
import { cn } from "@/lib/utils";
import { useAutosave, type SaveState } from "@/components/autosave";
import { FundingSummary } from "@/components/funding-summary";
import { formatAmount, num, type ExpenditureCategory } from "@/lib/expenditure";
import { CURRENT_YEAR_HEAD, HEAD_TEXT, SUBHEAD_TEXT } from "@/components/report-editor/matrix-table";
import { usePastYears, PastYearChips } from "@/components/report-editor/past-year-chips";

// ─────────────────────────────────────────────────────────────────────────────
// Expenditure reporting grid. Stored inputs are approved annual budgets (admin),
// actual annual expenditure (partner) and — on a project update carrying a
// budget revision — the proposed new budget (partner). Every total / sub-total /
// indirect / difference is computed here from those.
//
// THE FOUR VERSIONS of this page, selected by the update's modules and resolved
// by /api/expenditure (never by the client):
//
//   1. Expenditure (actual spending)  — the annual report's table, unchanged.
//   2. + proposed new budget          — two more columns in the Total block, and
//                                       the rule that the grant size cannot move.
//   3. + extended time frame          — a column for each year the extension
//                                       reaches into past the project's end.
//   4. both                           — the two are independent, so ticking both
//                                       simply turns both on.
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetRow { category_id: number; year: number; approved_amount: number | null }
interface ExpRow {
  category_id: number;
  year: number;
  annual_expenditure: number | null;
  // Whole-period figure carried on the update's own row, so it is read off the
  // current year's entry rather than summed across years.
  proposed_amount?: number | null;
  comment: string | null;
}

interface ExpenditurePayload {
  indirectRate: number;
  currentYear: number;
  categories: ExpenditureCategory[];
  years: number[];
  reportYears: number[];
  budgets: BudgetRow[];
  expenditure: ExpRow[];
  /** Indirect support costs actually spent, per year, where a figure has been
   *  entered. Years without one fall back to the rate (see iscFor below). */
  indirect?: { year: number; annual_expenditure: number | null }[];
  /** The page is a project update. Everything beyond the annual report's table
   *  — the entered indirect support costs and the budget flags — hangs off this. */
  isUpdate?: boolean;
  /** True when `currentYear` is still running: the update is not standing in for
   *  the annual report, so its column asks for spending to date, not a closed
   *  annual figure. */
  currentYearToDate?: boolean;
  /** Version 2/4: show the proposed new budget columns. */
  proposedBudget?: boolean;
  /** Version 3/4: `years` are the ones the extension adds past the project end;
   *  empty when the extra months stay inside the final year. */
  extension?: { months: number; years: number[]; endDate: string | null };
}

function parseAmount(s: string): number | null {
  const cleaned = s.replace(/[, ]/g, "").trim();
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return isNaN(n) ? null : n;
}

// A read-only computed number cell (muted for approved, coloured for differences).
function Num({ value, kind = "plain" }: { value: number | null; kind?: "plain" | "approved" | "diff" | "strong" }) {
  const cls =
    kind === "approved" ? "text-muted-foreground" :
    kind === "diff" ? (num(value) < 0 ? "text-red-600" : num(value) > 0 ? "text-green-700" : "text-muted-foreground") :
    kind === "strong" ? "font-semibold" : "";
  return <span className={cn("tabular-nums", cls)}>{formatAmount(value) || "—"}</span>;
}

// Frozen ("Total" box + row labels) columns. Fixed widths give deterministic
// left offsets so the sticky columns line up in the header, body and footer.
// The Total block is two columns wider in the proposed-new-budget versions, so
// the offsets are derived from whichever columns are in play rather than being
// written down once.
type FrozenKey = "cat" | "app" | "exp" | "diff" | "prop" | "pdiff";
const FCOL_WIDTH: Record<FrozenKey, number> = {
  cat: 240, app: 130, exp: 130, diff: 120, prop: 140, pdiff: 140,
};
const PLAIN_COLS: FrozenKey[] = ["cat", "app", "exp", "diff"];
const PROPOSED_COLS: FrozenKey[] = [...PLAIN_COLS, "prop", "pdiff"];

function frozenLayout(proposed: boolean) {
  const keys = proposed ? PROPOSED_COLS : PLAIN_COLS;
  // The difference column earns a little more room once its header has to say
  // WHICH difference it is; the plain table keeps its original widths exactly.
  const w = proposed ? { ...FCOL_WIDTH, diff: 150 } : FCOL_WIDTH;
  const offset = {} as Record<FrozenKey, number>;
  let width = 0;
  for (const k of keys) { offset[k] = width; width += w[k]; }
  return {
    width,
    left: (key: FrozenKey) => offset[key],
    fz: (key: FrozenKey, z = 20): CSSProperties => ({
      position: "sticky",
      left: offset[key],
      width: w[key],
      minWidth: w[key],
      maxWidth: w[key],
      zIndex: z,
    }),
  };
}

// Columns for years the extension adds, tinted so proposed extra time is never
// read as approved project period. Matches the work plan grid's treatment.
const EXTENSION_HEAD = "bg-amber-100/80 text-amber-900";
const EXTENSION_CELL = "bg-amber-50/60";

// A collapsed border vanishes under a sticky cell; redraw it with an inset shadow.
const HEAD_SHADOW = "inset 0 -1px 0 var(--border)"; // bottom
const HEAD_SHADOW_L = "inset 1px 0 0 var(--border), inset 0 -1px 0 var(--border)"; // left + bottom

// ═══════════════════════════════════════════════════════════════════════════
// Partner editor — enter the current report year's expenditure + comments
// ═══════════════════════════════════════════════════════════════════════════

interface EditState { exp: string; prop: string; comment: string; dirty: boolean }

export function ExpenditurePartnerEditor({
  reportId,
  onSaveStateChange,
  fillHeight = false,
}: {
  reportId: number;
  onSaveStateChange?: (s: SaveState) => void;
  // Freeze the column headers to the top while the grid body scrolls.
  fillHeight?: boolean;
}) {
  const [data, setData] = useState<ExpenditurePayload | null>(null);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  // Indirect support costs spent in the reported year. Not a category, so it is
  // held and saved on its own rather than inside `edits`.
  const [iscExp, setIscExp] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef<ExpenditurePayload | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  const editsRef = useRef<Record<number, EditState>>({});
  useEffect(() => { editsRef.current = edits; }, [edits]);
  const iscRef = useRef("");
  useEffect(() => { iscRef.current = iscExp; }, [iscExp]);
  const iscDirtyRef = useRef(false);

  // The two header rows are both sticky, so the second has to be pinned exactly
  // one first-row down. That height was hard-coded at 32px, which held only
  // while every cell in the top row was a single short line — a wrapped year
  // label ("2029 · extension") made the row taller and the second row then
  // overlapped it as soon as the table scrolled. Measured instead, and kept in
  // step by a ResizeObserver, so the two can never come apart.
  const headRowRef = useRef<HTMLTableRowElement>(null);
  const [headRowHeight, setHeadRowHeight] = useState(32);
  useEffect(() => {
    const el = headRowRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setHeadRowHeight(el.getBoundingClientRect().height || 32);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
    // `data` is the dependency that matters: the header only exists once it has
    // loaded. After that the observer keeps the figure current by itself.
  }, [data]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenditure?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load expenditure");
      const d: ExpenditurePayload = await res.json();
      setData(d);
      const init: Record<number, EditState> = {};
      for (const c of d.categories) {
        const e = d.expenditure.find((x) => x.category_id === c.id && x.year === d.currentYear);
        init[c.id] = {
          exp: e?.annual_expenditure != null ? String(e.annual_expenditure) : "",
          prop: e?.proposed_amount != null ? String(e.proposed_amount) : "",
          comment: e?.comment ?? "",
          dirty: false,
        };
      }
      setEdits(init);
      const isc = d.indirect?.find((i) => i.year === d.currentYear)?.annual_expenditure;
      setIscExp(isc != null ? String(isc) : "");
      iscDirtyRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [reportId]);

  useEffect(() => { load(); }, [load]);

  // Lookup maps.
  const budgetMap = useMemo(() => {
    const m: Record<number, Record<number, number | null>> = {};
    data?.budgets.forEach((b) => { (m[b.year] ??= {})[b.category_id] = b.approved_amount; });
    return m;
  }, [data]);
  const storedExpMap = useMemo(() => {
    const m: Record<number, Record<number, number | null>> = {};
    data?.expenditure.forEach((e) => { (m[e.year] ??= {})[e.category_id] = e.annual_expenditure; });
    return m;
  }, [data]);
  const storedIscMap = useMemo(() => {
    const m: Record<number, number | null> = {};
    data?.indirect?.forEach((i) => { m[i.year] = i.annual_expenditure; });
    return m;
  }, [data]);

  // Save every dirty category. A category's dirty flag is only cleared if its
  // value hasn't changed since we snapshotted it, so edits made mid-save survive.
  const flush = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    const dirty = d.categories.filter((c) => editsRef.current[c.id]?.dirty);
    const snapOf = (e: EditState) => JSON.stringify({ exp: e.exp, prop: e.prop, comment: e.comment });
    const snaps = new Map(dirty.map((c) => [c.id, snapOf(editsRef.current[c.id])]));
    await Promise.all(dirty.map((c) => {
      const e = editsRef.current[c.id];
      return fetch("/api/expenditure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          categoryId: c.id,
          annual_expenditure: parseAmount(e.exp),
          // Only the budget-revision versions carry one. The plain page leaves
          // the field out rather than posting a null, so a figure already
          // proposed on this document survives the module being switched off.
          ...(d.proposedBudget ? { proposed_amount: parseAmount(e.prop) } : {}),
          comment: e.comment || null,
        }),
      }).then((r) => { if (!r.ok) throw new Error(`Failed to save ${c.name}`); });
    }));
    // Indirect support costs: one figure on the document, saved on its own.
    if (iscDirtyRef.current) {
      const snap = iscRef.current;
      iscDirtyRef.current = false;
      const res = await fetch("/api/expenditure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId, indirect_expenditure: parseAmount(snap) }),
      });
      if (!res.ok) {
        iscDirtyRef.current = true;
        throw new Error("Failed to save indirect support costs");
      }
    }
    setEdits((prev) => {
      const n = { ...prev };
      for (const c of dirty) {
        const cur = prev[c.id];
        if (cur && snapOf(cur) === snaps.get(c.id)) {
          n[c.id] = { ...cur, dirty: false };
        }
      }
      return n;
    });
  }, [reportId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const pastYearsInput = useMemo(() => {
    if (!data) return [];
    const reportYearSet = new Set(data.reportYears);
    return data.years.filter((y) => y === data.currentYear || reportYearSet.has(y));
  }, [data]);
  const { pastYears, shownYears, toggleYear, visibleYears } = usePastYears(pastYearsInput, data?.currentYear ?? null, "expenditure");

  function update(catId: number, patch: Partial<EditState>) {
    setEdits((prev) => ({ ...prev, [catId]: { ...prev[catId], ...patch, dirty: true } }));
    schedule();
  }

  function setIsc(v: string) {
    setIscExp(numericAmount(v));
    iscDirtyRef.current = true;
    schedule();
  }

  if (loading) return <LoadingState />;
  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  }
  if (!data) return null;

  const { categories, years, currentYear, indirectRate } = data;

  // ── Which version of the page this is ──────────────────────────────────────
  const isUpdate = data.isUpdate === true;
  const toDate = data.currentYearToDate === true;
  const showProposed = data.proposedBudget === true;
  const extensionYears = data.extension?.years ?? [];
  const extensionSet = new Set(extensionYears);
  const L = frozenLayout(showProposed);

  // A year's expenditure columns show only when a report exists for it (the
  // current report year always qualifies). Years without a report show just the
  // approved annual budget.
  const reportYearSet = new Set(data.reportYears);
  const hasReport = (year: number) => year === currentYear || reportYearSet.has(year);

  // Normally the table stops at the report year — later years are nobody's
  // business yet. An extension changes that: the point of the page is the time
  // being added, so the rest of the period is shown too, ending in the new
  // year(s). Without the years in between, the added year would hang off the
  // report year with a gap where the project's own remaining years should be.
  const columnYears = extensionYears.length
    ? [...new Set([...visibleYears, ...years.filter((y) => y > currentYear)])].sort((a, b) => a - b)
    : visibleYears;

  const budFor = (year: number, catId: number) => budgetMap[year]?.[catId] ?? null;
  const expFor = (year: number, catId: number): number | null =>
    year === currentYear ? parseAmount(edits[catId]?.exp ?? "") : (storedExpMap[year]?.[catId] ?? null);
  const approvedTotal = (catId: number) => years.reduce((a, y) => a + num(budFor(y, catId)), 0);
  const totalExp = (catId: number) => years.reduce((a, y) => a + num(expFor(y, catId)), 0);
  // The proposed new budget is a whole-period figure, so it is simply what the
  // partner typed on this row — nothing to sum across years.
  const proposedFor = (catId: number) => parseAmount(edits[catId]?.prop ?? "");

  // Column sums for the computed rows.
  const sumApprovedTotal = categories.reduce((a, c) => a + approvedTotal(c.id), 0);
  const sumExpTotal = categories.reduce((a, c) => a + totalExp(c.id), 0);
  const sumProposedTotal = categories.reduce((a, c) => a + num(proposedFor(c.id)), 0);
  const sumApproved = (y: number) => categories.reduce((a, c) => a + num(budFor(y, c.id)), 0);
  const sumExp = (y: number) => categories.reduce((a, c) => a + num(expFor(y, c.id)), 0);

  // ── Indirect support costs ─────────────────────────────────────────────────
  //
  // On an update the row is its own thing: what was SPENT on indirect support
  // costs is entered year by year and the total is the sum of those entries —
  // nothing else. It is never derived from what the categories spent, so a year
  // with no figure entered contributes nothing and shows blank rather than a
  // number nobody typed.
  //
  // (An annual report's row is untouched: approved and spent alike still follow
  // the rate, exactly as the page always worked.)
  const iscFor = (y: number): number | null => {
    if (!isUpdate) return sumExp(y) * indirectRate;
    return y === currentYear ? parseAmount(iscExp) : (storedIscMap[y] ?? null);
  };
  const iscTotal = years.reduce((a, y) => a + num(iscFor(y)), 0);

  // THE RULE. A budget revision reallocates the grant between categories; it
  // cannot change its size. So the new requested project costs sub total has to
  // come back to the approved one, and the gap is shown until it does. Indirect
  // support costs stand outside the reallocation — they follow the sub total at
  // the project's rate, which is why the check sits at sub total level.
  // Nothing is flagged until the partner has requested something: an untouched
  // column is a table not yet filled in, not a mistake.
  const proposedStarted = categories.some((c) => proposedFor(c.id) !== null);
  const budgetGap = sumProposedTotal - sumApprovedTotal;
  const budgetMismatch = showProposed && proposedStarted && Math.abs(budgetGap) >= 0.005;

  // THE ISC CEILING. The claim may not come to more than the indirect support
  // costs the project was granted — the rate on the APPROVED project costs,
  // which is the figure sitting in this row's own "Approved total budget" cell.
  // What the categories actually spent does not enter into it: spending less
  // than planned does not shrink the indirect support costs allowed, and
  // spending more does not stretch them.
  const iscCeiling = sumApprovedTotal * indirectRate;
  const iscOverClaimed = isUpdate && iscTotal - iscCeiling >= 0.005;

  // OVERSPEND ACROSS CATEGORIES. Per category, how far total spending has run
  // past that category's budget; underspend is not netted off, because money
  // saved on one line does not license overspending on another. Indirect support
  // costs are not a category and stay out of it. CRAFd looks at the budget past
  // 10% of the project costs, the steering committee past 20%.
  //
  // ON A BUDGET REVISION the budget to measure against is the one being asked
  // for, not the one being replaced: a category is only overspent if it runs
  // past the NEW requested total. A category with nothing requested yet keeps
  // the approved figure as its reference, so a half-filled column does not read
  // as the whole project being overspent.
  const budgetRef = (catId: number) =>
    (showProposed ? proposedFor(catId) : null) ?? approvedTotal(catId);
  const usingRequested = showProposed && proposedStarted;
  const sumBudgetRef = categories.reduce((a, c) => a + budgetRef(c.id), 0);
  const overspendByCategory = new Map(
    categories.map((c) => [c.id, Math.max(0, totalExp(c.id) - budgetRef(c.id))])
  );
  const overspendTotal = [...overspendByCategory.values()].reduce((a, v) => a + v, 0);
  const overspendShare = sumBudgetRef > 0 ? (overspendTotal / sumBudgetRef) * 100 : 0;
  const overspendLevel: "none" | "crafd" | "steering" =
    !isUpdate || overspendShare <= 10 ? "none" : overspendShare > 20 ? "steering" : "crafd";

  const withIndirect = (sub: number, mult: number) => sub * mult; // sub, indirect, or total via mult

  // Render a computed footer row (sub total / indirect / total) across all
  // columns. The three money columns are passed in rather than derived from one
  // multiplier: the indirect row's SPENDING is entered, not a multiple of the
  // sub total, so the rows no longer share a single formula. `flag` marks a row
  // that needs attention — "warn" (orange) for the first threshold, "error"
  // (red) for the one that needs an approval — and carries the hint.
  // `expInput` makes the reported year's expenditure cell editable (indirect
  // support costs only).
  //
  // CALLED AS A FUNCTION, not rendered as <ComputedRow/>. It closes over the
  // table's state, so it has to live in here — and a component declared inside
  // another is a NEW type on every render, which makes React throw the subtree
  // away and build it again. That cost the indirect support costs input its
  // focus after every single keystroke. A plain call just returns the rows.
  function computedRow({
    label, strong, flag, hint,
    approvedT, expT, proposedT, proposedTitle, approvedYear, expYear, expInput,
  }: {
    label: string;
    strong?: boolean;
    flag?: "warn" | "error";
    hint?: string;
    approvedT: number;
    expT: number;
    proposedT: number;
    /** Hover note for the requested-budget cell, where that figure is fixed. */
    proposedTitle?: string;
    approvedYear: (y: number) => number;
    expYear: (y: number) => number | null;
    expInput?: { value: string; onChange: (v: string) => void };
  }) {
    const bg =
      flag === "error" ? "bg-red-50" :
      flag === "warn" ? "bg-amber-50" :
      strong ? "bg-neutral-100" : "bg-neutral-50";
    return (
      <tr className={cn("border-t", bg, strong && "font-semibold", flag === "error" && "text-red-900", flag === "warn" && "text-amber-900")}>
        <td style={L.fz("cat")} className={cn("px-3 py-2 text-sm border-r border-t", bg)}>
          <span className="inline-flex items-center gap-1.5" title={flag ? hint : undefined}>
            {flag && (
              <AlertTriangle
                className={cn("size-3.5 shrink-0", flag === "error" ? "text-red-600" : "text-amber-600")}
                aria-hidden
              />
            )}
            {label}
          </span>
        </td>
        <td style={L.fz("app")} className={cn("px-3 py-2 text-right border-t", bg)}><Num value={approvedT} kind="approved" /></td>
        <td style={L.fz("exp")} className={cn("px-3 py-2 text-right border-t", bg)}><Num value={expT} kind={strong ? "strong" : "plain"} /></td>
        <td style={L.fz("diff")} className={cn("px-3 py-2 text-right border-t", !showProposed && "border-r", bg)}><Num value={approvedT - expT} kind="diff" /></td>
        {showProposed && (
          <>
            <td style={L.fz("prop")} className={cn("px-3 py-2 text-right border-l border-t", bg)} title={proposedTitle}>
              <Num value={proposedT} kind={flag || strong ? "strong" : "plain"} />
            </td>
            <td style={L.fz("pdiff")} className={cn("px-3 py-2 text-right border-r border-t", bg)}><Num value={proposedT - expT} kind="diff" /></td>
          </>
        )}
        <td className={cn("border-l border-t", bg)} />
        {columnYears.map((y) => {
          const ap = approvedYear(y);
          if (!hasReport(y)) return <ApprovedOnlyCell key={y} approved={ap} extension={extensionSet.has(y)} />;
          const ex = expYear(y);
          return (
            <FooterYearCells
              key={y}
              approved={ap}
              exp={ex}
              strong={strong}
              past={y !== currentYear}
              expInput={y === currentYear ? expInput : undefined}
            />
          );
        })}
      </tr>
    );
  }

  return (
    <div className={cn("flex flex-col gap-4", fillHeight && "flex-1 min-h-0")}>
      {pastYears.length > 0 && (
        <div className="shrink-0">
          <PastYearChips pastYears={pastYears} shownYears={shownYears} onToggle={toggleYear} />
        </div>
      )}
      {/* No banner for the extended time frame: the added years announce
          themselves as tinted "· extension" columns in the table. */}
      {budgetMismatch && (
        <div className="shrink-0 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm text-red-900">
          <span className="font-medium">The new requested total budget must still add up to the approved budget.</span>{" "}
          A budget revision moves money between categories; it cannot change the size of the grant. The requested
          project costs sub total is {formatAmount(sumProposedTotal)} against {formatAmount(sumApprovedTotal)} approved
          — {budgetGap > 0 ? `${formatAmount(budgetGap)} too much` : `${formatAmount(-budgetGap)} short`}. Indirect
          support costs are not part of the reallocation: they stay at the approved {formatAmount(iscCeiling)}.
        </div>
      )}
      {/* The claim is above the indirect support costs granted. A flag, not a
          block: the figure still saves. */}
      {iscOverClaimed && (
        <div className="shrink-0 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <span className="font-medium">Indirect support costs are above what was approved.</span>{" "}
          {formatAmount(iscTotal)} has been reported in total, against {formatAmount(iscCeiling)} approved
          ({Math.round(indirectRate * 100)}% of the approved project costs) — {formatAmount(iscTotal - iscCeiling)} too much.
        </div>
      )}
      {/* Overspend across categories. Thresholds are on the approved project
          costs; CRAFd takes it from here, so neither message asks for an action. */}
      {overspendLevel !== "none" && (
        <div
          className={cn(
            "shrink-0 rounded-lg border px-4 py-2.5 text-sm",
            overspendLevel === "steering"
              ? "border-red-300 bg-red-50 text-red-900"
              : "border-amber-300 bg-amber-50 text-amber-900"
          )}
        >
          <span className="font-medium">
            Categories are overspent by {formatAmount(overspendTotal)} — {overspendShare.toFixed(1)}% of the{" "}
            {usingRequested ? "newly requested" : "approved"} project costs.
          </span>{" "}
          {overspendLevel === "steering"
            ? "Above 20%, so the steering committee has to approve the budget. CRAFd will be in touch about the next steps — nothing further is needed from you here."
            : "Above 10%, so CRAFd needs to check the budget. CRAFd will be in touch about the next steps — nothing further is needed from you here."}
        </div>
      )}
    <div className={cn("rounded-xl border bg-card", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto")}>
      <table className="text-sm border-separate border-spacing-0" style={{ minWidth: L.width }}>
        <thead>
          <tr className="text-xs" ref={headRowRef}>
            <th rowSpan={2} style={fillHeight ? { ...L.fz("cat", 40), top: 0 } : L.fz("cat", 30)} className={cn("text-left px-3 py-2 text-muted-foreground border-r border-b bg-neutral-100 align-bottom", HEAD_TEXT, fillHeight && "sticky")}>Budget categories</th>
            <th colSpan={showProposed ? 5 : 3} style={fillHeight ? { position: "sticky", left: L.left("app"), top: 0, zIndex: 40 } : { position: "sticky", left: L.left("app"), zIndex: 30 }} className={cn("px-2 py-2 text-center text-muted-foreground border-r border-b bg-neutral-100", HEAD_TEXT, fillHeight && "h-8")}>Total</th>
            <th
              rowSpan={2}
              className={cn(
                "text-left px-2 py-2 text-muted-foreground border-l border-b bg-neutral-100 align-bottom min-w-[200px]",
                HEAD_TEXT,
                fillHeight && "sticky top-0 z-30"
              )}
            >
              Description
            </th>
            {/* nowrap: a year label that wrapped would make this row taller
                than the row below expects, and the two would overlap. */}
            {columnYears.map((y) => (
              <th key={y} colSpan={hasReport(y) ? 3 : 1} className={cn("px-2 py-2 text-center text-muted-foreground border-l border-b whitespace-nowrap", HEAD_TEXT, y === currentYear ? CURRENT_YEAR_HEAD : extensionSet.has(y) ? EXTENSION_HEAD : "bg-neutral-100", fillHeight && "sticky top-0 z-30 h-8")}>
                {y}
                {/* The year being reported is only part of a year unless this
                    update is also the annual report. */}
                {y === currentYear && toDate && <span className="ml-1 font-normal normal-case">· to date</span>}
                {extensionSet.has(y) && <span className="ml-1 font-normal normal-case">· extension</span>}
              </th>
            ))}
          </tr>
          <tr className="text-muted-foreground">
            <th style={fillHeight ? { ...L.fz("app", 40), top: headRowHeight } : L.fz("app", 30)} className={cn("px-2 py-1.5 text-right border-b bg-neutral-50", SUBHEAD_TEXT, fillHeight && "sticky")}>Approved total budget</th>
            <th style={fillHeight ? { ...L.fz("exp", 40), top: headRowHeight } : L.fz("exp", 30)} className={cn("px-2 py-1.5 text-right border-b bg-neutral-50", SUBHEAD_TEXT, fillHeight && "sticky")}>Total expenditure</th>
            {/* "Difference" only needs qualifying once there is a second one to
                tell it apart from — the plain page keeps the shorter header. */}
            <th style={fillHeight ? { ...L.fz("diff", 40), top: headRowHeight } : L.fz("diff", 30)} className={cn("px-2 py-1.5 text-right border-b bg-neutral-50", !showProposed && "border-r", SUBHEAD_TEXT, fillHeight && "sticky")}>
              {showProposed ? "Difference to total approved budget" : "Difference"}
            </th>
            {showProposed && (
              <>
                <th style={fillHeight ? { ...L.fz("prop", 40), top: headRowHeight } : L.fz("prop", 30)} className={cn("px-2 py-1.5 text-right border-l border-b bg-crafd-yellow/15", SUBHEAD_TEXT, fillHeight && "sticky")}>New requested total budget</th>
                <th style={fillHeight ? { ...L.fz("pdiff", 40), top: headRowHeight } : L.fz("pdiff", 30)} className={cn("px-2 py-1.5 text-right border-r border-b bg-neutral-50", SUBHEAD_TEXT, fillHeight && "sticky")}>Difference in new budget</th>
              </>
            )}
            {columnYears.map((y) =>
              hasReport(y)
                ? <FragmentYearHead key={y} current={y === currentYear} toDate={y === currentYear && toDate} fillHeight={fillHeight} top={headRowHeight} />
                : <ApprovedOnlyHead key={y} fillHeight={fillHeight} extension={extensionSet.has(y)} top={headRowHeight} />
            )}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => {
            const approvedT = approvedTotal(c.id);
            const expT = totalExp(c.id);
            const proposedT = proposedFor(c.id);
            // Every overspent row is marked, whatever the totals come to: the
            // triangle says "this category is over its approved budget", which
            // is worth seeing long before the 10% notice appears.
            const over = overspendByCategory.get(c.id) ?? 0;
            const overspent = isUpdate && over > 0;
            return (
              <tr key={c.id}>
                <td style={L.fz("cat")} className="px-3 py-2 border-r border-t bg-card">
                  <span
                    className="inline-flex items-center gap-1"
                    title={
                      overspent
                        ? `Overspent by ${formatAmount(over)} against the ${
                            showProposed && proposedFor(c.id) !== null
                              ? "new requested total budget"
                              : "approved total budget"
                          }.`
                        : undefined
                    }
                  >
                    {overspent && <AlertTriangle className="size-3.5 shrink-0 text-amber-600" aria-hidden />}
                    {c.name}
                    <InfoPopover description={(labels.expenditure.categoryDescriptions as Record<string, string | undefined>)[c.name]} triggerTitle="Category description" descriptionHeading="About this category" />
                  </span>
                </td>
                {/* Totals render bold in the default (black) text colour — review feedback. */}
                <td style={L.fz("app")} className="px-2 py-2 text-right border-t bg-card"><Num value={approvedT} kind="strong" /></td>
                <td style={L.fz("exp")} className="px-2 py-2 text-right border-t bg-card"><Num value={expT} kind="strong" /></td>
                <td style={L.fz("diff")} className={cn("px-2 py-2 text-right border-t bg-card", !showProposed && "border-r")}><Num value={approvedT - expT} kind="diff" /></td>
                {showProposed && (
                  <>
                    {/* The one editable cell in the Total block: what the partner
                        asks to spend on this category over the whole project. */}
                    <td style={L.fz("prop")} className="px-1 py-1 text-right border-l border-t bg-crafd-yellow/10">
                      <Input
                        value={edits[c.id]?.prop ?? ""}
                        onChange={(e) => update(c.id, { prop: numericAmount(e.target.value) })}
                        inputMode="decimal"
                        placeholder="0"
                        className="h-8 text-sm text-right tabular-nums"
                        aria-label={`New requested total budget for ${c.name}`}
                      />
                    </td>
                    {/* Deviation of what has been spent from what is now proposed. */}
                    <td style={L.fz("pdiff")} className="px-2 py-2 text-right border-r border-t bg-card"><Num value={num(proposedT) - expT} kind="diff" /></td>
                  </>
                )}
                <td className="px-1 py-1 border-l border-t bg-crafd-yellow/10 min-w-[200px]">
                  <Textarea
                    value={edits[c.id]?.comment ?? ""}
                    onChange={(e) => update(c.id, { comment: e.target.value })}
                    placeholder="Include all the key outputs yearwise."
                    className="text-xs min-h-[60px] resize-y w-full"
                  />
                </td>
                {columnYears.map((y) => {
                    const ap = budFor(y, c.id);
                    // Years without a report show only the approved annual budget.
                    if (!hasReport(y)) return <ApprovedOnlyCell key={y} approved={ap} extension={extensionSet.has(y)} />;
                    const editable = y === currentYear;
                    const ex = expFor(y, c.id);
                    return (
                      <YearCells
                        key={y}
                        editable={editable}
                        past={y !== currentYear}
                        approved={ap}
                        exp={ex}
                        diff={num(ap) - num(ex)}
                        expInput={edits[c.id]?.exp ?? ""}
                        onExp={(v) => update(c.id, { exp: numericAmount(v) })}
                      />
                    );
                  })}
                </tr>
              );
            })}
            {/* The sub total carries the overspend verdict and nothing else:
                orange past 10%, red past 20%. The reallocation rule has its own
                notice above the table, which is where it stays — two different
                flags on one row would say less, not more. */}
            {computedRow({
              label: "Project costs sub total",
              flag:
                overspendLevel === "steering" ? "error" :
                overspendLevel === "crafd" ? "warn" : undefined,
              hint:
                overspendLevel === "steering"
                  ? `Categories are overspent by ${formatAmount(overspendTotal)} — ${overspendShare.toFixed(1)}%, so the steering committee has to approve the budget.`
                  : `Categories are overspent by ${formatAmount(overspendTotal)} — ${overspendShare.toFixed(1)}%, so CRAFd needs to check the budget.`,
              approvedT: sumApprovedTotal,
              expT: sumExpTotal,
              proposedT: sumProposedTotal,
              approvedYear: (y) => sumApproved(y),
              expYear: (y) => sumExp(y),
            })}
            {/* Approved indirect costs follow the rate; what was spent on them is
                entered for the reported year and summed across the years. The
                REQUESTED figure is pinned to the approved one — the grant size
                cannot change, so neither can the indirect support costs, and a
                cell that moved while the categories were being retyped only
                invited confusion. */}
            {computedRow({
              label: `Indirect support costs (${Math.round(indirectRate * 100)}%)`,
              flag: iscOverClaimed ? "error" : undefined,
              hint: "More has been reported than the approved indirect support costs.",
              approvedT: withIndirect(sumApprovedTotal, indirectRate),
              expT: iscTotal,
              proposedT: iscCeiling,
              proposedTitle: `Fixed at ${Math.round(indirectRate * 100)}% of the approved project costs — a budget revision cannot change it.`,
              approvedYear: (y) => withIndirect(sumApproved(y), indirectRate),
              expYear: (y) => iscFor(y),
              expInput: isUpdate ? { value: iscExp, onChange: setIsc } : undefined,
            })}
            {computedRow({
              label: "Total",
              strong: true,
              approvedT: withIndirect(sumApprovedTotal, 1 + indirectRate),
              expT: sumExpTotal + iscTotal,
              // Requested project costs plus the fixed indirect support costs:
              // once the categories add back up, this lands on the approved total.
              proposedT: sumProposedTotal + iscCeiling,
              approvedYear: (y) => withIndirect(sumApproved(y), 1 + indirectRate),
              expYear: (y) => sumExp(y) + num(iscFor(y)),
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Header sub-cells for one year (approved / expenditure / difference / comment).
// `toDate` marks a year still running — a project update that is not also the
// annual report asks for the spending so far, not a closed annual figure. The
// difference is this year's approved annual budget less this year's spending.
// `top` is the measured height of the row above, so this row pins directly
// under it however tall it turns out to be.
function FragmentYearHead({ current, toDate = false, fillHeight = false, top }: { current: boolean; toDate?: boolean; fillHeight?: boolean; top: number }) {
  const sticky = fillHeight && "sticky z-30";
  const style = fillHeight ? { position: "sticky" as const, top } : undefined;
  const bg = current ? CURRENT_YEAR_HEAD : "bg-neutral-50";
  return (
    <>
      <th style={style} className={cn("px-2 py-1.5 text-right border-l border-b min-w-[100px]", SUBHEAD_TEXT, bg, sticky)}>Approved annual budget</th>
      <th style={style} className={cn("px-2 py-1.5 text-right border-b min-w-[100px]", SUBHEAD_TEXT, bg, sticky)}>{toDate ? "Annual expenditure (to date)" : "Annual expenditure"}</th>
      <th style={style} className={cn("px-2 py-1.5 text-right border-b min-w-[90px]", SUBHEAD_TEXT, bg, sticky)}>Difference</th>
    </>
  );
}

// Header sub-cell for a non-current year: only the approved annual budget is
// shown (partners can't enter expenditure/comments for years that aren't their
// current report year). A year the extension adds is tinted and has no approved
// budget to show — the time is proposed, not granted.
function ApprovedOnlyHead({ fillHeight = false, extension = false, top }: { fillHeight?: boolean; extension?: boolean; top: number }) {
  const sticky = fillHeight && "sticky z-30";
  return (
    <th style={fillHeight ? { position: "sticky", top } : undefined} className={cn("px-2 py-1.5 text-right border-l border-b min-w-[100px]", SUBHEAD_TEXT, extension ? EXTENSION_HEAD : "bg-neutral-50", sticky)}>Approved annual budget</th>
  );
}

// Body / footer cell for a non-current year: only the approved annual budget.
function ApprovedOnlyCell({ approved, extension = false }: { approved: number | null; extension?: boolean }) {
  return (
    <td className={cn("px-2 py-2 text-right border-l border-t", extension && EXTENSION_CELL)}>
      <Num value={approved} kind="approved" />
    </td>
  );
}

// Body cells for one year on a category row.
function YearCells({
  editable, past = false, approved, exp, diff, expInput, onExp,
}: {
  editable: boolean;
  past?: boolean;
  approved: number | null;
  exp: number | null;
  diff: number;
  expInput: string;
  onExp: (v: string) => void;
}) {
  return (
    <>
      <td className={cn("px-2 py-2 text-right border-l border-t", past && "bg-neutral-50 opacity-60")}>
        <Num value={approved} kind="approved" />
      </td>
      <td className={cn("px-1 py-1 text-right border-t", editable && "bg-crafd-yellow/10", past && "bg-neutral-50 opacity-60")}>
        {editable ? (
          <Input
            value={expInput}
            onChange={(e) => onExp(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="h-8 text-sm text-right tabular-nums"
          />
        ) : (
          <Num value={exp} />
        )}
      </td>
      <td className={cn("px-2 py-2 text-right border-t", past && "bg-neutral-50 opacity-60")}><Num value={diff} kind="diff" /></td>
    </>
  );
}

// Footer (computed) cells for one year. `expInput` makes the expenditure cell
// editable — the indirect support costs row on a project update, where what was
// spent is entered rather than derived from the rate.
function FooterYearCells({
  approved, exp, strong, past = false, expInput,
}: {
  approved: number;
  // Null where nothing has been entered — the indirect support costs row on an
  // update only holds the years someone has filled in.
  exp: number | null;
  strong?: boolean;
  past?: boolean;
  expInput?: { value: string; onChange: (v: string) => void };
}) {
  return (
    <>
      <td className={cn("px-2 py-2 text-right border-l border-t", past && "opacity-60")}><Num value={approved} kind="approved" /></td>
      <td className={cn(expInput ? "px-1 py-1 bg-crafd-yellow/10" : "px-2 py-2", "text-right border-t", past && "opacity-60")}>
        {expInput ? (
          <Input
            value={expInput.value}
            onChange={(e) => expInput.onChange(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            className="h-8 text-sm text-right tabular-nums"
            aria-label="Indirect support costs spent"
          />
        ) : (
          <Num value={exp} kind={strong ? "strong" : "plain"} />
        )}
      </td>
      <td className={cn("px-2 py-2 text-right border-t", past && "opacity-60")}><Num value={approved - num(exp)} kind="diff" /></td>
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin editor — approved annual budgets per category × year + indirect rate
// ═══════════════════════════════════════════════════════════════════════════

export function ExpenditureAdminEditor({ projectId, isAdmin = true, fillHeight = false, onSaveStateChange, refreshKey }: { projectId: number; isAdmin?: boolean; fillHeight?: boolean; onSaveStateChange?: (s: SaveState) => void; refreshKey?: number }) {
  const [categories, setCategories] = useState<ExpenditureCategory[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({}); // `${catId}-${year}` → string
  const [categoryNotes, setCategoryNotes] = useState<Record<number, string>>({}); // catId → description
  // The indirect support cost rate is project-level admin data, edited here.
  // `rate` is the persisted fraction (0.07); `rateInput` is the editable
  // percentage string shown in the field.
  const [rate, setRate] = useState(0.07);
  const [rateInput, setRateInput] = useState("7");
  const [grantSize, setGrantSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Mirror saves to the page-level indicator when the parent listens (review
  // feedback: "All changes saved" now also covers the Budgets tab).
  useEffect(() => { onSaveStateChange?.(saveState); }, [saveState, onSaveStateChange]);
  const [error, setError] = useState<string | null>(null);

  const dirtyAmountsRef = useRef<Set<string>>(new Set());
  const dirtyCatNotesRef = useRef<Set<number>>(new Set());
  const amountsRef = useRef<Record<string, string>>({});
  const categoryNotesRef = useRef<Record<number, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => { amountsRef.current = amounts; }, [amounts]);
  useEffect(() => { categoryNotesRef.current = categoryNotes; }, [categoryNotes]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catRes, budRes, projRes] = await Promise.all([
        fetch("/api/expenditure-categories"),
        fetch(`/api/expenditure-budgets?projectId=${projectId}`),
        fetch(`/api/projects/${projectId}`),
      ]);
      if (!catRes.ok || !budRes.ok || !projRes.ok) throw new Error("Failed to load expenditure setup");
      const cats: ExpenditureCategory[] = await catRes.json();
      const bud: { indirectRate: number; years: number[]; budgets: BudgetRow[]; categoryNotes: { category_id: number; description: string | null }[] } = await budRes.json();
      const proj: { grant_size_usd: number | null } = await projRes.json();
      setCategories(cats);
      setYears(bud.years);
      setRate(bud.indirectRate);
      setRateInput(String(Math.round(bud.indirectRate * 100 * 100) / 100));
      setGrantSize(proj.grant_size_usd);
      const m: Record<string, string> = {};
      for (const b of bud.budgets) {
        const key = `${b.category_id}-${b.year}`;
        if (b.approved_amount != null) m[key] = String(b.approved_amount);
      }
      setAmounts(m);
      const notes: Record<number, string> = {};
      for (const n of bud.categoryNotes ?? []) {
        if (n.description) notes[n.category_id] = n.description;
      }
      setCategoryNotes(notes);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Quiet re-fetch when the parent switches back to the Budgets tab (refreshKey
  // increments). No spinner — existing rows stay visible during the background update.
  useEffect(() => {
    if (!refreshKey) return;
    (async () => {
      try {
        const [catRes, budRes, projRes] = await Promise.all([
          fetch("/api/expenditure-categories"),
          fetch(`/api/expenditure-budgets?projectId=${projectId}`),
          fetch(`/api/projects/${projectId}`),
        ]);
        if (!catRes.ok || !budRes.ok || !projRes.ok) return;
        const cats: ExpenditureCategory[] = await catRes.json();
        const bud: { indirectRate: number; years: number[]; budgets: BudgetRow[]; categoryNotes: { category_id: number; description: string | null }[] } = await budRes.json();
        const proj: { grant_size_usd: number | null } = await projRes.json();
        setCategories(cats);
        setYears(bud.years);
        setRate(bud.indirectRate);
        setRateInput(String(Math.round(bud.indirectRate * 100 * 100) / 100));
        setGrantSize(proj.grant_size_usd);
        const m: Record<string, string> = {};
        for (const b of bud.budgets) {
          const key = `${b.category_id}-${b.year}`;
          if (b.approved_amount != null) m[key] = String(b.approved_amount);
        }
        setAmounts(m);
        const notes: Record<number, string> = {};
        for (const n of bud.categoryNotes ?? []) {
          if (n.description) notes[n.category_id] = n.description;
        }
        setCategoryNotes(notes);
      } catch { /* quiet */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const flush = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const amountKeys = Array.from(dirtyAmountsRef.current);
      dirtyAmountsRef.current.clear();
      const noteCatIds = Array.from(dirtyCatNotesRef.current);
      dirtyCatNotesRef.current.clear();
      for (const key of amountKeys) {
        const [catId, year] = key.split("-").map(Number);
        const res = await fetch("/api/expenditure-budgets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            categoryId: catId,
            year,
            approved_amount: parseAmount(amountsRef.current[key] ?? ""),
          }),
        });
        if (!res.ok) throw new Error("Failed to save budget");
      }
      for (const catId of noteCatIds) {
        const note = (categoryNotesRef.current[catId] ?? "").trim();
        const res = await fetch("/api/expenditure-budgets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            categoryId: catId,
            description: note === "" ? null : note,
          }),
        });
        if (!res.ok) throw new Error("Failed to save description");
      }
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (dirtyAmountsRef.current.size || dirtyCatNotesRef.current.size) flushRef.current();
    }
  };
  flushRef.current = flush;

  const scheduleFlush = useCallback(() => {
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => flushRef.current(), 700);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (dirtyAmountsRef.current.size || dirtyCatNotesRef.current.size) flushRef.current();
  }, []);

  function setAmount(catId: number, year: number, raw: string) {
    const v = numericAmount(raw);
    const key = `${catId}-${year}`;
    setAmounts((prev) => ({ ...prev, [key]: v }));
    dirtyAmountsRef.current.add(key);
    scheduleFlush();
  }

  function setCategoryNote(catId: number, v: string) {
    setCategoryNotes((prev) => ({ ...prev, [catId]: v }));
    dirtyCatNotesRef.current.add(catId);
    scheduleFlush();
  }

  // Persist the indirect rate on blur/change. Percentage in the field → stored
  // as a fraction. Empty input falls back to the 7% default.
  async function commitRate() {
    const pct = rateInput.trim() === "" ? 7 : Number(rateInput);
    if (isNaN(pct)) { setRateInput(String(Math.round(rate * 100 * 100) / 100)); return; }
    const fraction = pct / 100;
    if (fraction === rate) return;
    setRate(fraction);
    setSaveState("saving");
    try {
      const res = await fetch("/api/expenditure-budgets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, indirect_cost_rate: fraction }),
      });
      if (!res.ok) throw new Error("Failed to save rate");
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
      setSaveState("error");
    }
  }

  const amt = (catId: number, year: number) => parseAmount(amounts[`${catId}-${year}`] ?? "");
  const catTotal = (catId: number) => years.reduce((a, y) => a + num(amt(catId, y)), 0);
  const yearSub = (year: number) => categories.reduce((a, c) => a + num(amt(c.id, year)), 0);
  const totalSub = categories.reduce((a, c) => a + catTotal(c.id), 0);

  if (loading) return <LoadingState />;

  const totalBudget = Math.round(totalSub * (1 + rate) * 100) / 100;
  return (
    <div className={cn("rounded-xl border bg-card p-6 space-y-4", fillHeight && "flex flex-col flex-1 min-h-0 space-y-0 gap-4")}>
      <div className="flex items-center gap-2">
        <Wallet className="size-4 text-muted-foreground" />
        <h3 className="t-heading-sub">{labels.generalInfo.budget.heading}</h3>
      </div>
      <p className="text-xs text-muted-foreground">{labels.generalInfo.budget.description}</p>
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      {years.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No report years exist for this project yet. Approved annual budgets are entered per reporting year.
        </div>
      ) : (
        <>
          <div className={cn("rounded-xl border", fillHeight ? "flex-1 min-h-0 overflow-auto" : "overflow-x-auto")}>
            <p className="px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">Annual budget (USD) per category</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th style={fillHeight ? { boxShadow: HEAD_SHADOW } : undefined} className={cn("text-left px-3 py-2 text-muted-foreground min-w-[220px]", HEAD_TEXT, fillHeight && "sticky top-0 z-10 bg-neutral-100")}>Budget categories</th>
                  <th style={fillHeight ? { boxShadow: HEAD_SHADOW_L } : undefined} className={cn("px-2 py-2 text-right border-l min-w-[110px]", HEAD_TEXT, fillHeight && "sticky top-0 z-10 bg-neutral-100")}>Total budgets</th>
                  <th style={fillHeight ? { boxShadow: HEAD_SHADOW_L } : undefined} className={cn("px-2 py-2 text-left border-l min-w-[200px] w-72", HEAD_TEXT, fillHeight && "sticky top-0 z-10 bg-neutral-100")}>Description</th>
                  {years.map((y) => (
                    <th key={y} style={fillHeight ? { boxShadow: HEAD_SHADOW_L } : undefined} className={cn("px-2 py-2 text-right border-l min-w-[110px]", HEAD_TEXT, fillHeight && "sticky top-0 z-10 bg-neutral-100")}>{y}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/10">
                    <td className="px-3 py-2 border-r">
                      <span className="inline-flex items-center gap-1">
                        {c.name}
                        <InfoPopover description={(labels.expenditure.categoryDescriptions as Record<string, string | undefined>)[c.name]} triggerTitle="Category description" descriptionHeading="About this category" />
                      </span>
                    </td>
                    {/* Per-category total renders bold in the default (black) colour — review feedback. */}
                    <td className="px-2 py-2 text-right border-l"><Num value={catTotal(c.id)} kind="strong" /></td>
                    <td className="px-2 py-1 border-l w-72">
                      <Textarea
                        value={categoryNotes[c.id] ?? ""}
                        onChange={(e) => setCategoryNote(c.id, e.target.value)}
                        placeholder="Include all the key outputs yearwise."
                        className="text-xs min-h-[60px] resize-y w-full"
                      />
                    </td>
                    {years.map((y) => (
                      <td key={y} className="px-1 py-1 border-l">
                        <Input
                          value={amounts[`${c.id}-${y}`] ?? ""}
                          onChange={(e) => setAmount(c.id, y, e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          className="h-8 w-full min-w-0 flex-1 text-sm text-right tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="border-t bg-neutral-100 font-semibold">
                  <td className="px-3 py-2 border-r">Project costs sub total</td>
                  <td className="px-2 py-2 text-right border-l"><Num value={totalSub} /></td>
                  <td className="border-l" />
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y)} /></td>))}
                </tr>
                <tr className="border-t bg-muted/30">
                  <td className="px-3 py-2 border-r">Indirect support costs ({Math.round(rate * 100)}%)</td>
                  <td className="px-2 py-2 text-right border-l"><Num value={totalSub * rate} /></td>
                  <td className="border-l" />
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y) * rate} /></td>))}
                </tr>
                <tr className="border-t bg-neutral-100 font-semibold">
                  <td className="px-3 py-2 border-r">Total</td>
                  <td className="px-2 py-2 text-right border-l"><Num value={totalBudget} kind="strong" /></td>
                  <td className="border-l" />
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y) * (1 + rate)} kind="strong" /></td>))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Below table: compact rate editor (admin-only) + funding summary */}
          {isAdmin && (
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm text-muted-foreground shrink-0">Indirect support cost rate</span>
              <Input
                inputMode="decimal"
                value={rateInput}
                onChange={(e) => setRateInput(numericAmount(e.target.value))}
                onBlur={commitRate}
                className="h-8 w-20 text-sm text-right tabular-nums"
              />
              <span className="text-sm text-muted-foreground">%</span>
              {/* When the parent shows the page-level indicator, skip this inline copy. */}
              {!onSaveStateChange && (saveState === "saving" ? (
                <span className="flex items-center gap-1.5 text-muted-foreground text-xs"><Loader2 className="size-3 animate-spin" /> {labels.common.saving}</span>
              ) : saveState === "saved" ? (
                <span className="flex items-center gap-1.5 text-green-600 text-xs"><CheckCircle2 className="size-4" /> {labels.common.saved}</span>
              ) : saveState === "error" ? (
                <span className="text-xs text-destructive">{labels.common.saveFailed}</span>
              ) : null)}
            </div>
          )}
          <FundingSummary kind="budget" requested={grantSize} total={totalBudget} />
        </>
      )}
    </div>
  );
}

