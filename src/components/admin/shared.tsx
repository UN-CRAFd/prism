"use client";

import { Loader2, LayoutList, LayoutGrid, Check, X, Pencil, Trash2, Search, Info, ArrowUpDown, ArrowUp, ArrowDown, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
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
    <div className="border-b px-8 min-h-32 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 shrink-0">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold font-qanelas truncate">{title}</h1>
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

export function LoadingState() {
  return (
    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
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
  children,
}: {
  title: string;
  onClose: () => void;
  error: string | null;
  saving: boolean;
  editMode: boolean;
  onCancel: () => void;
  onSubmit: () => void;
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
        <Button size="sm" onClick={onSubmit} disabled={saving}>
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
}: {
  onEdit: () => void;
  onDelete: () => void;
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
}: {
  onEdit: () => void;
  onDelete: () => void;
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
        title="Delete"
      >
        <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
      </button>
    </div>
  );
}

