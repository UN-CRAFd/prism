"use client";

import { useMemo, useRef, useState } from "react";
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
export function Combobox({
  items,
  placeholder,
  onSelect,
  onCreate,
  createLabel = "Create new",
  disabled,
  busy,
}: {
  items: ComboboxItem[];
  placeholder?: string;
  onSelect: (item: ComboboxItem) => void;
  onCreate?: (name: string) => void;
  createLabel?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items),
    [items, q]
  );
  const exactMatch = items.some((it) => it.label.toLowerCase() === q);
  const canCreate = Boolean(onCreate) && q.length > 0 && !exactMatch;

  function choose(item: ComboboxItem) {
    onSelect(item);
    setQuery("");
    setOpen(false);
  }

  function create() {
    if (!canCreate || !onCreate) return;
    onCreate(query.trim());
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
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

      {open && (filtered.length > 0 || canCreate) && (
        <div
          className="absolute z-50 mt-1 w-full max-h-72 overflow-auto rounded-md border bg-popover shadow-md"
          onMouseDown={() => { if (blurTimer.current) clearTimeout(blurTimer.current); }}
        >
          {filtered.map((it) => (
            <button
              key={it.id}
              type="button"
              onClick={() => choose(it)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
            >
              <span className="flex-1">{it.label}</span>
              {it.hint && <span className="shrink-0 text-xs text-muted-foreground">{it.hint}</span>}
            </button>
          ))}
          {canCreate && (
            <button
              type="button"
              onClick={create}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent transition-colors",
                filtered.length > 0 && "border-t"
              )}
            >
              <Plus className="size-3.5 text-muted-foreground" />
              <span>{createLabel}: <span className="font-medium">&ldquo;{query.trim()}&rdquo;</span></span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
