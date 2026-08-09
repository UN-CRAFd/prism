"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn, formatDate } from "@/lib/utils";
import { Loader2, PenLine, Check, X, Users, ShieldCheck } from "lucide-react";
import labels from "@/lib/labels.json";

// ── Signatures editor ─────────────────────────────────────────────────────────
// Sign-off on the project document. Project contacts (from the General
// Information tab) are signed by the partner; the CRAF'd Secretariat row is
// signed by an admin. Click-to-sign: signing stamps a date, un-signing removes
// it. The signatures render on the exported project document. Immediate saves
// (no autosave) — each action hits /api/prodoc-signatures directly.

const s = labels.signatures;

interface ProjectContact {
  id: number;         // project_contacts link id
  contact_id: number; // partner_contacts id
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
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const [cRes, sRes] = await Promise.all([
          fetch(`/api/project-contacts?project_id=${projectId}`),
          fetch(`/api/prodoc-signatures?project_id=${projectId}`),
        ]);
        if (!cRes.ok || !sRes.ok) throw new Error("Failed to load signatures");
        if (cancelled) return;
        setContacts(await cRes.json());
        setSignatures(await sRes.json());
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

      {/* Project contacts */}
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">{s.contactsHeading}</h3>
        </div>

        {contacts.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
            {s.emptyContacts}
          </div>
        ) : (
          <div className="rounded-xl border divide-y overflow-hidden">
            {contacts.map((c) => {
              const sig = contactSig(c.contact_id);
              const label = c.name;
              return (
                <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {(c.role || c.relationship) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[c.role, c.relationship].filter(Boolean).join(" · ")}
                      </p>
                    )}
                  </div>
                  {sig ? (
                    // Contact sign-off is the partner's; an admin sees it read-only.
                    <SignedState sig={sig} label={label} canRemove={!isAdmin && !readOnly} />
                  ) : isAdmin ? (
                    <span className="shrink-0 text-xs text-muted-foreground italic">{s.awaitingPartner}</span>
                  ) : (
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
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* CRAF'd Secretariat */}
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
