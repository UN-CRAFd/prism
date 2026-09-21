"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";

export function usePastYears(years: number[], currentYear: number | null) {
  const pastYears = useMemo(() => {
    if (currentYear === null) return [];
    return years.filter((y) => y < currentYear).sort((a, b) => a - b);
  }, [years, currentYear]);

  const [shownYears, setShownYears] = useState<Set<number>>(() => new Set());

  function toggleYear(year: number) {
    setShownYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  }

  const visibleYears = useMemo(() => {
    if (currentYear === null) return years;
    const visible = pastYears.filter((y) => shownYears.has(y));
    return [...visible, currentYear];
  }, [pastYears, shownYears, currentYear, years]);

  return { pastYears, shownYears, toggleYear, visibleYears };
}

export function PastYearChips({
  pastYears,
  shownYears,
  onToggle,
}: {
  pastYears: number[];
  shownYears: Set<number>;
  onToggle: (year: number) => void;
}) {
  if (pastYears.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">{labels.common.formerReports}</span>
      {pastYears.map((year) => {
        const on = shownYears.has(year);
        return (
          <button
            key={year}
            type="button"
            onClick={() => onToggle(year)}
            aria-pressed={on}
            className={cn(
              "rounded-full border px-3 py-0.5 text-xs transition-colors",
              on
                ? "bg-neutral-200 text-foreground border-neutral-300"
                : "bg-transparent text-muted-foreground border-neutral-200 hover:border-neutral-300 hover:text-foreground"
            )}
          >
            {year}
          </button>
        );
      })}
    </div>
  );
}
