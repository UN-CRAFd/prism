"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  CircleDot,
  Clock,
  Copy,
  MoreHorizontal,
  Share2,
} from "lucide-react";
import { formatDate, projectSlug, timeAgo, shortName } from "@/lib/utils";
import { reportStatusStyle } from "@/lib/reports";
import { optionValues, optionItems } from "@/lib/options";
import type { Report } from "@/lib/types";
import { Field, FormShell } from "@/components/admin/shared";
import { StatusChangeDialog } from "@/components/ui/status-change-dialog";

const YEARS = [2023, 2024, 2025, 2026];

export interface Project {
  id: number;
  project_title: string;
  partner_short_name: string;
  partner_long_name: string | null;
}

export type ReportRow = Report;

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

const STATUS_ICONS: Record<string, React.ReactNode> = {
  Open:            <CircleDot className="size-3 shrink-0 text-blue-700" />,
  "Under Review":  <Clock className="size-3 shrink-0 text-amber-700" />,
  Closed:          <CheckCircle2 className="size-3 shrink-0 text-zinc-500" />,
};

function ShareDialogUI({
  link,
  error,
  onClose,
}: {
  link: string;
  error: string | null;
  onClose: () => void;
}) {
  const [justCopied, setJustCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(link).then(() => {
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          {error ? (
            <>
              <p className="text-sm font-semibold text-destructive">Failed to create share link</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                <p className="text-sm font-semibold">Link copied</p>
              </div>
              <input
                readOnly
                value={link}
                className="w-full rounded border border-border bg-muted px-3 py-1.5 text-xs font-mono text-muted-foreground select-all"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <p className="text-xs text-muted-foreground leading-relaxed">
                The link directs the recipient to a password page — the first visit sets the
                partner&apos;s password; every subsequent visit requires that password to sign
                in as the partner organization. Links are valid for 90 days.
              </p>
            </>
          )}
          <div className="flex justify-end gap-2 pt-1">
            {!error && (
              <Button variant="outline" size="sm" onClick={copyLink} className="gap-1.5">
                {justCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {justCopied ? "Copied" : "Copy"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

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
  // The /api/reports/[id]/pdf endpoint still exists but its output is not presentable
  // yet, so the Print control was pulled rather than the feature deleted.
  const [status, setStatus] = useState<ReportRow["status"]>(report.status);
  const [pendingStatus, setPendingStatus] = useState<ReportRow["status"] | null>(null);
  const [shareDialog, setShareDialog] = useState<{ link: string; error: string | null } | null>(null);

  async function handleShare() {
    try {
      const res = await fetch("/api/auth/magic", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reportId: report.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create link");
      }
      const { token } = await res.json();
      const link = `${window.location.origin}/m/${token}`;
      await navigator.clipboard.writeText(link);
      setShareDialog({ link, error: null });
    } catch (e) {
      setShareDialog({ link: "", error: e instanceof Error ? e.message : "Failed to create share link" });
    }
  }

  function handleStatusChange(newStatus: ReportRow["status"]) {
    setPendingStatus(newStatus);
  }

  async function applyStatusChange({ actorName, reason }: { actorName: string; reason: string }) {
    const newStatus = pendingStatus;
    if (!newStatus) return;
    setPendingStatus(null);
    setStatus(newStatus);
    await fetch(`/api/reports/${report.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        actor_name: actorName || null,
        reason: reason || null,
      }),
    });
  }

  const slug = projectSlug(report.project_short_name, report.project_title);

  return (
    <>
    <Card
      onClick={() => router.push(`/admin/report-editor/${slug}/${report.year}/overview`)}
      className="group relative flex flex-col gap-3 p-4 cursor-pointer transition-all hover:bg-muted/30"
    >
      {/* ⋯ menu — top right, always visible */}
      <div className="absolute right-2.5 top-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Status</DropdownMenuSubTrigger>
              <DropdownMenuSubContent onClick={(e) => e.stopPropagation()}>
                <DropdownMenuRadioGroup value={status} onValueChange={(v) => handleStatusChange(v as ReportRow["status"])}>
                  {optionValues("reportStatus").map((s) => (
                    <DropdownMenuRadioItem key={s} value={s}>{s}</DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleShare}>
              <Share2 />
              Share
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Top line: badges + due date */}
      <div className="flex items-center gap-2 pr-8">
        <Badge variant="outline" className="text-[11px] font-semibold tabular-nums">
          {groupMode === "organization" ? report.year : shortName(report.partner_short_name)}
        </Badge>
        <Badge variant="secondary" className="text-[11px] font-semibold capitalize">
          {report.report_type ?? "annual"}
        </Badge>
        {report.report_submission_date && (
          <span className="text-[11px] text-muted-foreground ml-auto">
            due {formatDate(report.report_submission_date)}
          </span>
        )}
      </div>

      {/* Project title */}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug">
          {report.project_title}
        </p>
        {report.last_edited && (
          <p className="mt-1 text-[11px] text-muted-foreground" title={`Last edited ${formatDate(report.last_edited)}`}>
            edited {timeAgo(report.last_edited)}
          </p>
        )}
      </div>

      {/* Bottom: status badge + open */}
      <div className="flex items-center gap-1.5 mt-auto" onClick={(e) => e.stopPropagation()}>
        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-[11px] font-semibold ${reportStatusStyle(status)}`}>
          {STATUS_ICONS[status]}
          {status}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); router.push(`/admin/report-editor/${slug}/${report.year}/overview`); }}
          className="h-7 flex-1 flex items-center justify-center gap-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          title="Open report"
        >
          Open report
          <ArrowRight className="size-3" />
        </button>
      </div>
    </Card>

    {shareDialog && (
      <ShareDialogUI
        link={shareDialog.link}
        error={shareDialog.error}
        onClose={() => setShareDialog(null)}
      />
    )}

    <StatusChangeDialog
      open={pendingStatus !== null}
      fromStatus={status}
      toStatus={pendingStatus ?? ""}
      onCancel={() => setPendingStatus(null)}
      onConfirm={applyStatusChange}
    />
    </>
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
  const [year, setYear] = useState<string>("");
  const [submissionDate, setSubmissionDate] = useState<string>("");
  const [reportType, setReportType] = useState<string>(() => optionValues("reportType")[0] ?? "annual");
  const [projectYears, setProjectYears] = useState<number[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);

  // Fetch available years when project is selected
  useEffect(() => {
    if (!projectId) {
      setProjectYears([]);
      setYear("");
      return;
    }
    const loadYears = async () => {
      setLoadingYears(true);
      try {
        const res = await fetch(`/api/expenditure-budgets?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setProjectYears(data.years || []);
          setYear(String(data.years?.[data.years.length - 1] || ""));
        }
      } catch (e) {
        console.error("Failed to load project years:", e);
      } finally {
        setLoadingYears(false);
      }
    };
    loadYears();
  }, [projectId]);

  function reset() {
    setProjectId("");
    setYear("");
    setProjectYears([]);
    setSubmissionDate("");
    setReportType(optionValues("reportType")[0] ?? "annual");
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
                    {shortName(p.partner_short_name)} — {p.project_title}
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
                  {optionItems("reportType").map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          <Field label="Year" required>
            <Select value={year} onValueChange={setYear} disabled={!projectId || loadingYears}>
              <SelectTrigger className="w-full"><SelectValue placeholder={loadingYears ? "Loading..." : projectYears.length === 0 && projectId ? "No years available" : "Select a year"} /></SelectTrigger>
              <SelectContent>
                {projectYears.map((y) => (
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
