"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, FolderKanban, Clock, DollarSign, ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  Dash, Field, ViewToggle, LoadingState, ErrorBanner, FormShell, CardActions, RowActions,
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
  project_duration: string | null;
  geographic_scope: string | null;
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
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
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
  const [duration, setDuration] = useState("");
  const [scope, setScope] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, prRes] = await Promise.all([fetch("/api/partners"), fetch("/api/projects")]);
      if (!pRes.ok || !prRes.ok) throw new Error("Failed to fetch data");
      setPartners(await pRes.json());
      setProjects(await prRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setPartnerId(""); setTitle(""); setShortName("");
    setMptfo(""); setGrantSize(""); setDuration(""); setScope("");
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(p: Project) {
    setPartnerId(String(p.partner_id));
    setTitle(p.project_title);
    setShortName(p.short_name || "");
    setMptfo(p.mptfo_project_number || "");
    setGrantSize(p.grant_size_usd || "");
    setDuration(p.project_duration || "");
    setScope(p.geographic_scope || "");
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
        project_duration: duration.trim() || null,
        geographic_scope: scope.trim() || null,
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

  async function handleDelete(id: number) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Projects</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage projects across partner organizations</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={partners.length === 0}>
              <Plus className="size-3.5" /> Add project
            </Button>
          )}
        </div>
      </div>

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
                  <SelectTrigger><SelectValue placeholder="Select partner" /></SelectTrigger>
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Maintaining & Improving ACLED..." />
              </Field>
              <Field label="Short name">
                <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="MaintainingACLED" />
              </Field>
              <Field label="MPTFO project number">
                <Input value={mptfo} onChange={(e) => setMptfo(e.target.value)} placeholder="00140841" />
              </Field>
              <Field label="Grant size (USD)">
                <Input value={grantSize} onChange={(e) => setGrantSize(e.target.value)} type="number" placeholder="0" />
              </Field>
              <Field label="Project duration">
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="24 months" />
              </Field>
              <Field label="Geographic scope">
                <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Global" />
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
                  <TableCell className="text-muted-foreground text-xs">{p.project_duration || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-[140px] truncate">{p.geographic_scope || <Dash />}</TableCell>
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
              <div key={p.id} className="group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-colors hover:bg-muted/30 cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground mb-1">{p.partner_short_name || "—"}</p>
                    <p className="text-lg font-semibold leading-snug line-clamp-2">{p.project_title}</p>
                  </div>
                  <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(p);
                      }}
                      className="p-1.5 hover:bg-accent rounded transition-colors"
                      title="Edit"
                    >
                      <Pencil className="size-4 text-muted-foreground" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(p.id);
                      }}
                      className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                  {p.grant_size_usd && (
                    <span className="inline-flex items-center gap-1.5">
                      <DollarSign className="size-3 shrink-0" />
                      {fmtUsd(p.grant_size_usd)}
                    </span>
                  )}
                  {p.project_duration && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-3 shrink-0" />
                      {p.project_duration}
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
