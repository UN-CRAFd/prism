"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  CalendarDays,
  Building2,
  Plus,
  CircleDot,
  FolderKanban,
  Tags,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate, projectSlug, timeAgo, shortName } from "@/lib/utils";
import {
  PageHeader, FilterBar, FilterSelect, SearchInput, ResultCount, ALL,
  SortableHead, sortBy, useTableSort,
  ArchiveFilter, matchesArchive, type ArchiveView,
} from "@/components/admin/shared";
import {
  ReportRow,
  Project,
  ReportStatusSelect,
  ReportProgressCell,
  ReportRowMenu,
  CreateReportForm,
  useReportCompletion,
} from "@/components/admin/report-components";
import { optionItems } from "@/lib/options";
import { Hint } from "@/components/ui/hint";
import { isPartnerEditable } from "@/lib/report-status";
import { reportStatusLabel } from "@/lib/status-label";
import { Tag } from "@/components/ui/tag";

// Workflow order (see lib/report-status.ts).
const STATUS_ORDER = ["Open", "Under Review", "Partner Review", "Closed"];

type SortKey =
  | "partner" | "type" | "year" | "project" | "status" | "due" | "last_edited" | "progress";

export default function ReportsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Filter bar state.
  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [filterPartner, setFilterPartner] = useState<string>(ALL);
  const [filterType, setFilterType] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterYear, setFilterYear] = useState<string>(ALL);
  // Documents of archived projects are hidden unless asked for (archiving is
  // done per project, on the Projects page).
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");

  // Default: newest year first.
  const { sortKey, sortDir, toggle: toggleSort } = useTableSort<SortKey>("year", "desc");

  // Apply project filter from query parameter on mount
  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam) {
      setFilterProject(projectParam);
    }
  }, [searchParams]);

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

  // Completion per report (Progress column).
  const completion = useReportCompletion(reports);

  // Keep the list in step after the submission date is edited from the row menu.
  function handleDateChanged(id: number, date: string) {
    setReports((prev) => prev.map((x) => (x.id === id ? { ...x, report_submission_date: date } : x)));
  }

  // Keep the list in step after a status change from a table row.
  function handleStatusChanged(id: number, status: ReportRow["status"]) {
    setReports((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  // Distinct years present, for the year filter.
  const years = useMemo(
    () => Array.from(new Set(reports.map((r) => r.year))).sort((a, b) => b - a),
    [reports]
  );

  const partnerNames = useMemo(
    () => Array.from(new Set(reports.map((r) => r.partner_short_name).filter(Boolean)))
      .sort((a, b) => shortName(a).localeCompare(shortName(b))),
    [reports]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = reports.filter(
      (r) =>
        (filterProject === ALL || String(r.project_id) === filterProject) &&
        (filterPartner === ALL || r.partner_short_name === filterPartner) &&
        (filterType === ALL || (r.report_type ?? "annual") === filterType) &&
        (filterStatus === ALL || r.status === filterStatus) &&
        (filterYear === ALL || String(r.year) === filterYear) &&
        matchesArchive(r.archived, archiveView) &&
        (!q ||
          [r.project_title, r.project_short_name, r.partner_short_name, r.partner_long_name, String(r.year)]
            .some((v) => v?.toLowerCase().includes(q)))
    );
    return sortBy(
      matched,
      (r) => {
        switch (sortKey) {
          case "partner": return shortName(r.partner_short_name);
          case "type": return r.report_type ?? "annual";
          case "year": return r.year;
          case "project": return r.project_title;
          case "status": return STATUS_ORDER.indexOf(r.status);
          case "due": return r.report_submission_date ?? null;
          case "last_edited": return r.last_edited ?? null;
          case "progress": return completion[r.id] ?? 0;
        }
      },
      sortDir
    );
  }, [reports, completion, search, filterProject, filterPartner, filterType, filterStatus, filterYear, archiveView, sortKey, sortDir]);

  const filtersActive =
    !!search.trim() || filterProject !== ALL || filterPartner !== ALL || filterType !== ALL ||
    filterStatus !== ALL || filterYear !== ALL ||
    archiveView !== "active";

  function clearFilters() {
    setSearch("");
    setFilterProject(ALL);
    setFilterPartner(ALL);
    setFilterType(ALL);
    setFilterStatus(ALL);
    setFilterYear(ALL);
    setArchiveView("active");
  }

  const confirm = useConfirm();

  async function handleDelete(r: ReportRow) {
    if (!await confirm({
      title: `Delete the ${r.year} ${r.report_type ?? "annual"} report for ${shortName(r.partner_short_name)}?`,
      message: "This deletes the report and everything in it. It cannot be undone.",
      variant: "destructive",
    })) return;
    const res = await fetch(`/api/reports/${r.id}`, { method: "DELETE" });
    if (res.ok) loadData();
    else setError("Failed to delete report");
  }

  function navigateToReport(r: ReportRow) {
    const slug = projectSlug(r.project_short_name, r.project_title);
    router.push(`/admin/report-editor/${slug}/${r.year}/overview`);
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Reports" description="Create and manage reporting periods for projects">
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" /> Add report
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search reports…" className="max-w-[200px]" />
        <FilterSelect
          icon={FolderKanban}
          label="Project"
          value={filterProject}
          onChange={setFilterProject}
          allLabel="All projects"
          width={220}
          options={projects.map((p) => ({
            value: String(p.id),
            label: p.partner_short_name ? `${shortName(p.partner_short_name)} · ${p.project_title}` : p.project_title,
          }))}
        />
        <FilterSelect
          icon={Building2}
          label="Partner"
          value={filterPartner}
          onChange={setFilterPartner}
          allLabel="All partners"
          width={130}
          options={partnerNames.map((n) => ({ value: n, label: shortName(n) }))}
        />
        <FilterSelect
          icon={Tags}
          label="Type"
          value={filterType}
          onChange={setFilterType}
          allLabel="All types"
          width={120}
          options={optionItems("reportType").map((o) => ({ value: o.value, label: o.label }))}
        />
        <FilterSelect
          icon={CircleDot}
          label="Workflow"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All workflows"
          width={190}
          options={STATUS_ORDER.map((s) => ({ value: s, label: reportStatusLabel(s) }))}
        />
        <FilterSelect
          icon={CalendarDays}
          label="Year"
          value={filterYear}
          onChange={setFilterYear}
          allLabel="All years"
          width={110}
          options={years.map((y) => ({ value: String(y), label: String(y) }))}
        />
        <ArchiveFilter value={archiveView} onChange={setArchiveView} />
        <ResultCount shown={filtered.length} total={reports.length} noun="report" onClear={filtersActive ? clearFilters : undefined} />
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
          dataType="report"
          onRefresh={loadData}
          title="Create a new report"
        />

        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : reports.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No reports yet. Create one above to get started.
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No reports match the current filters.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 min-w-10 max-w-10 text-right">#</TableHead>
                <SortableHead label="Partner" column="partner" {...sortProps} />
                <SortableHead label="Type" column="type" {...sortProps} />
                <SortableHead label="Year" column="year" {...sortProps} />
                <SortableHead label="Project" column="project" {...sortProps} />
                <SortableHead label="Workflow" column="status" {...sortProps} />
                <SortableHead label="Progress" column="progress" {...sortProps} />
                <SortableHead label="Due date" column="due" {...sortProps} />
                <SortableHead label="Last edited" column="last_edited" {...sortProps} />
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r, i) => (
                <TableRow
                  key={r.id}
                  className={`cursor-pointer ${r.archived ? "text-muted-foreground [&_td]:opacity-70" : ""}`}
                  onClick={() => navigateToReport(r)}
                >
                  <TableCell className="w-10 min-w-10 max-w-10 text-right text-sm tabular-nums text-crafd-grey-600">{i + 1}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {shortName(r.partner_short_name)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Tag className="capitalize">{r.report_type ?? "annual"}</Tag>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{r.year}</TableCell>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <TableCell className="max-w-[260px] truncate text-sm">
                        {r.archived && (
                          <Hint label="The project is archived">
                            <Badge variant="outline" className="mr-1.5 text-xs font-normal">Archived</Badge>
                          </Hint>
                        )}
                        {r.project_title}
                      </TableCell>
                    </TooltipTrigger>
                    <TooltipContent>{r.project_title}</TooltipContent>
                  </Tooltip>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ReportStatusSelect report={r} onStatusChange={handleStatusChanged} />
                  </TableCell>
                  <TableCell>
                    <ReportProgressCell pct={completion[r.id] ?? 0} open={isPartnerEditable(r.status)} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.report_submission_date ? formatDate(r.report_submission_date) : "—"}
                  </TableCell>
                  <Hint label={r.last_edited ? formatDate(r.last_edited) : undefined}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {r.last_edited ? timeAgo(r.last_edited) : "—"}
                    </TableCell>
                  </Hint>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ReportRowMenu report={r} onDelete={() => handleDelete(r)} onDateChanged={handleDateChanged} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
