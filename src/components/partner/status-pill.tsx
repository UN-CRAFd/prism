import { cn } from "@/lib/utils";

import { LIGHT_STATUS_STYLES } from "@/lib/reports";
import { documentStatusLabel } from "@/lib/status-label";
import { partnerStatusLabel } from "@/lib/report-status";

// `kind` picks which status list supplies the label: "prodoc" → project document
// statuses, anything else (default) → report / project update statuses. Colours are
// keyed by the stored value, never the label.
// `partner` shows the partner-facing wording (To complete / Under review / To revise /
// Approved) instead of the admin-editable labels.
export function StatusPill({ status, label, kind, partner }: { status: string; label?: string; kind?: "report" | "update" | "prodoc"; partner?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold border",
      LIGHT_STATUS_STYLES[status] ?? LIGHT_STATUS_STYLES.Closed
    )}>
      {label ?? (partner ? partnerStatusLabel(status) : documentStatusLabel(kind, status))}
    </span>
  );
}
