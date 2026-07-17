"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Contact } from "lucide-react";
import {
  Field, LoadingState, ErrorBanner, FormShell, HoverActions, PageHeader,
} from "@/components/admin/shared";
import { buildContactTree, descendantIds, type TreeNode } from "@/lib/contact-tree";

const NONE = "none";

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

interface PartnerContact {
  id: number;
  partner_id: number;
  manager_id: number | null;
  name: string;
  role: string | null;
  email: string | null;
}

// One box in the organigram + its reports, nested with a connector line.
function OrgNode({
  node,
  onEdit,
  onDelete,
}: {
  node: TreeNode<PartnerContact>;
  onEdit: (c: PartnerContact) => void;
  onDelete: (id: number) => void;
}) {
  const c = node.node;
  return (
    <div>
      <div className="group flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{c.name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {c.role || "—"}
            {c.email ? ` · ${c.email}` : ""}
          </p>
        </div>
        <HoverActions onEdit={() => onEdit(c)} onDelete={() => onDelete(c.id)} />
      </div>
      {node.children.length > 0 && (
        <div className="ml-6 mt-3 space-y-3 border-l-2 border-border/60 pl-6">
          {node.children.map((ch) => (
            <OrgNode key={ch.node.id} node={ch} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PartnerContactsPage() {
  const { user } = useAuth();

  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");
  const [managerId, setManagerId] = useState(NONE);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const pRes = await fetch("/api/partners");
      if (!pRes.ok) throw new Error("Failed to load organization");
      const partners: Partner[] = await pRes.json();
      const mine = partners.find(
        (p) =>
          (p.short_name && p.short_name.toLowerCase() === user.id.toLowerCase()) ||
          p.short_name === user.organization
      );
      if (!mine) {
        setPartnerId(null);
        setContacts([]);
        setError("We couldn't find your organization.");
        return;
      }
      setPartnerId(mine.id);
      const cRes = await fetch(`/api/partner-contacts?partner_id=${mine.id}`);
      if (!cRes.ok) throw new Error("Failed to load contacts");
      setContacts(await cRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setName(""); setRole(""); setEmail(""); setManagerId(NONE);
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(c: PartnerContact) {
    setName(c.name);
    setRole(c.role || "");
    setEmail(c.email || "");
    setManagerId(c.manager_id != null ? String(c.manager_id) : NONE);
    setEditId(c.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!name.trim()) { setFormError("Name is required"); return; }
    if (!editId && partnerId == null) { setFormError("Organization not loaded yet"); return; }
    setSaving(true); setFormError(null);
    try {
      const manager_id = managerId === NONE ? null : Number(managerId);
      const body = editId
        ? { id: editId, name: name.trim(), role: role.trim() || null, email: email.trim() || null, manager_id }
        : { partner_id: partnerId, name: name.trim(), role: role.trim() || null, email: email.trim() || null, manager_id };
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

  // Manager picker: everyone except the contact itself and anyone it manages.
  const blocked = editId != null ? descendantIds(contacts, editId) : new Set<number>();
  const managerOptions = contacts.filter((c) => c.id !== editId && !blocked.has(c.id));
  const roots = buildContactTree(contacts);

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Contact Information" description="Keep your organization's contact people up to date">
        {!showForm && partnerId != null && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="size-3.5" /> Add contact
          </Button>
        )}
      </PageHeader>

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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
                <Select value={managerId} onValueChange={setManagerId}>
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
          </FormShell>
        )}

        {loading ? (
          <LoadingState />
        ) : partnerId == null ? null : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Contact className="size-8 opacity-30" />
            <p className="text-sm">No contacts added yet. Click below to add your first.</p>
          </div>
        ) : (
          <div className="max-w-2xl space-y-3">
            {roots.map((r) => (
              <OrgNode key={r.node.id} node={r} onEdit={startEdit} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
