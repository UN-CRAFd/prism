"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import {
  GENERAL_JUSTIFICATION_KEY,
  appliedTypes,
  justificationPrompt,
} from "@/lib/update-justifications";

// Justification — why the partner is applying for this update. ONE open field,
// whatever the document covers: a combined Budget Revision + Reprogramming is a
// single request, so the question names both and is answered once.
export function JustificationSection({
  reportId,
  updateTypes,
  readOnly,
  onSaveStateChange,
}: {
  reportId: number;
  updateTypes: string[] | null | undefined;
  readOnly?: boolean;
  onSaveStateChange?: (s: SaveState) => void;
}) {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dirtyRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/update-justifications?reportId=${reportId}`);
        if (!res.ok) throw new Error("Failed to load justification");
        const rows: { update_type: string; justification: string }[] = await res.json();
        if (cancelled) return;
        setValue(mergeJustifications(rows));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  const flush = useCallback(async () => {
    if (!dirtyRef.current) return;
    dirtyRef.current = false;
    const res = await fetch("/api/update-justifications", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reportId,
        update_type: GENERAL_JUSTIFICATION_KEY,
        justification: valueRef.current,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Failed to save justification");
    }
  }, [reportId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Save anything still pending when the partner navigates away.
  useEffect(() => () => { void flushNow(); }, [flushNow]);

  function edit(next: string) {
    setValue(next);
    dirtyRef.current = true;
    schedule();
  }

  const applying = appliedTypes(updateTypes).length > 0;

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border bg-card p-6">
          <div className="h-24 animate-pulse rounded-md bg-muted" />
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <label htmlFor="justification" className="text-sm font-medium">
              {justificationPrompt(updateTypes)}
            </label>
            <ItemComments section="justification" itemId={null} />
          </div>
          <Textarea
            id="justification"
            value={value}
            onChange={(e) => edit(e.target.value)}
            disabled={readOnly}
            rows={10}
            placeholder={
              applying
                ? "Set out the reason, what changed, and why it is needed…"
                : "Describe the reason for this update…"
            }
          />
        </div>
      )}
    </div>
  );
}

/** The stored answer for the one field. Normally that is the general row; an
 *  update justified on the earlier one-box-per-type page has its per-type
 *  answers folded in instead, so nothing already typed disappears. */
function mergeJustifications(rows: { update_type: string; justification: string }[]): string {
  const general = rows.find((r) => r.update_type === GENERAL_JUSTIFICATION_KEY)?.justification ?? "";
  if (general.trim()) return general;
  return rows
    .filter((r) => r.update_type !== GENERAL_JUSTIFICATION_KEY)
    .map((r) => r.justification?.trim())
    .filter(Boolean)
    .join("\n\n");
}
