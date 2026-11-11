"use client";

import * as React from "react";
import { ChevronsUpDown, Plus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { optionItems, type OptionItem } from "@/lib/options";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useReadOnly } from "@/components/ui/read-only-context";

// Admin-only Investment Theme picker. Like SearchableSelect, but typing a name
// that doesn't exist offers "Add …", which saves it as a new theme for ALL
// projects; each theme row has a small delete icon that removes it from the
// shared list (projects already using it keep their stored value).

export function InvestmentThemeSelect({
  value,
  onChange,
  placeholder = "Select a theme…",
  disabled,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const readOnly = useReadOnly();
  const isDisabled = disabled || readOnly;
  const confirm = useConfirm();

  // Local copy of the shared list, refreshed from the API after each add/delete
  // (the global options registry only updates on the next page load).
  const [items, setItems] = React.useState<OptionItem[]>(() => optionItems("investmentTheme"));
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const trimmed = filter.trim().replace(/\s+/g, " ");
  const filtered = trimmed
    ? items.filter((it) => it.label.toLowerCase().includes(trimmed.toLowerCase()))
    : items;
  const showAddRow = trimmed.length > 0 && !items.some((it) => it.value.toLowerCase() === trimmed.toLowerCase());

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setFilter("");
      setError(null);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function addTheme() {
    if (!trimmed || busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/admin/settings/investment-themes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to add theme");
      setItems(data.items);
      onChange(data.value);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add theme");
    } finally { setBusy(false); }
  }

  async function deleteTheme(it: OptionItem) {
    // Close the menu first so the confirm dialog can take focus.
    setOpen(false);
    const ok = await confirm({
      message: `Delete the theme "${it.label}"? It will no longer be available for any project. Projects that already use it keep their value.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/admin/settings/investment-themes?value=${encodeURIComponent(it.value)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || "Failed to delete theme"); return; }
    setItems(data.items);
  }

  const known = items.some((it) => it.value === value);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <DropdownMenu open={open} onOpenChange={handleOpenChange}>
          <DropdownMenuTrigger
            disabled={isDisabled}
            className={cn(
              "flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
              className
            )}
          >
            <span className={cn("flex-1 min-w-0 truncate text-left", !value && "text-muted-foreground")}>
              {value ? value + (known ? "" : " (deleted)") : placeholder}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[--radix-dropdown-menu-trigger-width] min-w-56 p-0">
            <div className="border-b p-1">
              <input
                ref={inputRef}
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && showAddRow) { e.preventDefault(); addTheme(); }
                }}
                maxLength={100}
                placeholder="Search or type a new theme…"
                className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="max-h-[260px] overflow-y-auto p-1">
              {filtered.map((it) => (
                <div key={it.value} className="group flex items-center">
                  <DropdownMenuItem className="flex-1 min-w-0" onSelect={() => onChange(it.value)}>
                    <span className="truncate">{it.label}</span>
                  </DropdownMenuItem>
                  <button
                    type="button"
                    onClick={() => deleteTheme(it)}
                    className="shrink-0 rounded-sm p-1.5 text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10"
                    aria-label={`Delete theme ${it.label}`}
                    title="Delete theme"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
              {showAddRow && (
                <DropdownMenuItem onSelect={(e) => { e.preventDefault(); addTheme(); }} disabled={busy}>
                  <Plus className="size-3.5" />
                  Add <span className="font-medium">&ldquo;{trimmed}&rdquo;</span> as a new theme
                </DropdownMenuItem>
              )}
              {filtered.length === 0 && !showAddRow && (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">No themes</div>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {value && !isDisabled && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="shrink-0 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Clear theme"
            title="Clear"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
