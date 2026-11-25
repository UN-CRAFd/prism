"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Small building blocks shared by the Report Import review sections
// (src/app/admin/report-import/page.tsx and report-import-quant.tsx).

export const INPUT = "h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm";

export function PageTag({ page }: { page: number | null }) {
  if (!page) return null;
  return <span className="text-[11px] text-muted-foreground whitespace-nowrap">p. {page}</span>;
}

export function RowTag({ row }: { row: number | null | undefined }) {
  if (!row) return null;
  return <span className="text-[11px] text-muted-foreground whitespace-nowrap">row {row}</span>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

// One reviewable item. Clicking or editing it marks it as the item being
// reviewed, which scrolls the source document to it and highlights it in orange.
export function ReviewItem({
  id,
  activeId,
  onActivate,
  children,
}: {
  id: string;
  activeId: string | null;
  onActivate: (id: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      id={`review-${id}`}
      onClick={() => onActivate(id)}
      onFocusCapture={() => onActivate(id)}
      className={cn(
        "px-5 py-4 border-b last:border-b-0 border-l-4 transition-colors scroll-mt-4",
        activeId === id ? "border-l-orange-400 bg-orange-50/40" : "border-l-transparent"
      )}
    >
      {children}
    </div>
  );
}

export function SelectButtons({ onAll, onNone }: { onAll: () => void; onNone: () => void }) {
  return (
    <div className="ml-auto flex gap-1">
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onAll}>Select all</Button>
      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onNone}>Select none</Button>
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card">
      <div className="px-5 py-2 border-b flex items-center gap-3 min-h-11">
        <h2 className="text-sm font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A checkbox row wrapper: dims the content when the item is not selected. */
export function Selectable({
  selected,
  disabled,
  onToggle,
  label,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onToggle: (on: boolean) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex gap-3", !selected && "opacity-50")}>
      <input
        type="checkbox"
        className="mt-1 size-4 shrink-0 accent-black"
        checked={selected}
        disabled={disabled}
        onChange={(e) => onToggle(e.target.checked)}
        aria-label={label}
      />
      <div className="flex-1 min-w-0 space-y-2">{children}</div>
    </div>
  );
}
