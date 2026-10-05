"use client";

import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Check, MessageSquare, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CommentContextBadges } from "@/components/comment-context-badges";
import { cn, projectSlug } from "@/lib/utils";
import type { ProjectAction, FeedbackComment } from "@/lib/partner-projects";

export function ActionRow({ action }: { action: ProjectAction }) {
  const router = useRouter();

  let subtitle: string;
  let subtitleClass: string;

  if (action.type === "prodoc") {
    subtitle = action.prodocStatus ?? "";
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
      </div>
      <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
    </button>
  );
}

export function CommentRow({
  comment,
  onToggle,
  hideProject = false,
}: {
  comment: FeedbackComment;
  onToggle: (id: number, next: boolean) => void;
  hideProject?: boolean;
}) {
  const router = useRouter();
  const slug = projectSlug(comment.project_short_name, comment.project_title);
  const done = comment.partner_addressed;
  const href =
    comment.data_type === "prodoc"
      ? `/partner/prodoc-editor/${slug}/${comment.section}`
      : `/partner/report-editor/${slug}/${comment.year}/${comment.section}`;

  return (
    <div
      className={cn(
        "px-4 py-3 transition-colors cursor-pointer hover:bg-accent/60",
        done && "bg-muted/20"
      )}
      onClick={() => router.push(href)}
    >
      <div className="w-full flex items-start gap-3 text-left">
        <MessageSquare
          className={cn(
            "size-4 mt-0.5 shrink-0",
            done ? "text-muted-foreground/40" : "text-amber-500"
          )}
        />
        <div className="flex-1 min-w-0">
          <p className={cn("text-sm", done && "line-through text-muted-foreground")}>
            {comment.body}
          </p>
          <div
            className={cn(
              "flex items-center justify-between gap-2 mt-2",
              done && "opacity-60"
            )}
          >
            <CommentContextBadges
              reportType={comment.report_type}
              year={comment.year}
              project={comment.project_short_name ?? comment.project_title}
              section={comment.section}
              itemLabel={comment.item_label}
              dataType={comment.data_type}
              hideProject={hideProject}
              className="!gap-1"
            />
            {done ? (
              <Button
                size="sm"
                variant="outline"
                className="h-6 px-2 gap-1 text-xs shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(comment.id, false);
                }}
              >
                <RotateCcw className="size-3" /> Undo
              </Button>
            ) : (
              <Button
                size="sm"
                className="h-6 px-2 gap-1 text-xs shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(comment.id, true);
                }}
              >
                <Check className="size-3" /> Resolve
              </Button>
            )}
          </div>
        </div>
        <ArrowRight className="size-3.5 shrink-0 mt-0.5 text-muted-foreground/40 hover:text-muted-foreground transition-colors" />
      </div>
    </div>
  );
}
