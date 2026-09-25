"use client";

import { useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import { useStickySet } from "@/components/report-editor/sticky-filter";

/**
 * `section` names the grid these chips belong to, so each one remembers its own
 * years while the report editor unmounts and remounts it across tab switches.
 */
export function usePastYears(years: number[], currentYear: number | null, section: string) {
  const pastYears = useMemo(() => {
    if (currentYear === null) return [];
    return years.filter((y) => y < currentYear).sort((a, b) => a - b);
  }, [years, currentYear]);

  const [shownYears, updateShownYears] = useStickySet<number>(`past-years:${section}`);

  const toggleYear = useCallback((year: number) => {
    updateShownYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }, [updateShownYears]);

  const visibleYears = useMemo(() => {
    if (currentYear === null) return years;
    const visible = pastYears.filter((y) => shownYears.has(y));
    return [...visible, currentYear];
  }, [pastYears, shownYears, currentYear, years]);

  return { pastYears, shownYears, toggleYear, visibleYears };
}

// The pill used by every "narrow this table down" control. Kept as one component
// so the year chips here and the workplan's year / baseline chips can never drift
// apart visually.
export function FilterChip({
  on,
  onClick,
  disabled,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  // Deliberately a <span role="button"> rather than a <button>: these chips only
  // change which rows/columns the table shows, they never edit the report, so
  // they have to keep working while it is Under Review or closed. A real <button>
  // would be switched off by the editor's read-only <fieldset disabled> along
  // with every genuine editing control in the subtree (see report-editor.tsx),
  // and fieldset[disabled] has no per-control opt-out. `disabled` here is the
  // component's own "this chip cannot be toggled right now", not read-only.
  function activate() {
    if (!disabled) onClick();
  }

  return (
    <span
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault(); // stop Space from scrolling the grid
        activate();
      }}
      title={title}
      aria-pressed={on}
      aria-disabled={disabled || undefined}
      className={cn(
        "inline-block select-none rounded-full border px-3 py-0.5 text-xs transition-colors",
        "outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
        on
          ? "bg-neutral-200 text-foreground border-neutral-300"
          : "bg-transparent text-muted-foreground border-neutral-200 hover:border-neutral-300 hover:text-foreground",
        disabled
          ? "cursor-not-allowed opacity-50 hover:border-neutral-200 hover:text-muted-foreground"
          : "cursor-pointer"
      )}
    >
      {children}
    </span>
  );
}

export function PastYearChips({
  pastYears,
  shownYears,
  onToggle,
  label = labels.common.formerReports,
}: {
  pastYears: number[];
  shownYears: Set<number>;
  onToggle: (year: number) => void;
  label?: string;
}) {
  if (pastYears.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{label}</span>
      {pastYears.map((year) => (
        <FilterChip key={year} on={shownYears.has(year)} onClick={() => onToggle(year)}>
          {year}
        </FilterChip>
      ))}
    </div>
  );
}
