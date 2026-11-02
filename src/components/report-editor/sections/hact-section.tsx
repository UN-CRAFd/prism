"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { LoadingState } from "@/components/admin/shared";
import { useAutosave, type SaveState } from "@/components/autosave";
import { ItemComments } from "@/components/report-editor/comments-context";
import { HEAD_TEXT } from "@/components/report-editor/matrix-table";
import { optionValues } from "@/lib/options";
import { cn } from "@/lib/utils";

// HACT Recommendations — the assurance findings a tranche release depends on,
// and what the partner has done about each.
//
// One list per project: the admin HACT Recommendations page (by projectId) and
// the HACT page of each of the project's updates (by reportId) show and edit the
// same rows. "No." is the row's position, numbered here from 1.
//
// CRAF'd owns the table: an admin adds and removes rows and edits every column.
// The partner sees the same table but can write only their own column, Partner
// comment (their justification). The API enforces the same split
// (/api/hact-recommendations), so this component's read-only cells are a
// convenience, not the safeguard.

interface HactRow {
  id: number;
  finding: string;
  recommendation: string;
  addressed_by: string;
  partner_comment: string;
  status: string | null;
}

// Status pill colours. An Implemented recommendation is done: its row is greyed
// out and the partner's comment locks (the API enforces the lock too).
const IMPLEMENTED = "Implemented";
const STATUS_STYLES: Record<string, string> = {
  "In Progress": "bg-emerald-50 text-emerald-700 border-emerald-200",
  [IMPLEMENTED]: "bg-zinc-100 text-zinc-500 border-zinc-200",
};
const STATUS_STYLE_FALLBACK = "bg-zinc-50 text-zinc-600 border-zinc-200";

function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center rounded border px-2 py-0.5 text-xs font-semibold", STATUS_STYLES[status] ?? STATUS_STYLE_FALLBACK)}>
      {status}
    </span>
  );
}

type Field = "finding" | "recommendation" | "addressed_by" | "partner_comment" | "status";

export function HactSection({
  projectId,
  reportId,
  isAdmin = false,
  readOnly,
  onSaveStateChange,
}: {
  // Exactly one: projectId on the admin page, reportId inside a project update.
  projectId?: number;
  reportId?: number;
  isAdmin?: boolean;
  readOnly?: boolean;
  onSaveStateChange?: (s: SaveState) => void;
}) {
  const confirm = useConfirm();
  const scope = projectId != null ? { projectId } : { reportId };
  const scopeQuery = projectId != null ? `projectId=${projectId}` : `reportId=${reportId}`;
  const [rows, setRows] = useState<HactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // The one row an admin has unlocked with its edit button; every other row is
  // read-only, so a stray click or keystroke can't change it.
  const [editingId, setEditingId] = useState<number | null>(null);

  // Only the fields actually touched are sent, per row — a partner's save must
  // never carry an admin-only field, which the API would reject.
  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const dirtyRef = useRef<Map<number, Set<Field>>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/hact-recommendations?${scopeQuery}`);
        if (!res.ok) throw new Error("Failed to load HACT recommendations");
        const data: HactRow[] = await res.json();
        if (!cancelled) setRows(data);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scopeQuery]);

  const flush = useCallback(async () => {
    const pending = [...dirtyRef.current.entries()];
    dirtyRef.current = new Map();
    for (let i = 0; i < pending.length; i++) {
      const [id, fields] = pending[i];
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row) continue; // deleted while the save was pending
      // A partner writes from an update; the API checks that it is Open.
      const body: Record<string, unknown> = { id, ...(reportId != null && { reportId }) };
      for (const f of fields) body[f] = row[f];
      const res = await fetch("/api/hact-recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Put the fields back so the next keystroke retries them.
        for (const [rid, rfields] of pending.slice(i)) {
          const again = dirtyRef.current.get(rid) ?? new Set<Field>();
          rfields.forEach((f) => again.add(f));
          dirtyRef.current.set(rid, again);
        }
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save recommendation");
      }
    }
  }, [reportId]);

  const { schedule, flushNow } = useAutosave(flush, { onStateChange: onSaveStateChange });

  // Save anything still pending when the user navigates away.
  useEffect(() => () => { void flushNow(); }, [flushNow]);

  function edit(id: number, field: Field, value: string | null) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    const set = dirtyRef.current.get(id) ?? new Set<Field>();
    set.add(field);
    dirtyRef.current.set(id, set);
    schedule();
  }

  async function addRow() {
    setAdding(true);
    setError(null);
    try {
      const res = await fetch("/api/hact-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scope),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add recommendation");
      setRows((prev) => [...prev, data as HactRow]);
      setEditingId((data as HactRow).id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(row: HactRow, number: number) {
    if (!await confirm({
      title: `Delete recommendation ${number}?`,
      message: "This removes the finding, the recommendation and the partner's comment. It cannot be undone.",
      variant: "destructive",
    })) return;
    dirtyRef.current.delete(row.id);
    const res = await fetch(`/api/hact-recommendations?id=${row.id}`, { method: "DELETE" });
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== row.id));
    else setError("Failed to delete recommendation");
  }

  // Who may write what. Read-only (a closed update) overrides both.
  const canEditAll = isAdmin && !readOnly;
  // An admin edits a row only while it is unlocked (edit mode).
  const canEditRow = (r: HactRow) => canEditAll && editingId === r.id;
  // A partner's comment locks once the recommendation is Implemented; an
  // admin's follows the row's edit mode.
  const canEditComment = (r: HactRow) =>
    isAdmin ? canEditRow(r) : !readOnly && r.status !== IMPLEMENTED;
  const statuses = optionValues("hactStatus");
  // A retired status (e.g. an old "Open") reads as no status.
  const statusOf = (r: HactRow) => (r.status && statuses.includes(r.status) ? r.status : null);

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-muted text-left text-muted-foreground">
                <th className={cn("px-3 py-2 w-20", HEAD_TEXT)}>No.</th>
                <th className={cn("px-3 py-2 min-w-[220px]", HEAD_TEXT)}>Description of finding</th>
                <th className={cn("px-3 py-2 min-w-[220px]", HEAD_TEXT)}>Recommendation</th>
                <th className={cn("px-3 py-2 min-w-[160px]", HEAD_TEXT)}>Should be addressed by</th>
                <th className={cn("px-3 py-2 min-w-[220px] bg-crafd-yellow/15", HEAD_TEXT)}>Partner comment</th>
                <th className={cn("px-3 py-2 w-44", HEAD_TEXT)}>Status</th>
                {canEditAll && <th className="w-20" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEditAll ? 7 : 6} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {isAdmin
                      ? "No recommendations yet. Add the first one below."
                      : "No HACT recommendations have been added to this project."}
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <tr
                    key={r.id}
                    className={cn("border-t align-top", r.status === IMPLEMENTED && "bg-muted/60 text-muted-foreground")}
                  >
                    <td className="px-2 py-2">
                      <span className="block px-1 py-1.5 font-medium">{i + 1}</span>
                    </td>
                    <td className="px-2 py-2">
                      <TextCell
                        value={r.finding}
                        editable={canEditRow(r)}
                        onChange={(v) => edit(r.id, "finding", v)}
                        label="Description of finding"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <TextCell
                        value={r.recommendation}
                        editable={canEditRow(r)}
                        onChange={(v) => edit(r.id, "recommendation", v)}
                        label="Recommendation"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <TextCell
                        value={r.addressed_by}
                        editable={canEditRow(r)}
                        onChange={(v) => edit(r.id, "addressed_by", v)}
                        label="Should be addressed by"
                      />
                    </td>
                    <td className={cn("px-2 py-2", canEditComment(r) && "bg-crafd-yellow/10")}>
                      <div className="flex items-start gap-1">
                        <div className="flex-1">
                          <TextCell
                            value={r.partner_comment}
                            editable={canEditComment(r)}
                            onChange={(v) => edit(r.id, "partner_comment", v)}
                            label="Partner comment"
                            placeholder="Describe the action taken…"
                          />
                        </div>
                        <ItemComments section="hact" itemId={r.id} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {canEditRow(r) ? (
                        <Select
                          value={statusOf(r) ?? "none"}
                          onValueChange={(v) => edit(r.id, "status", v === "none" ? null : v)}
                        >
                          <SelectTrigger className="h-8 w-full text-sm bg-background">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                            {statuses.map((s) => (
                              <SelectItem key={s} value={s}><StatusPill status={s} /></SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="block px-1 py-1.5">{statusOf(r) ? <StatusPill status={statusOf(r)!} /> : "—"}</span>
                      )}
                    </td>
                    {canEditAll && (
                      <td className="px-1 py-2 whitespace-nowrap">
                        {editingId === r.id ? (
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded p-1.5 text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Done editing"
                          >
                            <Check className="size-3.5" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingId(r.id)}
                            className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title="Edit recommendation"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteRow(r, i + 1)}
                          className="rounded p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                          title="Delete recommendation"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEditAll && !loading && (
        <Button size="sm" variant="outline" onClick={addRow} disabled={adding}>
          <Plus className="size-3.5" /> Add recommendation
        </Button>
      )}
    </div>
  );
}

// A long-text cell: a textarea when editable, wrapped plain text otherwise.
function TextCell({
  value,
  editable,
  onChange,
  label,
  placeholder,
}: {
  value: string;
  editable: boolean;
  onChange: (v: string) => void;
  label: string;
  placeholder?: string;
}) {
  if (!editable) {
    return (
      <p className="px-1 py-1.5 whitespace-pre-wrap">
        {value || <span className="text-muted-foreground/50">—</span>}
      </p>
    );
  }
  return (
    <Textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="text-sm min-h-[64px] resize-y"
      aria-label={label}
      placeholder={placeholder}
    />
  );
}
