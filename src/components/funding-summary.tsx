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
  const diffCents = requested != null ? Math.round(requested * 100) - Math.round(total * 100) : null;
  const status: MatchStatus | null = requested != null ? matchStatus(requested, total) : null;

  // Only the status message is shown (no requested / total / remaining figures).
  // The amount inside the message is highlighted: green when it still remains
  // to be scheduled/budgeted, red when the total exceeds the requested amount.
  let template: string;
  let amount: string | null = null;
  let amountClass = "";
  let statusVariant: "ok" | "warn" | "missing";

  if (requested == null) {
    template = fs.missingRequested;
    statusVariant = "missing";
  } else if (status === "ok") {
    template = kindLabels.ok;
    statusVariant = "ok";
  } else if (status === "over") {
    template = kindLabels.over;
    amount = formatUsd(Math.abs(diffCents!) / 100);
    amountClass = "text-red-600";
    statusVariant = "warn";
  } else {
    template = kindLabels.under;
    amount = formatUsd(diffCents! / 100);
    amountClass = "text-green-700";
    statusVariant = "warn";
  }

  const [before, after] = amount != null && template.includes("{amount}")
    ? [template.slice(0, template.indexOf("{amount}")), template.slice(template.indexOf("{amount}") + "{amount}".length)]
    : [template, ""];

  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border px-3 py-2.5 text-sm font-medium",
        statusVariant === "ok"
          ? "border-green-200 bg-green-50 text-green-800"
          : statusVariant === "warn"
          ? "border-crafd-yellow-400 bg-crafd-yellow-100 text-crafd-grey-800"
          : "border-border bg-muted/30 text-muted-foreground"
      )}
    >
      {statusVariant === "warn" && <AlertTriangle className="size-4 shrink-0 mt-0.5" />}
      <span>
        {before}
        {amount != null && template.includes("{amount}") && (
          <span className={cn("font-semibold tabular-nums", amountClass)}>{amount}</span>
        )}
        {after}
      </span>
    </div>
  );
}
