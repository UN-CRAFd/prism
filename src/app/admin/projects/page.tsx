"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { StatusChangeDialog } from "@/components/ui/status-change-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronsUpDown, X } from "lucide-react";
import { Plus, FolderKanban, ExternalLink, Printer, Loader2, Lightbulb, CircleDot, PauseCircle, Banknote, CheckCircle2, Building2, CalendarPlus, MoreHorizontal, FileText, Globe, Pencil, Trash2 } from "lucide-react";
import {
  Dash, Field, LoadingState, ErrorBanner, FormShell, PageHeader,
  FilterBar, FilterSelect, SearchInput, ResultCount, ALL, SortableHead, sortBy, useTableSort,
  ArchiveFilter, ArchiveSelect, matchesArchive, type ArchiveView,
} from "@/components/admin/shared";
import { reportStatusStyle, type ReportStatus } from "@/lib/reports";
import labels from "@/lib/labels";
import { ReportProgressCell } from "@/components/admin/report-components";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { optionValues } from "@/lib/options";
import { formatDate, projectSlug, timeAgo, formatUsd } from "@/lib/utils";
import { clampDuration, numericAmount } from "@/lib/numeric-input";
import { Hint } from "@/components/ui/hint";
import { isPartnerEditable } from "@/lib/report-status";
import { reportStatusLabel, prodocStatusLabel } from "@/lib/status-label";

// Mirrors the sentinel in general-info-editor: Radix Select can't hold an
// empty-string item, so "no scope selected" round-trips through this value.
const GEO_SCOPE_NONE = "__none__";

// -- Types ------------------------------------------------------------------

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

type ProjectStatus = string;

interface Project {
  id: number;
  partner_id: number;
  partner_short_name: string | null;
  partner_long_name: string | null;
  project_title: string;
  short_name: string | null;
  status: ProjectStatus;
  // true when an admin picked the status by hand (the automatic rules then skip it).
  status_manual?: boolean;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_start_date: string | null;
  project_duration_months: number | null;
  geographic_scope: string | null;
  // partners.id[] granted prodoc edit rights (project_editors). May be absent on
  // responses that predate the feature.
  editor_partner_ids?: number[] | null;
  // No-cost extension rollup (from project_extensions) — total months added
  // across all extensions and how many were granted.
  extension_months_total: number;
  extension_count: number;
  // Hidden from this overview unless the Archived/All filter is on. Absent
  // before db/add-archived.sql has run (reads as active).
  archived?: boolean;
}

// Project STATUS presentation. Values are admin-editable via Settings → Dropdown
// options ("projectStatus"); the icon map is keyed by the known values, with a
// neutral fallback applied for any added value. The status itself is shown as
// quiet grey text beside its icon.
const STATUS_ICONS: Record<string, ReactNode> = {
  Idea:                   <Lightbulb className="size-3 shrink-0 text-crafd-grey-600" />,
  Ongoing:                <CircleDot className="size-3 shrink-0 text-crafd-grey-900" />,
  "Operationally Closed": <PauseCircle className="size-3 shrink-0 text-crafd-yellow-900" />,
  "Financially Closed":   <Banknote className="size-3 shrink-0 text-crafd-yellow-900" />,
  "Project Closed":       <CheckCircle2 className="size-3 shrink-0 text-crafd-grey-600" />,
};
const STATUS_ICON_FALLBACK: ReactNode = <CircleDot className="size-3 shrink-0 text-crafd-grey-400" />;

function durationLabel(months: number | null): string | null {
  return months && months > 0 ? `${months} months` : null;
}

// Multi-select over the partner list (dynamic options, numeric ids), used to
// grant prodoc edit rights. Mirrors the chip/checkbox look of ui/MultiSelect but
// takes an explicit option list rather than the admin option registry.
function PartnerMultiSelect({
  partners, value, onChange, placeholder = "Select partners…",
}: {
  partners: Partner[];
  value: number[];
  onChange: (next: number[]) => void;
  placeholder?: string;
}) {
  // Compact chip label (trigger): capitalized short name, falling back to long.
  const labelFor = (id: number) => {
    const p = partners.find((x) => x.id === id);
    const short = p?.short_name ? p.short_name.toUpperCase() : null;
    return short || p?.long_name || `#${id}`;
  };
  // Fuller option-list label: "SHORT - Long name" (both when available).
  const optionLabel = (p: Partner) => {
    const short = p.short_name ? p.short_name.toUpperCase() : null;
    if (short && p.long_name) return `${short} - ${p.long_name}`;
    return short || p.long_name || `#${p.id}`;
  };
  function toggle(id: number) {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]">
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {value.length === 0 ? (
            <span className="text-muted-foreground px-1">{placeholder}</span>
          ) : (
            value.map((id) => (
              <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {labelFor(id)}
                <span
                  role="button" tabIndex={-1} aria-label={`Remove ${labelFor(id)}`}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(id); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="hover:text-foreground"
                >
                  <X className="size-3" />
                </span>
              </span>
            ))
          )}
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 w-[--radix-dropdown-menu-trigger-width] min-w-56 overflow-y-auto">
        {partners.length === 0 ? (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No other partners available.</div>
        ) : (
          partners.map((p) => (
            <DropdownMenuCheckboxItem
              key={p.id}
              checked={value.includes(p.id)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(p.id)}
            >
              {optionLabel(p)}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// -- Page -------------------------------------------------------------------

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // project_id → its prodoc { report id, status, last_edited } (for Print / Open / status).
  const [prodocByProject, setProdocByProject] = useState<Record<number, { id: number; status: ReportStatus; last_edited: string | null }>>({});
  // Per-project ProDoc completion (%).
  const [completion, setCompletion] = useState<Record<number, number>>({});
  const [pendingStatusChange, setPendingStatusChange] = useState<{ projectId: number; prodocId: number; status: ReportStatus; fromStatus: string } | null>(null);
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Filter bar state.
  const [search, setSearch] = useState("");
  const [filterPartner, setFilterPartner] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  const [filterProdocStatus, setFilterProdocStatus] = useState<string>(ALL);
  const [filterScope, setFilterScope] = useState<string>(ALL);
  // Archived projects are hidden unless asked for.
  const [archiveView, setArchiveView] = useState<ArchiveView>("active");

  // Sort state (click a column header). Default: alphabetical by project title.
  type SortKey =
    | "project_title" | "partner_short_name" | "status"
    | "mptfo_project_number" | "grant_size_usd" | "project_start_date" | "project_duration_months"
    | "geographic_scope" | "prodoc" | "progress" | "last_edited" | "archived";
  const { sortKey, sortDir, toggle: toggleSort } = useTableSort<SortKey>("project_title");

  // Apply partner filter from query parameter on mount
  useEffect(() => {
    const partnerParam = searchParams.get("partner");
    if (partnerParam) {
      setFilterPartner(partnerParam);
    }
  }, [searchParams]);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [shortName, setShortName] = useState("");
  const [mptfo, setMptfo] = useState("");
  const [grantSize, setGrantSize] = useState("");
  const [startDate, setStartDate] = useState("");
  const [durationMonths, setDurationMonths] = useState("");
  const [scope, setScope] = useState("");
  const [editorIds, setEditorIds] = useState<number[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, prRes, pdRes] = await Promise.all([
        fetch("/api/partners"),
        fetch("/api/projects"),
        fetch("/api/reports?data_type=prodoc"),
      ]);
      if (!pRes.ok || !prRes.ok || !pdRes.ok) throw new Error("Failed to fetch data");
      setPartners(await pRes.json());
      setProjects(await prRes.json());
      const prodocs: { id: number; project_id: number; status: ReportStatus; last_edited: string | null }[] = await pdRes.json();
      setProdocByProject(Object.fromEntries(prodocs.map((d) => [d.project_id, { id: d.id, status: d.status, last_edited: d.last_edited }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ProDoc completion per project — same calculation as the partner Project Document list.
  useEffect(() => {
    const ids = Object.keys(prodocByProject).map(Number);
    if (ids.length === 0) return;
    Promise.all(
      ids.map((id) =>
        fetch(`/api/prodoc-completion?projectId=${id}`)
          .then((res) => res.json())
          .then((data: { sections?: Record<string, boolean> }) => {
            const sections = data.sections ?? {};
            const keys = Object.keys(sections);
            const trueCount = Object.values(sections).filter(Boolean).length;
            const pct = keys.length > 0 ? Math.round((trueCount / keys.length) * 100) : 0;
            return { id, pct };
          })
          .catch(() => ({ id, pct: 0 }))
      )
    ).then((results) => {
      const c: Record<number, number> = {};
      for (const { id, pct } of results) c[id] = pct;
      setCompletion(c);
    });
  }, [prodocByProject]);

  function resetForm() {
    setPartnerId(""); setTitle(""); setShortName("");
    setMptfo(""); setGrantSize(""); setStartDate(""); setDurationMonths(""); setScope("");
    setEditorIds([]);
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(p: Project) {
    setPartnerId(String(p.partner_id));
    setTitle(p.project_title);
    setShortName(p.short_name || "");
    setMptfo(p.mptfo_project_number || "");
    setGrantSize(p.grant_size_usd || "");
    setStartDate(p.project_start_date || "");
    setDurationMonths(p.project_duration_months != null ? String(p.project_duration_months) : "");
    setScope(p.geographic_scope || "");
    setEditorIds(Array.isArray(p.editor_partner_ids) ? p.editor_partner_ids : []);
    setEditId(p.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!partnerId || !title.trim()) { setFormError("Partner and project title are required"); return; }
    setSaving(true); setFormError(null);
    try {
      const body = {
        partner_id: Number(partnerId),
        project_title: title.trim(),
        short_name: shortName.trim() || null,
        mptfo_project_number: mptfo.trim() || null,
        grant_size_usd: grantSize ? parseFloat(grantSize) : null,
        project_start_date: startDate || null,
        project_duration_months: durationMonths ? parseInt(durationMonths, 10) : null,
        geographic_scope: scope.trim() || null,
        // Never grant the lead editor rights (they already own the project).
        editor_partner_ids: editorIds.filter((id) => id !== Number(partnerId)),
      };
      const res = await fetch(
        editId ? `/api/projects/${editId}` : "/api/projects",
        { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save"); }
      resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  // ── Archive / unarchive ────────────────────────────────────────────────────
  // Archiving is project-level and cascades to the project's reports and
  // updates (POST /api/projects/:id/archive). It is refused while any report or
  // update is not yet Closed — checked up front so the admin is told before
  // filling in the name/reason dialog, and re-checked by the server.
  const [pendingArchive, setPendingArchive] = useState<Project | null>(null);

  async function handleArchiveChange(p: Project, archived: boolean) {
    if (archived) {
      const res = await fetch(`/api/projects/${p.id}/archive`);
      if (!res.ok) {
        setError("Could not check the project's reports and updates. Has db/add-archived.sql been run?");
        return;
      }
      const { blockers } = (await res.json()) as { blockers: { label: string; status: string }[] };
      if (blockers.length) {
        await confirm({
          title: "This project cannot be archived yet",
          message: `All reports and project updates must be ${reportStatusLabel("Closed")} first. Not yet closed: ${blockers
            .map((b) => `${b.label} (${reportStatusLabel(b.status)})`)
            .join("; ")}.`,
          acknowledgement: true,
          variant: "default",
          tone: "warning",
        });
        return;
      }
      // Ask for name + reason, like a status change; applied in applyArchive.
      setPendingArchive(p);
      return;
    }
    const ok = await confirm({
      title: "Unarchive this project?",
      message: "Are you sure you want to unarchive this project? It will show in the overview again, together with its reports and project updates.",
      confirmLabel: "Unarchive",
      variant: "question",
    });
    if (ok) await submitArchive(p.id, false, { actorName: "", reason: "" });
  }

  async function applyArchive(values: { actorName: string; reason: string }) {
    if (!pendingArchive) return;
    const id = pendingArchive.id;
    setPendingArchive(null);
    await submitArchive(id, true, values);
  }

  async function submitArchive(id: number, archived: boolean, { actorName, reason }: { actorName: string; reason: string }) {
    const res = await fetch(`/api/projects/${id}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived, actor_name: actorName || null, reason: reason || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const blockers = (body?.blockers ?? []) as { label: string; status: string }[];
      setError(
        blockers.length
          ? `${body.error} Not yet closed: ${blockers.map((b) => `${b.label} (${reportStatusLabel(b.status)})`).join("; ")}.`
          : body?.error ?? "Failed to change the archive state. Has db/add-archived.sql been run?"
      );
      return;
    }
    setError(null);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, archived } : p)));
  }

  // Sentinel for the "Automatic" item at the top of the Project Status dropdown.
  const AUTO_STATUS = "__auto__";

  // Re-read the project list quietly (the GET also refreshes the automatic statuses).
  async function refreshProjects() {
    const res = await fetch("/api/projects");
    if (res.ok) setProjects(await res.json());
  }

  async function handleStatusChange(id: number, newStatus: ProjectStatus) {
    const prev = projects;
    if (newStatus === AUTO_STATUS) {
      // Hand the status back to the automatic rules; the server recomputes it and
      // returns the fresh row.
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status_manual: false }),
      });
      if (!res.ok) return;
      const row: Partial<Project> = await res.json();
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...row } : p)));
      return;
    }
    // A hand-picked status is saved as manual. Optimistic; roll back on failure.
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, status: newStatus, status_manual: true } : p)));
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) setProjects(prev);
  }

  const confirm = useConfirm();

  async function handleDelete(id: number) {
    if (!await confirm({ message: "Delete this project?" })) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
  }

  // ── Project document (prodoc) actions ─────────────────────────────────────
  function openProdoc(p: Project) {
    const slug = projectSlug(p.short_name, p.project_title);
    router.push(`/admin/prodoc-editor/${slug}/general`);
  }

  function printProdoc(p: Project) {
    const prodocId = prodocByProject[p.id]?.id;
    if (!prodocId) return;
    // Open the styled print view; it renders the full prodoc with the brand fonts
    // and prints via the browser (→ Save as PDF), then closes.
    setPrintingId(p.id);
    window.open(`/prodoc-print/${prodocId}?auto=1`, "_blank");
    setTimeout(() => setPrintingId(null), 1500);
  }

  // Set the prodoc's workflow status (Open / Under Review / Partner Review / Approved). The server
  // recomputes the project's automatic status from it (not for manual projects). Opens the StatusChangeDialog to collect a name
  // and reason before applying. Optimistic; persisted via PUT /api/reports/:id.
  function handleProdocStatusChange(projectId: number, prodocId: number, status: ReportStatus) {
    setPendingStatusChange({
      projectId,
      prodocId,
      status,
      fromStatus: prodocByProject[projectId]?.status ?? "",
    });
  }

  async function applyProdocStatusChange({ actorName, reason }: { actorName: string; reason: string }) {
    if (!pendingStatusChange) return;
    const { projectId, prodocId, status } = pendingStatusChange;
    setPendingStatusChange(null);
    setProdocByProject((prev) => ({ ...prev, [projectId]: { ...prev[projectId], id: prodocId, status } }));
    await fetch(`/api/reports/${prodocId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        actor_name: actorName || null,
        reason: reason || null,
      }),
    });
    // The server recomputes the project's automatic status from the new workflow.
    await refreshProjects();
  }

  // ── Filter & sort ─────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = projects.filter(
      (p) =>
        (filterPartner === ALL || String(p.partner_id) === filterPartner) &&
        (filterStatus === ALL || p.status === filterStatus) &&
        (filterProdocStatus === ALL || prodocByProject[p.id]?.status === filterProdocStatus) &&
        (filterScope === ALL || p.geographic_scope === filterScope) &&
        matchesArchive(p.archived, archiveView) &&
        (!q ||
          [p.project_title, p.short_name, p.partner_short_name, p.partner_long_name, p.mptfo_project_number]
            .some((v) => v?.toLowerCase().includes(q)))
    );
    const prodocOrder = optionValues("prodocStatus");
    const statusOrder = optionValues("projectStatus");
    return sortBy(
      matched,
      (p) => {
        // Money, duration and MPTFO # sort numerically; statuses by their
        // workflow order; the rest lexically (nulls sink).
        if (sortKey === "grant_size_usd") return p.grant_size_usd != null ? parseFloat(p.grant_size_usd) : null;
        if (sortKey === "project_start_date") return p.project_start_date;
        if (sortKey === "project_duration_months") return p.project_duration_months;
        if (sortKey === "mptfo_project_number") return p.mptfo_project_number ? Number(p.mptfo_project_number) : null;
        if (sortKey === "status") return statusOrder.indexOf(p.status);
        if (sortKey === "prodoc") {
          const pd = prodocByProject[p.id];
          return pd ? prodocOrder.indexOf(pd.status) : null;
        }
        if (sortKey === "progress") return prodocByProject[p.id] ? (completion[p.id] ?? 0) : null;
        if (sortKey === "last_edited") return prodocByProject[p.id]?.last_edited ?? null;
        if (sortKey === "archived") return p.archived ? 1 : 0;
        return p[sortKey];
      },
      sortDir
    );
  }, [projects, prodocByProject, completion, search, filterPartner, filterStatus, filterProdocStatus, filterScope, archiveView, sortKey, sortDir]);

  const scopes = useMemo(
    () => Array.from(new Set(projects.map((p) => p.geographic_scope).filter((s): s is string => !!s))).sort(),
    [projects]
  );

  const filtersActive =
    !!search.trim() || filterPartner !== ALL || filterStatus !== ALL || filterProdocStatus !== ALL || filterScope !== ALL ||
    archiveView !== "active";

  function clearFilters() {
    setSearch("");
    setFilterPartner(ALL);
    setFilterStatus(ALL);
    setFilterProdocStatus(ALL);
    setFilterScope(ALL);
    setArchiveView("active");
  }

  const sortProps = { sortKey, sortDir, onSort: toggleSort };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Project Documents" description="Manage projects across partner organizations">
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={partners.length === 0}>
            <Plus className="size-3.5" /> Add project
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search projects…" className="max-w-[220px]" />
        <FilterSelect
          icon={Building2}
          label="Partner"
          value={filterPartner}
          onChange={setFilterPartner}
          allLabel="All partners"
          width={160}
          options={partners.map((p) => ({ value: String(p.id), label: p.short_name?.toUpperCase() || p.long_name || "—" }))}
        />
        <FilterSelect
          icon={CircleDot}
          label="Project Status"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All statuses"
          width={180}
          options={optionValues("projectStatus").map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          icon={FileText}
          label="Workflow"
          value={filterProdocStatus}
          onChange={setFilterProdocStatus}
          allLabel="All"
          width={140}
          options={optionValues("prodocStatus").map((s) => ({ value: s, label: prodocStatusLabel(s) }))}
        />
        {scopes.length > 0 && (
          <FilterSelect
            icon={Globe}
            label="Scope"
            value={filterScope}
            onChange={setFilterScope}
            allLabel="All scopes"
            width={150}
            options={scopes.map((s) => ({ value: s, label: s }))}
          />
        )}
        <ArchiveFilter value={archiveView} onChange={setArchiveView} />
        <ResultCount shown={filtered.length} total={projects.length} noun="project" onClear={filtersActive ? clearFilters : undefined} />
      </FilterBar>

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {showForm && (
          <FormShell
            title={editId ? "Edit project" : "New project"}
            onClose={resetForm}
            error={formError}
            saving={saving}
            editMode={!!editId}
            onCancel={resetForm}
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Field label="Partner" required>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select partner" /></SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.short_name ? `${p.short_name.toUpperCase()} — ${p.long_name || p.short_name.toUpperCase()}` : (p.long_name || "—")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Project title" required>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
              </Field>
              <Field label="Short name">
                <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Short name" />
              </Field>
              <Field label="MPTFO project number">
                <Input value={mptfo} onChange={(e) => setMptfo(e.target.value.replace(/\D/g, ""))} placeholder="MPTFO Number" inputMode="numeric" />
              </Field>
              <Field label="Grant size (USD)">
                <Input
                  value={grantSize}
                  onChange={(e) => setGrantSize(numericAmount(e.target.value))}
                  inputMode="decimal"
                  placeholder="0.00"
                />
              </Field>
              <Field label="Start date">
                <DateInput value={startDate} onChange={(v) => setStartDate(v)} />
              </Field>
              <Field label="Duration (months)">
                <Input value={durationMonths} onChange={(e) => setDurationMonths(clampDuration(e.target.value))} type="text" inputMode="numeric" placeholder="e.g. 24" />
              </Field>
              <Field label="Geographic scope">
                {/* Same dropdown as the prodoc General Info tab: options come from
                    Settings → Dropdown options via @/lib/options (never the JSON
                    defaults directly), so admin edits take effect live. */}
                <Select
                  value={scope || GEO_SCOPE_NONE}
                  onValueChange={(v) => setScope(v === GEO_SCOPE_NONE ? "" : v)}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select a scope…" /></SelectTrigger>
                  <SelectContent>
                    {optionValues("geographicScope").map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Editing rights">
                <PartnerMultiSelect
                  partners={partners.filter((p) => String(p.id) !== partnerId)}
                  value={editorIds}
                  onChange={setEditorIds}
                  placeholder="Partners who can edit this project's ProDoc and reports…"
                />
              </Field>
            </div>
          </FormShell>
        )}

        {loading ? (
          <LoadingState />
        ) : projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <FolderKanban className="size-8 opacity-30" />
            <p className="text-sm">
              {partners.length === 0 ? "Add a partner first, then create projects." : "No projects yet."}
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <FolderKanban className="size-8 opacity-30" />
            <p className="text-sm">No projects match the current filters.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-right">#</TableHead>
                <SortableHead label="Partner" column="partner_short_name" {...sortProps} />
                <SortableHead label="Project title" column="project_title" {...sortProps} />
                <SortableHead label="Project Status" column="status" className="w-48" {...sortProps} />
                <SortableHead label="MPTFO #" column="mptfo_project_number" {...sortProps} />
                <SortableHead label="Grant size" column="grant_size_usd" align="right" className="text-right" {...sortProps} />
                <SortableHead label="Start date" column="project_start_date" {...sortProps} />
                <SortableHead label="Duration" column="project_duration_months" {...sortProps} />
                <SortableHead label="Scope" column="geographic_scope" {...sortProps} />
                <SortableHead label="Workflow" column="prodoc" {...sortProps} />
                <SortableHead label="Progress" column="progress" {...sortProps} />
                <SortableHead label="Last edited" column="last_edited" {...sortProps} />
                <SortableHead label="Archive" column="archived" {...sortProps} />
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const pd = prodocByProject[p.id];
                return (
                <TableRow key={p.id} className={`cursor-pointer ${p.archived ? "text-muted-foreground [&_td]:opacity-70" : ""}`} onClick={() => openProdoc(p)}>
                  <TableCell className="text-right text-sm tabular-nums text-crafd-grey-600">{i + 1}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {p.partner_short_name?.toUpperCase() || "—"}
                    </Badge>
                  </TableCell>
                  <Tooltip delayDuration={0}>
                    <TooltipTrigger asChild>
                      <TableCell className="min-w-[240px] max-w-[340px] truncate text-sm">{p.project_title}</TableCell>
                    </TooltipTrigger>
                    <TooltipContent>{p.project_title}</TooltipContent>
                  </Tooltip>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <Select value={p.status} onValueChange={(v) => handleStatusChange(p.id, v as ProjectStatus)}>
                        <SelectTrigger className="!h-7 w-full border-0 bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none [&>svg]:size-3 [&>svg]:shrink-0">
                          <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                            {STATUS_ICONS[p.status] ?? STATUS_ICON_FALLBACK}
                            <SelectValue />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={AUTO_STATUS}>Automatic</SelectItem>
                          {optionValues("projectStatus").map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {p.status_manual && <span className="shrink-0 text-[11px] text-muted-foreground">Manual</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {p.mptfo_project_number ? (
                      <Hint label="Open on MPTF Office Gateway">
                        <a aria-label="Open on MPTF Office Gateway"
                          href={`https://mptf.undp.org/project/${p.mptfo_project_number}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                        >
                          {p.mptfo_project_number}
                          <ExternalLink className="size-3" />
                        </a>
                      </Hint>
                    ) : <Dash />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(p.grant_size_usd)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
                    {p.project_start_date ? formatDate(p.project_start_date) : <Dash />}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {durationLabel(p.project_duration_months) || <Dash />}
                      {p.extension_count > 0 && (
                        <Hint label={`${p.extension_count} no-cost extension${p.extension_count !== 1 ? "s" : ""} · ${p.extension_months_total} month${p.extension_months_total !== 1 ? "s" : ""} added`}>
                          <span
                            className="inline-flex items-center gap-0.5 rounded border border-crafd-yellow-400 bg-crafd-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-crafd-grey-800"
                          >
                            <CalendarPlus className="size-2.5" />
                            +{p.extension_months_total}mo
                          </span>
                        </Hint>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{p.geographic_scope || <Dash />}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {pd ? (
                      <Select
                        value={pd.status}
                        onValueChange={(v) => handleProdocStatusChange(p.id, pd.id, v as ReportStatus)}
                      >
                        <Hint label="Project document status">
                          <SelectTrigger
                            className={`!h-7 w-fit shrink-0 px-2 text-xs font-semibold border rounded-full [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(pd.status)}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                        </Hint>
                        <SelectContent>
                          {/* A legacy status no longer in the list (e.g. Closed) stays
                              visible so the cell never renders blank. */}
                          {(optionValues("prodocStatus").includes(pd.status) ? optionValues("prodocStatus") : [...optionValues("prodocStatus"), pd.status])
                            .map((s) => <SelectItem key={s} value={s}>{prodocStatusLabel(s)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : <Dash />}
                  </TableCell>
                  <TableCell>
                    {pd ? <ReportProgressCell pct={completion[p.id] ?? 0} open={isPartnerEditable(pd.status)} /> : <Dash />}
                  </TableCell>
                  <Hint label={pd?.last_edited ? formatDate(pd.last_edited) : undefined}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {pd?.last_edited ? timeAgo(pd.last_edited) : "—"}
                    </TableCell>
                  </Hint>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ArchiveSelect archived={!!p.archived} onChange={(a) => handleArchiveChange(p, a)} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <Hint label="More actions">
                        <DropdownMenuTrigger aria-label="More actions"
                          className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        >
                          <MoreHorizontal className="size-4" />
                        </DropdownMenuTrigger>
                      </Hint>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem disabled={!pd || printingId === p.id} onSelect={() => printProdoc(p)}>
                          {printingId === p.id ? <Loader2 className="animate-spin" /> : <Printer />}
                          Print
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => startEdit(p)}>
                          <Pencil />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" onSelect={() => handleDelete(p.id)}>
                          <Trash2 />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    <StatusChangeDialog
      open={pendingStatusChange !== null}
      fromStatus={prodocStatusLabel(pendingStatusChange?.fromStatus)}
      toStatus={prodocStatusLabel(pendingStatusChange?.status)}
      onCancel={() => setPendingStatusChange(null)}
      onConfirm={applyProdocStatusChange}
    />
    <StatusChangeDialog
      open={pendingArchive !== null}
      title="Archive project?"
      confirmLabel="Archive"
      fromStatus="Active"
      toStatus="Archived"
      onCancel={() => setPendingArchive(null)}
      onConfirm={applyArchive}
    />
    </div>
  );
}
