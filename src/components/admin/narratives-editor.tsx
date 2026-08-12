"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import { richTextLength } from "@/lib/richtext";
import labels from "@/lib/labels";

// ── Narratives editor ─────────────────────────────────────────────────────────
// Project-level proposal narratives on the project document. One card per
// narrative question, each with a main answer. The
// question set is a per-project snapshot taken from the admin's standard narrative
// questions at project creation (project_narratives carries the key + label +
// order), so it is loaded with the answers rather than read from labels.json.
// Debounced autosave via the shared useAutosave controller, with a single
// AutosaveIndicator — matching the report editor.

const MAX_CHARS = 4500;

type Question = { id: number; key: string; label: string; description: string | null };
type Entry = { answer: string };
const EMPTY: Entry = { answer: "" };

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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Question set is loaded per-project (the snapshot); keep it in a ref so the
  // autosave flush closure always sees the current list.
  const questionsRef = useRef<Question[]>([]);
  questionsRef.current = questions;
  const entriesRef = useRef<Record<string, Entry>>({});
  entriesRef.current = entries;
  // Last value persisted for each key — used to detect dirty entries.
  const savedRef = useRef<Record<string, Entry>>({});
  // Label + description per key, sent on PATCH so a fresh row keeps its snapshot.
  const labelRef = useRef<Record<string, string>>({});
  const descRef = useRef<Record<string, string | null>>({});

  const entryOf = (key: string): Entry => entries[key] ?? EMPTY;

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/project-narratives?project_id=${projectId}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load narratives"); return r.json(); })
      .then((rows: { id: number; narrative_key: string; label: string | null; description: string | null; answer: string | null }[]) => {
        const map: Record<string, Entry> = {};
        const labelMap: Record<string, string> = {};
        const descMap: Record<string, string | null> = {};
        const qs: Question[] = [];
        for (const row of rows) {
          map[row.narrative_key] = { answer: row.answer ?? "" };
          const label = row.label ?? row.narrative_key;
          labelMap[row.narrative_key] = label;
          descMap[row.narrative_key] = row.description;
          qs.push({ id: row.id, key: row.narrative_key, label, description: row.description });
        }
        setQuestions(qs);
        setEntries(map);
        labelRef.current = labelMap;
        descRef.current = descMap;
        savedRef.current = JSON.parse(JSON.stringify(map));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Save every dirty narrative. A key's saved snapshot is only advanced once the
  // PATCH succeeds, so edits made mid-save aren't lost.
  const flush = useCallback(async () => {
    for (const q of questionsRef.current) {
      const cur = entriesRef.current[q.key] ?? EMPTY;
      const saved = savedRef.current[q.key] ?? EMPTY;
      if (cur.answer === saved.answer) continue;
      const res = await fetch("/api/project-narratives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project_id: projectId, narrative_key: q.key, label: labelRef.current[q.key], description: descRef.current[q.key], answer: cur.answer }),
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
    return saved.answer !== cur.answer;
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

      {questions.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No narrative sections. Add them in the admin Narrative Questions editor.
        </div>
      )}

      {questions.map((q, i) => {
        const { answer } = entryOf(q.key);
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
              <label className="text-sm font-medium leading-snug flex items-center gap-1.5 flex-1">
                {q.label}
                {q.description && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" aria-label={q.description}>
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs whitespace-pre-line">{q.description}</TooltipContent>
                  </Tooltip>
                )}
              </label>
              {/* Per-narrative admin↔partner comment thread, keyed on the prodoc
                  report + this narrative row (reuses the report editor's comment
                  infra — no new backend). */}
              <ItemComments section="narratives" itemId={q.id} />
            </div>

            {/* Narrative answer (internal comments now live in the speech-bubble
                thread above, via ItemComments). */}
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">{labels.narratives.answerLabel}</p>
              <RichTextEditor
                value={answer}
                onChange={(html) => update(q.key, { answer: html })}
                placeholder={labels.narratives.placeholder}
                disabled={readOnly}
              />
              {(() => {
                const len = richTextLength(answer);
                return (
                  <div
                    className={cn(
                      "text-[11px] text-right tabular-nums",
                      len >= MAX_CHARS ? "text-amber-600 font-medium" : "text-muted-foreground"
                    )}
                  >
                    {len.toLocaleString()}/{MAX_CHARS.toLocaleString()} characters
                  </div>
                );
              })()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
