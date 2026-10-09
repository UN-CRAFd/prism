"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import type { ProjectAction } from "@/lib/partner-projects";

export function ActionRow({ action }: { action: ProjectAction }) {
  const router = useRouter();

  let subtitle: string;
  let subtitleClass: string;

  if (action.type === "prodoc") {
    subtitle = "Not submitted";
    subtitleClass = "text-muted-foreground";
  } else if (!action.dueDateFormatted) {
    subtitle = "No due date set";
    subtitleClass = "text-muted-foreground";
  } else if (action.overdue) {
    subtitle = `Overdue · due ${action.dueDateFormatted}`;
    subtitleClass = "text-red-600";
  } else if (action.dueSoon) {
    subtitle = `Due ${action.dueDateFormatted}`;
    subtitleClass = "text-amber-600";
  } else {
    subtitle = `Due ${action.dueDateFormatted}`;
    subtitleClass = "text-muted-foreground";
  }

  return (
    <button
      onClick={() => router.push(action.href)}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/60 group"
    >
      <AlertCircle
        className={cn(
          "size-4 mt-0.5 shrink-0",
          action.overdue ? "text-red-500" : "text-amber-500"
        )}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{action.label}</p>
        {subtitle && (
          <p className={cn("text-xs mt-0.5", subtitleClass)}>{subtitle}</p>
        )}
        {action.commentCount > 0 && (
          <p className="text-xs text-blue-700 mt-0.5">
            {action.commentCount}{" "}
            {action.commentCount === 1
              ? labels.partnerHome.commentToAddress
              : labels.partnerHome.commentsToAddress}
          </p>
        )}
      </div>
      <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}
