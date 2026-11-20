"use client";

import { Fragment } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/partner-projects";

// One dot per step, in the order given. The line between dots is green up to the last
// approved step and grey after it.
export function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  const lastApproved = events.reduce((last, ev, i) => (ev.state === "approved" ? i : last), -1);
  return (
    <div className="overflow-x-auto">
      <div className="flex items-start min-w-full">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1;
          const labelClass = ev.state === "approved" ? "text-green-700" : ev.state === "pending" ? "text-muted-foreground" : "text-foreground";
          return (
            <Fragment key={i}>
              <div className="flex flex-col items-center shrink-0" style={{ minWidth: 96 }}>
                {ev.state === "approved" ? (
                  <div className="size-4 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "size-4 rounded-full",
                      ev.state === "crafd" && "bg-blue-500 ring-2 ring-blue-200",
                      ev.state === "editing" && "bg-crafd-yellow ring-2 ring-crafd-yellow-200",
                      ev.state === "passed" && "bg-gray-400 ring-2 ring-gray-200",
                      ev.state === "pending" && "bg-white border-2 border-gray-300"
                    )}
                  />
                )}
                <p className={cn("text-sm font-semibold mt-2 text-center leading-tight", labelClass)}>{ev.label}</p>
                {ev.detail && (
                  <p className={cn("text-[13px] text-center mt-0.5", ev.warn ? "text-red-600 font-medium" : "text-muted-foreground")}>
                    {ev.detail}
                  </p>
                )}
              </div>
              {!isLast && (
                <div className="flex-1 min-w-4 self-start mt-2">
                  <div className={cn("h-px", i < lastApproved ? "bg-green-500" : "bg-border")} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
