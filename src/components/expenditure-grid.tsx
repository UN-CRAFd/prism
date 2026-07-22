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
import labels from "@/lib/labels.json";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutosave, type SaveState } from "@/components/autosave";
import { formatAmount, num, type ExpenditureCategory } from "@/lib/expenditure";

// ─────────────────────────────────────────────────────────────────────────────
// Expenditure reporting grid. Stored inputs are approved annual budgets (admin)
// and actual annual expenditure (partner). Every total / sub-total / indirect /
// difference is computed here from those two.
// ─────────────────────────────────────────────────────────────────────────────

interface BudgetRow { category_id: number; year: number; approved_amount: number | null }
interface ExpRow { category_id: number; year: number; annual_expenditure: number | null; comment: string | null }

interface ExpenditurePayload {
  indirectRate: number;
  currentYear: number;
  categories: ExpenditureCategory[];
  years: number[];
  budgets: BudgetRow[];
  expenditure: ExpRow[];
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
const FCOL = {
  cat:  { left: 0,   w: 240 },
  app:  { left: 240, w: 130 },
  exp:  { left: 370, w: 130 },
  diff: { left: 500, w: 120 },
} as const;
const FROZEN_WIDTH = 620; // cat + app + exp + diff

function fz(key: keyof typeof FCOL, z = 20): CSSProperties {
  const c = FCOL[key];
  return { position: "sticky", left: c.left, width: c.w, minWidth: c.w, maxWidth: c.w, zIndex: z };
}

// ═══════════════════════════════════════════════════════════════════════════
// Partner editor — enter the current report year's expenditure + comments
// ═══════════════════════════════════════════════════════════════════════════

interface EditState { exp: string; comment: string; dirty: boolean }

export function ExpenditurePartnerEditor({
  reportId,
  onSaveStateChange,
}: {
  reportId: number;
  onSaveStateChange?: (s: SaveState) => void;
}) {
  const [data, setData] = useState<ExpenditurePayload | null>(null);
  const [edits, setEdits] = useState<Record<number, EditState>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dataRef = useRef<ExpenditurePayload | null>(null);
  useEffect(() => { dataRef.current = data; }, [data]);
  const editsRef = useRef<Record<number, EditState>>({});
  useEffect(() => { editsRef.current = edits; }, [edits]);

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
          comment: e?.comment ?? "",
          dirty: false,
        };
      }
      setEdits(init);
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

  // Save every dirty category. A category's dirty flag is only cleared if its
  // value hasn't changed since we snapshotted it, so edits made mid-save survive.
  const flush = useCallback(async () => {
    const d = dataRef.current;
    if (!d) return;
    const dirty = d.categories.filter((c) => editsRef.current[c.id]?.dirty);
    const snaps = new Map(dirty.map((c) => {
      const e = editsRef.current[c.id];
      return [c.id, JSON.stringify({ exp: e.exp, comment: e.comment })];
    }));
    await Promise.all(dirty.map((c) => {
      const e = editsRef.current[c.id];
      return fetch("/api/expenditure", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          categoryId: c.id,
          annual_expenditure: parseAmount(e.exp),
          comment: e.comment || null,
        }),
      }).then((r) => { if (!r.ok) throw new Error(`Failed to save ${c.name}`); });
    }));
    setEdits((prev) => {
      const n = { ...prev };
      for (const c of dirty) {
        const cur = prev[c.id];
        if (cur && JSON.stringify({ exp: cur.exp, comment: cur.comment }) === snaps.get(c.id)) {
          n[c.id] = { ...cur, dirty: false };
        }
      }
      return n;
    });
  }, [reportId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => { flushNow(); }, [flushNow]);

  function update(catId: number, patch: Partial<EditState>) {
    setEdits((prev) => ({ ...prev, [catId]: { ...prev[catId], ...patch, dirty: true } }));
    schedule();
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {labels.common.loading}</div>;
  }
  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  }
  if (!data) return null;

  const { categories, years, currentYear, indirectRate } = data;

  const budFor = (year: number, catId: number) => budgetMap[year]?.[catId] ?? null;
  const expFor = (year: number, catId: number): number | null =>
    year === currentYear ? parseAmount(edits[catId]?.exp ?? "") : (storedExpMap[year]?.[catId] ?? null);
  const approvedTotal = (catId: number) => years.reduce((a, y) => a + num(budFor(y, catId)), 0);
  const totalExp = (catId: number) => years.reduce((a, y) => a + num(expFor(y, catId)), 0);

  // Column sums for the computed rows.
  const sumApprovedTotal = categories.reduce((a, c) => a + approvedTotal(c.id), 0);
  const sumExpTotal = categories.reduce((a, c) => a + totalExp(c.id), 0);
  const sumApproved = (y: number) => categories.reduce((a, c) => a + num(budFor(y, c.id)), 0);
  const sumExp = (y: number) => categories.reduce((a, c) => a + num(expFor(y, c.id)), 0);

  const withIndirect = (sub: number, mult: number) => sub * mult; // sub, indirect, or total via mult

  // Render a computed footer row (sub total / indirect / total) across all columns.
  function ComputedRow({ label, mult, strong }: { label: string; mult: number; strong?: boolean }) {
    // mult: 1 = sub total base, rate = indirect, 1+rate = total
    const appT = withIndirect(sumApprovedTotal, mult);
    const expT = withIndirect(sumExpTotal, mult);
    const bg = strong ? "bg-neutral-100" : "bg-neutral-50";
    return (
      <tr className={cn("border-t", bg, strong && "font-semibold")}>
        <td style={fz("cat")} className={cn("px-3 py-2 text-sm border-r border-t", bg)}>{label}</td>
        <td style={fz("app")} className={cn("px-3 py-2 text-right border-t", bg)}><Num value={appT} kind="approved" /></td>
        <td style={fz("exp")} className={cn("px-3 py-2 text-right border-t", bg)}><Num value={expT} kind={strong ? "strong" : "plain"} /></td>
        <td style={fz("diff")} className={cn("px-3 py-2 text-right border-r border-t", bg)}><Num value={appT - expT} kind="diff" /></td>
        {years.map((y) => {
          const ap = withIndirect(sumApproved(y), mult);
          const ex = withIndirect(sumExp(y), mult);
          return (
            <FooterYearCells key={y} approved={ap} exp={ex} strong={strong} />
          );
        })}
      </tr>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="text-sm border-separate border-spacing-0" style={{ minWidth: FROZEN_WIDTH }}>
        <thead>
          <tr className="text-xs">
            <th rowSpan={2} style={fz("cat", 30)} className="text-left px-3 py-2 font-medium text-muted-foreground border-r border-b bg-neutral-100 align-bottom">Budget categories</th>
            <th colSpan={3} style={{ position: "sticky", left: FCOL.app.left, zIndex: 30 }} className="px-2 py-2 text-center font-semibold text-muted-foreground border-r border-b bg-neutral-100">Total</th>
            {years.map((y) => (
              <th key={y} colSpan={4} className={cn("px-2 py-2 text-center font-semibold text-muted-foreground border-l border-b", y === currentYear ? "bg-crafd-yellow/20" : "bg-neutral-100")}>{y}</th>
            ))}
          </tr>
          <tr className="text-[11px] text-muted-foreground">
            <th style={fz("app", 30)} className="px-2 py-1.5 text-right font-medium border-b bg-neutral-50">Approved total budget</th>
            <th style={fz("exp", 30)} className="px-2 py-1.5 text-right font-medium border-b bg-neutral-50">Total expenditure</th>
            <th style={fz("diff", 30)} className="px-2 py-1.5 text-right font-medium border-r border-b bg-neutral-50">Difference</th>
            {years.map((y) => (
              <FragmentYearHead key={y} current={y === currentYear} />
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c) => {
            const appT = approvedTotal(c.id);
            const expT = totalExp(c.id);
            return (
              <tr key={c.id}>
                <td style={fz("cat")} className="px-3 py-2 border-r border-t bg-card">{c.name}</td>
                <td style={fz("app")} className="px-2 py-2 text-right border-t bg-card"><Num value={appT} kind="approved" /></td>
                <td style={fz("exp")} className="px-2 py-2 text-right border-t bg-card"><Num value={expT} /></td>
                <td style={fz("diff")} className="px-2 py-2 text-right border-r border-t bg-card"><Num value={appT - expT} kind="diff" /></td>
                {years.map((y) => {
                    const editable = y === currentYear;
                    const ap = budFor(y, c.id);
                    const ex = expFor(y, c.id);
                    return (
                      <YearCells
                        key={y}
                        editable={editable}
                        approved={ap}
                        exp={ex}
                        diff={num(ap) - num(ex)}
                        expInput={edits[c.id]?.exp ?? ""}
                        comment={editable ? (edits[c.id]?.comment ?? "") : (data.expenditure.find((x) => x.category_id === c.id && x.year === y)?.comment ?? "")}
                        onExp={(v) => update(c.id, { exp: v })}
                        onComment={(v) => update(c.id, { comment: v })}
                      />
                    );
                  })}
                </tr>
              );
            })}
            <ComputedRow label="Project costs sub total" mult={1} />
            <ComputedRow label={`Indirect support costs (${Math.round(indirectRate * 100)}%)`} mult={indirectRate} />
            <ComputedRow label="Total" mult={1 + indirectRate} strong />
          </tbody>
        </table>
      </div>
  );
}

// Header sub-cells for one year (approved / expenditure / difference / comment).
function FragmentYearHead({ current }: { current: boolean }) {
  return (
    <>
      <th className={cn("px-2 py-1.5 text-right font-medium border-l border-b min-w-[100px]", current ? "bg-crafd-yellow/20" : "bg-neutral-50")}>Approved annual budget</th>
      <th className={cn("px-2 py-1.5 text-right font-medium border-b min-w-[100px]", current ? "bg-crafd-yellow/20" : "bg-neutral-50")}>Annual expenditure</th>
      <th className={cn("px-2 py-1.5 text-right font-medium border-b min-w-[90px]", current ? "bg-crafd-yellow/20" : "bg-neutral-50")}>Difference</th>
      <th className={cn("px-2 py-1.5 text-left font-medium border-b min-w-[160px]", current ? "bg-crafd-yellow/20" : "bg-neutral-50")}>Comment</th>
    </>
  );
}

// Body cells for one year on a category row.
function YearCells({
  editable, approved, exp, diff, expInput, comment, onExp, onComment,
}: {
  editable: boolean;
  approved: number | null;
  exp: number | null;
  diff: number;
  expInput: string;
  comment: string;
  onExp: (v: string) => void;
  onComment: (v: string) => void;
}) {
  return (
    <>
      <td className="px-2 py-2 text-right border-l border-t"><Num value={approved} kind="approved" /></td>
      <td className={cn("px-1 py-1 text-right border-t", editable && "bg-crafd-yellow/10")}>
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
      <td className="px-2 py-2 text-right border-t"><Num value={diff} kind="diff" /></td>
      <td className={cn("px-1 py-1 border-t", editable && "bg-crafd-yellow/10")}>
        {editable ? (
          <Textarea value={comment} onChange={(e) => onComment(e.target.value)} placeholder="Comment…" className="text-xs min-h-[36px] resize-y" />
        ) : (
          <span className="text-xs text-muted-foreground">{comment}</span>
        )}
      </td>
    </>
  );
}

// Footer (computed) cells for one year.
function FooterYearCells({ approved, exp, strong }: { approved: number; exp: number; strong?: boolean }) {
  return (
    <>
      <td className="px-2 py-2 text-right border-l border-t"><Num value={approved} kind="approved" /></td>
      <td className="px-2 py-2 text-right border-t"><Num value={exp} kind={strong ? "strong" : "plain"} /></td>
      <td className="px-2 py-2 text-right border-t"><Num value={approved - exp} kind="diff" /></td>
      <td className="px-2 py-2 border-t" />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Admin editor — approved annual budgets per category × year + indirect rate
// ═══════════════════════════════════════════════════════════════════════════

export function ExpenditureAdminEditor({ projectId, isAdmin = true }: { projectId: number; isAdmin?: boolean }) {
  const [categories, setCategories] = useState<ExpenditureCategory[]>([]);
  const [years, setYears] = useState<number[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({}); // `${catId}-${year}` → string
  // The indirect support cost rate is project-level admin data, edited here.
  // `rate` is the persisted fraction (0.07); `rateInput` is the editable
  // percentage string shown in the field.
  const [rate, setRate] = useState(0.07);
  const [rateInput, setRateInput] = useState("7");
  const [grantSize, setGrantSize] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);

  const dirtyRef = useRef<Set<string>>(new Set());
  const amountsRef = useRef<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  useEffect(() => { amountsRef.current = amounts; }, [amounts]);

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
      const bud: { indirectRate: number; years: number[]; budgets: BudgetRow[] } = await budRes.json();
      const proj: { grant_size_usd: number | null } = await projRes.json();
      setCategories(cats);
      setYears(bud.years);
      setRate(bud.indirectRate);
      setRateInput(String(Math.round(bud.indirectRate * 100 * 100) / 100));
      setGrantSize(proj.grant_size_usd);
      const m: Record<string, string> = {};
      for (const b of bud.budgets) {
        if (b.approved_amount != null) m[`${b.category_id}-${b.year}`] = String(b.approved_amount);
      }
      setAmounts(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const flush = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaveState("saving");
    try {
      const keys = Array.from(dirtyRef.current);
      dirtyRef.current.clear();
      for (const key of keys) {
        const [catId, year] = key.split("-").map(Number);
        const res = await fetch("/api/expenditure-budgets", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, categoryId: catId, year, approved_amount: parseAmount(amountsRef.current[key] ?? "") }),
        });
        if (!res.ok) throw new Error("Failed to save budget");
      }
      setSaveState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.common.saveFailed);
      setSaveState("error");
    } finally {
      savingRef.current = false;
      if (dirtyRef.current.size) flushRef.current();
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
    if (dirtyRef.current.size) flushRef.current();
  }, []);

  function setAmount(catId: number, year: number, v: string) {
    const key = `${catId}-${year}`;
    setAmounts((prev) => ({ ...prev, [key]: v }));
    dirtyRef.current.add(key);
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

  if (loading) {
    return <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {labels.common.loading}</div>;
  }

  const totalBudget = totalSub * (1 + rate);
  const availableBalance = grantSize ? grantSize - totalBudget : null;

  return (
    <div className="space-y-4">
      {error && <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>}

      {years.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No report years exist for this project yet. Approved annual budgets are entered per reporting year.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <p className="px-4 py-2 text-xs font-medium text-muted-foreground border-b bg-muted/30">Approved annual budget (USD) per category</p>
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground min-w-[220px]">Budget categories</th>
                  {years.map((y) => (
                    <th key={y} className="px-2 py-2 text-right text-xs font-semibold border-l min-w-[110px]">{y}</th>
                  ))}
                  <th className="px-2 py-2 text-right text-xs font-semibold border-l min-w-[110px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-muted/10">
                    <td className="px-3 py-2 border-r">{c.name}</td>
                    {years.map((y) => (
                      <td key={y} className="px-1 py-1 border-l">
                        <Input
                          value={amounts[`${c.id}-${y}`] ?? ""}
                          onChange={(e) => setAmount(c.id, y, e.target.value)}
                          inputMode="decimal"
                          placeholder="0"
                          className="h-8 text-sm text-right tabular-nums"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-2 text-right border-l"><Num value={catTotal(c.id)} kind="approved" /></td>
                  </tr>
                ))}
                <tr className="border-t bg-neutral-100 font-semibold">
                  <td className="px-3 py-2 border-r">Project costs sub total</td>
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y)} /></td>))}
                  <td className="px-2 py-2 text-right border-l"><Num value={totalSub} /></td>
                </tr>
                <tr className="border-t bg-muted/30">
                  <td className="px-3 py-2 border-r">Indirect support costs ({Math.round(rate * 100)}%)</td>
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y) * rate} /></td>))}
                  <td className="px-2 py-2 text-right border-l"><Num value={totalSub * rate} /></td>
                </tr>
                <tr className="border-t bg-neutral-100 font-semibold">
                  <td className="px-3 py-2 border-r">Total</td>
                  {years.map((y) => (<td key={y} className="px-2 py-2 text-right border-l"><Num value={yearSub(y) * (1 + rate)} kind="strong" /></td>))}
                  <td className="px-2 py-2 text-right border-l"><Num value={totalBudget} kind="strong" /></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Below table: indirect rate editor + balance box */}
          <div className="grid gap-4 lg:grid-cols-2">
            {/* Indirect rate editor */}
            {isAdmin && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <label className="text-sm font-medium text-muted-foreground">Indirect support cost rate</label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number" min="0" max="100" step="0.01"
                    value={rateInput}
                    onChange={(e) => setRateInput(e.target.value)}
                    onBlur={commitRate}
                    className="h-9 w-20 text-sm text-right tabular-nums"
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {saveState === "saving" ? (
                  <span className="flex items-center gap-1.5 text-muted-foreground text-xs"><Loader2 className="size-3 animate-spin" /> {labels.common.saving}</span>
                ) : saveState === "saved" ? (
                  <span className="flex items-center gap-1.5 text-green-600 text-xs"><CheckCircle2 className="size-4" /> {labels.common.saved}</span>
                ) : saveState === "error" ? (
                  <span className="text-xs text-destructive">{labels.common.saveFailed}</span>
                ) : null}
              </div>
            )}

            {/* Available balance */}
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <label className="text-sm font-medium text-muted-foreground">Available balance</label>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Grant size:</span>
                  <span className="font-semibold tabular-nums">{grantSize ? formatAmount(grantSize) : "—"}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total budget:</span>
                  <span className="font-semibold tabular-nums">{formatAmount(totalBudget)}</span>
                </div>
                <div className={`flex justify-between text-sm pt-2 border-t ${availableBalance !== null && availableBalance < 0 ? "text-red-600" : ""}`}>
                  <span className="font-medium">Available:</span>
                  <span className={`font-bold tabular-nums ${availableBalance === null ? "text-muted-foreground" : availableBalance < 0 ? "text-red-600" : "text-green-700"}`}>
                    {availableBalance !== null ? formatAmount(availableBalance) : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
