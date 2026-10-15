import { cn } from "@/lib/utils";

const STATUS_PILL: Record<string, string> = {
  Open:           "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Under Review": "bg-amber-50 text-amber-700 border-amber-200",
  Closed:         "bg-neutral-100 text-neutral-500 border-neutral-200",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
      STATUS_PILL[status] ?? STATUS_PILL.Closed
    )}>
      {status}
    </span>
  );
}
