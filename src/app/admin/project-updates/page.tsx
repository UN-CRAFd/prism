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
  Trash2,
  CircleDot,
  FolderKanban,
  Tags,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDate, projectSlug, timeAgo, shortName } from "@/lib/utils";
import {
  PageHeader, FilterBar, FilterSelect, FilterMultiSelect, SearchInput, ResultCount, ALL,
  SortableHead, sortBy, useTableSort,
  ArchiveFilter, matchesArchive, type ArchiveView, type MatchMode,
} from "@/components/admin/shared";
import {
  type ReportRow,
  type Project,
  ReportStatusSelect,
  ReportAuthCell,
  ReportProgressCell,
  CreateReportForm,
  useReportCompletion,
} from "@/components/admin/report-components";
import { documentPath, firstUnlockedSection } from "@/lib/project-updates";
import { UPDATE_TYPES, updateTypeLabel, updateTypeShort } from "@/lib/update-modules";
import { updateTypesCode } from "@/lib/update-types";

type UpdateRow = ReportRow & { unlocked_sections?: string[] };

// Filter value for updates created before the module matrix existed (no types).
const NO_TYPE = "__none__";

// What the update covers, as the badges a report shows its type in: one per
// category the admin ticked in the module matrix, abbreviated ("BR", "NCE", …)
// with the full name on hover. An update created before the matrix existed has
// no types to show and simply reads "Update".
function typeBadges(r: UpdateRow): { text: string; title?: string }[] {
  if (!r.update_types?.length) return [{ text: "Update" }];
  return r.update_types.map((t) => ({ text: updateTypeShort(t), title: updateTypeLabel(t) }));
}

// Type filter: no selection = everything. "any" keeps an update that carries at
// least one ticked type; "all" keeps one that carries every ticked type.
function matchesTypes(r: UpdateRow, selected: string[], match: MatchMode): boolean {
  if (selected.length === 0) return true;
  const has = (t: string) => (t === NO_TYPE ? !r.update_types?.length : (r.update_types ?? []).includes(t));
  return match === "all" ? selected.every(has) : selected.some(has);
}

const STATUS_ORDER = ["Open", "Under Review", "Closed"];

type SortKey =
  | "partner" | "type" | "year" | "project" | "status" | "auth" | "due" | "last_edited" | "progress";

// What follows the year in the Year column. The type codes are already shown as
// badges, so a name-style index ("BR-TR-AR") adds nothing; only its running
// number ("BR-TR-AR (2)" → "(2)") does. An older free-text index is kept in
// brackets as it always was.
function yearSuffix(r: UpdateRow): string {
  const code = updateTypesCode(r.update_types);
  const index = r.update_index?.trim() ?? "";
  if (!index) return "";
  if (code && index === code) return "";
  if (code && index.startsWith(`${code} (`)) return index.slice(code.length).trim();
  return `(${index})`;
}

// Year, then the running number numerically (so "(10)" follows "(2)"), then any
// older free-text index.
function yearSortKey(r: UpdateRow): string {
  const suffix = yearSuffix(r);
  const n = /^\((\d+)\)$/.exec(suffix)?.[1];
  const rank = !suffix ? "0000" : n ? n.padStart(4, "0") : `~${suffix}`;
  return `${r.year}-${rank}`;
}

export default function ProjectUpdatesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reports, setReports] = useState<UpdateRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [search, setSearch] = useState("");
  const [filterProject, setFilterProject] = useState<string>(ALL);
  const [filterPartner, setFilterPartner] = useState<string>(ALL);
  // Several types can be ticked; `typeMatch` decides whether an update needs
  // any of them (BR or NCE) or all of them (BR and NCE).
  const [filterTypes, setFilterTypes] = useState<string[]>([]);
  const [typeMatch, setTypeMatch] = useState<MatchMode>("any");
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterYear, setFilterYear] = useState<string>(ALL);
  const [filterAuth, setFilterAuth] = useState<string>(ALL);
  // Documents of archived projects are hidden unless asked for (archiving is
  // done per project, on the Projects page).
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");

  // Default: newest year first.
  const { sortKey, sortDir, toggle: toggleSort } = useTableSort<SortKey>("year", "desc");

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

  // Completion per update (Progress column).
  const completion = useReportCompletion(reports);

  // Keep the list in step after a status change from a table row.
  function handleStatusChanged(id: number, status: ReportRow["status"]) {
    setReports((prev) => prev.map((x) => (x.id === id ? { ...x, status } : x)));
  }

  const years = useMemo(
    () => Array.from(new Set(reports.map((r) => r.year))).sort((a, b) => b - a),
    [reports]
  );

  const partnerNames = useMemo(
    () => Array.from(new Set(reports.map((r) => r.partner_short_name).filter(Boolean)))
      .sort((a, b) => shortName(a).localeCompare(shortName(b))),
    [reports]
  );

  // Only offer the update types that actually occur, in matrix order.
  const typeOptions = useMemo(() => {
    const present = new Set(reports.flatMap((r) => r.update_types ?? []));
    const opts = UPDATE_TYPES.filter((t) => present.has(t.value))
      .map((t) => ({ value: t.value, label: `${t.short} · ${t.label}`, short: t.short }));
    if (reports.some((r) => !r.update_types?.length)) opts.push({ value: NO_TYPE, label: "Update (no type)", short: "Update" });
    return opts;
  }, [reports]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = reports.filter(
      (r) =>
        (filterProject === ALL || String(r.project_id) === filterProject) &&
        (filterPartner === ALL || r.partner_short_name === filterPartner) &&
        matchesTypes(r, filterTypes, typeMatch) &&
        (filterStatus === ALL || r.status === filterStatus) &&
        (filterYear === ALL || String(r.year) === filterYear) &&
        (filterAuth === ALL || (filterAuth === "yes") === !!r.authorized) &&
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
          // Ordered by the matrix column order of the first type, then the rest.
          case "type": return r.update_types?.length
            ? r.update_types.map((t) => String(UPDATE_TYPES.findIndex((u) => u.value === t)).padStart(2, "0")).join(",")
            : "99";
          case "year": return yearSortKey(r);
          case "project": return r.project_title;
          case "status": return STATUS_ORDER.indexOf(r.status);
          case "auth": return r.authorized ? 1 : 0;
          case "due": return r.report_submission_date ?? null;
          case "last_edited": return r.last_edited ?? null;
          case "progress": return completion[r.id] ?? 0;
        }
      },
      sortDir
    );
  }, [reports, completion, search, filterProject, filterPartner, filterTypes, typeMatch, filterStatus, filterYear, filterAuth, archiveView, sortKey, sortDir]);

  const filtersActive =
    !!search.trim() || filterProject !== ALL || filterPartner !== ALL || filterTypes.length > 0 ||
    filterStatus !== ALL || filterYear !== ALL || filterAuth !== ALL ||
    archiveView !== "active";

  function clearFilters() {
    setSearch("");
    setFilterProject(ALL);
    setFilterPartner(ALL);
    setFilterTypes([]);
    setFilterStatus(ALL);
    setFilterYear(ALL);
    setFilterAuth(ALL);
    setArchiveView("active");
  }

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

  // This page lists and creates; the editing happens in the editor, exactly as
  // the Reports page hands off to the report editor. Pinned by id, since several
  // updates can share a project and year.
  function updateHref(r: UpdateRow): string {
    return documentPath(
      "/admin/project-update-editor",
      { ...r, data_type: "update" },
      projectSlug(r.project_short_name, r.project_title),
      firstUnlockedSection(r.unlocked_sections)
    );
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Updates" description="Create and manage mid-year project updates">
        {!showForm && (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="size-3.5" /> New project update
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search updates…" className="max-w-[200px]" />
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
        <FilterMultiSelect
          icon={Tags}
          label="Type"
          value={filterTypes}
          onChange={setFilterTypes}
          allLabel="All types"
          width={150}
          options={typeOptions}
          match={typeMatch}
          onMatchChange={setTypeMatch}
        />
        <FilterSelect
          icon={CircleDot}
          label="Status"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All statuses"
          width={140}
          options={STATUS_ORDER.map((s) => ({ value: s, label: s }))}
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
        <FilterSelect
          icon={ShieldCheck}
          label="Auth"
          value={filterAuth}
          onChange={setFilterAuth}
          allLabel="All"
          width={130}
          options={[{ value: "yes", label: "Authorized" }, { value: "no", label: "Pending" }]}
        />
        <ArchiveFilter value={archiveView} onChange={setArchiveView} />
        <ResultCount shown={filtered.length} total={reports.length} noun="update" onClear={filtersActive ? clearFilters : undefined} />
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
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 min-w-10 max-w-10 text-right">#</TableHead>
                <SortableHead label="Partner" column="partner" {...sortProps} />
                <SortableHead label="Type" column="type" {...sortProps} />
                <SortableHead label="Year" column="year" {...sortProps} />
                <SortableHead label="Project" column="project" {...sortProps} />
                <SortableHead label="Status" column="status" {...sortProps} />
                <SortableHead label="Auth" column="auth" {...sortProps} />
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
                  onClick={() => router.push(updateHref(r))}
                >
                  <TableCell className="w-10 min-w-10 max-w-10 text-right text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {shortName(r.partner_short_name)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {typeBadges(r).map((b) => (
                        <Badge key={b.text} variant="secondary" className="text-xs font-semibold" title={b.title}>
                          {b.text}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums whitespace-nowrap">
                    {r.year}
                    {yearSuffix(r) && (
                      <span className="text-muted-foreground font-normal"> {yearSuffix(r)}</span>
                    )}
                  </TableCell>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <TableCell className="max-w-[260px] truncate text-sm">
                        {r.archived && (
                          <Badge variant="outline" className="mr-1.5 text-xs font-normal" title="The project is archived">Archived</Badge>
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
                    <ReportAuthCell authorized={!!r.authorized} />
                  </TableCell>
                  <TableCell>
                    <ReportProgressCell pct={completion[r.id] ?? 0} open={r.status === "Open"} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {r.report_submission_date ? formatDate(r.report_submission_date) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap" title={r.last_edited ? formatDate(r.last_edited) : undefined}>
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
        )}
      </div>
    </div>
  );
}

