import { cn } from "@/lib/utils";

import { LIGHT_STATUS_STYLES } from "@/lib/reports";

export function StatusPill({ status }: { status: string }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
      LIGHT_STATUS_STYLES[status] ?? LIGHT_STATUS_STYLES.Closed
    )}>
      {status}
    </span>
  );
}
