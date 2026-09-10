"use client";

import React from "react";
import { Link2, Printer } from "lucide-react";
import labels from "@/lib/labels";
import type { WikiTocEntry } from "@/lib/wiki";

// The guide banner doubles as the printed document's title block: rather than
// being hidden, it is restyled to plain ink-on-white by the `body.guide-print`
// print rules in globals.css. `guide-*` class hooks exist for those rules.
export function WikiShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="guide-root flex flex-col min-h-full bg-background">
      <div className="guide-banner sticky top-0 z-10 bg-neutral-950 text-white px-8 h-32 flex flex-col justify-center">
        <p className="text-neutral-400 text-sm mb-1">PRISM V.0.2</p>
        <h1 className="t-title-banner">Guide</h1>
        <p className="text-neutral-400 text-sm mt-2">
          How to use the PRISM reporting platform
        </p>
        <button
          type="button"
          // Native print → the browser's own "Save as PDF" also works, and text
          // stays selectable/searchable (same approach as the prodoc print view).
          onClick={() => window.print()}
          className="no-print absolute right-8 top-1/2 -translate-y-1/2 inline-flex items-center gap-2 rounded-md bg-crafd-yellow px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-crafd-yellow/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crafd-yellow"
        >
          <Printer className="size-4" />
          {labels.wiki.print}
        </button>
      </div>
      <div className="guide-body flex-1 px-8 py-8">
        <div className="max-w-4xl">{children}</div>
      </div>
    </div>
  );
}

// Table of contents for the printed / PDF guide only. It is in the DOM at all
// times but `display: none` until a print stylesheet applies (see .guide-toc in
// globals.css) — no JS toggle, so the browser's own "Print to PDF" picks it up.
//
// Entries are plain <a href="#id"> links to the ids decorateWikiHeadings already
// assigned, which is what makes them clickable inside the exported PDF.
export function GuideToc({ entries }: { entries: WikiTocEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <nav className="guide-toc" aria-label={labels.wiki.tocTitle}>
      <h2 className="guide-toc-title">{labels.wiki.tocTitle}</h2>
      <ol>
        {entries.map((e) => (
          <li key={e.id} data-toc-level={e.level}>
            <a href={`#${e.id}`}>
              <span className="guide-toc-num">{e.number}</span>
              <span className="guide-toc-text">{e.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function SectionHeading({
  icon: Icon,
  number,
  anchorId,
  children,
}: {
  icon: React.ElementType;
  // Ordinal from numberWikiSections (lib/wiki). Null for hidden sections.
  number?: string | null;
  // Section slug. Renders the hover copy-link anchor; the click itself is handled
  // by the delegated listener on the guide page, which also serves the anchors
  // injected into section bodies.
  anchorId?: string;
  children: React.ReactNode;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2.5 text-xl font-semibold text-foreground scroll-mt-32">
      <Icon className="h-5 w-5 shrink-0 text-crafd-yellow" />
      {number && (
        <span className="shrink-0 text-muted-foreground tabular-nums">{number}</span>
      )}
      {children}
      {anchorId && (
        <a
          className="wiki-anchor"
          href={`#${anchorId}`}
          aria-label={labels.wiki.copyLink}
          title={labels.wiki.copyLink}
        >
          <Link2 className="size-4" />
        </a>
      )}
    </h2>
  );
}

export function InfoBox({
  children,
  variant = "blue",
}: {
  children: React.ReactNode;
  variant?: "blue" | "amber" | "green";
}) {
  const colors = {
    blue: "bg-blue-50 border-blue-200 text-blue-900",
    amber: "bg-amber-50 border-amber-200 text-amber-900",
    green: "bg-green-50 border-green-200 text-green-900",
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${colors[variant]}`}>
      {children}
    </div>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700">
      {children}
    </span>
  );
}

export function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-crafd-yellow text-xs font-bold text-black">
        {number}
      </div>
      <div className="pb-6">
        <p className="font-medium text-foreground">{title}</p>
        <div className="mt-1 text-sm text-muted-foreground leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  );
}
