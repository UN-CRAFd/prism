"use client";

import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STATUS_PARTNER_REVIEW } from "@/lib/report-status";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels";
import type { ProjectAction } from "@/lib/partner-projects";

// The row's button: Continue (to complete), Revise (back with the partner for changes).
function actionButtonLabel(status: string): string {
  const b = labels.partnerHome.actionButton;
  if (status === STATUS_PARTNER_REVIEW) return b.revise;
  if (status === "Open") return b.continue;
  return b.open;
}

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
    subtitleClass = "text-crafd-yellow-900";
  } else {
    subtitle = `Due ${action.dueDateFormatted}`;
    subtitleClass = "text-muted-foreground";
  }

  // The title follows the button: "Revise …" in Partner Review, "Complete …" when Open.
  const title =
    action.status === STATUS_PARTNER_REVIEW ? action.label.replace(/^Complete /, "Revise ") : action.label;

  return (
    // A div, not a button: it holds a real button. The whole row is clickable; the
    // inner button keeps keyboard access and its click bubbles to the same handler.
    <div
      onClick={() => router.push(action.href)}
      className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors cursor-pointer", action.overdue ? "bg-red-50 hover:bg-red-100" : "hover:bg-accent/60")}
    >
      {/* Only overdue rows carry the red "!" icon. */}
      {action.overdue && <AlertCircle className="size-4 shrink-0 self-start mt-0.5 text-red-500" />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {subtitle && (
          <p className={cn("text-xs mt-0.5", subtitleClass)}>{subtitle}</p>
        )}
        {action.commentCount > 0 && (
          <p className="text-xs font-medium text-crafd-grey-800 mt-0.5">
            {action.commentCount}{" "}
            {action.commentCount === 1
              ? labels.partnerHome.commentToAddress
              : labels.partnerHome.commentsToAddress}
          </p>
        )}
      </div>
      <Button type="button" size="sm" variant="add" className="shrink-0 min-w-[100px]">
        {actionButtonLabel(action.status)}
      </Button>
    </div>
  );
}
