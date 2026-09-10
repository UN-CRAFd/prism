"use client";

import * as React from "react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { optionItems } from "@/lib/options";
import { useReadOnly } from "@/components/ui/read-only-context";

export function SearchableSelect({
  optionKey,
  value,
  onChange,
  placeholder = "Select…",
  exclude,
  disabled,
  className,
}: {
  optionKey: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  exclude?: readonly string[];
  disabled?: boolean;
  className?: string;
}) {
  const readOnly = useReadOnly();
  const isDisabled = disabled || readOnly;

  const allItems = optionItems(optionKey);
  const items = exclude
    ? allItems.filter((it) => !exclude.includes(it.value))
    : allItems;

  const selectedLabel = allItems.find((it) => it.value === value)?.label ?? value;

  const [filter, setFilter] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = filter
    ? items.filter((it) => it.label.toLowerCase().includes(filter.toLowerCase()))
    : items;

  function handleOpenChange(open: boolean) {
    if (open) {
      setFilter("");
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        disabled={isDisabled}
        className={cn(
          "flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("flex-1 min-w-0 truncate text-left", !value && "text-muted-foreground")}>
          {value ? selectedLabel : placeholder}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 p-0"
      >
        <div className="border-b p-1">
          <input
            ref={inputRef}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search…"
            className="w-full rounded-sm bg-transparent px-2 py-1 text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-[260px] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <div className="px-2 py-1.5 text-xs text-muted-foreground">No matches</div>
          ) : (
            filtered.map((it) => (
              <DropdownMenuItem key={it.value} onSelect={() => onChange(it.value)}>
                {it.label}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
