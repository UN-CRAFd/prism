"use client";

import { Fragment, useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/partner-projects";

export function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const today = useMemo(() => new Date(), []);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-start min-w-full">
        {events.map((ev, i) => {
          const isNow = ev.type === "now";
          const isLast = i === events.length - 1;

          const labelClass = isNow
            ? "text-foreground"
            : ev.submitted
            ? "text-green-700"
            : ev.overdue
            ? "text-red-600"
            : "text-muted-foreground";

          return (
            <Fragment key={i}>
              {/* Event column */}
              <div className="flex flex-col items-center shrink-0" style={{ minWidth: 80 }}>
                {/* Dot */}
                {ev.submitted ? (
                  <div className="size-4 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "size-4 rounded-full",
                      isNow
                        ? "bg-gray-900 ring-2 ring-gray-300"
                        : ev.overdue
                        ? "bg-red-500 ring-2 ring-red-200"
                        : ev.pastDate
                        ? "bg-gray-400 ring-2 ring-gray-200"
                        : "bg-white border-2 border-gray-300"
                    )}
                  />
                )}
                {/* Label */}
                <p
                  className={cn(
                    "text-sm font-semibold mt-2 text-center leading-tight",
                    labelClass
                  )}
                >
                  {ev.label}
                </p>
                {/* Description (prodoc/deadline second line) */}
                {ev.description && (
                  <p className="text-[13px] text-muted-foreground text-center mt-0.5">
                    {ev.description}
                  </p>
                )}
                {/* Date (start/end/now second line) */}
                {ev.date && (
                  <p className="text-[13px] text-muted-foreground text-center mt-0.5">
                    {ev.date}
                  </p>
                )}
              </div>
              {/* Growing connector */}
              {!isLast && (
                <div className="flex-1 min-w-4 self-start mt-2">
                  <div className="h-px bg-border" />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
