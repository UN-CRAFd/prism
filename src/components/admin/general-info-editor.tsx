"use client";

import { Notice } from "@/components/ui/notice";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Combobox, type ComboboxItem } from "@/components/ui/combobox";
import { MultiSelect } from "@/components/ui/multi-select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAutosave, type SaveState } from "@/components/autosave";
import { isGrantSizeOutOfRange, MAX_GRANT_SIZE_USD } from "@/lib/grant-limits";
import { numericAmount, clampDuration } from "@/lib/numeric-input";
import { HEAD_BG, HEAD_COLOR, HEAD_TEXT } from "@/components/report-editor/matrix-table";
import { cn, formatAmount } from "@/lib/utils";
import { Plus, Trash2, Users, Loader2, FileText, Pencil, Check, X, Tags, Lock } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import labels from "@/lib/labels";
import { formatInstruction } from "@/lib/format-instruction";
import { optionItems, optionValues } from "@/lib/options";
import { CONTACT_ROLES } from "@/lib/contact-roles";
import { useWordLimits } from "@/lib/use-word-limits";
import { InfoPopover } from "@/components/ui/info-popover";
import { RequiredMark } from "@/components/ui/required-mark";
import { InvestmentThemeSelect } from "@/components/admin/investment-theme-select";
import { Hint } from "@/components/ui/hint";

const ORG_NAME_MAX = 300;

// ── General Information editor ─────────────────────────────────────────────────
// The first project-document tab. Edits core project data (name, MPTFO number,
// status, funding, start date, duration, description) with debounced autosave,
// and manages the project↔contact links (applicants + project contacts) via the
// project_contacts join table. New contacts can be added to the org inline.

const g = labels.generalInfo;
const GEO_SCOPE_NONE = "__none__";
const OPTION_NONE = "__none__";

// Option values for a dropdown, plus the stored value if it was since removed
// from the list (so the Select still shows it instead of going blank).
function withCurrent(key: string, current: string): string[] {
  const vals = optionValues(key);
  return current && !vals.includes(current) ? [...vals, current] : vals;
}

// Editable project columns, kept as strings in local form state. Follows the FMP
// General Information flow: title, applicants, description, geographic scope,
// participating orgs & implementing partners, programme/project cost, dates.
// Thematic keywords and the marker fields are intentionally excluded.
const FIELD_KEYS = [
  "project_title", "mptfo_project_number", "status",
  "grant_size_usd", "project_start_date", "project_duration_months",
  "geographic_scope", "description",
  // Classification: the first three are admin-only (hidden from partners; the
  // API strips/ignores them for non-admins). The Gender Equality Marker is
  // partner-editable.
  "allocation_modality", "investment_type", "investment_theme", "gender_equality_marker",
] as const;
type FieldKey = (typeof FIELD_KEYS)[number];
type Form = Record<FieldKey, string>;

const EMPTY_FORM: Form = {
  project_title: "", mptfo_project_number: "", status: "Ongoing",
  grant_size_usd: "", project_start_date: "", project_duration_months: "",
  geographic_scope: "", description: "",
  allocation_modality: "", investment_type: "", investment_theme: "", gender_equality_marker: "",
};

// Add whole months to a YYYY-MM-DD date, returning YYYY-MM-DD. Computed in UTC so
// the string arithmetic never shifts across a day boundary from timezone offset.
function addMonthsISO(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCMonth(base.getUTCMonth() + months);
  return isNaN(base.getTime()) ? "" : base.toISOString().slice(0, 10);
}

interface ProjectContact {
  id: number;
  contact_id: number;
  roles: string | null;
  name: string;
  organization: string | null;
  job_title: string | null;
  email: string | null;
}

interface OrgContact { id: number; partner_id: number; name: string; organization: string | null; job_title: string | null; email: string | null }
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


function coerce(key: FieldKey, value: string): unknown {
  switch (key) {
    case "grant_size_usd": return value.trim() === "" ? null : parseAmount(value);
    case "project_duration_months": return value.trim() === "" ? null : Number(value);
    case "project_start_date":
    case "mptfo_project_number":
    case "geographic_scope":
    case "allocation_modality":
    case "investment_type":
    case "investment_theme":
    case "gender_equality_marker":
    case "description": return value.trim() === "" ? null : value;
    default: return value; // project_title (NOT NULL), status (enum)
  }
}

function resolveId(map: Map<number, number>, id: number): number {
  let cur = id;
  const seen = new Set<number>();
  while (map.has(cur) && !seen.has(cur)) { seen.add(cur); cur = map.get(cur)!; }
  return cur;
}

export function GeneralInfoAdminEditor({
  projectId,
  onSaveStateChange,
  isAdmin = true,
  readOnly = false,
  pushCommand,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  // The MPTFO project number is admin-owned; partners can view but not edit it.
  isAdmin?: boolean;
  // When the prodoc is view-only, the blue instructions box is hidden (the
  // parent shows the amber view-only bar instead).
  readOnly?: boolean;
  pushCommand: (cmd: { undo: () => void; redo: () => void }) => void;
}) {
  const confirm = useConfirm();
  const wordLimits = useWordLimits();

  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [orgContacts, setOrgContacts] = useState<OrgContact[]>([]);
  // Partners a new/linked contact can be attributed to (lead + editors), and the
  // one currently selected in the add-contact "belongs to" picker.

  const [addingContact, setAddingContact] = useState(false);
  const [pendingContactName, setPendingContactName] = useState<string | null>(null);
  const [pendingContactEmail, setPendingContactEmail] = useState("");
  const [pendingContactOrg, setPendingContactOrg] = useState("");
  const [pendingContactJobTitle, setPendingContactJobTitle] = useState("");
  const [pendingContactRoles, setPendingContactRoles] = useState<string[]>([]);
  const [pendingContactErrors, setPendingContactErrors] = useState({ name: false, email: false, organisation: false });
  const [showAddContactRow, setShowAddContactRow] = useState(false);
  const [participatingOrgs, setParticipatingOrgs] = useState<OrgRow[]>([]);
  const [implementingOrgs, setImplementingOrgs] = useState<OrgRow[]>([]);
  const [newParticipatingOrg, setNewParticipatingOrg] = useState("");
  const [newImplementingOrg, setNewImplementingOrg] = useState("");
  const [orgError, setOrgError] = useState<string | null>(null);
  const [showAddParticipatingOrg, setShowAddParticipatingOrg] = useState(false);
  const [showAddImplementingOrg, setShowAddImplementingOrg] = useState(false);
  const [participatingOrgMissing, setParticipatingOrgMissing] = useState(false);
  const [implementingOrgMissing, setImplementingOrgMissing] = useState(false);
  // addOrg doesn't report success, so Save records the list length it expects to grow
  // and the effect below closes the draft once that happens.
  const pendingOrgCloseRef = useRef<{ type: "participating" | "implementing"; prevLen: number } | null>(null);
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

  const sortedContacts = useMemo(
    () => [...contacts].sort((a, b) => {
      const aOrg = a.organization?.toLowerCase() ?? null;
      const bOrg = b.organization?.toLowerCase() ?? null;
      if (aOrg === null && bOrg !== null) return 1;
      if (aOrg !== null && bOrg === null) return -1;
      if (aOrg !== null && bOrg !== null && aOrg !== bOrg) return aOrg.localeCompare(bOrg);
      return 0;
    }),
    [contacts]
  );

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formRef = useRef<Form>(EMPTY_FORM);
  formRef.current = form;
  const contactsRef = useRef<ProjectContact[]>([]);
  contactsRef.current = contacts;
  const savedRef = useRef<Form>(EMPTY_FORM);

  const contactLinkAliasRef = useRef<Map<number, number>>(new Map());
  const orgAliasRef = useRef<Map<number, number>>(new Map());

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
          allocation_modality: p.allocation_modality ?? "",
          investment_type: p.investment_type ?? "",
          investment_theme: p.investment_theme ?? "",
          gender_equality_marker: p.gender_equality_marker ?? "",
        };
        setForm(loaded);
        savedRef.current = { ...loaded };
        setPartnerId(p.partner_id);

        const [linkRes, orgRes, porgsRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          // Involved partners (lead + editors) + the contacts the caller may see.
          fetch(`/api/partner-contacts?project_id=${projectId}`),
          fetch(`/api/project-organizations?project_id=${projectId}`),
        ]);
        if (!linkRes.ok || !orgRes.ok || !porgsRes.ok) throw new Error("Failed to load project data");
        if (cancelled) return;
        setContacts(await linkRes.json());
        const orgData: { contacts: OrgContact[] } = await orgRes.json();
        setOrgContacts(orgData.contacts);
        const orgRows: (OrgRow & { type: string })[] = await porgsRes.json();
        setParticipatingOrgs(orgRows.filter((o) => o.type === "participating").map(({ id, name }) => ({ id, name })));
        setImplementingOrgs(orgRows.filter((o) => o.type === "implementing").map(({ id, name }) => ({ id, name })));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  // ── Project field autosave ────────────────────────────────────────────────
  // Debounced flush covers only the project columns (tranche cells moved to
  // TrancheScheduleEditor in the Budgets tab).
  const flush = useCallback(async () => {
    setError(null);
    const snapshot = { ...formRef.current };
    const payload: Record<string, unknown> = {};
    const savedKeys: FieldKey[] = [];
    for (const key of FIELD_KEYS) {
      if (snapshot[key] === savedRef.current[key]) continue;
      // An out-of-range funding amount is shown with a red outline and left out of
      // the save, so the other fields still save; it is sent once it is valid again
      // (it stays "changed" against savedRef until then).
      if (key === "grant_size_usd" && isGrantSizeOutOfRange(parseAmount(snapshot[key]))) continue;
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
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const grantInvalid = isGrantSizeOutOfRange(parseAmount(form.grant_size_usd));

  const setField = (key: FieldKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    schedule();
  };

  const projectStartDate = form.project_start_date || null;
  const durationForRange = form.project_duration_months.trim() === "" ? null : Number(form.project_duration_months);
  const projectEndDate =
    projectStartDate && durationForRange != null && Number.isFinite(durationForRange)
      ? addMonthsISO(projectStartDate, durationForRange)
      : null;

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
    const orgAnchorId = created.id;
    pushCommand({
      undo: async () => {
        const liveId = resolveId(orgAliasRef.current, orgAnchorId);
        const r = await fetch(`/api/project-organizations?id=${liveId}`, { method: "DELETE" });
        if (!r.ok) { setOrgError("Failed to undo org add"); return; }
        if (type === "participating") setParticipatingOrgs((prev) => prev.filter((o) => o.id !== liveId));
        else setImplementingOrgs((prev) => prev.filter((o) => o.id !== liveId));
      },
      redo: async () => {
        const r = await fetch("/api/project-organizations", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ project_id: projectId, name, type }),
        });
        if (!r.ok) { setOrgError("Failed to redo org add"); return; }
        const recreated: OrgRow = await r.json();
        orgAliasRef.current.set(resolveId(orgAliasRef.current, orgAnchorId), recreated.id);
        if (type === "participating") setParticipatingOrgs((prev) => [...prev, recreated]);
        else setImplementingOrgs((prev) => [...prev, recreated]);
      },
    });
  }

  function saveOrgDraft(type: "participating" | "implementing") {
    const isP = type === "participating";
    const value = (isP ? newParticipatingOrg : newImplementingOrg).trim();
    if (!value) { (isP ? setParticipatingOrgMissing : setImplementingOrgMissing)(true); return; }
    pendingOrgCloseRef.current = { type, prevLen: (isP ? participatingOrgs : implementingOrgs).length };
    addOrg(type);
  }

  function cancelAddOrg(type: "participating" | "implementing") {
    pendingOrgCloseRef.current = null;
    if (type === "participating") { setNewParticipatingOrg(""); setParticipatingOrgMissing(false); setShowAddParticipatingOrg(false); }
    else { setNewImplementingOrg(""); setImplementingOrgMissing(false); setShowAddImplementingOrg(false); }
  }

  useEffect(() => {
    const pending = pendingOrgCloseRef.current;
    if (!pending) return;
    const len = pending.type === "participating" ? participatingOrgs.length : implementingOrgs.length;
    if (len > pending.prevLen) cancelAddOrg(pending.type);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participatingOrgs.length, implementingOrgs.length]);

  async function deleteOrg(id: number, type: "participating" | "implementing") {
    if (!await confirm({ message: "Remove this organization from the project?" })) return;
    setOrgError(null);
    const orgList = type === "participating" ? participatingOrgs : implementingOrgs;
    const capturedOrg = orgList.find((o) => o.id === id);
    const capturedIndex = orgList.findIndex((o) => o.id === id);
    const res = await fetch(`/api/project-organizations?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setOrgError("Failed to delete"); return; }
    if (type === "participating") setParticipatingOrgs((prev) => prev.filter((o) => o.id !== id));
    else setImplementingOrgs((prev) => prev.filter((o) => o.id !== id));
    if (capturedOrg) {
      const orgKnownId = id;
      pushCommand({
        undo: async () => {
          const r = await fetch("/api/project-organizations", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: projectId, name: capturedOrg.name, type }),
          });
          if (!r.ok) { setOrgError("Failed to restore org"); return; }
          const created: OrgRow = await r.json();
          orgAliasRef.current.set(resolveId(orgAliasRef.current, orgKnownId), created.id);
          if (type === "participating") setParticipatingOrgs((prev) => { const next = [...prev]; next.splice(capturedIndex, 0, created); return next; });
          else setImplementingOrgs((prev) => { const next = [...prev]; next.splice(capturedIndex, 0, created); return next; });
        },
        redo: async () => {
          const liveId = resolveId(orgAliasRef.current, orgKnownId);
          const r = await fetch(`/api/project-organizations?id=${liveId}`, { method: "DELETE" });
          if (!r.ok) { setOrgError("Failed to redo org delete"); return; }
          if (type === "participating") setParticipatingOrgs((prev) => prev.filter((o) => o.id !== liveId));
          else setImplementingOrgs((prev) => prev.filter((o) => o.id !== liveId));
        },
      });
    }
  }

  // ── Contacts CRUD (immediate) ───────────────────────────────────────────
  async function linkContact(contactId: number, extras?: { roles?: string | null }): Promise<ProjectContact | undefined> {
    const res = await fetch("/api/project-contacts", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, contact_id: contactId, ...extras }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to link contact"); return undefined; }
    const created: ProjectContact = await res.json();
    setContacts((prev) => [...prev, created]);
    return created;
  }

  async function handleContactSelect(item: ComboboxItem) {
    setAddingContact(true); setError(null);
    try {
      const linked = await linkContact(item.id);
      if (linked) {
        const linkAnchorId = linked.id;
        const contactId = item.id;
        pushCommand({
          undo: async () => {
            const liveId = resolveId(contactLinkAliasRef.current, linkAnchorId);
            const r = await fetch(`/api/project-contacts?id=${liveId}`, { method: "DELETE" });
            if (!r.ok) { setError("Failed to undo contact link"); return; }
            setContacts((prev) => prev.filter((c) => c.id !== liveId));
          },
          redo: async () => {
            const r = await fetch("/api/project-contacts", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: projectId, contact_id: contactId }),
            });
            if (!r.ok) { setError("Failed to redo contact link"); return; }
            const recreated: ProjectContact = await r.json();
            contactLinkAliasRef.current.set(resolveId(contactLinkAliasRef.current, linkAnchorId), recreated.id);
            setContacts((prev) => [...prev, recreated]);
          },
        });
      }
      setShowAddContactRow(false);
    } finally { setAddingContact(false); }
  }

  function cancelAddContact() {
    setPendingContactName(null);
    setPendingContactEmail("");
    setPendingContactOrg("");
    setPendingContactJobTitle("");
    setPendingContactRoles([]);
    setPendingContactErrors({ name: false, email: false, organisation: false });
    setShowAddContactRow(false);
  }

  function handleContactCreate(name: string) {
    setPendingContactName(name);
    setPendingContactEmail("");
    setPendingContactOrg("");
    setPendingContactJobTitle("");
    setPendingContactRoles([]);
    setPendingContactErrors({ name: false, email: false, organisation: false });
    setError(null);
  }

  async function commitPendingContact() {
    const errs = {
      name: !pendingContactName?.trim(),
      email: !pendingContactEmail.trim(),
      organisation: !pendingContactOrg.trim(),
    };
    if (errs.name || errs.email || errs.organisation) { setPendingContactErrors(errs); return; }
    if (!pendingContactName) return;
    const owningPartnerId = partnerId;
    if (!owningPartnerId) return;
    setAddingContact(true); setPendingContactErrors({ name: false, email: false, organisation: false }); setError(null);
    try {
      const res = await fetch("/api/partner-contacts", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          partner_id: owningPartnerId,
          name: pendingContactName,
          organization: pendingContactOrg.trim(),
          job_title: pendingContactJobTitle.trim() || null,
          email: pendingContactEmail.trim(),
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add contact"); }
      const created: OrgContact = await res.json();
      setOrgContacts((prev) => [...prev, created]);
      const capturedContactId = created.id;
      const capturedRoles = pendingContactRoles.length ? pendingContactRoles.join("|") : null;
      const linked = await linkContact(capturedContactId, { roles: capturedRoles });
      if (linked) {
        const linkAnchorId = linked.id;
        pushCommand({
          undo: async () => {
            const liveId = resolveId(contactLinkAliasRef.current, linkAnchorId);
            const r = await fetch(`/api/project-contacts?id=${liveId}`, { method: "DELETE" });
            if (!r.ok) { setError("Failed to undo contact add"); return; }
            setContacts((prev) => prev.filter((c) => c.id !== liveId));
          },
          redo: async () => {
            const r = await fetch("/api/project-contacts", {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ project_id: projectId, contact_id: capturedContactId, roles: capturedRoles }),
            });
            if (!r.ok) { setError("Failed to redo contact add"); return; }
            const recreated: ProjectContact = await r.json();
            contactLinkAliasRef.current.set(resolveId(contactLinkAliasRef.current, linkAnchorId), recreated.id);
            setContacts((prev) => [...prev, recreated]);
          },
        });
      }
      cancelAddContact();
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddingContact(false); }
  }

  async function patchContact(id: number, patch: Partial<Pick<ProjectContact, "roles">>) {
    const prevRoles = contacts.find((c) => c.id === id)?.roles ?? null;
    const newRoles = patch.roles ?? null;
    setContacts((prev) => prev.map((c) => c.id === id ? { ...c, ...patch } : c));
    setError(null);
    const res = await fetch("/api/project-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to update contact"); return; }
    pushCommand({
      undo: async () => {
        const r = await fetch("/api/project-contacts", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, roles: prevRoles }),
        });
        if (!r.ok) { setError("Failed to undo role change"); return; }
        setContacts((prev) => prev.map((c) => c.id === id ? { ...c, roles: prevRoles } : c));
      },
      redo: async () => {
        const r = await fetch("/api/project-contacts", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, roles: newRoles }),
        });
        if (!r.ok) { setError("Failed to redo role change"); return; }
        setContacts((prev) => prev.map((c) => c.id === id ? { ...c, roles: newRoles } : c));
      },
    });
  }

  // Edit the contact's identity (name / role / email) on the shared
  // partner_contacts master record. Typing updates local state; the PATCH fires
  // on blur. The endpoint rewrites all three fields at once, so we always send
  // the full current identity to avoid nulling the untouched ones.
  function editContactField(id: number, patch: Partial<Pick<ProjectContact, "name" | "organization" | "job_title" | "email">>) {
    setContacts((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async function commitContactIdentity(id: number) {
    const c = contactsRef.current.find((x) => x.id === id);
    if (!c) return;
    if (!c.name.trim()) { setError("Contact name cannot be empty."); return; }
    setError(null);
    const res = await fetch("/api/partner-contacts", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.contact_id, name: c.name.trim(), organization: c.organization, job_title: c.job_title, email: c.email }),
    });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to update contact"); return; }
    // Keep the linked-contact combobox list in sync with the edited identity.
    setOrgContacts((prev) => prev.map((oc) => (oc.id === c.contact_id ? { ...oc, name: c.name.trim(), organization: c.organization, job_title: c.job_title, email: c.email } : oc)));
  }

  async function unlinkContact(id: number) {
    const c = contacts.find((x) => x.id === id);
    if (!await confirm({ message: `Remove ${c?.name ?? "this contact"} from the project?`, confirmLabel: "Remove", variant: "default" })) return;
    setError(null);
    const capturedContact = c;
    const capturedIndex = contacts.findIndex((x) => x.id === id);
    const res = await fetch(`/api/project-contacts?id=${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to remove contact"); return; }
    setContacts((prev) => prev.filter((x) => x.id !== id));
    if (capturedContact) {
      const linkKnownId = id;
      pushCommand({
        undo: async () => {
          const r = await fetch("/api/project-contacts", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ project_id: projectId, contact_id: capturedContact.contact_id, roles: capturedContact.roles }),
          });
          if (!r.ok) { setError("Failed to restore contact link"); return; }
          const created: ProjectContact = await r.json();
          contactLinkAliasRef.current.set(resolveId(contactLinkAliasRef.current, linkKnownId), created.id);
          setContacts((prev) => { const next = [...prev]; next.splice(capturedIndex, 0, created); return next; });
        },
        redo: async () => {
          const liveId = resolveId(contactLinkAliasRef.current, linkKnownId);
          const r = await fetch(`/api/project-contacts?id=${liveId}`, { method: "DELETE" });
          if (!r.ok) { setError("Failed to redo contact unlink"); return; }
          setContacts((prev) => prev.filter((x) => x.id !== liveId));
        },
      });
    }
  }

  // Candidate contacts to link: not already linked, and (when a "belongs to"
  // partner is selected) restricted to that partner so the create-new action
  // lands under the right org.
  const comboItems: ComboboxItem[] = orgContacts
    .filter((oc) => !contacts.some((c) => c.contact_id === oc.id))
    .map((oc) => ({ id: oc.id, label: oc.name, hint: oc.job_title ?? undefined }));

  if (loading) return <LoadingState className="py-8" />;

  // Gender Equality Marker field — rendered in the admin Classification card,
  // or under Description in the project data card for partners.
  const gemField = (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <label className="text-sm text-muted-foreground">{g.fields.genderEqualityMarker}<RequiredMark /></label>
        <InfoPopover
          description={g.genderEqualityMarkerDescription}
          meansOfVerification={g.genderEqualityMarkerAssessment}
          triggerTitle={g.fields.genderEqualityMarker}
          descriptionHeading="What it means"
          secondaryHeading="How to assess it"
        />
      </div>
      <Select
        value={form.gender_equality_marker}
        onValueChange={(v) => setField("gender_equality_marker", v)}
      >
        <SelectTrigger className="w-full text-sm">
          <SelectValue placeholder={g.placeholders.select} />
        </SelectTrigger>
        <SelectContent>
          {optionItems("genderEqualityMarker").map((it) => (
            <SelectItem key={it.value} value={it.value}>{it.label}</SelectItem>
          ))}
          {form.gender_equality_marker && !optionItems("genderEqualityMarker").some((it) => it.value === form.gender_equality_marker) && (
            <SelectItem value={form.gender_equality_marker}>{form.gender_equality_marker}</SelectItem>
          )}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    // Card order via flex `order-*`: Title/data card first, contacts second.
    <div className="flex flex-col gap-6">
      {error && (
        <div className="order-first rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Notice variant="info" className="order-first">
        {formatInstruction(labels.tabInstructions.general)}
      </Notice>

      {/* Project data (Title, dates, cost inputs, geographic scope, implementing
          partners, description) — FMP order: first */}
      <div className="order-1 rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" />
          <h3 className="t-heading-editor">{g.detailsHeading}</h3>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm text-muted-foreground">{g.fields.projectTitle}<RequiredMark /></label>
          <Input
            value={form.project_title}
            onChange={(e) => setField("project_title", e.target.value)}
            placeholder={g.placeholders.projectTitle}
            className="text-sm"
          />
        </div>

        <div className={`grid grid-cols-2 sm:grid-cols-3 ${isAdmin ? "lg:grid-cols-3" : "lg:grid-cols-5"} gap-4 items-end`}>
          {isAdmin && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground">{g.fields.mptfoNumber}</label>
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
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-muted-foreground">{g.fields.status}</label>
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

          <div className="relative flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.grantSize}<RequiredMark /></label>
            <Input
              type="text"
              inputMode="decimal"
              value={grantFocused
                ? form.grant_size_usd
                : form.grant_size_usd.trim() !== "" && !isNaN(parseAmount(form.grant_size_usd))
                  ? formatAmount(parseAmount(form.grant_size_usd))
                  : form.grant_size_usd}
              onChange={(e) => setField("grant_size_usd", numericAmount(e.target.value))}
              onFocus={() => setGrantFocused(true)}
              onBlur={() => {
                setGrantFocused(false);
                const parsed = parseAmount(form.grant_size_usd);
                if (form.grant_size_usd.trim() !== "" && !isNaN(parsed) && !grantInvalid) {
                  setField("grant_size_usd", String(parsed));
                }
              }}
              placeholder={g.placeholders.grantSize}
              className={"text-sm" + (grantInvalid ? " border-destructive focus-visible:ring-destructive" : "")}
              aria-invalid={grantInvalid || undefined}
            />
            {/* Absolutely positioned so the hint never changes this cell's height
                (the grid is items-end — the inputs must stay aligned). */}
            {grantInvalid && (
              <p className="absolute left-0 top-full mt-0.5 text-xs text-destructive whitespace-nowrap">
                Max. {MAX_GRANT_SIZE_USD.toLocaleString("en-US")} USD
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.startDate}<RequiredMark /></label>
            <DateInput
              value={form.project_start_date}
              onChange={(v) => setField("project_start_date", v)}
              className="text-sm"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.durationMonths}<RequiredMark /></label>
            <Input
              type="text" inputMode="numeric"
              value={form.project_duration_months}
              onChange={(e) => setField("project_duration_months", clampDuration(e.target.value))}
              placeholder={g.placeholders.durationMonths}
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.expectedEndDate}</label>
            <Input
              type="text"
              readOnly
              tabIndex={-1}
              value={projectEndDate ? projectEndDate.split("-").reverse().join("/") : ""}
              placeholder="DD/MM/YYYY"
              className="text-sm bg-muted/40 text-muted-foreground cursor-default"
              aria-label={g.fields.expectedEndDate}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.geographicScope}<RequiredMark /></label>
            <Select
              value={form.geographic_scope || GEO_SCOPE_NONE}
              onValueChange={(v) => setField("geographic_scope", v === GEO_SCOPE_NONE ? "" : v)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder={g.placeholders.geographicScope} />
              </SelectTrigger>
              <SelectContent>
                {optionValues("geographicScope").map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

        </div>

        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.description}<RequiredMark /></label>
            <InfoPopover
              description={g.descriptionInstruction}
              triggerTitle={g.fields.description}
              descriptionHeading="Description"
            />
          </div>
          <RichTextEditor
            value={form.description}
            onChange={(html) => setField("description", html)}
            placeholder={g.placeholders.description}
            disabled={readOnly}
            maxWords={wordLimits.limit("prodoc.description")}
          />
        </div>

        {/* Partners: Gender Equality Marker sits here (no Classification card). */}
        {!isAdmin && gemField}

        {/* Participating Organizations list */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.participatingOrganizations}</label>
            <InfoPopover
              description={g.participatingOrganizationsDescription}
              triggerTitle={g.fields.participatingOrganizations}
              descriptionHeading="Description"
            />
          </div>
          {orgError && <p className="text-xs text-destructive">{orgError}</p>}
          {participatingOrgs.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{o.name}</span>
              <button onClick={() => deleteOrg(o.id, "participating")} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          {showAddParticipatingOrg ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className={cn("flex-1 rounded-md", participatingOrgMissing && "ring-1 ring-destructive")}>
                  <SearchableSelect
                    optionKey="projectPartners"
                    value={newParticipatingOrg}
                    onChange={(v) => { setNewParticipatingOrg(v); if (v.trim()) setParticipatingOrgMissing(false); }}
                    placeholder={g.placeholders.participatingOrganizations}
                    exclude={participatingOrgs.map((o) => o.name)}
                    className="w-full"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => saveOrgDraft("participating")}>{labels.adminEditor.save}</Button>
                <Button size="sm" variant="outline" onClick={() => cancelAddOrg("participating")}>{labels.common.cancel}</Button>
              </div>
              {participatingOrgMissing && <p className="text-xs text-destructive">Choose an organization to add.</p>}
            </div>
          ) : (!readOnly || participatingOrgs.length === 0) && (
            <div className={participatingOrgs.length === 0 ? "flex items-center justify-between gap-2" : "flex justify-end"}>
              {participatingOrgs.length === 0 && <span className="text-xs italic text-muted-foreground">No project partners yet</span>}
              {!readOnly && (
                <Button type="button" variant="add" size="sm" onClick={() => setShowAddParticipatingOrg(true)} className="gap-1">
                  <Plus className="size-4" />Add project partner
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Implementing Partners list */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-muted-foreground">{g.fields.implementingPartners}</label>
            <InfoPopover
              description={g.implementingOrganizationsDescription}
              triggerTitle={g.fields.implementingPartners}
              descriptionHeading="Description"
            />
          </div>
          {implementingOrgs.map((o) => (
            <div key={o.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{o.name}</span>
              <button onClick={() => deleteOrg(o.id, "implementing")} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          {showAddImplementingOrg ? (
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className={cn("flex-1 rounded-md", implementingOrgMissing && "ring-1 ring-destructive")}>
                  <SearchableSelect
                    optionKey="implementingOrganizations"
                    value={newImplementingOrg}
                    onChange={(v) => { setNewImplementingOrg(v); if (v.trim()) setImplementingOrgMissing(false); }}
                    placeholder={g.placeholders.implementingPartners}
                    exclude={implementingOrgs.map((o) => o.name)}
                    allowCustom
                    searchPlaceholder="Search or type a new name."
                    className="w-full"
                  />
                </div>
                <Button size="sm" variant="outline" onClick={() => saveOrgDraft("implementing")}>{labels.adminEditor.save}</Button>
                <Button size="sm" variant="outline" onClick={() => cancelAddOrg("implementing")}>{labels.common.cancel}</Button>
              </div>
              {implementingOrgMissing && <p className="text-xs text-destructive">Choose an organization to add.</p>}
            </div>
          ) : (!readOnly || implementingOrgs.length === 0) && (
            <div className={implementingOrgs.length === 0 ? "flex items-center justify-between gap-2" : "flex justify-end"}>
              {implementingOrgs.length === 0 && <span className="text-xs italic text-muted-foreground">No implementing organizations yet</span>}
              {!readOnly && (
                <Button type="button" variant="add" size="sm" onClick={() => setShowAddImplementingOrg(true)} className="gap-1">
                  <Plus className="size-4" />Add implementing organization
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Classification — admin-only allocation/investment fields, plus the
          Gender Equality Marker. Admin view only: partners don’t see this card —
          their Gender Equality Marker sits in the project data card, under
          Description. Sits between the project data card and Contacts
          (same order-1, later in the DOM). */}
      {isAdmin && (
        <div className="order-1 rounded-xl border bg-card p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Tags className="size-4 text-muted-foreground" />
          <h3 className="t-heading-editor">{g.classificationHeading}</h3>
        </div>

        <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lock className="size-3" />
              <span>{g.adminOnlyNote}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">{g.fields.allocationModality}</label>
                <Select
                  value={form.allocation_modality || OPTION_NONE}
                  onValueChange={(v) => setField("allocation_modality", v === OPTION_NONE ? "" : v)}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={g.placeholders.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPTION_NONE} className="text-muted-foreground">{g.placeholders.none}</SelectItem>
                    {withCurrent("allocationModality", form.allocation_modality).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">{g.fields.investmentType}</label>
                <Select
                  value={form.investment_type || OPTION_NONE}
                  onValueChange={(v) => setField("investment_type", v === OPTION_NONE ? "" : v)}
                >
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder={g.placeholders.select} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={OPTION_NONE} className="text-muted-foreground">{g.placeholders.none}</SelectItem>
                    {withCurrent("investmentType", form.investment_type).map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm text-muted-foreground">{g.fields.investmentTheme}</label>
                <InvestmentThemeSelect
                  value={form.investment_theme}
                  onChange={(v) => setField("investment_theme", v)}
                  placeholder={g.placeholders.investmentTheme}
                />
              </div>
            </div>
          </div>

        {gemField}
      </div>
      )}

      {/* Applicants — project contacts */}
      <div className="order-2 rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="t-heading-editor">{g.contactsHeading}</h3>
          <InfoPopover
            description={[
              ...CONTACT_ROLES.map((role) => `${role}: ${(g.contactRoleHelp as Record<string, string>)[role] ?? ""}`.trim()),
              "",
              g.contactsHelpFooter,
            ].join("\n")}
            triggerTitle={g.contactsHeading}
            descriptionHeading={g.contactsHelpHeading}
          />
        </div>

        {contacts.length === 0 && !showAddContactRow ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {g.emptyContacts}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className={cn("border-b", HEAD_BG)}>
                  <th className={cn("text-left px-4 py-3", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>{g.columns.contact}</th>
                  <th className={cn("text-left px-4 py-3 w-40", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>{g.columns.organisation}</th>
                  <th className={cn("text-left px-4 py-3 w-72", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>{g.columns.roles}</th>
                  <th className={cn("w-20 px-4 py-3", HEAD_BG, HEAD_COLOR, HEAD_TEXT)} />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedContacts.map((c) => (
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
                            value={c.job_title ?? ""}
                            onChange={(e) => editContactField(c.id, { job_title: e.target.value || null })}
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
                          {(c.job_title || c.email) && (
                            <span className="text-muted-foreground">
                              {" · "}{[c.job_title, c.email].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-middle text-sm text-muted-foreground">
                      {editingContactId !== c.id ? (c.organization || "—") : null}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <MultiSelect
                        staticItems={CONTACT_ROLES}
                        value={c.roles?.split("|").filter(Boolean) ?? []}
                        onChange={(v) => patchContact(c.id, { roles: v.length ? v.join("|") : null })}
                        placeholder="No roles"
                        triggerDisplay="text"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-3">
                        <Hint label={editingContactId === c.id ? "Done" : "Edit"}>
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
                          >
                            {editingContactId === c.id ? <Check className="size-3.5" /> : <Pencil className="size-3.5" />}
                          </button>
                        </Hint>
                        <Hint label="Remove">
                          <button
                            onClick={() => unlinkContact(c.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                            aria-label="Remove contact"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </Hint>
                      </div>
                    </td>
                  </tr>
                ))}
                {showAddContactRow && (
                  <tr className="bg-muted/10">
                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-2">
                        {pendingContactName === null ? (
                          <div className={cn(pendingContactErrors.name && "rounded-md ring-1 ring-destructive")}>
                            <Combobox
                              items={comboItems}
                              placeholder={g.contactSearchPlaceholder}
                              onSelect={handleContactSelect}
                              onCreate={handleContactCreate}
                              createLabel={g.createContact}
                              busy={addingContact}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <Input
                                value={splitName(pendingContactName).first}
                                onChange={(e) => { setPendingContactName(joinName(e.target.value, splitName(pendingContactName).last)); if (pendingContactErrors.name) setPendingContactErrors((p) => ({ ...p, name: false })); }}
                                onKeyDown={(e) => { if (e.key === "Escape") cancelAddContact(); }}
                                placeholder={g.contactFirstName}
                                className={cn("h-8 flex-1 min-w-0 text-sm font-medium", pendingContactErrors.name && "border-destructive focus-visible:ring-destructive")}
                                aria-label={g.contactFirstName}
                                autoFocus
                              />
                              <Input
                                value={splitName(pendingContactName).last}
                                onChange={(e) => { setPendingContactName(joinName(splitName(pendingContactName).first, e.target.value)); if (pendingContactErrors.name) setPendingContactErrors((p) => ({ ...p, name: false })); }}
                                onKeyDown={(e) => { if (e.key === "Escape") cancelAddContact(); }}
                                placeholder={g.contactLastName}
                                className={cn("h-8 flex-1 min-w-0 text-sm font-medium", pendingContactErrors.name && "border-destructive focus-visible:ring-destructive")}
                                aria-label={g.contactLastName}
                              />
                            </div>
                            <Input
                              value={pendingContactEmail}
                              onChange={(e) => { setPendingContactEmail(e.target.value); if (pendingContactErrors.email) setPendingContactErrors((p) => ({ ...p, email: false })); }}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPendingContact(); } if (e.key === "Escape") cancelAddContact(); }}
                              placeholder={`${g.contactEmail} *`}
                              type="email"
                              className={cn("h-8 text-sm", pendingContactErrors.email && "border-destructive focus-visible:ring-destructive")}
                              aria-label={g.contactEmail}
                            />
                            <Input
                              value={pendingContactJobTitle}
                              onChange={(e) => setPendingContactJobTitle(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPendingContact(); } if (e.key === "Escape") cancelAddContact(); }}
                              placeholder={`${g.contactRole} (optional)`}
                              className="h-8 text-sm"
                              aria-label={g.contactRole}
                            />
                          </>
                        )}
                        {(pendingContactErrors.name || pendingContactErrors.email || pendingContactErrors.organisation) && (
                          <p className="text-xs text-destructive">Add a name, email and organisation to save this contact.</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      {pendingContactName !== null && (
                        <div className={cn(pendingContactErrors.organisation && "rounded-md ring-1 ring-destructive")}>
                          <Combobox
                            items={orgSuggestions}
                            value={pendingContactOrg}
                            onChange={(v) => { setPendingContactOrg(v); if (pendingContactErrors.organisation) setPendingContactErrors((p) => ({ ...p, organisation: false })); }}
                            placeholder="Organisation"
                          />
                        </div>
                      )}
                    </td>
                    <td colSpan={2} className="px-4 py-3 align-top">
                      <div className="space-y-2">
                        <MultiSelect
                          staticItems={CONTACT_ROLES}
                          value={pendingContactRoles}
                          onChange={setPendingContactRoles}
                          placeholder="Roles (optional)"
                          className="h-8 text-sm"
                        />
                        <div className="flex items-center justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={commitPendingContact} disabled={addingContact}>
                            {addingContact ? <Loader2 className="size-4 animate-spin" /> : labels.adminEditor.save}
                          </Button>
                          <Button size="sm" variant="outline" onClick={cancelAddContact}>{labels.common.cancel}</Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {!showAddContactRow && !readOnly && (
          <div className="flex justify-end">
            <Button type="button" variant="add" size="sm" onClick={() => setShowAddContactRow(true)} className="gap-1">
              <Plus className="size-4" />Add contact
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
