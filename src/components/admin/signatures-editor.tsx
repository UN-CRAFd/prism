"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { Loader2, Users, ShieldCheck, Trash2 } from "lucide-react";
import { LoadingState } from "@/components/admin/shared";
import labels from "@/lib/labels";
import { ROLE_SIGNATORY } from "@/lib/contact-roles";

// ── Signatures editor ─────────────────────────────────────────────────────────
// Admin-only tab for managing signatories on the project document.
// Contact-derived signatories (project contacts with ROLE_SIGNATORY in their
// roles) can be removed here — that strips the Signatory role only, leaving
// the contact linked to the project. Standalone signatories (prodoc_signatories)
// can be added, edited, and removed; all fields including name are optional.
// Signing never happens in the platform — the printed document is signed offline.

const s = labels.signatures;

interface ProjectContact {
  id: number;         // project_contacts link id
  contact_id: number; // partner_contacts id
  partner_id: number; // owning partner (partner_contacts.partner_id)
  roles: string | null;
  name: string;
  job_title: string | null;
  email: string | null;
}

interface StandaloneSignatory {
  id: number;
  project_id: number;
  title: string | null;
  signee_name: string | null;
  organization: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
}

const EMPTY_FORM = { title: "", name: "", org: "", email: "" };

export function SignaturesEditor({
  projectId,
  readOnly = false,
}: {
  projectId: number;
  readOnly?: boolean;
}) {
  const confirm = useConfirm();

  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [standalones, setStandalones] = useState<StandaloneSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [addBusy, setAddBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingContactId, setDeletingContactId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [cRes, stRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          fetch(`/api/prodoc-signatories?project_id=${projectId}`),
        ]);
        if (!cRes.ok || !stRes.ok) throw new Error("Failed to load signatures");
        if (cancelled) return;
        setContacts(await cRes.json());
        setStandalones(await stRes.json());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  async function addStandalone() {
    setAddBusy(true);
    try {
      const res = await fetch("/api/prodoc-signatories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: form.title.trim() || null,
          signee_name: form.name.trim() || null,
          organization: form.org.trim() || null,
          email: form.email.trim() || null,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to add"); }
      const created: StandaloneSignatory = await res.json();
      setStandalones((prev) => [...prev, created]);
      setShowForm(false);
      setForm(EMPTY_FORM);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setAddBusy(false); }
  }

  async function deleteStandalone(item: StandaloneSignatory) {
    if (!await confirm({ message: s.deleteStandaloneConfirm, confirmLabel: s.remove, variant: "default" })) return;
    setDeletingId(item.id);
    try {
      const res = await fetch(`/api/prodoc-signatories?id=${item.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to remove"); }
      setStandalones((prev) => prev.filter((x) => x.id !== item.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingId(null); }
  }

  async function removeContactSignatory(c: ProjectContact) {
    const msg = s.removeContactConfirm.replace("{name}", c.name);
    if (!await confirm({ message: msg, confirmLabel: s.remove, variant: "default" })) return;
    setDeletingContactId(c.id);
    try {
      const newRoles = (c.roles?.split("|") ?? []).filter((r) => r !== ROLE_SIGNATORY);
      const res = await fetch("/api/project-contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, roles: newRoles.length > 0 ? newRoles.join("|") : null }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to remove"); }
      setContacts((prev) => prev.map((x) =>
        x.id === c.id ? { ...x, roles: newRoles.length > 0 ? newRoles.join("|") : null } : x
      ));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setDeletingContactId(null); }
  }

  function cancelForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
  }

  if (loading) return <LoadingState className="py-8" />;

  const contactSignatories = contacts.filter((c) => c.roles?.split("|").includes(ROLE_SIGNATORY));
  const hasAny = contactSignatories.length > 0 || standalones.length > 0;

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {labels.tabInstructions.signatures}
        </div>
      )}

      {/* ── Signatories (contact-derived + standalone) ── */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="t-heading-sub">{s.contactsHeading}</h3>
        </div>

        {!hasAny ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {s.emptySignatories}
          </div>
        ) : (
          <div className="rounded-xl border divide-y overflow-hidden">

            {/* Contact-derived signatories */}
            {contactSignatories.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[c.job_title, c.roles?.split("|").join(", ")].filter(Boolean).join(" · ")}
                    {" · "}
                    <span className="italic">{s.viaContacts}</span>
                  </p>
                </div>
                {!readOnly && (
                  <button
                    onClick={() => removeContactSignatory(c)}
                    disabled={deletingContactId === c.id}
                    className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                    aria-label={s.remove}
                  >
                    {deletingContactId === c.id
                      ? <Loader2 className="size-4 animate-spin" />
                      : <Trash2 className="size-4" />}
                  </button>
                )}
              </div>
            ))}

            {/* Standalone signatories */}
            {standalones.map((item) => {
              const allEmpty = !item.signee_name && !item.title && !item.organization && !item.email;
              const nameDisplay = item.signee_name || null;
              const subtext = [item.title, item.organization].filter(Boolean).join(" · ");
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {allEmpty ? (
                        <p className="text-sm text-muted-foreground italic truncate">{s.blankSignatory}</p>
                      ) : (
                        <>
                          <p className={cn("text-sm font-medium truncate", !nameDisplay && "text-muted-foreground italic")}>
                            {nameDisplay ?? s.nameNotSet}
                          </p>
                          <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {s.standaloneTag}
                          </span>
                        </>
                      )}
                    </div>
                    {!allEmpty && subtext && (
                      <p className="text-xs text-muted-foreground truncate">{subtext}</p>
                    )}
                    {allEmpty && (
                      <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {s.standaloneTag}
                      </span>
                    )}
                  </div>
                  {!readOnly && (
                    <button
                      onClick={() => deleteStandalone(item)}
                      disabled={deletingId === item.id}
                      className="shrink-0 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
                      aria-label={s.remove}
                    >
                      {deletingId === item.id
                        ? <Loader2 className="size-4 animate-spin" />
                        : <Trash2 className="size-4" />}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Add new signatory form ── */}
        {!readOnly && (
          showForm ? (
            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{s.fieldTitle}</label>
                  <Input
                    value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Dr., OIC"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{s.fieldName}</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Full name"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{s.fieldOrg}</label>
                  <Input
                    value={form.org}
                    onChange={(e) => setForm((f) => ({ ...f, org: e.target.value }))}
                    placeholder="Organization"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">{s.fieldEmail}</label>
                  <Input
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    placeholder="email@example.com"
                    type="email"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={addStandalone} disabled={addBusy}>
                  {addBusy ? <Loader2 className="size-4 animate-spin" /> : s.addSignatorySubmit}
                </Button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {s.addSignatoryCancel}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {s.addSignatory}
            </button>
          )
        )}
      </div>

      {/* ── CRAF'd Secretariat ── */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-muted-foreground" />
          <h3 className="t-heading-sub">{s.secretariatHeading}</h3>
        </div>

        <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.secretariatHeading}</p>
            <p className="text-xs text-muted-foreground truncate">{s.secretariatSubtitle}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
