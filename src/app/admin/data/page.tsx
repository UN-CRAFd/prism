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

const SECTIONS = [{ value: "surveys", label: "Surveys" }];

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

function assessmentBadge(value: number) {
  const config: Record<number, { bg: string; text: string; border: string }> = {
    1: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
    2: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
    3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
    4: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
    5: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  };
  const c = config[value] ?? { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold", c.bg, c.text, c.border)}>
      {value}
    </span>
  );
}

export default function AdminFullDataPage() {
  const [section, setSection] = useState("surveys");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<string>("all");
  const [surveys, setSurveys] = useState<SurveyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedContext, setExpandedContext] = useState<Set<number>>(new Set());

  function toggleContext(id: number) {
    setExpandedContext((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    fetch("/api/reports?data_type=report")
      .then((r) => r.json())
      .then((d) => setReports(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const loadData = useCallback(async (sec: string) => {
    setLoading(true);
    setError(null);
    try {
      if (sec === "surveys") {
        const res = await fetch("/api/surveys");
        if (!res.ok) throw new Error("Failed to load surveys");
        const data = await res.json();
        setSurveys(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(section); }, [section, loadData]);

  const selectedReport = reports.find((r) => String(r.id) === selectedReportId);

  const visibleSurveys = selectedReportId && selectedReportId !== "all"
    ? surveys.filter((s) => String(s.reportid) === selectedReportId)
    : surveys;

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

        <div className="flex items-center gap-3">
          {/* Report filter */}
          <Select value={selectedReportId} onValueChange={(v) => setSelectedReportId(v)}>
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

          {/* Section */}
          <Select value={section} onValueChange={(v) => setSection(v)}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SECTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
            <Loader2 className="size-4 animate-spin" /> Loading…
          </div>
        ) : section === "surveys" && visibleSurveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <TableIcon className="size-8 opacity-30" />
            <p className="text-sm">No survey data found.</p>
          </div>
        ) : section === "surveys" ? (
          <div className="rounded-lg border overflow-hidden">
            <Table className="table-fixed w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[14%]">Project</TableHead>
                  <TableHead className="w-[10%]">Partner</TableHead>
                  <TableHead className="w-[44%]">Question</TableHead>
                  <TableHead className="w-[8%] text-center">Assessment</TableHead>
                  <TableHead className="w-[24%]">Context</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleSurveys.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="text-sm align-top overflow-hidden whitespace-normal">
                      <p className="break-words">{row.project_short_name || row.project_title}</p>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground align-top overflow-hidden whitespace-normal">
                      <p className="break-words">{row.partner_short_name}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden whitespace-normal">
                      <p className="break-words">{row.question}</p>
                    </TableCell>
                    <TableCell className="text-sm align-top overflow-hidden whitespace-normal">
                      <div className="flex justify-center pt-0.5">
                        {row.assessment != null ? assessmentBadge(row.assessment) : <span className="text-muted-foreground">—</span>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground align-top overflow-hidden whitespace-normal">
                      {row.context ? (() => {
                        const LIMIT = 120;
                        const expanded = expandedContext.has(row.id);
                        const truncatable = row.context.length > LIMIT;
                        return (
                          <div>
                            <p className="break-words whitespace-pre-wrap">
                              {expanded || !truncatable ? row.context : row.context.slice(0, LIMIT) + "…"}
                            </p>
                            {truncatable && (
                              <button
                                onClick={() => toggleContext(row.id)}
                                className="mt-1 flex items-center gap-0.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                              >
                                {expanded
                                  ? <><ChevronUp className="size-3" /> collapse</>
                                  : <><ChevronDown className="size-3" /> expand</>}
                              </button>
                            )}
                          </div>
                        );
                      })() : <span>—</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
