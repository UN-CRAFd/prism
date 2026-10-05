"use client";

import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DESCRIPTION_MAX_CHARS, narrativeLimit } from "@/lib/limits";

interface NarrativeQuestion {
  id: number;
  narrative_key: string;
  label: string;
}

function getDefault(key: string): number {
  return key === "description" ? DESCRIPTION_MAX_CHARS : narrativeLimit(key);
}

export function CharLimitsEditor() {
  const [questions, setQuestions] = useState<NarrativeQuestion[]>([]);
  // values: what's currently in the inputs (strings for controlled inputs)
  const [values, setValues] = useState<Record<string, string>>({});
  // savedValues: what the server last returned — compared against to enable Save
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/standard-narratives").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/settings/char-limits").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]).then(([qs, rawLimitsData]) => {
      const narrativeQs: NarrativeQuestion[] = Array.isArray(qs) ? qs : [];
      setQuestions(narrativeQs);

      const ld = rawLimitsData as { limits?: { description?: number; narratives?: Record<string, number> } };
      const lims = {
        description: ld.limits?.description ?? DESCRIPTION_MAX_CHARS,
        narratives: ld.limits?.narratives ?? {} as Record<string, number>,
      };

      const init: Record<string, string> = {
        description: String(lims.description),
      };
      for (const q of narrativeQs) {
        init[q.narrative_key] = String(lims.narratives[q.narrative_key] ?? narrativeLimit(q.narrative_key));
      }
      setValues(init);
      setSavedValues(init);
      setLoading(false);
    });
  }, []);

  // Reset link appears when the edited value differs from the hardcoded default.
  const differsFromDefault = (key: string) => {
    const v = parseInt(values[key] ?? "", 10);
    return !isNaN(v) && v !== getDefault(key);
  };

  // Reset sets the input to the default — may differ from savedValues, making the row dirty.
  const reset = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: String(getDefault(key)) }));
    setSaveSuccess(false);
  };

  const rows: { key: string; label: string }[] = [
    { key: "description", label: "Project description" },
    ...(questions.map((q) => ({ key: q.narrative_key, label: q.label }))),
  ];

  // Save is enabled whenever any input value differs from what the server last returned.
  const anyChanged = rows.some((r) => {
    const current = parseInt(values[r.key] ?? "", 10);
    const saved = parseInt(savedValues[r.key] ?? "", 10);
    return !isNaN(current) && !isNaN(saved) && current !== saved;
  });

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const descVal = parseInt(values.description ?? "", 10);
    if (!Number.isInteger(descVal) || descVal <= 0 || descVal > 50_000) {
      setSaveError("Project description limit must be a positive integer up to 50,000.");
      setSaving(false);
      return;
    }

    const narratives: Record<string, number> = {};
    for (const q of questions) {
      const v = parseInt(values[q.narrative_key] ?? "", 10);
      if (!Number.isInteger(v) || v <= 0 || v > 50_000) {
        setSaveError(`"${q.label}" limit must be a positive integer up to 50,000.`);
        setSaving(false);
        return;
      }
      narratives[q.narrative_key] = v;
    }

    try {
      const res = await fetch("/api/admin/settings/char-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descVal, narratives }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to save.");
        return;
      }
      // Record what the server now holds so Save re-disables until the next edit.
      const newSaved: Record<string, string> = { description: String(descVal) };
      for (const q of questions) newSaved[q.narrative_key] = String(narratives[q.narrative_key]);
      setSavedValues(newSaved);
      setSaveSuccess(true);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rows.map(({ key, label }) => {
          const def = getDefault(key);
          const changed = differsFromDefault(key);
          return (
            <div key={key} className="flex items-center gap-3 py-1">
              <span className="flex-1 text-sm">{label}</span>
              <Input
                type="number"
                min={1}
                max={50000}
                className="w-28 text-right"
                value={values[key] ?? ""}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [key]: e.target.value }));
                  setSaveSuccess(false);
                }}
              />
              <span className="text-xs text-muted-foreground w-28 shrink-0">
                default {def.toLocaleString("en-US")}
              </span>
              <span className="w-10 shrink-0">
                {changed && (
                  <button
                    className="text-xs text-blue-600 hover:underline"
                    onClick={() => reset(key)}
                  >
                    Reset
                  </button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button onClick={handleSave} disabled={saving || !anyChanged}>
          {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
          Save
        </Button>
        {saveError && (
          <span className="flex items-center gap-1.5 text-sm text-red-700">
            <AlertCircle className="size-4 shrink-0" />
            {saveError}
          </span>
        )}
        {saveSuccess && !saveError && (
          <span className="flex items-center gap-1.5 text-sm text-green-700">
            <CheckCircle2 className="size-4 shrink-0" />
            Saved.
          </span>
        )}
      </div>
    </div>
  );
}
