"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, RotateCcw, CheckCircle2, AlertCircle, ChevronRight,
  Plus, Trash2, ArrowUp, ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { baseOptions, type OptionGroup } from "@/lib/options";

// One editable row. `uid` is a stable client-side id so React keys survive
// reordering/removal (the value itself may change as the admin edits it).
interface Row {
  uid: string;
  value: string;
  label: string;
  description: string;
}

const GROUP_KEYS = Object.keys(baseOptions);

// Monotonic client-side row ids — only ever used as React keys.
let UID_SEQ = 0;
function makeUid(): string {
  return `row-${++UID_SEQ}`;
}

function toRows(_groupKey: string, items: { value: string; label: string; description?: string }[]): Row[] {
  return items.map((it) => ({
    uid: makeUid(),
    value: it.value,
    label: it.label,
    description: it.description ?? "",
  }));
}

function baseRows(groupKey: string): Row[] {
  return toRows(groupKey, baseOptions[groupKey].items);
}

// Normalise rows to comparable items (drop blanks, trim).
function cleanItems(group: OptionGroup, rows: Row[]): { value: string; label: string; description?: string }[] {
  const out: { value: string; label: string; description?: string }[] = [];
  for (const r of rows) {
    const label = r.label.trim();
    // flat groups mirror value from label; keyed groups keep their own value.
    const value = (group.kind === "flat" ? label : r.value.trim());
    if (!value || !label) continue;
    const item: { value: string; label: string; description?: string } = { value, label };
    if (group.hasDescription && r.description.trim()) item.description = r.description.trim();
    out.push(item);
  }
  return out;
}

// Compare a group's edited rows against its compiled-in defaults.
function isModified(groupKey: string, rows: Row[]): boolean {
  const a = cleanItems(baseOptions[groupKey], rows);
  const b = baseOptions[groupKey].items.map((it) => ({
    value: it.value, label: it.label, ...(it.description ? { description: it.description } : {}),
  }));
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function OptionsEditor() {
  const [groups, setGroups] = useState<Record<string, Row[]>>(() =>
    Object.fromEntries(GROUP_KEYS.map((k) => [k, baseRows(k)]))
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [search, setSearch] = useState("");
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());

  // Load stored overrides and overlay them onto the defaults.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/options");
        if (!res.ok) throw new Error("Failed to load options");
        const data = await res.json();
        if (cancelled) return;
        const overrides = (data.overrides ?? {}) as Record<string, { items?: unknown }>;
        const next: Record<string, Row[]> = {};
        for (const key of GROUP_KEYS) {
          const ov = overrides[key]?.items;
          next[key] = Array.isArray(ov)
            ? toRows(key, ov as { value: string; label: string; description?: string }[])
            : baseRows(key);
        }
        setGroups(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load options");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const modifiedGroups = useMemo(
    () => GROUP_KEYS.filter((k) => isModified(k, groups[k] ?? [])),
    [groups]
  );

  const visibleGroups = useMemo(() => {
    if (!q) return GROUP_KEYS;
    return GROUP_KEYS.filter((k) => {
      const g = baseOptions[k];
      if (g.label.toLowerCase().includes(q) || k.toLowerCase().includes(q)) return true;
      return (groups[k] ?? []).some(
        (r) => r.label.toLowerCase().includes(q) || r.value.toLowerCase().includes(q)
      );
    });
  }, [q, groups]);

  const isOpen = (key: string) => !!q || openGroups.has(key);
  const toggle = (key: string) =>
    setOpenGroups((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });

  const clearFeedback = () => { setSuccess(false); };

  function updateRow(groupKey: string, uid: string, patch: Partial<Row>) {
    setGroups((prev) => ({
      ...prev,
      [groupKey]: (prev[groupKey] ?? []).map((r) => (r.uid === uid ? { ...r, ...patch } : r)),
    }));
    clearFeedback();
  }
  function addRow(groupKey: string) {
    setGroups((prev) => ({
      ...prev,
      [groupKey]: [...(prev[groupKey] ?? []), { uid: makeUid(), value: "", label: "", description: "" }],
    }));
    clearFeedback();
  }
  function removeRow(groupKey: string, uid: string) {
    setGroups((prev) => ({
      ...prev,
      [groupKey]: (prev[groupKey] ?? []).filter((r) => r.uid !== uid),
    }));
    clearFeedback();
  }
  function moveRow(groupKey: string, uid: string, dir: -1 | 1) {
    setGroups((prev) => {
      const rows = [...(prev[groupKey] ?? [])];
      const i = rows.findIndex((r) => r.uid === uid);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= rows.length) return prev;
      [rows[i], rows[j]] = [rows[j], rows[i]];
      return { ...prev, [groupKey]: rows };
    });
    clearFeedback();
  }
  function resetGroup(groupKey: string) {
    setGroups((prev) => ({ ...prev, [groupKey]: baseRows(groupKey) }));
    clearFeedback();
  }

  async function save(overrides: Record<string, { items: unknown }>) {
    setSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/admin/settings/options", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? "Failed to save options"); return; }
      setSuccess(true);
      // Reload so the new options are re-injected and applied app-wide.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    // Validate + build overrides for changed groups only.
    const overrides: Record<string, { items: unknown }> = {};
    for (const key of GROUP_KEYS) {
      const rows = groups[key] ?? [];
      if (!isModified(key, rows)) continue;
      const items = cleanItems(baseOptions[key], rows);
      if (items.length === 0) {
        setError(`"${baseOptions[key].label}" must have at least one option.`);
        return;
      }
      const values = items.map((i) => i.value);
      if (new Set(values).size !== values.length) {
        setError(`"${baseOptions[key].label}" has duplicate values.`);
        return;
      }
      overrides[key] = { items };
    }
    save(overrides);
  }

  function handleResetAll() {
    setGroups(Object.fromEntries(GROUP_KEYS.map((k) => [k, baseRows(k)])));
    save({});
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading options…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dropdowns or option values…"
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {modifiedGroups.length > 0 ? `${modifiedGroups.length} modified` : "No changes"}
        </span>
        <Button variant="outline" size="sm" onClick={handleResetAll} disabled={saving || modifiedGroups.length === 0}>
          <RotateCcw className="size-4 mr-1.5" /> Reset all
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="size-4 mr-2 animate-spin" />}
          Save &amp; apply
        </Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          <CheckCircle2 className="size-4 mt-0.5 shrink-0" />
          <span>Options saved. Reloading to apply…</span>
        </div>
      )}

      {visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No dropdowns match “{search}”.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleGroups.map((key) => {
            const group = baseOptions[key];
            const rows = groups[key] ?? [];
            const open = isOpen(key);
            const modified = isModified(key, rows);
            return (
              <div key={key} className="rounded-lg border overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <span className="font-medium text-sm">{group.label}</span>
                  <span className="text-xs text-muted-foreground">({rows.length})</span>
                  {modified && (
                    <span className="ml-auto text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                      modified
                    </span>
                  )}
                </button>

                {open && (
                  <div className="border-t p-4 space-y-3 bg-muted/20">
                    <p className="text-xs text-muted-foreground">{group.description}</p>

                    <div className="space-y-2">
                      {rows.map((row, i) => (
                        <div key={row.uid} className="flex items-start gap-2">
                          <div className="flex flex-col gap-0.5 pt-1">
                            <button
                              type="button"
                              onClick={() => moveRow(key, row.uid, -1)}
                              disabled={i === 0}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              aria-label="Move up"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveRow(key, row.uid, 1)}
                              disabled={i === rows.length - 1}
                              className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                              aria-label="Move down"
                            >
                              <ArrowDown className="size-3.5" />
                            </button>
                          </div>

                          <div className="flex-1 grid gap-2" style={{
                            gridTemplateColumns:
                              group.kind === "keyed"
                                ? (group.hasDescription ? "140px 1fr 1fr" : "160px 1fr")
                                : (group.hasDescription ? "1fr 1fr" : "1fr"),
                          }}>
                            {group.kind === "keyed" && (
                              <Input
                                value={row.value}
                                onChange={(e) => updateRow(key, row.uid, { value: e.target.value })}
                                placeholder="value / code"
                                className="text-sm font-mono"
                              />
                            )}
                            <Input
                              value={row.label}
                              onChange={(e) =>
                                updateRow(key, row.uid,
                                  group.kind === "flat"
                                    ? { label: e.target.value, value: e.target.value }
                                    : { label: e.target.value })
                              }
                              placeholder="label"
                              className="text-sm"
                            />
                            {group.hasDescription && (
                              <Input
                                value={row.description}
                                onChange={(e) => updateRow(key, row.uid, { description: e.target.value })}
                                placeholder="description (optional)"
                                className="text-sm"
                              />
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeRow(key, row.uid)}
                            className="pt-2 text-muted-foreground hover:text-red-600"
                            aria-label="Remove option"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => addRow(key)}>
                        <Plus className="size-4 mr-1.5" /> Add option
                      </Button>
                      {modified && (
                        <Button variant="ghost" size="sm" onClick={() => resetGroup(key)}>
                          <RotateCcw className="size-4 mr-1.5" /> Reset to default
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
