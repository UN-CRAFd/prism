"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MessageSquare, MessageSquarePlus, Check, Trash2, Loader2 } from "lucide-react";
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
  reportId: number | null;
  commentsFor: (section: string, itemId: number | null) => ItemComment[];
  add: (section: string, itemId: number | null, body: string) => Promise<void>;
  setResolved: (id: number, resolved: boolean) => Promise<void>;
  remove: (id: number) => Promise<void>;
}

const CommentsContext = createContext<CommentsContextValue>({
  enabled: false,
  reportId: null,
  commentsFor: () => [],
  add: async () => {},
  setResolved: async () => {},
  remove: async () => {},
});

export function useComments() {
  return useContext(CommentsContext);
}

// Loads every comment for a report once and hands them out per item. Only active
// (`enabled`) in the admin editor; in the partner editor it's a no-op so the
// inline <ItemComments> triggers render nothing.
export function CommentsProvider({
  reportId,
  enabled,
  children,
}: {
  reportId: number | null;
  enabled: boolean;
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

  const remove = useCallback(async (id: number) => {
    const res = await fetch(`/api/comments?id=${id}`, { method: "DELETE" });
    if (res.ok) setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  return (
    <CommentsContext.Provider value={{ enabled, reportId, commentsFor, add, setResolved, remove }}>
      {children}
    </CommentsContext.Provider>
  );
}

// Inline comment affordance for a single item. Renders nothing unless comments
// are enabled (admin editor). `itemId` null attaches the comment to the section.
export function ItemComments({ section, itemId }: { section: string; itemId?: number | null }) {
  const { enabled, commentsFor, add, setResolved, remove } = useComments();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  // The popover is rendered in a portal (see below) so the table's overflow-x-auto
  // wrapper can't clip it; this tracks where to anchor it to the trigger button.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

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

  async function submit() {
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try { await add(section, itemId ?? null, body); setDraft(""); }
    finally { setBusy(false); }
  }

  return (
    <span className="relative inline-flex align-middle">
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
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 w-80 rounded-lg border bg-popover shadow-lg text-popover-foreground"
            style={{ top: pos.top, right: pos.right, width: POPOVER_WIDTH }}
          >
            <div className="max-h-64 overflow-y-auto p-3 space-y-2">
              {list.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">No comments yet.</p>
              ) : (
                list.map((c) => (
                  <div key={c.id} className={cn("rounded-md border px-2.5 py-2 text-xs", c.resolved ? "bg-muted/40 opacity-70" : "bg-card")}>
                    <p className={cn("whitespace-pre-wrap break-words", c.resolved && "line-through")}>{c.body}</p>
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatDate(c.created_at)}{c.resolved && " · resolved"}</span>
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
                    </div>
                  </div>
                ))
              )}
            </div>
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
          </div>
        </>,
        document.body
      )}
    </span>
  );
}
