"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";

// ─────────────────────────────────────────────────────────────────────────────
// Config-driven editor for the repeatable "list of items under a report" sections
// (key achievements, partnerships, results, lessons learned, external coverage).
// One component + one spec per section replaces five near-identical table blocks.
// Save is driven by the parent page's top-bar button via a ref, exactly like the
// other tabs.
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

export interface SectionHandle {
  save: () => Promise<void>;
}

interface RowState {
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

export const SectionTableEditor = forwardRef<
  SectionHandle,
  {
    reportId: number;
    spec: SectionSpec;
    onDirtyChange?: (dirty: boolean) => void;
    onEmptyCountChange?: (count: number) => void;
  }
>(function SectionTableEditor({ reportId, spec, onDirtyChange, onEmptyCountChange }, ref) {
  const { endpoint, fields, requiredField, addLabel, emptyText, min, max } = spec;
  const linkKeys = useMemo(() => fields.filter((f) => f.type === "links").map((f) => f.key), [fields]);

  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const emptyRow = useCallback(
    (dirty: boolean): RowState => ({
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
      const loaded: RowState[] = data.map((r) => ({
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
      }));
      while (min && loaded.length < min) loaded.push(emptyRow(false));
      setRows(loaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [endpoint, reportId, fields, linkKeys, min, emptyRow]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => { onDirtyChange?.(rows.some((r) => r.dirty)); }, [rows, onDirtyChange]);
  useEffect(() => {
    onEmptyCountChange?.(rows.filter((r) => !(r.values[requiredField] ?? "").trim()).length);
  }, [rows, requiredField, onEmptyCountChange]);

  function updateField(i: number, key: string, value: string) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, values: { ...r.values, [key]: value }, dirty: true } : r)));
  }
  function mutateLinks(i: number, key: string, fn: (arr: string[]) => string[]) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, links: { ...r.links, [key]: fn(r.links[key]) }, dirty: true } : r)));
  }
  function addRow() {
    if (max !== undefined && rows.length >= max) return;
    setRows((prev) => [...prev, emptyRow(true)]);
  }
  async function deleteRow(i: number) {
    const row = rows[i];
    if (row.id != null) await fetch(`${endpoint}?id=${row.id}`, { method: "DELETE" });
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  useImperativeHandle(
    ref,
    () => ({
      save: async () => {
        const updated = [...rows];
        for (let i = 0; i < updated.length; i++) {
          const row = updated[i];
          if (!row.dirty) continue;
          const payload: Record<string, string | null> = {};
          for (const f of fields) {
            payload[f.key] =
              f.type === "links"
                ? row.links[f.key].filter((l) => l.trim()).join(",") || null
                : row.values[f.key] || null;
          }
          if (row.id === null) {
            const res = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reportId, ...payload }),
            });
            if (!res.ok) throw new Error("Failed to save row");
            const saved: { id: number } = await res.json();
            updated[i] = { ...row, id: saved.id, dirty: false };
          } else {
            const res = await fetch(endpoint, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: row.id, ...payload }),
            });
            if (!res.ok) throw new Error(`Failed to save row ${row.id}`);
            updated[i] = { ...row, dirty: false };
          }
        }
        setRows(updated);
      },
    }),
    [rows, endpoint, fields, reportId]
  );

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
            <tr key={i} className={cn("transition-colors", row.dirty && "bg-amber-50/40")}>
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
});

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
