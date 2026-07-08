"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Printer,
} from "lucide-react";
import { formatDate } from "@/lib/utils";

const YEARS = [2023, 2024, 2025, 2026];

export interface Project {
  id: number;
  project_title: string;
  partner_short_name: string;
  partner_long_name: string | null;
}

export interface ReportRow {
  id: number;
  project_id: number;
  year: number;
  report_submission_date: string | null;
  authorized: boolean;
  created_at: string;
  data_type: "report" | "prodoc";
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  indicator_count: number;
}

export type GroupMode = "year" | "organization";

export const GROUP_COLORS = [
  { bg: "bg-blue-50",    border: "border-blue-200",    icon: "text-blue-400",    label: "text-blue-700"   },
  { bg: "bg-amber-50",   border: "border-amber-200",   icon: "text-amber-400",   label: "text-amber-700"  },
  { bg: "bg-emerald-50", border: "border-emerald-200", icon: "text-emerald-400", label: "text-emerald-700"},
  { bg: "bg-violet-50",  border: "border-violet-200",  icon: "text-violet-400",  label: "text-violet-700" },
  { bg: "bg-rose-50",    border: "border-rose-200",    icon: "text-rose-400",    label: "text-rose-700"   },
  { bg: "bg-cyan-50",    border: "border-cyan-200",    icon: "text-cyan-400",    label: "text-cyan-700"   },
  { bg: "bg-orange-50",  border: "border-orange-200",  icon: "text-orange-400",  label: "text-orange-700" },
  { bg: "bg-teal-50",    border: "border-teal-200",    icon: "text-teal-400",    label: "text-teal-700"   },
];

export function ReportCard({
  report,
  color,
  onDelete,
}: {
  report: ReportRow;
  color: typeof GROUP_COLORS[number];
  onDelete: () => void;
}) {
  const router = useRouter();
  const [printing, setPrinting] = useState(false);

  async function handlePrint() {
    setPrinting(true);
    try {
      const slug = (report.project_short_name ?? report.project_title).toLowerCase().replace(/\s+/g, "-");
      const response = await fetch(`/api/reports/${report.id}/pdf`);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.project_short_name || "report"}_${report.year}_report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Print failed:", e);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Card
      onClick={() => {
        const slug = (report.project_short_name ?? report.project_title).toLowerCase().replace(/\s+/g, "-");
        router.push(`/admin/report-editor/${slug}/${report.year}/surveys`);
      }}
      className={`group relative flex flex-col gap-3 p-4 cursor-pointer transition-all border ${color.border} ${color.bg} hover:shadow-sm hover:brightness-[0.97]`}
    >
      {/* Print & Delete */}
      <div className="absolute right-2.5 top-2.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); handlePrint(); }}
          disabled={printing}
          className="rounded p-1 text-muted-foreground/30 hover:text-muted-foreground transition-colors disabled:opacity-50"
          title="Print to PDF"
        >
          {printing ? <Loader2 className="size-3.5 animate-spin" /> : <Printer className="size-3.5" />}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="rounded p-1 text-muted-foreground/30 hover:text-destructive transition-colors"
          title="Delete"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {/* Partner + type */}
      <div className="flex items-center gap-2 pr-6">
        <Badge variant="outline" className={`text-[11px] font-semibold border ${color.border} ${color.label} bg-transparent`}>
          {report.partner_short_name}
        </Badge>
        <span className="text-[11px] text-muted-foreground capitalize">
          {report.report_type ?? "annual"}
        </span>
      </div>

      {/* Project title */}
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug line-clamp-2">
          {report.project_title}
        </p>
        {report.project_short_name && (
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {report.project_short_name}
          </p>
        )}
      </div>

      {/* Footer: status + date + arrow */}
      <div className="flex items-center justify-between gap-2 mt-auto">
        <div className="flex items-center gap-2">
          {report.authorized ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-green-700">
              <CheckCircle2 className="size-3" /> Authorized
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="size-3" /> Pending
            </span>
          )}
          {report.report_submission_date && (
            <span className="text-[11px] text-muted-foreground">
              · due {formatDate(report.report_submission_date)}
            </span>
          )}
        </div>
        <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
      </div>
    </Card>
  );
}

export function CreateReportSection({
  projects,
  dataType,
  onRefresh,
  labels,
}: {
  projects: Project[];
  dataType: "report" | "prodoc";
  onRefresh: () => void;
  labels?: { individual?: string; annual?: string; title?: string; description?: string };
}) {
  const [mode, setMode] = useState<"individual" | "annual" | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [year, setYear] = useState<string>(String(YEARS[YEARS.length - 1]));
  const [submissionDate, setSubmissionDate] = useState<string>("");
  const [reportType, setReportType] = useState<string>("annual");

  function reset() {
    setMode(null);
    setProjectId("");
    setYear(String(YEARS[YEARS.length - 1]));
    setSubmissionDate("");
    setReportType("annual");
    setFormError(null);
  }

  async function handleSubmit() {
    setFormError(null);
    setSuccessMsg(null);

    if (!year) { setFormError("Year is required"); return; }
    if (mode === "individual" && !projectId) { setFormError("Please select a project"); return; }

    setSaving(true);
    try {
      const body =
        mode === "annual"
          ? { year: Number(year), annual: true, report_submission_date: submissionDate || null, data_type: dataType, report_type: reportType }
          : { project_id: Number(projectId), year: Number(year), report_submission_date: submissionDate || null, data_type: dataType, report_type: reportType };

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create");
      }

      if (mode === "annual") {
        const data = await res.json();
        setSuccessMsg(`Created ${data.created}${data.skipped ? `, skipped ${data.skipped} existing` : ""}.`);
      } else {
        setSuccessMsg("Created successfully.");
      }

      reset();
      onRefresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  const individualLabel = labels?.individual ?? "Individual";
  const annualLabel = labels?.annual ?? "Annual (all projects)";
  const title = labels?.title ?? "Add a report";
  const description = labels?.description ?? "Create a single report for one project, or an annual report for all projects.";

  return (
    <Card className="p-5">
      {successMsg && (
        <div className="mb-4 rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2 text-sm text-green-700">
          {successMsg}
        </div>
      )}

      {mode === null ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setMode("individual"); setSuccessMsg(null); }}>
              <Plus className="size-4" /> {individualLabel}
            </Button>
            <Button
              onClick={() => { setMode("annual"); setSuccessMsg(null); }}
              className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90"
            >
              <Plus className="size-4" /> {annualLabel}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {formError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {formError}
            </div>
          )}

          <div className="flex items-end gap-2 w-full">
            {mode === "individual" && (
              <div className="space-y-1.5 flex-1 min-w-0">
                <Label className="text-xs">Project *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger className="w-full [&>span]:truncate [&>span]:block">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.partner_short_name} — {p.project_title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {mode === "annual" && (
              <p className="text-xs text-muted-foreground pb-2.5 flex-1">
                Creates one entry for every project for {year}. Existing ones are skipped.
              </p>
            )}

            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs">Report Type *</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs">Year *</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs">Submission Date</Label>
              <Input
                type="date"
                className="w-36"
                placeholder="dd/mm/yyyy"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2 shrink-0 pb-px">
              <Button variant="outline" onClick={reset} disabled={saving}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {mode === "annual" ? `Create All` : "Create"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
