"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Building2, ExternalLink, Pencil, Trash2 } from "lucide-react";
import {
  Dash, Field, ViewToggle, LoadingState, ErrorBanner, FormShell, RowActions,
} from "@/components/admin/shared";

// -- Types ------------------------------------------------------------------

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
  organization_website: string | null;
  mail_account: string;
  created_at: string;
  projects: { id: number; project_title: string; short_name: string | null }[];
}

// -- Sub-components ---------------------------------------------------------

function PartnerLogo({ shortName }: { shortName: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!shortName || errored) return <Building2 className="size-10 text-muted-foreground/40" />;
  return (
    <img
      src={`/logos/${shortName.toLowerCase()}.webp`}
      alt={shortName}
      className="w-full h-auto object-contain max-h-16"
      onError={() => setErrored(true)}
    />
  );
}

// -- Page -------------------------------------------------------------------

export default function PartnersPage() {
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("grid");

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [shortName, setShortName] = useState("");
  const [longName, setLongName] = useState("");
  const [website, setWebsite] = useState("");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/partners");
      if (!res.ok) throw new Error("Failed to fetch partners");
      setPartners(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setShortName(""); setLongName(""); setWebsite(""); setMail(""); setPassword("");
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
      resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this partner? This cannot be undone.")) return;
    const res = await fetch(`/api/partners/${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b px-8 h-32 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold font-qanelas">Partners</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage partner organizations</p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle view={view} onChange={setView} />
          {!showForm && (
            <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
              <Plus className="size-3.5" /> Add partner
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {showForm && (
          <FormShell
            title={editId ? "Edit partner" : "New partner"}
            onClose={resetForm}
            error={formError}
            saving={saving}
            editMode={!!editId}
            onCancel={resetForm}
            onSubmit={handleSubmit}
          >
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
          </FormShell>
        )}

        {loading ? (
          <LoadingState />
        ) : partners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Building2 className="size-8 opacity-30" />
            <p className="text-sm">No partners yet.</p>
          </div>
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Short</TableHead>
                <TableHead>Long name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Website</TableHead>
                <TableHead>Projects</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {partners.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    {p.short_name
                      ? <Badge variant="outline" className="text-xs font-semibold">{p.short_name}</Badge>
                      : <Dash />}
                  </TableCell>
                  <TableCell className="font-medium">{p.long_name || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{p.mail_account}</TableCell>
                  <TableCell>
                    {p.organization_website
                      ? <a href={p.organization_website} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                          Link <ExternalLink className="size-3" />
                        </a>
                      : <Dash />}
                  </TableCell>
                  <TableCell>
                    {p.projects.length > 0
                      ? <div className="flex flex-wrap gap-1">
                          {p.projects.map((pr) => (
                            <Badge key={pr.id} variant="secondary" className="text-xs font-normal">
                              {pr.short_name || pr.project_title}
                            </Badge>
                          ))}
                        </div>
                      : <Dash />}
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
            {partners.map((p) => (
              <div key={p.id} className="group rounded-xl border bg-card flex transition-colors hover:bg-muted/30 cursor-pointer overflow-hidden">
                <div className="bg-muted w-24 flex-shrink-0 flex items-center justify-center p-3">
                  <PartnerLogo shortName={p.short_name} />
                </div>
                <div className="flex-1 flex flex-col gap-2 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold leading-snug line-clamp-2">{p.long_name || "—"}</p>
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
                    {p.organization_website && (
                      <a href={p.organization_website} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-blue-600 hover:underline w-fit">
                        <ExternalLink className="size-3" />
                        Website
                      </a>
                    )}
                  </div>
                  {p.projects.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.projects.map((pr) => (
                        <Badge key={pr.id} variant="secondary" className="text-xs font-normal">
                          {pr.short_name || pr.project_title}
                        </Badge>
                      ))}
                    </div>
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
