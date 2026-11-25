"use client";

import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Textarea } from "@/components/ui/textarea";
import { impactLabel, likelihoodLabel } from "@/lib/risk";
import { workplanStatusNeedsDetail } from "@/lib/workplan";
import {
  parseAmount,
  type ExtractedActivity,
  type ExtractedExpenditure,
  type ExtractedFunding,
  type ExtractedRisk,
  type QuantApplyPayload,
  type ReportExtraction,
} from "@/lib/report-import";
import { Field, INPUT, PageTag, ReviewItem, RowTag, SectionCard, SelectButtons, Selectable } from "@/components/admin/report-import-ui";
import type { PdfHighlight } from "@/components/admin/pdf-highlight-viewer";
import type { SheetHighlight } from "@/components/admin/sheet-preview";

// ─────────────────────────────────────────────────────────────────────────────
// Report Import — review of the quantitative sheets other than Indicators:
// risks, work plan, budget, transfers and complementary funding.
// What the report already holds comes from /api/report-import (`quant`); only
// empty fields are filled when the import is applied (lib/report-import-quant).
// ─────────────────────────────────────────────────────────────────────────────

/** What the report holds today (QuantContext from the server). */
export interface QuantCurrent {
  risks: {
    id: number;
    risk_name: string;
    carried: boolean;
    updated_likelihood: number | null;
    updated_impact: number | null;
    updated_mitigation: string | null;
  }[];
  activities: {
    id: number;
    activity_num: string | null;
    activity_text: string | null;
    entry_status: string | null;
    entry_comment: string | null;
  }[];
  categories: { id: number; name: string; annual_expenditure: string | null; comment: string | null }[];
  indirect_expenditure: string | null;
  transfers: { name: string; amount: string | null }[];
  complementary: { name: string; amount: string | null }[];
  no_transfers_confirmed: boolean;
  no_complementary_confirmed: boolean;
}

export interface QuantOptions {
  riskCategory: string[];
  workplanStatus: string[];
  transferPartnerType: string[];
  complementaryFundingType: string[];
}

interface RiskProposal {
  source: ExtractedRisk;
  /** Report risk to update, or null with `create` (a new risk on this report). */
  riskId: number | null;
  create: { name: string; description: string; categories: string[] } | null;
  likelihood: number | null;
  impact: number | null;
  mitigation: string;
  revision: boolean | null;
  selected: boolean;
}

interface ActivityProposal {
  source: ExtractedActivity;
  activityId: number | null;
  /** Add the activity to the project document (project level). */
  create: boolean;
  status: string;
  comment: string;
  selected: boolean;
}

interface ExpenseProposal {
  source: ExtractedExpenditure;
  categoryId: number | null;
  value: string;
  comment: string;
  selected: boolean;
}

interface FundingProposal {
  source: ExtractedFunding;
  name: string;
  website: string;
  type: string;
  amount: string;
  selected: boolean;
}

export interface QuantProposals {
  risks: RiskProposal[];
  activities: ActivityProposal[];
  expenses: ExpenseProposal[];
  isc: { value: string; selected: boolean; row: number | null } | null;
  transfers: FundingProposal[];
  complementary: FundingProposal[];
  transfersNone: { selected: boolean } | null;
  complementaryNone: { selected: boolean } | null;
}

const blank = (v: string | null | undefined) => !v || !v.trim();
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ── Building the proposals ───────────────────────────────────────────────────

export function buildQuantProposals(ex: ReportExtraction, cur: QuantCurrent, opts: QuantOptions): QuantProposals {
  const riskById = new Map(cur.risks.map((r) => [r.id, r]));
  const claimedRisks = new Set<number>();
  const risks: RiskProposal[] = ex.risks.map((r) => {
    const match = r.match_risk_id ? riskById.get(r.match_risk_id) ?? null : null;
    const usable = match && !claimedRisks.has(match.id) ? match : null;
    if (usable) claimedRisks.add(usable.id);
    const empty = usable ? usable.updated_likelihood === null || usable.updated_impact === null || blank(usable.updated_mitigation) : true;
    return {
      source: r,
      riskId: usable?.id ?? null,
      // Unmatched risks become new risks of this report (report level only).
      create: usable
        ? null
        : { name: r.name, description: r.description ?? "", categories: r.categories.filter((c) => opts.riskCategory.includes(c)) },
      likelihood: r.updated_likelihood,
      impact: r.updated_impact,
      mitigation: r.updated_mitigation ?? "",
      revision: r.project_revision,
      selected: empty,
    };
  });

  const activityById = new Map(cur.activities.map((a) => [a.id, a]));
  const claimedActivities = new Set<number>();
  const activities: ActivityProposal[] = ex.workplan.map((a) => {
    const match = a.match_activity_id ? activityById.get(a.match_activity_id) ?? null : null;
    const usable = match && !claimedActivities.has(match.id) ? match : null;
    if (usable) claimedActivities.add(usable.id);
    return {
      source: a,
      activityId: usable?.id ?? null,
      create: false,
      status: a.status && opts.workplanStatus.includes(a.status) ? a.status : "",
      comment: a.comment ?? "",
      // Adding activities changes the project document, so it is never pre-ticked.
      selected: !!usable && (blank(usable.entry_status) || blank(usable.entry_comment)),
    };
  });

  const expenses: ExpenseProposal[] = ex.expenditure.entries.map((e) => {
    const cat = cur.categories.find((c) => sameName(c.name, e.category)) ?? null;
    return {
      source: e,
      categoryId: cat?.id ?? null,
      value: e.annual_expenditure ?? "",
      comment: e.comment ?? "",
      selected: !!cat && (cat.annual_expenditure === null || blank(cat.comment)),
    };
  });

  const funding = (rows: ExtractedFunding[], existing: { name: string; amount: string | null }[], types: string[]) =>
    rows.map((f) => {
      const there = existing.find((x) => sameName(x.name, f.name));
      return {
        source: f,
        name: f.name,
        website: f.website ?? "",
        type: f.type && types.includes(f.type) ? f.type : "",
        amount: f.amount ?? "",
        selected: !there || there.amount === null,
      };
    });

  return {
    risks,
    activities,
    expenses,
    isc: ex.expenditure.indirect_expenditure
      ? { value: ex.expenditure.indirect_expenditure, selected: cur.indirect_expenditure === null, row: ex.expenditure.indirect_row }
      : null,
    transfers: funding(ex.transfers.rows, cur.transfers, opts.transferPartnerType),
    complementary: funding(ex.complementary.rows, cur.complementary, opts.complementaryFundingType),
    transfersNone:
      ex.transfers.none && !ex.transfers.rows.length && !cur.transfers.length && !cur.no_transfers_confirmed ? { selected: true } : null,
    complementaryNone:
      ex.complementary.none && !ex.complementary.rows.length && !cur.complementary.length && !cur.no_complementary_confirmed
        ? { selected: true }
        : null,
  };
}

/** Items that will be written; also the incomplete ones that block the import. */
export function quantCounts(p: QuantProposals | null) {
  if (!p) return { total: 0, newActivities: 0, invalid: 0 };
  const risks = p.risks.filter((r) => r.selected && (r.riskId !== null || r.create));
  const acts = p.activities.filter((a) => a.selected && (a.activityId !== null || a.create));
  const exp = p.expenses.filter((e) => e.selected && e.categoryId !== null);
  const funds = [...p.transfers, ...p.complementary].filter((f) => f.selected);
  const invalid =
    risks.filter((r) => r.create && blank(r.create.name)).length +
    exp.filter((e) => !blank(e.value) && parseAmount(e.value) === null).length +
    funds.filter((f) => blank(f.name) || (!blank(f.amount) && parseAmount(f.amount) === null)).length +
    (p.isc?.selected && parseAmount(p.isc.value) === null ? 1 : 0);
  return {
    total:
      risks.length + acts.length + exp.length + funds.length +
      (p.isc?.selected ? 1 : 0) + (p.transfersNone?.selected ? 1 : 0) + (p.complementaryNone?.selected ? 1 : 0),
    newActivities: acts.filter((a) => a.create).length,
    invalid,
  };
}

export function quantPayload(p: QuantProposals): QuantApplyPayload {
  const clean = (v: string) => (v.trim() ? v.trim() : null);
  const fund = (rows: FundingProposal[]) =>
    rows
      .filter((f) => f.selected && !blank(f.name))
      .map((f) => ({ name: f.name.trim(), website: clean(f.website), type: f.type || null, amount: parseAmount(f.amount) }));
  return {
    risks: p.risks
      .filter((r) => r.selected && (r.riskId !== null || r.create))
      .map((r) => ({
        risk_id: r.riskId,
        create: r.riskId === null && r.create
          ? { name: r.create.name.trim(), description: clean(r.create.description), categories: r.create.categories }
          : null,
        updated_likelihood: r.likelihood,
        updated_impact: r.impact,
        updated_mitigation: clean(r.mitigation),
        project_revision: r.revision,
      })),
    workplan: p.activities
      .filter((a) => a.selected && (a.activityId !== null || a.create))
      .map((a) => ({
        activity_id: a.activityId,
        create: a.activityId === null && a.create
          ? {
              objective_num: a.source.objective ? a.source.objective.match(/^[^\s:]+/)?.[0] ?? null : null,
              objective_text: a.source.objective,
              activity_num: a.source.number,
              activity_text: a.source.text,
              implementing_agent: a.source.implementing_agent,
              planned_quarters: a.source.planned_quarters,
            }
          : null,
        status: a.status || null,
        comment: clean(a.comment),
        updated_quarters: workplanStatusNeedsDetail(a.status) ? a.source.updated_quarters : null,
      })),
    expenditure: p.expenses
      .filter((e) => e.selected && e.categoryId !== null)
      .map((e) => ({ category_id: e.categoryId as number, annual_expenditure: parseAmount(e.value), comment: clean(e.comment) })),
    indirect_expenditure: p.isc?.selected ? parseAmount(p.isc.value) : null,
    transfers: fund(p.transfers),
    complementary: fund(p.complementary),
    transfers_none: !!p.transfersNone?.selected,
    complementary_none: !!p.complementaryNone?.selected,
  };
}

/** What to mark in the source: PDF text per item, spreadsheet rows per item. */
export function quantHighlights(ex: ReportExtraction): { pdf: PdfHighlight[]; sheet: SheetHighlight[] } {
  const sheets = ex.source?.sheets ?? {};
  const pdf: PdfHighlight[] = [];
  const sheet: SheetHighlight[] = [];
  const add = (id: string, section: string, loc: { page?: number | null; row?: number | null }, texts: (string | null)[]) => {
    pdf.push({ id, page: loc.page ?? null, texts: texts.filter((t): t is string => !!t) });
    sheet.push({ id, row: loc.row ?? null, sheet: sheets[section] ?? null });
  };
  ex.risks.forEach((r, i) => add(`risk-${i}`, "risks", r, [r.name, r.updated_mitigation]));
  ex.workplan.forEach((a, i) => add(`activity-${i}`, "workplan", a, [a.text, a.comment]));
  ex.expenditure.entries.forEach((e, i) => add(`expense-${i}`, "expenditure", e, [e.category, e.comment]));
  if (ex.expenditure.indirect_expenditure) add("isc", "expenditure", { row: ex.expenditure.indirect_row }, []);
  ex.transfers.rows.forEach((f, i) => add(`transfer-${i}`, "transfers", f, [f.name]));
  ex.complementary.rows.forEach((f, i) => add(`complementary-${i}`, "complementary", f, [f.name]));
  return { pdf, sheet };
}

// ── Review sections ──────────────────────────────────────────────────────────

export function QuantReview({
  proposals,
  current,
  options,
  prodocStatus,
  activeId,
  onActivate,
  onChange,
}: {
  proposals: QuantProposals;
  current: QuantCurrent;
  options: QuantOptions;
  prodocStatus: string | null;
  activeId: string | null;
  onActivate: (id: string) => void;
  onChange: (next: QuantProposals) => void;
}) {
  const p = proposals;
  const set = <K extends keyof QuantProposals>(k: K, v: QuantProposals[K]) => onChange({ ...p, [k]: v });
  const setAt = <T,>(list: T[], i: number, next: T) => list.map((x, j) => (j === i ? next : x));
  const item = (id: string, children: React.ReactNode) => (
    <ReviewItem key={id} id={id} activeId={activeId} onActivate={onActivate}>
      {children}
    </ReviewItem>
  );

  return (
    <>
      {/* ── Risks ── */}
      {p.risks.length > 0 && (
        <SectionCard
          title="Risks"
          subtitle={`${p.risks.length} found · ${p.risks.filter((r) => r.riskId).length} matched to this report's ${current.risks.length} risks · only empty fields are filled`}
          actions={
            <SelectButtons
              onAll={() => set("risks", p.risks.map((r) => ({ ...r, selected: r.riskId !== null || !!r.create })))}
              onNone={() => set("risks", p.risks.map((r) => ({ ...r, selected: false })))}
            />
          }
        >
          {p.risks.map((r, i) =>
            item(
              `risk-${i}`,
              <Selectable
                selected={r.selected}
                onToggle={(on) => set("risks", setAt(p.risks, i, { ...r, selected: on }))}
                label="Import this risk"
              >
                <p className="text-sm font-medium">
                  {r.source.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{r.source.origin === "new" ? "new in this report" : "existing risk"}</span>
                </p>
                <Field label="Risk in PRISM">
                  <select
                    className={INPUT}
                    value={r.riskId ?? ""}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      set(
                        "risks",
                        setAt(p.risks, i, {
                          ...r,
                          riskId: id,
                          create: id ? null : r.create ?? { name: r.source.name, description: r.source.description ?? "", categories: [] },
                        })
                      );
                    }}
                  >
                    <option value="">+ Add as a new risk of this report</option>
                    {current.risks.map((x) => (
                      <option key={x.id} value={x.id}>{x.risk_name}</option>
                    ))}
                  </select>
                </Field>
                {r.create && (
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                    <Field label="Name *">
                      <input className={INPUT} value={r.create.name} onChange={(e) => set("risks", setAt(p.risks, i, { ...r, create: { ...r.create!, name: e.target.value } }))} />
                    </Field>
                    <Field label="Category">
                      <select
                        className={INPUT}
                        value={r.create.categories[0] ?? ""}
                        onChange={(e) =>
                          set("risks", setAt(p.risks, i, { ...r, create: { ...r.create!, categories: e.target.value ? [e.target.value] : [] } }))
                        }
                      >
                        <option value="">Not set</option>
                        {options.riskCategory.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <Field label="Updated likelihood">
                    <select className={INPUT} value={r.likelihood ?? ""} onChange={(e) => set("risks", setAt(p.risks, i, { ...r, likelihood: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">Not set</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n} – {likelihoodLabel(n)}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Updated impact">
                    <select className={INPUT} value={r.impact ?? ""} onChange={(e) => set("risks", setAt(p.risks, i, { ...r, impact: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">Not set</option>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={n}>{n} – {impactLabel(n)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Updated mitigation">
                  <Textarea className="min-h-9" value={r.mitigation} onChange={(e) => set("risks", setAt(p.risks, i, { ...r, mitigation: e.target.value }))} />
                </Field>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" className="size-3.5 accent-black" checked={r.revision === true} onChange={(e) => set("risks", setAt(p.risks, i, { ...r, revision: e.target.checked }))} />
                  Leads to a project revision
                </label>
                <span className="flex gap-2"><PageTag page={r.source.page ?? null} /><RowTag row={r.source.row} /></span>
              </Selectable>
            )
          )}
        </SectionCard>
      )}

      {/* ── Work plan ── */}
      {p.activities.length > 0 && (
        <SectionCard
          title="Work plan"
          subtitle={`${p.activities.length} activities · ${p.activities.filter((a) => a.activityId).length} matched to the project's ${current.activities.length} activities`}
          actions={
            <>
              {p.activities.some((a) => a.activityId === null && !a.create) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-auto h-7 text-xs"
                  onClick={() => set("activities", p.activities.map((a) => (a.activityId === null ? { ...a, create: true, selected: true } : a)))}
                >
                  Add {p.activities.filter((a) => a.activityId === null && !a.create).length} unmatched as new
                </Button>
              )}
              <SelectButtons
                onAll={() => set("activities", p.activities.map((a) => ({ ...a, selected: a.activityId !== null || a.create })))}
                onNone={() => set("activities", p.activities.map((a) => ({ ...a, selected: false })))}
              />
            </>
          }
        >
          {p.activities.some((a) => a.create) && (
            <div className="px-5 pt-4">
              <Notice variant={prodocStatus === "Approved" ? "error" : "info"}>
                {p.activities.filter((a) => a.create).length} activit(ies) will be added to the project&apos;s work plan
                {prodocStatus ? ` (project document: ${prodocStatus})` : ""}, with the approved timeline from the partner&apos;s report.
              </Notice>
            </div>
          )}
          {p.activities.map((a, i) => {
            const match = a.activityId ? current.activities.find((x) => x.id === a.activityId) : null;
            return item(
              `activity-${i}`,
              <Selectable
                selected={a.selected}
                disabled={a.activityId === null && !a.create}
                onToggle={(on) => set("activities", setAt(p.activities, i, { ...a, selected: on }))}
                label="Import this activity"
              >
                <p className="text-sm font-medium">
                  {a.source.number && <span className="mr-1.5 text-muted-foreground">{a.source.number}</span>}
                  {a.source.text}
                </p>
                <Field label="Activity in PRISM">
                  <select
                    className={INPUT}
                    value={a.create ? "__new__" : a.activityId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const next =
                        v === "__new__"
                          ? { ...a, activityId: null, create: true, selected: true }
                          : { ...a, activityId: v ? Number(v) : null, create: false, selected: !!v };
                      set("activities", setAt(p.activities, i, next));
                    }}
                  >
                    <option value="">— Not imported —</option>
                    <option value="__new__">+ Add as a new activity to the project</option>
                    {current.activities.map((x) => (
                      <option key={x.id} value={x.id}>{[x.activity_num, x.activity_text].filter(Boolean).join(" — ") || `Activity #${x.id}`}</option>
                    ))}
                  </select>
                </Field>
                {match && !blank(match.entry_status) && (
                  <p className="text-xs italic text-muted-foreground">Already reported in PRISM ({match.entry_status}). Only empty fields will be filled.</p>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                  <Field label="Status">
                    <select className={INPUT} value={a.status} onChange={(e) => set("activities", setAt(p.activities, i, { ...a, status: e.target.value }))}>
                      <option value="">Not set</option>
                      {options.workplanStatus.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label={workplanStatusNeedsDetail(a.status) ? "Updated timeline (from the report)" : "Timeline"}>
                    <p className="text-xs leading-9 text-muted-foreground truncate">
                      {workplanStatusNeedsDetail(a.status)
                        ? a.source.updated_quarters.join(", ") || "—"
                        : "Unchanged (a new timeline is only kept for Delayed, At Risk or Suspended)"}
                    </p>
                  </Field>
                </div>
                <Field label="Comment">
                  <Textarea className="min-h-9" value={a.comment} onChange={(e) => set("activities", setAt(p.activities, i, { ...a, comment: e.target.value }))} />
                </Field>
                <span className="flex gap-2"><PageTag page={a.source.page ?? null} /><RowTag row={a.source.row} /></span>
              </Selectable>
            );
          })}
        </SectionCard>
      )}

      {/* ── Budget ── */}
      {(p.expenses.length > 0 || p.isc) && (
        <SectionCard
          title="Budget"
          subtitle="Annual expenditure per category · only empty fields are filled"
          actions={
            <SelectButtons
              onAll={() => onChange({ ...p, expenses: p.expenses.map((e) => ({ ...e, selected: e.categoryId !== null })), isc: p.isc && { ...p.isc, selected: true } })}
              onNone={() => onChange({ ...p, expenses: p.expenses.map((e) => ({ ...e, selected: false })), isc: p.isc && { ...p.isc, selected: false } })}
            />
          }
        >
          {p.expenses.map((e, i) => {
            const cat = current.categories.find((c) => c.id === e.categoryId);
            const bad = !blank(e.value) && parseAmount(e.value) === null;
            return item(
              `expense-${i}`,
              <Selectable
                selected={e.selected}
                disabled={e.categoryId === null}
                onToggle={(on) => set("expenses", setAt(p.expenses, i, { ...e, selected: on }))}
                label="Import this category"
              >
                <p className="text-sm font-medium">{cat?.name ?? e.source.category}</p>
                {!cat && <p className="text-xs italic text-muted-foreground">No PRISM budget category with this name; not imported.</p>}
                {cat?.annual_expenditure !== null && cat?.annual_expenditure !== undefined && (
                  <p className="text-xs italic text-muted-foreground">Already in PRISM: {cat.annual_expenditure}. Only the empty comment can be filled.</p>
                )}
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                  <Field label="Annual expenditure (USD)">
                    <input className={INPUT} value={e.value} onChange={(ev) => set("expenses", setAt(p.expenses, i, { ...e, value: ev.target.value }))} />
                  </Field>
                  <Field label="Comment">
                    <Textarea className="min-h-9" value={e.comment} onChange={(ev) => set("expenses", setAt(p.expenses, i, { ...e, comment: ev.target.value }))} />
                  </Field>
                </div>
                {bad && <p className="text-xs font-medium text-destructive">Not a number. Use digits only, e.g. 12,500.</p>}
                <span className="flex gap-2"><PageTag page={e.source.page ?? null} /><RowTag row={e.source.row} /></span>
              </Selectable>
            );
          })}
          {p.isc &&
            item(
              "isc",
              <Selectable selected={p.isc.selected} onToggle={(on) => set("isc", { ...p.isc!, selected: on })} label="Import indirect support costs">
                <p className="text-sm font-medium">Indirect support costs</p>
                {current.indirect_expenditure !== null && (
                  <p className="text-xs italic text-muted-foreground">Already in PRISM: {current.indirect_expenditure}. Not changed.</p>
                )}
                <Field label="Indirect support costs spent (USD)">
                  <input className={INPUT} value={p.isc.value} onChange={(e) => set("isc", { ...p.isc!, value: e.target.value })} />
                </Field>
                {parseAmount(p.isc.value) === null && <p className="text-xs font-medium text-destructive">Not a number.</p>}
                <RowTag row={p.isc.row} />
              </Selectable>
            )}
        </SectionCard>
      )}

      {/* ── Transfers / complementary funding ── */}
      {(
        [
          { key: "transfers", noneKey: "transfersNone", title: "Transfers to implementing partners", noun: "organisation", types: options.transferPartnerType, prefix: "transfer" },
          { key: "complementary", noneKey: "complementaryNone", title: "Complementary funding", noun: "contributor", types: options.complementaryFundingType, prefix: "complementary" },
        ] as const
      ).map((s) => {
        const rows = p[s.key];
        const none = p[s.noneKey];
        if (!rows.length && !none) return null;
        return (
          <SectionCard
            key={s.key}
            title={s.title}
            subtitle={rows.length ? `${rows.length} ${s.noun}(s) with an amount this year` : "None this year"}
            actions={
              rows.length ? (
                <SelectButtons
                  onAll={() => set(s.key, rows.map((f) => ({ ...f, selected: true })))}
                  onNone={() => set(s.key, rows.map((f) => ({ ...f, selected: false })))}
                />
              ) : undefined
            }
          >
            {none && (
              <div className="px-5 py-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-black" checked={none.selected} onChange={(e) => set(s.noneKey, { selected: e.target.checked })} />
                  Confirm &quot;none this year&quot; in the report (the partner&apos;s table is empty)
                </label>
              </div>
            )}
            {rows.map((f, i) =>
              item(
                `${s.prefix}-${i}`,
                <Selectable selected={f.selected} onToggle={(on) => set(s.key, setAt(rows, i, { ...f, selected: on }))} label={`Import this ${s.noun}`}>
                  <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-2">
                    <Field label="Name">
                      <input className={INPUT} value={f.name} onChange={(e) => set(s.key, setAt(rows, i, { ...f, name: e.target.value }))} />
                    </Field>
                    <Field label="Amount (USD)">
                      <input className={INPUT} value={f.amount} onChange={(e) => set(s.key, setAt(rows, i, { ...f, amount: e.target.value }))} />
                    </Field>
                    <Field label="Website">
                      <input className={INPUT} value={f.website} onChange={(e) => set(s.key, setAt(rows, i, { ...f, website: e.target.value }))} />
                    </Field>
                    <Field label="Type">
                      <select className={INPUT} value={f.type} onChange={(e) => set(s.key, setAt(rows, i, { ...f, type: e.target.value }))}>
                        <option value="">Not set</option>
                        {s.types.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  {!blank(f.amount) && parseAmount(f.amount) === null && <p className="text-xs font-medium text-destructive">Not a number.</p>}
                  {f.source.linked_activities && (
                    <p className="text-xs text-muted-foreground">
                      Linked activities in the report: {f.source.linked_activities} <span className="italic">(link them in the report editor)</span>
                    </p>
                  )}
                  <span className="flex gap-2"><PageTag page={f.source.page ?? null} /><RowTag row={f.source.row} /></span>
                </Selectable>
              )
            )}
          </SectionCard>
        );
      })}
    </>
  );
}
