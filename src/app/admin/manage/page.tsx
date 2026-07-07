"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus, Pencil, Trash2, X, Check, Building2, FolderKanban, ExternalLink, Loader2,
} from "lucide-react";

// ── Types ──

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
  organization_website: string | null;
  mail_account: string;
  created_at: string;
  projects: { id: number; project_title: string; short_name: string | null }[];
}

interface Project {
  id: number;
  partner_id: number;
  partner_short_name: string | null;
  partner_long_name: string | null;
  project_title: string;
  short_name: string | null;
  long_name: string | null;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_duration: string | null;
  geographic_scope: string | null;
}

// ── Main page ──

export default function ManagePage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, prRes] = await Promise.all([
        fetch("/api/partners"),
        fetch("/api/projects"),
      ]);
      if (!pRes.ok || !prRes.ok) throw new Error("Failed to fetch data");
      setPartners(await pRes.json());
      setProjects(await prRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex flex-col justify-center shrink-0">
        <h1 className="text-2xl font-bold font-qanelas">Partners & Projects</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage partner organizations and their projects
        </p>
      </div>
      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="size-4 animate-spin" /> Loading...
          </div>
        ) : (
          <>
            <PartnersSection partners={partners} onRefresh={loadData} />
            <ProjectsSection projects={projects} partners={partners} onRefresh={loadData} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Helpers ──

function Field({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}{required && " *"}</Label>
      {children}
    </div>
  );
}

function Dash() {
  return <span className="text-xs text-muted-foreground/50">—</span>;
}

// ── Partners Section ──

function PartnersSection({ partners, onRefresh }: { partners: Partner[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [shortName, setShortName] = useState("");
  const [longName, setLongName] = useState("");
  const [website, setWebsite] = useState("");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");

  function resetForm() {
    setShortName(""); setLongName("");
    setWebsite(""); setMail(""); setPassword("");
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(p: Partner) {
    setShortName(p.short_name || "");
    setLongName(p.long_name || "");
    setWebsite(p.organization_website || "");
    setMail(p.mail_account);
    setPassword("");
    setEditId(p.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!shortName.trim() || !mail.trim()) { setFormError("Short name and email are required"); return; }
    if (!editId && !password.trim()) { setFormError("Password is required for new partners"); return; }

    setSaving(true); setFormError(null);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const body: Record<string, any> = {
        short_name: shortName.trim(),
        long_name: longName.trim() || null,
        organization_website: website.trim() || null,
        mail_account: mail.trim(),
      };
      if (password) body.password = password;

      const res = await fetch(
        editId ? `/api/partners/${editId}` : "/api/partners",
        { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save"); }
      resetForm(); onRefresh();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this partner? This cannot be undone.")) return;
    const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    onRefresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-muted-foreground" />
            <div>
              <CardTitle>Partners</CardTitle>
              <CardDescription>{partners.length} partner organization{partners.length !== 1 ? "s" : ""}</CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="size-3.5" /> Add partner
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{editId ? "Edit partner" : "New partner"}</p>
              <Button variant="ghost" size="icon" className="size-7" onClick={resetForm}><X className="size-3.5" /></Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <Field label="Short name" required>
                <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Acronym" />
              </Field>
              <Field label="Long name">
                <Input value={longName} onChange={(e) => setLongName(e.target.value)} placeholder="Full organization name" />
              </Field>
              <Field label="Website">
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://example.org" />
              </Field>
              <Field label="Email account" required>
                <Input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="name@example.org" type="email" />
              </Field>
              <Field label={editId ? "Password (blank = keep current)" : "Password"} required={!editId}>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={editId ? "Unchanged" : ""} />
              </Field>
            </div>
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {partners.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No partners yet.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {partners.map((p) => (
              <div key={p.id} className="group rounded-xl border bg-card p-5 flex flex-col gap-3 transition-colors hover:bg-muted/30 cursor-pointer">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-muted-foreground mb-1">{p.short_name || "—"}</p>
                    <p className="text-lg font-semibold leading-snug line-clamp-2">{p.long_name || "—"}</p>
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
                  <span className="truncate">{p.mail_account}</span>
                  {p.organization_website && (
                    <a
                      href={p.organization_website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-blue-600 hover:underline w-fit"
                    >
                      <ExternalLink className="size-3" />
                      Website
                    </a>
                  )}
                  {p.projects.length > 0 && (
                    <span className="text-xs">{p.projects.length} project{p.projects.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Projects Section ──

function ProjectsSection({ projects, partners, onRefresh }: { projects: Project[]; partners: Partner[]; onRefresh: () => void }) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [shortName, setShortName] = useState("");
  const [longName, setLongName] = useState("");
  const [mptfo, setMptfo] = useState("");
  const [grantSize, setGrantSize] = useState("");
  const [duration, setDuration] = useState("");
  const [scope, setScope] = useState("");

  function resetForm() {
    setPartnerId(""); setTitle(""); setShortName(""); setLongName("");
    setMptfo(""); setGrantSize(""); setDuration(""); setScope("");
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(p: Project) {
    setPartnerId(String(p.partner_id));
    setTitle(p.project_title);
    setShortName(p.short_name || "");
    setLongName(p.long_name || "");
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
        long_name: longName.trim() || null,
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
      resetForm(); onRefresh();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    onRefresh();
  }

  function fmtUsd(v: string | null) {
    if (!v) return <Dash />;
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    return "$" + n.toLocaleString("en-US");
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderKanban className="size-5 text-muted-foreground" />
            <div>
              <CardTitle>Projects</CardTitle>
              <CardDescription>{projects.length} project{projects.length !== 1 ? "s" : ""} across {partners.length} partner{partners.length !== 1 ? "s" : ""}</CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={partners.length === 0}>
              <Plus className="size-3.5" /> Add project
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{editId ? "Edit project" : "New project"}</p>
              <Button variant="ghost" size="icon" className="size-7" onClick={resetForm}><X className="size-3.5" /></Button>
            </div>
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
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
              </Field>
              <Field label="Short name">
                <Input value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Short name" />
              </Field>
              <Field label="Long name">
                <Input value={longName} onChange={(e) => setLongName(e.target.value)} placeholder="Full project title..." />
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
            {formError && <p className="text-xs text-destructive">{formError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
              <Button size="sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {partners.length === 0 ? "Add a partner first, then create projects." : "No projects yet."}
          </p>
        ) : (
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
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => startEdit(p)}>
                        <Pencil className="size-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" onClick={() => handleDelete(p.id)}>
                        <Trash2 className="size-3" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
