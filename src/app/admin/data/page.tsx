"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, TableIcon, ChevronDown, ChevronUp } from "lucide-react";
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

// ── Types ──────────────────────────────────────────────────────────────────

interface Report {
  id: number;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
}

interface SurveyRow {
  id: number;
  reportid: number;
  question: string;
  assessment: number | null;
  context: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface RiskRow {
  id: number;
  report_id: number;
  risk_name: string;
  risk_category: string[] | null;
  likelihood: number | null;
  impact: number | null;
  approved_mitigation: string | null;
  updated_mitigation: string | null;
  project_revision: boolean | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface AchievementRow {
  id: number;
  report_id: number;
  achievement: string | null;
  significance: string | null;
  links: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface PartnershipRow {
  id: number;
  report_id: number;
  partner_organization: string | null;
  result: string | null;
  links: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface ResultRow {
  id: number;
  report_id: number;
  context: string | null;
  data_driven_decision: string | null;
  resulting_impact: string | null;
  links: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface LessonRow {
  id: number;
  report_id: number;
  category: string | null;
  lesson_learned: string | null;
  adjustment_informed: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface CoverageRow {
  id: number;
  report_id: number;
  type: string | null;
  description: string | null;
  reach_indicator: string | null;
  links: string | null;
  year: number;
  report_type: string | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
}

type Section = "surveys" | "risk" | "achievements" | "partnerships" | "results" | "lessons" | "external-coverage";

const SECTIONS: { value: Section; label: string }[] = [
  { value: "surveys", label: "Surveys" },
  { value: "achievements", label: "Key Achievements" },
  { value: "partnerships", label: "Partnerships" },
  { value: "results", label: "Results" },
  { value: "lessons", label: "Lessons Learned" },
  { value: "external-coverage", label: "External Coverage" },
  { value: "risk", label: "Risk Management" },
];

// ── Shared helpers ─────────────────────────────────────────────────────────

function ValueBadge({ value, colors }: { value: string; colors: { bg: string; text: string; border: string } }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap", colors.bg, colors.text, colors.border)}>
      {value}
    </span>
  );
}

function TruncatedCell({ text, id, expanded, onToggle, limit = 120 }: {
  text: string | null;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  limit?: number;
}) {
  if (!text) return <span className="text-muted-foreground">—</span>;
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
  if (!raw) return <span className="text-muted-foreground">—</span>;
  const urls = raw.split(",").map((l) => l.trim()).filter(Boolean);
  if (!urls.length) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className="space-y-0.5">
      {urls.map((url, i) => (
        <li key={i}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:underline break-all"
          >
            {url}
          </a>
        </li>
      ))}
    </ul>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminFullDataPage() {
  const [section, setSection] = useState<Section>("surveys");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("all");

  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [risks, setRisks] = useState<RiskRow[]>([]);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);
  const [partnerships, setPartnerships] = useState<PartnershipRow[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [coverage, setCoverage] = useState<CoverageRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());

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

  const loadData = useCallback(async (sec: Section) => {
    setLoading(true);
    setError(null);
    try {
      const endpoints: Record<Section, string> = {
        surveys: "/api/surveys",
        risk: "/api/risk",
        achievements: "/api/achievements",
        partnerships: "/api/partnerships",
        results: "/api/results",
        lessons: "/api/lessons-learned",
        "external-coverage": "/api/external-coverage",
      };
      const res = await fetch(endpoints[sec]);
      if (!res.ok) throw new Error(`Failed to load ${sec}`);
      const data = await res.json();
      if (sec === "surveys") setSurveys(data);
      else if (sec === "risk") setRisks(data);
      else if (sec === "achievements") setAchievements(data);
      else if (sec === "partnerships") setPartnerships(data);
      else if (sec === "results") setResults(data);
      else if (sec === "lessons") setLessons(data);
      else if (sec === "external-coverage") setCoverage(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(section); }, [section, loadData]);

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);

  function filterByReport<T extends { report_id?: number; reportid?: number }>(rows: T[]): T[] {
    if (selectedReportId === "all") return rows;
    return rows.filter((r) => String(r.report_id ?? (r as { reportid?: number }).reportid) === selectedReportId);
  }

  const visibleSurveys = selectedReportId !== "all" ? surveys.filter((s) => String(s.reportid) === selectedReportId) : surveys;
  const visibleRisks = filterByReport(risks);
  const visibleAchievements = filterByReport(achievements);
  const visiblePartnerships = filterByReport(partnerships);
  const visibleResults = filterByReport(results);
  const visibleLessons = filterByReport(lessons);
  const visibleCoverage = filterByReport(coverage);

  const currentRows = {
    surveys: visibleSurveys,
    risk: visibleRisks,
    achievements: visibleAchievements,
    partnerships: visiblePartnerships,
    results: visibleResults,
    lessons: visibleLessons,
    "external-coverage": visibleCoverage,
  }[section];

  const isEmpty = currentRows.length === 0;

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Full Data</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            View all submissions across all reports
          </p>
        </div>

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
      </div>

      {/* Section tabs */}
      <div className="border-b px-8 flex items-center gap-1 shrink-0">
        {SECTIONS.map((s) => (
          <button
            key={s.value}
            onClick={() => { setSection(s.value); setExpandedCells(new Set()); }}
            className={cn(
              "px-4 py-3 text-sm font-medium border-b-2 transition-colors",
              section === s.value
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </button>
        ))}
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
        ) : isEmpty ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <TableIcon className="size-8 opacity-30" />
            <p className="text-sm">No data found.</p>
          </div>
        ) : section === "surveys" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[860px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[150px]">Project</TableHead>
                  <TableHead className="w-[110px]">Partner</TableHead>
                  <TableHead className="w-[260px]">Question</TableHead>
                  <TableHead className="w-[100px] text-center">Assessment</TableHead>
                  <TableHead>Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSurveys.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden whitespace-normal">
                      <p className="break-words">{row.question}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top">
                      <div className="flex justify-center pt-0.5">
                        {row.assessment != null
                          ? <ValueBadge value={String(row.assessment)} colors={SCALE_COLORS[row.assessment] ?? FALLBACK_COLORS} />
                          : <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.context}
                        id={`ctx-${row.id}`}
                        expanded={expandedCells.has(`ctx-${row.id}`)}
                        onToggle={() => toggleCell(`ctx-${row.id}`)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : section === "risk" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1300px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[120px]">Project</TableHead>
                  <TableHead className="w-[90px]">Partner</TableHead>
                  <TableHead className="w-[160px]">Risk</TableHead>
                  <TableHead className="w-[120px]">Categories</TableHead>
                  <TableHead className="w-[100px] text-center">Likelihood</TableHead>
                  <TableHead className="w-[90px] text-center">Impact</TableHead>
                  <TableHead className="w-[90px] text-center">Level</TableHead>
                  <TableHead className="w-[190px]">Approved Mitigation</TableHead>
                  <TableHead className="w-[190px]">Updated Mitigation</TableHead>
                  <TableHead className="w-[68px] text-center">Revision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRisks.map((row) => {
                  const levelKey = computeRiskLevelKey(row.likelihood, row.impact);
                  const levelColors = levelKey ? RISK_LEVEL_COLORS[levelKey] : FALLBACK_COLORS;
                  const lColors = row.likelihood ? SCALE_COLORS[row.likelihood] : FALLBACK_COLORS;
                  const iColors = row.impact ? SCALE_COLORS[row.impact] : FALLBACK_COLORS;
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                      <TableCell className="text-sm align-top overflow-hidden">
                        <p className="break-words">{row.project_short_name || row.project_title}</p>
                      </TableCell>
                      <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                        <p className="break-words">{row.partner_short_name}</p>
                      </TableCell>
                      <TableCell className="text-sm align-top font-medium overflow-hidden whitespace-normal">
                        <p className="break-words">{row.risk_name}</p>
                      </TableCell>
                      <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                        {row.risk_category?.length
                          ? <p className="break-words">{row.risk_category.join(", ")}</p>
                          : <span>—</span>}
                      </TableCell>
                      <TableCell className="text-sm align-top">
                        <div className="flex justify-center pt-0.5">
                          {row.likelihood != null
                            ? <ValueBadge value={likelihoodLabel(row.likelihood)} colors={lColors} />
                            : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm align-top">
                        <div className="flex justify-center pt-0.5">
                          {row.impact != null
                            ? <ValueBadge value={impactLabel(row.impact)} colors={iColors} />
                            : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm align-top">
                        <div className="flex justify-center pt-0.5">
                          {levelKey
                            ? <ValueBadge value={riskLevelLabel(levelKey)} colors={levelColors} />
                            : <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm align-top overflow-hidden">
                        <TruncatedCell
                          text={row.approved_mitigation}
                          id={`am-${row.id}`}
                          expanded={expandedCells.has(`am-${row.id}`)}
                          onToggle={() => toggleCell(`am-${row.id}`)}
                        />
                      </TableCell>
                      <TableCell className="text-sm align-top overflow-hidden">
                        <TruncatedCell
                          text={row.updated_mitigation}
                          id={`um-${row.id}`}
                          expanded={expandedCells.has(`um-${row.id}`)}
                          onToggle={() => toggleCell(`um-${row.id}`)}
                        />
                      </TableCell>
                      <TableCell className="text-sm align-top text-center">
                        {row.project_revision == null
                          ? <span className="text-muted-foreground">—</span>
                          : row.project_revision
                          ? <span className="text-green-600 font-medium">Yes</span>
                          : <span className="text-muted-foreground">No</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

        ) : section === "achievements" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1100px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[130px]">Project</TableHead>
                  <TableHead className="w-[100px]">Partner</TableHead>
                  <TableHead className="w-[30%]">Achievement</TableHead>
                  <TableHead className="w-[30%]">Significance</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleAchievements.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.achievement}
                        id={`ach-${row.id}`}
                        expanded={expandedCells.has(`ach-${row.id}`)}
                        onToggle={() => toggleCell(`ach-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.significance}
                        id={`sig-${row.id}`}
                        expanded={expandedCells.has(`sig-${row.id}`)}
                        onToggle={() => toggleCell(`sig-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <LinksList raw={row.links} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : section === "partnerships" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[130px]">Project</TableHead>
                  <TableHead className="w-[100px]">Partner</TableHead>
                  <TableHead className="w-[160px]">Partner Organization</TableHead>
                  <TableHead className="w-[40%]">Result of Partnership</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiblePartnerships.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top font-medium overflow-hidden">
                      <p className="break-words">{row.partner_organization ?? "—"}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.result}
                        id={`pres-${row.id}`}
                        expanded={expandedCells.has(`pres-${row.id}`)}
                        onToggle={() => toggleCell(`pres-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <LinksList raw={row.links} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : section === "results" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1300px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[120px]">Project</TableHead>
                  <TableHead className="w-[90px]">Partner</TableHead>
                  <TableHead className="w-[24%]">Context</TableHead>
                  <TableHead className="w-[24%]">Data-driven Decision</TableHead>
                  <TableHead className="w-[24%]">Resulting Impact</TableHead>
                  <TableHead>Links</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleResults.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.context}
                        id={`rctx-${row.id}`}
                        expanded={expandedCells.has(`rctx-${row.id}`)}
                        onToggle={() => toggleCell(`rctx-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.data_driven_decision}
                        id={`ddd-${row.id}`}
                        expanded={expandedCells.has(`ddd-${row.id}`)}
                        onToggle={() => toggleCell(`ddd-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.resulting_impact}
                        id={`ri-${row.id}`}
                        expanded={expandedCells.has(`ri-${row.id}`)}
                        onToggle={() => toggleCell(`ri-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <LinksList raw={row.links} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : section === "lessons" ? (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1000px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[130px]">Project</TableHead>
                  <TableHead className="w-[100px]">Partner</TableHead>
                  <TableHead className="w-[130px]">Category</TableHead>
                  <TableHead className="w-[35%]">Lesson Learned</TableHead>
                  <TableHead>Adjustment Informed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleLessons.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top">
                      {row.category
                        ? <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-muted/50">{row.category}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.lesson_learned}
                        id={`ll-${row.id}`}
                        expanded={expandedCells.has(`ll-${row.id}`)}
                        onToggle={() => toggleCell(`ll-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.adjustment_informed}
                        id={`ai-${row.id}`}
                        expanded={expandedCells.has(`ai-${row.id}`)}
                        onToggle={() => toggleCell(`ai-${row.id}`)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

        ) : (

          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed min-w-[1200px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14">Year</TableHead>
                  <TableHead className="w-[120px]">Project</TableHead>
                  <TableHead className="w-[90px]">Partner</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="w-[28%]">Description</TableHead>
                  <TableHead className="w-[20%]">Reach / Indicator</TableHead>
                  <TableHead>Links / Materials</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleCoverage.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top text-muted-foreground">{row.year}</TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top text-muted-foreground overflow-hidden">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top">
                      {row.type
                        ? <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium bg-muted/50">{row.type}</span>
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.description}
                        id={`cdesc-${row.id}`}
                        expanded={expandedCells.has(`cdesc-${row.id}`)}
                        onToggle={() => toggleCell(`cdesc-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <TruncatedCell
                        text={row.reach_indicator}
                        id={`creach-${row.id}`}
                        expanded={expandedCells.has(`creach-${row.id}`)}
                        onToggle={() => toggleCell(`creach-${row.id}`)}
                      />
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden">
                      <LinksList raw={row.links} />
                    </TableCell>
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
