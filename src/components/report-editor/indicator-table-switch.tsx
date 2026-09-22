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
//
// The boxes are deliberately NOT <button>s. Both editors wrap their section body
// in <fieldset disabled={readOnly}>, which natively disables every form control
// inside it — so on a view-only or lock-blocked document a <button> here would go
// dead and the second table would become unreachable. Switching tables is
// navigation, not editing, and has to keep working exactly like scrolling does.
// A <span> is not a form control, so the fieldset leaves it alone; tabIndex plus
// the Enter/Space handler give back the keyboard behaviour a button had.
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
          <span
            key={opt.key}
            role="tab"
            tabIndex={0}
            aria-selected={active}
            onClick={() => onChange(opt.key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onChange(opt.key);
              }
            }}
            className={cn(
              "flex cursor-pointer select-none items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
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
          </span>
        );
      })}
    </div>
  );
}
