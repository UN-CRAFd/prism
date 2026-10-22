"use client";

import { Construction } from "lucide-react";

// Shared shell for project-update pages whose structure exists but whose fields
// are not built yet. Replace a page's use of this with its real content as each
// one is built.
//
// It deliberately says nothing about which VERSION of the page an update calls
// for: a page shows that by being it — the work plan grows its extension
// columns, the expenditure table its proposed-budget columns — rather than by
// announcing it in a banner above the content.
export function SectionPlaceholder({
  title,
  description,
  reportId,
  readOnly,
  planned = [],
}: {
  title: string;
  description: string;
  reportId: number;
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

      <div className="rounded-lg border border-dashed px-5 py-8 text-center">
        <Construction className="mx-auto size-7 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">This page is not built yet</p>
        <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
          The page is routed and ready. Its fields come next.
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
          <p className="mt-4 text-[11px] text-muted-foreground">This update is read-only.</p>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">Report #{reportId}</p>
    </div>
  );
}
