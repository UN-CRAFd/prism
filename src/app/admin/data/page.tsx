"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TableIcon, ChevronDown, ChevronUp, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeRiskLevelKey,
  RISK_LEVEL_COLORS,
  SCALE_COLORS,
  FALLBACK_COLORS,
  likelihoodLabel,
  impactLabel,
  riskLevelLabel,
} from "@/lib/risk";
import { formatAmount } from "@/lib/transfers";
import { statusLabel, STATUS_COLORS, type IndicatorStatus } from "@/lib/indicators";
import { FUNDING_TYPE_COLORS } from "@/lib/complementary";
import type { Report } from "@/lib/types";

// ── Types ──────────────────────────────────────────────────────────────────

type Section =
  | "surveys"
  | "achievements"
  | "partnerships"
  | "results"
  | "lessons"
  | "external-coverage"
  | "testimonials"
  | "risk"
  | "indicators"
  | "workplan"
  | "expenditure"
  | "transfers"
  | "complementary";

// Every section endpoint returns flat rows with the report's year/project/partner
// joined in; the extra columns differ per section (typed loosely here).
type DataRow = {
  id: number;
  year: number;
  report_id?: number;
  reportid?: number;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
} & Record<string, unknown>;

interface CellCtx {
  expanded: (key: string) => boolean;
  toggle: (key: string) => void;
}

interface ColumnDef {
  header: string;
  headClass?: string;
  center?: boolean;
  cell: (row: DataRow, ctx: CellCtx) => ReactNode;
}

interface SectionConfig {
  value: Section;
  label: string;
  endpoint: string;
  reportIdKey: "report_id" | "reportid";
  minWidth: number;
  columns: ColumnDef[];
}

// ── Shared cell helpers ──────────────────────────────────────────────────────

const DASH = <span className="text-muted-foreground">—</span>;

function ValueBadge({ value, colors }: { value: string; colors: { bg: string; text: string; border: string } }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", colors.bg, colors.text, colors.border)}>
      {value}
    </span>
  );
}

function Tag({ value }: { value: string | null }) {
  if (!value) return DASH;
  return <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-muted/50">{value}</span>;
}

function TruncatedCell({ text, id, expanded, onToggle, limit = 120 }: {
  text: string | null;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  limit?: number;
}) {
  if (!text) return DASH;
  const truncatable = text.length > limit;
  return (
    <div>
      <p className="break-words whitespace-pre-wrap text-muted-foreground">
        {expanded || !truncatable ? text : text.slice(0, limit) + "…"}
      </p>
      {truncatable && (
        <button
          onClick={onToggle}
          className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
        >
          {expanded
            ? <><ChevronUp className="size-3" /> collapse</>
            : <><ChevronDown className="size-3" /> expand</>}
        </button>
      )}
    </div>
  );
}

function LinksList({ raw }: { raw: string | null }) {
  if (!raw) return DASH;
  const urls = raw.split(",").map((l) => l.trim()).filter(Boolean);
  if (!urls.length) return DASH;
  return (
    <ul className="space-y-0.5">
      {urls.map((url, i) => (
        <li key={i}>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline break-all">
            {url}
          </a>
        </li>
      ))}
    </ul>
  );
}

const trunc = (text: unknown, key: string, ctx: CellCtx) => (
  <TruncatedCell text={(text as string | null) ?? null} id={key} expanded={ctx.expanded(key)} onToggle={() => ctx.toggle(key)} />
);

const money = (v: unknown): ReactNode => {
  const s = formatAmount(v as string | number | null);
  return s ? <span className="tabular-nums">{s}</span> : DASH;
};

const quarters = (v: unknown): ReactNode => {
  if (!Array.isArray(v) || v.length === 0) return DASH;
  return <span className="text-xs">{(v as string[]).join(", ")}</span>;
};

const valueYear = (value: unknown, year: unknown): ReactNode => {
  const v = value as string | null;
  if (!v) return DASH;
  const y = year as number | null;
  return <span className="tabular-nums">{v}{y ? <span className="text-muted-foreground"> ({y})</span> : null}</span>;
};

// "Activity 3.1: …" from a num + text pair (either may be null).
const activityText = (num: unknown, text: unknown): string | null => {
  const n = num as string | null;
  const t = text as string | null;
  if (!n && !t) return null;
  return [n ? `Activity ${n}` : null, t].filter(Boolean).join(": ");
};

// Flatten a row's primitive values into one lowercase string for keyword search.
function rowText(row: DataRow): string {
  const parts: string[] = [];
  for (const v of Object.values(row)) {
    if (v == null) continue;
    if (Array.isArray(v)) parts.push(v.join(" "));
    else if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") parts.push(String(v));
  }
  return parts.join(" ").toLowerCase();
}

// ── Section configs ──────────────────────────────────────────────────────────

const yearCol: ColumnDef = { header: "Year", headClass: "w-14", cell: (r) => <span className="text-muted-foreground">{r.year}</span> };
const projectCol: ColumnDef = { header: "Project", headClass: "w-[130px]", cell: (r) => <p className="break-words">{(r.project_short_name as string) || r.project_title}</p> };
const partnerCol: ColumnDef = { header: "Partner", headClass: "w-[100px]", cell: (r) => <p className="break-words text-muted-foreground">{r.partner_short_name}</p> };
const leadCols = [yearCol, projectCol, partnerCol];

const SECTION_CONFIGS: SectionConfig[] = [
  {
    value: "surveys", label: "Surveys", endpoint: "/api/surveys", reportIdKey: "reportid", minWidth: 860,
    columns: [
      ...leadCols,
      { header: "Question", headClass: "w-[260px]", cell: (r) => <p className="break-words">{r.question as string}</p> },
      {
        header: "Assessment", headClass: "w-[100px]", center: true, cell: (r) => {
          const a = r.assessment as number | null;
          return <div className="flex justify-center pt-0.5">{a != null ? <ValueBadge value={String(a)} colors={SCALE_COLORS[a] ?? FALLBACK_COLORS} /> : DASH}</div>;
        },
      },
      { header: "Context", cell: (r, ctx) => trunc(r.context, `ctx-${r.id}`, ctx) },
    ],
  },
  {
    value: "achievements", label: "Key Achievements", endpoint: "/api/achievements", reportIdKey: "report_id", minWidth: 1100,
    columns: [
      ...leadCols,
      { header: "Achievement", headClass: "w-[30%]", cell: (r, ctx) => trunc(r.achievement, `ach-${r.id}`, ctx) },
      { header: "Significance", headClass: "w-[30%]", cell: (r, ctx) => trunc(r.significance, `sig-${r.id}`, ctx) },
      { header: "Links", cell: (r) => <LinksList raw={r.links as string | null} /> },
    ],
  },
  {
    value: "partnerships", label: "Partnerships", endpoint: "/api/partnerships", reportIdKey: "report_id", minWidth: 1000,
    columns: [
      ...leadCols,
      { header: "Partner Organization", headClass: "w-[160px]", cell: (r) => <p className="break-words font-medium">{(r.partner_organization as string) ?? "—"}</p> },
      { header: "Result of Partnership", headClass: "w-[40%]", cell: (r, ctx) => trunc(r.result, `pres-${r.id}`, ctx) },
      { header: "Links", cell: (r) => <LinksList raw={r.links as string | null} /> },
    ],
  },
  {
    value: "results", label: "Results", endpoint: "/api/results", reportIdKey: "report_id", minWidth: 1300,
    columns: [
      ...leadCols,
      { header: "Context", headClass: "w-[24%]", cell: (r, ctx) => trunc(r.context, `rctx-${r.id}`, ctx) },
      { header: "Data-driven Decision", headClass: "w-[24%]", cell: (r, ctx) => trunc(r.data_driven_decision, `ddd-${r.id}`, ctx) },
      { header: "Resulting Impact", headClass: "w-[24%]", cell: (r, ctx) => trunc(r.resulting_impact, `ri-${r.id}`, ctx) },
      { header: "Links", cell: (r) => <LinksList raw={r.links as string | null} /> },
    ],
  },
  {
    value: "lessons", label: "Lessons Learned", endpoint: "/api/lessons-learned", reportIdKey: "report_id", minWidth: 1000,
    columns: [
      ...leadCols,
      { header: "Category", headClass: "w-[130px]", cell: (r) => <Tag value={r.category as string | null} /> },
      { header: "Lesson Learned", headClass: "w-[35%]", cell: (r, ctx) => trunc(r.lesson_learned, `ll-${r.id}`, ctx) },
      { header: "Adjustment Informed", cell: (r, ctx) => trunc(r.adjustment_informed, `ai-${r.id}`, ctx) },
    ],
  },
  {
    value: "external-coverage", label: "External Coverage", endpoint: "/api/external-coverage", reportIdKey: "report_id", minWidth: 1200,
    columns: [
      ...leadCols,
      { header: "Type", headClass: "w-[140px]", cell: (r) => <Tag value={r.type as string | null} /> },
      { header: "Description", headClass: "w-[28%]", cell: (r, ctx) => trunc(r.description, `cdesc-${r.id}`, ctx) },
      { header: "Reach / Indicator", headClass: "w-[20%]", cell: (r, ctx) => trunc(r.reach_indicator, `creach-${r.id}`, ctx) },
      { header: "Links / Materials", cell: (r) => <LinksList raw={r.links as string | null} /> },
    ],
  },
  {
    value: "testimonials", label: "Testimonials", endpoint: "/api/testimonials", reportIdKey: "report_id", minWidth: 1200,
    columns: [
      ...leadCols,
      { header: "Kind", headClass: "w-[110px]", cell: (r) => <Tag value={r.kind as string | null} /> },
      { header: "Quote", headClass: "w-[32%]", cell: (r, ctx) => trunc(r.quote, `quote-${r.id}`, ctx) },
      { header: "Person", headClass: "w-[140px]", cell: (r) => <p className="break-words font-medium">{(r.person_name as string) || "—"}</p> },
      { header: "Title", headClass: "w-[160px]", cell: (r) => <p className="break-words text-muted-foreground">{(r.person_title as string) || "—"}</p> },
      { header: "Photo", cell: (r) => (r.photo_link ? <LinksList raw={r.photo_link as string} /> : <span className="text-muted-foreground">{(r.photo_label as string) || "—"}</span>) },
    ],
  },
  {
    value: "risk", label: "Risk Management", endpoint: "/api/risk", reportIdKey: "report_id", minWidth: 1300,
    columns: [
      ...leadCols,
      { header: "Risk", headClass: "w-[160px]", cell: (r) => <p className="break-words font-medium">{r.risk_name as string}</p> },
      {
        header: "Categories", headClass: "w-[120px]", cell: (r) => {
          const c = r.risk_category as string[] | null;
          return c?.length ? <p className="break-words text-muted-foreground">{c.join(", ")}</p> : DASH;
        },
      },
      {
        header: "Likelihood", headClass: "w-[100px]", center: true, cell: (r) => {
          const v = r.likelihood as number | null;
          return <div className="flex justify-center pt-0.5">{v != null ? <ValueBadge value={likelihoodLabel(v)} colors={SCALE_COLORS[v] ?? FALLBACK_COLORS} /> : DASH}</div>;
        },
      },
      {
        header: "Impact", headClass: "w-[90px]", center: true, cell: (r) => {
          const v = r.impact as number | null;
          return <div className="flex justify-center pt-0.5">{v != null ? <ValueBadge value={impactLabel(v)} colors={SCALE_COLORS[v] ?? FALLBACK_COLORS} /> : DASH}</div>;
        },
      },
      {
        header: "Level", headClass: "w-[90px]", center: true, cell: (r) => {
          const key = computeRiskLevelKey(r.likelihood as number | null, r.impact as number | null);
          return <div className="flex justify-center pt-0.5">{key ? <ValueBadge value={riskLevelLabel(key)} colors={RISK_LEVEL_COLORS[key]} /> : DASH}</div>;
        },
      },
      { header: "Approved Mitigation", headClass: "w-[190px]", cell: (r, ctx) => trunc(r.approved_mitigation, `am-${r.id}`, ctx) },
      { header: "Updated Mitigation", headClass: "w-[190px]", cell: (r, ctx) => trunc(r.updated_mitigation, `um-${r.id}`, ctx) },
      {
        header: "Revision", headClass: "w-[68px]", center: true, cell: (r) => {
          const v = r.project_revision as boolean | null;
          return <div className="text-center">{v == null ? DASH : v ? <span className="text-green-600 font-medium">Yes</span> : <span className="text-muted-foreground">No</span>}</div>;
        },
      },
    ],
  },
  {
    value: "indicators", label: "Indicators", endpoint: "/api/indicator-data", reportIdKey: "report_id", minWidth: 1400,
    columns: [
      ...leadCols,
      { header: "Indicator", headClass: "w-[200px]", cell: (r) => <p className="break-words font-medium">{r.indicator_name as string}</p> },
      { header: "Category", headClass: "w-[120px]", cell: (r) => <Tag value={r.category as string | null} /> },
      { header: "Baseline", headClass: "w-[110px]", cell: (r) => valueYear(r.baseline_value, r.baseline_year) },
      { header: "Target", headClass: "w-[110px]", cell: (r) => valueYear(r.target_value, r.target_year) },
      { header: "Achieved", headClass: "w-[110px]", cell: (r) => { const v = r.achieved_value as string | null; return v ? <span className="tabular-nums">{v}</span> : DASH; } },
      {
        header: "Status", headClass: "w-[130px]", cell: (r) => {
          const s = r.status as string | null;
          return s ? <ValueBadge value={statusLabel(s)} colors={STATUS_COLORS[s as IndicatorStatus] ?? FALLBACK_COLORS} /> : DASH;
        },
      },
      { header: "Comment", cell: (r, ctx) => trunc(r.comment, `icom-${r.id}`, ctx) },
    ],
  },
  {
    value: "workplan", label: "Workplan", endpoint: "/api/workplan", reportIdKey: "report_id", minWidth: 1400,
    columns: [
      ...leadCols,
      { header: "Objective", headClass: "w-[150px]", cell: (r) => { const t = activityText(r.objective_num, r.objective_text); return t ? <p className="break-words text-xs">{t.replace(/^Activity /, "")}</p> : DASH; } },
      { header: "Activity", headClass: "w-[24%]", cell: (r, ctx) => trunc(activityText(r.activity_num, r.activity_text), `wact-${r.id}`, ctx) },
      { header: "Planned", headClass: "w-[150px]", cell: (r) => quarters(r.planned_quarters) },
      { header: "Updated", headClass: "w-[150px]", cell: (r) => quarters(r.updated_quarters) },
      { header: "Status", headClass: "w-[130px]", cell: (r) => <Tag value={r.status as string | null} /> },
      { header: "Comment", cell: (r, ctx) => trunc(r.comment, `wcom-${r.id}`, ctx) },
    ],
  },
  {
    value: "expenditure", label: "Expenditure", endpoint: "/api/expenditure", reportIdKey: "report_id", minWidth: 1000,
    columns: [
      ...leadCols,
      { header: "Category", headClass: "w-[220px]", cell: (r) => <p className="break-words font-medium">{r.category_name as string}</p> },
      { header: "Approved Budget", headClass: "w-[150px]", cell: (r) => money(r.approved_amount) },
      { header: "Expenditure", headClass: "w-[150px]", cell: (r) => money(r.annual_expenditure) },
      { header: "Comment", cell: (r, ctx) => trunc(r.comment, `ecom-${r.id}`, ctx) },
    ],
  },
  {
    value: "transfers", label: "Transfers", endpoint: "/api/transfer-data", reportIdKey: "report_id", minWidth: 1100,
    columns: [
      ...leadCols,
      { header: "Organization", headClass: "w-[180px]", cell: (r) => <p className="break-words font-medium">{(r.organization_name as string) || "—"}</p> },
      { header: "Type", headClass: "w-[150px]", cell: (r) => <Tag value={r.partner_type as string | null} /> },
      { header: "Website", headClass: "w-[160px]", cell: (r) => <LinksList raw={r.website as string | null} /> },
      { header: "Amount", headClass: "w-[120px]", cell: (r) => money(r.amount_transferred) },
      { header: "Linked Activity", cell: (r, ctx) => trunc(activityText(r.linked_activity_num, r.linked_activity_text), `tact-${r.id}`, ctx) },
    ],
  },
  {
    value: "complementary", label: "Complementary Funding", endpoint: "/api/complementary-data", reportIdKey: "report_id", minWidth: 1100,
    columns: [
      ...leadCols,
      { header: "Contributor", headClass: "w-[180px]", cell: (r) => <p className="break-words font-medium">{(r.contributor_name as string) || "—"}</p> },
      {
        header: "Funding Type", headClass: "w-[130px]", cell: (r) => {
          const t = r.funding_type as string | null;
          return t ? <ValueBadge value={t} colors={FUNDING_TYPE_COLORS[t] ?? FALLBACK_COLORS} /> : DASH;
        },
      },
      { header: "Website", headClass: "w-[160px]", cell: (r) => <LinksList raw={r.website as string | null} /> },
      { header: "Amount", headClass: "w-[120px]", cell: (r) => money(r.contribution_amount) },
      { header: "Linked Activities", cell: (r, ctx) => trunc(r.linked_activities, `cact-${r.id}`, ctx) },
    ],
  },
];

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminFullDataPage() {
  const [section, setSection] = useState<Section>("surveys");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("all");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<DataRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

  const config = SECTION_CONFIGS.find((c) => c.value === section)!;

  function toggleCell(key: string) {
    setExpandedCells((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((d) => setReports(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  // Load the selected section's rows (one fetch per section; all endpoints return
  // the full cross-report listing which we then filter client-side).
  useEffect(() => {
    const cfg = SECTION_CONFIGS.find((c) => c.value === section)!;
    setLoading(true);
    setError(null);
    setExpandedCells(new Set());
    fetch(cfg.endpoint)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load ${cfg.label}`);
        return r.json();
      })
      .then((d) => setRows(Array.isArray(d) ? d : []))
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [section]);

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);

  const filtered = useMemo(() => {
    let rs = rows;
    if (selectedReportId !== "all") {
      rs = rs.filter((r) => String(r[config.reportIdKey] ?? "") === selectedReportId);
    }
    const q = search.trim().toLowerCase();
    if (q) rs = rs.filter((r) => rowText(r).includes(q));
    return rs;
  }, [rows, selectedReportId, search, config.reportIdKey]);

  const ctx: CellCtx = { expanded: (k) => expandedCells.has(k), toggle: toggleCell };

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="border-b px-8 h-32 flex items-center shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Full Report Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Browse every submission across all reports — filter by report, section and keyword.
          </p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b px-8 py-4 flex flex-wrap items-center gap-3 shrink-0">
        {/* Section */}
        <Select value={section} onValueChange={(v) => setSection(v as Section)}>
          <SelectTrigger className="w-[220px] h-9">
            <span className="truncate">{config.label}</span>
          </SelectTrigger>
          <SelectContent>
            {SECTION_CONFIGS.map((c) => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Report */}
        <Select value={selectedReportId} onValueChange={setSelectedReportId}>
          <SelectTrigger className="w-[280px] h-9">
            {selectedReport ? (
              <span className="truncate capitalize">
                {selectedReport.report_type ?? "annual"} Report {selectedReport.year} · {selectedReport.project_short_name || selectedReport.project_title}
              </span>
            ) : (
              <span className="text-muted-foreground">All reports</span>
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All reports</SelectItem>
            {reports.map((r) => (
              <SelectItem key={r.id} value={String(r.id)}>
                <div className="flex flex-col">
                  <span className="capitalize">{r.report_type ?? "annual"} Report {r.year}</span>
                  <span className="text-xs text-muted-foreground">{r.project_short_name || r.project_title}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Keyword search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search keywords…"
            className="h-9 pl-8"
          />
        </div>

        {!loading && (
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {error && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Fetching...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <TableIcon className="size-8 opacity-30" />
            <p className="text-sm">
              {search.trim() || selectedReportId !== "all" ? "No entries match your filters." : "No data found."}
            </p>
          </div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed" style={{ minWidth: config.minWidth }}>
              <TableHeader>
                <TableRow>
                  {config.columns.map((col, i) => (
                    <TableHead key={i} className={cn(col.headClass, col.center && "text-center")}>
                      {col.header}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row) => (
                  <TableRow key={row.id}>
                    {config.columns.map((col, i) => (
                      <TableCell key={i} className={cn("text-sm align-top overflow-hidden whitespace-normal", col.center && "text-center")}>
                        {col.cell(row, ctx)}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
