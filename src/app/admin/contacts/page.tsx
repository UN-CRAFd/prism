"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useMemo } from "react";
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
import { Plus, Contact, CornerDownRight, Trash2, ChevronDown, ChevronRight, Building2 } from "lucide-react";
import {
  Dash, Field, LoadingState, ErrorBanner, FormShell, RowActions, PageHeader,
  FilterBar, SearchInput,
} from "@/components/admin/shared";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { buildContactTree, flattenTree, descendantIds } from "@/lib/contact-tree";
import labels from "@/lib/labels.json";

const NONE = "none";
const RELATIONSHIP_NONE = "__none__";
const g = labels.generalInfo;

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

interface Project {
  id: number;
  partner_id: number;
  project_title: string;
  short_name: string | null;
}

interface ProjectLink {
  id: number;
  project_id: number;
  contact_id: number;
  relationship: string | null;
  is_applicant: boolean;
  project_title: string;
  project_short_name: string | null;
}

// Small partner logo, served from /logos/<short_name>.<webp|png>; falls back to
// a generic building icon when no logo file exists.
function PartnerLogo({ shortName }: { shortName: string | null }) {
  const [extension, setExtension] = useState<"webp" | "png" | "none">("webp");
  if (!shortName || extension === "none") {
    return <Building2 className="size-5 text-muted-foreground/40 shrink-0" />;
  }
  return (
    <img
      src={`/logos/${shortName.toLowerCase()}.${extension}`}
      alt={shortName}
      className="h-6 w-auto max-w-24 object-contain shrink-0"
      onError={() => setExtension(extension === "webp" ? "png" : "none")}
    />
  );
}

interface PartnerContact {
  id: number;
  partner_id: number;
  manager_id: number | null;
  name: string;
  role: string | null;
  email: string | null;
  partner_short_name: string | null;
  partner_long_name: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [links, setLinks] = useState<ProjectLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addingLink, setAddingLink] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");

  function toggleGroup(partnerId: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(partnerId)) next.delete(partnerId); else next.add(partnerId);
      return next;
    });
  }

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [managerId, setManagerId] = useState(NONE);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, pRes, prRes, lRes] = await Promise.all([
        fetch("/api/partner-contacts"),
        fetch("/api/partners"),
        fetch("/api/projects"),
        fetch("/api/project-contacts"),
      ]);
      if (!cRes.ok || !pRes.ok || !prRes.ok || !lRes.ok) throw new Error("Failed to fetch data");
      setContacts(await cRes.json());
      setPartners(await pRes.json());
      setProjects(await prRes.json());
      setLinks(await lRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setPartnerId(""); setName(""); setRole(""); setEmail(""); setManagerId(NONE);
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(c: PartnerContact) {
    setPartnerId(String(c.partner_id));
    setName(c.name);
    setRole(c.role || "");
    setEmail(c.email || "");
    setManagerId(c.manager_id != null ? String(c.manager_id) : NONE);
    setEditId(c.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!partnerId) { setFormError("Please select a partner"); return; }
    if (!name.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    try {
      const manager_id = managerId === NONE ? null : Number(managerId);
      const body = editId
        ? { id: editId, name: name.trim(), role: role.trim() || null, email: email.trim() || null, manager_id }
        : { partner_id: Number(partnerId), name: name.trim(), role: role.trim() || null, email: email.trim() || null, manager_id };
      const res = await fetch("/api/partner-contacts", {
        method: editId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save"); }
      resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  const confirm = useConfirm();

  async function handleDelete(id: number) {
    if (!await confirm({ message: "Delete this contact? People they manage move up to the next level." })) return;
    const res = await fetch(`/api/partner-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
  }

  // ── Project links (per contact, saved immediately) ────────────────────────
  async function addProjectLink(projectId: number) {
    if (!editId) return;
    setAddingLink(true); setFormError(null);
    try {
      const res = await fetch("/api/project-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, contact_id: editId }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to link project"); }
      const created: ProjectLink = await res.json();
      setLinks((prev) => [...prev, created]);
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingLink(false); }
  }

  async function patchProjectLink(id: number, patch: Partial<Pick<ProjectLink, "relationship" | "is_applicant">>) {
    setLinks((prev) => prev.map((l) => l.id === id ? { ...l, ...patch } : l));
    const res = await fetch("/api/project-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setFormError(err.error || "Failed to update link"); }
  }

  async function removeProjectLink(id: number) {
    const res = await fetch(`/api/project-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setFormError("Failed to remove link"); return; }
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  // Manager picker: same-partner contacts, excluding the contact itself and
  // anyone it already manages (so you can't create a loop).
  const samePartner = contacts.filter((c) => String(c.partner_id) === partnerId);
  const blocked = editId != null ? descendantIds(samePartner, editId) : new Set<number>();
  const managerOptions = samePartner.filter((c) => c.id !== editId && !blocked.has(c.id));

  // Project links for the contact being edited, and the projects available to
  // link (same partner org, not already linked).
  const editLinks = editId != null ? links.filter((l) => l.contact_id === editId) : [];
  const editPartnerId = partnerId ? Number(partnerId) : null;
  const projectComboItems: ComboboxItem[] = projects
    .filter((p) => editPartnerId == null || p.partner_id === editPartnerId)
    .filter((p) => !editLinks.some((l) => l.project_id === p.id))
    .map((p) => ({ id: p.id, label: p.short_name || p.project_title }));

  // Search across name / role / email / partner name.
  const filteredContacts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.role, c.email, c.partner_short_name, c.partner_long_name]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [contacts, search]);

  // One group per partner (contacts already arrive ordered by partner), each
  // flattened into a manager → reports list with a depth for indentation.
  const groups: { partnerId: number; label: string; shortName: string | null; rows: { node: PartnerContact; depth: number }[] }[] = [];
  for (const c of filteredContacts) {
    let g = groups.find((x) => x.partnerId === c.partner_id);
    if (!g) {
      g = { partnerId: c.partner_id, label: c.partner_short_name || c.partner_long_name || "—", shortName: c.partner_short_name, rows: [] };
      groups.push(g);
    }
  }
  for (const g of groups) {
    g.rows = flattenTree(buildContactTree(filteredContacts.filter((c) => c.partner_id === g.partnerId)));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Contacts" description="Manage people working at partner organizations">
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} disabled={partners.length === 0}>
            <Plus className="size-3.5" /> Add contact
          </Button>
        )}
      </PageHeader>

      <FilterBar>
        <SearchInput value={search} onChange={setSearch} placeholder="Search contacts by name, role, email, or partner…" />
      </FilterBar>

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {showForm && (
          <FormShell
            title={editId ? "Edit contact" : "New contact"}
            onClose={resetForm}
            error={formError}
            saving={saving}
            editMode={!!editId}
            onCancel={resetForm}
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <Field label="Partner" required>
                <Select value={partnerId} onValueChange={setPartnerId} disabled={!!editId}>
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
              <Field label="Name" required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
              </Field>
              <Field label="Role">
                <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Project Lead" />
              </Field>
              <Field label="Email">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.org" type="email" />
              </Field>
              <Field label="Manager">
                <Select value={managerId} onValueChange={setManagerId} disabled={!partnerId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}><span className="text-muted-foreground">— None (top level)</span></SelectItem>
                    {managerOptions.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}{m.role ? ` — ${m.role}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {editId != null && (
              <div className="mt-6 border-t pt-5 space-y-3">
                <h4 className="text-sm font-semibold">Linked projects</h4>
                <div className="max-w-xl">
                  <Combobox
                    items={projectComboItems}
                    placeholder="Link a project…"
                    onSelect={(it) => addProjectLink(it.id)}
                    busy={addingLink}
                  />
                </div>
                {editLinks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Not linked to any projects yet.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project</TableHead>
                          <TableHead className="w-56">{g.columns.relationship}</TableHead>
                          <TableHead className="w-28 text-center">{g.columns.applicant}</TableHead>
                          <TableHead className="w-12" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {editLinks.map((l) => (
                          <TableRow key={l.id}>
                            <TableCell className="font-medium">{l.project_short_name || l.project_title}</TableCell>
                            <TableCell>
                              <Select
                                value={l.relationship ?? RELATIONSHIP_NONE}
                                onValueChange={(v) => patchProjectLink(l.id, { relationship: v === RELATIONSHIP_NONE ? null : v })}
                              >
                                <SelectTrigger className="w-full h-8 text-sm"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={RELATIONSHIP_NONE}>{g.relationshipNone}</SelectItem>
                                  {g.relationshipOptions.map((r) => (
                                    <SelectItem key={r} value={r}>{r}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-center">
                              <input
                                type="checkbox"
                                checked={l.is_applicant}
                                onChange={(e) => patchProjectLink(l.id, { is_applicant: e.target.checked })}
                                className="size-4 accent-foreground cursor-pointer"
                                aria-label={g.applicantLabel}
                              />
                            </TableCell>
                            <TableCell className="text-right">
                              <button
                                onClick={() => removeProjectLink(l.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                aria-label="Remove project link"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
          </FormShell>
        )}

        {loading ? (
          <LoadingState />
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Contact className="size-8 opacity-30" />
            <p className="text-sm">
              {partners.length === 0 ? "Add a partner first, then create contacts." : "No contacts yet."}
            </p>
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Contact className="size-8 opacity-30" />
            <p className="text-sm">No contacts match your search.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((g) => {
              const isCollapsed = collapsed.has(g.partnerId);
              return (
              <div key={g.partnerId}>
                <button
                  type="button"
                  onClick={() => toggleGroup(g.partnerId)}
                  className="mb-2 flex items-center gap-3 w-full text-left rounded-md py-1 hover:bg-muted/40 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                    : <ChevronDown className="size-4 text-muted-foreground shrink-0" />}
                  <PartnerLogo shortName={g.shortName} />
                  <h3 className="text-lg font-bold flex-1">{g.label}</h3>
                  <span className="text-sm text-muted-foreground">{g.rows.length} {g.rows.length === 1 ? "contact" : "contacts"}</span>
                </button>
                {!isCollapsed && (
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[22%]">Name</TableHead>
                      <TableHead className="w-[14%]">Role</TableHead>
                      <TableHead className="w-[22%]">Email</TableHead>
                      <TableHead>Projects</TableHead>
                      <TableHead className="w-20" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {g.rows.map(({ node: c, depth }) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">
                          <span className="flex items-center" style={{ paddingLeft: depth * 22 }}>
                            {depth > 0 && <CornerDownRight className="size-3.5 mr-1.5 shrink-0 text-muted-foreground/50" />}
                            {c.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{c.role || <Dash />}</TableCell>
                        <TableCell className="text-muted-foreground text-xs break-all">
                          {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a> : <Dash />}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const cl = links.filter((l) => l.contact_id === c.id);
                            if (cl.length === 0) return <Dash />;
                            return (
                              <div className="flex flex-wrap gap-1">
                                {cl.map((l) => (
                                  <Badge key={l.id} variant="outline" className="text-xs font-normal" title={l.relationship ?? undefined}>
                                    {l.project_short_name || l.project_title}
                                    {l.is_applicant && <span className="ml-1 text-blue-600">•</span>}
                                  </Badge>
                                ))}
                              </div>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <RowActions onEdit={() => startEdit(c)} onDelete={() => handleDelete(c.id)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
