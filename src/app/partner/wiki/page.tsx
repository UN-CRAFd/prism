"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { WikiShell, SectionHeading } from "@/components/partner/wiki/wiki-components";
import { wikiIcon } from "@/lib/wiki";
import { toDisplayHtml } from "@/lib/richtext";
import labels from "@/lib/labels";

type Section = {
  id: number;
  slug: string;
  title: string;
  icon: string | null;
  body_html: string;
};

// Single long guide page. Content is loaded from the DB (wiki_sections, editable
// by admins at /admin/guide). Each section renders its own <section id="…">
// anchor (scroll-mt-32 clears the sticky header); the app-sidebar links to those
// anchors. We drive the scroll ourselves so it's smooth on both first load (hash
// present in the URL) and same-page hash changes — run once sections are in.
export default function WikiRoute() {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <WikiShell>
      {loading ? (
        <div className="flex items-center gap-2 py-16 justify-center text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {labels.common.loading}
        </div>
      ) : (
        <div className="divide-y divide-border">
          {sections.map((s) => (
            <section key={s.id} id={s.slug} className="scroll-mt-32 py-8 first:pt-0 last:pb-0">
              <SectionHeading icon={wikiIcon(s.icon)}>{s.title}</SectionHeading>
              <div
                className="rich-html max-w-none text-sm leading-relaxed text-muted-foreground"
                dangerouslySetInnerHTML={{ __html: toDisplayHtml(s.body_html) }}
              />
            </section>
          ))}
        </div>
      )}
    </WikiShell>
  );
}
