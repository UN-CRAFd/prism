"use client";

import { cn } from "@/lib/utils";
import labels from "@/lib/labels";

export type IndicatorTableKey = "standard" | "custom";

// The standard and custom indicator tables used to sit stacked on one page,
// splitting the tab's height between them so both were cramped and neither
// showed many rows at once. They are alternatives now: these two boxes pick
// which one is on screen, and the chosen table takes the whole height.
//
// The counts stay on the boxes because the hidden table is otherwise invisible
// — without them there is no way to tell an empty table from an unopened one.
export function IndicatorTableSwitch({
  value,
  onChange,
  standardCount,
  customCount,
}: {
  value: IndicatorTableKey;
  onChange: (next: IndicatorTableKey) => void;
  standardCount: number;
  customCount: number;
}) {
  const options = [
    { key: "standard" as const, label: labels.indicators.columns.standardIndicator, count: standardCount },
    { key: "custom" as const, label: labels.indicators.columns.customIndicator, count: customCount },
  ];

  return (
    <div role="tablist" aria-label="Indicator tables" className="flex shrink-0 items-center gap-2">
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
              active
                ? "border-neutral-800 bg-neutral-800 font-medium text-white"
                : "border-neutral-200 bg-card text-muted-foreground hover:border-neutral-300 hover:text-foreground"
            )}
          >
            {opt.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] tabular-nums",
                active ? "bg-white/20" : "bg-muted"
              )}
            >
              {opt.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
