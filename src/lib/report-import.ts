// ─────────────────────────────────────────────────────────────────────────────
// Report import: turning a partner's narrative report (PDF / Word) into proposed
// values for an empty PRISM annual/final report.
//
// The flow has three steps, and this module is the contract between them:
//   1. Extraction  — produces a `ReportExtraction` (JSON). Either the server calls
//                    Claude (/api/report-import/extract, needs ANTHROPIC_API_KEY),
//                    or an admin uploads an extraction file made elsewhere.
//   2. Review      — the admin page shows each proposed item next to what PRISM
//                    already holds and lets the admin tick / edit / skip it.
//   3. Apply       — /api/report-import writes the ticked items, filling only
//                    empty fields and respecting each section's per-report cap.
//
// Client-safe: no DB or Node imports here.
// ─────────────────────────────────────────────────────────────────────────────

export const EXTRACTION_FORMAT = "prism-report-extraction/v1";

/** Repeatable report sections a narrative report can fill. */
export const LIST_SECTIONS: readonly ListSectionDef[] = [
  {
    key: "key_achievements",
    label: "Key Achievements",
    fields: [
      { key: "achievement", label: "Key achievement" },
      { key: "significance", label: "Significance" },
      { key: "links", label: "Links / materials" },
    ],
    max: 3,
  },
  {
    key: "partnerships",
    label: "Partnerships",
    fields: [
      { key: "partner_organization", label: "Partner organization" },
      { key: "result", label: "Result of the partnership" },
      { key: "links", label: "Links / materials" },
    ],
  },
  {
    key: "results",
    label: "Results",
    fields: [
      { key: "context", label: "Context" },
      { key: "data_driven_decision", label: "Data-driven decision" },
      { key: "resulting_impact", label: "Resulting impact" },
      { key: "links", label: "Links / materials" },
    ],
  },
  {
    key: "lessons_learned",
    label: "Lessons Learned",
    fields: [
      { key: "category", label: "Category", optionGroup: "lessonsCategory" },
      { key: "lesson_learned", label: "Lesson learned" },
      { key: "adjustment_informed", label: "Adjustment informed" },
    ],
    max: 5,
  },
  {
    key: "external_coverage",
    label: "External Coverage",
    fields: [
      { key: "type", label: "Type", optionGroup: "externalCoverageType" },
      { key: "description", label: "Description" },
      { key: "reach_indicator", label: "Reach / indicator" },
      { key: "links", label: "Links / materials" },
    ],
  },
];

export interface ListSectionDef {
  key: ListSectionKey;
  label: string;
  fields: readonly { key: string; label: string; optionGroup?: string }[];
  max?: number;
}

export type ListSectionKey =
  | "key_achievements"
  | "partnerships"
  | "results"
  | "lessons_learned"
  | "external_coverage";

export const TESTIMONIAL_FIELDS = [
  { key: "quote", label: "Quote" },
  { key: "person_name", label: "Name" },
  { key: "person_title", label: "Title & organization" },
  { key: "photo_credits", label: "Photo credits" },
] as const;

export const TESTIMONIAL_KIND_MAX = { leadership: 1, partner: 3 } as const;
export type ImportTestimonialKind = keyof typeof TESTIMONIAL_KIND_MAX;

// ── Extraction format ────────────────────────────────────────────────────────

/** One extracted row: the section's field values (strings) plus `page`, the
 *  page in the source document the row came from (for review). */
export type ExtractedRow = Record<string, string | number | null>;

export interface ExtractedSurvey {
  question: string;
  assessment: number | null;
  context: string | null;
  page?: number | null;
}

export interface ExtractedTestimonial {
  kind: ImportTestimonialKind;
  quote: string | null;
  person_name: string | null;
  person_title: string | null;
  photo_credits: string | null;
  page?: number | null;
}

export interface ExtractionNote {
  section: string;
  message: string;
}

/** Indicator status slugs (indicator_data.status). Annual reports and project
 *  updates use the progress set; final reports the achieved set. */
export const INDICATOR_STATUSES = ["on_track", "off_track", "ahead_of_schedule", "achieved", "not_achieved"] as const;
export type ImportIndicatorStatus = (typeof INDICATOR_STATUSES)[number];

/** One indicator row from a quantitative report, for the report's year. */
export interface ExtractedIndicator {
  /** The partner's numbering in the document ("11.1"). */
  number: string | null;
  name: string;
  /** Definition, used when the indicator is added to the project document. */
  description: string | null;
  means_of_verification: string | null;
  /** One of PRISM's indicator categories, or null. */
  category: string | null;
  cycle: "yearly" | "at_closure" | null;
  /** Baseline / target as in the document. A matched indicator keeps the
   *  project document's own; a new one is created with these. */
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
  achieved_value: string | null;
  status: ImportIndicatorStatus | null;
  comment: string | null;
  /** PRISM indicator (indicators.id) this row most likely corresponds to. */
  match_indicator_id: number | null;
  /** Why it matches, or why nothing fits. */
  match_note: string | null;
  /** Source location: PDF page, or spreadsheet row. */
  page?: number | null;
  row?: number | null;
}

export type ExtractionKind = "narrative" | "quantitative";

export interface ReportExtraction {
  format: typeof EXTRACTION_FORMAT;
  /** Which kind of partner document this came from. Defaults to narrative. */
  kind: ExtractionKind;
  source?: {
    file_name?: string | null;
    extracted_by?: string | null;
    /** Sheet the indicators came from (Excel). */
    sheet?: string | null;
    /** Sheet per section ("indicators", "risks", …) for Excel files. */
    sheets?: Record<string, string>;
  };
  report_submission_date: string | null;
  surveys: ExtractedSurvey[];
  sections: Record<ListSectionKey, ExtractedRow[]>;
  testimonials: ExtractedTestimonial[];
  indicators: ExtractedIndicator[];
  /** Quantitative report: the other sheets (empty for narrative reports). */
  risks: ExtractedRisk[];
  workplan: ExtractedActivity[];
  expenditure: { entries: ExtractedExpenditure[]; indirect_expenditure: string | null; indirect_row: number | null };
  transfers: { rows: ExtractedFunding[]; none: boolean };
  complementary: { rows: ExtractedFunding[]; none: boolean };
  /** Issues the extractor noticed (inconsistent dates, too many items, …). */
  notes: ExtractionNote[];
}

/** Source location shared by the quantitative rows: PDF page or sheet row. */
interface Located {
  page?: number | null;
  row?: number | null;
}

/** A risk as reported for the report's year. Likelihood / impact are 1–5. */
export interface ExtractedRisk extends Located {
  name: string;
  /** "existing" = carried from earlier years / the project document; "new" = added this year. */
  origin: "existing" | "new";
  description: string | null;
  categories: string[];
  approved_mitigation: string | null;
  updated_likelihood: number | null;
  updated_impact: number | null;
  updated_mitigation: string | null;
  project_revision: boolean | null;
  /** Suggested risk of the PRISM report (risk_management.id). */
  match_risk_id: number | null;
}

/** Progress of one work-plan activity for the report's year. */
export interface ExtractedActivity extends Located {
  /** The partner's numbering ("A.1.1"). */
  number: string | null;
  text: string;
  objective: string | null;
  output: string | null;
  implementing_agent: string | null;
  /** The approved (baseline) timeline, e.g. ["2024-Q2", …]. */
  planned_quarters: string[];
  /** The timeline as updated for this year. */
  updated_quarters: string[];
  status: string | null;
  comment: string | null;
  /** Suggested PRISM activity (workplan_activities.id). */
  match_activity_id: number | null;
}

/** Spending of one budget category for the report's year. */
export interface ExtractedExpenditure extends Located {
  /** PRISM category name (the list is global). */
  category: string;
  annual_expenditure: string | null;
  comment: string | null;
}

/** One organisation of the transfers / complementary funding tables. */
export interface ExtractedFunding extends Located {
  name: string;
  website: string | null;
  type: string | null;
  amount: string | null;
  linked_activities: string | null;
}

// ── Normalisation (untrusted JSON → ReportExtraction) ────────────────────────
// Used on files an admin uploads and on the model's output. Anything that does
// not fit the shape is dropped rather than rejected, so one malformed row does
// not sink a whole import.

const MAX_TEXT = 20_000;

function str(v: unknown): string | null {
  if (typeof v !== "string") {
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  }
  const t = v.trim();
  return t ? t.slice(0, MAX_TEXT) : null;
}

function page(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v < 10_000 ? v : null;
}

function isoDate(v: unknown): string | null {
  const s = str(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** A year in PRISM's accepted range (2000–2050), from 2024, "2024" or "2024.0". */
export function year(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 2000 && n <= 2050 ? n : null;
}

function rating(v: unknown): number | null {
  // Accept 4, "4", "4 - Great extent", "4 - G…"
  const m = typeof v === "number" ? v : Number(String(v ?? "").trim().match(/^[1-5]/)?.[0]);
  return Number.isInteger(m) && m >= 1 && m <= 5 ? m : null;
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Returns null when the input is not recognisably an extraction at all. */
export function normaliseExtraction(input: unknown): ReportExtraction | null {
  const o = obj(input);
  if (o.format !== EXTRACTION_FORMAT) return null;

  const rawSections = obj(o.sections);
  const sections = {} as Record<ListSectionKey, ExtractedRow[]>;
  for (const def of LIST_SECTIONS) {
    sections[def.key] = arr(rawSections[def.key])
      .map((r) => {
        const ro = obj(r);
        const row: ExtractedRow = { page: page(ro.page) };
        for (const f of def.fields) row[f.key] = str(ro[f.key]);
        return row;
      })
      .filter((row) => def.fields.some((f) => row[f.key]));
  }

  const surveys = arr(o.surveys)
    .map((s) => {
      const so = obj(s);
      return {
        question: str(so.question) ?? "",
        assessment: rating(so.assessment),
        context: str(so.context),
        page: page(so.page),
      };
    })
    .filter((s) => s.question && (s.assessment !== null || s.context));

  const testimonials = arr(o.testimonials)
    .map((raw): ExtractedTestimonial | null => {
      const to = obj(raw);
      const kind: ImportTestimonialKind | null =
        to.kind === "leadership" || to.kind === "partner" ? to.kind : null;
      if (!kind) return null;
      return {
        kind,
        quote: str(to.quote),
        person_name: str(to.person_name),
        person_title: str(to.person_title),
        photo_credits: str(to.photo_credits),
        page: page(to.page),
      };
    })
    .filter((t): t is ExtractedTestimonial => !!t && !!(t.quote || t.person_name));

  const loc = (x: Record<string, unknown>) => ({ page: page(x.page), row: page(x.row) });
  const strList = (v: unknown) => arr(v).map(str).filter((s): s is string => !!s);
  const scale = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5 ? v : null);

  const risks = arr(o.risks)
    .map((raw): ExtractedRisk | null => {
      const r = obj(raw);
      const name = str(r.name);
      if (!name) return null;
      const matchId = r.match_risk_id;
      return {
        ...loc(r),
        name,
        origin: r.origin === "new" ? "new" : "existing",
        description: str(r.description),
        categories: strList(r.categories),
        approved_mitigation: str(r.approved_mitigation),
        updated_likelihood: scale(r.updated_likelihood),
        updated_impact: scale(r.updated_impact),
        updated_mitigation: str(r.updated_mitigation),
        project_revision: typeof r.project_revision === "boolean" ? r.project_revision : null,
        match_risk_id: typeof matchId === "number" && Number.isInteger(matchId) && matchId > 0 ? matchId : null,
      };
    })
    .filter((r): r is ExtractedRisk => !!r);

  const quarters = (v: unknown) => strList(v).filter((q) => /^\d{4}-Q[1-4]$/.test(q)).sort();
  const workplan = arr(o.workplan)
    .map((raw): ExtractedActivity | null => {
      const a = obj(raw);
      const text = str(a.text);
      if (!text) return null;
      const matchId = a.match_activity_id;
      return {
        ...loc(a),
        number: str(a.number),
        text,
        objective: str(a.objective),
        output: str(a.output),
        implementing_agent: str(a.implementing_agent),
        planned_quarters: quarters(a.planned_quarters),
        updated_quarters: quarters(a.updated_quarters),
        status: str(a.status),
        comment: str(a.comment),
        match_activity_id: typeof matchId === "number" && Number.isInteger(matchId) && matchId > 0 ? matchId : null,
      };
    })
    .filter((a): a is ExtractedActivity => !!a);

  const exp = obj(o.expenditure);
  const expenditure = {
    entries: arr(exp.entries)
      .map((raw): ExtractedExpenditure | null => {
        const e = obj(raw);
        const category = str(e.category);
        return category ? { ...loc(e), category, annual_expenditure: str(e.annual_expenditure), comment: str(e.comment) } : null;
      })
      .filter((e): e is ExtractedExpenditure => !!e),
    indirect_expenditure: str(exp.indirect_expenditure),
    indirect_row: page(exp.indirect_row),
  };

  const funding = (v: unknown) => {
    const f = obj(v);
    return {
      rows: arr(f.rows)
        .map((raw): ExtractedFunding | null => {
          const x = obj(raw);
          const name = str(x.name);
          return name
            ? { ...loc(x), name, website: str(x.website), type: str(x.type), amount: str(x.amount), linked_activities: str(x.linked_activities) }
            : null;
        })
        .filter((x): x is ExtractedFunding => !!x),
      none: f.none === true,
    };
  };

  const indicators = arr(o.indicators)
    .map((raw): ExtractedIndicator | null => {
      const io = obj(raw);
      const name = str(io.name);
      if (!name) return null;
      const status = str(io.status);
      const matchId = io.match_indicator_id;
      const cycle = str(io.cycle);
      return {
        number: str(io.number),
        name,
        description: str(io.description),
        means_of_verification: str(io.means_of_verification),
        category: str(io.category),
        cycle: cycle === "yearly" || cycle === "at_closure" ? cycle : null,
        baseline_value: str(io.baseline_value),
        baseline_year: year(io.baseline_year),
        target_value: str(io.target_value),
        target_year: year(io.target_year),
        achieved_value: str(io.achieved_value),
        status: status && (INDICATOR_STATUSES as readonly string[]).includes(status) ? (status as ImportIndicatorStatus) : null,
        comment: str(io.comment),
        match_indicator_id: typeof matchId === "number" && Number.isInteger(matchId) && matchId > 0 ? matchId : null,
        match_note: str(io.match_note),
        page: page(io.page),
        row: page(io.row),
      };
    })
    .filter((i): i is ExtractedIndicator => !!i);

  const notes = arr(o.notes)
    .map((n) => {
      const no = obj(n);
      const message = str(no.message);
      return message ? { section: str(no.section) ?? "general", message } : null;
    })
    .filter((n): n is ExtractionNote => !!n);

  const src = obj(o.source);
  return {
    format: EXTRACTION_FORMAT,
    kind: o.kind === "quantitative" ? "quantitative" : "narrative",
    source: {
      file_name: str(src.file_name),
      extracted_by: str(src.extracted_by),
      sheet: str(src.sheet),
      sheets: Object.fromEntries(
        Object.entries(obj(src.sheets)).filter((e): e is [string, string] => typeof e[1] === "string")
      ),
    },
    report_submission_date: isoDate(o.report_submission_date),
    surveys,
    sections,
    testimonials,
    indicators,
    risks,
    workplan,
    expenditure,
    transfers: funding(o.transfers),
    complementary: funding(o.complementary),
    notes,
  };
}

/** "1,234.50", "$1,234", "1 234" → 1234.5; anything else → null. Negative amounts are rejected. */
export function parseAmount(v: string | null | undefined): number | null {
  if (!v) return null;
  const cleaned = v.replace(/[\s,$€£]|USD/gi, "");
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Survey question matching ─────────────────────────────────────────────────
// The document's question text rarely matches PRISM's byte for byte (bold
// markers, line breaks, small edits between years), so match on word overlap.

function words(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/<[^>]+>/g, " ")
      .replace(/[’‘']/g, "") // curly vs straight apostrophes: "project’s" = "project's"
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function questionSimilarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return 0;
  let common = 0;
  for (const w of wa) if (wb.has(w)) common++;
  return common / Math.max(wa.size, wb.size);
}

export const SURVEY_MATCH_THRESHOLD = 0.6;

/** Best PRISM survey row for an extracted question, or null below the threshold. */
export function matchSurvey<T extends { id: number; question: string }>(
  question: string,
  candidates: T[]
): { row: T; score: number } | null {
  let best: { row: T; score: number } | null = null;
  for (const row of candidates) {
    const score = questionSimilarity(question, row.question);
    if (!best || score > best.score) best = { row, score };
  }
  return best && best.score >= SURVEY_MATCH_THRESHOLD ? best : null;
}

/** Pick the closest allowed dropdown value ("News medi…" → "News Coverage"). */
export function matchOption(value: string | null, allowed: string[]): string | null {
  if (!value) return null;
  const v = value.toLowerCase().replace(/[…\.]+$/, "").trim();
  if (!v) return null;
  const exact = allowed.find((a) => a.toLowerCase() === v);
  if (exact) return exact;
  const prefix = allowed.find((a) => a.toLowerCase().startsWith(v) || v.startsWith(a.toLowerCase()));
  if (prefix) return prefix;
  const firstWord = v.split(/\s+/)[0];
  return allowed.find((a) => a.toLowerCase().split(/\s+/)[0] === firstWord) ?? null;
}

// ── Apply payload (review page → /api/report-import) ─────────────────────────

export interface ApplyPayload extends QuantApplyPayload {
  reportId: number;
  report_submission_date?: string | null;
  surveys: { id: number; assessment: number | null; context: string | null }[];
  sections: Partial<Record<ListSectionKey, Record<string, string | null>[]>>;
  testimonials: (Omit<ExtractedTestimonial, "page">)[];
  /**
   * Fill a report indicator line (indicator_data.id) — only empty fields are
   * set — or, with `create`, first add a new indicator to the project document
   * (which also adds it to the project's reports) and fill its line here.
   */
  indicators?: {
    line_id?: number | null;
    create?: NewIndicator | null;
    achieved_value: string | null;
    status: string | null;
    comment: string | null;
  }[];
  source_file?: string | null;
}

/** A custom indicator to add to the project document (same rules as the editors:
 *  name, description and means of verification are required). */
export interface NewIndicator {
  name: string;
  description: string;
  means_of_verification: string;
  category: string | null;
  cycle: "yearly" | "at_closure";
  baseline_value: string | null;
  baseline_year: number | null;
  target_value: string | null;
  target_year: number | null;
}

/** Quantitative sections of the apply payload (see /api/report-import). */
export interface QuantApplyPayload {
  risks?: {
    /** Existing risk of the report to update (only empty fields), or null with `create`. */
    risk_id: number | null;
    create: { name: string; description: string | null; categories: string[] } | null;
    updated_likelihood: number | null;
    updated_impact: number | null;
    updated_mitigation: string | null;
    project_revision: boolean | null;
  }[];
  workplan?: {
    /** Project activity, or null with `create` (added to the project document). */
    activity_id: number | null;
    create: {
      objective_num: string | null;
      objective_text: string | null;
      activity_num: string | null;
      activity_text: string;
      implementing_agent: string | null;
      planned_quarters: string[];
    } | null;
    status: string | null;
    comment: string | null;
    updated_quarters: string[] | null;
  }[];
  expenditure?: { category_id: number; annual_expenditure: number | null; comment: string | null }[];
  indirect_expenditure?: number | null;
  transfers?: { name: string; website: string | null; type: string | null; amount: number | null }[];
  complementary?: { name: string; website: string | null; type: string | null; amount: number | null }[];
  transfers_none?: boolean;
  complementary_none?: boolean;
}

export interface ApplyResult {
  ok: true;
  surveys_updated: number;
  indicators_updated: number;
  indicators_created: number;
  /** Quantitative sections: what was written, per section. */
  quant?: Record<string, number>;
  rows_added: Record<string, number>;
  submission_date_set: boolean;
  skipped: string[];
}
