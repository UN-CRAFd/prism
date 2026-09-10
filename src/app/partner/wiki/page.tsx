"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { WikiShell, SectionHeading, GuideToc } from "@/components/partner/wiki/wiki-components";
import { wikiIcon, numberWikiSections, decorateWikiHeadings } from "@/lib/wiki";
import { toDisplayHtml } from "@/lib/richtext";
import labels from "@/lib/labels";

// Deepest heading level listed in the printed table of contents: sections (1)
// and their first level of sub-headings (1.1). Deeper headings still get numbers
// and anchors on the page — they are just left out to keep the TOC short.
const TOC_MAX_DEPTH = 2;

type Section = {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  body_html: string;
  hidden: boolean;
};

// Single long guide page. Content is loaded from the DB (wiki_sections, editable
// by admins at /admin/guide). Each section renders its own <section id="…">
// anchor (scroll-mt-32 clears the sticky header); the app-sidebar links to those
// anchors. We drive the scroll ourselves so it's smooth on both first load (hash
// present in the URL) and same-page hash changes — run once sections are in.
//
// Section numbers (1, 1.1, …) are derived from the fetched order at render time
// — see numberWikiSections / decorateWikiHeadings in lib/wiki. Every heading also
// carries a copy-link anchor; one delegated click handler serves both the React
// section headings and the anchors injected into section bodies.
export default function WikiRoute() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  // Clears the transient "Link copied" flag if another anchor is clicked first.
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/wiki-sections")
      .then((r) => { if (!r.ok) throw new Error("Failed to load guide"); return r.json(); })
      .then((rows: Section[]) => { if (active) setSections(rows); })
      .catch(() => { /* leave empty; the shell still renders */ })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  // Smooth-scroll to the anchor once content is present.
  useEffect(() => {
    if (loading) return;
    const scrollToHash = () => {
      const id = window.location.hash.slice(1);
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    };
    scrollToHash();
    window.addEventListener("hashchange", scrollToHash);
    return () => window.removeEventListener("hashchange", scrollToHash);
  }, [loading]);

  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  // The print rules have to reach the app shell (the sidebar, and the fixed-height
  // scroll containers in the partner layout), which lives outside this page. A
  // body class scopes every one of those rules to the guide, so printing any other
  // page is unaffected. Removed on navigate away.
  useEffect(() => {
    document.body.classList.add("guide-print");
    return () => document.body.classList.remove("guide-print");
  }, []);

  // Number the sections and decorate their bodies in one pass. `usedIds` is
  // seeded with every section slug and shared across sections, so a heading can
  // never take an id that already anchors something else on the page.
  const numbered = useMemo(() => {
    const withNumbers = numberWikiSections(sections);
    const usedIds = new Set(withNumbers.map((s) => s.slug));
    return withNumbers.map((s) => {
      if (!s.number) return { ...s, html: toDisplayHtml(s.body_html), entries: [] };
      const { html, entries } = decorateWikiHeadings(toDisplayHtml(s.body_html), {
        number: s.number,
        slug: s.slug,
        usedIds,
        linkLabel: labels.wiki.copyLink,
      });
      return { ...s, html, entries };
    });
  }, [sections]);

  // Print-only table of contents, built from the ids and numbers the section
  // numbering already produced — nothing is re-derived here, so the TOC cannot
  // drift from the headings it points at. Hidden sections are excluded: they are
  // display:none in print, and a link to a non-rendered target is a dead link in
  // the exported PDF.
  const tocEntries = useMemo(
    () =>
      numbered.flatMap((s) =>
        s.number
          ? [
              { id: s.slug, number: s.number, title: s.title, level: 1 },
              ...s.entries.filter((e) => e.level <= TOC_MAX_DEPTH),
            ]
          : []
      ),
    [numbered]
  );

  // Delegated: catches clicks on both the React section headings' anchors and the
  // ones injected as raw HTML into section bodies. Copies an absolute link, puts
  // the hash in the address bar, and flashes "Link copied" on the icon itself.
  // Modified clicks fall through so "open in new tab" still works.
  const handleAnchorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const anchor =
      e.target instanceof Element ? e.target.closest("a.wiki-anchor") : null;
    if (!(anchor instanceof HTMLAnchorElement)) return;

    e.preventDefault();
    const id = anchor.getAttribute("href")?.slice(1);
    if (!id) return;

    const { origin, pathname } = window.location;
    window.history.replaceState(null, "", `${pathname}#${id}`);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

    navigator.clipboard?.writeText(`${origin}${pathname}#${id}`).then(
      () => {
        if (copiedTimer.current) clearTimeout(copiedTimer.current);
        document
          .querySelectorAll("a.wiki-anchor[data-copied]")
          .forEach((el) => el.removeAttribute("data-copied"));
        // The attribute value is what the CSS renders as the tooltip, so the
        // confirmation stays admin-editable like every other label.
        anchor.setAttribute("data-copied", labels.wiki.copied);
        copiedTimer.current = setTimeout(
          () => anchor.removeAttribute("data-copied"),
          2000
        );
      },
      // Clipboard unavailable (insecure context / denied) — the address bar still
      // holds the link, so there's nothing useful to report.
      () => {}
    );
  }, []);

  return (
    <WikiShell>
      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
        </div>
      ) : (
        // The TOC sits outside the divide-y wrapper on purpose: as a child it
        // would take the `first:pt-0` slot and push a divider above the first
        // section, changing the on-screen layout.
        <>
          <GuideToc entries={tocEntries} />
          <div className="divide-y divide-border" onClick={handleAnchorClick}>
            {numbered.map((s) => (
              <section
                key={s.id}
                id={s.slug}
                // Hidden sections reach admins only and carry no number, so they
                // are dropped from print — the printed guide matches the
                // partner's view.
                data-guide-hidden={s.hidden ? "" : undefined}
                className="scroll-mt-32 py-8 first:pt-0 last:pb-0"
              >
                <SectionHeading icon={wikiIcon(s.icon)} number={s.number} anchorId={s.slug}>
                  {s.title}
                </SectionHeading>
                <div
                  className="rich-html max-w-none text-sm leading-relaxed text-muted-foreground"
                  dangerouslySetInnerHTML={{ __html: s.html }}
                />
              </section>
            ))}
          </div>
        </>
      )}
    </WikiShell>
  );
}
