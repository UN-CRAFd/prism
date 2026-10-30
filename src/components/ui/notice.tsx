import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type NoticeVariant = "info" | "status" | "neutral" | "success" | "error";

const VARIANT_STYLES: Record<NoticeVariant, string> = {
  info: "bg-crafd-yellow-100 border-crafd-yellow-200 text-crafd-grey-800",
  status: "bg-crafd-yellow-200 border-crafd-yellow text-crafd-grey-900",
  neutral: "bg-white border-crafd-grey-100 text-crafd-grey-600",
  success: "bg-green-50 border-green-200 text-green-900",
  error: "bg-destructive/5 border-destructive/30 text-destructive",
};

// The one message box used across the app: same size, padding, radius, icon and
// spacing everywhere; colour is set by purpose. Callers set outer spacing via className.
export function Notice({
  variant,
  icon,
  action,
  className,
  children,
}: {
  variant: NoticeVariant;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-lg border px-4 py-3 text-sm",
        action ? "items-center justify-between gap-4" : "items-start",
        VARIANT_STYLES[variant],
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span>}
        <div className="min-w-0">{children}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
