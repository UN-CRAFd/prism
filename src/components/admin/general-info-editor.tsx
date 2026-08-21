"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAutosave, type SaveState } from "@/components/autosave";
import { cn, shortName } from "@/lib/utils";
import { Loader2, Plus, Trash2, Users, Coins, FileText, Pencil, Check } from "lucide-react";
import labels from "@/lib/labels";
import { optionValues } from "@/lib/options";
import { DESCRIPTION_MAX_CHARS } from "@/lib/limits";

// ── General Information editor ─────────────────────────────────────────────────
// The first project-document tab. Edits core project data (name, MPTFO number,
// status, funding, start date, duration, description) with debounced autosave,
// and manages the project↔contact links (applicants + project contacts) via the
// project_contacts join table. New contacts can be added to the org inline.

const g = labels.generalInfo;
const RELATIONSHIP_NONE = "__none__";
const GEO_SCOPE_NONE = "__none__";

// Editable project columns, kept as strings in local form state. Follows the FMP
// General Information flow: title, applicants, description, geographic scope,
// participating orgs & implementing partners, programme/project cost, dates.
// Thematic keywords and the marker fields are intentionally excluded.
const FIELD_KEYS = [
  "project_title", "mptfo_project_number", "status",
  "grant_size_usd", "project_start_date", "project_duration_months",
  "geographic_scope", "implementing_partners", "description",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Form = Record<FieldKey, string>;

const EMPTY_FORM: Form = {
  project_title: "", mptfo_project_number: "", status: "Ongoing",
  grant_size_usd: "", project_start_date: "", project_duration_months: "",
  geographic_scope: "", implementing_partners: "", description: "",
};

// A funding tranche in local form state. `_key` is a client-side row id (stable
// React key across edits); everything else mirrors the project_tranches columns
// as strings. The whole set is saved with one PUT to /api/project-tranches.
interface TrancheForm {
  _key: number;
  amount: string;
  tranche_date: string;
  comment: string;
}

// Order-preserving snapshot of the tranche set (ignores the client-side _key),
// used to detect changes for autosave — same idea as the SDG targets editor.
const tranchesSnapshot = (list: TrancheForm[]) =>
  JSON.stringify(list.map((t) => ({ amount: t.amount.trim(), tranche_date: t.tranche_date, comment: t.comment.trim() })));

// Add whole months to a YYYY-MM-DD date, returning YYYY-MM-DD. Computed in UTC so
// the string arithmetic never shifts across a day boundary from timezone offset.
function addMonthsISO(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + months);
  return base.toISOString().slice(0, 10);
}

interface ProjectContact {
  id: number;
  contact_id: number;
  relationship: string | null;
  is_applicant: boolean;
  name: string;
  role: string | null;
  email: string | null;
}

interface OrgContact { id: number; partner_id: number; name: string; role: string | null; email: string | null }

// A partner involved in the project (lead or editor) that the contact picker can
// attribute a contact to. `can_manage` is whether the current caller may
// create/link contacts under it (admins: all; partners: only their own org).
interface InvolvedPartner {
  id: number;
  short_name: string | null;
  long_name: string | null;
  is_lead: boolean;
  can_manage: boolean;
}

// The DB stores a single full `name`; the FMP applicant form splits it into
// first / last. Split on the first space (everything after it is the last name),
// and join them back with a single space, dropping any empty half.
function splitName(full: string): { first: string; last: string } {
  const trimmed = full.trim();
  const i = trimmed.indexOf(" ");
  if (i === -1) return { first: trimmed, last: "" };
  return { first: trimmed.slice(0, i), last: trimmed.slice(i + 1).trim() };
}
function joinName(first: string, last: string): string {
  return [first.trim(), last.trim()].filter(Boolean).join(" ");
}

function coerce(key: FieldKey, value: string): unknown {
  switch (key) {
    case "grant_size_usd": return value.trim() === "" ? null : Number(value);
    case "project_duration_months": return value.trim() === "" ? null : Number(value);
    case "project_start_date":
    case "mptfo_project_number":
    case "geographic_scope":
    case "implementing_partners":
    case "description": return value.trim() === "" ? null : value;
    default: return value; // project_title (NOT NULL), status (enum)
  }
}

export function GeneralInfoAdminEditor({
  projectId,
  onSaveStateChange,
  isAdmin = true,
  readOnly = false,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  // The MPTFO project number is admin-owned; partners can view but not edit it.
  isAdmin?: boolean;
  // When the prodoc is view-only, the blue instructions box is hidden (the
  // parent shows the amber view-only bar instead).
  readOnly?: boolean;
}) {
  const confirm = useConfirm();

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [orgContacts, setOrgContacts] = useState<OrgContact[]>([]);
  // Partners a new/linked contact can be attributed to (lead + editors), and the
  // one currently selected in the add-contact "belongs to" picker.
  const [involvedPartners, setInvolvedPartners] = useState<InvolvedPartner[]>([]);
  const [contactPartnerId, setContactPartnerId] = useState<number | null>(null);
  const [tranches, setTranches] = useState<TrancheForm[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<Form>(EMPTY_FORM);
  formRef.current = form;
  const contactsRef = useRef<ProjectContact[]>([]);
  contactsRef.current = contacts;
  const savedRef = useRef<Form>(EMPTY_FORM);

  // Tranches: current set (ref for the autosave flush), the last-saved snapshot,
  // and a monotonic counter for stable client-side row keys.
  const tranchesRef = useRef<TrancheForm[]>([]);
  tranchesRef.current = tranches;
  const savedTranchesRef = useRef<string>("[]");
  const trancheKeyRef = useRef(0);

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
          geographic_scope: p.geographic_scope ?? "",
          implementing_partners: p.implementing_partners ?? "",
          description: p.description ?? "",
        };
        setForm(loaded);
        savedRef.current = { ...loaded };
        setPartnerId(p.partner_id);

        const [linkRes, orgRes, tranchesRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          // Involved partners (lead + editors) + the contacts the caller may see.
          fetch(`/api/partner-contacts?project_id=${projectId}`),
          fetch(`/api/project-tranches?project_id=${projectId}`),
        ]);
        if (!linkRes.ok || !orgRes.ok || !tranchesRes.ok) throw new Error("Failed to load project data");
        if (cancelled) return;
        setContacts(await linkRes.json());
        const orgData: { partners: InvolvedPartner[]; contacts: OrgContact[] } = await orgRes.json();
        setOrgContacts(orgData.contacts);
        setInvolvedPartners(orgData.partners);
        // Default the "belongs to" picker to the first partner the caller can
        // manage (their own org for partners; the lead for admins).
        const manageable = orgData.partners.filter((pt) => pt.can_manage);
        setContactPartnerId(manageable[0]?.id ?? orgData.partners[0]?.id ?? null);

        const trancheRows: { amount: string | number | null; tranche_date: string | null; comment: string | null }[] =
          await tranchesRes.json();
        const loadedTranches: TrancheForm[] = trancheRows.map((t) => ({
          _key: ++trancheKeyRef.current,
          amount: t.amount != null ? String(t.amount) : "",
          tranche_date: t.tranche_date ? String(t.tranche_date).slice(0, 10) : "",
          comment: t.comment ?? "",
        }));
        setTranches(loadedTranches);
        savedTranchesRef.current = tranchesSnapshot(loadedTranches);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Project field + tranches autosave ───────────────────────────────────
  // One debounced flush covers both the project columns and the tranche set, so
  // a single save indicator reflects everything on this tab. Each half only
  // writes when its own snapshot changed.
  const flush = useCallback(async () => {
    setError(null);
    // Project columns.
    const snapshot = { ...formRef.current };
    const payload: Record<string, unknown> = {};
    for (const key of FIELD_KEYS) {
      if (snapshot[key] !== savedRef.current[key]) payload[key] = coerce(key, snapshot[key]);
    }
    if (Object.keys(payload).length > 0) {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({}));
        throw new Error((error as string) || "Failed to save");
      }
      for (const key of FIELD_KEYS) savedRef.current[key] = snapshot[key];
    }

    // Tranches (whole-set replace). Drop rows that are entirely blank.
    const curTranches = tranchesRef.current;
    const tSnap = tranchesSnapshot(curTranches);
    if (tSnap !== savedTranchesRef.current) {
      // Guard: no tranche may fall outside the project period. Block the whole
      // tranche write (project columns above already saved) until it's fixed.
      const startBound = snapshot.project_start_date || null;
      const dur = snapshot.project_duration_months.trim() === "" ? null : Number(snapshot.project_duration_months);
      const endBound = startBound && dur != null && Number.isFinite(dur) ? addMonthsISO(startBound, dur) : null;
      const outOfRange = curTranches.some((t) =>
        t.tranche_date !== "" &&
        ((startBound && t.tranche_date < startBound) || (endBound && t.tranche_date > endBound))
      );
      if (outOfRange) {
        setError(
          labels.generalInfo.tranches.dateOutOfRange
            .replace("{start}", startBound ?? "—")
            .replace("{end}", endBound ?? "—")
        );
        throw new Error("Tranche date out of range");
      }
      const outgoing = curTranches
        .filter((t) => t.amount.trim() !== "" || t.tranche_date !== "" || t.comment.trim() !== "")
        .map((t) => ({
          amount: t.amount.trim() === "" ? 0 : Number(t.amount),
          tranche_date: t.tranche_date || null,
          comment: t.comment.trim() || null,
        }));
      const res = await fetch("/api/project-tranches", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, tranches: outgoing }),
      });
      if (!res.ok) throw new Error("Failed to save tranches");
      savedTranchesRef.current = tSnap;
    }
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const setField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    schedule();
  };

  // ── Tranche mutations (debounced via the shared autosave) ────────────────
  // Adding a tranche splits the grant equally across all tranches: one tranche
  // gets the full grant, two get half each, and so on. Dates/comments are kept;
  // only the amounts are (re)distributed. Rounding remainder lands on the last
  // row so the amounts sum to the grant exactly. With no grant set, amounts are
  // left blank for manual entry.
  const addTranche = () => {
    setTranches((prev) => {
      const next = [...prev, { _key: ++trancheKeyRef.current, amount: "", tranche_date: "", comment: "" }];
      const grant = formRef.current.grant_size_usd.trim() === "" ? null : Number(formRef.current.grant_size_usd);
      if (grant == null || !Number.isFinite(grant)) return next;
      const per = Math.round((grant / next.length) * 100) / 100;
      return next.map((t, i) => ({
        ...t,
        amount: String(i === next.length - 1 ? Math.round((grant - per * (next.length - 1)) * 100) / 100 : per),
      }));
    });
    schedule();
  };
  const setTranche = (key: number, patch: Partial<Omit<TrancheForm, "_key">>) => {
    setTranches((prev) => prev.map((t) => (t._key === key ? { ...t, ...patch } : t)));
    schedule();
  };
  const removeTranche = (key: number) => {
    setTranches((prev) => prev.filter((t) => t._key !== key));
    schedule();
  };

  const trancheTotal = tranches.reduce((sum, t) => sum + (t.amount.trim() === "" ? 0 : Number(t.amount) || 0), 0);
  const grantSize = form.grant_size_usd.trim() === "" ? null : Number(form.grant_size_usd);

  // Valid tranche-date window: project start → project end (start + duration).
  // Either bound is only enforced once known; ISO date strings compare
  // chronologically, so a lexicographic <, > is a date comparison.
  const projectStartDate = form.project_start_date || null;
  const durationForRange = form.project_duration_months.trim() === "" ? null : Number(form.project_duration_months);
  const projectEndDate =
    projectStartDate && durationForRange != null && Number.isFinite(durationForRange)
      ? addMonthsISO(projectStartDate, durationForRange)
      : null;
  const trancheDateInvalid = (dateStr: string) => {
    if (!dateStr) return false;
    if (projectStartDate && dateStr < projectStartDate) return true;
    if (projectEndDate && dateStr > projectEndDate) return true;
    return false;
  };
  const hasInvalidTrancheDate = tranches.some((t) => trancheDateInvalid(t.tranche_date));
  const tranchesMatchGrant = grantSize != null && Math.abs(trancheTotal - grantSize) < 0.005;
  const fmtUsd = (n: number) =>
    n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 2 });

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
    // Create the contact under the partner chosen in the "belongs to" picker
    // (falls back to the project lead).
    const owningPartnerId = contactPartnerId ?? partnerId;
    if (!owningPartnerId) return;
    setAddingContact(true); setError(null);
    try {
      const res = await fetch("/api/partner-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ partner_id: owningPartnerId, name }),
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

  // Edit the contact's identity (name / role / email) on the shared
  // partner_contacts master record. Typing updates local state; the PATCH fires
  // on blur. The endpoint rewrites all three fields at once, so we always send
  // the full current identity to avoid nulling the untouched ones.
  function editContactField(id: number, patch: Partial<Pick<ProjectContact, "name" | "role" | "email">>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function commitContactIdentity(id: number) {
    const c = contactsRef.current.find((x) => x.id === id);
    if (!c) return;
    if (!c.name.trim()) { setError("Contact name cannot be empty."); return; }
    setError(null);
    const res = await fetch("/api/partner-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.contact_id, name: c.name.trim(), role: c.role, email: c.email }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to update contact"); return; }
    // Keep the linked-contact combobox list in sync with the edited identity.
    setOrgContacts((prev) => prev.map((oc) => (oc.id === c.contact_id ? { ...oc, name: c.name.trim(), role: c.role, email: c.email } : oc)));
  }

  async function unlinkContact(id: number) {
    const c = contacts.find((x) => x.id === id);
    if (!await confirm({ message: `Remove ${c?.name ?? "this contact"} from the project?`, confirmLabel: "Remove", variant: "default" })) return;
    setError(null);
    const res = await fetch(`/api/project-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to remove contact"); return; }
    setContacts((prev) => prev.filter((x) => x.id !== id));
  }

  // Candidate contacts to link: not already linked, and (when a "belongs to"
  // partner is selected) restricted to that partner so the create-new action
  // lands under the right org.
  const comboItems: ComboboxItem[] = orgContacts
    .filter((oc) => !contacts.some((c) => c.contact_id === oc.id))
    .filter((oc) => contactPartnerId == null || oc.partner_id === contactPartnerId)
    .map((oc) => ({ id: oc.id, label: oc.name, hint: oc.role ?? undefined }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  return (
    // FMP General-Information order via flex `order-*`: the cards are authored
    // below in a different sequence, but render as Title/data → Applicants →
    // Programme & project cost (tranches).
    <div className="flex flex-col gap-6">
      {error && (
        <div className="order-first rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="order-first rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {labels.tabInstructions.general}
        </div>
      )}

      {/* Project data (Title, dates, cost inputs, geographic scope, implementing
          partners, description) — FMP order: first */}
      <div className="order-1 rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.detailsHeading}</h3>
        </div>

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
              // The MPTFO project number is admin-owned; partners see it read-only.
              disabled={!isAdmin}
              title={!isAdmin ? "The MPTFO project number is managed by the CRAF'd Secretariat." : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.status}</label>
            <Select value={form.status} onValueChange={(v) => setField("status", v)}>
              <SelectTrigger className="w-full text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {optionValues("projectStatus").map((s) => (
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

          {/* Duration + computed end date: the second box is read-only and shows
              start date + duration (projectEndDate, computed above). */}
          <div className="grid grid-cols-2 gap-2">
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
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{g.fields.expectedEndDate}</label>
              <Input
                type="text"
                readOnly
                tabIndex={-1}
                value={projectEndDate ? projectEndDate.split("-").reverse().join("/") : ""}
                placeholder="—"
                className="text-sm bg-muted/40 text-muted-foreground cursor-default"
                aria-label={g.fields.expectedEndDate}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.geographicScope}</label>
            <Select
              value={form.geographic_scope || GEO_SCOPE_NONE}
              onValueChange={(v) => setField("geographic_scope", v === GEO_SCOPE_NONE ? "" : v)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder={g.placeholders.geographicScope} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={GEO_SCOPE_NONE}>{g.placeholders.geographicScope}</SelectItem>
                {optionValues("geographicScope").map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Same row as geographic scope, filling all remaining columns. */}
          <div className="space-y-1.5 col-span-full sm:col-span-2 lg:col-span-4">
            <label className="text-xs text-muted-foreground">{g.fields.implementingPartners}</label>
            <Input
              value={form.implementing_partners}
              onChange={(e) => setField("implementing_partners", e.target.value)}
              placeholder={g.placeholders.implementingPartners}
              className="text-sm w-full"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">{g.fields.description}</label>
          <RichTextEditor
            value={form.description}
            onChange={(html) => setField("description", html)}
            placeholder={g.placeholders.description}
            disabled={readOnly}
            maxChars={DESCRIPTION_MAX_CHARS}
          />
        </div>
      </div>

      {/* Programme & project cost — funding tranches (FMP order: last) */}
      <div className="order-3 rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.tranches.heading}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{g.tranches.description}</p>

        {tranches.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {g.tranches.empty}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-44">{g.tranches.columns.amount}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-44">{g.tranches.columns.date}</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground">{g.tranches.columns.comment}</th>
                  <th className="w-12 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {tranches.map((t, i) => (
                  <tr key={t._key} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="number" min="0" step="0.01"
                        value={t.amount}
                        onChange={(e) => setTranche(t._key, { amount: e.target.value })}
                        placeholder={`${g.tranches.columns.amount}`}
                        className="h-8 text-sm text-right tabular-nums"
                        aria-label={`${g.tranches.columns.amount} ${i + 1}`}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        type="date"
                        value={t.tranche_date}
                        min={projectStartDate ?? undefined}
                        max={projectEndDate ?? undefined}
                        onChange={(e) => setTranche(t._key, { tranche_date: e.target.value })}
                        className={cn(
                          "h-8 text-sm",
                          trancheDateInvalid(t.tranche_date) && "border-destructive focus-visible:ring-destructive"
                        )}
                        aria-invalid={trancheDateInvalid(t.tranche_date)}
                        aria-label={`${g.tranches.columns.date} ${i + 1}`}
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <Input
                        value={t.comment}
                        onChange={(e) => setTranche(t._key, { comment: e.target.value })}
                        placeholder={g.tranches.commentPlaceholder}
                        className="h-8 text-sm"
                        aria-label={`${g.tranches.columns.comment} ${i + 1}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right align-middle">
                      <button
                        onClick={() => removeTranche(t._key)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove tranche"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="px-4 py-3 align-middle">
                    <span className="text-sm font-semibold tabular-nums">{fmtUsd(trancheTotal)}</span>
                  </td>
                  <td colSpan={3} className="px-4 py-3 align-middle text-right">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                        grantSize == null
                          ? "bg-muted text-muted-foreground"
                          : tranchesMatchGrant
                          ? "bg-green-100 text-green-800"
                          : "bg-amber-100 text-amber-800"
                      )}
                    >
                      {g.tranches.total}: {fmtUsd(trancheTotal)}
                      {grantSize != null && ` / ${fmtUsd(grantSize)}`}
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {grantSize != null && tranches.length > 0 && !tranchesMatchGrant && (
          <p className="text-xs text-amber-600">
            {g.tranches.mismatch
              .replace("{grant}", fmtUsd(grantSize))
              .replace("{total}", fmtUsd(trancheTotal))}
          </p>
        )}

        {hasInvalidTrancheDate && (
          <p className="text-xs text-destructive">
            {g.tranches.dateOutOfRange
              .replace("{start}", projectStartDate ?? "—")
              .replace("{end}", projectEndDate ?? "—")}
          </p>
        )}

        <Button onClick={addTranche} size="sm" variant="outline" className="shrink-0">
          <Plus className="size-4 mr-1" />{g.tranches.add}
        </Button>
      </div>

      {/* Applicants — project contacts (FMP order: right after Title/data) */}
      <div className="order-2 rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.contactsHeading}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-2xl">
          {/* "Belongs to" picker — only shown when more than one partner is
              involved (lead + editors). New contacts are created under, and
              existing contacts filtered to, the selected partner. */}
          {involvedPartners.length > 1 && (
            <Select
              value={contactPartnerId != null ? String(contactPartnerId) : ""}
              onValueChange={(v) => setContactPartnerId(Number(v))}
            >
              <SelectTrigger className="w-56 text-sm shrink-0">
                <SelectValue placeholder="Belongs to…" />
              </SelectTrigger>
              <SelectContent>
                {involvedPartners.map((pt) => (
                  <SelectItem key={pt.id} value={String(pt.id)} disabled={!pt.can_manage}>
                    {shortName(pt.short_name) || pt.long_name || `#${pt.id}`}
                    {pt.is_lead ? " (lead)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="flex-1 min-w-[16rem]">
            <Combobox
              items={comboItems}
              placeholder={g.contactSearchPlaceholder}
              onSelect={handleContactSelect}
              onCreate={handleContactCreate}
              createLabel={g.createContact}
              busy={addingContact}
            />
          </div>
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
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {contacts.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/20">
                    <td className="px-4 py-3 align-middle">
                      {editingContactId === c.id ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={splitName(c.name).first}
                            onChange={(e) => editContactField(c.id, { name: joinName(e.target.value, splitName(c.name).last) })}
                            onBlur={() => commitContactIdentity(c.id)}
                            placeholder={g.contactFirstName}
                            className="h-8 flex-1 min-w-0 text-sm font-medium"
                            aria-label={g.contactFirstName}
                            autoFocus
                          />
                          <Input
                            value={splitName(c.name).last}
                            onChange={(e) => editContactField(c.id, { name: joinName(splitName(c.name).first, e.target.value) })}
                            onBlur={() => commitContactIdentity(c.id)}
                            placeholder={g.contactLastName}
                            className="h-8 flex-1 min-w-0 text-sm font-medium"
                            aria-label={g.contactLastName}
                          />
                          <Input
                            value={c.role ?? ""}
                            onChange={(e) => editContactField(c.id, { role: e.target.value || null })}
                            onBlur={() => commitContactIdentity(c.id)}
                            placeholder={g.contactRole}
                            className="h-8 flex-1 min-w-0 text-sm"
                            aria-label={g.contactRole}
                          />
                          <Input
                            value={c.email ?? ""}
                            onChange={(e) => editContactField(c.id, { email: e.target.value || null })}
                            onBlur={() => commitContactIdentity(c.id)}
                            placeholder={g.contactEmail}
                            type="email"
                            className="h-8 flex-1 min-w-0 text-sm"
                            aria-label={g.contactEmail}
                          />
                        </div>
                      ) : (
                        <p className="truncate">
                          <span className="font-medium">{c.name}</span>
                          {(c.role || c.email) && (
                            <span className="text-muted-foreground">
                              {" · "}{[c.role, c.email].filter(Boolean).join(" · ")}
                            </span>
                          )}
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
                          {optionValues("projectRole").map((r) => (
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
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => {
                            if (editingContactId === c.id) {
                              commitContactIdentity(c.id);
                              setEditingContactId(null);
                            } else {
                              setEditingContactId(c.id);
                            }
                          }}
                          className={cn(
                            "transition-colors",
                            editingContactId === c.id
                              ? "text-green-600 hover:text-green-700"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                          aria-label={editingContactId === c.id ? "Done editing contact" : "Edit contact"}
                          title={editingContactId === c.id ? "Done" : "Edit"}
                        >
                          {editingContactId === c.id ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
                        </button>
                        <button
                          onClick={() => unlinkContact(c.id)}
                          className="text-muted-foreground hover:text-destructive transition-colors"
                          aria-label="Remove contact"
                          title="Remove"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
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
