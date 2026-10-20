"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import {
  GENERAL_JUSTIFICATION_KEY,
  justificationFields,
  justificationPrompt,
  updateTypeList,
} from "@/lib/update-justifications";

// Justification — why the partner is applying for each update type this
// document covers. One open field per type, so a combined Annual Report + NCE
// update explains the extension on its own terms rather than in one shared box.
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
  const fields = justificationFields(updateTypes);

  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Only dirty fields are written back, so an autosave never clobbers a field
  // the partner has not touched with a stale value.
  const dirtyRef = useRef<Set<string>>(new Set());
  const valuesRef = useRef(values);
  valuesRef.current = values;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/update-justifications?reportId=${reportId}`);
        if (!res.ok) throw new Error("Failed to load justifications");
        const rows: { update_type: string; justification: string }[] = await res.json();
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const r of rows) next[r.update_type] = r.justification ?? "";
        setValues(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reportId]);

  const flush = useCallback(async () => {
    const pending = [...dirtyRef.current];
    dirtyRef.current = new Set();
    for (const key of pending) {
      const res = await fetch("/api/update-justifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId,
          update_type: key,
          justification: valuesRef.current[key] ?? "",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save justification");
      }
    }
  }, [reportId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Save anything still pending when the partner navigates away.
  useEffect(() => () => { void flushNow(); }, [flushNow]);

  function edit(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    dirtyRef.current.add(key);
    schedule();
  }

  const list = updateTypeList(updateTypes);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="t-heading-section">Justification</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {list
            ? `Explain why you are applying for ${list}. Each one is justified separately.`
            : "Explain why this project update is being submitted."}
        </p>
      </div>

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
        <div className="space-y-4">
          {fields.map((key) => (
            <div key={key} className="rounded-xl border bg-card p-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <label htmlFor={`justification-${key}`} className="text-sm font-medium">
                  {justificationPrompt(key)}
                </label>
                <ItemComments section="justification" itemId={null} />
              </div>
              <Textarea
                id={`justification-${key}`}
                value={values[key] ?? ""}
                onChange={(e) => edit(key, e.target.value)}
                disabled={readOnly}
                rows={6}
                placeholder={
                  key === GENERAL_JUSTIFICATION_KEY
                    ? "Describe the reason for this update…"
                    : "Set out the reason, what changed, and why it is needed…"
                }
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
