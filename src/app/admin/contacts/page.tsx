"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
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
import { Plus, Contact } from "lucide-react";
import {
  Dash, Field, LoadingState, ErrorBanner, FormShell, RowActions, PageHeader,
} from "@/components/admin/shared";

interface Partner {
  id: number;
  short_name: string | null;
  long_name: string | null;
}

interface PartnerContact {
  id: number;
  partner_id: number;
  name: string;
  role: string | null;
  email: string | null;
  partner_short_name: string | null;
  partner_long_name: string | null;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<PartnerContact[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [partnerId, setPartnerId] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [email, setEmail] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cRes, pRes] = await Promise.all([
        fetch("/api/partner-contacts"),
        fetch("/api/partners"),
      ]);
      if (!cRes.ok || !pRes.ok) throw new Error("Failed to fetch data");
      setContacts(await cRes.json());
      setPartners(await pRes.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setPartnerId(""); setName(""); setRole(""); setEmail("");
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(c: PartnerContact) {
    setPartnerId(String(c.partner_id));
    setName(c.name);
    setRole(c.role || "");
    setEmail(c.email || "");
    setEditId(c.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!partnerId) { setFormError("Please select a partner"); return; }
    if (!name.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    try {
      const body = editId
        ? { id: editId, name: name.trim(), role: role.trim() || null, email: email.trim() || null }
        : { partner_id: Number(partnerId), name: name.trim(), role: role.trim() || null, email: email.trim() || null };
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
    if (!await confirm({ message: "Delete this contact? This cannot be undone." })) return;
    const res = await fetch(`/api/partner-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to delete"); return; }
    load();
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
            </div>
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
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Partner</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs font-semibold">
                      {c.partner_short_name || c.partner_long_name || "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">{c.role || <Dash />}</TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {c.email ? <a href={`mailto:${c.email}`} className="text-blue-600 hover:underline">{c.email}</a> : <Dash />}
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
    </div>
  );
}
