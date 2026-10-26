"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
// CRAF'd owns the table: an admin adds and removes rows and edits every column.
// The partner sees the same table but can write only their own column, Partner
// comment. The API enforces the same split (/api/hact-recommendations), so this
// component's read-only cells are a convenience, not the safeguard.

interface HactRow {
  id: number;
  number: string;
  finding: string;
  recommendation: string;
  partner_comment: string;
  status: string | null;
}

type Field = "number" | "finding" | "recommendation" | "partner_comment" | "status";

export function HactSection({
  reportId,
  isAdmin = false,
  readOnly,
  onSaveStateChange,
}: {
  reportId: number;
  isAdmin?: boolean;
  readOnly?: boolean;
  onSaveStateChange?: (s: SaveState) => void;
}) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<HactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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
        const res = await fetch(`/api/hact-recommendations?reportId=${reportId}`);
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
  }, [reportId]);

  const flush = useCallback(async () => {
    const pending = [...dirtyRef.current.entries()];
    dirtyRef.current = new Map();
    for (const [id, fields] of pending) {
      const row = rowsRef.current.find((r) => r.id === id);
      if (!row) continue; // deleted while the save was pending
      const body: Record<string, unknown> = { id };
      for (const f of fields) body[f] = row[f];
      const res = await fetch("/api/hact-recommendations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        // Put the fields back so the next keystroke retries them.
        const again = dirtyRef.current.get(id) ?? new Set<Field>();
        fields.forEach((f) => again.add(f));
        dirtyRef.current.set(id, again);
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save recommendation");
      }
    }
  }, []);

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
        body: JSON.stringify({ reportId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add recommendation");
      setRows((prev) => [...prev, data as HactRow]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setAdding(false);
    }
  }

  async function deleteRow(row: HactRow) {
    if (!await confirm({
      title: `Delete recommendation ${row.number || ""}?`.replace(" ?", "?"),
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
  const canEditComment = !readOnly;
  const statuses = optionValues("hactStatus");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="t-heading-section">HACT Recommendations</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdmin
            ? "Add one row per finding. The partner can respond in the Partner comment column only."
            : "The findings and recommendations from CRAF'd's assurance activities. Respond to each one in the Partner comment column."}
        </p>
      </div>

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
                <th className={cn("px-3 py-2 min-w-[220px] bg-crafd-yellow/15", HEAD_TEXT)}>Partner comment</th>
                <th className={cn("px-3 py-2 w-44", HEAD_TEXT)}>Status</th>
                {canEditAll && <th className="w-10" />}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={canEditAll ? 6 : 5} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    {isAdmin
                      ? "No recommendations yet. Add the first one below."
                      : "No HACT recommendations have been added to this update."}
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.id} className="border-t align-top">
                    <td className="px-2 py-2">
                      {canEditAll ? (
                        <Input
                          value={r.number}
                          onChange={(e) => edit(r.id, "number", e.target.value)}
                          className="h-8 text-sm"
                          aria-label="Number"
                        />
                      ) : (
                        <span className="block px-1 py-1.5 font-medium">{r.number || "—"}</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <TextCell
                        value={r.finding}
                        editable={canEditAll}
                        onChange={(v) => edit(r.id, "finding", v)}
                        label="Description of finding"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <TextCell
                        value={r.recommendation}
                        editable={canEditAll}
                        onChange={(v) => edit(r.id, "recommendation", v)}
                        label="Recommendation"
                      />
                    </td>
                    <td className={cn("px-2 py-2", canEditComment && "bg-crafd-yellow/10")}>
                      <div className="flex items-start gap-1">
                        <div className="flex-1">
                          <TextCell
                            value={r.partner_comment}
                            editable={canEditComment}
                            onChange={(v) => edit(r.id, "partner_comment", v)}
                            label="Partner comment"
                            placeholder="Describe the action taken…"
                          />
                        </div>
                        <ItemComments section="hact" itemId={r.id} />
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      {canEditAll ? (
                        <Select
                          value={r.status ?? "none"}
                          onValueChange={(v) => edit(r.id, "status", v === "none" ? null : v)}
                        >
                          <SelectTrigger className="h-8 w-full text-sm">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
                            {statuses.map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <span className="block px-1 py-1.5">{r.status || "—"}</span>
                      )}
                    </td>
                    {canEditAll && (
                      <td className="px-1 py-2">
                        <button
                          type="button"
                          onClick={() => deleteRow(r)}
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
