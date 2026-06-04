"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  Building2,
  FolderKanban,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ──

interface Partner {
  id: number;
  organization_name: string;
  organization_website: string | null;
  mail_account: string;
  created_at: string;
  projects: { id: number; project_title: string }[];
}

interface Project {
  id: number;
  partner_id: number;
  partner_name: string;
  project_title: string;
  mptfo_project_number: string | null;
  grant_size_usd: string | null;
  project_duration: string | null;
  geographic_scope: string | null;
  created_at: string;
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

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 py-4">
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
            <Loader2 className="size-4 animate-spin" />
            Loading...
          </div>
        ) : (
          <>
            <PartnersSection partners={partners} onRefresh={loadData} />
            <ProjectsSection
              projects={projects}
              partners={partners}
              onRefresh={loadData}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Partners Section ──

function PartnersSection({
  partners,
  onRefresh,
}: {
  partners: Partner[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");

  function resetForm() {
    setName("");
    setWebsite("");
    setMail("");
    setPassword("");
    setEditId(null);
    setShowForm(false);
    setFormError(null);
  }

  function startEdit(p: Partner) {
    setName(p.organization_name);
    setWebsite(p.organization_website || "");
    setMail(p.mail_account);
    setPassword("");
    setEditId(p.id);
    setShowForm(true);
    setFormError(null);
  }

  async function handleSubmit() {
    if (!name.trim() || !mail.trim()) {
      setFormError("Name and email are required");
      return;
    }
    if (!editId && !password.trim()) {
      setFormError("Password is required for new partners");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body: Record<string, string> = {
        organization_name: name.trim(),
        organization_website: website.trim(),
        mail_account: mail.trim(),
      };
      if (password) body.password = password;

      const url = editId ? `/api/partners/${editId}` : "/api/partners";
      const method = editId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      resetForm();
      onRefresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this partner? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete");
        return;
      }
      onRefresh();
    } catch {
      alert("Failed to delete partner");
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="size-5 text-muted-foreground" />
            <div>
              <CardTitle>Partners</CardTitle>
              <CardDescription>
                {partners.length} partner organization{partners.length !== 1 ? "s" : ""} registered
              </CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="size-3.5" />
              Add partner
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Inline form */}
        {showForm && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {editId ? "Edit partner" : "New partner"}
              </p>
              <Button variant="ghost" size="icon" className="size-7" onClick={resetForm}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Organization name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ACLED" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Email account *</Label>
                <Input value={mail} onChange={(e) => setMail(e.target.value)} placeholder="contact@org.com" type="email" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Website</Label>
                <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Password {editId ? "(leave blank to keep current)" : "*"}
                </Label>
                <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder={editId ? "Unchanged" : ""} />
              </div>
            </div>
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {partners.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No partners yet. Add the first one above.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.organization_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.mail_account}</TableCell>
                  <TableCell>
                    {p.organization_website ? (
                      <a
                        href={p.organization_website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        Link <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {p.projects.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {p.projects.map((pr) => (
                          <Badge key={pr.id} variant="outline" className="text-xs font-normal">
                            {pr.project_title}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground/50">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
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

// ── Projects Section ──

function ProjectsSection({
  projects,
  partners,
  onRefresh,
}: {
  projects: Project[];
  partners: Partner[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [title, setTitle] = useState("");
  const [mptfo, setMptfo] = useState("");
  const [grantSize, setGrantSize] = useState("");
  const [duration, setDuration] = useState("");
  const [scope, setScope] = useState("");

  function resetForm() {
    setPartnerId("");
    setTitle("");
    setMptfo("");
    setGrantSize("");
    setDuration("");
    setScope("");
    setEditId(null);
    setShowForm(false);
    setFormError(null);
  }

  function startEdit(p: Project) {
    setPartnerId(String(p.partner_id));
    setTitle(p.project_title);
    setMptfo(p.mptfo_project_number || "");
    setGrantSize(p.grant_size_usd || "");
    setDuration(p.project_duration || "");
    setScope(p.geographic_scope || "");
    setEditId(p.id);
    setShowForm(true);
    setFormError(null);
  }

  async function handleSubmit() {
    if (!partnerId || !title.trim()) {
      setFormError("Partner and project title are required");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const body = {
        partner_id: Number(partnerId),
        project_title: title.trim(),
        mptfo_project_number: mptfo.trim() || null,
        grant_size_usd: grantSize ? parseFloat(grantSize) : null,
        project_duration: duration.trim() || null,
        geographic_scope: scope.trim() || null,
      };

      const url = editId ? `/api/projects/${editId}` : "/api/projects";
      const method = editId ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to save");
      }

      resetForm();
      onRefresh();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Failed to delete");
        return;
      }
      onRefresh();
    } catch {
      alert("Failed to delete project");
    }
  }

  function fmt(v: string | null) {
    if (!v) return <span className="text-xs text-muted-foreground/50">—</span>;
    const n = parseFloat(v);
    if (!isNaN(n)) return "$" + n.toLocaleString("en-US");
    return v;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FolderKanban className="size-5 text-muted-foreground" />
            <div>
              <CardTitle>Projects</CardTitle>
              <CardDescription>
                {projects.length} project{projects.length !== 1 ? "s" : ""} across {partners.length} partner{partners.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
          </div>
          {!showForm && (
            <Button
              size="sm"
              onClick={() => { resetForm(); setShowForm(true); }}
              disabled={partners.length === 0}
            >
              <Plus className="size-3.5" />
              Add project
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Inline form */}
        {showForm && (
          <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">
                {editId ? "Edit project" : "New project"}
              </p>
              <Button variant="ghost" size="icon" className="size-7" onClick={resetForm}>
                <X className="size-3.5" />
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Partner *</Label>
                <Select value={partnerId} onValueChange={setPartnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select partner" />
                  </SelectTrigger>
                  <SelectContent>
                    {partners.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.organization_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="ACLED Data" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">MPTFO project number</Label>
                <Input value={mptfo} onChange={(e) => setMptfo(e.target.value)} placeholder="00123456" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Grant size (USD)</Label>
                <Input value={grantSize} onChange={(e) => setGrantSize(e.target.value)} type="number" placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Project duration</Label>
                <Input value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="24 months" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Geographic scope</Label>
                <Input value={scope} onChange={(e) => setScope(e.target.value)} placeholder="Global" />
              </div>
            </div>
            {formError && (
              <p className="text-xs text-destructive">{formError}</p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetForm}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {editId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {partners.length === 0
              ? "Add a partner first, then create projects."
              : "No projects yet. Add the first one above."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Project Title</TableHead>
                <TableHead>MPTFO #</TableHead>
                <TableHead className="text-right">Grant Size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-normal">
                      {p.partner_name}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{p.project_title}</TableCell>
                  <TableCell className="text-muted-foreground text-xs font-mono">
                    {p.mptfo_project_number || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fmt(p.grant_size_usd)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.project_duration || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {p.geographic_scope || "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => startEdit(p)}
                      >
                        <Pencil className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(p.id)}
                      >
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
