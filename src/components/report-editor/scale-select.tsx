"use client";

import { type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import labels from "@/lib/labels.json";
import { SCALE_COLORS, FALLBACK_COLORS, likelihoodLabel, impactLabel } from "@/lib/risk";

const ASSESSMENT_CONFIG: Record<number, { bg: string; text: string; border: string }> = {
  1: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
  2: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  5: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
};

// Shared coloured word-badge used by the assessment + risk cells.
export function Badge({ colors, children }: { colors: { bg: string; text: string; border: string }; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center justify-center rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", colors.bg, colors.text, colors.border)}>
      {children}
    </span>
  );
}

function AssessmentBadge({ value }: { value: number }) {
  return <Badge colors={ASSESSMENT_CONFIG[value] ?? FALLBACK_COLORS}>{value}</Badge>;
}

function LikelihoodBadge({ value }: { value: number }) {
  return <Badge colors={SCALE_COLORS[value] ?? FALLBACK_COLORS}>{likelihoodLabel(value)}</Badge>;
}

function ImpactBadge({ value }: { value: number }) {
  return <Badge colors={SCALE_COLORS[value] ?? FALLBACK_COLORS}>{impactLabel(value)}</Badge>;
}

type ScaleKind = "assessment" | "likelihood" | "impact";

// Per-kind rendering: the trigger badge and the dropdown-item content. Assessment
// items pair the badge with a text label; likelihood/impact items show the badge
// alone (its own coloured word already carries the label).
const KIND_CONFIG: Record<ScaleKind, { badge: (v: number) => ReactNode; item: (v: number) => ReactNode }> = {
  assessment: {
    badge: (v) => <AssessmentBadge value={v} />,
    item: (v) => (
      <div className="flex items-center gap-2">
        <AssessmentBadge value={v} />
        <span className="text-sm">{labels.assessment.scale[String(v) as keyof typeof labels.assessment.scale]}</span>
      </div>
    ),
  },
  likelihood: {
    badge: (v) => <LikelihoodBadge value={v} />,
    item: (v) => <LikelihoodBadge value={v} />,
  },
  impact: {
    badge: (v) => <ImpactBadge value={v} />,
    item: (v) => <ImpactBadge value={v} />,
  },
};

// The 1–5 scale dropdown reused for the survey assessment and the risk
// likelihood/impact cells. Value is stored as a number (or null when unset).
export function ScaleSelect({
  kind,
  value,
  onValueChange,
  disabled,
}: {
  kind: ScaleKind;
  value: number | null;
  onValueChange: (value: number | null) => void;
  disabled?: boolean;
}) {
  const config = KIND_CONFIG[kind];
  return (
    <Select
      value={value != null ? String(value) : "none"}
      onValueChange={(v) => onValueChange(v === "none" ? null : Number(v))}
      disabled={disabled}
    >
      <SelectTrigger className="w-fit h-8 px-2 gap-1.5">
        {value != null
          ? config.badge(value)
          : <span className="text-muted-foreground text-sm px-1">—</span>}
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none"><span className="text-muted-foreground">—</span></SelectItem>
        {[1, 2, 3, 4, 5].map((n) => (
          <SelectItem key={n} value={String(n)}>{config.item(n)}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
