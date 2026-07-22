"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAutosave, type SaveState } from "@/components/autosave";
import { Loader2, Trash2, Users } from "lucide-react";
import labels from "@/lib/labels.json";

// ── General Information editor ─────────────────────────────────────────────────
// The first project-document tab. Edits core project data (name, MPTFO number,
// status, funding, start date, duration, description) with debounced autosave,
// and manages the project↔contact links (applicants + project contacts) via the
// project_contacts join table. New contacts can be added to the org inline.

const g = labels.generalInfo;
const RELATIONSHIP_NONE = "__none__";

// Editable project columns, kept as strings in local form state.
const FIELD_KEYS = [
  "project_title", "mptfo_project_number", "status",
  "grant_size_usd", "project_start_date", "project_duration_months", "description",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Form = Record<FieldKey, string>;

const EMPTY_FORM: Form = {
  project_title: "", mptfo_project_number: "", status: "Ongoing",
  grant_size_usd: "", project_start_date: "", project_duration_months: "", description: "",
};

interface ProjectContact {
  id: number;
  contact_id: number;
  relationship: string | null;
  is_applicant: boolean;
  name: string;
  role: string | null;
  email: string | null;
}

interface OrgContact { id: number; name: string; role: string | null; email: string | null }

function coerce(key: FieldKey, value: string): unknown {
  switch (key) {
    case "grant_size_usd": return value.trim() === "" ? null : Number(value);
    case "project_duration_months": return value.trim() === "" ? null : Number(value);
    case "project_start_date":
    case "mptfo_project_number":
    case "description": return value.trim() === "" ? null : value;
    default: return value; // project_title (NOT NULL), status (enum)
  }
}

export function GeneralInfoAdminEditor({
  projectId,
  onSaveStateChange,
  readOnly = false,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  // isAdmin retained on the type for callers; the rate (the only admin-gated
  // field) now lives in the Expenditure tab, so nothing here branches on it.
  isAdmin?: boolean;
  // When the prodoc is view-only, the blue instructions box is hidden (the
  // parent shows the amber view-only bar instead).
  readOnly?: boolean;
}) {
  const confirm = useConfirm();

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [orgContacts, setOrgContacts] = useState<OrgContact[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<Form>(EMPTY_FORM);
  formRef.current = form;
  const savedRef = useRef<Form>(EMPTY_FORM);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (!projRes.ok) throw new Error("Failed to load project");
        const p = await projRes.json();
        if (cancelled) return;
        const loaded: Form = {
          project_title: p.project_title ?? "",
          mptfo_project_number: p.mptfo_project_number ?? "",
          status: p.status ?? "Ongoing",
          grant_size_usd: p.grant_size_usd != null ? String(p.grant_size_usd) : "",
          project_start_date: p.project_start_date ? String(p.project_start_date).slice(0, 10) : "",
          project_duration_months: p.project_duration_months != null ? String(p.project_duration_months) : "",
          description: p.description ?? "",
        };
        setForm(loaded);
        savedRef.current = { ...loaded };
        setPartnerId(p.partner_id);

        const [linkRes, orgRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          fetch(`/api/partner-contacts?partner_id=${p.partner_id}`),
        ]);
        if (!linkRes.ok || !orgRes.ok) throw new Error("Failed to load contacts");
        if (cancelled) return;
        setContacts(await linkRes.json());
        setOrgContacts(await orgRes.json());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Project field autosave ──────────────────────────────────────────────
  const flush = useCallback(async () => {
    const snapshot = { ...formRef.current };
    const payload: Record<string, unknown> = {};
    for (const key of FIELD_KEYS) {
      if (snapshot[key] !== savedRef.current[key]) payload[key] = coerce(key, snapshot[key]);
    }
    if (Object.keys(payload).length === 0) return;
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error("Failed to save");
    for (const key of FIELD_KEYS) savedRef.current[key] = snapshot[key];
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const setField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    schedule();
  };

  // ── Contacts CRUD (immediate) ───────────────────────────────────────────
  async function linkContact(contactId: number) {
    const res = await fetch("/api/project-contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, contact_id: contactId }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to link contact"); return; }
    const created: ProjectContact = await res.json();
    setContacts((prev) => [...prev, created]);
  }

  async function handleContactSelect(item: ComboboxItem) {
    setAddingContact(true); setError(null);
    try { await linkContact(item.id); }
    finally { setAddingContact(false); }
  }

  async function handleContactCreate(name: string) {
    if (!partnerId) return;
    setAddingContact(true); setError(null);
    try {
      const res = await fetch("/api/partner-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: partnerId, name }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add contact"); }
      const created: OrgContact = await res.json();
      setOrgContacts((prev) => [...prev, created]);
      await linkContact(created.id);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingContact(false); }
  }

  async function patchContact(id: number, patch: Partial<Pick<ProjectContact, "relationship" | "is_applicant">>) {
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
    setError(null);
    const res = await fetch("/api/project-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to update contact"); }
  }

  async function unlinkContact(id: number) {
    const c = contacts.find((x) => x.id === id);
    if (!await confirm({ message: `Remove ${c?.name ?? "this contact"} from the project?`, confirmLabel: "Remove", variant: "default" })) return;
    setError(null);
    const res = await fetch(`/api/project-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to remove contact"); return; }
    setContacts((prev) => prev.filter((x) => x.id !== id));
  }

  const comboItems: ComboboxItem[] = orgContacts
    .filter((oc) => !contacts.some((c) => c.contact_id === oc.id))
    .map((oc) => ({ id: oc.id, label: oc.name, hint: oc.role ?? undefined }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {labels.tabInstructions.general}
        </div>
      )}

      {/* Project data */}
      <div className="rounded-xl border bg-card p-6 space-y-5">
        <h3 className="text-sm font-semibold">{g.detailsHeading}</h3>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{g.fields.projectTitle}</label>
          <Input
            value={form.project_title}
            onChange={(e) => setField("project_title", e.target.value)}
            placeholder={g.placeholders.projectTitle}
            className="text-sm"
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.mptfoNumber}</label>
            <Input
              value={form.mptfo_project_number}
              onChange={(e) => setField("mptfo_project_number", e.target.value)}
              placeholder={g.placeholders.mptfoNumber}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.status}</label>
            <Select value={form.status} onValueChange={(v) => setField("status", v)}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {g.statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.grantSize}</label>
            <Input
              type="number" min="0" step="0.01"
              value={form.grant_size_usd}
              onChange={(e) => setField("grant_size_usd", e.target.value)}
              placeholder={g.placeholders.grantSize}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.startDate}</label>
            <Input
              type="date"
              value={form.project_start_date}
              onChange={(e) => setField("project_start_date", e.target.value)}
              className="text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.durationMonths}</label>
            <Input
              type="number" min="0" step="1"
              value={form.project_duration_months}
              onChange={(e) => setField("project_duration_months", e.target.value)}
              placeholder={g.placeholders.durationMonths}
              className="text-sm"
            />
          </div>

        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{g.fields.description}</label>
          <Textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            placeholder={g.placeholders.description}
            className="min-h-[120px] resize-y text-sm leading-relaxed"
          />
        </div>
      </div>

      {/* Contacts */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.contactsHeading}</h3>
        </div>

        <div className="max-w-xl">
          <Combobox
            items={comboItems}
            placeholder={g.contactSearchPlaceholder}
            onSelect={handleContactSelect}
            onCreate={handleContactCreate}
            createLabel={g.createContact}
            busy={addingContact}
          />
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {g.emptyContacts}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{g.columns.contact}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-56">{g.columns.relationship}</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-muted-foreground w-28">{g.columns.applicant}</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 align-middle">
                      <p className="font-medium">{c.name}</p>
                      {(c.role || c.email) && (
                        <p className="text-xs text-muted-foreground">
                          {[c.role, c.email].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Select
                        value={c.relationship ?? RELATIONSHIP_NONE}
                        onValueChange={(v) => patchContact(c.id, { relationship: v === RELATIONSHIP_NONE ? null : v })}
                      >
                        <SelectTrigger className="w-full h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={RELATIONSHIP_NONE}>{g.relationshipNone}</SelectItem>
                          {g.relationshipOptions.map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3 text-center align-middle">
                      <input
                        type="checkbox"
                        checked={c.is_applicant}
                        onChange={(e) => patchContact(c.id, { is_applicant: e.target.checked })}
                        className="size-4 accent-foreground cursor-pointer"
                        aria-label={g.applicantLabel}
                      />
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <button
                        onClick={() => unlinkContact(c.id)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove contact"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
