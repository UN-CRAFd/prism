"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MessageSquare, ArrowRight, Pencil, Check, X, RotateCcw, Loader2, Send, CheckCircle2, Archive, Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PageHeader, LoadingState, ErrorBanner } from "@/components/admin/shared";
import { CommentContextBadges } from "@/components/comment-context-badges";

interface AdminComment {
  id: number;
  report_id: number;
  section: string;
  item_id: number | null;
  body: string;
  resolved: boolean;           // CRAF'd-side confirmation
  partner_addressed: boolean;  // partner-side confirmation
  created_at: string;
  year: number;
  report_type: "annual" | "final" | null;
  project_title: string;
  project_short_name: string | null;
  partner_short_name: string | null;
  item_label: string | null;
}

function toSlug(c: AdminComment): string {
  return (c.project_short_name ?? c.project_title).toLowerCase().replace(/\s+/g, "-");
}

export default function AdminCommentsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/comments?scope=admin");
      if (!res.ok) throw new Error("Failed to load comments");
      setComments(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Single PATCH helper; merges the returned row back into local state.
  async function patch(id: number, fields: Partial<Pick<AdminComment, "body" | "resolved" | "partner_addressed">>) {
    setBusyId(id);
    try {
      const res = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...fields }),
      });
      if (!res.ok) throw new Error("failed");
      const updated: AdminComment = await res.json();
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, ...updated } : c)));
    } catch {
      setError("Failed to update the comment. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  // Hard-delete a comment (admin-only). Removes it from every list on success.
  async function handleDelete(c: AdminComment) {
    if (!await confirm({ message: "Delete this comment permanently? This cannot be undone." })) return;
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/comments?id=${c.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("failed");
      setComments((prev) => prev.filter((x) => x.id !== c.id));
    } catch {
      setError("Failed to delete the comment. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  function startEdit(c: AdminComment) { setEditingId(c.id); setDraft(c.body); }
  function cancelEdit() { setEditingId(null); setDraft(""); }
  async function saveEdit(id: number) {
    const body = draft.trim();
    if (body) await patch(id, { body });
    cancelEdit();
  }

  // Confirm = CRAF'd marks it addressed (→ Archived). Deny/Reopen = not
  // addressed → also reset the partner's confirmation so it reappears as
  // outstanding on their side (back to Sent out).
  const confirmAddressed = (c: AdminComment) => patch(c.id, { resolved: true });
  const denyAddressed = (c: AdminComment) => patch(c.id, { resolved: false, partner_addressed: false });
  const reopen = denyAddressed;

  // resolved = CRAF'd confirmed → Archived. Otherwise split by whether the
  // partner has marked it addressed yet.
  const { completed, sentOut, archived } = useMemo(() => {
    const completed: AdminComment[] = [];
    const sentOut: AdminComment[] = [];
    const archived: AdminComment[] = [];
    for (const c of comments) {
      if (c.resolved) archived.push(c);
      else if (c.partner_addressed) completed.push(c);
      else sentOut.push(c);
    }
    return { completed, sentOut, archived };
  }, [comments]);

  function CommentCard({ c }: { c: AdminComment }) {
    const editing = editingId === c.id;
    const busy = busyId === c.id;
    const archived = c.resolved;
    return (
      <div className={cn("rounded-xl border bg-card", archived && "bg-muted/30 opacity-70")}>
        <div className="flex items-start gap-3 p-4">
          <MessageSquare className={cn("size-4 mt-0.5 shrink-0", archived ? "text-muted-foreground/50" : "text-amber-500")} />
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  className="text-sm min-h-[72px] resize-y"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(c.id); if (e.key === "Escape") cancelEdit(); }}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                  <Button size="sm" onClick={() => saveEdit(c.id)} disabled={busy || !draft.trim()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <p className={cn("text-sm", archived && "line-through text-muted-foreground")}>{c.body}</p>
            )}

            <div className={cn("flex items-center justify-between gap-2 mt-2", archived && "opacity-80")}>
              <CommentContextBadges
                partner={c.partner_short_name}
                reportType={c.report_type}
                year={c.year}
                project={c.project_short_name ?? c.project_title}
                section={c.section}
                itemLabel={c.item_label}
                className="!gap-1"
              />
              {/* Confirmation buttons right-aligned */}
              <div className="flex items-center gap-1 shrink-0">
                {archived ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-xs" onClick={() => reopen(c)} disabled={busy}>
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Reopen
                  </Button>
                ) : c.partner_addressed ? (
                  <>
                    <Button size="sm" className="h-6 px-2 gap-1 text-xs" onClick={() => confirmAddressed(c)} disabled={busy}>
                      {busy ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Confirm
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 gap-1 text-xs" onClick={() => denyAddressed(c)} disabled={busy}>
                      <X className="size-3" /> Deny
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {!editing && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => startEdit(c)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Edit comment text"
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                onClick={() => router.push(`/admin/report-editor/${toSlug(c)}/${c.year}/${c.section}`)}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                title="Open in report editor"
              >
                <ArrowRight className="size-3.5" />
              </button>
              <button
                onClick={() => handleDelete(c)}
                disabled={busy}
                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-accent transition-colors disabled:opacity-40"
                title="Delete comment"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Comments" description="Feedback sent to partners across all reports" />

      <div className="flex-1 overflow-auto px-8 py-6 space-y-8">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : comments.length === 0 ? (
          <div className="rounded-lg border border-dashed py-16 text-center text-sm text-muted-foreground">
            No comments yet. Add feedback from the report editor and it appears here.
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-green-600" />
                <h2 className="text-base font-semibold">Completed by partner</h2>
                <span className="text-xs text-muted-foreground">confirm or deny · {completed.length}</span>
              </div>
              {completed.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">No comments awaiting your confirmation.</p>
              ) : (
                <div className="space-y-2.5">{completed.map((c) => <CommentCard key={c.id} c={c} />)}</div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Send className="size-4 text-amber-500" />
                <h2 className="text-base font-semibold">Sent out</h2>
                <span className="text-xs text-muted-foreground">awaiting the partner · {sentOut.length}</span>
              </div>
              {sentOut.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Nothing outstanding.</p>
              ) : (
                <div className="space-y-2.5">{sentOut.map((c) => <CommentCard key={c.id} c={c} />)}</div>
              )}
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Archive className="size-4 text-muted-foreground" />
                <h2 className="text-base font-semibold">Archived</h2>
                <span className="text-xs text-muted-foreground">confirmed by CRAF&apos;d · {archived.length}</span>
              </div>
              {archived.length === 0 ? (
                <p className="text-sm text-muted-foreground px-1">Nothing archived yet.</p>
              ) : (
                <div className="space-y-2.5">{archived.map((c) => <CommentCard key={c.id} c={c} />)}</div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
