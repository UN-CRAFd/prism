"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { UploadCloud, FileText, X, Download, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Notice } from "@/components/ui/notice";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, projectSlug } from "@/lib/utils";
import { PdfHighlightViewer, type PdfHighlight } from "@/components/admin/pdf-highlight-viewer";
import { SheetPreview, type SheetHighlight } from "@/components/admin/sheet-preview";
import {
  QuantReview,
  buildQuantProposals,
  quantCounts,
  quantHighlights,
  quantPayload,
  type QuantCurrent,
  type QuantOptions,
  type QuantProposals,
} from "@/components/admin/report-import-quant";
import { Field, INPUT, PageTag, ReviewItem, SectionCard, SelectButtons } from "@/components/admin/report-import-ui";
import { cycleLabel, statusLabel } from "@/lib/indicators";
import {
  LIST_SECTIONS,
  TESTIMONIAL_FIELDS,
  TESTIMONIAL_KIND_MAX,
  matchOption,
  matchSurvey,
  normaliseExtraction,
  type ApplyPayload,
  type ApplyResult,
  type ExtractedIndicator,
  type ExtractionKind,
  type ImportTestimonialKind,
  type ListSectionDef,
  type ListSectionKey,
  type ReportExtraction,
} from "@/lib/report-import";

// ─────────────────────────────────────────────────────────────────────────────
// Admin › Report Import
// Upload a partner's narrative report (PDF) or quantitative report (Excel or
// PDF), review what was found next to the source document (extracted parts
// highlighted), tick what to keep, and apply. Only empty survey answers and
// indicator results are filled; rows are only ever added (never overwritten).
// ─────────────────────────────────────────────────────────────────────────────

interface ReportOpt {
  id: number;
  year: number;
  status: string;
  report_type?: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  archived?: boolean;
}

type Row = Record<string, string | null> & { id: number };

interface IndicatorLine {
  /** indicator_data.id */
  id: number;
  indicator_id: number;
  name: string;
  category: string | null;
  baseline_value: string | null;
  target_value: string | null;
  achieved_value: string | null;
  status: string | null;
  comment: string | null;
}

interface CurrentData {
  report: ReportOpt & { report_submission_date: string | null };
  surveys: { id: number; question: string; assessment: number | null; context: string | null }[];
  sections: Record<ListSectionKey, Row[]>;
  testimonials: (Row & { kind: ImportTestimonialKind })[];
  indicators: IndicatorLine[];
  indicatorStatuses: string[];
  /** The project document new indicators would be added to. */
  prodoc: { id: number; status: string } | null;
  /** Risks, work plan, budget, transfers, complementary funding (quantitative report). */
  quant: QuantCurrent;
  options: Record<string, string[]>;
}

/** A new project indicator being prepared in the review (all fields editable). */
interface IndicatorDraft {
  name: string;
  description: string;
  means_of_verification: string;
  category: string;
  cycle: "yearly" | "at_closure";
  baseline_value: string;
  baseline_year: string;
  target_value: string;
  target_year: string;
}

function draftFrom(src: ExtractedIndicator, categories: string[]): IndicatorDraft {
  return {
    name: src.name,
    description: src.description ?? "",
    means_of_verification: src.means_of_verification ?? "",
    category: src.category && categories.includes(src.category) ? src.category : "",
    cycle: src.cycle ?? "at_closure",
    baseline_value: src.baseline_value ?? "",
    baseline_year: src.baseline_year ? String(src.baseline_year) : "",
    target_value: src.target_value ?? "",
    target_year: src.target_year ? String(src.target_year) : "",
  };
}

const draftMissing = (d: IndicatorDraft) =>
  [!d.name.trim() && "name", !d.description.trim() && "description", !d.means_of_verification.trim() && "means of verification"].filter(
    Boolean
  ) as string[];

interface IndicatorProposal {
  source: ExtractedIndicator;
  /** Report indicator line this row fills (indicator_data.id), or null = not imported. */
  lineId: number | null;
  /** Set instead of lineId: add the indicator to the project document first. */
  create: IndicatorDraft | null;
  achieved: string;
  status: string;
  comment: string;
  selected: boolean;
}

const lineFilled = (l: IndicatorLine) => !isEmpty(l.achieved_value) && !isEmpty(l.status) && !isEmpty(l.comment);

interface SurveyProposal {
  question: string;
  page: number | null;
  match: CurrentData["surveys"][number] | null;
  assessment: number | null;
  context: string;
  selected: boolean;
}

interface RowProposal {
  page: number | null;
  values: Record<string, string>;
  selected: boolean;
}

interface Proposals {
  date: { value: string; selected: boolean } | null;
  surveys: SurveyProposal[];
  sections: Record<ListSectionKey, RowProposal[]>;
  testimonials: Record<ImportTestimonialKind, RowProposal[]>;
  indicators: IndicatorProposal[];
  quant: QuantProposals;
}

function isEmpty(v: string | null | undefined) {
  return !v || !v.trim();
}

function buildProposals(ex: ReportExtraction, cur: CurrentData): Proposals {
  const surveys: SurveyProposal[] = ex.surveys.map((s) => {
    const m = matchSurvey(s.question, cur.surveys)?.row ?? null;
    const fillable = !!m && (m.assessment === null || isEmpty(m.context));
    return {
      question: s.question,
      page: s.page ?? null,
      match: m,
      assessment: s.assessment,
      context: s.context ?? "",
      selected: fillable,
    };
  });

  const sections = {} as Proposals["sections"];
  for (const def of LIST_SECTIONS) {
    const existing = cur.sections[def.key]?.length ?? 0;
    const room = def.max === undefined ? Infinity : Math.max(0, def.max - existing);
    sections[def.key] = (ex.sections[def.key] ?? []).map((r, i) => {
      const values: Record<string, string> = {};
      for (const f of def.fields) {
        const raw = typeof r[f.key] === "string" ? (r[f.key] as string) : "";
        values[f.key] = f.optionGroup ? matchOption(raw, cur.options[f.optionGroup] ?? []) ?? "" : raw;
      }
      // Pre-tick only when the section is still empty and the row fits the cap.
      return { page: typeof r.page === "number" ? r.page : null, values, selected: existing === 0 && i < room };
    });
  }

  const testimonials = { leadership: [], partner: [] } as Proposals["testimonials"];
  for (const kind of Object.keys(TESTIMONIAL_KIND_MAX) as ImportTestimonialKind[]) {
    const existing = cur.testimonials.filter((t) => t.kind === kind).length;
    const room = Math.max(0, TESTIMONIAL_KIND_MAX[kind] - existing);
    testimonials[kind] = ex.testimonials
      .filter((t) => t.kind === kind)
      .map((t, i) => ({
        page: t.page ?? null,
        values: Object.fromEntries(TESTIMONIAL_FIELDS.map((f) => [f.key, t[f.key] ?? ""])),
        selected: existing === 0 && i < room,
      }));
  }

  // Indicators: the suggested PRISM indicator becomes the report line to fill.
  // Pre-tick when the line still has an empty field; each line only once.
  const lineByIndicator = new Map(cur.indicators.map((l) => [l.indicator_id, l]));
  const claimed = new Set<number>();
  const indicators: IndicatorProposal[] = ex.indicators.map((ind) => {
    const line = ind.match_indicator_id ? lineByIndicator.get(ind.match_indicator_id) ?? null : null;
    const status = ind.status && cur.indicatorStatuses.includes(ind.status) ? ind.status : "";
    const selected = !!line && !claimed.has(line.id) && !lineFilled(line);
    if (line && selected) claimed.add(line.id);
    return {
      source: ind,
      lineId: line?.id ?? null,
      create: null,
      achieved: ind.achieved_value ?? "",
      status,
      comment: ind.comment ?? "",
      selected,
    };
  });

  return {
    date: ex.report_submission_date
      ? { value: ex.report_submission_date, selected: !cur.report.report_submission_date }
      : null,
    surveys,
    sections,
    testimonials,
    indicators,
    quant: buildQuantProposals(ex, cur.quant, quantOptions(cur)),
  };
}

function quantOptions(cur: CurrentData): QuantOptions {
  return {
    riskCategory: cur.options.riskCategory ?? [],
    workplanStatus: cur.options.workplanStatus ?? [],
    transferPartnerType: cur.options.transferPartnerType ?? [],
    complementaryFundingType: cur.options.complementaryFundingType ?? [],
  };
}

function reportLabel(r: ReportOpt) {
  const type = r.report_type ? ` ${r.report_type === "final" ? "Final" : "Annual"}` : "";
  return `${r.partner_short_name.toUpperCase()} · ${r.project_short_name || r.project_title} · ${r.year}${type}`;
}

// ── Small building blocks ────────────────────────────────────────────────────

function OptionSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
    >
      <option value="">Not set</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

// Editable proposed row (list sections + testimonials).
function ProposedRow({
  fields,
  row,
  options,
  hint,
  onChange,
}: {
  fields: ListSectionDef["fields"] | typeof TESTIMONIAL_FIELDS;
  row: RowProposal;
  options: Record<string, string[]>;
  /** Why the row is not pre-selected; shown while it is unticked. */
  hint?: string | null;
  onChange: (next: RowProposal) => void;
}) {
  return (
    <div className={cn("flex gap-3", !row.selected && "opacity-50")}>
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-black"
        checked={row.selected}
        onChange={(e) => onChange({ ...row, selected: e.target.checked })}
        aria-label="Import this item"
      />
      <div className="flex-1 min-w-0 space-y-2">
        {!row.selected && hint && <p className="text-xs italic text-muted-foreground">{hint}</p>}
        {fields.map((f) => {
          const group = "optionGroup" in f ? f.optionGroup : undefined;
          return (
            <Field key={f.key} label={f.label}>
              {group ? (
                <OptionSelect
                  value={row.values[f.key] ?? ""}
                  options={options[group] ?? []}
                  onChange={(v) => onChange({ ...row, values: { ...row.values, [f.key]: v } })}
                />
              ) : (
                <Textarea
                  value={row.values[f.key] ?? ""}
                  onChange={(e) => onChange({ ...row, values: { ...row.values, [f.key]: e.target.value } })}
                  className="min-h-9"
                />
              )}
            </Field>
          );
        })}
        <PageTag page={row.page} />
      </div>
    </div>
  );
}

// Definition of a new project indicator, prefilled from the partner's report.
// Same required fields as the project-document editor.
function NewIndicatorFields({
  draft,
  categories,
  onChange,
}: {
  draft: IndicatorDraft;
  categories: string[];
  onChange: (next: IndicatorDraft) => void;
}) {
  const set = (k: keyof IndicatorDraft, v: string) => onChange({ ...draft, [k]: v });
  const missing = draftMissing(draft);
  return (
    <div className="rounded-lg border border-dashed border-orange-300 bg-orange-50/30 p-3 space-y-2">
      <p className="text-xs font-semibold">New project indicator</p>
      <Field label="Name *">
        <input value={draft.name} onChange={(e) => set("name", e.target.value)} className={INPUT} />
      </Field>
      <Field label="Description *">
        <Textarea value={draft.description} onChange={(e) => set("description", e.target.value)} className="min-h-9" />
      </Field>
      <Field label="Means of verification *">
        <Textarea
          value={draft.means_of_verification}
          onChange={(e) => set("means_of_verification", e.target.value)}
          className="min-h-9"
        />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <Field label="Category">
          <select value={draft.category} onChange={(e) => set("category", e.target.value)} className={INPUT}>
            <option value="">Not set</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Cycle">
          <select value={draft.cycle} onChange={(e) => set("cycle", e.target.value)} className={INPUT}>
            <option value="yearly">{cycleLabel("yearly")}</option>
            <option value="at_closure">{cycleLabel("at_closure")}</option>
          </select>
        </Field>
        <Field label="Baseline value">
          <input value={draft.baseline_value} onChange={(e) => set("baseline_value", e.target.value)} className={INPUT} />
        </Field>
        <Field label="Baseline year">
          <input
            value={draft.baseline_year}
            inputMode="numeric"
            onChange={(e) => set("baseline_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
            className={INPUT}
          />
        </Field>
        <Field label="Target value">
          <input value={draft.target_value} onChange={(e) => set("target_value", e.target.value)} className={INPUT} />
        </Field>
        <Field label="Target year">
          <input
            value={draft.target_year}
            inputMode="numeric"
            onChange={(e) => set("target_year", e.target.value.replace(/\D/g, "").slice(0, 4))}
            className={INPUT}
          />
        </Field>
      </div>
      {missing.length > 0 && (
        <p className="text-xs font-medium text-destructive">Required before importing: {missing.join(", ")}.</p>
      )}
    </div>
  );
}

// ── Indicators (quantitative report) ─────────────────────────────────────────
// Each row of the partner's indicator table, with the PRISM indicator it fills.
// The match is a suggestion; the admin can pick another indicator, none, or
// add the row as a new indicator to the project document.

const NEW_INDICATOR = "__new__";

function IndicatorsCard({
  proposals,
  lines,
  statuses,
  prodoc,
  categories,
  activeId,
  onActivate,
  onChange,
  onSelectAll,
  onAddUnmatched,
}: {
  proposals: IndicatorProposal[];
  lines: IndicatorLine[];
  statuses: string[];
  prodoc: CurrentData["prodoc"];
  categories: string[];
  activeId: string | null;
  onActivate: (id: string) => void;
  onChange: (i: number, next: IndicatorProposal) => void;
  onSelectAll: (on: boolean) => void;
  onAddUnmatched: () => void;
}) {
  const lineById = new Map(lines.map((l) => [l.id, l]));
  // Lines chosen by more than one ticked row.
  const counts = new Map<number, number>();
  for (const p of proposals) if (p.selected && p.lineId !== null) counts.set(p.lineId, (counts.get(p.lineId) ?? 0) + 1);
  const matched = proposals.filter((p) => p.lineId !== null).length;
  const unmatched = proposals.filter((p) => p.lineId === null && !p.create).length;
  const creating = proposals.filter((p) => p.create).length;

  return (
    <SectionCard
      title="Indicators"
      subtitle={`${proposals.length} found · ${matched} matched to this report's ${lines.length} indicators${
        creating ? ` · ${creating} to add` : ""
      } · only empty fields are filled`}
      actions={
        <>
          {prodoc && unmatched > 0 && (
            <Button variant="outline" size="sm" className="ml-auto h-7 text-xs" onClick={onAddUnmatched}>
              Add {unmatched} unmatched as new
            </Button>
          )}
          <SelectButtons onAll={() => onSelectAll(true)} onNone={() => onSelectAll(false)} />
        </>
      }
    >
      {creating > 0 && prodoc && (
        <div className="px-5 pt-4">
          <Notice variant={prodoc.status === "Approved" ? "error" : "info"}>
            {creating} indicator(s) will be added to the project document
            {prodoc.status === "Approved" ? ", which is already approved" : ` (status: ${prodoc.status})`}, and to all of
            the project&apos;s reports and updates. Their baseline and target come from the partner&apos;s report.
          </Notice>
        </div>
      )}
      {!prodoc && (
        <div className="px-5 pt-4">
          <Notice variant="info">This project has no project document, so indicators cannot be added to it.</Notice>
        </div>
      )}
      {proposals.map((p, i) => {
        const line = p.lineId !== null ? lineById.get(p.lineId) ?? null : null;
        const duplicate = p.selected && p.lineId !== null && (counts.get(p.lineId) ?? 0) > 1;
        const src = p.source;
        return (
          <ReviewItem key={i} id={`indicator-${i}`} activeId={activeId} onActivate={onActivate}>
            <div className={cn("flex gap-3", !p.selected && "opacity-50")}>
              <input
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-black"
                checked={p.selected}
                disabled={p.lineId === null && !p.create}
                onChange={(e) => onChange(i, { ...p, selected: e.target.checked })}
                aria-label="Import this indicator"
              />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-sm font-medium">
                  {src.number && <span className="text-muted-foreground mr-1.5">{src.number}</span>}
                  {src.name}
                </p>
                {(src.baseline_value || src.target_value) && (
                  <p className="text-xs text-muted-foreground">
                    In the document: baseline {src.baseline_value ?? "—"} → target {src.target_value ?? "—"}
                  </p>
                )}

                <Field label="Fills PRISM indicator">
                  <select
                    value={p.create ? NEW_INDICATOR : p.lineId ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === NEW_INDICATOR) {
                        onChange(i, { ...p, lineId: null, create: p.create ?? draftFrom(src, categories), selected: true });
                      } else {
                        const lineId = v ? Number(v) : null;
                        onChange(i, { ...p, lineId, create: null, selected: lineId !== null });
                      }
                    }}
                    className={INPUT}
                  >
                    <option value="">— Not imported —</option>
                    {prodoc && <option value={NEW_INDICATOR}>+ Add as a new indicator to the project</option>}
                    {lines.length > 0 && (
                      <optgroup label="This report's indicators">
                        {lines.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
                {src.match_note && !p.create && <p className="text-xs italic text-muted-foreground">{src.match_note}</p>}
                {p.create && (
                  <NewIndicatorFields
                    draft={p.create}
                    categories={categories}
                    onChange={(create) => onChange(i, { ...p, create })}
                  />
                )}
                {duplicate && (
                  <p className="text-xs font-medium text-destructive">
                    Another ticked row fills the same indicator. Only the first one will be imported.
                  </p>
                )}
                {line && (
                  <p className="text-xs text-muted-foreground">
                    In PRISM: baseline {line.baseline_value ?? "—"} → target {line.target_value ?? "—"}
                    {(line.achieved_value || line.status || line.comment) && (
                      <span className="italic">
                        {" "}· already filled: {[line.achieved_value && `achieved ${line.achieved_value}`, line.status && statusLabel(line.status), line.comment && "comment"].filter(Boolean).join(", ")}
                        . Only the empty fields will be filled.
                      </span>
                    )}
                  </p>
                )}

                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
                  <Field label="Achieved value">
                    <input
                      value={p.achieved}
                      onChange={(e) => onChange(i, { ...p, achieved: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    />
                  </Field>
                  <Field label="Status">
                    <select
                      value={p.status}
                      onChange={(e) => onChange(i, { ...p, status: e.target.value })}
                      className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                    >
                      <option value="">Not set</option>
                      {statuses.map((s) => (
                        <option key={s} value={s}>{statusLabel(s)}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Comment">
                  <Textarea value={p.comment} onChange={(e) => onChange(i, { ...p, comment: e.target.value })} className="min-h-9" />
                </Field>
                <PageTag page={src.page ?? null} />
                {src.row ? <span className="text-[11px] text-muted-foreground">row {src.row}</span> : null}
              </div>
            </div>
          </ReviewItem>
        );
      })}
    </SectionCard>
  );
}

// What a quantitative report contained, per section, so a missing section is
// explained (e.g. a PDF export of a single sheet) instead of silently absent.
function QuantCoverage({ extraction: ex }: { extraction: ReportExtraction }) {
  const sections = [
    { label: "Indicators", n: ex.indicators.length },
    { label: "Risks", n: ex.risks.length },
    { label: "Work plan", n: ex.workplan.length },
    { label: "Budget", n: ex.expenditure.entries.length + (ex.expenditure.indirect_expenditure ? 1 : 0) },
    { label: "Transfers", n: ex.transfers.rows.length, none: ex.transfers.none },
    { label: "Complementary funding", n: ex.complementary.rows.length, none: ex.complementary.none },
  ];
  const missing = sections.filter((s) => !s.n && !s.none).map((s) => s.label);
  const isPdf = ex.source?.file_name?.toLowerCase().endsWith(".pdf");
  const isJson = !ex.source?.sheets || Object.keys(ex.source.sheets).length === 0;
  return (
    <Notice variant={missing.length ? "info" : "neutral"}>
      <p className="font-medium mb-1">Found in this file</p>
      <p>
        {sections
          .map((s) => `${s.label}: ${s.n ? s.n : s.none ? "none this year" : "not found"}`)
          .join(" · ")}
      </p>
      {missing.length > 0 && (
        <p className="mt-1 text-xs">
          {isPdf
            ? `Not in this PDF: ${missing.join(", ")}. A PDF export usually contains only the sheet that was printed — upload the Excel file to import every sheet.`
            : isJson
            ? `Not in this extraction file: ${missing.join(", ")}. It may have been saved before these sections were supported — upload the Excel file to extract them.`
            : `Not found: ${missing.join(", ")}. Check that the workbook has a sheet for each (e.g. "Risk Management", "Work Plan", "Expenditures").`}
        </p>
      )}
    </Notice>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ReportImportPage() {
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);

  const [reports, setReports] = useState<ReportOpt[]>([]);
  const [filter, setFilter] = useState("");
  const [reportId, setReportId] = useState<number | null>(null);
  const [current, setCurrent] = useState<CurrentData | null>(null);
  const [extraction, setExtraction] = useState<ReportExtraction | null>(null);
  const [proposals, setProposals] = useState<Proposals | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "extracting" | "loading" | "applying">(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [sheetFile, setSheetFile] = useState<File | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [docKind, setDocKind] = useState<ExtractionKind>("narrative");

  // Rows of the spreadsheet preview to mark, keyed like the ReviewItem ids.
  const sheetHighlights = useMemo<SheetHighlight[]>(
    () =>
      extraction
        ? [
            ...extraction.indicators.map((ind, i) => ({
              id: `indicator-${i}`,
              row: ind.row ?? null,
              sheet: extraction.source?.sheets?.indicators ?? null,
            })),
            ...quantHighlights(extraction).sheet,
          ]
        : [],
    [extraction]
  );

  // What to mark in the PDF: the extracted text of every item, keyed like the
  // ReviewItem ids. Built from the extraction (not the edited values), so the
  // marks show where each value came from even after it is edited.
  const highlights = useMemo<PdfHighlight[]>(() => {
    if (!extraction) return [];
    const out: PdfHighlight[] = [];
    const text = (v: unknown) => (typeof v === "string" ? v : "");
    extraction.surveys.forEach((s, i) =>
      out.push({ id: `survey-${i}`, page: s.page ?? null, texts: [s.question, text(s.context)] })
    );
    for (const def of LIST_SECTIONS) {
      (extraction.sections[def.key] ?? []).forEach((r, i) =>
        out.push({
          id: `${def.key}-${i}`,
          page: typeof r.page === "number" ? r.page : null,
          texts: def.fields.filter((f) => !f.optionGroup).map((f) => text(r[f.key])),
          // Dropdown values are PRISM's option names; the document may show them
          // cut off ("News medi…"), so they are matched by their beginning.
          prefixTexts: def.fields.filter((f) => f.optionGroup).map((f) => text(r[f.key])),
        })
      );
    }
    for (const kind of Object.keys(TESTIMONIAL_KIND_MAX) as ImportTestimonialKind[]) {
      extraction.testimonials
        .filter((t) => t.kind === kind)
        .forEach((t, i) =>
          out.push({
            id: `${kind}-${i}`,
            page: t.page ?? null,
            texts: [text(t.quote), text(t.person_name), text(t.person_title), text(t.photo_credits)],
          })
        );
    }
    extraction.indicators.forEach((ind, i) =>
      out.push({
        id: `indicator-${i}`,
        page: ind.page ?? null,
        texts: [ind.name, text(ind.achieved_value), text(ind.comment)],
      })
    );
    out.push(...quantHighlights(extraction).pdf);
    return out;
  }, [extraction]);

  useEffect(() => {
    fetch("/api/reports?data_type=report")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Failed to load reports"))))
      .then((rows: ReportOpt[]) =>
        setReports(
          rows
            .filter((r) => !r.archived)
            .sort((a, b) => b.year - a.year || reportLabel(a).localeCompare(reportLabel(b)))
        )
      )
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load reports"));
  }, []);

  async function loadCurrent(id: number) {
    setBusy("loading");
    try {
      const res = await fetch(`/api/report-import?reportId=${id}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Failed to load the report");
      setCurrent(d as CurrentData);
      return d as CurrentData;
    } finally {
      setBusy(null);
    }
  }

  async function selectReport(id: number | null) {
    setReportId(id);
    setCurrent(null);
    setProposals(null);
    setResult(null);
    setError(null);
    if (!id) return;
    try {
      const cur = await loadCurrent(id);
      if (extraction) setProposals(buildProposals(extraction, cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the report");
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    const lower = file.name.toLowerCase();
    try {
      let ex: ReportExtraction | null;
      const isPdf = lower.endsWith(".pdf");
      const isXlsx = lower.endsWith(".xlsx");
      if (lower.endsWith(".json")) {
        ex = normaliseExtraction(JSON.parse(await file.text()));
        if (!ex) throw new Error("This JSON file is not a PRISM extraction file.");
        setDocKind(ex.kind);
      } else if (isPdf || (isXlsx && docKind === "quantitative")) {
        if (!reportId) throw new Error("Choose the report first.");
        setBusy("extracting");
        const form = new FormData();
        form.append("reportId", String(reportId));
        form.append("kind", docKind);
        form.append("file", file);
        const res = await fetch("/api/report-import/extract", { method: "POST", body: form });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Extraction failed");
        ex = normaliseExtraction(d);
        if (!ex) throw new Error("The extraction result could not be read.");
      } else {
        throw new Error(
          docKind === "quantitative"
            ? "Upload the quantitative report as Excel (.xlsx) or PDF, or an extraction file (.json)."
            : "Upload the narrative report as PDF, or an extraction file (.json)."
        );
      }
      setFileName(file.name);
      setExtraction(ex);
      setActiveId(null);
      // A new document replaces the preview; a JSON file has none (add it on the right).
      setPdfFile(isPdf ? file : null);
      setSheetFile(isXlsx ? file : null);
      if (current) setProposals(buildProposals(ex, current));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The file could not be processed");
    } finally {
      setBusy(null);
    }
  }

  function clearFile() {
    setExtraction(null);
    setProposals(null);
    setFileName(null);
    setResult(null);
    setPdfFile(null);
    setSheetFile(null);
    setActiveId(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  function downloadExtraction() {
    if (!extraction) return;
    const blob = new Blob([JSON.stringify(extraction, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(fileName ?? "report").replace(/\.[^.]+$/, "")}.extraction.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const counts = useMemo(() => {
    if (!proposals) return { total: 0, newIndicators: 0, incomplete: 0, newActivities: 0 };
    let total = proposals.date?.selected ? 1 : 0;
    total += proposals.surveys.filter((s) => s.selected && s.match).length;
    for (const def of LIST_SECTIONS) total += proposals.sections[def.key].filter((r) => r.selected).length;
    total += proposals.testimonials.leadership.filter((r) => r.selected).length;
    total += proposals.testimonials.partner.filter((r) => r.selected).length;
    const importing = proposals.indicators.filter((r) => r.selected && (r.lineId !== null || r.create));
    total += importing.length;
    const newIndicators = importing.filter((r) => r.create).length;
    // New indicators need a description and a means of verification, like in the editors.
    const incomplete = importing.filter((r) => r.create && draftMissing(r.create).length).length;
    const q = quantCounts(proposals.quant);
    total += q.total;
    return { total, newIndicators, incomplete: incomplete + q.invalid, newActivities: q.newActivities };
  }, [proposals]);

  async function apply() {
    if (!proposals || !reportId || !current) return;
    const activityNote = counts.newActivities
      ? ` ${counts.newActivities} new activit(ies) will be added to the project's work plan.`
      : "";
    const prodocNote = counts.newIndicators
      ? ` ${counts.newIndicators} new indicator(s) will also be added to the project document (status: ${
          current.prodoc?.status ?? "unknown"
        }) and to all of the project's reports.`
      : "";
    const ok = await confirm({
      title: "Import into this report?",
      message: `${counts.total} item(s) will be added to ${reportLabel(current.report)}. Existing content is not changed.${prodocNote}${activityNote}`,
      confirmLabel: "Import",
      variant: "question",
    });
    if (!ok) return;

    const clean = (v: string) => (v.trim() ? v.trim() : null);
    const payload: ApplyPayload = {
      reportId,
      source_file: fileName,
      report_submission_date: proposals.date?.selected ? proposals.date.value : null,
      surveys: proposals.surveys
        .filter((s) => s.selected && s.match)
        .map((s) => ({ id: s.match!.id, assessment: s.assessment, context: clean(s.context) })),
      sections: Object.fromEntries(
        LIST_SECTIONS.map((def) => [
          def.key,
          proposals.sections[def.key]
            .filter((r) => r.selected)
            .map((r) => Object.fromEntries(def.fields.map((f) => [f.key, clean(r.values[f.key] ?? "")]))),
        ])
      ),
      testimonials: (Object.keys(TESTIMONIAL_KIND_MAX) as ImportTestimonialKind[]).flatMap((kind) =>
        proposals.testimonials[kind]
          .filter((r) => r.selected)
          .map((r) => ({
            kind,
            quote: clean(r.values.quote ?? ""),
            person_name: clean(r.values.person_name ?? ""),
            person_title: clean(r.values.person_title ?? ""),
            photo_credits: clean(r.values.photo_credits ?? ""),
          }))
      ),
      ...quantPayload(proposals.quant),
      indicators: proposals.indicators
        .filter((r) => r.selected && (r.lineId !== null || r.create))
        .map((r) => ({
          line_id: r.lineId,
          create: r.create
            ? {
                name: r.create.name.trim(),
                description: r.create.description.trim(),
                means_of_verification: r.create.means_of_verification.trim(),
                category: r.create.category || null,
                cycle: r.create.cycle,
                baseline_value: clean(r.create.baseline_value),
                baseline_year: r.create.baseline_year ? Number(r.create.baseline_year) : null,
                target_value: clean(r.create.target_value),
                target_year: r.create.target_year ? Number(r.create.target_year) : null,
              }
            : null,
          achieved_value: clean(r.achieved),
          status: r.status || null,
          comment: clean(r.comment),
        })),
    };

    setBusy("applying");
    setError(null);
    try {
      const res = await fetch("/api/report-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Import failed");
      setResult(d as ApplyResult);
      const cur = await loadCurrent(reportId);
      if (extraction) setProposals(buildProposals(extraction, cur));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  const filteredReports = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? reports.filter((r) => reportLabel(r).toLowerCase().includes(q)) : reports;
  }, [reports, filter]);

  const editorHref = current
    ? `/admin/report-editor/${projectSlug(current.report.project_short_name, current.report.project_title)}/${current.report.year}/overview`
    : null;

  // ── Updaters ──
  const setSurvey = (i: number, next: SurveyProposal) =>
    setProposals((p) => p && { ...p, surveys: p.surveys.map((s, j) => (j === i ? next : s)) });
  const setSectionRow = (key: ListSectionKey, i: number, next: RowProposal) =>
    setProposals((p) => p && { ...p, sections: { ...p.sections, [key]: p.sections[key].map((r, j) => (j === i ? next : r)) } });
  const setTestimonialRow = (kind: ImportTestimonialKind, i: number, next: RowProposal) =>
    setProposals((p) => p && { ...p, testimonials: { ...p.testimonials, [kind]: p.testimonials[kind].map((r, j) => (j === i ? next : r)) } });

  // Bulk selection. "All" stops at the section's limit (counting rows already in
  // PRISM), so the importer never proposes more than the report can hold.
  const roomFor = (max: number | undefined, existing: number) =>
    max === undefined ? Infinity : Math.max(0, max - existing);
  const pickRows = (rows: RowProposal[], on: boolean, room: number) =>
    rows.map((r, i) => ({ ...r, selected: on && i < room }));
  const selectSurveys = (on: boolean) =>
    setProposals((p) => p && { ...p, surveys: p.surveys.map((s) => ({ ...s, selected: on && !!s.match })) });
  const selectSection = (def: ListSectionDef, on: boolean) =>
    setProposals((p) => p && current && {
      ...p,
      sections: { ...p.sections, [def.key]: pickRows(p.sections[def.key], on, roomFor(def.max, current.sections[def.key]?.length ?? 0)) },
    });
  const selectTestimonials = (kind: ImportTestimonialKind, on: boolean) =>
    setProposals((p) => p && current && {
      ...p,
      testimonials: {
        ...p.testimonials,
        [kind]: pickRows(p.testimonials[kind], on, roomFor(TESTIMONIAL_KIND_MAX[kind], current.testimonials.filter((t) => t.kind === kind).length)),
      },
    });
  // Indicators: tick every row that has a PRISM indicator chosen (each indicator
  // line once, the first row wins) or is set to be added as a new indicator.
  const selectIndicators = (on: boolean) =>
    setProposals((p) => {
      if (!p) return p;
      const claimed = new Set<number>();
      return {
        ...p,
        indicators: p.indicators.map((ind) => {
          const take = on && (ind.create !== null || (ind.lineId !== null && !claimed.has(ind.lineId)));
          if (take && ind.lineId !== null) claimed.add(ind.lineId);
          return { ...ind, selected: take };
        }),
      };
    });
  // Rows without a matching PRISM indicator: add them all as new project
  // indicators (ticked, prefilled from the document; still editable).
  const addUnmatchedAsNew = () =>
    setProposals((p) => {
      if (!p || !current) return p;
      const categories = current.options.indicatorCategory ?? [];
      return {
        ...p,
        indicators: p.indicators.map((ind) =>
          ind.lineId === null && !ind.create ? { ...ind, create: draftFrom(ind.source, categories), selected: true } : ind
        ),
      };
    });
  const setIndicator = (i: number, next: IndicatorProposal) =>
    setProposals((p) => p && { ...p, indicators: p.indicators.map((x, j) => (j === i ? next : x)) });
  const selectEverything = (on: boolean) => {
    selectSurveys(on);
    for (const def of LIST_SECTIONS) selectSection(def, on);
    for (const kind of Object.keys(TESTIMONIAL_KIND_MAX) as ImportTestimonialKind[]) selectTestimonials(kind, on);
    selectIndicators(on);
    setProposals((p) => {
      if (!p) return p;
      const q = p.quant;
      return {
        ...p,
        quant: {
          ...q,
          risks: q.risks.map((r) => ({ ...r, selected: on && (r.riskId !== null || !!r.create) })),
          activities: q.activities.map((a) => ({ ...a, selected: on && (a.activityId !== null || a.create) })),
          expenses: q.expenses.map((e) => ({ ...e, selected: on && e.categoryId !== null })),
          isc: q.isc && { ...q.isc, selected: on },
          transfers: q.transfers.map((x) => ({ ...x, selected: on })),
          complementary: q.complementary.map((x) => ({ ...x, selected: on })),
          transfersNone: q.transfersNone && { selected: on },
          complementaryNone: q.complementaryNone && { selected: on },
        },
      };
    });
    setProposals((p) =>
      p && (p.date ? { ...p, date: { ...p.date, selected: on && !current?.report.report_submission_date } } : p)
    );
  };
  // Clicking a highlighted passage in the PDF: select that item and bring it
  // into view on the left.
  const selectFromPdf = (id: string) => {
    setActiveId(id);
    document.getElementById(`review-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const sectionHint = (existing: number, index: number, max?: number) =>
    existing > 0
      ? "Not pre-selected: this section already has content in PRISM. Tick to add it anyway."
      : max !== undefined && index >= max
      ? `Not pre-selected: over the limit of ${max} per report.`
      : null;

  return (
    <div className="flex flex-col h-full">
      <div className="on-dark bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="t-title-banner">Report Import</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Fill an empty report from a partner&apos;s narrative report (PDF or Word). You review every item before it is saved.
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-8 space-y-6">
        {/* Step 1 + 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border bg-card p-6 space-y-3">
            <p className="text-sm font-semibold">1. Report to fill</p>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search partner, project or year"
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            />
            <select
              value={reportId ?? ""}
              onChange={(e) => selectReport(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
            >
              <option value="">Choose a report…</option>
              {filteredReports.map((r) => (
                <option key={r.id} value={r.id}>
                  {reportLabel(r)} — {r.status}
                </option>
              ))}
            </select>
            {current && current.report.status !== "Open" && (
              <Notice variant="info">This report&apos;s status is “{current.report.status}”. You can still import as an admin.</Notice>
            )}
            {editorHref && (
              <Link href={editorHref} className="inline-flex items-center gap-1 text-xs underline text-muted-foreground hover:text-foreground">
                Open report in the editor <ExternalLink className="size-3" />
              </Link>
            )}
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-3">
            <p className="text-sm font-semibold">2. Partner&apos;s report</p>
            <div className="flex gap-1 p-1 rounded-lg bg-muted">
              {(
                [
                  { value: "narrative", label: "Narrative report", hint: "PDF" },
                  { value: "quantitative", label: "Quantitative report", hint: "Excel or PDF" },
                ] as const
              ).map((k) => (
                <button
                  key={k.value}
                  disabled={!!busy || !!fileName}
                  onClick={() => setDocKind(k.value)}
                  className={cn(
                    "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all disabled:cursor-not-allowed",
                    docKind === k.value ? "bg-background text-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {k.label} <span className="font-normal text-muted-foreground">· {k.hint}</span>
                </button>
              ))}
            </div>
            <div
              className={cn(
                "relative rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center min-h-[112px] transition-colors",
                fileName ? "border-solid border-neutral-300 bg-muted/20" : "border-border hover:border-neutral-400 cursor-pointer"
              )}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && !busy) handleFile(f);
              }}
              onClick={() => !fileName && !busy && fileInput.current?.click()}
            >
              <input
                ref={fileInput}
                type="file"
                accept={docKind === "quantitative" ? ".xlsx,.pdf,.json" : ".pdf,.json"}
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
              {busy === "extracting" ? (
                <>
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                  <p className="text-sm">Reading the document… this can take 1–2 minutes.</p>
                </>
              ) : fileName ? (
                <>
                  <FileText className="size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">{fileName}</p>
                  {extraction?.source?.extracted_by && (
                    <p className="text-xs text-muted-foreground">Extracted by {extraction.source.extracted_by}</p>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); clearFile(); }}
                    className="absolute top-2.5 right-2.5 rounded-md p-1 text-muted-foreground hover:bg-muted"
                    aria-label="Remove file"
                  >
                    <X className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <UploadCloud className="size-5 text-muted-foreground" />
                  <p className="text-sm font-medium">
                    Drop the {docKind === "quantitative" ? "quantitative" : "narrative"} report here
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {docKind === "quantitative" ? "Excel (.xlsx) or PDF" : "PDF"} · or a PRISM extraction file (.json)
                  </p>
                </>
              )}
            </div>
            {extraction && (
              <Button variant="outline" size="sm" onClick={downloadExtraction}>
                <Download className="size-3.5" /> Save extraction (.json)
              </Button>
            )}
          </div>
        </div>

        {error && <Notice variant="error">{error}</Notice>}
        {busy === "loading" && <p className="text-sm text-muted-foreground">Loading report…</p>}

        {result && (
          <Notice variant="success">
            <p className="font-medium">Imported.</p>
            <p>
              {result.surveys_updated} survey answer(s) filled
              {result.indicators_updated ? ` · ${result.indicators_updated} indicator(s) filled` : ""}
              {result.indicators_created ? ` · ${result.indicators_created} indicator(s) added to the project document` : ""}
              {result.quant && Object.keys(result.quant).length > 0
                ? ` · ${Object.entries(result.quant).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ")}`
                : ""}
              {Object.entries(result.rows_added).map(([k, n]) => ` · ${n} ${k.replace(/_/g, " ")}`).join("")}
              {result.submission_date_set ? " · submission date set" : ""}.
            </p>
            {result.skipped.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {result.skipped.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            )}
          </Notice>
        )}

        {!proposals && !error && (reportId || extraction) && busy === null && (
          <p className="text-sm text-muted-foreground">
            {reportId ? "Upload the partner's report to see what will be imported." : "Choose the report to fill."}
          </p>
        )}

        {/* Step 3: review — proposals on the left, the source PDF on the right */}
        {proposals && current && (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <div className="space-y-6 min-w-0">
                {extraction?.kind === "quantitative" && <QuantCoverage extraction={extraction} />}
                {extraction && extraction.notes.length > 0 && (
                  <Notice variant="info">
                    <p className="font-medium mb-1">Points to check</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {extraction.notes.map((n, i) => (
                        <li key={i}><span className="font-medium">{n.section}:</span> {n.message}</li>
                      ))}
                    </ul>
                  </Notice>
                )}

                {proposals.date && (
                  <SectionCard title="Report submission date">
                    <div className="px-5 py-4 space-y-2">
                      <div className="flex gap-3 items-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-black"
                          checked={proposals.date.selected}
                          disabled={!!current.report.report_submission_date}
                          onChange={(e) => setProposals((p) => p && p.date && { ...p, date: { ...p.date, selected: e.target.checked } })}
                        />
                        <input
                          type="date"
                          value={proposals.date.value}
                          onChange={(e) => setProposals((p) => p && p.date && { ...p, date: { ...p.date, value: e.target.value } })}
                          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                        />
                      </div>
                      {current.report.report_submission_date && (
                        <p className="text-xs italic text-muted-foreground">
                          Not imported: the report already has a submission date ({current.report.report_submission_date}).
                        </p>
                      )}
                    </div>
                  </SectionCard>
                )}

                {proposals.surveys.length > 0 && (
                  <SectionCard
                    title="Survey"
                    subtitle="Only empty ratings and justifications are filled."
                    actions={<SelectButtons onAll={() => selectSurveys(true)} onNone={() => selectSurveys(false)} />}
                  >
                    {proposals.surveys.map((s, i) => (
                      <ReviewItem key={i} id={`survey-${i}`} activeId={activeId} onActivate={setActiveId}>
                        <div className={cn("flex gap-3", !s.selected && "opacity-50")}>
                          <input
                            type="checkbox"
                            className="mt-1 size-4 shrink-0 accent-black"
                            checked={s.selected}
                            disabled={!s.match}
                            onChange={(e) => setSurvey(i, { ...s, selected: e.target.checked })}
                          />
                          <div className="flex-1 min-w-0 space-y-2">
                            <p className="text-sm font-medium">{s.match?.question ?? s.question}</p>
                            {!s.match && (
                              <p className="text-xs italic text-muted-foreground">No matching question in this report. This answer will not be imported.</p>
                            )}
                            {s.match && s.match.assessment !== null && !isEmpty(s.match.context) && (
                              <p className="text-xs italic text-muted-foreground">Already answered in PRISM. Nothing will change.</p>
                            )}
                            <Field label="Rating">
                              <select
                                value={s.assessment ?? ""}
                                onChange={(e) => setSurvey(i, { ...s, assessment: e.target.value ? Number(e.target.value) : null })}
                                className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm"
                              >
                                <option value="">—</option>
                                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                              </select>
                            </Field>
                            <Field label="Justification">
                              <Textarea value={s.context} onChange={(e) => setSurvey(i, { ...s, context: e.target.value })} className="min-h-9" />
                            </Field>
                            <PageTag page={s.page} />
                          </div>
                        </div>
                      </ReviewItem>
                    ))}
                  </SectionCard>
                )}

                {LIST_SECTIONS.map((def) => {
                  const rows = proposals.sections[def.key];
                  const existing = current.sections[def.key] ?? [];
                  if (!rows.length) return null;
                  const subtitle = [
                    `${rows.length} found`,
                    existing.length ? `${existing.length} already in PRISM` : null,
                    def.max ? `max ${def.max} per report` : null,
                  ].filter(Boolean).join(" · ");
                  return (
                    <SectionCard
                      key={def.key}
                      title={def.label}
                      subtitle={subtitle}
                      actions={<SelectButtons onAll={() => selectSection(def, true)} onNone={() => selectSection(def, false)} />}
                    >
                      {rows.map((r, i) => (
                        <ReviewItem key={i} id={`${def.key}-${i}`} activeId={activeId} onActivate={setActiveId}>
                          <ProposedRow
                            fields={def.fields}
                            row={r}
                            options={current.options}
                            hint={sectionHint(existing.length, i, def.max)}
                            onChange={(next) => setSectionRow(def.key, i, next)}
                          />
                        </ReviewItem>
                      ))}
                    </SectionCard>
                  );
                })}

                {(Object.keys(TESTIMONIAL_KIND_MAX) as ImportTestimonialKind[]).map((kind) => {
                  const rows = proposals.testimonials[kind];
                  const existing = current.testimonials.filter((t) => t.kind === kind);
                  if (!rows.length) return null;
                  const max = TESTIMONIAL_KIND_MAX[kind];
                  const picked = rows.filter((r) => r.selected).length + existing.length;
                  return (
                    <SectionCard
                      key={kind}
                      title={kind === "leadership" ? "Leadership testimonial" : "Partner testimonials"}
                      subtitle={[`${rows.length} found`, existing.length ? `${existing.length} already in PRISM` : null, `max ${max} per report`].filter(Boolean).join(" · ")}
                      actions={<SelectButtons onAll={() => selectTestimonials(kind, true)} onNone={() => selectTestimonials(kind, false)} />}
                    >
                      {picked > max && (
                        <div className="px-5 pt-4">
                          <Notice variant="error">More than {max} selected. Untick some; extra quotes will be skipped.</Notice>
                        </div>
                      )}
                      {rows.map((r, i) => (
                        <ReviewItem key={i} id={`${kind}-${i}`} activeId={activeId} onActivate={setActiveId}>
                          <ProposedRow
                            fields={TESTIMONIAL_FIELDS}
                            row={r}
                            options={current.options}
                            hint={sectionHint(existing.length, i, max)}
                            onChange={(next) => setTestimonialRow(kind, i, next)}
                          />
                        </ReviewItem>
                      ))}
                    </SectionCard>
                  );
                })}

                {proposals.indicators.length > 0 && (
                  <IndicatorsCard
                    proposals={proposals.indicators}
                    lines={current.indicators}
                    statuses={current.indicatorStatuses}
                    activeId={activeId}
                    onActivate={setActiveId}
                    onChange={setIndicator}
                    onSelectAll={selectIndicators}
                    onAddUnmatched={addUnmatchedAsNew}
                    prodoc={current.prodoc}
                    categories={current.options.indicatorCategory ?? []}
                  />
                )}

                <QuantReview
                  proposals={proposals.quant}
                  current={current.quant}
                  options={quantOptions(current)}
                  prodocStatus={current.prodoc?.status ?? null}
                  activeId={activeId}
                  onActivate={setActiveId}
                  onChange={(quant) => setProposals((p) => p && { ...p, quant })}
                />
              </div>

              {/* Source document */}
              <div className="xl:sticky xl:top-0 h-[calc(100vh-15rem)] min-h-[420px] flex flex-col gap-2">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wide">Source document</span>
                  {(pdfFile || sheetFile) && (
                    <>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block size-3 rounded-sm bg-[rgb(255_214_0/0.6)]" /> extracted
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <span className="inline-block size-3 rounded-sm bg-[rgb(255_140_0/0.7)]" /> item you are reviewing
                      </span>
                    </>
                  )}
                </div>
                {pdfFile ? (
                  <PdfHighlightViewer
                    file={pdfFile}
                    highlights={highlights}
                    activeId={activeId}
                    onSelect={selectFromPdf}
                    className="flex-1 min-h-0"
                  />
                ) : sheetFile ? (
                  <SheetPreview
                    file={sheetFile}
                    preferredSheet={extraction?.source?.sheet}
                    highlights={sheetHighlights}
                    activeId={activeId}
                    onSelect={selectFromPdf}
                    className="flex-1 min-h-0"
                  />
                ) : (
                  <label className="flex-1 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-2 text-center px-6 cursor-pointer hover:border-neutral-400">
                    <FileText className="size-6 text-muted-foreground" />
                    <p className="text-sm">
                      {extraction?.kind === "quantitative"
                        ? "Add the report's Excel file or PDF to show it here."
                        : "Add the report's PDF to show it here."}
                    </p>
                    <p className="text-xs text-muted-foreground">For viewing only. Nothing is extracted again.</p>
                    <input
                      type="file"
                      accept={extraction?.kind === "quantitative" ? ".xlsx,.pdf" : ".pdf"}
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.name.toLowerCase().endsWith(".xlsx")) setSheetFile(f);
                        else setPdfFile(f);
                      }}
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="sticky bottom-0 -mx-8 px-8 py-4 bg-background/95 border-t flex items-center gap-3 z-10">
              <div className="text-sm">
                <p className="font-medium">
                  {counts.total} item(s) selected
                  {counts.newIndicators ? ` · ${counts.newIndicators} new indicator(s)` : ""}
                </p>
                <p className="text-xs text-muted-foreground">Into: {reportLabel(current.report)}</p>
              </div>
              <Button variant="outline" size="sm" className="ml-auto" onClick={() => selectEverything(true)}>
                Select all that fit
              </Button>
              <Button variant="ghost" size="sm" onClick={() => selectEverything(false)}>
                Select none
              </Button>
              {counts.incomplete > 0 && (
                <p className="text-xs font-medium text-destructive">
                  {counts.incomplete} item(s) need attention before importing (missing required fields or amounts that are not numbers).
                </p>
              )}
              <Button onClick={apply} disabled={counts.total === 0 || counts.incomplete > 0 || busy !== null}>
                {busy === "applying" ? "Importing…" : "Import selected"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
