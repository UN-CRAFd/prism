"use client";

export const dynamic = "force-dynamic";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
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
  category: string | null;
}

// Per-type explanatory blurbs. Keyed by report-type value; unknown/added types
// fall back to a generic line. Titles come from the editable option labels.
const TYPE_BLURBS: Record<string, string> = {
  annual: "Seed each project's first annual report. Later annual reports copy the previous report.",
  final: "Added to every final report, for all projects.",
};

// Shared callback props for row actions.
interface ItemCallbacks {
  editId: number | null;
  editQuestion: string;
  setEditQuestion: (v: string) => void;
  savingEdit: boolean;
  onStartEdit: (q: StandardQuestion) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (q: StandardQuestion) => void;
}

// Presentational row — no dnd hooks. Safe to use inside DragOverlay without
// registering a second id with the same DndContext.
interface QuestionRowProps extends ItemCallbacks {
  q: StandardQuestion;
  index: number;
  liRef?: (el: HTMLElement | null) => void;
  liStyle?: React.CSSProperties;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

function QuestionRow({
  q, index, liRef, liStyle, dragHandleProps,
  editId, editQuestion, setEditQuestion,
  savingEdit, onStartEdit, onEditSave, onEditCancel, onDelete,
}: QuestionRowProps) {
  const isEditing = editId === q.id;
  return (
    <li ref={liRef} style={liStyle} className="flex items-start gap-3 px-5 py-3">
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
            {...dragHandleProps}
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

// Sortable wrapper — calls useSortable and passes refs/listeners to QuestionRow.
type SortableItemProps = ItemCallbacks & { q: StandardQuestion; index: number };

function SortableItem({ q, index, ...callbacks }: SortableItemProps) {
  const dragDisabled = callbacks.editId !== null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: q.id,
    disabled: dragDisabled,
    data: { category: q.category, report_type: q.report_type },
  });
  return (
    <QuestionRow
      q={q}
      index={index}
      {...callbacks}
      liRef={setNodeRef}
      liStyle={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.3 : undefined,
        position: "relative",
        zIndex: isDragging ? 1 : undefined,
      }}
      dragHandleProps={dragDisabled ? {} : { ...attributes, ...listeners }}
    />
  );
}

// Droppable container for a category group. Uses a SortableContext internally.
// The `containerId` is `${reportType}::${category|"__uncategorised__"}`.
interface CategoryGroupProps {
  containerId: string;
  label: string;
  items: StandardQuestion[];
  globalOffset: number; // index of first item in this group across the report type
  editId: number | null;
  editQuestion: string;
  setEditQuestion: (v: string) => void;
  savingEdit: boolean;
  onStartEdit: (q: StandardQuestion) => void;
  onEditSave: () => void;
  onEditCancel: () => void;
  onDelete: (q: StandardQuestion) => void;
}

function CategoryGroup({
  containerId,
  label,
  items,
  globalOffset,
  editId,
  editQuestion,
  setEditQuestion,
  savingEdit,
  onStartEdit,
  onEditSave,
  onEditCancel,
  onDelete,
}: CategoryGroupProps) {
  // useDroppable on the wrapper div makes the whole group a valid drop target
  // even when empty. useSortable({ disabled: true }) silently disables droppable
  // as well as draggable, so it can't be used for empty containers.
  const { setNodeRef } = useDroppable({ id: containerId });
  const ids = items.map((q) => q.id);

  return (
    <div ref={setNodeRef} className="border-t first:border-t-0">
      <p className="px-5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide bg-muted/40">
        {label}
      </p>
      <SortableContext id={containerId} items={ids} strategy={verticalListSortingStrategy}>
        {items.length === 0 ? (
          // Visual cue only — useDroppable on the wrapper handles droppability.
          <EmptyDropTarget />
        ) : (
          <ul className="divide-y">
            {items.map((q, i) => (
              <SortableItem
                key={q.id}
                q={q}
                index={globalOffset + i}
                editId={editId}
                editQuestion={editQuestion}
                setEditQuestion={setEditQuestion}
                savingEdit={savingEdit}
                onStartEdit={onStartEdit}
                onEditSave={onEditSave}
                onEditCancel={onEditCancel}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
      </SortableContext>
    </div>
  );
}

// Visual placeholder for empty containers — no dnd hooks needed.
function EmptyDropTarget() {
  return (
    <div className="h-8 flex items-center px-5">
      <span className="text-xs text-muted-foreground italic">Drop here</span>
    </div>
  );
}

// Rebuild the full ordered flat list for a report type from the current
// category groups, preserving the canonical ordering (defined categories in
// options order, then Uncategorised).
function buildOrderedList(
  questions: StandardQuestion[],
  reportType: ReportType,
  categoryValues: string[]
): StandardQuestion[] {
  const forType = questions.filter((q) => q.report_type === reportType);
  const byCategory = new Map<string | null, StandardQuestion[]>();
  for (const q of forType) {
    const k = q.category ?? null;
    if (!byCategory.has(k)) byCategory.set(k, []);
    byCategory.get(k)!.push(q);
  }
  const result: StandardQuestion[] = [];
  for (const cat of categoryValues) {
    result.push(...(byCategory.get(cat) ?? []));
  }
  result.push(...(byCategory.get(null) ?? []));
  return result;
}

export default function SurveyQuestionsPage() {
  const confirm = useConfirm();
  const [questions, setQuestions] = useState<StandardQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-type "new question" drafts and busy flags.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const types = optionItems("reportType");
  const categoryItems = optionItems("surveyCategory");
  const categoryValues = categoryItems.map((c) => c.value);
  const [adding, setAdding] = useState<ReportType | null>(null);

  // Inline edit state — one question at a time, across all types.
  const [editId, setEditId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  // Active drag item (for DragOverlay).
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);

  // Track which report type is currently being dragged, to prevent cross-type drops.
  const activeDragReportType = useRef<string | null>(null);

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

  // Resolve the category a container id encodes. Containers are keyed as
  // `${reportType}::${categoryValue|"__uncategorised__"}`.
  function containerCategory(containerId: string): string | null {
    const suffix = containerId.split("::").slice(1).join("::");
    return suffix === "__uncategorised__" ? null : suffix;
  }

  function containerReportType(containerId: string): string {
    return containerId.split("::")[0];
  }

  // Find the container id for a given item id in the current questions state.
  function findContainer(itemId: UniqueIdentifier, qs: StandardQuestion[]): string | null {
    const q = qs.find((x) => x.id === itemId);
    if (!q) return null;
    const cat = q.category ?? "__uncategorised__";
    return `${q.report_type}::${cat}`;
  }

  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id;
    setActiveId(id);
    const q = questions.find((x) => x.id === id);
    activeDragReportType.current = q?.report_type ?? null;
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;

    // Reject cross-report-type drags immediately.
    const draggedReportType = activeDragReportType.current;
    if (!draggedReportType) return;

    // `over` may be a container id (from useDroppable) or an item id.
    const overId = over.id;
    const isContainer = typeof overId === "string" && overId.includes("::");

    // Determine target container.
    let overContainerId: string;
    if (isContainer) {
      overContainerId = overId as string;
    } else {
      // Dragged over another item — find its container.
      const found = findContainer(overId, questions);
      if (!found) return;
      overContainerId = found;
    }

    // Prevent cross-report-type.
    if (containerReportType(overContainerId) !== draggedReportType) return;

    const activeContainerId = findContainer(active.id, questions);
    // Only handle cross-container moves here; same-container reorder is done at dragEnd.
    if (!activeContainerId || activeContainerId === overContainerId) return;

    const targetCategory = containerCategory(overContainerId);

    // Full move: remove item from old position, set its category, splice at the
    // hovered position — or at the canonical position for an empty container.
    setQuestions((prev) => {
      const activeIdx = prev.findIndex((q) => q.id === active.id);
      if (activeIdx === -1) return prev;

      const item = { ...prev[activeIdx], category: targetCategory };
      const next = [...prev];
      next.splice(activeIdx, 1);

      let insertIdx: number;
      if (!isContainer) {
        // Insert at the hovered item's position in the now-shorter array.
        const overIdx = next.findIndex((q) => q.id === overId);
        insertIdx = overIdx === -1 ? next.length : overIdx;
      } else {
        // Dropped on the container itself (empty group): find the canonical
        // position by locating the first item of a later category in this type.
        const allContainerIds = [
          ...categoryValues.map((cv) => `${draggedReportType}::${cv}`),
          `${draggedReportType}::__uncategorised__`,
        ];
        const targetOrdinal = allContainerIds.indexOf(overContainerId);
        insertIdx = -1;
        for (let i = 0; i < next.length; i++) {
          const q = next[i];
          if (q.report_type !== draggedReportType) continue;
          const qContId = `${q.report_type}::${q.category ?? "__uncategorised__"}`;
          if (allContainerIds.indexOf(qContId) > targetOrdinal) {
            insertIdx = i;
            break;
          }
        }
        if (insertIdx === -1) {
          // No later category — append after the last item of this report type.
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i].report_type === draggedReportType) { insertIdx = i + 1; break; }
          }
          if (insertIdx === -1) insertIdx = next.length;
        }
      }

      next.splice(insertIdx, 0, item);
      return next;
    });
  }

  function handleDragEnd(reportType: ReportType, event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    activeDragReportType.current = null;

    if (!over || active.id === over.id) return;

    const overId = over.id;
    const isContainer = typeof overId === "string" && overId.includes("::");

    // Prevent cross-report-type.
    if (isContainer && containerReportType(overId as string) !== reportType) return;
    if (!isContainer) {
      const overQ = questions.find((q) => q.id === overId);
      if (overQ && overQ.report_type !== reportType) return;
    }

    // Final position adjustment: remove active item and reinsert at the over
    // item's index. Cross-container category was already set in onDragOver.
    // Matches dnd-kit's arrayMove: splice out at activeIdx, splice in at the
    // original overIdx on the now-shorter array.
    let nextQuestions = questions;
    if (!isContainer) {
      const activeIdx = questions.findIndex((q) => q.id === active.id);
      const overIdx = questions.findIndex((q) => q.id === overId);
      if (activeIdx !== -1 && overIdx !== -1 && activeIdx !== overIdx) {
        const item = questions[activeIdx];
        const next = [...questions];
        next.splice(activeIdx, 1);
        next.splice(overIdx, 0, item);
        nextQuestions = next;
      }
    }
    // If isContainer: position was set in onDragOver; nothing more to adjust.

    // Rebuild canonical order for this report type and sync with server.
    const ordered = buildOrderedList(nextQuestions, reportType, categoryValues);

    // Assign fresh sort_orders so state matches the server response.
    const withOrders = nextQuestions.map((q) => {
      if (q.report_type !== reportType) return q;
      const idx = ordered.findIndex((o) => o.id === q.id);
      return { ...q, sort_order: idx + 1 };
    });

    const previousQuestions = questions;
    setQuestions(withOrders);

    const items = ordered.map((q) => ({ id: q.id, category: q.category ?? null }));

    fetch("/api/standard-surveys/reorder", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_type: reportType, items }),
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

  const activeQuestion = activeId != null ? questions.find((q) => q.id === activeId) : null;

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

              // Build per-category slices for this report type.
              const byCategory = new Map<string | null, StandardQuestion[]>();
              for (const q of list) {
                const k = q.category ?? null;
                if (!byCategory.has(k)) byCategory.set(k, []);
                byCategory.get(k)!.push(q);
              }

              // Compute global offsets so numbering is continuous.
              let offset = 0;
              const groups: Array<{ containerId: string; label: string; items: StandardQuestion[]; offset: number }> = [];
              for (const cat of categoryItems) {
                const items = byCategory.get(cat.value) ?? [];
                groups.push({
                  containerId: `${t.value}::${cat.value}`,
                  label: cat.label,
                  items,
                  offset,
                });
                offset += items.length;
              }
              // Uncategorised trailing group.
              const uncatItems = byCategory.get(null) ?? [];
              groups.push({
                containerId: `${t.value}::__uncategorised__`,
                label: "Uncategorised",
                items: uncatItems,
                offset,
              });

              return (
                <section key={t.value} className="rounded-xl border bg-card flex flex-col">
                  <div className="border-b px-5 py-3.5">
                    <h2 className="t-heading-sub">{t.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{blurb}</p>
                  </div>

                  {list.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                      <ListChecks className="size-7 opacity-30" />
                      <p className="text-sm">No standard questions yet.</p>
                    </div>
                  ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDragEnd={(e) => handleDragEnd(t.value, e)}
                  >
                    <div className="flex-1">
                      {groups.map((g) => (
                        <CategoryGroup
                          key={g.containerId}
                          containerId={g.containerId}
                          label={g.label}
                          items={g.items}
                          globalOffset={g.offset}
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
                    </div>

                    <DragOverlay>
                      {activeQuestion ? (
                        <ul className="rounded border bg-card shadow-lg">
                          <QuestionRow
                            q={activeQuestion}
                            index={0}
                            editId={null}
                            editQuestion=""
                            setEditQuestion={() => {}}
                            savingEdit={false}
                            onStartEdit={() => {}}
                            onEditSave={() => {}}
                            onEditCancel={() => {}}
                            onDelete={() => {}}
                          />
                        </ul>
                      ) : null}
                    </DragOverlay>
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
