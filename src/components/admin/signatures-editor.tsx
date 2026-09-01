"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, formatDate } from "@/lib/utils";
import { Loader2, PenLine, Check, X, Users, ShieldCheck, Trash2 } from "lucide-react";
import labels from "@/lib/labels";
import { useAuth } from "@/lib/auth-context";

// ── Signatures editor ─────────────────────────────────────────────────────────
// Sign-off on the project document. Project contacts (from the General
// Information tab) are signed by the partner; the CRAF'd Secretariat row is
// signed by an admin. Standalone signatories (prodoc_signatories) appear with a
// blank signature line in the exported prodoc but have no sign-flow here.
// Click-to-sign: signing stamps a date, un-signing removes it.

const s = labels.signatures;

interface ProjectContact {
  id: number;         // project_contacts link id
  contact_id: number; // partner_contacts id
  partner_id: number; // owning partner (partner_contacts.partner_id)
  relationship: string | null;
  is_applicant: boolean;
  name: string;
  role: string | null;
  email: string | null;
}

interface Signature {
  id: number;
  party: "contact" | "secretariat";
  contact_id: number | null;
  signed_by: string | null;
  signed_at: string;
}

interface StandaloneSignatory {
  id: number;
  project_id: number;
  title: string | null;
  signee_name: string;
  organization: string | null;
  email: string | null;
  sort_order: number;
  created_at: string;
}

const EMPTY_FORM = { title: "", name: "", org: "", email: "" };

export function SignaturesEditor({
  projectId,
  isAdmin = false,
  readOnly = false,
}: {
  projectId: number;
  isAdmin?: boolean;
  readOnly?: boolean;
}) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const myPartnerId = user?.partner_id ?? null;

  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [standalones, setStandalones] = useState<StandaloneSignatory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Add-form state
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [cRes, sRes, stRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          fetch(`/api/prodoc-signatures?project_id=${projectId}`),
          fetch(`/api/prodoc-signatories?project_id=${projectId}`),
        ]);
        if (!cRes.ok || !sRes.ok || !stRes.ok) throw new Error("Failed to load signatures");
        if (cancelled) return;
        setContacts(await cRes.json());
        setSignatures(await sRes.json());
        setStandalones(await stRes.json());
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  const contactSig = (contactId: number) =>
    signatures.find((x) => x.party === "contact" && x.contact_id === contactId);
  const secretariatSig = signatures.find((x) => x.party === "secretariat");

  // Fallback for sessions minted before partner_id was carried.
  const singleOwner =
    contacts.length > 0 && contacts.every((c) => c.partner_id === contacts[0].partner_id);

  async function sign(party: "contact" | "secretariat", contactId?: number) {
    const key = party === "secretariat" ? "sec" : `c-${contactId}`;
    setBusy(key); setError(null);
    try {
      const res = await fetch("/api/prodoc-signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, party, contact_id: contactId ?? null }),
      });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to sign"); }
      const created: Signature = await res.json();
      setSignatures((prev) => [...prev.filter((x) => x.id !== created.id), created]);
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setBusy(null); }
  }

  async function unsign(sig: Signature, label: string) {
    if (!await confirm({ message: `Remove the signature for ${label}?`, confirmLabel: s.remove, variant: "default" })) return;
    const key = sig.party === "secretariat" ? "sec" : `c-${sig.contact_id}`;
    setBusy(key); setError(null);
    try {
      const res = await fetch(`/api/prodoc-signatures?id=${sig.id}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed to remove signature"); }
      setSignatures((prev) => prev.filter((x) => x.id !== sig.id));
    } catch (e) { setError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setBusy(null); }
  }

  async function addStandalone() {
    if (!form.name.trim()) { setNameError(s.nameRequired); return; }
    setNameError(null);
    setAddBusy(true);
    try {
      const res = await fetch("/api/prodoc-signatories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: form.title.trim() || null,
          signee_name: form.name.trim(),
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

  function cancelForm() {
    setShowForm(false);
    setForm(EMPTY_FORM);
    setNameError(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  // A signed state pill + (unless locked for this party) a remove button.
  const SignedState = ({ sig, label, canRemove }: { sig: Signature; label: string; canRemove: boolean }) => (
    <div className="flex items-center gap-2 shrink-0">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 text-green-800 px-2.5 py-1 text-xs font-medium">
        <Check className="size-3.5" />
        {s.signedOn} · {formatDate(sig.signed_at)}
      </span>
      {canRemove && (
        <button
          onClick={() => unsign(sig, label)}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label={s.remove}
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );

  const contactSignatories = contacts.filter((c) => c.relationship === "Signatory");
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
          <h3 className="text-sm font-semibold">{s.contactsHeading}</h3>
        </div>

        {!hasAny ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {s.emptySignatories}
          </div>
        ) : (
          <div className="rounded-xl border divide-y overflow-hidden">

            {/* Contact-derived signatories */}
            {contactSignatories.map((c) => {
              const sig = contactSig(c.contact_id);
              const label = c.name;
              const mine =
                !isAdmin &&
                (myPartnerId != null ? c.partner_id === myPartnerId : singleOwner);
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[c.role, c.relationship].filter(Boolean).join(" · ")}
                      {" · "}
                      <span className="italic">{s.viaContacts}</span>
                    </p>
                  </div>
                  {sig ? (
                    <SignedState sig={sig} label={label} canRemove={mine && !readOnly} />
                  ) : mine ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      disabled={readOnly || busy === `c-${c.contact_id}`}
                      onClick={() => sign("contact", c.contact_id)}
                    >
                      {busy === `c-${c.contact_id}`
                        ? <Loader2 className="size-4 animate-spin" />
                        : <><PenLine className="size-4 mr-1.5" />{s.sign}</>}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground italic">{s.awaitingPartner}</span>
                  )}
                </div>
              );
            })}

            {/* Standalone signatories */}
            {standalones.map((item) => {
              const subtext = [item.title, item.organization].filter(Boolean).join(" · ");
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{item.signee_name}</p>
                      <span className="shrink-0 inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {s.standaloneTag}
                      </span>
                    </div>
                    {subtext && (
                      <p className="text-xs text-muted-foreground truncate">{subtext}</p>
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
                  <label className="text-xs font-medium text-muted-foreground">
                    {s.fieldName} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    value={form.name}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); if (nameError) setNameError(null); }}
                    placeholder="Full name"
                    className={cn("h-8 text-sm", nameError && "border-destructive")}
                  />
                  {nameError && <p className="text-xs text-destructive">{nameError}</p>}
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
              <p className="text-xs text-muted-foreground">
                <span className="text-destructive">*</span> required
              </p>
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
          <h3 className="text-sm font-semibold">{s.secretariatHeading}</h3>
        </div>

        <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{s.secretariatHeading}</p>
            <p className="text-xs text-muted-foreground truncate">{s.secretariatSubtitle}</p>
          </div>
          {secretariatSig ? (
            <SignedState sig={secretariatSig} label={s.secretariatHeading} canRemove={isAdmin && !readOnly} />
          ) : isAdmin ? (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              disabled={readOnly || busy === "sec"}
              onClick={() => sign("secretariat")}
            >
              {busy === "sec"
                ? <Loader2 className="size-4 animate-spin" />
                : <><PenLine className="size-4 mr-1.5" />{s.sign}</>}
            </Button>
          ) : (
            <span className="shrink-0 text-xs text-muted-foreground italic">{s.awaitingSecretariat}</span>
          )}
        </div>
      </div>
    </div>
  );
}
