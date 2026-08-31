"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAutosave, OverLimitError, type SaveState } from "@/components/autosave";
import { richTextLength } from "@/lib/richtext";
import { cn, shortName } from "@/lib/utils";
import { Loader2, Plus, Trash2, Users, Coins, FileText, Pencil, Check, X, AlertTriangle } from "lucide-react";
import labels from "@/lib/labels";
import { optionValues } from "@/lib/options";
import { DESCRIPTION_MAX_CHARS } from "@/lib/limits";
import { InfoPopover } from "@/components/ui/info-popover";

const ORG_NAME_MAX = 300;

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
  "geographic_scope", "description",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Form = Record<FieldKey, string>;

const EMPTY_FORM: Form = {
  project_title: "", mptfo_project_number: "", status: "Ongoing",
  grant_size_usd: "", project_start_date: "", project_duration_months: "",
  geographic_scope: "", description: "",
};

// A tranche matrix cell in local form state: one (organization_id × tranche_number)
// position. The whole set is saved with one PUT to /api/project-tranche-cells.
interface CellForm {
  organization_id: number;
  tranche_number: number;
  amount: string;
  date_description: string;
}

const cellsSnapshot = (cells: CellForm[], count: number) =>
  JSON.stringify({
    count,
    cells: cells.map((c) => ({
      organization_id: c.organization_id,
      tranche_number: c.tranche_number,
      amount: c.amount.trim(),
      date_description: c.date_description.trim(),
    })),
  });

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
  organization: string | null;
  role: string | null;
  email: string | null;
}

interface OrgContact { id: number; partner_id: number; name: string; organization: string | null; role: string | null; email: string | null }
interface OrgRow { id: number; name: string }

// A partner involved in the project (lead or editor) that the contact picker can

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

// Parses a user-entered amount in US format (commas = thousands separators,
// period = decimal). Strips commas then parses. Returns NaN for empty/invalid input.
function parseAmount(s: string): number {
  const t = s.trim();
  if (!t) return NaN;
  return parseFloat(t.replace(/,/g, ""));
}

// US number format: comma as thousands separator, period as decimal.
function formatUS(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function coerce(key: FieldKey, value: string): unknown {
  switch (key) {
    case "grant_size_usd": return value.trim() === "" ? null : parseAmount(value);
    case "project_duration_months": return value.trim() === "" ? null : Number(value);
    case "project_start_date":
    case "mptfo_project_number":
    case "geographic_scope":
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

  const [trancheCells, setTrancheCells] = useState<CellForm[]>([]);
  const [trancheCount, setTrancheCount] = useState(1);
  const [focusedCellKey, setFocusedCellKey] = useState<string | null>(null);
  const [addingContact, setAddingContact] = useState(false);
  const [pendingContactName, setPendingContactName] = useState<string | null>(null);
  const [pendingContactEmail, setPendingContactEmail] = useState("");
  const [pendingContactOrg, setPendingContactOrg] = useState("");
  const [pendingContactRole, setPendingContactRole] = useState("");
  const [participatingOrgs, setParticipatingOrgs] = useState<OrgRow[]>([]);
  const [implementingOrgs, setImplementingOrgs] = useState<OrgRow[]>([]);
  const [newParticipatingOrg, setNewParticipatingOrg] = useState("");
  const [newImplementingOrg, setNewImplementingOrg] = useState("");
  const [editingOrgId, setEditingOrgId] = useState<number | null>(null);
  const [editingOrgName, setEditingOrgName] = useState("");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [grantFocused, setGrantFocused] = useState(false);

  // Combined, deduplicated list of org names from both participating and
  // implementing lists — used to seed the organisation Combobox on contact forms.
  const orgSuggestions = useMemo<ComboboxItem[]>(() => {
    const seen = new Set<string>();
    const result: ComboboxItem[] = [];
    let id = 0;
    for (const o of [...participatingOrgs, ...implementingOrgs]) {
      if (!seen.has(o.name)) {
        seen.add(o.name);
        result.push({ id: id++, label: o.name });
      }
    }
    return result.sort((a, b) => a.label.localeCompare(b.label));
  }, [participatingOrgs, implementingOrgs]);

  // All project organisations in display order — used as matrix row dimension.
  const allOrgs = useMemo(
    () => [...participatingOrgs, ...implementingOrgs],
    [participatingOrgs, implementingOrgs]
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<Form>(EMPTY_FORM);
  formRef.current = form;
  const contactsRef = useRef<ProjectContact[]>([]);
  contactsRef.current = contacts;
  const savedRef = useRef<Form>(EMPTY_FORM);

  // Tranche cells: current set (ref for the autosave flush) and the last-saved snapshot.
  const trancheCellsRef = useRef<CellForm[]>([]);
  trancheCellsRef.current = trancheCells;
  const savedCellsRef = useRef<string>('{"count":1,"cells":[]}');
  const allOrgsRef = useRef<OrgRow[]>([]);
  allOrgsRef.current = allOrgs;
  const participatingOrgsRef = useRef<OrgRow[]>([]);
  participatingOrgsRef.current = participatingOrgs;
  const trancheCountRef = useRef(1);
  trancheCountRef.current = trancheCount;

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
          description: p.description ?? "",
        };
        setForm(loaded);
        savedRef.current = { ...loaded };
        setPartnerId(p.partner_id);

        const [linkRes, orgRes, cellsRes, porgsRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          // Involved partners (lead + editors) + the contacts the caller may see.
          fetch(`/api/partner-contacts?project_id=${projectId}`),
          fetch(`/api/project-tranche-cells?project_id=${projectId}`),
          fetch(`/api/project-organizations?project_id=${projectId}`),
        ]);
        if (!linkRes.ok || !orgRes.ok || !cellsRes.ok || !porgsRes.ok) throw new Error("Failed to load project data");
        if (cancelled) return;
        setContacts(await linkRes.json());
        const orgData: { contacts: OrgContact[] } = await orgRes.json();
        setOrgContacts(orgData.contacts);
        const orgRows: (OrgRow & { type: string })[] = await porgsRes.json();
        setParticipatingOrgs(orgRows.filter((o) => o.type === "participating").map(({ id, name }) => ({ id, name })));
        setImplementingOrgs(orgRows.filter((o) => o.type === "implementing").map(({ id, name }) => ({ id, name })));

        const rawCells: { organization_id: number; tranche_number: number; amount: string | number | null; date_description: string | null }[] =
          await cellsRes.json();
        const loadedCells: CellForm[] = rawCells.map((c) => ({
          organization_id: c.organization_id,
          tranche_number: c.tranche_number,
          amount: c.amount != null && Number(c.amount) !== 0 ? String(c.amount) : "",
          date_description: c.date_description ?? "",
        }));
        const maxTranche = rawCells.reduce((m, c) => Math.max(m, c.tranche_number), 0);
        const loadedCount = Math.max(maxTranche, 1);
        setTrancheCells(loadedCells);
        setTrancheCount(loadedCount);
        savedCellsRef.current = cellsSnapshot(loadedCells, loadedCount);
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
    // Project columns. Skip description if it's over the limit; other fields
    // still save through so only the over-limit field is held back.
    const snapshot = { ...formRef.current };
    const payload: Record<string, unknown> = {};
    const savedKeys: FieldKey[] = [];
    let descriptionOverLimit = false;
    for (const key of FIELD_KEYS) {
      if (snapshot[key] === savedRef.current[key]) continue;
      if (key === "description" && richTextLength(snapshot[key]) > DESCRIPTION_MAX_CHARS) {
        descriptionOverLimit = true;
        continue;
      }
      payload[key] = coerce(key, snapshot[key]);
      savedKeys.push(key);
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
      for (const key of savedKeys) savedRef.current[key] = snapshot[key];
    }

    // Tranche cells (whole-set replace). Always write every org×tranche position,
    // including blank ones, so the column count survives a reload without any data.
    const curCells = trancheCellsRef.current;
    const curParticipatingOrgs = participatingOrgsRef.current;
    const curCount = trancheCountRef.current;
    const cSnap = cellsSnapshot(curCells, curCount);
    if (cSnap !== savedCellsRef.current) {
      const outgoing = curParticipatingOrgs.flatMap((org) =>
        Array.from({ length: curCount }, (_, i) => {
          const tn = i + 1;
          const cell = curCells.find((c) => c.organization_id === org.id && c.tranche_number === tn);
          return {
            organization_id: org.id,
            tranche_number: tn,
            amount: cell && cell.amount.trim() !== "" ? (parseAmount(cell.amount) || 0) : 0,
            date_description: cell?.date_description.trim() || null,
          };
        })
      );
      const res = await fetch("/api/project-tranche-cells", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, cells: outgoing }),
      });
      if (!res.ok) throw new Error("Failed to save tranche cells");
      savedCellsRef.current = cSnap;
    }
    if (descriptionOverLimit) throw new OverLimitError();
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const setField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    schedule();
  };

  // ── Tranche matrix mutations (debounced via the shared autosave) ──────────
  const setCell = (orgId: number, tranche: number, patch: { amount?: string; date_description?: string }) => {
    setTrancheCells((prev) => {
      const idx = prev.findIndex((c) => c.organization_id === orgId && c.tranche_number === tranche);
      if (idx === -1) return [...prev, { organization_id: orgId, tranche_number: tranche, amount: "", date_description: "", ...patch }];
      return prev.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    });
    schedule();
  };

  const addTrancheColumn = () => {
    setTrancheCount((n) => n + 1);
    schedule();
  };

  const removeTrancheColumn = (tn: number) => {
    setTrancheCells((prev) =>
      prev
        .filter((c) => c.tranche_number !== tn)
        .map((c) => (c.tranche_number > tn ? { ...c, tranche_number: c.tranche_number - 1 } : c))
    );
    setTrancheCount((n) => n - 1);
    schedule();
  };

  const participatingOrgIds = useMemo(() => new Set(participatingOrgs.map((o) => o.id)), [participatingOrgs]);
  const activeCells = trancheCells.filter((c) => participatingOrgIds.has(c.organization_id));
  const cellAmount = (c: CellForm) => (c.amount.trim() === "" ? 0 : parseAmount(c.amount) || 0);
  const trancheTotal = activeCells.reduce((sum, c) => sum + cellAmount(c), 0);
  const getRowTotal = (orgId: number) =>
    activeCells
      .filter((c) => c.organization_id === orgId)
      .reduce((sum, c) => sum + cellAmount(c), 0);
  const getTrancheTotal = (trancheNumber: number) =>
    activeCells
      .filter((c) => c.tranche_number === trancheNumber)
      .reduce((sum, c) => sum + cellAmount(c), 0);

  const grantSize = form.grant_size_usd.trim() === "" ? null : parseAmount(form.grant_size_usd);
  const projectStartDate = form.project_start_date || null;
  const durationForRange = form.project_duration_months.trim() === "" ? null : Number(form.project_duration_months);
  const projectEndDate =
    projectStartDate && durationForRange != null && Number.isFinite(durationForRange)
      ? addMonthsISO(projectStartDate, durationForRange)
      : null;
  const tranchesMatchGrant = grantSize != null && trancheTotal <= grantSize + 0.005 && trancheTotal >= grantSize - 1;
  const fmtUsd = (n: number) => formatUS(n);

  // ── Organization list CRUD (immediate) ─────────────────────────────────
  async function addOrg(type: "participating" | "implementing") {
    const name = (type === "participating" ? newParticipatingOrg : newImplementingOrg).trim();
    if (!name) return;
    if (name.length > ORG_NAME_MAX) { setOrgError(`Name must be ${ORG_NAME_MAX} characters or fewer.`); return; }
    setOrgError(null);
    const res = await fetch("/api/project-organizations", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, name, type }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setOrgError((err as { error?: string }).error || "Failed to add"); return; }
    const created: OrgRow = await res.json();
    if (type === "participating") { setParticipatingOrgs((prev) => [...prev, created]); setNewParticipatingOrg(""); }
    else { setImplementingOrgs((prev) => [...prev, created]); setNewImplementingOrg(""); }
  }

  async function deleteOrg(id: number, type: "participating" | "implementing") {
    setOrgError(null);
    const res = await fetch(`/api/project-organizations?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setOrgError("Failed to delete"); return; }
    if (type === "participating") setParticipatingOrgs((prev) => prev.filter((o) => o.id !== id));
    else setImplementingOrgs((prev) => prev.filter((o) => o.id !== id));
    setTrancheCells((prev) => prev.filter((c) => c.organization_id !== id));
    schedule();
  }

  async function commitOrgRename() {
    if (editingOrgId == null) return;
    const name = editingOrgName.trim();
    if (!name) { setOrgError("Name cannot be empty."); return; }
    if (name.length > ORG_NAME_MAX) { setOrgError(`Name must be ${ORG_NAME_MAX} characters or fewer.`); return; }
    setOrgError(null);
    const res = await fetch("/api/project-organizations", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editingOrgId, name }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setOrgError((err as { error?: string }).error || "Failed to rename"); return; }
    setParticipatingOrgs((prev) => prev.map((o) => o.id === editingOrgId ? { ...o, name } : o));
    setImplementingOrgs((prev) => prev.map((o) => o.id === editingOrgId ? { ...o, name } : o));
    setEditingOrgId(null);
    setEditingOrgName("");
  }

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

  function handleContactCreate(name: string) {
    setPendingContactName(name);
    setPendingContactEmail("");
    setPendingContactOrg("");
    setPendingContactRole("");
    setError(null);
  }

  async function commitPendingContact() {
    if (!pendingContactName) return;
    if (!pendingContactEmail.trim()) { setError("Email is required."); return; }
    if (!pendingContactOrg.trim()) { setError("Organisation is required."); return; }
    const owningPartnerId = partnerId;
    if (!owningPartnerId) return;
    setAddingContact(true); setError(null);
    try {
      const res = await fetch("/api/partner-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: owningPartnerId,
          name: pendingContactName,
          organization: pendingContactOrg.trim(),
          role: pendingContactRole.trim() || null,
          email: pendingContactEmail.trim(),
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add contact"); }
      const created: OrgContact = await res.json();
      setOrgContacts((prev) => [...prev, created]);
      await linkContact(created.id);
      setPendingContactName(null);
      setPendingContactEmail("");
      setPendingContactOrg("");
      setPendingContactRole("");
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
  function editContactField(id: number, patch: Partial<Pick<ProjectContact, "name" | "organization" | "role" | "email">>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function commitContactIdentity(id: number) {
    const c = contactsRef.current.find((x) => x.id === id);
    if (!c) return;
    if (!c.name.trim()) { setError("Contact name cannot be empty."); return; }
    setError(null);
    const res = await fetch("/api/partner-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.contact_id, name: c.name.trim(), organization: c.organization, role: c.role, email: c.email }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to update contact"); return; }
    // Keep the linked-contact combobox list in sync with the edited identity.
    setOrgContacts((prev) => prev.map((oc) => (oc.id === c.contact_id ? { ...oc, name: c.name.trim(), organization: c.organization, role: c.role, email: c.email } : oc)));
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
    .map((oc) => ({ id: oc.id, label: oc.name, hint: oc.role ?? undefined }));

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  return (
    // Card order via flex `order-*`: the cards are authored below in a
    // different sequence, but render as Title/data → Programme & project cost
    // (tranches) → Applicants/contacts (review feedback: contacts last).
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

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {isAdmin && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">{g.fields.mptfoNumber}</label>
              <Input
                value={form.mptfo_project_number}
                onChange={(e) => setField("mptfo_project_number", e.target.value)}
                placeholder={g.placeholders.mptfoNumber}
                className="text-sm"
              />
            </div>
          )}

          {/* Project status is CRAF'd-owned: only admins see (and may set) it.
              The API mirrors this — non-admin `status` writes are ignored
              server-side (ADMIN_ONLY_FIELDS in /api/projects/[id]). */}
          {isAdmin && (
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
          )}

          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.grantSize}</label>
            <Input
              type="text"
              inputMode="decimal"
              value={grantFocused
                ? form.grant_size_usd
                : form.grant_size_usd.trim() !== "" && !isNaN(parseAmount(form.grant_size_usd))
                  ? formatUS(parseAmount(form.grant_size_usd))
                  : form.grant_size_usd}
              onChange={(e) => setField("grant_size_usd", e.target.value)}
              onFocus={() => setGrantFocused(true)}
              onBlur={() => {
                setGrantFocused(false);
                const parsed = parseAmount(form.grant_size_usd);
                if (form.grant_size_usd.trim() !== "" && !isNaN(parsed)) {
                  setField("grant_size_usd", String(parsed));
                }
              }}
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

        {/* Participating Organizations list */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.participatingOrganizations}</label>
            <InfoPopover
              description={g.participatingOrganizationsDescription}
              triggerTitle={g.fields.participatingOrganizations}
              descriptionHeading="Description"
            />
          </div>
          {orgError && <p className="text-xs text-destructive">{orgError}</p>}
          {participatingOrgs.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              {editingOrgId === o.id ? (
                <>
                  <Input
                    value={editingOrgName}
                    onChange={(e) => setEditingOrgName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitOrgRename(); } if (e.key === "Escape") { setEditingOrgId(null); } }}
                    className="h-8 flex-1 text-sm"
                    autoFocus
                    maxLength={ORG_NAME_MAX}
                  />
                  <button onClick={commitOrgRename} className="text-green-600 hover:text-green-700" aria-label="Save"><Check className="size-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{o.name}</span>
                  <button onClick={() => { setEditingOrgId(o.id); setEditingOrgName(o.name); setOrgError(null); }} className="text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => deleteOrg(o.id, "participating")} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newParticipatingOrg}
              onChange={(e) => setNewParticipatingOrg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOrg("participating"); } }}
              placeholder={g.placeholders.participatingOrganizations}
              className="h-8 flex-1 text-sm"
              maxLength={ORG_NAME_MAX}
            />
            <Button size="sm" variant="outline" onClick={() => addOrg("participating")} disabled={!newParticipatingOrg.trim()}>
              <Plus className="size-3.5 mr-1" />Add
            </Button>
          </div>
        </div>

        {/* Implementing Partners list */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-muted-foreground">{g.fields.implementingPartners}</label>
            <InfoPopover
              description={g.implementingOrganizationsDescription}
              triggerTitle={g.fields.implementingPartners}
              descriptionHeading="Description"
            />
          </div>
          {implementingOrgs.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              {editingOrgId === o.id ? (
                <>
                  <Input
                    value={editingOrgName}
                    onChange={(e) => setEditingOrgName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitOrgRename(); } if (e.key === "Escape") { setEditingOrgId(null); } }}
                    className="h-8 flex-1 text-sm"
                    autoFocus
                    maxLength={ORG_NAME_MAX}
                  />
                  <button onClick={commitOrgRename} className="text-green-600 hover:text-green-700" aria-label="Save"><Check className="size-3.5" /></button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{o.name}</span>
                  <button onClick={() => { setEditingOrgId(o.id); setEditingOrgName(o.name); setOrgError(null); }} className="text-muted-foreground hover:text-foreground" aria-label="Edit"><Pencil className="size-3.5" /></button>
                  <button onClick={() => deleteOrg(o.id, "implementing")} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button>
                </>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newImplementingOrg}
              onChange={(e) => setNewImplementingOrg(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOrg("implementing"); } }}
              placeholder={g.placeholders.implementingPartners}
              className="h-8 flex-1 text-sm"
              maxLength={ORG_NAME_MAX}
            />
            <Button size="sm" variant="outline" onClick={() => addOrg("implementing")} disabled={!newImplementingOrg.trim()}>
              <Plus className="size-3.5 mr-1" />Add
            </Button>
          </div>
        </div>
      </div>

      {/* Programme & project cost — tranche matrix (second: review feedback
          moved the tranche release section above the contacts). */}
      <div className="order-2 rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Coins className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.tranches.heading}</h3>
        </div>
        <p className="text-xs text-muted-foreground">{g.tranches.description}</p>

        {participatingOrgs.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            Add organisations above to set up the funding matrix.
          </div>
        ) : (
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-44">
                    Organisation
                  </th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground whitespace-nowrap w-32">
                    Amount total
                  </th>
                  {Array.from({ length: trancheCount }, (_, i) => {
                    const tn = i + 1;
                    return (
                      <Fragment key={tn}>
                        <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground border-l whitespace-nowrap">
                          <span className="flex items-center justify-end gap-1.5">
                            {g.tranches.columns.amount} {tn}
                            <button
                              onClick={() => removeTrancheColumn(tn)}
                              disabled={trancheCount <= 1}
                              className="text-muted-foreground hover:text-destructive disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                              aria-label={`Remove tranche ${tn}`}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                        </th>
                        <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground w-72">
                          {g.tranches.columns.date}
                        </th>
                      </Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {participatingOrgs.map((org) => {
                  const rowTotal = getRowTotal(org.id);
                  return (
                    <tr key={org.id} className="transition-colors hover:bg-muted/20">
                      <td className="px-4 py-3 align-middle font-medium text-sm whitespace-nowrap">{org.name}</td>
                      <td className="px-4 py-3 align-middle text-right tabular-nums text-sm text-muted-foreground whitespace-nowrap">
                        {fmtUsd(rowTotal)}
                      </td>
                      {Array.from({ length: trancheCount }, (_, i) => {
                        const tn = i + 1;
                        const cellKey = `${org.id}:${tn}`;
                        const cell = trancheCells.find((c) => c.organization_id === org.id && c.tranche_number === tn);
                        const amount = cell?.amount ?? "";
                        const desc = cell?.date_description ?? "";
                        return (
                          <Fragment key={tn}>
                            <td className="px-4 py-3 align-middle border-l w-36">
                              <Input
                                type="text"
                                inputMode="decimal"
                                value={focusedCellKey === cellKey
                                  ? amount
                                  : amount.trim() !== "" && !isNaN(parseAmount(amount))
                                    ? formatUS(parseAmount(amount))
                                    : amount}
                                onChange={(e) => setCell(org.id, tn, { amount: e.target.value })}
                                onFocus={() => setFocusedCellKey(cellKey)}
                                onBlur={() => {
                                  setFocusedCellKey(null);
                                  const parsed = parseAmount(amount);
                                  if (amount.trim() !== "" && !isNaN(parsed)) {
                                    setCell(org.id, tn, { amount: String(parsed) });
                                  }
                                }}
                                placeholder="0.00"
                                className="h-8 text-sm text-right tabular-nums w-full"
                                aria-label={`Tranche ${tn} amount for ${org.name}`}
                              />
                            </td>
                            <td className="px-4 py-3 align-middle w-72">
                              <Textarea
                                value={desc}
                                onChange={(e) => setCell(org.id, tn, { date_description: e.target.value })}
                                placeholder="Include tentative date for release and activities covered"
                                className="text-sm min-h-[60px] resize-y w-full"
                                aria-label={`Tranche ${tn} date and description for ${org.name}`}
                              />
                            </td>
                          </Fragment>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t bg-muted/30">
                  <td className="px-4 py-3 align-middle text-sm font-semibold">{g.tranches.total}</td>
                  <td className="px-4 py-3 align-middle text-right">
                    <div className="flex items-center justify-end gap-2">
                      <span className="text-sm font-semibold tabular-nums">{fmtUsd(trancheTotal)}</span>
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
                        {grantSize == null ? "—" : tranchesMatchGrant ? "Matches budget" : `/ ${fmtUsd(grantSize)}`}
                      </span>
                    </div>
                  </td>
                  {Array.from({ length: trancheCount * 2 }, (_, i) => {
                    const tn = Math.floor(i / 2) + 1;
                    const isAmountCol = i % 2 === 0;
                    return (
                      <td key={i} className={cn(isAmountCol ? "border-l px-4 py-3 text-right text-sm font-semibold tabular-nums" : "")}>
                        {isAmountCol ? fmtUsd(getTrancheTotal(tn)) : null}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {grantSize != null && participatingOrgs.length > 0 && !tranchesMatchGrant && (
          <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              {g.tranches.mismatch
                .replace("{grant}", fmtUsd(grantSize))
                .replace("{total}", fmtUsd(trancheTotal))}
            </span>
          </div>
        )}

        <Button onClick={addTrancheColumn} size="sm" variant="outline" className="shrink-0">
          <Plus className="size-4 mr-1" />Add more tranches
        </Button>
      </div>

      {/* Applicants — project contacts (last: review feedback moved contacts
          below the tranche release section). */}
      <div className="order-3 rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{g.contactsHeading}</h3>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-2xl">
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

        {pendingContactName && (
          <div className="rounded-lg border bg-muted/30 px-3 py-3 max-w-2xl space-y-2">
            <p className="text-sm text-muted-foreground">
              Details for <strong>{pendingContactName}</strong>
            </p>
            <div className="grid grid-cols-3 gap-2">
              <Input
                value={pendingContactEmail}
                onChange={(e) => setPendingContactEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPendingContact(); } if (e.key === "Escape") { setPendingContactName(null); setPendingContactEmail(""); setPendingContactOrg(""); setPendingContactRole(""); } }}
                placeholder="name@example.org"
                type="email"
                className="h-8 text-sm"
                autoFocus
                aria-label="Email"
              />
              <Combobox
                items={orgSuggestions}
                value={pendingContactOrg}
                onChange={setPendingContactOrg}
                placeholder="Organisation"
              />
              <Input
                value={pendingContactRole}
                onChange={(e) => setPendingContactRole(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPendingContact(); } if (e.key === "Escape") { setPendingContactName(null); setPendingContactEmail(""); setPendingContactOrg(""); setPendingContactRole(""); } }}
                placeholder="Role (optional)"
                className="h-8 text-sm"
                aria-label="Role"
              />
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={commitPendingContact} disabled={addingContact}>Add</Button>
              <button
                type="button"
                onClick={() => { setPendingContactName(null); setPendingContactEmail(""); setPendingContactOrg(""); setPendingContactRole(""); }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

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
                          <Combobox
                            items={orgSuggestions}
                            value={c.organization ?? ""}
                            onChange={(v) => editContactField(c.id, { organization: v || null })}
                            onBlur={() => commitContactIdentity(c.id)}
                            placeholder="Organisation"
                            className="flex-1 min-w-0"
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
                            onChange={(e) => editContactField(c.id, { email: e.target.value })}
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
                          {(c.organization || c.role || c.email) && (
                            <span className="text-muted-foreground">
                              {" · "}{[c.organization, c.role, c.email].filter(Boolean).join(" · ")}
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
