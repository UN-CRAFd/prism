"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { useAutosave, type SaveState } from "@/components/autosave";

// ─────────────────────────────────────────────────────────────────────────────
// Config-driven editor for the repeatable "list of items under a report" sections
// (key achievements, partnerships, results, lessons learned, external coverage).
// One component + one spec per section replaces five near-identical table blocks.
// Every edit autosaves (debounced); the component reports its save state up via
// onSaveStateChange so the parent can render a single shared indicator.
// ─────────────────────────────────────────────────────────────────────────────

export type SectionFieldType = "input" | "textarea" | "select" | "links";

export interface SectionField {
  key: string;
  header: string;
  remark?: string;
  type: SectionFieldType;
  placeholder?: string;
  options?: readonly string[];
  headClass?: string; // column width utility class
}

export interface SectionSpec {
  endpoint: string;
  fields: SectionField[];
  requiredField: string; // drives the "incomplete" count for the tab badge
  addLabel: string;
  emptyText?: string; // empty-state row (omitted for sections seeded to `min`)
  min?: number; // seed empty rows up to this many
  max?: number; // cap the number of rows
}

interface RowState {
  key: number; // stable client id (survives reorder/save; drives POST id tracking)
  id: number | null;
  values: Record<string, string>;
  links: Record<string, string[]>;
  dirty: boolean;
}

// Row coming back from the API: scalar columns + comma-joined link strings.
type ApiRow = { id: number } & Record<string, unknown>;

function MultiLinkInput({
  links,
  onAdd,
  onRemove,
  onUpdate,
  placeholder,
}: {
  links: string[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onUpdate: (index: number, value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      {links.map((link, li) => (
        <div key={li} className="flex items-center gap-1.5">
          <Input value={link} onChange={(e) => onUpdate(li, e.target.value)} placeholder={placeholder} className="text-sm" />
          {links.length > 1 && (
            <button onClick={() => onRemove(li)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0" aria-label="Remove link">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      ))}
      <button onClick={onAdd} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors pt-0.5">
        <Plus className="size-3" /> Add link
      </button>
    </div>
  );
}

export function SectionTableEditor({
  reportId,
  spec,
  onEmptyCountChange,
  onSaveStateChange,
}: {
  reportId: number;
  spec: SectionSpec;
  onEmptyCountChange?: (count: number) => void;
  onSaveStateChange?: (s: SaveState) => void;
}) {
  const { endpoint, fields, requiredField, addLabel, emptyText, min, max } = spec;
  const linkKeys = useMemo(() => fields.filter((f) => f.type === "links").map((f) => f.key), [fields]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const rowsRef = useRef<RowState[]>([]);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const keyRef = useRef(0);
  // Maps a row's stable client key → its server id, so a re-entrant flush never
  // POSTs the same new row twice before React commits the returned id.
  const idByKeyRef = useRef<Map<number, number>>(new Map());

  const emptyRow = useCallback(
    (dirty: boolean): RowState => ({
      key: ++keyRef.current,
      id: null,
      values: Object.fromEntries(fields.filter((f) => f.type !== "links").map((f) => [f.key, ""])),
      links: Object.fromEntries(linkKeys.map((k) => [k, [""]])),
      dirty,
    }),
    [fields, linkKeys]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}?reportId=${reportId}`);
      if (!res.ok) throw new Error("Failed to load");
      const data: ApiRow[] = await res.json();
      keyRef.current = 0;
      idByKeyRef.current = new Map();
      const loaded: RowState[] = data.map((r) => {
        const key = ++keyRef.current;
        idByKeyRef.current.set(key, r.id);
        return {
          key,
          id: r.id,
          values: Object.fromEntries(
            fields.filter((f) => f.type !== "links").map((f) => [f.key, (r[f.key] as string) ?? ""])
          ),
          links: Object.fromEntries(
            linkKeys.map((k) => {
              const raw = r[k] as string | null;
              return [k, raw ? raw.split(",").map((l) => l.trim()).filter(Boolean) : [""]];
            })
          ),
          dirty: false,
        };
      });
      while (min && loaded.length < min) loaded.push(emptyRow(false));
      setRows(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, reportId, fields, linkKeys, min, emptyRow]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    onEmptyCountChange?.(rows.filter((r) => !(r.values[requiredField] ?? "").trim()).length);
  }, [rows, requiredField, onEmptyCountChange]);

  const buildPayload = useCallback((row: RowState) => {
    const payload: Record<string, string | null> = {};
    for (const f of fields) {
      payload[f.key] =
        f.type === "links"
          ? row.links[f.key].filter((l) => l.trim()).join(",") || null
          : row.values[f.key] || null;
    }
    return payload;
  }, [fields]);

  // Save every dirty row. New rows (no id) POST once — tracked by client key so a
  // re-entrant flush can't double-create — the rest PATCH. A row's dirty flag is
  // only cleared if its content hasn't changed since we snapshotted it, so edits
  // made mid-save aren't lost.
  const flush = useCallback(async () => {
    for (const row of rowsRef.current) {
      if (!row.dirty) continue;
      const effectiveId = row.id ?? idByKeyRef.current.get(row.key) ?? null;
      // Hold off creating a brand-new row until it has some content (a blank row
      // added but never typed into shouldn't hit the database).
      const isEmpty = fields.every((f) =>
        f.type === "links" ? row.links[f.key].every((l) => !l.trim()) : !(row.values[f.key] ?? "").trim()
      );
      if (effectiveId === null && isEmpty) continue;
      const payload = buildPayload(row);
      const snapshot = JSON.stringify(payload);
      const clear = (r: RowState, extra: Partial<RowState>): RowState =>
        r.key === row.key ? { ...r, ...extra, dirty: JSON.stringify(buildPayload({ ...r, ...extra })) === snapshot ? false : r.dirty } : r;

      if (effectiveId === null) {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reportId, ...payload }),
        });
        if (!res.ok) throw new Error("Failed to save row");
        const saved: { id: number } = await res.json();
        idByKeyRef.current.set(row.key, saved.id);
        setRows((prev) => prev.map((r) => clear(r, { id: saved.id })));
      } else {
        const res = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: effectiveId, ...payload }),
        });
        if (!res.ok) throw new Error(`Failed to save row ${effectiveId}`);
        setRows((prev) => prev.map((r) => clear(r, { id: effectiveId })));
      }
    }
  }, [endpoint, reportId, requiredField, buildPayload]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Flush any pending edit on unmount (e.g. switching section tabs).
  useEffect(() => () => { flushNow(); }, [flushNow]);

  function updateField(i: number, key: string, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, values: { ...r.values, [key]: value }, dirty: true } : r)));
    schedule();
  }
  function mutateLinks(i: number, key: string, fn: (arr: string[]) => string[]) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, links: { ...r.links, [key]: fn(r.links[key]) }, dirty: true } : r)));
    schedule();
  }
  function addRow() {
    if (max !== undefined && rows.length >= max) return;
    setRows((prev) => [...prev, emptyRow(true)]);
  }
  async function deleteRow(i: number) {
    const row = rows[i];
    const effectiveId = row.id ?? idByKeyRef.current.get(row.key) ?? null;
    if (effectiveId != null) await fetch(`${endpoint}?id=${effectiveId}`, { method: "DELETE" });
    idByKeyRef.current.delete(row.key);
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {labels.partnerEditor.loading}
      </div>
    );
  }
  if (error) {
    return <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error}</div>;
  }

  const hasRemarks = fields.some((f) => f.remark);
  const colCount = 2 + fields.length; // number + fields + actions
  const minRows = min ?? 0;
  const canAdd = max === undefined || rows.length < max;

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-3 text-xs font-medium text-muted-foreground w-10">#</th>
            {fields.map((f) => (
              <th key={f.key} className={cn("text-left px-4 py-3 text-xs font-medium text-muted-foreground", f.headClass)}>
                {f.header}
              </th>
            ))}
            <th className="w-10 px-4 py-3" />
          </tr>
          {hasRemarks && (
            <tr className="border-b bg-background">
              <td />
              {fields.map((f) => (
                <td key={f.key} className="px-4 py-1 text-[11px] text-muted-foreground leading-tight align-top">
                  {f.remark}
                </td>
              ))}
              <td />
            </tr>
          )}
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={row.key} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
              <td className="px-4 py-3 align-top text-xs font-mono text-muted-foreground">{i + 1}.</td>
              {fields.map((f) => (
                <td key={f.key} className="px-4 py-3 align-top">
                  {f.type === "input" ? (
                    <Input value={row.values[f.key]} onChange={(e) => updateField(i, f.key, e.target.value)} placeholder={f.placeholder} className="text-sm" />
                  ) : f.type === "textarea" ? (
                    <Textarea value={row.values[f.key]} onChange={(e) => updateField(i, f.key, e.target.value)} placeholder={f.placeholder} className="text-sm min-h-[80px] resize-y" />
                  ) : f.type === "select" ? (
                    <Select value={row.values[f.key] || "none"} onValueChange={(v) => updateField(i, f.key, v === "none" ? "" : v)}>
                      <SelectTrigger className="w-full h-9 text-sm">
                        {row.values[f.key] ? <span>{row.values[f.key]}</span> : <span className="text-muted-foreground">Select…</span>}
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                        {f.options?.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <MultiLinkInput
                      links={row.links[f.key]}
                      onAdd={() => mutateLinks(i, f.key, (arr) => [...arr, ""])}
                      onRemove={(li) => mutateLinks(i, f.key, (arr) => arr.filter((_, x) => x !== li))}
                      onUpdate={(li, val) => mutateLinks(i, f.key, (arr) => arr.map((l, x) => (x === li ? val : l)))}
                      placeholder={f.placeholder ?? "https://…"}
                    />
                  )}
                </td>
              ))}
              <td className="px-4 py-3 align-top text-center">
                {rows.length > minRows && (
                  <button onClick={() => deleteRow(i)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Delete row">
                    <Trash2 className="size-4" />
                  </button>
                )}
              </td>
            </tr>
          ))}
          {rows.length === 0 && emptyText && (
            <tr>
              <td colSpan={colCount} className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyText}</td>
            </tr>
          )}
        </tbody>
      </table>
      {canAdd && (
        <div className="px-4 py-3 border-t">
          <Button onClick={addRow} variant="outline" size="sm" className="gap-1.5">
            <Plus className="size-3.5" /> {addLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Per-section specs ────────────────────────────────────────────────────────

export const SECTION_SPECS: Record<string, SectionSpec> = {
  achievements: {
    endpoint: "/api/achievements",
    requiredField: "achievement",
    addLabel: labels.partnerEditor.addAchievement,
    emptyText: labels.partnerEditor.emptyKeyAchievements,
    max: 3,
    fields: [
      { key: "achievement", header: labels.keyAchievements.columns.achievement, remark: labels.keyAchievements.remarks.achievement, type: "textarea", placeholder: labels.placeholders.achievement, headClass: "w-[35%]" },
      { key: "significance", header: labels.keyAchievements.columns.significance, remark: labels.keyAchievements.remarks.significance, type: "textarea", placeholder: labels.placeholders.significance, headClass: "w-[35%]" },
      { key: "links", header: labels.keyAchievements.columns.links, remark: labels.keyAchievements.remarks.links, type: "links", placeholder: labels.placeholders.achievementLinks, headClass: "w-64" },
    ],
  },
  partnerships: {
    endpoint: "/api/partnerships",
    requiredField: "partner_organization",
    addLabel: labels.partnerEditor.addPartner,
    emptyText: labels.partnerEditor.emptyPartnerships,
    fields: [
      { key: "partner_organization", header: labels.partnerships.columns.partnerOrganization, remark: labels.partnerships.remarks.partnerOrganization, type: "input", placeholder: labels.placeholders.partnerOrganization, headClass: "w-[28%]" },
      { key: "result", header: labels.partnerships.columns.result, remark: labels.partnerships.remarks.result, type: "textarea", placeholder: labels.placeholders.partnershipResult },
      { key: "links", header: labels.partnerships.columns.links, remark: labels.partnerships.remarks.links, type: "links", placeholder: labels.placeholders.achievementLinks, headClass: "w-64" },
    ],
  },
  results: {
    endpoint: "/api/results",
    requiredField: "context",
    addLabel: labels.partnerEditor.addResult,
    min: 3,
    fields: [
      { key: "context", header: labels.results.columns.context, remark: labels.results.remarks.context, type: "textarea", placeholder: labels.placeholders.resultContext, headClass: "w-[25%]" },
      { key: "data_driven_decision", header: labels.results.columns.dataDrivenDecision, remark: labels.results.remarks.dataDrivenDecision, type: "textarea", placeholder: labels.placeholders.dataDrivenDecision, headClass: "w-[25%]" },
      { key: "resulting_impact", header: labels.results.columns.resultingImpact, remark: labels.results.remarks.resultingImpact, type: "textarea", placeholder: labels.placeholders.resultingImpact, headClass: "w-[25%]" },
      { key: "links", header: labels.results.columns.links, remark: labels.results.remarks.links, type: "links", placeholder: labels.placeholders.achievementLinks, headClass: "w-48" },
    ],
  },
  lessons: {
    endpoint: "/api/lessons-learned",
    requiredField: "lesson_learned",
    addLabel: labels.partnerEditor.addLesson,
    emptyText: labels.partnerEditor.emptyLessons,
    max: 5,
    fields: [
      { key: "category", header: labels.lessons.columns.category, remark: labels.lessons.remarks.category, type: "select", options: labels.lessons.categories, headClass: "w-44" },
      { key: "lesson_learned", header: labels.lessons.columns.lessonLearned, remark: labels.lessons.remarks.lessonLearned, type: "textarea", placeholder: "Briefly describe what your organization learned…", headClass: "w-[38%]" },
      { key: "adjustment_informed", header: labels.lessons.columns.adjustmentInformed, remark: labels.lessons.remarks.adjustmentInformed, type: "textarea", placeholder: "Explain what you changed or will change as a result…" },
    ],
  },
  "external-coverage": {
    endpoint: "/api/external-coverage",
    requiredField: "description",
    addLabel: labels.partnerEditor.addCoverage,
    min: 3,
    fields: [
      { key: "type", header: labels.externalCoverage.columns.type, remark: labels.externalCoverage.remarks.type, type: "select", options: labels.externalCoverage.types, headClass: "w-44" },
      { key: "description", header: labels.externalCoverage.columns.description, remark: labels.externalCoverage.remarks.description, type: "textarea", placeholder: labels.placeholders.coverageDescription, headClass: "w-[28%]" },
      { key: "reach_indicator", header: labels.externalCoverage.columns.reachIndicator, remark: labels.externalCoverage.remarks.reachIndicator, type: "textarea", placeholder: labels.placeholders.reachIndicator, headClass: "w-[20%]" },
      { key: "links", header: labels.externalCoverage.columns.links, remark: labels.externalCoverage.remarks.links, type: "links", placeholder: labels.placeholders.achievementLinks, headClass: "w-52" },
    ],
  },
};
