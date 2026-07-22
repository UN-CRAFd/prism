"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutosave, type SaveState } from "@/components/autosave";
import labels from "@/lib/labels.json";

// ── Narratives editor ─────────────────────────────────────────────────────────
// Project-level proposal narratives on the project document. One card per
// narrative question (defined in labels.json), each with a main answer and an
// editable comment. Debounced autosave via the shared useAutosave controller,
// with a single AutosaveIndicator — matching the report editor.

const QUESTIONS = labels.narratives.questions;
const MAX_CHARS = 4500;

type Entry = { answer: string; comment: string };
const EMPTY: Entry = { answer: "", comment: "" };

export function NarrativesAdminEditor({
  projectId,
  onSaveStateChange,
  readOnly = false,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  // When the prodoc is view-only, the blue instructions box is hidden (the
  // parent shows the amber view-only bar instead).
  readOnly?: boolean;
}) {
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entriesRef = useRef<Record<string, Entry>>({});
  entriesRef.current = entries;
  // Last value persisted for each key — used to detect dirty entries.
  const savedRef = useRef<Record<string, Entry>>({});

  const entryOf = (key: string): Entry => entries[key] ?? EMPTY;

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/project-narratives?project_id=${projectId}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load narratives"); return r.json(); })
      .then((rows: { narrative_key: string; answer: string | null; comment: string | null }[]) => {
        const map: Record<string, Entry> = {};
        for (const row of rows) map[row.narrative_key] = { answer: row.answer ?? "", comment: row.comment ?? "" };
        setEntries(map);
        savedRef.current = JSON.parse(JSON.stringify(map));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Save every dirty narrative. A key's saved snapshot is only advanced once the
  // PATCH succeeds, so edits made mid-save aren't lost.
  const flush = useCallback(async () => {
    for (const q of QUESTIONS) {
      const cur = entriesRef.current[q.key] ?? EMPTY;
      const saved = savedRef.current[q.key] ?? EMPTY;
      if (cur.answer === saved.answer && cur.comment === saved.comment) continue;
      const res = await fetch("/api/project-narratives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, narrative_key: q.key, answer: cur.answer, comment: cur.comment }),
      });
      if (!res.ok) throw new Error("Failed to save");
      savedRef.current[q.key] = { ...cur };
    }
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const update = (key: string, patch: Partial<Entry>) => {
    setEntries((prev) => ({ ...prev, [key]: { ...(prev[key] ?? EMPTY), ...patch } }));
    schedule();
  };

  const isDirty = (key: string) => {
    const saved = savedRef.current[key] ?? EMPTY;
    const cur = entryOf(key);
    return saved.answer !== cur.answer || saved.comment !== cur.comment;
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
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

      {!readOnly && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          {labels.tabInstructions.narratives}
        </div>
      )}

      {QUESTIONS.map((q, i) => {
        const { answer, comment } = entryOf(q.key);
        return (
          <div
            key={q.key}
            className={cn(
              "rounded-xl border bg-card p-5 space-y-3 transition-colors",
              isDirty(q.key) && "border-amber-200"
            )}
          >
            <div className="flex items-start gap-3">
              <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{i + 1}.</span>
              <label className="text-sm font-medium leading-snug flex-1">{q.label}</label>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Narrative answer */}
              <div className="lg:col-span-2 space-y-1.5">
                <p className="text-xs text-muted-foreground">{labels.narratives.answerLabel}</p>
                <Textarea
                  value={answer}
                  maxLength={MAX_CHARS}
                  onChange={(e) => update(q.key, { answer: e.target.value })}
                  placeholder={labels.narratives.placeholder}
                  className="min-h-[180px] resize-y text-sm leading-relaxed"
                />
                <div
                  className={cn(
                    "text-[11px] text-right tabular-nums",
                    answer.length >= MAX_CHARS ? "text-amber-600 font-medium" : "text-muted-foreground"
                  )}
                >
                  {answer.length.toLocaleString()}/{MAX_CHARS.toLocaleString()} characters
                </div>
              </div>

              {/* Comment */}
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{labels.narratives.commentLabel}</p>
                <Textarea
                  value={comment}
                  onChange={(e) => update(q.key, { comment: e.target.value })}
                  placeholder={labels.narratives.commentPlaceholder}
                  className="min-h-[180px] resize-y text-sm leading-relaxed"
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
