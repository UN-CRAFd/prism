import * as React from "react";
import { cn } from "@/lib/utils";

// The one quiet style for "tag" chips. Small, muted text; two looks:
//   neutral   (default) light grey — an item's category, cycle, type, "Standard", …
//   highlight           light cream — a tag that calls out something noteworthy,
//                       e.g. "Custom" (indicators) and "Added in <year>" (risks)
// Coloured status / rating badges (risk levels, survey ratings, status pills) are
// NOT tags and keep their own colours. Change the look here and every tag follows.
const TAG_BASE =
  "inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs font-normal whitespace-nowrap text-crafd-grey-600";

export const TAG_VARIANTS = {
  neutral: "border-crafd-grey-200 bg-neutral-50",
  highlight: "border-crafd-yellow bg-crafd-yellow-50",
} as const;

export function Tag({
  variant = "neutral",
  className,
  ...props
}: React.ComponentProps<"span"> & { variant?: keyof typeof TAG_VARIANTS }) {
  return <span data-slot="tag" className={cn(TAG_BASE, TAG_VARIANTS[variant], className)} {...props} />;
}
