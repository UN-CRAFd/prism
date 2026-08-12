"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, RotateCcw, CheckCircle2, AlertCircle, ChevronRight, Type,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { baseLabels, flattenLabelLeaves, setNested, type LabelLeaf } from "@/lib/labels";

// All editable label leaves (dot paths), computed once from the compiled-in
// defaults. Overrides only ever change these same leaves.
const LEAVES: LabelLeaf[] = flattenLabelLeaves(baseLabels);
const LEAF_BY_PATH = new Map(LEAVES.map((l) => [l.path, l]));
const GROUPS = Array.from(new Set(LEAVES.map((l) => l.path.split(".")[0])));

function baseValues(): Record<string, string> {
  return Object.fromEntries(LEAVES.map((l) => [l.path, l.base]));
}

// Split an edited multi-line value back into a clean string array (drops blank
// lines) for array-typed labels such as status option lists.
function toArray(value: string): string[] {
  return value.split("\n").map((s) => s.trim()).filter((s) => s.length > 0);
}

export function LabelsEditor() {
  const [values, setValues] = useState<Record<string, string>>(baseValues);
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
        const res = await fetch("/api/admin/settings/labels");
        if (!res.ok) throw new Error("Failed to load labels");
        const data = await res.json();
        if (cancelled) return;
        const next = baseValues();
        for (const leaf of flattenLabelLeaves(data.overrides ?? {})) {
          if (leaf.path in next) next[leaf.path] = leaf.base;
        }
        setValues(next);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load labels");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const q = search.trim().toLowerCase();
  const modifiedCount = useMemo(
    () => LEAVES.reduce((n, l) => (values[l.path] !== l.base ? n + 1 : n), 0),
    [values]
  );

  // Leaves grouped by top-level section, filtered by the search query.
  const grouped = useMemo(() => {
    const match = (l: LabelLeaf) =>
      !q ||
      l.path.toLowerCase().includes(q) ||
      l.base.toLowerCase().includes(q) ||
      (values[l.path] ?? "").toLowerCase().includes(q);
    return GROUPS.map((group) => ({
      group,
      leaves: LEAVES.filter((l) => l.path.split(".")[0] === group && match(l)),
    })).filter((g) => g.leaves.length > 0);
  }, [q, values]);

  const isOpen = (group: string) => !!q || openGroups.has(group);
  const toggle = (group: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });

  const setValue = (path: string, value: string) => {
    setValues((prev) => ({ ...prev, [path]: value }));
    setSuccess(false);
  };
  const resetOne = (path: string) => {
    const leaf = LEAF_BY_PATH.get(path);
    if (leaf) setValue(path, leaf.base);
  };

  async function save(overrides: Record<string, unknown>) {
    setSaving(true); setError(null); setSuccess(false);
    try {
      const res = await fetch("/api/admin/settings/labels", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overrides }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error ?? "Failed to save labels"); return; }
      setSuccess(true);
      // Reload so the new labels are re-injected and applied app-wide.
      setTimeout(() => window.location.reload(), 600);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const handleSave = () => {
    const overrides: Record<string, unknown> = {};
    for (const leaf of LEAVES) {
      const val = values[leaf.path];
      if (val === leaf.base) continue;
      setNested(overrides, leaf.path, leaf.kind === "array" ? toArray(val) : val);
    }
    save(overrides);
  };

  const handleResetAll = () => {
    setValues(baseValues());
    save({});
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading labels…
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
            placeholder="Search labels by text or key…"
            className="pl-9"
          />
        </div>
        <span className="text-xs text-muted-foreground">
          {modifiedCount > 0 ? `${modifiedCount} modified` : "No changes"}
        </span>
        <Button variant="outline" size="sm" onClick={handleResetAll} disabled={saving || modifiedCount === 0}>
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
          <span>Labels saved. Reloading to apply…</span>
        </div>
      )}

      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No labels match “{search}”.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ group, leaves }) => {
            const groupModified = leaves.filter((l) => values[l.path] !== l.base).length;
            const open = isOpen(group);
            return (
              <div key={group} className="rounded-lg border overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggle(group)}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                >
                  <ChevronRight className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <span className="font-medium text-sm">{group}</span>
                  <span className="text-xs text-muted-foreground">({leaves.length})</span>
                  {groupModified > 0 && (
                    <span className="ml-auto text-xs rounded-full bg-amber-100 text-amber-800 px-2 py-0.5">
                      {groupModified} modified
                    </span>
                  )}
                </button>

                {open && (
                  <div className="divide-y border-t">
                    {leaves.map((leaf) => {
                      const val = values[leaf.path] ?? "";
                      const modified = val !== leaf.base;
                      return (
                        <div key={leaf.path} className={cn("px-4 py-3", modified && "bg-amber-50/40")}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <code className="text-[11px] text-muted-foreground break-all">{leaf.path}</code>
                            {leaf.kind === "array" && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/80">
                                <Type className="size-3" /> list (one per line)
                              </span>
                            )}
                            {modified && (
                              <button
                                type="button"
                                onClick={() => resetOne(leaf.path)}
                                className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                              >
                                <RotateCcw className="size-3" /> Reset
                              </button>
                            )}
                          </div>
                          {leaf.kind === "array" || val.length > 60 || val.includes("\n") ? (
                            <Textarea
                              value={val}
                              onChange={(e) => setValue(leaf.path, e.target.value)}
                              className="text-sm min-h-[64px] resize-y"
                            />
                          ) : (
                            <Input
                              value={val}
                              onChange={(e) => setValue(leaf.path, e.target.value)}
                              className="text-sm"
                            />
                          )}
                        </div>
                      );
                    })}
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
