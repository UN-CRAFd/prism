"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { Plus, FolderKanban, Clock, DollarSign, ExternalLink, Printer, ArrowRight, Loader2 } from "lucide-react";
import {
  Dash, Field, ViewToggle, LoadingState, ErrorBanner, FormShell, RowActions, PageHeader, HoverActions,
} from "@/components/admin/shared";

// -- Types ------------------------------------------------------------------

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

interface Project {
  id: number;
  partner_id: number;
  partner_short_name: string | null;
  partner_long_name: string | null;
  project_title: string;
  short_name: string | null;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_start_date: string | null;
  project_duration_months: number | null;
  geographic_scope: string | null;
  implementing_partners: string | null;
  project_lead: string | null;
}

function durationLabel(months: number | null): string | null {
  return months && months > 0 ? `${months} months` : null;
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
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  // project_id → its prodoc report id (for Print / Open ProDoc).
  const [prodocByProject, setProdocByProject] = useState<Record<number, number>>({});
  const [printingId, setPrintingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("grid");

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
  const [projectLead, setProjectLead] = useState("");

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
      const prodocs: { id: number; project_id: number }[] = await pdRes.json();
      setProdocByProject(Object.fromEntries(prodocs.map((d) => [d.project_id, d.id])));
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
    setImplementingPartners(""); setProjectLead("");
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
    setProjectLead(p.project_lead || "");
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
        project_lead: projectLead.trim() || null,
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

  async function printProdoc(p: Project) {
    const prodocId = prodocByProject[p.id];
    if (!prodocId) return;
    setPrintingId(p.id);
    try {
      const response = await fetch(`/api/reports/${prodocId}/pdf`);
      if (!response.ok) throw new Error("Failed to generate PDF");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${p.short_name || "prodoc"}_prodoc.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (e) {
      console.error("Print failed:", e);
    } finally {
      setPrintingId(null);
    }
  }

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
              <Field label="Project lead">
                <Input value={projectLead} onChange={(e) => setProjectLead(e.target.value)} placeholder="Name of project lead" />
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
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Short</TableHead>
                <TableHead>Project title</TableHead>
                <TableHead>MPTFO #</TableHead>
                <TableHead className="text-right">Grant size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="w-40">ProDoc</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.partner_short_name || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {p.short_name || <Dash />}
                  </TableCell>
                  <TableCell className="font-medium max-w-[260px] truncate">{p.project_title}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">{p.mptfo_project_number || <Dash />}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUsd(p.grant_size_usd)}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{durationLabel(p.project_duration_months) || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{p.geographic_scope || <Dash />}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <button
                        onClick={() => printProdoc(p)}
                        disabled={printingId === p.id || !prodocByProject[p.id]}
                        className="h-7 flex items-center justify-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                        title="Print the project document to PDF"
                      >
                        {printingId === p.id ? <Loader2 className="size-3 animate-spin" /> : <Printer className="size-3" />}
                        Print
                      </button>
                      <button
                        onClick={() => openProdoc(p)}
                        className="h-7 flex items-center justify-center gap-1 rounded border border-border px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        title="Open the project document"
                      >
                        Open
                        <ArrowRight className="size-3" />
                      </button>
                    </div>
                  </TableCell>
                  <TableCell>
                    <RowActions onEdit={() => startEdit(p)} onDelete={() => handleDelete(p.id)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <div key={p.id} className="group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground mb-1">{p.partner_short_name || "—"}</p>
                    <p className="text-lg font-semibold leading-snug line-clamp-2">{p.project_title}</p>
                  </div>
                  <HoverActions onEdit={() => startEdit(p)} onDelete={() => handleDelete(p.id)} />
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
                    </span>
                  )}
                  {p.mptfo_project_number && (
                    <a
                      href={`https://mptf.undp.org/project/${p.mptfo_project_number}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline w-fit"
                    >
                      <ExternalLink className="size-3" />
                      {p.mptfo_project_number}
                    </a>
                  )}
                </div>

                {/* ProDoc actions */}
                <div className="flex gap-1.5 mt-auto pt-1">
                  <button
                    onClick={() => printProdoc(p)}
                    disabled={printingId === p.id || !prodocByProject[p.id]}
                    className="h-7 flex-1 flex items-center justify-center gap-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    title="Print the project document to PDF"
                  >
                    {printingId === p.id ? <Loader2 className="size-3 animate-spin" /> : <Printer className="size-3" />}
                    Print ProDoc
                  </button>
                  <button
                    onClick={() => openProdoc(p)}
                    className="h-7 flex-1 flex items-center justify-center gap-1.5 rounded border border-border text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title="Open the project document"
                  >
                    Open ProDoc
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
