"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HEAD_BG, HEAD_COLOR, HEAD_TEXT } from "@/components/report-editor/matrix-table";
import {
  MAX_EXTENSION_MONTHS,
  MIN_EXTENSION_MONTHS,
  MONTHS_TOKEN,
  UPDATE_MODULE_GROUPS,
  UPDATE_TYPES,
  addOnsOf,
  moduleLabel,
  normaliseModules,
  requiredModulesFor,
  type UpdateModule,
  type UpdateRequirements,
} from "@/lib/update-modules";

// ─────────────────────────────────────────────────────────────────────────────
// The project-update module matrix.
//
//   columns = update types (Budget Revision, No Cost Extension, …)
//   rows    = modules: a base row, with its add-on sub-categories indented below
//   cells   = the permanent ticks marking which modules a type REQUIRES
//
// Ticking a column selects that update type and tints the whole column light
// orange. Only the columns are clickable: the selected modules are always
// exactly the union of what the chosen types require, so an update's modules
// can never drift from its update types. Rows just show whether they are in.
//
// Sub-categories are ADDITIVE: select Budget Revision and No Cost Extension
// together and Expenditure ends up with its general row plus both the
// proposed-new-budget and extended-time-frame rows.
//
// Rows whose label carries {months} render a small numeric field in its place.
// Every such field is bound to the SAME `months` value, so a number typed on the
// Work Plan row appears immediately on the Expenditure row and the two can never
// drift apart.
//
// The ticks themselves are admin-authored, not fixed: "Update category
// requirements" turns the cells into toggles and saves the map to app_settings
// (see lib/update-requirements.ts).
// ─────────────────────────────────────────────────────────────────────────────

/** Visual row order: each group's first module is its top-level row, the rest
 *  are its indented sub-categories. */
type MatrixRow = { key: string; module: UpdateModule; indented: boolean };

const MATRIX_ROWS: MatrixRow[] = UPDATE_MODULE_GROUPS.flatMap((group) =>
  group.modules.map((m, i) => ({ key: m.value, module: m, indented: i > 0 }))
);

export function UpdateModuleMatrix({
  selectedTypes,
  onTypesChange,
  selectedModules,
  onModulesChange,
  months,
  onMonthsChange,
  canEditRequirements = true,
}: {
  selectedTypes: string[];
  onTypesChange: (types: string[]) => void;
  selectedModules: string[];
  onModulesChange: (modules: string[]) => void;
  /** Length of the extension, shared by every row that shows a months field. */
  months: number | null;
  onMonthsChange: (months: number | null) => void;
  /** Hide the requirements editor for non-admin surfaces. */
  canEditRequirements?: boolean;
}) {
  const [requirements, setRequirements] = useState<UpdateRequirements>({});
  const [loading, setLoading] = useState(true);

  // Requirements editing is staged in `draft` so Cancel can discard it; only
  // Save writes through to the server and to the live `requirements`.
  const [draft, setDraft] = useState<UpdateRequirements | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/settings/update-requirements");
        if (!res.ok) throw new Error("Failed to load update category requirements");
        const data = await res.json();
        if (!cancelled) setRequirements(data.requirements ?? {});
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const editing = draft !== null;
  const shown = draft ?? requirements;

  const typeSet = useMemo(() => new Set(selectedTypes), [selectedTypes]);
  const moduleSet = useMemo(() => new Set(selectedModules), [selectedModules]);

  function isRequired(moduleKey: string, type: string): boolean {
    return (shown[type] ?? []).includes(moduleKey);
  }

  // Columns drive the selection: toggling one re-takes the union of what the
  // chosen types require, so adding No Cost Extension layers its add-ons on top
  // of whatever Budget Revision already contributed rather than replacing them.
  function toggleType(type: string) {
    if (editing) return;
    const next = typeSet.has(type)
      ? selectedTypes.filter((t) => t !== type)
      : [...selectedTypes, type];
    onTypesChange(next);
    onModulesChange(requiredModulesFor(next, requirements));
  }

  // Keep the selection in step with the requirements once they have loaded, so
  // modules handed in from outside can never disagree with the chosen types.
  useEffect(() => {
    if (loading) return;
    const derived = requiredModulesFor(selectedTypes, requirements);
    if (derived.join("|") !== selectedModules.join("|")) onModulesChange(derived);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, requirements, selectedTypes]);

  // Clear everything the matrix is currently showing. While the requirements are
  // being edited that means the ticks themselves (staged in the draft, so Cancel
  // still puts them back); otherwise it means the selection — columns and the
  // extension length — so the form can be started over from empty.
  function reset() {
    if (editing) {
      setDraft(Object.fromEntries(UPDATE_TYPES.map((t) => [t.value, []])));
      return;
    }
    onTypesChange([]);
    onModulesChange([]);
    onMonthsChange(null);
  }

  const canReset = editing
    ? UPDATE_TYPES.some((t) => (shown[t.value] ?? []).length > 0)
    : selectedTypes.length > 0 || selectedModules.length > 0 || months !== null;

  // Ticks follow the same base/add-on coupling as the selection, so what you see
  // after a click is exactly what gets stored (the server normalises identically).
  function toggleRequirement(moduleKey: string, type: string) {
    setDraft((prev) => {
      const previous = prev ?? requirements;
      const current = previous[type] ?? [];
      const dropped = new Set([moduleKey, ...addOnsOf(moduleKey)]);
      return {
        ...previous,
        [type]: current.includes(moduleKey)
          ? current.filter((m) => !dropped.has(m))
          : normaliseModules([...current, moduleKey]),
      };
    });
  }

  async function saveRequirements() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/settings/update-requirements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirements: draft }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save update category requirements");
      }
      setRequirements(draft);
      setDraft(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading modules…
      </div>
    );
  }

  /** Light-orange wash marking a chosen column, suppressed while editing the
   *  ticks so the selection does not compete with the cells being edited. */
  const columnTint = (type: string, header: boolean) =>
    !editing && typeSet.has(type)
      ? header ? "bg-crafd-yellow-200 border-crafd-yellow" : "bg-crafd-yellow-100"
      : header ? HEAD_BG : undefined;

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className={cn("border-b", HEAD_BG)}>
              <th className={cn("px-3 py-2 text-left align-bottom min-w-[280px]", HEAD_BG, HEAD_COLOR, HEAD_TEXT)}>
                Module
              </th>
              {UPDATE_TYPES.map((type) => (
                <th
                  key={type.value}
                  className={cn(
                    "border-l px-3 py-2 align-bottom transition-colors",
                    HEAD_COLOR,
                    HEAD_TEXT,
                    columnTint(type.value, true),
                    !editing && typeSet.has(type.value) && "text-crafd-grey-800"
                  )}
                >
                  <label
                    className={cn(
                      "flex items-center justify-center gap-1.5",
                      editing ? "cursor-default opacity-70" : "cursor-pointer select-none"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="accent-crafd-yellow shrink-0"
                      checked={typeSet.has(type.value)}
                      disabled={editing}
                      onChange={() => toggleType(type.value)}
                      aria-label={`Select ${type.label}`}
                    />
                    {/* Six columns now — let the longer headers wrap rather than
                        forcing the table into a horizontal scroll. */}
                    <span className="max-w-[6.5rem] text-center leading-tight">{type.label}</span>
                  </label>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MATRIX_ROWS.map((row) => (
                <tr key={row.key} className="border-b last:border-b-0">
                  <td className="px-3 py-1.5">
                    {(() => {
                      const selected = moduleSet.has(row.module.value);
                      // A months row splits into text / field / text.
                      const [before, after] = row.module.label.split(MONTHS_TOKEN);
                      const textClass = cn(selected ? "font-medium" : "text-muted-foreground");
                      return (
                        <div
                          className={cn(
                            "flex items-center gap-2",
                            // Sub-categories sit on a rail under their base row,
                            // so they read as add-ons to it.
                            row.indented && "ml-2 border-l-2 border-border/70 pl-3",
                            editing && "opacity-70"
                          )}
                        >
                          {/* Read-only marker: rows follow the ticked columns. */}
                          <span
                            className={cn(
                              "flex size-4 shrink-0 items-center justify-center rounded-sm border",
                              selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                            )}
                            aria-label={`${moduleLabel(row.module.value, months)} ${selected ? "included" : "not included"}`}
                          >
                            {selected && <Check className="size-3" />}
                          </span>
                          <span className={textClass}>{before.trim()}</span>
                          {after !== undefined && (
                            <>
                              <input
                                type="number"
                                inputMode="numeric"
                                min={MIN_EXTENSION_MONTHS}
                                max={MAX_EXTENSION_MONTHS}
                                step={1}
                                value={months ?? ""}
                                placeholder="XX"
                                disabled={editing || !selected}
                                onChange={(e) =>
                                  onMonthsChange(e.target.value === "" ? null : Number(e.target.value))
                                }
                                aria-label="Length of the extension in months"
                                className="h-6 w-14 rounded border border-input bg-background px-1.5 text-center text-sm tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
                              />
                              <span className={textClass}>{after.trim()}</span>
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  {UPDATE_TYPES.map((type) => {
                    const required = isRequired(row.module.value, type.value);
                    return (
                      <td
                        key={type.value}
                        className={cn(
                          "border-l px-3 py-1.5 text-center transition-colors",
                          columnTint(type.value, false)
                        )}
                      >
                        {editing ? (
                          <button
                            type="button"
                            onClick={() => toggleRequirement(row.module.value, type.value)}
                            aria-pressed={required}
                            aria-label={`${required ? "Remove" : "Add"} ${moduleLabel(row.module.value)} as required for ${type.label}`}
                            className={cn(
                              "mx-auto flex size-5 items-center justify-center rounded border transition-colors",
                              required
                                ? "border-foreground/40 bg-foreground/10 text-foreground"
                                : "border-dashed border-border text-transparent hover:border-foreground/40 hover:text-muted-foreground"
                            )}
                          >
                            <Check className="size-3.5" />
                          </button>
                        ) : required ? (
                          <Check
                            className={cn(
                              "mx-auto size-4",
                              typeSet.has(type.value) ? "text-crafd-yellow-900" : "text-muted-foreground"
                            )}
                            aria-label={`Required for ${type.label}`}
                          />
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <p className="text-xs text-muted-foreground">
          {editing
            ? "Click a cell to set whether that update type requires the module."
            : "Tick the update types this document covers; the modules follow from them. Sub-categories add up — combining columns brings in each add-on, alongside the general row."}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={!canReset || saving}
            title={editing ? "Clear every tick in the table" : "Clear all selected columns and the extension length"}
          >
            <RotateCcw className="size-3.5" />
            Reset
          </Button>
          {canEditRequirements && (
            editing ? (
              <>
                <Button variant="outline" size="sm" onClick={() => { setDraft(null); setError(null); }} disabled={saving}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveRequirements} disabled={saving}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save requirements
                </Button>
              </>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setDraft({ ...requirements })}>
                <SlidersHorizontal className="size-3.5" />
                Update category requirements
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
