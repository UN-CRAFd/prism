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
  body: string;
  resolved: boolean;
  partner_addressed: boolean;
  author: string | null;
  created_at: string;
}

interface CommentsContextValue {
  enabled: boolean;
  // Partners can view comments but not add/resolve/delete them.
  readOnly: boolean;
  reportId: number | null;
  commentsFor: (section: string, itemId: number | null) => ItemComment[];
  add: (section: string, itemId: number | null, body: string) => Promise<void>;
  setResolved: (id: number, resolved: boolean) => Promise<void>;
  // Partner-side confirmation that a comment has been addressed.
  setAddressed: (id: number, addressed: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue>({
  enabled: false,
  readOnly: false,
  reportId: null,
  commentsFor: () => [],
  add: async () => {},
  setResolved: async () => {},
  setAddressed: async () => {},
  remove: async () => {},
});

export function useComments() {
  return useContext(CommentsContext);
}

// Loads every comment for a report once and hands them out per item. When
// `readOnly` (partner editor) the inline <ItemComments> only renders the icon
// for items that already have a comment and hides the add/resolve/delete UI.
export function CommentsProvider({
  reportId,
  enabled,
  readOnly = false,
  children,
}: {
  reportId: number | null;
  enabled: boolean;
  readOnly?: boolean;
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

  const add = useCallback(async (section: string, itemId: number | null, body: string) => {
    if (!reportId) return;
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reportId, section, itemId, body }),
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

  const remove = useCallback(async (id: number) => {
    const res = await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <CommentsContext.Provider value={{ enabled, readOnly, reportId, commentsFor, add, setResolved, setAddressed, remove }}>
      {children}
    </CommentsContext.Provider>
  );
}

// Inline comment affordance for a single item. Admins add/resolve/delete;
// partners (readOnly) only see the icon when a comment exists, view it on hover,
// and can confirm it as addressed. `itemId` null attaches to the section.
export function ItemComments({ section, itemId }: { section: string; itemId?: number | null }) {
  const { enabled, readOnly, commentsFor, add, setResolved, setAddressed, remove } = useComments();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The popover is rendered in a portal (see below) so the table's overflow-x-auto
  // wrapper can't clip it; this tracks where to anchor it to the trigger button.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  // Partners open the popover on hover; a short grace delay lets the pointer
  // travel from the trigger to the (portaled) panel without it closing.
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openNow = useCallback(() => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    setOpen(true);
  }, []);
  const scheduleClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  }, []);
  const hoverProps = readOnly ? { onMouseEnter: openNow, onMouseLeave: scheduleClose } : {};

  const POPOVER_WIDTH = 320; // w-80

  const reposition = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // Anchor the panel's right edge to the button's right edge, opening downward,
    // clamped so it never spills off the left of the viewport.
    const right = Math.max(8, window.innerWidth - r.right);
    setPos({ top: r.bottom + 4, right });
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

  if (!enabled) return null;

  const list = commentsFor(section, itemId ?? null);
  const unresolved = list.filter((c) => !c.resolved).length;

  // Partners only see the affordance when a comment already exists — they can't
  // create one, so an empty "add" trigger would be meaningless.
  if (readOnly && list.length === 0) return null;

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try { await add(section, itemId ?? null, body); setDraft(""); }
    finally { setBusy(false); }
  }

  return (
    <span className="relative inline-flex align-middle" {...hoverProps}>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={list.length ? `${list.length} comment${list.length > 1 ? "s" : ""}` : "Add a comment"}
        className={cn(
          "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors",
          unresolved > 0
            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
            : list.length > 0
            ? "border-border bg-muted/50 text-muted-foreground hover:bg-muted"
            : "border-transparent text-muted-foreground/50 hover:text-muted-foreground hover:border-border"
        )}
      >
        {list.length > 0 ? <MessageSquare className="size-3.5" /> : <MessageSquarePlus className="size-3.5" />}
        {list.length > 0 && <span className="tabular-nums font-medium">{list.length}</span>}
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <>
          {/* Admin dismisses by clicking outside; partners open on hover so the
              backdrop would only get in the way. */}
          {!readOnly && <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />}
          <div
            className="fixed z-50 w-80 rounded-lg border bg-popover shadow-lg text-popover-foreground"
            style={{ top: pos.top, right: pos.right, width: POPOVER_WIDTH }}
            {...hoverProps}
          >
            <div className="max-h-64 overflow-y-auto p-3 space-y-2">
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No comments yet.</p>
              ) : (
                list.map((c) => (
                  <div key={c.id} className={cn("rounded-md border px-2.5 py-2 text-xs", c.resolved ? "bg-muted/40 opacity-70" : "bg-card")}>
                    <p className={cn("whitespace-pre-wrap break-words", c.resolved && "line-through")}>{c.body}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatDate(c.created_at)}{c.resolved && " · resolved"}{readOnly && c.partner_addressed && " · confirmed"}</span>
                      {!readOnly ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setResolved(c.id, !c.resolved)}
                            title={c.resolved ? "Mark unresolved" : "Mark resolved"}
                            className={cn("hover:text-foreground transition-colors", c.resolved && "text-green-600")}
                          >
                            <Check className="size-3.5" />
                          </button>
                          <button type="button" onClick={() => remove(c.id)} title="Delete" className="hover:text-destructive transition-colors">
                            <Trash2 className="size-3.5" />
                          </button>
                        </span>
                      ) : c.partner_addressed ? (
                        <Button size="sm" variant="outline" className="h-5 px-1.5 gap-1 text-[10px]" onClick={() => setAddressed(c.id, false)}>
                          <RotateCcw className="size-3" /> Undo
                        </Button>
                      ) : (
                        <Button size="sm" className="h-5 px-1.5 gap-1 text-[10px]" onClick={() => setAddressed(c.id, true)}>
                          <Check className="size-3" /> Confirm
                        </Button>
                      )}
                    </div>
                  </div>
                ))
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
