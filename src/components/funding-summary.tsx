"use client";

import { AlertTriangle } from "lucide-react";
import { cn, formatUsd } from "@/lib/utils";
import labels from "@/lib/labels";

const fs = labels.fundingSummary;

type MatchStatus = "ok" | "under" | "over";
function matchStatus(requested: number, total: number): MatchStatus {
  const diffCents = Math.round(requested * 100) - Math.round(total * 100);
  if (diffCents >= 0 && diffCents <= 100) return "ok";
  return diffCents < 0 ? "over" : "under";
}

export function FundingSummary({
  requested,
  total,
  kind,
}: {
  requested: number | null;
  total: number;
  kind: "budget" | "tranche";
}) {
  const kindLabels = kind === "budget" ? fs.budget : fs.tranche;
  const remaining = requested != null ? requested - total : null;
  const diffCents = requested != null ? Math.round(requested * 100) - Math.round(total * 100) : null;
  const status: MatchStatus | null = requested != null ? matchStatus(requested, total) : null;

  let statusMsg: string | null = null;
  let statusVariant: "ok" | "warn" | "missing" = "missing";

  if (requested == null) {
    statusMsg = fs.missingRequested;
    statusVariant = "missing";
  } else if (status === "ok") {
    statusMsg = kindLabels.ok;
    statusVariant = "ok";
  } else if (status === "over") {
    statusMsg = kindLabels.over.replace("{amount}", formatUsd(Math.abs(diffCents!) / 100));
    statusVariant = "warn";
  } else {
    statusMsg = kindLabels.under.replace("{amount}", formatUsd(diffCents! / 100));
    statusVariant = "warn";
  }

  return (
    <div className="rounded-xl border bg-card p-5 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Stat label={fs.requestedLabel} value={requested != null ? formatUsd(requested) : "—"} />
        <Stat label={kindLabels.totalLabel} value={formatUsd(total)} className="sm:text-center" />
        <Stat
          label={kindLabels.remainingLabel}
          value={remaining != null ? formatUsd(remaining) : "—"}
          valueClass={remaining != null && remaining < 0 ? "text-red-600" : ""}
          className="sm:text-right"
        />
      </div>

      {statusMsg && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium",
            statusVariant === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : statusVariant === "warn"
              ? "border-amber-300 bg-amber-50 text-amber-900"
              : "border-border bg-muted/30 text-muted-foreground"
          )}
        >
          {statusVariant === "warn" && <AlertTriangle className="size-4 shrink-0 mt-0.5" />}
          <span>{statusMsg}</span>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = "",
  className = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", valueClass)}>{value}</p>
    </div>
  );
}
