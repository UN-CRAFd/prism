"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  MAX_WORD_LIMIT, WORD_LIMITS, WORD_LIMIT_SECTIONS, SECTION_PRODOC_NARRATIVES,
  defaultWordLimit, narrativeLimitKey,
} from "@/lib/limits";
import { invalidateWordLimits } from "@/lib/use-word-limits";

interface NarrativeQuestion {
  id: number;
  narrative_key: string;
  label: string;
}

interface Row { key: string; label: string; section: string }

export function WordLimitsEditor() {
  const [questions, setQuestions] = useState<NarrativeQuestion[]>([]);
  // values: what is in the inputs (strings, for controlled inputs)
  const [values, setValues] = useState<Record<string, string>>({});
  // savedValues: what the server last held — compared against to enable Save
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Every registered field plus the (admin-managed) ProDoc narrative questions.
  const rows: Row[] = useMemo(() => {
    const fixed = Object.entries(WORD_LIMITS).map(([key, def]) => ({ key, label: def.label, section: def.section }));
    const narratives = questions.map((q) => ({
      key: narrativeLimitKey(q.narrative_key),
      label: q.label,
      section: SECTION_PRODOC_NARRATIVES,
    }));
    return [...fixed, ...narratives];
  }, [questions]);

  useEffect(() => {
    Promise.all([
      fetch("/api/standard-narratives").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/admin/settings/word-limits").then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
    ]).then(([qs, data]) => {
      const qList: NarrativeQuestion[] = Array.isArray(qs) ? qs : [];
      setQuestions(qList);
      const overrides = ((data as { overrides?: Record<string, number> }).overrides ?? {});
      const init: Record<string, string> = {};
      for (const key of [...Object.keys(WORD_LIMITS), ...qList.map((q) => narrativeLimitKey(q.narrative_key))]) {
        init[key] = String(overrides[key] ?? defaultWordLimit(key));
      }
      setValues(init);
      setSavedValues(init);
      setLoading(false);
    });
  }, []);

  const differsFromDefault = (key: string) => {
    const v = parseInt(values[key] ?? "", 10);
    return !isNaN(v) && v !== defaultWordLimit(key);
  };

  const reset = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: String(defaultWordLimit(key)) }));
    setSaveSuccess(false);
  };

  const anyChanged = rows.some((r) => {
    const cur = parseInt(values[r.key] ?? "", 10);
    const saved = parseInt(savedValues[r.key] ?? "", 10);
    return !isNaN(cur) && !isNaN(saved) && cur !== saved;
  });

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const limits: Record<string, number> = {};
    for (const r of rows) {
      const v = parseInt(values[r.key] ?? "", 10);
      if (!Number.isInteger(v) || v <= 0 || v > MAX_WORD_LIMIT) {
        setSaveError(`"${r.label}" (${r.section}) must be a whole number from 1 to ${MAX_WORD_LIMIT.toLocaleString("en-US")}.`);
        setSaving(false);
        return;
      }
      limits[r.key] = v;
    }

    try {
      const res = await fetch("/api/admin/settings/word-limits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limits }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(data?.error ?? "Failed to save.");
        return;
      }
      const newSaved: Record<string, string> = {};
      for (const [k, v] of Object.entries(limits)) newSaved[k] = String(v);
      setSavedValues(newSaved);
      invalidateWordLimits(); // editors re-read the limits
      setSaveSuccess(true);
    } catch {
      setSaveError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const sections = [...WORD_LIMIT_SECTIONS];

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const sectionRows = rows.filter((r) => r.section === section);
        if (sectionRows.length === 0) return null;
        return (
          <div key={section} className="space-y-1">
            <h3 className="text-sm font-semibold">{section}</h3>
            {sectionRows.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3 py-1">
                <span className="flex-1 text-sm">{label}</span>
                <Input
                  type="number"
                  min={1}
                  max={MAX_WORD_LIMIT}
                  className="w-28 text-right"
                  value={values[key] ?? ""}
                  onChange={(e) => {
                    setValues((prev) => ({ ...prev, [key]: e.target.value }));
                    setSaveSuccess(false);
                  }}
                />
                <span className="text-xs text-muted-foreground w-28 shrink-0">
                  default {(defaultWordLimit(key) ?? 0).toLocaleString("en-US")}
                </span>
                <span className="w-10 shrink-0">
                  {differsFromDefault(key) && (
                    <button className="text-xs text-blue-600 hover:underline" onClick={() => reset(key)}>
                      Reset
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
        );
      })}

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
