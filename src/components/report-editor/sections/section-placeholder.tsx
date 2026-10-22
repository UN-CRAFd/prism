"use client";

import { Construction } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UpdateSectionVariant } from "@/lib/update-sections";

// Shared shell for project-update pages whose structure exists but whose fields
// are not built yet. It shows which VERSION of the page the update calls for, so
// the matrix selection can be seen to reach the partner view before any of the
// real editing is in place. Replace a page's use of this with its real content
// as each one is built.
export function SectionPlaceholder({
  title,
  description,
  reportId,
  variant,
  months,
  readOnly,
  planned = [],
}: {
  title: string;
  description: string;
  reportId: number;
  variant: UpdateSectionVariant;
  months?: number | null;
  readOnly?: boolean;
  /** Fields this page is expected to carry once built. */
  planned?: string[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="t-heading-section">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>

      <UpdateVariantBanner variant={variant} months={months} />

      <div className="rounded-lg border border-dashed px-5 py-8 text-center">
        <Construction className="mx-auto size-7 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">This page is not built yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The page is routed and knows which version it should be. Its fields come next.
        </p>
        {planned.length > 0 && (
          <ul className="mx-auto mt-4 max-w-md space-y-1 text-left text-xs text-muted-foreground">
            {planned.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-muted-foreground/50">•</span>
                {item}
              </li>
            ))}
          </ul>
        )}
        {readOnly && (
          <p className="mt-4 text-xs text-muted-foreground">This update is read-only.</p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Report #{reportId}</p>
    </div>
  );
}

/** The version of a page the current selection calls for: the page's base row
 *  plus whichever add-ons are live. Shown above a section so it is obvious which
 *  variant is in force while the real per-variant rendering is still to come. */
export function UpdateVariantBanner({
  variant,
  months,
}: {
  variant: UpdateSectionVariant;
  months?: number | null;
}) {
  if (variant.modules.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-2.5">
      <span className="text-xs font-medium text-muted-foreground">Version</span>
      <span className="text-sm font-medium">{variant.describe(months)}</span>
      {variant.addOns.length > 0 && (
        <span className="ml-auto flex flex-wrap gap-1">
          {variant.addOns.map((key) => (
            <Badge key={key} variant="secondary" className="text-xs font-medium">
              {key}
            </Badge>
          ))}
        </span>
      )}
    </div>
  );
}
