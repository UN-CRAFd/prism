"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutosave, type SaveState } from "@/components/autosave";
import { SDG_GOALS, getSdgGoal, getSdgTarget, sdgIconPath } from "@/lib/sdg";
import { optionValues, optionItems } from "@/lib/options";
import labels from "@/lib/labels";

// ── SDG Targets editor ────────────────────────────────────────────────────────
// Project-level SDG Target focus on the project document. Pick SDG targets
// (sub-indicators of goals 1–17, from the src/lib/sdg.ts catalogue) and assign
// each a focus percentage meant to sum to 100% across the project. Debounced
// autosave via useAutosave, persisting the whole set with a single PUT — the same
// AutosaveIndicator the report editor uses.

type Priority = string;
type Selected = { sdg_goal: number; target_code: string; percentage: number; priority: Priority };

const snapshot = (list: Selected[]) =>
  JSON.stringify([...list].sort((a, b) => a.target_code.localeCompare(b.target_code)));

export function SdgTargetsEditor({
  projectId,
  onSaveStateChange,
  readOnly = false,
}: {
  projectId: number;
  onSaveStateChange?: (s: SaveState) => void;
  readOnly?: boolean;
}) {
  const [selected, setSelected] = useState<Selected[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-row controls: pick a goal, then a target under it.
  const [pickGoal, setPickGoal] = useState<string>("");
  const [pickTarget, setPickTarget] = useState<string>("");

  const selectedRef = useRef<Selected[]>([]);
  selectedRef.current = selected;
  const savedRef = useRef<string>(snapshot([]));

  useEffect(() => {
    setLoading(true); setError(null);
    fetch(`/api/project-sdg-targets?project_id=${projectId}`)
      .then((r) => { if (!r.ok) throw new Error("Failed to load SDG targets"); return r.json(); })
      .then((rows: { sdg_goal: number; target_code: string; percentage: string | number; priority?: string }[]) => {
        const list: Selected[] = rows.map((r) => ({
          sdg_goal: Number(r.sdg_goal),
          target_code: r.target_code,
          percentage: Number(r.percentage),
          priority: r.priority === "secondary" ? "secondary" : "primary",
        }));
        setSelected(list);
        savedRef.current = snapshot(list);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Unknown error"))
      .finally(() => setLoading(false));
  }, [projectId]);

  // Persist the whole set in one PUT. The saved snapshot only advances once the
  // request succeeds, so edits made mid-save aren't lost.
  const flush = useCallback(async () => {
    const cur = selectedRef.current;
    if (snapshot(cur) === savedRef.current) return;
    const res = await fetch("/api/project-sdg-targets", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project_id: projectId, targets: cur }),
    });
    if (!res.ok) throw new Error("Failed to save");
    savedRef.current = snapshot(cur);
  }, [projectId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });
  useEffect(() => () => { flushNow(); }, [flushNow]);

  const mutate = (next: Selected[]) => { setSelected(next); schedule(); };

  const addTarget = () => {
    if (!pickTarget) return;
    if (selected.some((s) => s.target_code === pickTarget)) return;
    const found = getSdgTarget(pickTarget);
    if (!found) return;
    mutate([...selected, { sdg_goal: found.goal.goal, target_code: pickTarget, percentage: 0, priority: optionValues("sdgPriority")[0] ?? "primary" }]);
    setPickTarget("");
  };

  const setPercentage = (code: string, value: string) => {
    const pct = value === "" ? 0 : Math.min(100, Math.max(0, Number(value)));
    if (Number.isNaN(pct)) return;
    mutate(selected.map((s) => (s.target_code === code ? { ...s, percentage: pct } : s)));
  };

  const setPriority = (code: string, priority: Priority) => {
    mutate(selected.map((s) => (s.target_code === code ? { ...s, priority } : s)));
  };

  const removeTarget = (code: string) => {
    mutate(selected.filter((s) => s.target_code !== code));
  };

  // Targets under the chosen goal that aren't already selected.
  const availableTargets = useMemo(() => {
    const goal = pickGoal ? getSdgGoal(Number(pickGoal)) : undefined;
    if (!goal) return [];
    return goal.targets.filter((t) => !selected.some((s) => s.target_code === t.code));
  }, [pickGoal, selected]);

  const total = useMemo(
    () => selected.reduce((sum, s) => sum + s.percentage, 0),
    [selected]
  );
  const isHundred = Math.abs(total - 100) < 0.001;

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
          {labels.tabInstructions.sdg}
        </div>
      )}

      {/* Add-target row */}
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-2">
          <Select value={pickGoal} onValueChange={(v) => { setPickGoal(v); setPickTarget(""); }}>
            <SelectTrigger className="w-[280px] h-9">
              <SelectValue placeholder="Select an SDG" />
            </SelectTrigger>
            <SelectContent>
              {SDG_GOALS.map((g) => (
                <SelectItem key={g.goal} value={String(g.goal)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={sdgIconPath(g.goal)}
                    alt=""
                    aria-hidden
                    className="size-5 shrink-0 rounded-sm"
                  />
                  {g.goal}. {g.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={pickTarget} onValueChange={setPickTarget} disabled={!pickGoal}>
            <SelectTrigger className="w-[280px] h-9">
              <SelectValue placeholder={pickGoal ? "Select a target" : "Pick an SDG first"} />
            </SelectTrigger>
            <SelectContent align="start" className="w-[560px] max-w-[calc(100vw-2rem)]">
              {availableTargets.length === 0 ? (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  {pickGoal ? "No targets available" : "Pick an SDG first"}
                </div>
              ) : (
                availableTargets.map((t) => (
                  <SelectItem key={t.code} value={t.code} className="items-start whitespace-normal pr-8">
                    {t.code} — {t.title}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>

          <Button onClick={addTarget} disabled={!pickTarget} size="sm" className="shrink-0">
            <Plus className="size-4 mr-1" />{labels.adminEditor.add}
          </Button>
        </div>
      )}

      {/* Selected targets */}
      {selected.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No SDG targets selected yet.
        </div>
      ) : (
        <div className="rounded-xl border bg-card divide-y overflow-hidden">
          {optionItems("sdgPriority").map((groupItem) => {
            const group = groupItem.value;
            const rows = selected.filter((s) => s.priority === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="divide-y">
                <div className="px-4 py-2 bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {`${groupItem.label} goals`}
                </div>
                {rows.map((s) => {
                  const goal = getSdgGoal(s.sdg_goal);
                  const target = getSdgTarget(s.target_code);
                  return (
                    <div key={s.target_code} className="flex items-center gap-3 px-4 py-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sdgIconPath(s.sdg_goal)}
                        alt={goal ? `SDG ${s.sdg_goal}: ${goal.title}` : `SDG ${s.sdg_goal}`}
                        className="size-9 shrink-0 rounded-sm"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {s.target_code}
                          {target ? ` — ${target.target.title}` : ""}
                        </p>
                        {goal && <p className="text-xs text-muted-foreground truncate">{goal.title}</p>}
                      </div>
                      <Select
                        value={s.priority}
                        onValueChange={(v) => setPriority(s.target_code, v as Priority)}
                        disabled={readOnly}
                      >
                        <SelectTrigger className="w-[130px] h-8 text-sm shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {optionItems("sdgPriority").map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          value={s.percentage === 0 ? "" : s.percentage}
                          onChange={(e) => setPercentage(s.target_code, e.target.value)}
                          placeholder="0"
                          className="w-20 h-8 text-sm text-right tabular-nums"
                        />
                        <span className="text-sm text-muted-foreground">%</span>
                      </div>
                      {!readOnly && (
                        <button
                          onClick={() => removeTarget(s.target_code)}
                          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Total */}
          <div className="flex items-center justify-end gap-3 px-4 py-3 bg-muted/30">
            <span className="text-sm font-medium">Total focus</span>
            <span
              className={cn(
                "text-sm font-semibold tabular-nums rounded-full px-2.5 py-0.5",
                isHundred
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}%
            </span>
          </div>
        </div>
      )}

      {selected.length > 0 && !isHundred && (
        <p className="text-xs text-amber-600">
          Focus percentages should add up to 100% (currently {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}%).
        </p>
      )}
    </div>
  );
}
