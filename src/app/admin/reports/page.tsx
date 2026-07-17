"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  CalendarDays,
  Building2,
  Layers,
  Plus,
  CheckCircle2,
  Clock,
  Trash2,
  Printer,
  CircleDot,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate } from "@/lib/utils";
import { PageHeader, ViewToggle } from "@/components/admin/shared";
import {
  ReportRow,
  Project,
  GroupMode,
  ReportCard,
  CreateReportForm,
} from "@/components/admin/report-components";

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("year");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"list" | "grid">("grid");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/reports?data_type=report"),
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

  useEffect(() => { loadData(); }, [loadData]);

  const STATUS_ORDER = ["Open", "Pending", "Closed"];

  const groups = useMemo(() => {
    const map = new Map<string, ReportRow[]>();
    for (const r of reports) {
      const key =
        groupMode === "year" ? String(r.year) :
        groupMode === "organization" ? (r.partner_long_name || r.partner_short_name) :
        r.status;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (groupMode === "year") return b[0].localeCompare(a[0]);
      if (groupMode === "status") return STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]);
      return a[0].localeCompare(b[0]);
    });
  }, [reports, groupMode]);

  const confirm = useConfirm();

  async function handleDelete(id: number) {
    if (!await confirm({ message: "Delete this report and all its indicator data?" })) return;
    const res = await fetch(`/api/reports/${id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else setError("Failed to delete report");
  }

  function navigateToReport(r: ReportRow) {
    const slug = (r.project_short_name ?? r.project_title).toLowerCase().replace(/\s+/g, "-");
    router.push(`/admin/report-editor/${slug}/${r.year}/surveys`);
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Reports" description="Create and manage reporting periods for projects">
        {view === "grid" && (
          <>
            <Layers className="size-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Group by</span>
            <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
              <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="year">Year</SelectItem>
                <SelectItem value="organization">Organization</SelectItem>
                <SelectItem value="status">Status</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <ViewToggle view={view} onChange={setView} />
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" /> Add report
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <CreateReportForm
          open={showForm}
          onClose={() => setShowForm(false)}
          projects={projects}
          dataType="report"
          onRefresh={loadData}
          title="New report"
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No reports yet. Create one above to get started.
          </div>
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigateToReport(r)}
                >
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {r.partner_short_name}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="text-xs font-semibold capitalize">
                      {r.report_type ?? "annual"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{r.year}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm">{r.project_title}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold border ${
                      r.status === "Open"    ? "bg-blue-50 text-blue-700 border-blue-200" :
                      r.status === "Pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                                              "bg-zinc-100 text-zinc-500 border-zinc-200"
                    }`}>
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell>
                    {r.authorized ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                        <CheckCircle2 className="size-3" /> Authorized
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" /> Pending
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.report_submission_date ? formatDate(r.report_submission_date) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(r.id)}
                        className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="space-y-5">
            {groups.map(([key, rows]) => (
              <div key={key} className="space-y-2">
                <div className="flex items-center gap-2">
                  {groupMode === "year" ? (
                    <CalendarDays className="size-4 text-muted-foreground" />
                  ) : groupMode === "status" ? (
                    <CircleDot className="size-4 text-muted-foreground" />
                  ) : (
                    <Building2 className="size-4 text-muted-foreground" />
                  )}
                  <h3 className="text-base font-bold">{key}</h3>
                  <span className="text-sm text-muted-foreground">({rows.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {rows.map((r) => (
                    <ReportCard
                      key={r.id}
                      report={r}
                      groupMode={groupMode}
                      onDelete={() => handleDelete(r.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
