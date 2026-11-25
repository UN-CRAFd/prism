"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Progress track + percentage for a list card. `pct` is null while the completion
 * number is still loading: the track then shows an indeterminate sliding segment
 * (a static grey bar under prefers-reduced-motion) and no percentage text. When the
 * number arrives the fill grows from 0 to the real value with the usual transition.
 */
export function ProgressBar({ pct, editable }: { pct: number | null; editable: boolean }) {
  // The fill mounts at 0 and moves to the value on the next frame, so it animates.
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (pct == null) { setWidth(0); return; }
    const id = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);

  return (
    <div className="flex items-center gap-2">
      <div
        className="relative flex-1 h-1.5 bg-muted rounded-full overflow-hidden"
        role="progressbar"
        aria-busy={pct == null}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {pct == null ? (
          <div className="absolute inset-y-0 left-0 w-1/5 rounded-full bg-crafd-grey-400/60 animate-progress-slide motion-reduce:hidden" />
        ) : (
          <div
            className={cn("h-full rounded-full transition-all duration-300", editable ? "bg-crafd-yellow" : "bg-crafd-grey-400")}
            style={{ width: `${width}%` }}
          />
        )}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
        {pct == null ? "" : `${pct}%`}
      </span>
    </div>
  );
}
