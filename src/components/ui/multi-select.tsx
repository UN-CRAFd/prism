"use client";

import { ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { optionItems } from "@/lib/options";

// A compact multi-select backed by a string[] value. Options come from the
// admin-editable dropdown registry (@/lib/options) via `optionKey`, so the choices
// stay in sync with Settings. Selected values render as removable chips in the
// trigger; the dropdown lists every option with a checkbox. Values not present in
// the current option list (e.g. legacy free-text entries) are still shown as chips
// so nothing is silently dropped.
export function MultiSelect({
  optionKey,
  value,
  onChange,
  placeholder = "Select…",
  className,
  disabled,
}: {
  optionKey: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const items = optionItems(optionKey);
  // Preserve any selected value that is no longer (or never was) in the option
  // list, so legacy data remains visible and editable.
  const extraSelected = value.filter((v) => !items.some((it) => it.value === v));

  function toggle(v: string) {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  }
  function remove(v: string) {
    onChange(value.filter((x) => x !== v));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        className={cn(
          "flex min-h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 py-1 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <div className="flex flex-1 flex-wrap items-center gap-1">
          {value.length === 0 ? (
            <span className="text-muted-foreground px-1">{placeholder}</span>
          ) : (
            value.map((v) => {
              const label = items.find((it) => it.value === v)?.label ?? v;
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  {label}
                  <span
                    role="button"
                    tabIndex={-1}
                    aria-label={`Remove ${label}`}
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); remove(v); }}
                    onPointerDown={(e) => e.stopPropagation()}
                    className="hover:text-foreground"
                  >
                    <X className="size-3" />
                  </span>
                </span>
              );
            })
          )}
        </div>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-72 w-[--radix-dropdown-menu-trigger-width] min-w-56 overflow-y-auto"
      >
        {items.map((it) => (
          <DropdownMenuCheckboxItem
            key={it.value}
            checked={value.includes(it.value)}
            // Keep the menu open across multiple toggles.
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(it.value)}
          >
            {it.label}
          </DropdownMenuCheckboxItem>
        ))}
        {extraSelected.map((v) => (
          <DropdownMenuCheckboxItem
            key={v}
            checked
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => toggle(v)}
            className="italic text-muted-foreground"
          >
            {v}
          </DropdownMenuCheckboxItem>
        ))}
        {items.length === 0 && extraSelected.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground">No options defined.</div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
