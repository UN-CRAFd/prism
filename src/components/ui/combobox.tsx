"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface ComboboxItem {
  id: number;
  label: string;
  hint?: string;
}

// A lightweight typeahead: filters `items` by the typed query, lets the user pick
// an existing one, or — when `onCreate` is provided — create a new entry from the
// typed text. Used for the report-editor indicator picker.
//
// The dropdown portals to document.body with fixed positioning so it is never
// clipped by ancestor overflow:hidden containers (e.g. table wrappers).
//
// Uncontrolled (default): internal query state; input clears after selection.
// Controlled: pass `value` + `onChange`; the input always shows the current value,
// typing updates it immediately, and selecting from the dropdown calls onChange too.
export function Combobox({
  items,
  placeholder,
  onSelect,
  onCreate,
  createLabel = "Create new",
  disabled,
  busy,
  className,
  value,
  onChange,
  onBlur,
}: {
  items: ComboboxItem[];
  placeholder?: string;
  onSelect?: (item: ComboboxItem) => void;
  onCreate?: (name: string) => void;
  createLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  // Applied to the outer wrapper div (useful for flex-1, sizing, etc.).
  className?: string;
  // Controlled free-text mode. When provided, the input shows `value` at all
  // times; typing calls onChange; selecting from the dropdown also calls
  // onChange(item.label). The input does NOT clear after selection.
  value?: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);

  const controlled = value !== undefined;
  const inputValue = controlled ? value : query;

  function setInputValue(v: string) {
    if (controlled) onChange?.(v);
    else setQuery(v);
  }

  const q = inputValue.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items),
    [items, q]
  );
  const exactMatch = items.some((it) => it.label.toLowerCase() === q);
  const canCreate = Boolean(onCreate) && q.length > 0 && !exactMatch;

  // Compute fixed dropdown position from the trigger wrapper's bounding rect.
  // Opens below by default. When there isn't enough space below, flips above and
  // anchors the panel's BOTTOM edge to the input's TOP edge (using CSS `bottom`
  // instead of `top`) so the panel is always flush regardless of its actual height.
  const reposition = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const maxPanelH = 288; // matches max-h-72
    const spaceBelow = window.innerHeight - r.bottom;
    if (spaceBelow >= maxPanelH + gap) {
      // Anchor panel top to input bottom.
      setPos({ top: r.bottom + gap, left: r.left, width: r.width });
    } else {
      // Anchor panel bottom to input top. `bottom` is distance from viewport bottom.
      setPos({ bottom: window.innerHeight - r.top + gap, left: r.left, width: r.width });
    }
  }, []);

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    reposition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  function choose(item: ComboboxItem) {
    onSelect?.(item);
    if (controlled) {
      onChange?.(item.label);
    } else {
      setQuery("");
    }
    setOpen(false);
  }

  function create() {
    if (!canCreate || !onCreate) return;
    onCreate(inputValue.trim());
    if (!controlled) setQuery("");
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={inputValue}
          onChange={(e) => { setInputValue(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
            onBlur?.();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              if (filtered.length === 1) choose(filtered[0]);
              else if (canCreate) create();
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-8 pr-8 text-sm"
        />
        {busy && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 animate-spin text-muted-foreground" />}
      </div>

      {open && (filtered.length > 0 || canCreate) && typeof document !== "undefined" && createPortal(
        <div
          className="fixed z-50 max-h-72 overflow-auto rounded-md border bg-popover shadow-md"
          style={pos
            ? { top: pos.top, bottom: pos.bottom, left: pos.left, width: pos.width }
            : { top: -9999, left: -9999, visibility: "hidden" }}
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
        >
          {filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); choose(it); }}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
            >
              <span className="flex-1">{it.label}</span>
              {it.hint && <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span>}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onMouseDown={(e) => { e.preventDefault(); create(); }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                filtered.length > 0 && "border-t"
              )}
            >
              <Plus className="size-3.5 text-muted-foreground" />
              <span>{createLabel}: <span className="font-medium">&ldquo;{inputValue.trim()}&rdquo;</span></span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
