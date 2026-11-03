"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
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
  CalendarDays,
  CheckCircle2,
  Clock,
  MoreHorizontal,
} from "lucide-react";
import { formatDate, projectSlug, timeAgo, shortName } from "@/lib/utils";
import { StatusPill } from "@/components/partner/status-pill";
import { reportStatusStyle } from "@/lib/reports";
import { optionValues, optionItems } from "@/lib/options";
import type { Report } from "@/lib/types";
import { Field, FormShell } from "@/components/admin/shared";
import {
  MAX_EXTENSION_MONTHS,
  MIN_EXTENSION_MONTHS,
  modulesToSections,
  needsMonths,
} from "@/lib/update-modules";
import { UpdateModuleMatrix } from "@/components/admin/update-module-matrix";
import { StatusChangeDialog } from "@/components/ui/status-change-dialog";

const YEARS = [2023, 2024, 2025, 2026];

function ChangeDateDialogUI({
  currentDate,
  onCancel,
  onSave,
}: {
  currentDate: string | null;
  onCancel: () => void;
  onSave: (date: string) => Promise<string | null>;
}) {
  const [value, setValue] = useState(currentDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const err = await onSave(value);
    setSaving(false);
    if (err) setError(err);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
      <div
        className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <CalendarDays className="size-4" />
            </span>
            <p className="mt-1.5 text-sm font-semibold text-foreground">Change submission date</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-foreground">Submission date</label>
            <DateInput
              value={value}
              onChange={(v) => setValue(v)}
            />
            <p className="text-xs text-muted-foreground">Leave empty to clear the date.</p>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 px-6 pb-5">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>
  );
}

function ChangeDateDialog({
  open,
  currentDate,
  onCancel,
  onSave,
}: {
  open: boolean;
  currentDate: string | null;
  onCancel: () => void;
  onSave: (date: string) => Promise<string | null>;
}) {
  if (!open || typeof window === "undefined") return null;
  return createPortal(
    <ChangeDateDialogUI currentDate={currentDate} onCancel={onCancel} onSave={onSave} />,
    document.body
  );
}

export interface Project {
  id: number;
  project_title: string;
  partner_short_name: string;
  partner_long_name: string | null;
}

export type ReportRow = Report;

export type GroupMode = "year" | "organization" | "status";

// Single neutral style; kept as a one-element array so any indexed access still works.
export const GROUP_COLORS = [
  { bg: "bg-white", border: "border-crafd-grey-100", icon: "text-crafd-grey-400", label: "text-crafd-grey-800" },
];

// Status control for the table views: the same options, confirmation dialog and
// API call as the card's "..." menu. Reports, project updates and project
// documents all share the report status model.
// Table cells shared by the Reports and Project Updates lists.
export function ReportAuthCell({ authorized }: { authorized: boolean }) {
  return authorized ? (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 whitespace-nowrap">
      <CheckCircle2 className="size-3" /> Authorized
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap">
      <Clock className="size-3" /> Pending
    </span>
  );
}

// Completion bar: yellow while the document is Open (being filled in), grey once
// it has moved on to review or is closed.
export function ReportProgressCell({ pct, open }: { pct: number; open: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]" title={`${pct}% complete`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${open ? "bg-crafd-yellow" : "bg-crafd-grey-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}

export function ReportStatusSelect({
  report,
  onStatusChange,
}: {
  report: ReportRow;
  onStatusChange?: (id: number, status: ReportRow["status"]) => void;
}) {
  const [status, setStatus] = useState<ReportRow["status"]>(report.status);
  useEffect(() => { setStatus(report.status); }, [report.status]);
  const [pendingStatus, setPendingStatus] = useState<ReportRow["status"] | null>(null);

  async function applyStatusChange({ actorName, reason }: { actorName: string; reason: string }) {
    const newStatus = pendingStatus;
    if (!newStatus) return;
    setPendingStatus(null);
    setStatus(newStatus);
    onStatusChange?.(report.id, newStatus);
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

  return (
    <>
      <Select value={status} onValueChange={(v) => setPendingStatus(v as ReportRow["status"])}>
        <SelectTrigger
          title="Change status"
          className={`!h-7 w-fit shrink-0 px-2 text-xs font-semibold border rounded-full [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(status)}`}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {optionValues("reportStatus").map((st) => (
            <SelectItem key={st} value={st}>{st}</SelectItem>
          ))}
        </SelectContent>
      </Select>
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

// Completion (%) per document id, from /api/report-completion. Reports count every
// section; an update only counts the pages it unlocked (same rule as the partner
// Project Updates list). Failures read as 0 rather than breaking the page.
export function useReportCompletion(rows: { id: number; data_type?: string; unlocked_sections?: string[] }[]): Record<number, number> {
  const [completion, setCompletion] = useState<Record<number, number>>({});
  useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    Promise.all(
      rows.map((row) =>
        fetch(`/api/report-completion?reportId=${row.id}`)
          .then((res) => res.json())
          .then((data: { sections?: Record<string, boolean>; completed?: number; totalSections?: number }) => {
            let done: number;
            let total: number;
            if (row.data_type === "update" && row.unlocked_sections) {
              const sections = data.sections ?? {};
              total = row.unlocked_sections.length;
              done = row.unlocked_sections.filter((k) => sections[k] === true).length;
            } else {
              done = data.completed ?? 0;
              total = data.totalSections ?? 0;
            }
            return { id: row.id, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
          })
          .catch(() => ({ id: row.id, pct: 0 }))
      )
    ).then((results) => {
      if (cancelled) return;
      const c: Record<number, number> = {};
      for (const { id, pct } of results) c[id] = pct;
      setCompletion(c);
    });
    return () => { cancelled = true; };
  }, [rows]);
  return completion;
}

// The card used by the Reports grid and, with the three optional props below,
// by the Project Updates grid: an update is the same object with its own type
// badges, its own editor and its own wording. Left alone, every prop keeps the
// report behaviour it had before, so the Reports page is untouched.
export function ReportCard({
  report,
  onDelete,
  groupMode = "year",
  typeBadges,
  href,
  footerLabel = "Project Report",
  completion = 0,
  onStatusChange,
}: {
  report: ReportRow;
  onDelete: () => void;
  groupMode?: GroupMode;
  /** Badges shown beside the partner/year one. Defaults to the report type. */
  typeBadges?: { text: string; title?: string }[];
  /** Where the card opens. Defaults to this report's editor. */
  href?: string;
  /** Small uppercase label in the footer ("Project Report" / "Project Update"). */
  footerLabel?: string;
  /** Completion percentage (0–100) for the footer progress bar. */
  completion?: number;
  /** Called after a status change is saved, so the page can keep its list in step. */
  onStatusChange?: (id: number, status: ReportRow["status"]) => void;
}) {
  const router = useRouter();
  // The /api/reports/[id]/pdf endpoint still exists but its output is not presentable
  // yet, so the Print control was pulled rather than the feature deleted.
  const [status, setStatus] = useState<ReportRow["status"]>(report.status);
  // Follow the list when the status is changed elsewhere (e.g. the table view).
  useEffect(() => { setStatus(report.status); }, [report.status]);
  const [pendingStatus, setPendingStatus] = useState<ReportRow["status"] | null>(null);
  const [submissionDate, setSubmissionDate] = useState<string | null>(report.report_submission_date ?? null);
  const [dateDialogOpen, setDateDialogOpen] = useState(false);

  async function handleSaveDate(date: string): Promise<string | null> {
    const res = await fetch(`/api/reports/${report.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_submission_date: date || null }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return data.error || "Failed to update submission date";
    }
    setSubmissionDate(date || null);
    setDateDialogOpen(false);
    return null;
  }

  function handleStatusChange(newStatus: ReportRow["status"]) {
    setPendingStatus(newStatus);
  }

  async function applyStatusChange({ actorName, reason }: { actorName: string; reason: string }) {
    const newStatus = pendingStatus;
    if (!newStatus) return;
    setPendingStatus(null);
    setStatus(newStatus);
    onStatusChange?.(report.id, newStatus);
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
  const target = href ?? `/admin/report-editor/${slug}/${report.year}/overview`;
  const badges = typeBadges ?? [{ text: report.report_type ?? "annual" }];

  return (
    <>
    <Card
      onClick={() => router.push(target)}
      className="group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-colors hover:bg-muted/30 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground mb-1 uppercase">
            {groupMode === "organization" ? report.year : shortName(report.partner_short_name)}
            {badges.map((b) => (
              <span key={b.text}>
                {" · "}
                <span title={b.title}>{b.text}</span>
              </span>
            ))}
          </p>
          <p className="text-lg font-semibold leading-snug">{report.project_title}</p>
        </div>
        <div className="shrink-0">
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
                <DropdownMenuItem onSelect={() => setDateDialogOpen(true)}>
                  <CalendarDays />
                  Change submission date
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </div>

      {submissionDate && (
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="size-3 shrink-0" />
            Due {formatDate(submissionDate)}
          </span>
        </div>
      )}

      {/* Footer — same pattern as the Projects card: label + last edited, then
          status and progress. The whole card opens the document. */}
      <div className="mt-auto pt-3 border-t">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{footerLabel}</p>
          {report.last_edited && (
            <span className="text-xs text-muted-foreground" title={`Last edited ${formatDate(report.last_edited)}`}>
              edited {timeAgo(report.last_edited)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={status} />
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${status === "Open" ? "bg-crafd-yellow" : "bg-crafd-grey-400"} rounded-full transition-all duration-300`}
              style={{ width: `${completion}%` }}
            />
          </div>
          <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">{completion}%</span>
        </div>
      </div>
    </Card>

    <ChangeDateDialog
      open={dateDialogOpen}
      currentDate={submissionDate}
      onCancel={() => setDateDialogOpen(false)}
      onSave={handleSaveDate}
    />

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
  existing = [],
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  dataType: "report" | "prodoc" | "update";
  onRefresh: () => void;
  title: string;
  /** Documents of this type that already exist, so the form can spot a clash on
   *  (project, year) and ask for an index instead of failing on submit. */
  existing?: Pick<Report, "project_id" | "year" | "update_index">[];
}) {
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [year, setYear] = useState<string>("");
  const [submissionDate, setSubmissionDate] = useState<string>("");
  const [reportType, setReportType] = useState<string>(() => optionValues("reportType")[0] ?? "annual");
  const [projectYears, setProjectYears] = useState<number[]>([]);
  const [loadingYears, setLoadingYears] = useState(false);
  // A project update is assembled from the module matrix: the update types the
  // admin ticked (columns) and the modules the update covers (rows). The editor
  // tabs (`unlocked_sections`) are derived from the modules at submit time.
  const [updateTypes, setUpdateTypes] = useState<string[]>([]);
  const [updateModules, setUpdateModules] = useState<string[]>([]);
  // One extension length for the whole update, shared by every row that shows a
  // months field — so the Work Plan and Expenditure figures cannot disagree.
  const [updateMonths, setUpdateMonths] = useState<number | null>(null);
  // Free-text tag separating a second update for a year from the first. Only
  // editable once a clash is detected — see `clash` below.
  const [updateIndex, setUpdateIndex] = useState<string>("");

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

  // Documents are not always filed inside the project's own time frame — a final
  // report can land after it closes, an update can look back before it opened.
  // So the picker offers YEAR_PADDING years either side of the project's range
  // (the range itself comes from project_year_range in the database).
  const YEAR_PADDING = 5;
  const yearOptions = useMemo(() => {
    const now = new Date().getFullYear();
    const first = projectYears.length ? Math.min(...projectYears) : now;
    const last = projectYears.length ? Math.max(...projectYears) : now;
    const from = first - YEAR_PADDING;
    const to = last + YEAR_PADDING;
    return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }, [projectYears]);

  const withinProject = (y: number) => projectYears.includes(y);

  // Updates already filed for this project and year. The first one owns the
  // empty index, so any further update needs one of its own.
  const clash = useMemo(() => {
    if (dataType !== "update" || !projectId || !year) return [];
    return existing.filter(
      (r) => r.project_id === Number(projectId) && r.year === Number(year)
    );
  }, [existing, dataType, projectId, year]);

  function reset() {
    setProjectId("");
    setYear("");
    setProjectYears([]);
    setSubmissionDate("");
    setReportType(optionValues("reportType")[0] ?? "annual");
    setUpdateTypes([]);
    setUpdateModules([]);
    setUpdateMonths(null);
    setUpdateIndex("");
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
    // The partner's pages follow from the chosen modules: each module group maps
    // to one page, and the add-ons under it pick which version that page renders.
    const derivedSections = modulesToSections(updateModules);
    if (dataType === "update") {
      if (updateModules.length === 0) {
        setFormError("Select at least one module for this update");
        return;
      }
      // A second update for a year has to be distinguishable from the first.
      const index = updateIndex.trim();
      if (clash.length > 0 && !index) {
        setFormError(`A project update already exists for ${year} — give this one an index`);
        return;
      }
      if (clash.some((r) => (r.update_index ?? "").trim() === index)) {
        setFormError(`A project update for ${year} already uses the index "${index}"`);
        return;
      }
      // An extended-time-frame row without a figure would read "by XX months".
      if (
        needsMonths(updateModules) &&
        (updateMonths === null ||
          !Number.isInteger(updateMonths) ||
          updateMonths < MIN_EXTENSION_MONTHS ||
          updateMonths > MAX_EXTENSION_MONTHS)
      ) {
        setFormError(
          `Enter the length of the extension (${MIN_EXTENSION_MONTHS}–${MAX_EXTENSION_MONTHS} months)`
        );
        return;
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> =
        dataType === "update"
          ? { project_id: Number(projectId), year: Number(year), report_submission_date: submissionDate || null, data_type: "update", unlocked_sections: derivedSections, update_types: updateTypes, update_modules: updateModules, update_months: needsMonths(updateModules) ? updateMonths : null, update_index: updateIndex.trim() }
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
        <div className={`grid w-full gap-4 ${dataType === "prodoc" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
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
              <SelectTrigger className="w-full"><SelectValue placeholder={loadingYears ? "Loading..." : "Select a year"} /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {/* Years outside the project's own range stay selectable but
                        are marked, so picking one is always deliberate. */}
                    {withinProject(y) ? y : `${y} · outside project`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {dataType === "update" && (
            <Field
              label="Index"
              hint="Only needed when a project already has an update for the chosen year. Anything that tells them apart — a number, a word — shown after the year, e.g. Project Update 2027 (2)."
            >
              <Input
                className="w-full"
                value={updateIndex}
                onChange={(e) => setUpdateIndex(e.target.value)}
                disabled={clash.length === 0}
                maxLength={40}
                placeholder={clash.length === 0 ? "Not needed" : "e.g. 2"}
              />
              {clash.length > 0 && (
                <p className="text-xs text-crafd-grey-800">
                  {clash.length === 1
                    ? `A project update already exists for ${year}.`
                    : `${clash.length} project updates already exist for ${year}.`}{" "}
                  Give this one an index to tell them apart.
                </p>
              )}
            </Field>
          )}

          {(dataType === "report" || dataType === "update") && (
            <Field label={dataType === "update" ? "Due date" : "Submission date"}>
              <DateInput
                className="w-full"
                value={submissionDate}
                onChange={(v) => setSubmissionDate(v)}
              />
            </Field>
          )}
        </div>

        {dataType === "update" && (
          <Field
            label="Sections to unlock"
            required
            hint="Tick the update types this document covers, then adjust the modules it should contain. Several types can be combined into one modular update."
          >
            <UpdateModuleMatrix
              months={updateMonths}
              onMonthsChange={setUpdateMonths}
              selectedTypes={updateTypes}
              onTypesChange={setUpdateTypes}
              selectedModules={updateModules}
              onModulesChange={setUpdateModules}
            />
          </Field>
        )}
      </div>
    </FormShell>
  );
}
