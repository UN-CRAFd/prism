"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { readXlsx, type SheetText } from "@/lib/xlsx-text";

// ─────────────────────────────────────────────────────────────────────────────
// Spreadsheet preview for the Report Import review: shows one sheet of the
// uploaded workbook as a table. Rows an item was extracted from are yellow; the
// item being reviewed is orange. Clicking a marked row selects its item.
// The workbook is read in the browser with the same reader the server uses.
// ─────────────────────────────────────────────────────────────────────────────

export interface SheetHighlight {
  id: string;
  /** Excel row number (1-based). */
  row: number | null;
  /** Sheet the row is on; null = the preferred (first shown) sheet. */
  sheet?: string | null;
}

export function SheetPreview({
  file,
  preferredSheet,
  highlights,
  activeId,
  onSelect,
  className,
}: {
  file: File;
  /** Sheet to open first (e.g. the one the extraction read). */
  preferredSheet?: string | null;
  highlights: SheetHighlight[];
  activeId: string | null;
  onSelect?: (id: string) => void;
  className?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sheets, setSheets] = useState<SheetText[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    file
      .arrayBuffer()
      .then((buf) => {
        if (cancelled) return;
        const visible = readXlsx(new Uint8Array(buf)).filter((s) => !s.hidden && s.rows > 0);
        setSheets(visible);
        const preferred =
          visible.find((s) => preferredSheet && preferredSheet.split(", ").includes(s.name)) ??
          visible.find((s) => /indicator/i.test(s.name)) ??
          visible[0];
        setSheetName(preferred?.name ?? null);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "The workbook could not be read."));
    return () => {
      cancelled = true;
      setSheets(null);
      setError(null);
    };
  }, [file, preferredSheet]);

  const sheet = sheets?.find((s) => s.name === sheetName) ?? null;

  // Columns that hold any value, in order.
  const columns = useMemo(() => {
    if (!sheet) return [];
    const set = new Set<string>();
    for (const r of sheet.grid) for (const c of r.cells) set.add(c.col);
    return [...set].sort((a, b) => a.length - b.length || a.localeCompare(b));
  }, [sheet]);

  // Highlights of the sheet on screen (rows are numbered per sheet).
  const defaultSheet = preferredSheet?.split(", ")[0] ?? null;
  const onSheet = (h: SheetHighlight) => (h.sheet ?? defaultSheet) === sheetName || (!h.sheet && !defaultSheet);
  const rowToId = useMemo(() => {
    const m = new Map<number, string>();
    for (const h of highlights) if (h.row && onSheet(h) && !m.has(h.row)) m.set(h.row, h.id);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, sheetName, defaultSheet]);
  const active = highlights.find((h) => h.id === activeId) ?? null;
  const activeRow = active && onSheet(active) ? active.row : null;

  // Selecting an item on another sheet switches to that sheet (adjusted during
  // render when the selected item's sheet changes; the tabs still work after).
  const activeSheet = active?.sheet ?? null;
  const [lastActiveSheet, setLastActiveSheet] = useState<string | null>(null);
  if (activeSheet !== lastActiveSheet && sheets) {
    setLastActiveSheet(activeSheet);
    if (activeSheet && activeSheet !== sheetName && sheets.some((s) => s.name === activeSheet)) setSheetName(activeSheet);
  }

  // Bring the active row into view (only this panel scrolls).
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !activeRow) return;
    const tr = scroller.querySelector<HTMLElement>(`[data-row="${activeRow}"]`);
    if (!tr) return;
    const t = tr.getBoundingClientRect();
    const s = scroller.getBoundingClientRect();
    if (t.top < s.top + 40 || t.bottom > s.bottom) {
      scroller.scrollBy({ top: t.top - s.top - s.height / 3, behavior: "smooth" });
    }
  }, [activeRow, sheetName]);

  return (
    <div className={cn("flex flex-col rounded-xl border bg-white overflow-hidden", className)}>
      {sheets && sheets.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b bg-neutral-50 px-2 py-1">
          {sheets.map((s) => (
            <button
              key={s.name}
              onClick={() => setSheetName(s.name)}
              className={cn(
                "shrink-0 rounded-md px-2.5 py-1 text-xs",
                s.name === sheetName ? "bg-white font-medium shadow-sm ring-1 ring-black/10" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-auto">
        {error && <p className="p-6 text-center text-sm text-destructive">{error}</p>}
        {!sheets && !error && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Reading workbook…
          </div>
        )}
        {sheet && (
          <table className="border-collapse text-[11px] leading-snug">
            <thead className="sticky top-0 z-10 bg-neutral-100">
              <tr>
                <th className="sticky left-0 z-20 border bg-neutral-100 px-1.5 py-1 font-medium text-muted-foreground" />
                {columns.map((c) => (
                  <th key={c} className="border px-1.5 py-1 font-medium text-muted-foreground">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.grid.map((r) => {
                const id = rowToId.get(r.num);
                const active = !!id && r.num === activeRow;
                const byCol = new Map(r.cells.map((c) => [c.col, c.value]));
                return (
                  <tr
                    key={r.num}
                    data-row={r.num}
                    onClick={() => id && onSelect?.(id)}
                    className={cn(
                      id && "cursor-pointer",
                      active ? "bg-[rgb(255_140_0/0.35)]" : id ? "bg-[rgb(255_214_0/0.3)] hover:bg-[rgb(255_180_0/0.45)]" : ""
                    )}
                  >
                    <td className="sticky left-0 border bg-neutral-50 px-1.5 py-1 text-right text-muted-foreground tabular-nums">{r.num}</td>
                    {columns.map((c) => {
                      const v = byCol.get(c) ?? "";
                      return (
                        <td key={c} title={v.length > 80 ? v : undefined} className="border px-1.5 py-1 align-top">
                          <div className="max-w-[14rem] line-clamp-3 whitespace-pre-wrap [overflow-wrap:anywhere]">{v}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
