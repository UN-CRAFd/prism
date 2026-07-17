"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Target, ArchiveRestore } from "lucide-react";
import {
  Dash, Field, ViewToggle, LoadingState, ErrorBanner, FormShell, RowActions, PageHeader, HoverActions,
} from "@/components/admin/shared";
import { CYCLE_KEYS, cycleLabel } from "@/lib/indicators";
import labels from "@/lib/labels.json";

interface IndicatorUsage {
  report_id: number;
  year: number;
  project_short_name: string | null;
  project_title: string;
}

interface Indicator {
  id: number;
  name: string;
  description: string | null;
  means_of_verification: string | null;
  category: string | null;
  cycle: string | null;
  is_standard: boolean;
  project_id: number | null;
  archived_at: string | null;
  usage: IndicatorUsage[];
}

function UsageBadges({ usage }: { usage: IndicatorUsage[] }) {
  if (usage.length === 0) {
    return <span className="text-[11px] italic text-muted-foreground">No longer used in any report</span>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[11px] text-muted-foreground">Still used in:</span>
      {usage.map((u) => (
        <Badge key={u.report_id} variant="outline" className="text-[10px] font-normal">
          {(u.project_short_name || u.project_title)} · {u.year}
        </Badge>
      ))}
    </div>
  );
}

const NONE = "none";

export default function IndicatorsPage() {
  const [indicators, setIndicators] = useState<Indicator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "grid">("list");
  const [showArchived, setShowArchived] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [cycle, setCycle] = useState<string>(NONE);
  const [description, setDescription] = useState("");
  const [mov, setMov] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/indicators${showArchived ? "?include_archived=1" : ""}`);
      if (!res.ok) throw new Error("Failed to fetch indicators");
      setIndicators(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  function resetForm() {
    setName(""); setCategory(""); setCycle(NONE); setDescription(""); setMov("");
    setEditId(null); setShowForm(false); setFormError(null);
  }

  function startEdit(ind: Indicator) {
    setName(ind.name);
    setCategory(ind.category || "");
    setCycle(ind.cycle || NONE);
    setDescription(ind.description || "");
    setMov(ind.means_of_verification || "");
    setEditId(ind.id); setShowForm(true); setFormError(null);
  }

  async function handleSubmit() {
    if (!name.trim()) { setFormError("Name is required"); return; }
    setSaving(true); setFormError(null);
    try {
      const body = {
        name: name.trim(),
        category: category.trim() || null,
        cycle: cycle === NONE ? null : cycle,
        description: description.trim() || null,
        means_of_verification: mov.trim() || null,
      };
      const res = await fetch(
        editId ? `/api/indicators/${editId}` : "/api/indicators",
        { method: editId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      );
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to save"); }
      resetForm(); load();
    } catch (e) { setFormError(e instanceof Error ? e.message : "Unknown error"); }
    finally { setSaving(false); }
  }

  const confirm = useConfirm();

  async function handleArchive(ind: Indicator) {
    const used = ind.usage.length > 0;
    const message = used
      ? "Archive this indicator? It will be hidden from the library and the report-editor typeahead, but the report data still using it is kept."
      : "This indicator isn't used in any report. Delete it permanently? This cannot be undone.";
    if (!await confirm({ message })) return;
    const res = await fetch(`/api/indicators/${ind.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to remove indicator"); return; }
    load();
  }

  async function handleRestore(id: number) {
    const res = await fetch(`/api/indicators/${id}?restore=1`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json(); alert(err.error || "Failed to restore"); return; }
    load();
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader title="Indicators" description="Manage the standard indicator library">
        <label className="flex items-center gap-2 text-xs text-muted-foreground mr-2 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="size-3.5 rounded" />
          Show archived
        </label>
        <ViewToggle view={view} onChange={setView} />
        {!showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="size-3.5" /> {labels.adminEditor.addIndicator}
          </Button>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {showForm && (
          <FormShell
            title={editId ? "Edit indicator" : "New indicator"}
            onClose={resetForm}
            error={formError}
            saving={saving}
            editMode={!!editId}
            onCancel={resetForm}
            onSubmit={handleSubmit}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label={labels.indicators.columns.indicator} required>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={labels.placeholders.indicatorName} />
              </Field>
              <Field label={labels.indicators.columns.category}>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder={labels.placeholders.indicatorCategory} />
              </Field>
              <Field label={labels.indicators.columns.cycle}>
                <Select value={cycle} onValueChange={setCycle}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="—" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}><span className="text-muted-foreground">—</span></SelectItem>
                    {CYCLE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>{cycleLabel(k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={labels.indicators.columns.meansOfVerification}>
                <Input value={mov} onChange={(e) => setMov(e.target.value)} placeholder={labels.placeholders.meansOfVerification} />
              </Field>
              <div className="md:col-span-2">
                <Field label="Description">
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={labels.placeholders.indicatorDescription} className="min-h-[80px] resize-y" />
                </Field>
              </div>
            </div>
          </FormShell>
        )}

        {loading ? (
          <LoadingState />
        ) : indicators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Target className="size-8 opacity-30" />
            <p className="text-sm">No indicators yet.</p>
          </div>
        ) : view === "list" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{labels.indicators.columns.indicator}</TableHead>
                <TableHead className="w-32">{labels.indicators.columns.category}</TableHead>
                <TableHead className="w-28">{labels.indicators.columns.cycle}</TableHead>
                <TableHead>{labels.indicators.columns.meansOfVerification}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {indicators.map((ind) => (
                <TableRow key={ind.id} className={ind.archived_at ? "opacity-50" : ""}>
                  <TableCell className="font-medium">
                    {ind.name}
                    {ind.archived_at && <Badge variant="outline" className="ml-2 text-[10px]">Archived</Badge>}
                    {ind.description && <p className="text-xs text-muted-foreground font-normal mt-0.5 line-clamp-2">{ind.description}</p>}
                    {ind.archived_at && <div className="mt-1"><UsageBadges usage={ind.usage} /></div>}
                  </TableCell>
                  <TableCell>{ind.category ? <Badge variant="secondary" className="text-xs font-normal">{ind.category}</Badge> : <Dash />}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ind.cycle ? cycleLabel(ind.cycle) : <Dash />}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{ind.means_of_verification || <Dash />}</TableCell>
                  <TableCell>
                    {ind.archived_at ? (
                      <Button variant="ghost" size="icon" className="size-7" title="Restore" onClick={() => handleRestore(ind.id)}>
                        <ArchiveRestore className="size-3.5" />
                      </Button>
                    ) : (
                      <RowActions onEdit={() => startEdit(ind)} onDelete={() => handleArchive(ind)} />
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {indicators.map((ind) => (
              <div key={ind.id} className={`group rounded-xl border bg-card p-5 flex flex-col gap-2 transition-colors hover:bg-muted/30 ${ind.archived_at ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold leading-snug flex-1">{ind.name}</p>
                  {ind.archived_at ? (
                    <Button variant="ghost" size="icon" className="size-7" title="Restore" onClick={() => handleRestore(ind.id)}>
                      <ArchiveRestore className="size-3.5" />
                    </Button>
                  ) : (
                    <HoverActions onEdit={() => startEdit(ind)} onDelete={() => handleArchive(ind)} />
                  )}
                </div>
                {ind.description && <p className="text-xs text-muted-foreground line-clamp-3">{ind.description}</p>}
                {ind.archived_at && <UsageBadges usage={ind.usage} />}
                <div className="flex flex-wrap gap-1 mt-auto pt-1">
                  {ind.category && <Badge variant="secondary" className="text-xs font-normal">{ind.category}</Badge>}
                  {ind.cycle && <Badge variant="outline" className="text-xs font-normal">{cycleLabel(ind.cycle)}</Badge>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
