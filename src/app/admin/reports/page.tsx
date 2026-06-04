"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  X,
  Loader2,
  CalendarDays,
  Building2,
  FileText,
  CheckCircle2,
  Circle,
  Layers,
} from "lucide-react";

const YEARS = [2023, 2024, 2025, 2026];

interface Project {
  id: number;
  project_title: string;
  partner_short_name: string;
  partner_long_name: string | null;
}

interface ReportRow {
  id: number;
  project_id: number;
  year: number;
  report_submission_date: string | null;
  authorized: boolean;
  created_at: string;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string;
  partner_long_name: string | null;
  indicator_count: number;
}

type GroupMode = "year" | "organization";

// Faint group color palette — bg + border + icon
const GROUP_COLORS = [
  { bg: "bg-blue-50",   border: "border-blue-200",   icon: "text-blue-400",   label: "text-blue-700"  },
  { bg: "bg-amber-50",  border: "border-amber-200",  icon: "text-amber-400",  label: "text-amber-700" },
  { bg: "bg-emerald-50",border: "border-emerald-200",icon: "text-emerald-400",label: "text-emerald-700"},
  { bg: "bg-violet-50", border: "border-violet-200", icon: "text-violet-400", label: "text-violet-700" },
  { bg: "bg-rose-50",   border: "border-rose-200",   icon: "text-rose-400",   label: "text-rose-700"  },
  { bg: "bg-cyan-50",   border: "border-cyan-200",   icon: "text-cyan-400",   label: "text-cyan-700"  },
  { bg: "bg-orange-50", border: "border-orange-200", icon: "text-orange-400", label: "text-orange-700"},
  { bg: "bg-teal-50",   border: "border-teal-200",   icon: "text-teal-400",   label: "text-teal-700"  },
];

export default function ReportsPage() {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("year");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/reports"),
        fetch("/api/projects"),
      ]);
      if (!rRes.ok) throw new Error("Failed to load reports");
      if (!pRes.ok) throw new Error("Failed to load projects");
      setReports(await rRes.json());
      setProjects(await pRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const groups = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const key =
        groupMode === "year"
          ? String(r.year)
          : r.partner_long_name || r.partner_short_name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) =>
      groupMode === "year" ? b[0].localeCompare(a[0]) : a[0].localeCompare(b[0])
    );
  }, [reports, groupMode]);

  async function handleDelete(id: number) {
    if (!confirm("Delete this report and all its indicator data?")) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else setError("Failed to delete report");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 py-4">
        <h1 className="text-2xl font-bold font-qanelas">Reports</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Create and manage reporting periods for projects
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <CreateReportSection projects={projects} onRefresh={loadData} />

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileText className="size-5 text-muted-foreground" /> All Reports
            <span className="text-sm font-normal text-muted-foreground">
              ({reports.length})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Group by</span>
            <Select
              value={groupMode}
              onValueChange={(v) => setGroupMode(v as GroupMode)}
            >
              <SelectTrigger className="w-[160px] h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No reports yet. Create one above to get started.
          </div>
        ) : (
          <div className="space-y-5">
            {groups.map(([key, rows], gi) => {
              const color = GROUP_COLORS[gi % GROUP_COLORS.length];
              return (
                <div key={key} className="space-y-2">
                  <div className="flex items-center gap-2">
                    {groupMode === "year" ? (
                      <CalendarDays className={`size-4 ${color.icon}`} />
                    ) : (
                      <Building2 className={`size-4 ${color.icon}`} />
                    )}
                    <h3 className={`text-base font-bold ${color.label}`}>{key}</h3>
                    <span className="text-sm text-muted-foreground">
                      ({rows.length})
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {rows.map((r) => (
                      <ReportCard
                        key={r.id}
                        report={r}
                        groupMode={groupMode}
                        color={color}
                        onDelete={() => handleDelete(r.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  groupMode,
  color,
  onDelete,
}: {
  report: ReportRow;
  groupMode: GroupMode;
  color: typeof GROUP_COLORS[number];
  onDelete: () => void;
}) {
  return (
    <Card
      className={`group relative p-3.5 transition-shadow hover:shadow-md border ${color.border} ${color.bg}`}
    >
      <button
        onClick={onDelete}
        className="absolute right-2.5 top-2.5 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
        title="Delete report"
      >
        <Trash2 className="size-3.5" />
      </button>

      <div className="flex items-start gap-2 pr-6">
        {groupMode === "year" ? (
          <Building2 className={`mt-0.5 size-4 shrink-0 ${color.icon}`} />
        ) : (
          <CalendarDays className={`mt-0.5 size-4 shrink-0 ${color.icon}`} />
        )}
        <div className="min-w-0">
          <p className="truncate text-[15px] font-bold leading-snug" title={report.project_title}>
            {report.project_title}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {report.partner_long_name || report.partner_short_name}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {groupMode === "organization" && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <CalendarDays className="size-3" /> {report.year}
          </Badge>
        )}
        {report.authorized ? (
          <Badge className="gap-1 text-xs bg-green-500/15 text-green-700 hover:bg-green-500/15">
            <CheckCircle2 className="size-3" /> Authorized
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
            <Circle className="size-3" /> Pending
          </Badge>
        )}
        <Badge variant="outline" className="text-xs text-muted-foreground">
          {report.indicator_count} indicators
        </Badge>
      </div>
    </Card>
  );
}

function CreateReportSection({
  projects,
  onRefresh,
}: {
  projects: Project[];
  onRefresh: () => void;
}) {
  const [mode, setMode] = useState<"individual" | "annual" | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [projectId, setProjectId] = useState<string>("");
  const [year, setYear] = useState<string>(String(YEARS[YEARS.length - 1]));
  const [submissionDate, setSubmissionDate] = useState<string>("");

  function reset() {
    setMode(null);
    setProjectId("");
    setYear(String(YEARS[YEARS.length - 1]));
    setSubmissionDate("");
    setFormError(null);
  }

  async function handleSubmit() {
    setFormError(null);
    setSuccessMsg(null);

    if (!year) {
      setFormError("Year is required");
      return;
    }
    if (mode === "individual" && !projectId) {
      setFormError("Please select a project");
      return;
    }

    setSaving(true);
    try {
      const body =
        mode === "annual"
          ? {
              year: Number(year),
              annual: true,
              report_submission_date: submissionDate || null,
            }
          : {
              project_id: Number(projectId),
              year: Number(year),
              report_submission_date: submissionDate || null,
            };

      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create report");
      }

      if (mode === "annual") {
        const data = await res.json();
        setSuccessMsg(
          `Created ${data.created} report(s)${
            data.skipped ? `, skipped ${data.skipped} existing` : ""
          }.`
        );
      } else {
        setSuccessMsg("Report created.");
      }

      reset();
      onRefresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

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
            <p className="text-sm font-semibold">Add a report</p>
            <p className="text-xs text-muted-foreground">
              Create a single report for one project, or an annual report for all
              projects.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setMode("individual");
                setSuccessMsg(null);
              }}
            >
              <Plus className="size-4" /> Individual Report
            </Button>
            <Button
              onClick={() => {
                setMode("annual");
                setSuccessMsg(null);
              }}
              className="bg-crafd-yellow text-black hover:bg-crafd-yellow/90"
            >
              <Plus className="size-4" /> Annual Report
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
                Creates a report for every project for {year}. Existing ones are skipped.
              </p>
            )}

            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs">Year *</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 shrink-0">
              <Label className="text-xs">Submission Date</Label>
              <Input
                type="date"
                className="w-36"
                value={submissionDate}
                onChange={(e) => setSubmissionDate(e.target.value)}
              />
            </div>

            <div className="flex gap-2 shrink-0 pb-px">
              <Button variant="outline" onClick={reset} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving && <Loader2 className="size-4 animate-spin" />}
                {mode === "annual" ? "Create Annual Reports" : "Create Report"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
