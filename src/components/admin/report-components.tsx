"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Trash2,
  Loader2,
  CheckCircle2,
  Clock,
  ArrowRight,
  Printer,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Field, FormShell } from "@/components/admin/shared";

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
  status: "Open" | "Closed" | "Pending";
  created_at: string;
  data_type: "report" | "prodoc";
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  indicator_count: number;
}

export type GroupMode = "year" | "organization" | "status";

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

const STATUS_STYLES: Record<string, string> = {
  Open:    "bg-blue-50 text-blue-700 border-blue-200",
  Pending: "bg-amber-50 text-amber-700 border-amber-200",
  Closed:  "bg-zinc-100 text-zinc-500 border-zinc-200",
};

export function ReportCard({
  report,
  onDelete,
  groupMode = "year",
}: {
  report: ReportRow;
  onDelete: () => void;
  groupMode?: GroupMode;
}) {
  const router = useRouter();
  const [printing, setPrinting] = useState(false);
  const [status, setStatus] = useState<ReportRow["status"]>(report.status);

  async function handlePrint() {
    setPrinting(true);
    try {
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

  async function handleStatusChange(newStatus: ReportRow["status"]) {
    setStatus(newStatus);
    await fetch(`/api/reports/${report.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  return (
    <Card
      onClick={() => {
        const slug = (report.project_short_name ?? report.project_title).toLowerCase().replace(/\s+/g, "-");
        router.push(`/admin/report-editor/${slug}/${report.year}/surveys`);
      }}
      className="group relative flex flex-col gap-3 p-4 cursor-pointer transition-all hover:bg-muted/30"
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

      {/* Partner/year + type */}
      <div className="flex items-center gap-2 pr-6">
        <Badge variant="outline" className="text-[11px] font-semibold tabular-nums">
          {groupMode === "organization" ? report.year : report.partner_short_name}
        </Badge>
        <Badge variant="secondary" className="text-[11px] font-semibold capitalize">
          {report.report_type ?? "annual"}
        </Badge>
      </div>

      {/* Project title */}
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug line-clamp-2">
          {report.project_title}
        </p>
      </div>

      {/* Footer: auth + date + status dropdown + arrow */}
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
        <div className="flex items-center gap-1.5">
          <div onClick={(e) => e.stopPropagation()}>
            <Select value={status} onValueChange={(v) => handleStatusChange(v as ReportRow["status"])}>
              <SelectTrigger className={`h-5 px-1.5 text-[10px] font-semibold border rounded gap-1 [&>svg]:size-2.5 ${STATUS_STYLES[status] ?? ""}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ArrowRight className="size-3.5 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
        </div>
      </div>
    </Card>
  );
}

export function CreateReportForm({
  open,
  onClose,
  projects,
  dataType,
  onRefresh,
  title,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  dataType: "report" | "prodoc";
  onRefresh: () => void;
  title: string;
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [year, setYear] = useState<string>(String(YEARS[YEARS.length - 1]));
  const [submissionDate, setSubmissionDate] = useState<string>("");
  const [reportType, setReportType] = useState<string>("annual");

  function reset() {
    setProjectId("");
    setYear(String(YEARS[YEARS.length - 1]));
    setSubmissionDate("");
    setReportType("annual");
    setFormError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleSubmit() {
    setFormError(null);
    if (!projectId) { setFormError("Please select a project"); return; }
    if (!year) { setFormError("Year is required"); return; }

    setSaving(true);
    try {
      const body = {
        project_id: Number(projectId),
        year: Number(year),
        report_submission_date: submissionDate || null,
        data_type: dataType,
        report_type: reportType,
      };

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create");
      }

      reset();
      onClose();
      onRefresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <FormShell
      title={title}
      onClose={handleClose}
      error={formError}
      saving={saving}
      editMode={false}
      onCancel={handleClose}
      onSubmit={handleSubmit}
    >
      <div className="space-y-4">
        <div className={`grid w-full gap-4 ${dataType === "report" ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"}`}>
          <Field label="Project" required>
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
          </Field>

          {dataType === "report" && (
            <Field label="Report type" required>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Year" required>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {dataType === "report" && (
            <Field label="Submission date">
              <Input
                type="date"
                className="w-full"
                placeholder="dd/mm/yyyy"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
              />
            </Field>
          )}
        </div>
      </div>
    </FormShell>
  );
}
