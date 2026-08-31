"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Plus, Loader2, FileText, Trash2, Pencil, Check, X, Info } from "lucide-react";
import { PageHeader, ErrorBanner, LoadingState } from "@/components/admin/shared";

interface NarrativeQuestion {
  id: number;
  narrative_key: string;
  label: string;
  description: string | null;
  sort_order: number;
}

export default function NarrativeQuestionsPage() {
  const confirm = useConfirm();
  const [questions, setQuestions] = useState<NarrativeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draftLabel, setDraftLabel] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [adding, setAdding] = useState(false);

  // Inline edit state.
  const [editId, setEditId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-narratives");
      if (!res.ok) throw new Error("Failed to load narrative questions");
      setQuestions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    const label = draftLabel.trim();
    if (!label) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-narratives", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, description: draftDesc.trim() }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to add question"); }
      const created: NarrativeQuestion = await res.json();
      setQuestions((prev) => [...prev, created]);
      setDraftLabel("");
      setDraftDesc("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(q: NarrativeQuestion) {
    setEditId(q.id);
    setEditLabel(q.label);
    setEditDesc(q.description ?? "");
  }

  async function handleEditSave() {
    if (editId === null) return;
    const label = editLabel.trim();
    if (!label) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-narratives", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, label, description: editDesc.trim() }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update question"); }
      const updated: NarrativeQuestion = await res.json();
      setQuestions((prev) => prev.map((q) => q.id === updated.id ? updated : q));
      setEditId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(q: NarrativeQuestion) {
    if (!await confirm({ message: `Remove "${q.label}" from new projects going forward? Existing projects keep their copy.` })) return;
    setError(null);
    const res = await fetch(`/api/standard-narratives?id=${q.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to delete question"); return; }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Narrative Questions"
        description="Project-document narrative sections partners fill out. New projects snapshot this set at creation."
      />

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <div>
            <section className="rounded-xl border bg-card flex flex-col">
              <div className="border-b px-5 py-3.5">
                <h2 className="text-sm font-semibold">Narrative Sections</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Seeds the narratives tab of each new project document. The description is shown under the section heading in the editor. Editing or removing a question here does not change existing projects.
                </p>
              </div>

              {questions.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                  <FileText className="size-7 opacity-30" />
                  <p className="text-sm">No narrative questions yet.</p>
                </div>
              ) : (
                <ul className="divide-y">
                  {questions.map((q, i) => (
                    <li key={q.id} className="flex items-start gap-3 px-5 py-3">
                      <span className="text-xs font-mono text-muted-foreground mt-1.5 w-5 shrink-0">{i + 1}.</span>
                      {editId === q.id ? (
                        <div className="flex-1 flex flex-col gap-2">
                          <Input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Escape") setEditId(null); }}
                            placeholder="Section title"
                            autoFocus
                          />
                          <Textarea
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="Description (shown under the section heading in the editor)"
                            className="min-h-[70px] resize-y text-sm"
                          />
                          <div className="flex items-center gap-2">
                            <Button size="sm" onClick={handleEditSave} disabled={savingEdit || !editLabel.trim()}>
                              {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <><Check className="size-4 mr-1" />Save</>}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setEditId(null)}>
                              <X className="size-4 mr-1" />Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex-1 min-w-0 mt-0.5 flex items-center gap-1.5">
                            <p className="text-sm">{q.label}</p>
                            {q.description && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" aria-label={q.description}>
                                    <Info className="size-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs whitespace-pre-line">{q.description}</TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                          <button
                            onClick={() => startEdit(q)}
                            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-1"
                            aria-label="Edit question"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            onClick={() => handleDelete(q)}
                            className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-1"
                            aria-label="Delete question"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="border-t px-5 py-3 flex flex-col gap-2 mt-auto">
                <Input
                  placeholder="Add a narrative section…"
                  value={draftLabel}
                  onChange={(e) => setDraftLabel(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
                />
                <div className="flex gap-2">
                  <Textarea
                    placeholder="Description (optional — shown under the section heading in the editor)"
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    className="min-h-[38px] resize-y text-sm flex-1"
                  />
                  <Button
                    onClick={handleAdd}
                    disabled={adding || !draftLabel.trim()}
                    size="sm"
                    className="shrink-0 self-start"
                  >
                    {adding ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />Add</>}
                  </Button>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
