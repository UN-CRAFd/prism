"use client";

import { Fragment } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/partner-projects";

// One dot per step, in the order given. Completed steps (approved / closed documents,
// or a milestone date already passed) show a check in a filled green dot. A connector is
// filled green only when the steps on BOTH sides are completed, grey otherwise. A document
// with CRAF'd is NOT completed: grey dot with a clock. The current step keeps its yellow
// dot; upcoming steps stay hollow grey.
const isDone = (state: TimelineEvent["state"]) => state === "approved" || state === "passed";

export function HorizontalTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="overflow-x-auto py-1">
      <div className="flex items-start min-w-full">
        {events.map((ev, i) => {
          const isLast = i === events.length - 1;
          const labelClass = ev.state === "pending" ? "text-muted-foreground" : "text-foreground";
          return (
            <Fragment key={i}>
              <div className="flex flex-col items-center shrink-0" style={{ minWidth: 96 }}>
                {isDone(ev.state) ? (
                  <div className="size-4 rounded-full bg-green-500 flex items-center justify-center">
                    <Check className="size-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : ev.state === "crafd" ? (
                  <div className="size-4 rounded-full bg-crafd-grey-400 flex items-center justify-center">
                    <Clock className="size-2.5 text-white" strokeWidth={3} />
                  </div>
                ) : (
                  <div
                    className={cn(
                      "size-4 rounded-full",
                      ev.state === "editing" && "bg-crafd-yellow ring-2 ring-crafd-yellow-200",
                      ev.state === "pending" && "bg-white border-2 border-gray-300"
                    )}
                  />
                )}
                <p className={cn("text-sm font-semibold mt-2 text-center leading-tight", labelClass)}>{ev.label}</p>
                {ev.detail && (
                  <p className={cn("text-[13px] text-center mt-0.5", ev.warn ? "text-red-600 font-medium" : ev.soon ? "text-crafd-yellow-900" : "text-muted-foreground")}>
                    {ev.detail}
                  </p>
                )}
              </div>
              {!isLast && (
                <div className="flex-1 min-w-4 self-start mt-2">
                  <div className={cn("h-px", isDone(ev.state) && isDone(events[i + 1].state) ? "bg-green-500" : "bg-border")} />
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
