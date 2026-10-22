"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  CalendarDays,
  Building2,
  Layers,
  Plus,
  Trash2,
  CircleDot,
  FolderKanban,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate, projectSlug, timeAgo, shortName } from "@/lib/utils";
import { reportStatusStyle } from "@/lib/reports";
import { PageHeader, ViewToggle, FilterBar, FilterSelect, ALL } from "@/components/admin/shared";
import {
  type ReportRow,
  type Project,
  type GroupMode,
  CreateReportForm,
} from "@/components/admin/report-components";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import { documentPath, firstUnlockedSection } from "@/lib/project-updates";
import { moduleLabel, updateTypeLabel } from "@/lib/update-modules";
import type { Report } from "@/lib/types";

type UpdateRow = ReportRow & { unlocked_sections?: string[] };

// What the update covers, most meaningful first: the categories the admin ticked
// in the module matrix, else its modules, else — for updates created before the
// matrix existed — the editor tabs it unlocked.
function updateSummary(r: UpdateRow): string {
  if (r.update_types?.length) return r.update_types.map(updateTypeLabel).join(", ");
  if (r.update_modules?.length) {
    return r.update_modules.map((k) => moduleLabel(k, r.update_months)).join(", ");
  }
  if (r.unlocked_sections?.length) {
    return r.unlocked_sections
      .map((k) => REPORT_SECTIONS.find((s) => s.value === k)?.label ?? k)
      .join(", ");
  }
  return "—";
}

export default function ProjectUpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<UpdateRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groupMode, setGroupMode] = useState<GroupMode>("year");
  const [showForm, setShowForm] = useState(false);
  const [view, setView] = useState<"list" | "grid">("grid");

  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterYear, setFilterYear] = useState<string>(ALL);

  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam) setFilterProject(projectParam);
  }, [searchParams]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rRes, pRes] = await Promise.all([
        fetch("/api/reports?data_type=update"),
        fetch("/api/projects"),
      ]);
      if (!rRes.ok) throw new Error("Failed to load project updates");
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

  const STATUS_ORDER = ["Open", "Under Review", "Closed"];

  const years = useMemo(
    () => Array.from(new Set(reports.map((r) => r.year))).sort((a, b) => b - a),
    [reports]
  );

  const filtered = useMemo(
    () => reports.filter(
      (r) =>
        (filterProject === ALL || String(r.project_id) === filterProject) &&
        (filterStatus === ALL || r.status === filterStatus) &&
        (filterYear === ALL || String(r.year) === filterYear)
    ),
    [reports, filterProject, filterStatus, filterYear]
  );

  const groups = useMemo(() => {
    const map = new Map<string, UpdateRow[]>();
    for (const r of filtered) {
      const key =
        groupMode === "year" ? String(r.year) :
        groupMode === "organization" ? (r.partner_long_name || shortName(r.partner_short_name)) :
        r.status;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries()).sort((a, b) => {
      if (groupMode === "year") return b[0].localeCompare(a[0]);
      if (groupMode === "status") return STATUS_ORDER.indexOf(a[0]) - STATUS_ORDER.indexOf(b[0]);
      return a[0].localeCompare(b[0]);
    });
  }, [filtered, groupMode]);

  const confirm = useConfirm();

  async function handleDelete(r: UpdateRow) {
    if (!await confirm({
      title: `Delete the ${r.year} project update for ${shortName(r.partner_short_name)}?`,
      message: "This deletes the project update and everything in it. It cannot be undone.",
      variant: "destructive",
    })) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else setError("Failed to delete project update");
  }

  function navigateToUpdate(r: UpdateRow) {
    const slug = projectSlug(r.project_short_name, r.project_title);
    // Pinned by id: several updates can share this project and year.
    router.push(
      documentPath(
        "/admin/project-updates",
        { ...r, data_type: "update" },
        slug,
        firstUnlockedSection(r.unlocked_sections)
      )
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Updates" description="Create and manage mid-year project updates">
        <ViewToggle view={view} onChange={setView} />
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" /> New project update
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <FilterSelect
          icon={FolderKanban}
          label="Project"
          value={filterProject}
          onChange={setFilterProject}
          allLabel="All projects"
          width={240}
          options={projects.map((p) => ({
            value: String(p.id),
            label: p.partner_short_name ? `${shortName(p.partner_short_name)} · ${p.project_title}` : p.project_title,
          }))}
        />
        <FilterSelect
          icon={CircleDot}
          label="Status"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All statuses"
          width={160}
          options={STATUS_ORDER.map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          icon={CalendarDays}
          label="Year"
          value={filterYear}
          onChange={setFilterYear}
          allLabel="All years"
          width={120}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        {view === "grid" && (
          <FilterSelect
            icon={Layers}
            label="Group by"
            value={groupMode === "year" ? ALL : groupMode}
            onChange={(v) => setGroupMode(v === ALL ? "year" : (v as GroupMode))}
            allLabel="Year"
            width={150}
            options={[{ value: "organization", label: "Organization" }, { value: "status", label: "Status" }]}
          />
        )}
      </FilterBar>

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
          dataType="update"
          onRefresh={loadData}
          title="New project update"
          // Unfiltered: the form matches on project + year itself, and filters
          // here must not hide a clash the database would still reject.
          existing={reports}
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No project updates yet. Create one above to get started.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No project updates match the current filters.
          </div>
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Sections</TableHead>
                <TableHead>Due date</TableHead>
                <TableHead>Last edited</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer"
                  onClick={() => navigateToUpdate(r)}
                >
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {shortName(r.partner_short_name)}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{r.year}</TableCell>
                  <TableCell className="max-w-[260px] truncate text-sm">{r.project_title}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold border ${reportStatusStyle(r.status)}`}>
                      {r.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {updateSummary(r)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.report_submission_date ? formatDate(r.report_submission_date) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground" title={r.last_edited ? formatDate(r.last_edited) : undefined}>
                    {r.last_edited ? timeAgo(r.last_edited) : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDelete(r)}
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
                  <h2 className="t-heading-section">{key}</h2>
                  <span className="text-sm text-muted-foreground">({rows.length})</span>
                </div>
                <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                  {rows.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => navigateToUpdate(r)}
                      className="group relative flex flex-col gap-3 p-4 cursor-pointer rounded-lg border bg-card transition-all hover:bg-muted/30"
                    >
                      <div className="flex items-center gap-2 pr-2">
                        <Badge variant="outline" className="text-xs font-semibold tabular-nums">
                          {groupMode === "organization" ? r.year : shortName(r.partner_short_name)}
                        </Badge>
                        {r.report_submission_date && (
                          <span className="text-xs text-muted-foreground ml-auto">
                            due {formatDate(r.report_submission_date)}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{r.project_title}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {updateSummary(r)}
                        </p>
                        {r.last_edited && (
                          <p className="mt-0.5 text-xs text-muted-foreground" title={`Last edited ${formatDate(r.last_edited)}`}>
                            edited {timeAgo(r.last_edited)}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-auto" onClick={(e) => e.stopPropagation()}>
                        <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs font-semibold ${reportStatusStyle(r.status)}`}>
                          {r.status}
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(r); }}
                          className="ml-auto rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
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
