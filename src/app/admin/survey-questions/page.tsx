"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, ListChecks, Trash2, Pencil, Check, X, GripVertical } from "lucide-react";
import { PageHeader, ErrorBanner, LoadingState } from "@/components/admin/shared";
import { optionItems } from "@/lib/options";

type ReportType = string;

interface StandardQuestion {
  id: number;
  report_type: ReportType;
  question: string;
  sort_order: number;
}

// Per-type explanatory blurbs. Keyed by report-type value; unknown/added types
// fall back to a generic line. Titles come from the editable option labels.
const TYPE_BLURBS: Record<string, string> = {
  annual: "Seed each project's first annual report. Later annual reports copy the previous report.",
  final: "Added to every final report, for all projects.",
};

interface SortableItemProps {
  q: StandardQuestion;
  index: number;
  editId: number | null;
  editQuestion: string;
  setEditQuestion: (v: string) => void;
  savingEdit: boolean;
  onStartEdit: (q: StandardQuestion) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (q: StandardQuestion) => void;
}

function SortableItem({
  q,
  index,
  editId,
  editQuestion,
  setEditQuestion,
  savingEdit,
  onStartEdit,
  onEditSave,
  onEditCancel,
  onDelete,
}: SortableItemProps) {
  const dragDisabled = editId !== null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
    disabled: dragDisabled,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    position: "relative",
    zIndex: isDragging ? 1 : undefined,
  };

  const isEditing = editId === q.id;

  return (
    <li ref={setNodeRef} style={style} className="flex items-start gap-3 px-5 py-3">
      {isEditing ? (
        <>
          <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{index + 1}.</span>
          <div className="flex-1 flex flex-col gap-2">
            <Textarea
              value={editQuestion}
              onChange={(e) => setEditQuestion(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") onEditCancel(); }}
              placeholder="Survey question"
              className="min-h-[70px] resize-y text-sm"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={onEditSave} disabled={savingEdit || !editQuestion.trim()}>
                {savingEdit ? <Loader2 className="size-4 animate-spin" /> : <><Check className="size-4 mr-1" />Save</>}
              </Button>
              <Button size="sm" variant="outline" onClick={onEditCancel}>
                <X className="size-4 mr-1" />Cancel
              </Button>
            </div>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5 cursor-grab active:cursor-grabbing disabled:cursor-default disabled:opacity-30"
            aria-label="Drag to reorder"
          >
            <GripVertical className="size-4" />
          </button>
          <span className="text-xs font-mono text-muted-foreground mt-0.5 w-5 shrink-0">{index + 1}.</span>
          <p className="flex-1 text-sm">{q.question}</p>
          <button
            onClick={() => onStartEdit(q)}
            className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label="Edit question"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            onClick={() => onDelete(q)}
            className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
            aria-label="Delete question"
          >
            <Trash2 className="size-4" />
          </button>
        </>
      )}
    </li>
  );
}

export default function SurveyQuestionsPage() {
  const confirm = useConfirm();
  const [questions, setQuestions] = useState<StandardQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-type "new question" drafts and busy flags.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const types = optionItems("reportType");
  const [adding, setAdding] = useState<ReportType | null>(null);

  // Inline edit state — one question at a time, across all types.
  const [editId, setEditId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-surveys");
      if (!res.ok) throw new Error("Failed to load standard survey questions");
      setQuestions(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleAdd(reportType: ReportType) {
    const question = (drafts[reportType] ?? "").trim();
    if (!question) return;
    setAdding(reportType);
    setError(null);
    try {
      const res = await fetch("/api/standard-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_type: reportType, question }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to add question"); }
      const created: StandardQuestion = await res.json();
      setQuestions((prev) => [...prev, created]);
      setDrafts((prev) => ({ ...prev, [reportType]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(null);
    }
  }

  function startEdit(q: StandardQuestion) {
    setEditId(q.id);
    setEditQuestion(q.question);
    setError(null);
  }

  async function handleEditSave() {
    if (editId === null) return;
    const question = editQuestion.trim();
    if (!question) return;
    setSavingEdit(true);
    setError(null);
    try {
      const res = await fetch("/api/standard-surveys", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editId, question }),
      });
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed to update question"); }
      const updated: StandardQuestion = await res.json();
      setQuestions((prev) => prev.map((q) => q.id === updated.id ? updated : q));
      setEditId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(q: StandardQuestion) {
    if (!await confirm({ message: `Remove this question from all ${q.report_type} reports going forward? Existing reports keep their copy.` })) return;
    setError(null);
    const res = await fetch(`/api/standard-surveys?id=${q.id}`, { method: "DELETE" });
    if (!res.ok) { const err = await res.json().catch(() => ({})); setError(err.error || "Failed to delete question"); return; }
    setQuestions((prev) => prev.filter((x) => x.id !== q.id));
  }

  function handleDragEnd(reportType: ReportType, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const list = questions.filter((q) => q.report_type === reportType);
    const oldIndex = list.findIndex((q) => q.id === active.id);
    const newIndex = list.findIndex((q) => q.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(list, oldIndex, newIndex);
    const previousQuestions = questions;

    setQuestions((prev) => [
      ...prev.filter((q) => q.report_type !== reportType),
      ...reordered,
    ]);

    fetch("/api/standard-surveys/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_type: reportType, ids: reordered.map((q) => q.id) }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to reorder questions");
        }
        const updated: StandardQuestion[] = await res.json();
        setQuestions((prev) => [
          ...prev.filter((q) => q.report_type !== reportType),
          ...updated,
        ]);
      })
      .catch((e) => {
        setQuestions(previousQuestions);
        setError(e instanceof Error ? e.message : "Unknown error");
      });
  }

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        title="Standard Survey Questions"
        description="Questions used to seed new reports of each type, across all projects"
      />

      <div className="flex-1 overflow-auto px-8 py-6">
        {error && <ErrorBanner message={error} />}

        {loading ? (
          <LoadingState />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {types.map((t) => {
              const list = questions.filter((q) => q.report_type === t.value);
              const blurb = TYPE_BLURBS[t.value] ?? `Standard questions added to every ${t.label.toLowerCase()} report, for all projects.`;
              return (
                <section key={t.value} className="rounded-xl border bg-card flex flex-col">
                  <div className="border-b px-5 py-3.5">
                    <h2 className="t-heading-sub">{t.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
                  </div>

                  {list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
                      <ListChecks className="size-7 opacity-30" />
                      <p className="text-sm">No standard questions yet.</p>
                    </div>
                  ) : (
                    <DndContext
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(e) => handleDragEnd(t.value, e)}
                    >
                      <SortableContext items={list.map((q) => q.id)} strategy={verticalListSortingStrategy}>
                        <ul className="divide-y">
                          {list.map((q, i) => (
                            <SortableItem
                              key={q.id}
                              q={q}
                              index={i}
                              editId={editId}
                              editQuestion={editQuestion}
                              setEditQuestion={setEditQuestion}
                              savingEdit={savingEdit}
                              onStartEdit={startEdit}
                              onEditSave={handleEditSave}
                              onEditCancel={() => setEditId(null)}
                              onDelete={handleDelete}
                            />
                          ))}
                        </ul>
                      </SortableContext>
                    </DndContext>
                  )}

                  <div className="border-t px-5 py-3 flex gap-2 mt-auto">
                    <Input
                      placeholder="Add a standard question…"
                      value={drafts[t.value] ?? ""}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [t.value]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdd(t.value); }}
                      className="flex-1"
                    />
                    <Button
                      onClick={() => handleAdd(t.value)}
                      disabled={adding === t.value || !(drafts[t.value] ?? "").trim()}
                      size="sm"
                      className="shrink-0"
                    >
                      {adding === t.value ? <Loader2 className="size-4 animate-spin" /> : <><Plus className="size-4 mr-1" />Add</>}
                    </Button>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
