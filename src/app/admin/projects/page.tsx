"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, FolderKanban, Clock, DollarSign, ExternalLink, Printer, ArrowRight, Loader2, Lightbulb, CircleDot, PauseCircle, Banknote, CheckCircle2, Layers, Building2, CalendarPlus, FilePenLine } from "lucide-react";
import {
  Dash, Field, ViewToggle, LoadingState, ErrorBanner, FormShell, RowActions, PageHeader, HoverActions,
  FilterBar, FilterSelect, ALL,
} from "@/components/admin/shared";
import { reportStatusStyle, type ReportStatus } from "@/lib/reports";
import { formatDate } from "@/lib/utils";

// Prodoc uses the same status set as reports (it IS a reports row).
const PRODOC_STATUSES: ReportStatus[] = ["Open", "Under Review", "Closed"];
const PRODOC_STATUS_ICONS: Record<ReportStatus, ReactNode> = {
  Open:           <CircleDot className="size-3 shrink-0 text-blue-700" />,
  "Under Review": <Clock className="size-3 shrink-0 text-amber-700" />,
  Closed:         <CheckCircle2 className="size-3 shrink-0 text-zinc-500" />,
};

// -- Types ------------------------------------------------------------------

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

type ProjectStatus =
  | "Idea"
  | "Ongoing"
  | "Operationally Closed"
  | "Financially Closed"
  | "Project Closed";

interface Project {
  id: number;
  partner_id: number;
  partner_short_name: string | null;
  partner_long_name: string | null;
  project_title: string;
  short_name: string | null;
  status: ProjectStatus;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_start_date: string | null;
  project_duration_months: number | null;
  geographic_scope: string | null;
  implementing_partners: string | null;
  // No-cost extension rollup (from project_extensions) — total months added
  // across all extensions and how many were granted.
  extension_months_total: number;
  extension_count: number;
}

interface ProjectExtension {
  id: number;
  months_added: number;
  previous_duration_months: number;
  new_duration_months: number;
  note: string | null;
  created_at: string;
}

interface ProjectRevision {
  id: number;
  revision_date: string;
  comment: string | null;
  created_at: string;
}

// Project STATUS presentation — matches the CHECK constraint in db/schema.sql.
const PROJECT_STATUSES: ProjectStatus[] = [
  "Idea",
  "Ongoing",
  "Operationally Closed",
  "Financially Closed",
  "Project Closed",
];

const STATUS_STYLES: Record<ProjectStatus, string> = {
  Idea:                   "bg-violet-50 text-violet-700 border-violet-200",
  Ongoing:                "bg-blue-50 text-blue-700 border-blue-200",
  "Operationally Closed": "bg-amber-50 text-amber-700 border-amber-200",
  "Financially Closed":   "bg-orange-50 text-orange-700 border-orange-200",
  "Project Closed":       "bg-zinc-100 text-zinc-500 border-zinc-200",
};

const STATUS_ICONS: Record<ProjectStatus, ReactNode> = {
  Idea:                   <Lightbulb className="size-3 shrink-0 text-violet-700" />,
  Ongoing:                <CircleDot className="size-3 shrink-0 text-blue-700" />,
  "Operationally Closed": <PauseCircle className="size-3 shrink-0 text-amber-700" />,
  "Financially Closed":   <Banknote className="size-3 shrink-0 text-orange-700" />,
  "Project Closed":       <CheckCircle2 className="size-3 shrink-0 text-zinc-500" />,
};

function durationLabel(months: number | null): string | null {
  return months && months > 0 ? `${months} months` : null;
}

// Derived project end date = start + duration months. Parsed in local time from
// the YYYY-MM-DD portion so it never drifts a day across time zones. Mirrors the
// DB's reporting_platform.project_end_date() used by budgets/workplan.
function projectEndDate(startDate: string, durationMonths: number): Date {
  const [y, m, d] = startDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setMonth(dt.getMonth() + durationMonths);
  return dt;
}

function fmtUsd(v: string | null) {
  if (!v) return <Dash />;
  const n = parseFloat(v);
  if (isNaN(n)) return v;
  if (n >= 1_000_000) {
    return "$" + (n / 1_000_000).toFixed(1) + " M";
  }
  if (n >= 1_000) {
    return "$" + Math.round(n / 1_000) + "k";
  }
  return "$" + n.toLocaleString("en-US");
}

// -- Page -------------------------------------------------------------------

export default function ProjectsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // project_id → its prodoc { report id, status } (for Print / Open / status).
  const [prodocByProject, setProdocByProject] = useState<Record<number, { id: number; status: ReportStatus }>>({});
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("grid");

  // Filter & group bar state.
  const [filterPartner, setFilterPartner] = useState<string>(ALL);
  const [filterStatus, setFilterStatus] = useState<string>(ALL);
  // ALL = no grouping; otherwise "partner" | "status".
  const [groupMode, setGroupMode] = useState<string>(ALL);

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
  const [implementingPartners, setImplementingPartners] = useState("");

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
      const prodocs: { id: number; project_id: number; status: ReportStatus }[] = await pdRes.json();
      setProdocByProject(Object.fromEntries(prodocs.map((d) => [d.project_id, { id: d.id, status: d.status }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setPartnerId(""); setTitle(""); setShortName("");
    setMptfo(""); setGrantSize(""); setStartDate(""); setDurationMonths(""); setScope("");
    setImplementingPartners("");
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
    setImplementingPartners(p.implementing_partners || "");
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
        implementing_partners: implementingPartners.trim() || null,
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

  async function handleStatusChange(id: number, newStatus: ProjectStatus) {
    // Optimistic: reflect the change immediately, roll back on failure.
    const prev = projects;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, status: newStatus } : p)));
    const res = await fetch(`/api/projects/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (!res.ok) setProjects(prev);
  }

  // ── No-cost extension ─────────────────────────────────────────────────────
  // A no-cost extension only lengthens the project timeline: it adds months to
  // project_duration_months. Everything derived from the period recomputes on
  // reload — the budget year columns (project_year_range), the workplan quarter
  // grid (project_end_date) and the Gantt — because they read the duration
  // server-side. No budget figures change; the same grant covers more time.
  const [nceProject, setNceProject] = useState<Project | null>(null);
  const [nceMonths, setNceMonths] = useState("");
  const [nceNote, setNceNote] = useState("");
  const [nceHistory, setNceHistory] = useState<ProjectExtension[]>([]);
  const [nceSaving, setNceSaving] = useState(false);
  const [nceError, setNceError] = useState<string | null>(null);

  function openNce(p: Project) {
    setNceProject(p);
    setNceMonths("");
    setNceNote("");
    setNceError(null);
    // Show the project's prior extensions for context while granting a new one.
    setNceHistory([]);
    fetch(`/api/projects/${p.id}/extensions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectExtension[]) => setNceHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setNceHistory([]));
  }

  async function submitNce() {
    if (!nceProject || nceProject.project_duration_months == null) return;
    const added = parseInt(nceMonths, 10);
    if (!Number.isFinite(added) || added <= 0) { setNceError("Enter a positive number of months to add"); return; }
    setNceSaving(true); setNceError(null);
    try {
      // Records the extension (project_extensions) and lengthens the period in
      // one transaction; budget/workplan periods recompute on reload.
      const res = await fetch(`/api/projects/${nceProject.id}/extensions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ months_added: added, note: nceNote.trim() || null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to extend project"); }
      setNceProject(null);
      load();
    } catch (e) { setNceError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setNceSaving(false); }
  }

  // ── Project revision ──────────────────────────────────────────────────────
  // A logged event only — the project was revised on a date, for a reason.
  // Nothing derived from the project changes.
  const [revProject, setRevProject] = useState<Project | null>(null);
  const [revDate, setRevDate] = useState("");
  const [revComment, setRevComment] = useState("");
  const [revHistory, setRevHistory] = useState<ProjectRevision[]>([]);
  const [revSaving, setRevSaving] = useState(false);
  const [revError, setRevError] = useState<string | null>(null);

  function openRevision(p: Project) {
    // Default the date to today in local time (never drifts across time zones).
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    setRevProject(p);
    setRevDate(today);
    setRevComment("");
    setRevError(null);
    setRevHistory([]);
    fetch(`/api/projects/${p.id}/revisions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ProjectRevision[]) => setRevHistory(Array.isArray(rows) ? rows : []))
      .catch(() => setRevHistory([]));
  }

  async function submitRevision() {
    if (!revProject) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(revDate)) { setRevError("Pick a revision date"); return; }
    setRevSaving(true); setRevError(null);
    try {
      const res = await fetch(`/api/projects/${revProject.id}/revisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision_date: revDate, comment: revComment.trim() || null }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to log revision"); }
      setRevProject(null);
      load();
    } catch (e) { setRevError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setRevSaving(false); }
  }

  const confirm = useConfirm();

  async function handleDelete(id: number) {
    if (!await confirm({ message: "Delete this project? This cannot be undone." })) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
  }

  // ── Project document (prodoc) actions ─────────────────────────────────────
  function openProdoc(p: Project) {
    const slug = (p.short_name ?? p.project_title).toLowerCase().replace(/\s+/g, "-");
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

  // Set the prodoc's editable status (Open / Under Review / Closed) — same
  // status model as reports. Optimistic; persisted via PUT /api/reports/:id.
  async function handleProdocStatusChange(projectId: number, prodocId: number, status: ReportStatus) {
    setProdocByProject((prev) => ({ ...prev, [projectId]: { id: prodocId, status } }));
    await fetch(`/api/reports/${prodocId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  // ── Filter & group ────────────────────────────────────────────────────────
  const filtered = useMemo(
    () => projects.filter(
      (p) =>
        (filterPartner === ALL || String(p.partner_id) === filterPartner) &&
        (filterStatus === ALL || p.status === filterStatus)
    ),
    [projects, filterPartner, filterStatus]
  );

  // Grouped sections for the grid view (null when grouping is off → flat grid).
  const groups = useMemo(() => {
    if (groupMode === ALL) return null;
    const map = new Map<string, Project[]>();
    for (const p of filtered) {
      const key = groupMode === "partner" ? (p.partner_short_name || "—") : p.status;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    const entries = Array.from(map.entries());
    if (groupMode === "status") {
      return entries.sort((a, b) => PROJECT_STATUSES.indexOf(a[0] as ProjectStatus) - PROJECT_STATUSES.indexOf(b[0] as ProjectStatus));
    }
    return entries.sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupMode]);

  const renderCard = (p: Project) => {
    const pd = prodocByProject[p.id];
    return (
    <div key={p.id} className="group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => router.push(`/admin/reports?project=${p.id}`)}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground mb-1">{p.partner_short_name || "—"}</p>
          {/* Title is clamped to 2 lines; keep the MPTFO link OUTSIDE the clamp so
              a long title can't clip it away. */}
          <p className="text-lg font-semibold leading-snug line-clamp-2">{p.project_title}</p>
          {p.mptfo_project_number && (
            <a
              href={`https://mptf.undp.org/project/${p.mptfo_project_number}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 inline-flex items-center gap-0.5 text-[11px] font-medium text-blue-600 hover:underline"
              title="Open on MPTF Office Gateway"
            >
              MPTFO
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
        <HoverActions onEdit={() => startEdit(p)} onDelete={() => handleDelete(p.id)} />
      </div>

      {/* Project status — straight below the title, with the no-cost extension beside it */}
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <Select value={p.status} onValueChange={(v) => handleStatusChange(p.id, v as ProjectStatus)}>
          <SelectTrigger className={`!h-7 w-fit shrink-0 px-2 text-[11px] font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0 ${STATUS_STYLES[p.status]}`}>
            <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
              {STATUS_ICONS[p.status]}
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {PROJECT_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* No-cost extension — only when the project has a defined period to extend */}
        {p.project_start_date && p.project_duration_months != null && (
          <button
            onClick={(e) => { e.stopPropagation(); openNce(p); }}
            className="h-7 flex shrink-0 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] font-medium text-foreground hover:bg-muted/70 transition-colors"
            title="Grant a no-cost extension — extends the project timeline without changing the budget"
          >
            <CalendarPlus className="size-3" />
            No-cost extension
          </button>
        )}

        {/* Project revision — log a revision event (date + comment); no derived changes */}
        <button
          onClick={(e) => { e.stopPropagation(); openRevision(p); }}
          className="h-7 flex shrink-0 items-center gap-1 rounded border border-border bg-muted px-2 text-[11px] font-medium text-foreground hover:bg-muted/70 transition-colors"
          title="Log a project revision — records the date and a comment"
        >
          <FilePenLine className="size-3" />
          Project revision
        </button>
      </div>

      <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
        {p.grant_size_usd && (
          <span className="inline-flex items-center gap-1.5">
            <DollarSign className="size-3 shrink-0" />
            {fmtUsd(p.grant_size_usd)}
          </span>
        )}
        {durationLabel(p.project_duration_months) && (
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-3 shrink-0" />
            {durationLabel(p.project_duration_months)}
            {p.extension_count > 0 && (
              <span
                className="inline-flex items-center gap-0.5 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700"
                title={`${p.extension_count} no-cost extension${p.extension_count !== 1 ? "s" : ""} · ${p.extension_months_total} month${p.extension_months_total !== 1 ? "s" : ""} added`}
              >
                <CalendarPlus className="size-2.5" />
                +{p.extension_months_total}mo NCE{p.extension_count > 1 ? ` ×${p.extension_count}` : ""}
              </span>
            )}
          </span>
        )}
      </div>

      {/* ── Project Document ── status + open + print */}
      <div className="mt-auto pt-3 border-t" onClick={(e) => e.stopPropagation()}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Project Document</p>
        <div className="flex gap-1.5">
          {pd && (
            <Select value={pd.status} onValueChange={(v) => handleProdocStatusChange(p.id, pd.id, v as ReportStatus)}>
              <SelectTrigger title="Project document status" className={`!h-7 w-fit shrink-0 px-2 text-[11px] font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(pd.status)}`}>
                <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                  {PRODOC_STATUS_ICONS[pd.status]}
                  <SelectValue />
                </span>
              </SelectTrigger>
              <SelectContent>
                {PRODOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); openProdoc(p); }}
            className="h-7 flex-1 flex items-center justify-center gap-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Open the project document"
          >
            Open
            <ArrowRight className="size-3" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); printProdoc(p); }}
            disabled={printingId === p.id || !pd}
            className="h-7 flex-1 flex items-center justify-center gap-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Print the project document to PDF"
          >
            {printingId === p.id ? <Loader2 className="size-3 animate-spin" /> : <Printer className="size-3" />}
            Print
          </button>
        </div>
      </div>
    </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Projects" description="Manage projects across partner organizations">
        <ViewToggle view={view} onChange={setView} />
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={partners.length === 0}>
            <Plus className="size-3.5" /> Add project
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <FilterSelect
          icon={Building2}
          label="Partner"
          value={filterPartner}
          onChange={setFilterPartner}
          allLabel="All partners"
          width={190}
          options={partners.map((p) => ({ value: String(p.id), label: p.short_name || p.long_name || "—" }))}
        />
        <FilterSelect
          icon={CircleDot}
          label="Status"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All statuses"
          width={190}
          options={PROJECT_STATUSES.map((s) => ({ value: s, label: s }))}
        />
        {view === "grid" && (
          <FilterSelect
            icon={Layers}
            label="Group by"
            value={groupMode}
            onChange={setGroupMode}
            allLabel="None"
            width={150}
            options={[{ value: "partner", label: "Partner" }, { value: "status", label: "Status" }]}
          />
        )}
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
                        {p.short_name ? `${p.short_name} — ${p.long_name || p.short_name}` : (p.long_name || "—")}
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
                <Input value={mptfo} onChange={(e) => setMptfo(e.target.value.replace(/\D/g, ""))} placeholder="00140841" inputMode="numeric" />
              </Field>
              <Field label="Grant size (USD)">
                <Input
                  value={grantSize}
                  onChange={(e) => setGrantSize(e.target.value)}
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                />
              </Field>
              <Field label="Start date">
                <Input value={startDate} onChange={(e) => setStartDate(e.target.value)} type="date" />
              </Field>
              <Field label="Duration (months)">
                <Input value={durationMonths} onChange={(e) => setDurationMonths(e.target.value)} type="number" min={1} step={1} placeholder="e.g. 24" />
              </Field>
              <Field label="Geographic scope">
                <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Global" />
              </Field>
              <Field label="Implementing partners">
                <Input value={implementingPartners} onChange={(e) => setImplementingPartners(e.target.value)} placeholder="Implementing partners" />
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
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Short</TableHead>
                <TableHead>Project title</TableHead>
                <TableHead className="w-48">Status</TableHead>
                <TableHead>MPTFO #</TableHead>
                <TableHead className="text-right">Grant size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="w-40">ProDoc</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => router.push(`/admin/reports?project=${p.id}`)}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.partner_short_name || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {p.short_name || <Dash />}
                  </TableCell>
                  <TableCell className="font-medium max-w-[260px] truncate">{p.project_title}</TableCell>
                  <TableCell>
                    <Select value={p.status} onValueChange={(v) => handleStatusChange(p.id, v as ProjectStatus)}>
                      <SelectTrigger className={`!h-7 w-full px-2 text-[11px] font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0 ${STATUS_STYLES[p.status]}`}>
                        <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                          {STATUS_ICONS[p.status]}
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {PROJECT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{p.mptfo_project_number || <Dash />}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(p.grant_size_usd)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{durationLabel(p.project_duration_months) || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{p.geographic_scope || <Dash />}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); printProdoc(p); }}
                        disabled={printingId === p.id || !prodocByProject[p.id]}
                        className="h-7 flex items-center justify-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        title="Print the project document to PDF"
                      >
                        {printingId === p.id ? <Loader2 className="size-3 animate-spin" /> : <Printer className="size-3" />}
                        Print
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); openProdoc(p); }}
                        className="h-7 flex items-center justify-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open the project document"
                      >
                        Open
                        <ArrowRight className="size-3" />
                      </button>
                      {prodocByProject[p.id] && (
                        <Select
                          value={prodocByProject[p.id]!.status}
                          onValueChange={(v) => handleProdocStatusChange(p.id, prodocByProject[p.id]!.id, v as ReportStatus)}
                        >
                          <SelectTrigger
                            title="Project document status"
                            className={`!h-7 w-fit shrink-0 px-2 text-[11px] font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(prodocByProject[p.id]!.status)}`}
                          >
                            <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                              {PRODOC_STATUS_ICONS[prodocByProject[p.id]!.status]}
                              <SelectValue />
                            </span>
                          </SelectTrigger>
                          <SelectContent>
                            {PRODOC_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RowActions onEdit={() => startEdit(p)} onDelete={() => handleDelete(p.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : groups ? (
          <div className="space-y-6">
            {groups.map(([key, rows]) => (
              <div key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  {groupMode === "partner"
                    ? <Building2 className="size-4 text-muted-foreground" />
                    : <CircleDot className="size-4 text-muted-foreground" />}
                  <h3 className="text-base font-bold">{key}</h3>
                  <span className="text-sm text-muted-foreground">({rows.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rows.map(renderCard)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(renderCard)}
          </div>
        )}
      </div>

      {/* No-cost extension dialog */}
      {nceProject && nceProject.project_start_date && nceProject.project_duration_months != null && (() => {
        const start = nceProject.project_start_date;
        const currentDuration = nceProject.project_duration_months;
        const added = parseInt(nceMonths, 10);
        const validAdd = Number.isFinite(added) && added > 0 ? added : 0;
        const newDuration = currentDuration + validAdd;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => { if (!nceSaving) setNceProject(null); }}>
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
            <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="p-6">
                <div className="flex items-start gap-3 mb-4">
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                    <CalendarPlus className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">No-cost extension</p>
                    <p className="text-sm text-muted-foreground leading-snug truncate">{nceProject.project_title}</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mb-4 space-y-1">
                  <div className="flex justify-between gap-2"><span>Start</span><span className="tabular-nums text-foreground">{formatDate(start)}</span></div>
                  <div className="flex justify-between gap-2"><span>Current end</span><span className="tabular-nums text-foreground">{formatDate(projectEndDate(start, currentDuration))} · {currentDuration} mo</span></div>
                </div>

                {nceHistory.length > 0 && (
                  <div className="mb-4">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      Previous extensions
                    </p>
                    <ul className="space-y-1">
                      {nceHistory.map((ext) => (
                        <li key={ext.id} className="flex items-start justify-between gap-2 text-xs">
                          <span className="min-w-0">
                            <span className="font-semibold text-foreground">+{ext.months_added} mo</span>
                            {ext.note && <span className="text-muted-foreground"> — {ext.note}</span>}
                          </span>
                          <span className="shrink-0 tabular-nums text-muted-foreground">{formatDate(ext.created_at)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <label className="text-xs font-medium text-foreground">Months to add</label>
                <Input
                  value={nceMonths}
                  onChange={(e) => { setNceMonths(e.target.value.replace(/\D/g, "")); setNceError(null); }}
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  placeholder="e.g. 6"
                  autoFocus
                  className="mt-1.5"
                />

                {validAdd > 0 && (
                  <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
                    New end date <span className="font-semibold text-foreground tabular-nums">{formatDate(projectEndDate(start, newDuration))}</span> · {newDuration} months total.
                    <br />Budget and workplan periods update automatically; the grant amount is unchanged.
                  </p>
                )}

                <label className="mt-4 block text-xs font-medium text-foreground">Reason <span className="font-normal text-muted-foreground">(optional)</span></label>
                <Input
                  value={nceNote}
                  onChange={(e) => setNceNote(e.target.value)}
                  placeholder="e.g. donor-approved extension"
                  className="mt-1.5"
                />

                {nceError && <p className="mt-3 text-xs text-destructive">{nceError}</p>}
              </div>

              <div className="flex justify-end gap-2 px-6 pb-5">
                <Button variant="outline" size="sm" onClick={() => setNceProject(null)} disabled={nceSaving}>Cancel</Button>
                <Button size="sm" onClick={submitNce} disabled={nceSaving || !validAdd}>
                  {nceSaving ? <Loader2 className="size-4 animate-spin" /> : "Extend project"}
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Project revision dialog */}
      {revProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => { if (!revSaving) setRevProject(null); }}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start gap-3 mb-4">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-700">
                  <FilePenLine className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">Project revision</p>
                  <p className="text-sm text-muted-foreground leading-snug truncate">{revProject.project_title}</p>
                </div>
              </div>

              {revHistory.length > 0 && (
                <div className="mb-4">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    Previous revisions
                  </p>
                  <ul className="space-y-1">
                    {revHistory.map((rev) => (
                      <li key={rev.id} className="flex items-start justify-between gap-2 text-xs">
                        <span className="min-w-0 text-muted-foreground">{rev.comment || <span className="italic">No comment</span>}</span>
                        <span className="shrink-0 tabular-nums text-foreground">{formatDate(rev.revision_date)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <label className="text-xs font-medium text-foreground">Revision date</label>
              <Input
                value={revDate}
                onChange={(e) => { setRevDate(e.target.value); setRevError(null); }}
                type="date"
                autoFocus
                className="mt-1.5"
              />

              <label className="mt-4 block text-xs font-medium text-foreground">Comment <span className="font-normal text-muted-foreground">(optional)</span></label>
              <Input
                value={revComment}
                onChange={(e) => setRevComment(e.target.value)}
                placeholder="e.g. revised scope and deliverables"
                className="mt-1.5"
              />

              {revError && <p className="mt-3 text-xs text-destructive">{revError}</p>}
            </div>

            <div className="flex justify-end gap-2 px-6 pb-5">
              <Button variant="outline" size="sm" onClick={() => setRevProject(null)} disabled={revSaving}>Cancel</Button>
              <Button size="sm" onClick={submitRevision} disabled={revSaving || !revDate}>
                {revSaving ? <Loader2 className="size-4 animate-spin" /> : "Log revision"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
