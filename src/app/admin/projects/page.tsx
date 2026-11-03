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
import { Plus, FolderKanban, Clock, ExternalLink, Printer, Loader2, Lightbulb, CircleDot, PauseCircle, Banknote, CheckCircle2, Building2, CalendarPlus, FilePenLine, MoreHorizontal, FileText, Globe, Pencil, Trash2 } from "lucide-react";
import {
  Dash, Field, LoadingState, ErrorBanner, FormShell, PageHeader,
  FilterBar, FilterSelect, SearchInput, ResultCount, ALL, SortableHead, sortBy, useTableSort,
  ArchiveFilter, ArchiveSelect, matchesArchive, type ArchiveView,
} from "@/components/admin/shared";
import { reportStatusStyle, REPORT_STATUS_ICON_COLORS, type ReportStatus } from "@/lib/reports";
import labels from "@/lib/labels";
import { optionValues } from "@/lib/options";
import { formatDate, projectSlug, timeAgo, formatUsd } from "@/lib/utils";
import { clampDuration, numericAmount, numericInteger } from "@/lib/numeric-input";

// Prodoc uses the same status set as reports (it IS a reports row). Values are
// admin-editable via Settings → Dropdown options ("reportStatus"); the icon map
// is keyed by the known values, with a neutral fallback for any added value.
const PRODOC_STATUS_ICONS: Record<string, ReactNode> = {
  Open:           <CircleDot className={`size-3 shrink-0 ${REPORT_STATUS_ICON_COLORS.Open}`} />,
  "Under Review": <Clock className={`size-3 shrink-0 ${REPORT_STATUS_ICON_COLORS["Under Review"]}`} />,
  Closed:         <CheckCircle2 className={`size-3 shrink-0 ${REPORT_STATUS_ICON_COLORS.Closed}`} />,
};
const PRODOC_STATUS_FALLBACK_ICON: ReactNode = <CircleDot className="size-3 shrink-0 text-zinc-400" />;

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

// Derived project end date = start + duration months. Parsed in local time from
// the YYYY-MM-DD portion so it never drifts a day across time zones. Mirrors the
// DB's reporting_platform.project_end_date() used by budgets/workplan.
function projectEndDate(startDate: string, durationMonths: number): Date {
  const [y, m, d] = startDate.slice(0, 10).split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setMonth(dt.getMonth() + durationMonths);
  return dt;
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
    | "project_title" | "short_name" | "partner_short_name" | "status"
    | "mptfo_project_number" | "grant_size_usd" | "project_duration_months"
    | "geographic_scope" | "prodoc" | "archived";
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
          message: `All reports and project updates must be Closed first. Still open: ${blockers
            .map((b) => `${b.label} (${b.status})`)
            .join("; ")}.`,
          acknowledgement: true,
          variant: "default",
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
          ? `${body.error} Still open: ${blockers.map((b) => `${b.label} (${b.status})`).join("; ")}.`
          : body?.error ?? "Failed to change the archive state. Has db/add-archived.sql been run?"
      );
      return;
    }
    setError(null);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, archived } : p)));
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

  // Set the prodoc's editable status (Open / Under Review / Closed) — same
  // status model as reports. Opens the StatusChangeDialog to collect a name
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
    const prodocOrder = optionValues("reportStatus");
    const statusOrder = optionValues("projectStatus");
    return sortBy(
      matched,
      (p) => {
        // Money, duration and MPTFO # sort numerically; statuses by their
        // workflow order; the rest lexically (nulls sink).
        if (sortKey === "grant_size_usd") return p.grant_size_usd != null ? parseFloat(p.grant_size_usd) : null;
        if (sortKey === "project_duration_months") return p.project_duration_months;
        if (sortKey === "mptfo_project_number") return p.mptfo_project_number ? Number(p.mptfo_project_number) : null;
        if (sortKey === "status") return statusOrder.indexOf(p.status);
        if (sortKey === "prodoc") {
          const pd = prodocByProject[p.id];
          // Status order first, then completion within a status.
          return pd ? prodocOrder.indexOf(pd.status) * 1000 + (completion[p.id] ?? 0) : null;
        }
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
      <PageHeader title="Projects" description="Manage projects across partner organizations">
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
          label="Status"
          value={filterStatus}
          onChange={setFilterStatus}
          allLabel="All statuses"
          width={180}
          options={optionValues("projectStatus").map((s) => ({ value: s, label: s }))}
        />
        <FilterSelect
          icon={FileText}
          label="ProDoc"
          value={filterProdocStatus}
          onChange={setFilterProdocStatus}
          allLabel="All"
          width={140}
          options={optionValues("reportStatus").map((s) => ({ value: s, label: s }))}
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
                <SortableHead label="Short" column="short_name" {...sortProps} />
                <SortableHead label="Project title" column="project_title" {...sortProps} />
                <SortableHead label="Status" column="status" className="w-48" {...sortProps} />
                <SortableHead label="Archive" column="archived" {...sortProps} />
                <SortableHead label="MPTFO #" column="mptfo_project_number" {...sortProps} />
                <SortableHead label="Grant size" column="grant_size_usd" align="right" className="text-right" {...sortProps} />
                <SortableHead label="Duration" column="project_duration_months" {...sortProps} />
                <SortableHead label="Scope" column="geographic_scope" {...sortProps} />
                <SortableHead label="ProDoc" column="prodoc" className="w-48" {...sortProps} />
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p, i) => {
                const pd = prodocByProject[p.id];
                return (
                <TableRow key={p.id} className={`cursor-pointer ${p.archived ? "text-muted-foreground [&_td]:opacity-70" : ""}`} onClick={() => openProdoc(p)}>
                  <TableCell className="text-right text-xs tabular-nums text-muted-foreground">{i + 1}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.partner_short_name?.toUpperCase() || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {p.short_name || <Dash />}
                  </TableCell>
                  <TableCell className="font-medium max-w-[260px] truncate" title={p.project_title}>{p.project_title}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Select value={p.status} onValueChange={(v) => handleStatusChange(p.id, v as ProjectStatus)}>
                      <SelectTrigger className="!h-7 w-full border-0 bg-transparent px-2 text-xs font-medium text-muted-foreground shadow-none [&>svg]:size-3 [&>svg]:shrink-0">
                        <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                          {STATUS_ICONS[p.status] ?? STATUS_ICON_FALLBACK}
                          <SelectValue />
                        </span>
                      </SelectTrigger>
                      <SelectContent>
                        {optionValues("projectStatus").map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <ArchiveSelect archived={!!p.archived} onChange={(a) => handleArchiveChange(p, a)} />
                  </TableCell>
                  <TableCell className="text-xs font-mono">
                    {p.mptfo_project_number ? (
                      <a
                        href={`https://mptf.undp.org/project/${p.mptfo_project_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
                        title="Open on MPTF Office Gateway"
                      >
                        {p.mptfo_project_number}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : <Dash />}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatUsd(p.grant_size_usd)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                      {durationLabel(p.project_duration_months) || <Dash />}
                      {p.extension_count > 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded border border-crafd-yellow-400 bg-crafd-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-crafd-grey-800"
                          title={`${p.extension_count} no-cost extension${p.extension_count !== 1 ? "s" : ""} · ${p.extension_months_total} month${p.extension_months_total !== 1 ? "s" : ""} added`}
                        >
                          <CalendarPlus className="size-2.5" />
                          +{p.extension_months_total}mo
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{p.geographic_scope || <Dash />}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {pd ? (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <Select
                            value={pd.status}
                            onValueChange={(v) => handleProdocStatusChange(p.id, pd.id, v as ReportStatus)}
                          >
                            <SelectTrigger
                              title="Project document status"
                              className={`!h-7 w-fit shrink-0 px-2 text-xs font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0 ${reportStatusStyle(pd.status)}`}
                            >
                              <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
                                {PRODOC_STATUS_ICONS[pd.status] ?? PRODOC_STATUS_FALLBACK_ICON}
                                <SelectValue />
                              </span>
                            </SelectTrigger>
                            <SelectContent>
                              {optionValues("reportStatus").map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <span className="text-xs tabular-nums text-muted-foreground" title="Project document completion">
                            {completion[p.id] ?? 0}%
                          </span>
                        </div>
                        {pd.last_edited && (
                          <span className="text-xs text-muted-foreground" title={`Last edited ${formatDate(pd.last_edited)}`}>
                            edited {timeAgo(pd.last_edited)}
                          </span>
                        )}
                      </div>
                    ) : <Dash />}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                        title="More actions"
                      >
                        <MoreHorizontal className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {p.project_start_date && p.project_duration_months != null && (
                          <DropdownMenuItem onSelect={() => openNce(p)}>
                            <CalendarPlus />
                            No-cost extension
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onSelect={() => openRevision(p)}>
                          <FilePenLine />
                          Project revision
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled={!pd || printingId === p.id} onSelect={() => printProdoc(p)}>
                          {printingId === p.id ? <Loader2 className="animate-spin" /> : <Printer />}
                          Print project document
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
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-crafd-yellow-100 text-crafd-yellow-900">
                    <CalendarPlus className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground leading-snug">No-cost extension</p>
                    <p className="text-sm text-muted-foreground leading-snug truncate">{nceProject.project_title}</p>
                  </div>
                </div>

                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground mb-4 space-y-1">
                  <div className="flex justify-between gap-2"><span className="truncate min-w-0">Start</span><span className="tabular-nums text-foreground shrink-0">{formatDate(start)}</span></div>
                  <div className="flex justify-between gap-2"><span className="truncate min-w-0">Current end</span><span className="tabular-nums text-foreground shrink-0">{formatDate(projectEndDate(start, currentDuration))} · {currentDuration} mo</span></div>
                </div>

                {nceHistory.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
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
                  onChange={(e) => { setNceMonths(numericInteger(e.target.value)); setNceError(null); }}
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
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-crafd-yellow-100 text-crafd-yellow-900">
                  <FilePenLine className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">Project revision</p>
                  <p className="text-sm text-muted-foreground leading-snug truncate">{revProject.project_title}</p>
                </div>
              </div>

              {revHistory.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
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
              <DateInput
                value={revDate}
                onChange={(v) => { setRevDate(v); setRevError(null); }}
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
    <StatusChangeDialog
      open={pendingStatusChange !== null}
      fromStatus={pendingStatusChange?.fromStatus ?? ""}
      toStatus={pendingStatusChange?.status ?? ""}
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
