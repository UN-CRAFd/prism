import { cn } from "@/lib/utils";

import { LIGHT_STATUS_STYLES } from "@/lib/reports";
import { documentStatusLabel } from "@/lib/status-label";

// `kind` picks which status list supplies the label: "prodoc" → project document
// statuses, anything else (default) → report / project update statuses. Colours are
// keyed by the stored value, never the label.
export function StatusPill({ status, label, kind }: { status: string; label?: string; kind?: "report" | "update" | "prodoc" }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
      LIGHT_STATUS_STYLES[status] ?? LIGHT_STATUS_STYLES.Closed
    )}>
      {label ?? documentStatusLabel(kind, status)}
    </span>
  );
}
