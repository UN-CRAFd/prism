"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, MessageSquarePlus, Check, Trash2, Loader2, RotateCcw } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export interface ItemComment {
  id: number;
  report_id: number;
  section: string;
  item_id: number | null;
  parent_id: number | null;
  body: string;
  resolved: boolean;
  partner_addressed: boolean;
  author: string | null;
  author_role?: string | null;
  created_at: string;
  partner_short_name?: string | null;
  partner_long_name?: string | null;
}

interface CommentsContextValue {
  enabled: boolean;
  readOnly: boolean;
  role: string;
  reportId: number | null;
  commentsFor: (section: string, itemId: number | null) => ItemComment[];
  add: (section: string, itemId: number | null, body: string, parentId?: number | null) => Promise<void>;
  setResolved: (id: number, resolved: boolean) => Promise<void>;
  setAddressed: (id: number, addressed: boolean) => Promise<void>;
  updateBody: (id: number, body: string) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue>({
  enabled: false,
  readOnly: false,
  role: "admin",
  reportId: null,
  commentsFor: () => [],
  add: async () => {},
  setResolved: async () => {},
  setAddressed: async () => {},
  updateBody: async () => {},
  remove: async () => {},
});

export function useComments() {
  return useContext(CommentsContext);
}

// Loads every comment for a report once and hands them out per item.
// `role` drives which controls are shown; `readOnly` controls interactivity only.
export function CommentsProvider({
  reportId,
  enabled,
  readOnly = false,
  role = "admin",
  children,
}: {
  reportId: number | null;
  enabled: boolean;
  readOnly?: boolean;
  role?: string;
  children: ReactNode;
}) {
  const [comments, setComments] = useState<ItemComment[]>([]);

  useEffect(() => {
    if (!enabled || !reportId) { setComments([]); return; }
    let alive = true;
    fetch(`/api/comments?reportId=${reportId}`)
      .then((r) => r.json())
      .then((data: ItemComment[]) => { if (alive) setComments(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [reportId, enabled]);

  const commentsFor = useCallback(
    (section: string, itemId: number | null) =>
      comments.filter((c) => c.section === section && (c.item_id ?? null) === (itemId ?? null)),
    [comments]
  );

  const add = useCallback(async (section: string, itemId: number | null, body: string, parentId?: number | null) => {
    if (!reportId) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, section, itemId, body, ...(parentId != null ? { parentId } : {}) }),
    });
    if (res.ok) { const created = await res.json(); setComments((prev) => [...prev, created]); }
  }, [reportId]);

  const setResolved = useCallback(async (id: number, resolved: boolean) => {
    const res = await fetch("/api/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, resolved }),
    });
    if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? { ...c, resolved } : c)));
  }, []);

  // Optimistic; reverts on failure. Mirrors the partner homepage confirmation.
  const setAddressed = useCallback(async (id: number, addressed: boolean) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, partner_addressed: addressed } : c)));
    try {
      const res = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, partner_addressed: addressed }),
      });
      if (!res.ok) throw new Error("failed");
    } catch {
      setComments((prev) => prev.map((c) => (c.id === id ? { ...c, partner_addressed: !addressed } : c)));
    }
  }, []);

  const updateBody = useCallback(async (id: number, body: string) => {
    const res = await fetch("/api/comments", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, body }),
    });
    if (res.ok) setComments((prev) => prev.map((c) => (c.id === id ? { ...c, body } : c)));
  }, []);

  const remove = useCallback(async (id: number) => {
    const res = await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <CommentsContext.Provider value={{ enabled, readOnly, role, reportId, commentsFor, add, setResolved, setAddressed, updateBody, remove }}>
      {children}
    </CommentsContext.Provider>
  );
}

// Inline comment affordance for a single item. Admins add/archive/delete;
// partners only see the icon when a comment exists and can mark it resolved.
// `readOnly` makes controls non-interactive; `role` decides which controls appear.
// `itemId` null attaches to the section.
export function ItemComments({ section, itemId }: { section: string; itemId?: number | null }) {
  const { enabled, readOnly, role, commentsFor, add, setResolved, setAddressed, updateBody, remove } = useComments();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [archivedOpen, setArchivedOpen] = useState(false);
  // id of the top-level comment whose reply box is open; null = none
  const [openReplyId, setOpenReplyId] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [replyBusy, setReplyBusy] = useState(false);
  // id of the comment or reply being edited; null = none
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [editBusy, setEditBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The popover is rendered in a portal (see below) so the table's overflow-x-auto
  // wrapper can't clip it; this tracks where to anchor it to the trigger button.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  // Both admins and partners open/close the popover with a click. Dismiss via
  // clicking the trigger again, clicking outside the panel, or pressing Escape.
  const panelRef = useRef<HTMLDivElement>(null);

  const POPOVER_WIDTH = 320; // w-80

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const panelHeight = panelRef.current?.offsetHeight ?? 0;
    // Anchor below the button, then clamp so the panel stays within the viewport
    // even when the trigger scrolls off-screen.
    const preferred = r.bottom + 4;
    const maxTop = window.innerHeight - panelHeight - margin;
    const top = Math.min(Math.max(preferred, margin), Math.max(maxTop, margin));
    const right = Math.max(margin, window.innerWidth - r.right);
    setPos({ top, right });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    reposition();
    // Follow the button while the underlying table / page scrolls.
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        btnRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  if (!enabled) return null;

  const list = commentsFor(section, itemId ?? null);
  // Replies are threaded beneath their parent; they don't count as top-level comments.
  const allReplies = list.filter((c) => c.parent_id !== null);
  // Archived (resolved) comments are hidden from the main list for both roles.
  // Admins get a collapsed disclosure at the bottom to view and un-archive them.
  const mainList = list.filter((c) => c.parent_id === null && !c.resolved);
  const archivedList = list.filter((c) => c.parent_id === null && c.resolved);
  // Badge goes amber while there are open, unacknowledged top-level comments.
  const pendingCount = role === "partner"
    ? mainList.filter((c) => !c.partner_addressed).length
    : mainList.length;

  // Partners only see the affordance when a comment already exists — they can't
  // create one, so an empty "add" trigger would be meaningless.
  if (readOnly && mainList.length === 0) return null;

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try { await add(section, itemId ?? null, body); setDraft(""); }
    finally { setBusy(false); }
  }

  async function submitReply(parentId: number) {
    const body = replyDraft.trim();
    if (!body) return;
    setReplyBusy(true);
    try {
      await add(section, itemId ?? null, body, parentId);
      setReplyDraft("");
      setOpenReplyId(null);
    } finally {
      setReplyBusy(false);
    }
  }

  async function saveEdit(id: number) {
    const body = editDraft.trim();
    if (!body) return;
    setEditBusy(true);
    try {
      await updateBody(id, body);
      setEditingId(null);
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <span className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={mainList.length ? `${mainList.length} comment${mainList.length > 1 ? "s" : ""}` : "Add a comment"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
          pendingCount > 0
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : mainList.length > 0
            ? "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
            : "border-transparent text-muted-foreground/50 hover:text-muted-foreground hover:border-border"
        )}
      >
        {mainList.length > 0 ? <MessageSquare className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}
        {mainList.length > 0 && <span className="tabular-nums font-medium">{mainList.length}</span>}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          <div
            ref={panelRef}
            className="fixed z-50 w-80 rounded-lg border bg-popover shadow-lg text-popover-foreground"
            style={{ top: pos.top, right: pos.right, width: POPOVER_WIDTH }}
          >
            <div className="max-h-64 overflow-y-auto p-3 space-y-2">
              {mainList.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No comments yet.</p>
              ) : (
                mainList.map((c) => {
                  const replies = allReplies.filter((r) => r.parent_id === c.id);
                  return (
                    <div key={c.id} className={cn("rounded-md border px-2.5 py-2 text-xs", c.partner_addressed ? "bg-muted/40 opacity-70" : "bg-card")}>
                      {role === "admin" && c.author_role === "admin" && editingId === c.id ? (
                        <div className="space-y-1">
                          <Textarea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            className="text-xs min-h-[56px] resize-none"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(c.id); }}
                          />
                          <div className="flex items-center justify-between">
                            <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                            <Button size="sm" className="h-6 text-[10px]" onClick={() => saveEdit(c.id)} disabled={editBusy || !editDraft.trim()}>
                              {editBusy ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                                                    <p className="whitespace-pre-wrap break-words">{c.body}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>
                              {formatDate(c.created_at)}
                              {c.partner_addressed && ` · resolved by ${c.partner_long_name ?? c.partner_short_name ?? "partner"}`}
                            </span>
                            {role === "partner" ? (
                              c.partner_addressed ? (
                                <Button size="sm" variant="outline" className="h-5 px-1.5 gap-1 text-[10px]" onClick={() => setAddressed(c.id, false)}>
                                  <RotateCcw className="size-3" /> Undo
                                </Button>
                              ) : (
                                <Button size="sm" className="h-5 px-1.5 gap-1 text-[10px]" onClick={() => setAddressed(c.id, true)}>
                                  <Check className="size-3" /> Resolve
                                </Button>
                              )
                            ) : (
                              <span className="flex items-center gap-1.5">
                                {c.author_role === "admin" && !c.partner_addressed && (
                                  <button type="button" onClick={() => { setEditingId(c.id); setEditDraft(c.body); }} disabled={readOnly} className="hover:text-foreground transition-colors disabled:opacity-40">
                                    Edit
                                  </button>
                                )}
                                <Button size="sm" variant="outline" className="h-5 px-1.5 text-[10px]" onClick={() => setResolved(c.id, true)} disabled={readOnly}>
                                  Archive
                                </Button>
                                <button type="button" onClick={() => remove(c.id)} title="Delete" disabled={readOnly} className="hover:text-destructive transition-colors disabled:opacity-40">
                                  <Trash2 className="size-3.5" />
                                </button>
                              </span>
                            )}
                          </div>
                        </>
                      )}
                      {/* Replies */}
                      {replies.length > 0 && (
                        <div className="mt-2 space-y-1.5 border-l-2 border-border pl-2.5">
                          {replies.map((r) => (
                            <div key={r.id}>
                              {editingId === r.id ? (
                                <div className="space-y-1">
                                  <Textarea
                                    value={editDraft}
                                    onChange={(e) => setEditDraft(e.target.value)}
                                    className="text-xs min-h-[44px] resize-none"
                                    autoFocus
                                    onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) saveEdit(r.id); }}
                                  />
                                  <div className="flex items-center justify-between">
                                    <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground transition-colors" onClick={() => setEditingId(null)}>
                                      Cancel
                                    </button>
                                    <Button size="sm" className="h-6 text-[10px]" onClick={() => saveEdit(r.id)} disabled={editBusy || !editDraft.trim()}>
                                      {editBusy ? <Loader2 className="size-3 animate-spin" /> : "Save"}
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="whitespace-pre-wrap break-words text-[11px]">{r.body}</p>
                                  <div className="mt-0.5 flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>{r.author_role === "admin" ? "CRAF'd" : (r.author ?? "Partner")} · {formatDate(r.created_at)}</span>
                                    {((role === "partner" && r.author_role === "partner") || (role === "admin" && r.author_role === "admin" && !readOnly)) && !c.partner_addressed && (
                                      <button type="button" className="hover:text-foreground transition-colors disabled:opacity-40" onClick={() => { setEditingId(r.id); setEditDraft(r.body); }}>
                                        Edit
                                      </button>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* Reply affordance — not gated by readOnly; hidden when thread is resolved */}
                      {!c.partner_addressed && (
                        <div className="mt-1.5">
                          {openReplyId === c.id ? (
                            <div className="space-y-1">
                              <Textarea
                                value={replyDraft}
                                onChange={(e) => setReplyDraft(e.target.value)}
                                placeholder="Write a reply…"
                                className="text-xs min-h-[44px] resize-none"
                                autoFocus
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submitReply(c.id); }}
                              />
                              <div className="flex items-center justify-between">
                                <button
                                  type="button"
                                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                                  onClick={() => { setOpenReplyId(null); setReplyDraft(""); }}
                                >
                                  Cancel
                                </button>
                                <Button size="sm" className="h-6 text-[10px]" onClick={() => submitReply(c.id)} disabled={replyBusy || !replyDraft.trim()}>
                                  {replyBusy ? <Loader2 className="size-3 animate-spin" /> : "Reply"}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => { setOpenReplyId(c.id); setReplyDraft(""); }}
                            >
                              Reply
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              {role === "admin" && archivedList.length > 0 && (
                <div className="border-t pt-2">
                  <button
                    type="button"
                    onClick={() => setArchivedOpen((o) => !o)}
                    className="w-full text-left text-[10px] text-muted-foreground hover:text-foreground transition-colors px-0.5 py-0.5"
                  >
                    {archivedOpen ? "▾" : "▸"} Archived ({archivedList.length})
                  </button>
                  {archivedOpen && (
                    <div className="mt-1.5 space-y-1.5">
                      {archivedList.map((c) => (
                        <div key={c.id} className="rounded-md border px-2.5 py-2 text-xs bg-muted/40 opacity-70">
                          <p className="whitespace-pre-wrap break-words text-muted-foreground">{c.body}</p>
                          <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                            <span>{formatDate(c.created_at)}</span>
                            <Button size="sm" variant="outline" className="h-5 px-1.5 gap-1 text-[10px]" onClick={() => setResolved(c.id, false)} disabled={readOnly}>
                              <RotateCcw className="size-3" /> Unarchive
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {!readOnly && (
              <div className="border-t p-2.5 space-y-2">
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Add a comment…"
                  className="text-xs min-h-[56px] resize-none"
                  onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(); }}
                />
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-xs" onClick={submit} disabled={busy || !draft.trim()}>
                    {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Comment"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </>,
        document.body
      )}
    </span>
  );
}
