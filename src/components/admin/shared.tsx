"use client";

import { useState, useEffect } from "react";
import { Loader2, LayoutList, LayoutGrid, Check, X, Pencil, Trash2, Search, Info, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Archive, CircleCheck, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { TableHead } from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";

// ── Page header ─────────────────────────────────────────────────────────────

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="on-dark bg-neutral-950 text-white px-8 min-h-32 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 shrink-0">
      <div className="min-w-0">
        <h1 className="t-title-banner truncate">{title}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}

// ── Primitive helpers ──────────────────────────────────────────────────────

export function Dash() {
  return <span className="text-xs text-muted-foreground/50">—</span>;
}

export function Field({
  label,
  children,
  required,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">
        {label}
        {required && " *"}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground hover:text-foreground" aria-label={hint}>
                <Info className="size-3" />
              </button>
            </TooltipTrigger>
            <TooltipContent>{hint}</TooltipContent>
          </Tooltip>
        )}
      </Label>
      {children}
    </div>
  );
}

// ── View toggle ────────────────────────────────────────────────────────────

export function ViewToggle({
  view,
  onChange,
}: {
  view: "list" | "grid";
  onChange: (v: "list" | "grid") => void;
}) {
  return (
    <div className="flex items-center rounded-md border overflow-hidden">
      <button
        onClick={() => onChange("list")}
        className={cn(
          "px-2.5 py-1.5 transition-colors",
          view === "list"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50"
        )}
      >
        <LayoutList className="size-3.5" />
      </button>
      <button
        onClick={() => onChange("grid")}
        className={cn(
          "px-2.5 py-1.5 border-l transition-colors",
          view === "grid"
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:bg-muted/50"
        )}
      >
        <LayoutGrid className="size-3.5" />
      </button>
    </div>
  );
}

// ── Filter / group bar ──────────────────────────────────────────────────────
// A unified sub-header bar that sits directly below the PageHeader. Compose it
// from SearchInput / FilterSelect. The `ALL` sentinel is the "no filter" value
// (shadcn Select forbids empty-string item values).

export const ALL = "__all__";

export function FilterBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b px-8 py-2.5 shrink-0">
      {children}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative w-full max-w-sm", className)}>
      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}

export function FilterSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  width = 150,
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  width?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs" style={{ width }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Multi-value variant of FilterSelect: a checkbox dropdown. An empty selection
// means "no filter". With `match`/`onMatchChange` the menu also offers
// "Any selected" (OR) vs "All selected" (AND) for rows carrying several values.
export type MatchMode = "any" | "all";

export function FilterMultiSelect({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  width = 150,
  match,
  onMatchChange,
}: {
  icon?: LucideIcon;
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  /** `short` is shown in the trigger when it is selected (e.g. "BR"). */
  options: { value: string; label: string; short?: string }[];
  allLabel?: string;
  width?: number;
  match?: MatchMode;
  onMatchChange?: (m: MatchMode) => void;
}) {
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  // Trigger text follows the option order, not the click order.
  const selected = options.filter((o) => value.includes(o.value));
  const joiner = match === "all" ? " + " : ", ";
  const text = selected.length === 0 ? allLabel : selected.map((o) => o.short ?? o.label).join(joiner);
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="size-3.5 text-muted-foreground shrink-0" />}
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="flex h-8 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-xs whitespace-nowrap shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          style={{ width }}
          title={selected.length ? selected.map((o) => o.label).join(joiner) : undefined}
        >
          <span className="min-w-0 truncate">{text}</span>
          <ChevronDown className="size-4 shrink-0 opacity-50" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-56">
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={value.includes(o.value)}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => toggle(o.value)}
              className="text-xs"
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
          {match && onMatchChange && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Show updates with</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={match} onValueChange={(m) => onMatchChange(m as MatchMode)}>
                <DropdownMenuRadioItem value="any" onSelect={(e) => e.preventDefault()} className="text-xs">
                  Any of the selected
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="all" onSelect={(e) => e.preventDefault()} className="text-xs">
                  All of the selected
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </>
          )}
          {value.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onChange([])} className="text-xs">
                <X className="size-3" /> Clear selection
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── Sort control ─────────────────────────────────────────────────────────────
// A "Sort by <field>" dropdown paired with an asc/desc direction toggle. Sits in
// the FilterBar alongside SearchInput / FilterSelect. Generic over the field key
// so each page defines its own sortable columns.

export type SortDir = "asc" | "desc";

export function SortSelect<T extends string>({
  value,
  dir,
  onChange,
  onDirChange,
  options,
  width = 160,
}: {
  value: T;
  dir: SortDir;
  onChange: (v: T) => void;
  onDirChange: (d: SortDir) => void;
  options: { value: T; label: string }[];
  width?: number;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <ArrowUpDown className="size-3.5 text-muted-foreground shrink-0" />
      <span className="text-xs text-muted-foreground whitespace-nowrap">Sort by</span>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-8 text-xs" style={{ width }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={() => onDirChange(dir === "asc" ? "desc" : "asc")}
        className="flex h-8 w-8 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        title={dir === "asc" ? "Ascending — click for descending" : "Descending — click for ascending"}
        aria-label={dir === "asc" ? "Sort ascending" : "Sort descending"}
      >
        {dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
      </button>
    </div>
  );
}

// "12 of 30 projects" at the right end of a FilterBar, with a reset link when
// any filter is active (pass `onClear` only then).
// ── Archived / Active ────────────────────────────────────────────────────────
// Projects can be archived (Projects page only); their reports and updates are
// archived with them. Archived rows stay intact, just hidden by default.
// `ArchiveFilter` goes in each overview's FilterBar (default "active");
// `ArchiveSelect` sits in a Projects table row, changed inline like the status.

export type ArchiveView = "active" | "archived" | typeof ALL;

export function matchesArchive(archived: boolean | undefined, view: ArchiveView): boolean {
  if (view === ALL) return true;
  return view === "archived" ? !!archived : !archived;
}

export function ArchiveFilter({ value, onChange }: { value: ArchiveView; onChange: (v: ArchiveView) => void }) {
  return (
    <FilterSelect
      icon={Archive}
      label="Show"
      value={value}
      onChange={(v) => onChange(v as ArchiveView)}
      allLabel="All"
      width={110}
      options={[{ value: "active", label: "Active" }, { value: "archived", label: "Archived" }]}
    />
  );
}

// Controlled by `archived`: the caller runs its confirmation flow in `onChange`
// and only updates `archived` once the change has gone through, so a cancelled
// or refused change leaves the select as it was.
export function ArchiveSelect({
  archived,
  onChange,
}: {
  archived: boolean;
  onChange: (archived: boolean) => void;
}) {
  return (
    <Select
      value={archived ? "archived" : "active"}
      onValueChange={(v) => { if ((v === "archived") !== archived) onChange(v === "archived"); }}
    >
      <SelectTrigger
        title="Archived projects (and their reports and updates) are hidden unless Show is set to Archived or All"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "!h-7 w-fit shrink-0 px-2 text-xs font-semibold border rounded [&>svg]:size-3 [&>svg]:shrink-0",
          archived
            ? "border-crafd-grey-200 bg-crafd-grey-100 text-crafd-grey-800"
            : "border-transparent bg-transparent text-muted-foreground shadow-none"
        )}
      >
        <span className="flex items-center gap-1.5 min-w-0 whitespace-nowrap">
          {archived ? <Archive className="size-3 shrink-0" /> : <CircleCheck className="size-3 shrink-0" />}
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="active">Active</SelectItem>
        <SelectItem value="archived">Archived</SelectItem>
      </SelectContent>
    </Select>
  );
}

export function ResultCount({
  shown,
  total,
  noun,
  onClear,
}: {
  shown: number;
  total: number;
  noun: string;
  onClear?: () => void;
}) {
  const plural = (n: number) => `${noun}${n === 1 ? "" : "s"}`;
  return (
    <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground whitespace-nowrap">
      {onClear && (
        <button type="button" onClick={onClear} className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
          <X className="size-3" /> Clear filters
        </button>
      )}
      <span className="tabular-nums">
        {shown === total ? `${total} ${plural(total)}` : `${shown} of ${total} ${plural(total)}`}
      </span>
    </div>
  );
}

// Click-to-sort table headers. `useTableSort` holds the active column and
// direction; clicking the active column flips the direction, clicking another
// column sorts it ascending. Pair with `sortBy` to order the rows.
export function useTableSort<K extends string>(initialKey: K, initialDir: SortDir = "asc") {
  const [sort, setSort] = useState<{ key: K; dir: SortDir }>({ key: initialKey, dir: initialDir });
  const toggle = (key: K) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  return { sortKey: sort.key, sortDir: sort.dir, toggle };
}

export function SortableHead<K extends string>({
  label,
  column,
  sortKey,
  sortDir,
  onSort,
  className,
  align = "left",
}: {
  label: string;
  column: K;
  sortKey: K;
  sortDir: SortDir;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right";
}) {
  const active = sortKey === column;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "group/sort inline-flex items-center gap-1 hover:text-foreground transition-colors",
          align === "right" && "w-full justify-end",
          active && "text-foreground"
        )}
        title={`Sort by ${label.toLowerCase()}`}
      >
        {label}
        <Icon className={cn("size-3 shrink-0", active ? "opacity-100" : "opacity-30 group-hover/sort:opacity-70")} />
      </button>
    </TableHead>
  );
}

// Comparator that sorts by a chosen key with a direction, keeping nulls/blanks
// last regardless of direction, and comparing strings case-insensitively and
// numbers numerically. Returns a fresh sorted array (does not mutate).
export function sortBy<T>(
  rows: T[],
  key: (row: T) => string | number | null | undefined,
  dir: SortDir
): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = key(a);
    const bv = key(b);
    // Empty/null values always sink to the bottom, regardless of direction.
    const aEmpty = av == null || av === "";
    const bEmpty = bv == null || bv === "";
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * factor;
  });
}

// ── Feedback states ────────────────────────────────────────────────────────

export function LoadingState({ className }: { className?: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 300);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={cn("flex items-center justify-center py-20 text-muted-foreground gap-2", className, !visible && "invisible")}>
      <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      {message}
    </div>
  );
}

// ── Form shell ─────────────────────────────────────────────────────────────

export function FormShell({
  title,
  onClose,
  error,
  saving,
  editMode,
  onCancel,
  onSubmit,
  submitDisabled = false,
  children,
}: {
  title: string;
  onClose: () => void;
  error: string | null;
  saving: boolean;
  editMode: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  /** Extra reason to disable the submit button (e.g. required fields empty). */
  submitDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-6 rounded-lg border bg-muted/30 p-4 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <Button variant="ghost" size="icon" className="size-7" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {children}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={saving || submitDisabled}>
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {editMode ? "Update" : "Create"}
        </Button>
      </div>
    </div>
  );
}

// ── Row action buttons ─────────────────────────────────────────────────────

export function RowActions({
  onEdit,
  onDelete,
  deleteTitle = "Delete",
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle?: string;
}) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="size-7" onClick={onEdit}>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
        </svg>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-7 text-muted-foreground hover:text-destructive"
        title={deleteTitle}
        onClick={onDelete}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
          <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
        </svg>
      </Button>
    </div>
  );
}

// ── Hover actions (grid cards) ──────────────────────────────────────────────

export function HoverActions({
  onEdit,
  onDelete,
  deleteTitle = "Delete",
}: {
  onEdit: () => void;
  onDelete: () => void;
  deleteTitle?: string;
}) {
  return (
    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="p-1.5 hover:bg-accent rounded transition-colors"
        title="Edit"
      >
        <Pencil className="size-4 text-muted-foreground" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="p-1.5 hover:bg-destructive/10 rounded transition-colors"
        title={deleteTitle}
      >
        <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

