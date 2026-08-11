"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ArrowUp, ArrowDown, Eye, EyeOff, Trash2, Plus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutosave, AutosaveIndicator, type SaveState } from "@/components/autosave";
import { richTextLength } from "@/lib/richtext";
import { WIKI_ICON_NAMES, wikiIcon, DEFAULT_WIKI_ICON } from "@/lib/wiki";
import labels from "@/lib/labels.json";

// ── Guide (wiki) editor ───────────────────────────────────────────────────────
// Admin editor for the partner-facing Guide. One card per section: title, icon,
// and a rich-text body. Title + body edits debounce-autosave via the shared
// useAutosave controller (only dirty fields PATCH). Discrete actions — icon
// change, show/hide, reorder, delete, add — PATCH/POST/DELETE immediately.

const MAX_CHARS = 12000;

type Section = {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  body_html: string;
  sort_order: number;
  hidden: boolean;
};

type Saved = { title: string; body_html: string };

export function GuideEditor() {
  const confirm = useConfirm();
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Current sections + the last-persisted title/body per id, kept in refs so the
  // autosave flush closure always sees current state.
  const sectionsRef = useRef<Section[]>([]);
  sectionsRef.current = sections;
  const savedRef = useRef<Record<number, Saved>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki-sections");
      if (!res.ok) throw new Error("Failed to load guide sections");
      const rows: Section[] = await res.json();
      setSections(rows);
      const snap: Record<number, Saved> = {};
      for (const s of rows) snap[s.id] = { title: s.title, body_html: s.body_html };
      savedRef.current = snap;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Save every section whose title or body diverged from its saved snapshot. The
  // snapshot is advanced only after the PATCH succeeds, so mid-save edits survive.
  const flush = useCallback(async () => {
    for (const s of sectionsRef.current) {
      const saved = savedRef.current[s.id];
      if (saved && saved.title === s.title && saved.body_html === s.body_html) continue;
      const res = await fetch("/api/wiki-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: s.id, title: s.title, body_html: s.body_html }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: Section = await res.json();
      savedRef.current[s.id] = { title: updated.title, body_html: updated.body_html };
    }
  }, []);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: setSaveState });

  // Flush any pending edit on unmount.
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const editField = (id: number, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    schedule();
  };

  // Immediate PATCH for discrete (non-typed) changes: icon, hidden, sort_order.
  const patchNow = useCallback(async (id: number, patch: Partial<Section>) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      const res = await fetch("/api/wiki-sections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, ...patch }),
      });
      if (!res.ok) throw new Error("Failed to save");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  }, []);

  // Reorder by swapping this section's sort_order with its neighbour's, then
  // persisting both. Local state re-sorts on the new orders.
  const move = async (id: number, dir: -1 | 1) => {
    const ordered = [...sectionsRef.current];
    const idx = ordered.findIndex((s) => s.id === id);
    const swapIdx = idx + dir;
    if (idx < 0 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const a = ordered[idx];
    const b = ordered[swapIdx];
    ordered[idx] = { ...b, sort_order: a.sort_order };
    ordered[swapIdx] = { ...a, sort_order: b.sort_order };
    ordered.sort((x, y) => x.sort_order - y.sort_order);
    setSections(ordered);
    await Promise.all([
      fetch("/api/wiki-sections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: a.id, sort_order: b.sort_order }) }),
      fetch("/api/wiki-sections", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: b.id, sort_order: a.sort_order }) }),
    ]).catch(() => setError("Failed to reorder"));
  };

  const handleAdd = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/wiki-sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, icon: DEFAULT_WIKI_ICON }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to add section"); }
      const created: Section = await res.json();
      setSections((prev) => [...prev, created]);
      savedRef.current[created.id] = { title: created.title, body_html: created.body_html };
      setDraftTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (s: Section) => {
    if (!await confirm({ message: labels.guideEditor.deleteConfirm })) return;
    setError(null);
    try {
      const res = await fetch(`/api/wiki-sections?id=${s.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete section");
      setSections((prev) => prev.filter((x) => x.id !== s.id));
      delete savedRef.current[s.id];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
        <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {sections.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          {labels.guideEditor.empty}
        </div>
      )}

      {sections.map((s, i) => {
        const Icon = wikiIcon(s.icon);
        const len = richTextLength(s.body_html);
        return (
          <div
            key={s.id}
            className={cn(
              "rounded-xl border bg-card p-5 space-y-4 transition-colors",
              s.hidden && "opacity-70 border-dashed"
            )}
          >
            {/* Header row: icon + title + reorder / hide / delete controls */}
            <div className="flex items-start gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-foreground">
                <Icon className="size-4.5" />
              </div>
              <div className="flex-1 space-y-1.5">
                <Input
                  value={s.title}
                  onChange={(e) => editField(s.id, { title: e.target.value })}
                  placeholder={labels.guideEditor.titleLabel}
                  className="font-medium"
                />
                <p className="text-[11px] text-muted-foreground font-mono">#{s.slug}</p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Select value={s.icon ?? DEFAULT_WIKI_ICON} onValueChange={(v) => patchNow(s.id, { icon: v })}>
                  <SelectTrigger className="h-9 w-[140px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WIKI_ICON_NAMES.map((name) => {
                      const OptIcon = wikiIcon(name);
                      return (
                        <SelectItem key={name} value={name}>
                          <span className="flex items-center gap-2">
                            <OptIcon className="size-3.5" /> {name}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>

                <div className="flex items-center rounded-md border overflow-hidden">
                  <button
                    onClick={() => move(s.id, -1)}
                    disabled={i === 0}
                    aria-label={labels.guideEditor.moveUp}
                    title={labels.guideEditor.moveUp}
                    className="px-2 py-2 text-muted-foreground hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button
                    onClick={() => move(s.id, 1)}
                    disabled={i === sections.length - 1}
                    aria-label={labels.guideEditor.moveDown}
                    title={labels.guideEditor.moveDown}
                    className="px-2 py-2 border-l text-muted-foreground hover:bg-muted/50 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                  >
                    <ArrowDown className="size-3.5" />
                  </button>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  onClick={() => patchNow(s.id, { hidden: !s.hidden })}
                  aria-label={s.hidden ? labels.guideEditor.show : labels.guideEditor.hide}
                  title={s.hidden ? labels.guideEditor.show : labels.guideEditor.hide}
                >
                  {s.hidden ? <EyeOff className="size-4 text-amber-600" /> : <Eye className="size-4" />}
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(s)}
                  aria-label={labels.guideEditor.delete}
                  title={labels.guideEditor.delete}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>

            {s.hidden && (
              <p className="text-xs text-amber-700">{labels.guideEditor.hiddenNote}</p>
            )}

            {/* Body */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{labels.guideEditor.bodyLabel}</p>
              <RichTextEditor
                value={s.body_html}
                onChange={(html) => editField(s.id, { body_html: html })}
                placeholder={labels.guideEditor.bodyPlaceholder}
              />
              <div
                className={cn(
                  "text-[11px] text-right tabular-nums",
                  len >= MAX_CHARS ? "text-amber-600 font-medium" : "text-muted-foreground"
                )}
              >
                {len.toLocaleString()}/{MAX_CHARS.toLocaleString()} characters
              </div>
            </div>
          </div>
        );
      })}

      {/* Add a section */}
      <div className="rounded-xl border border-dashed bg-muted/20 p-4 flex gap-2">
        <Input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
          placeholder={labels.guideEditor.newSectionTitle}
          className="flex-1"
        />
        <Button onClick={handleAdd} disabled={adding || !draftTitle.trim()} className="shrink-0">
          {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />{labels.guideEditor.addSection}</>}
        </Button>
      </div>

      {/* Floating save state (bottom-right) */}
      <div className="sticky bottom-4 flex justify-end pointer-events-none">
        <div className="pointer-events-auto rounded-full border bg-card px-3 py-1.5 shadow-sm">
          <AutosaveIndicator state={saveState} idleAsSaved />
        </div>
      </div>
    </div>
  );
}
