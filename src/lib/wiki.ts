// Shared constants and helpers for the partner Guide (wiki). The Guide content
// lives in the `wiki_sections` table; this module is the single source of truth
// for the allowlisted section icons and for section numbering, so the admin
// editor, the partner page, and the sidebar all agree. Icons are lucide-react
// components looked up by name — only names in this map are valid; anything else
// falls back to DEFAULT_WIKI_ICON.

import {
  BookOpen,
  LogIn,
  FileText,
  FileEdit,
  Workflow,
  PenLine,
  MessageSquare,
  Contact,
  Printer,
  Sparkles,
  Library,
  HelpCircle,
  Home,
  Settings,
  Users,
  Calendar,
  BarChart3,
  Target,
  Flag,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Rocket,
  Compass,
  Map,
  Folder,
  Link2,
  Mail,
  Shield,
  type LucideIcon,
} from "lucide-react";

export const WIKI_ICONS = {
  BookOpen,
  LogIn,
  FileText,
  FileEdit,
  Workflow,
  PenLine,
  MessageSquare,
  Contact,
  Printer,
  Sparkles,
  Library,
  HelpCircle,
  Home,
  Settings,
  Users,
  Calendar,
  BarChart3,
  Target,
  Flag,
  ClipboardList,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  Rocket,
  Compass,
  Map,
  Folder,
  Link2,
  Mail,
  Shield,
} as const satisfies Record<string, LucideIcon>;

export type WikiIconName = keyof typeof WIKI_ICONS;

export const WIKI_ICON_NAMES = Object.keys(WIKI_ICONS) as WikiIconName[];

export const DEFAULT_WIKI_ICON: WikiIconName = "BookOpen";

/** Resolve a stored icon name to a lucide component, falling back to the default. */
export function wikiIcon(name?: string | null): LucideIcon {
  if (name && name in WIKI_ICONS) return WIKI_ICONS[name as WikiIconName];
  return WIKI_ICONS[DEFAULT_WIKI_ICON];
}

// ── Section numbering + anchors ───────────────────────────────────────────────
// Guide sections are numbered 1, 2, 3… in stored order, and headings inside a
// section's body become 1.1, 1.1.1, 1.2… Nothing is persisted: both numbers are
// derived at render time, so adding, deleting or reordering sections renumbers
// everything automatically.
//
// Every heading also gets a stable id and a copy-link affordance, so any part of
// the Guide can be linked to directly. Top-level sections anchor on their stored
// slug (which survives a rename); body headings anchor on
// "<section-slug>-<heading-text>", the GitHub README convention.
//
// Hidden sections are skipped and carry no number. Admins receive them from the
// API (partners don't), and numbering them would make an admin's view disagree
// with what partners actually see.

/** A section as far as numbering is concerned — the rest of the row is passed through. */
type NumberableSection = { hidden?: boolean };

/** Stamp each section with its ordinal ("1", "2", …); hidden sections get null. */
export function numberWikiSections<T extends NumberableSection>(
  sections: T[]
): (T & { number: string | null })[] {
  let n = 0;
  return sections.map((s) => ({
    ...s,
    number: s.hidden ? null : String(++n),
  }));
}

/**
 * Kebab-case a heading into an anchor-safe slug. Mirrors the `slugify` used when
 * the API mints section slugs, so section and heading anchors read alike. HTML
 * entities are dropped rather than decoded — "&amp;" should not become "amp".
 */
function anchorSlug(text: string): string {
  return text
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Claim an id, suffixing -2, -3… until it is unique across the page. */
function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  let n = 2;
  while (used.has(id)) id = `${base}-${n++}`;
  used.add(id);
  return id;
}

// lucide-react's Link2 glyph, inlined. The body HTML is injected via
// dangerouslySetInnerHTML, so the icon has to be markup rather than a component;
// it is kept visually identical to the <Link2 /> used in SectionHeading.
const LINK_ICON_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
  '<path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/>' +
  '<line x1="8" x2="16" y1="12" y2="12"/></svg>';

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Heading markup → readable plain text, for the table of contents. */
function headingText(inner: string): string {
  return inner
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One line of the printed table of contents. `level` is 1 for a Guide section and
 * grows with heading depth (a "1.2" heading is level 2), so the TOC can indent
 * without re-parsing the number.
 */
export type WikiTocEntry = {
  id: string;
  number: string;
  title: string;
  level: number;
};

/**
 * Number every heading in a section body ("1.2"), give it a stable id, and append
 * the hover copy-link anchor.
 *
 * Depth follows the headings' relative levels rather than the tag names, so a
 * body that starts at <h3> numbers the same as one that starts at <h1> — pasted
 * content keeps whatever level it arrived with. The replace callback runs in
 * document order, which is what the counter stack relies on.
 *
 * `usedIds` is shared across every section on the page (seeded with the section
 * slugs) so two identically-titled headings can't collide. Ids derive from the
 * heading text and fall back to the number when the text has no usable
 * characters — so an admin who rewords a heading does change its anchor, exactly
 * as GitHub behaves; section-level anchors are the stable ones.
 *
 * Call this AFTER toDisplayHtml(): the sanitizer allows neither `class` nor `id`
 * attributes, so decorating first would strip everything this adds back off.
 *
 * Returns the decorated HTML plus the headings it numbered, so the print-only
 * table of contents can be built from the very same ids and numbers rather than
 * re-deriving them.
 */
export function decorateWikiHeadings(
  html: string,
  opts: { number: string; slug: string; usedIds: Set<string>; linkLabel: string }
): { html: string; entries: WikiTocEntry[] } {
  if (!html) return { html: "", entries: [] };
  const { number: prefix, slug, usedIds, linkLabel } = opts;
  const levels: number[] = [];   // heading level at each depth
  const counters: number[] = []; // running count at each depth
  const entries: WikiTocEntry[] = [];

  const decorated = html.replace(
    /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/gi,
    (_match, lvl: string, attrs: string, inner: string) => {
      const level = Number(lvl);
      while (levels.length > 0 && levels[levels.length - 1] > level) {
        levels.pop();
        counters.pop();
      }
      if (levels.length > 0 && levels[levels.length - 1] === level) {
        counters[counters.length - 1] += 1;
      } else {
        levels.push(level);
        counters.push(1);
      }
      const number = `${prefix}.${counters.join(".")}`;

      // Heading text → slug. Empty/symbol-only headings fall back to the number.
      const title = headingText(inner);
      const text = anchorSlug(title);
      const id = uniqueId(`${slug}-${text || number.replace(/\./g, "-")}`, usedIds);

      // +1 because the Guide section itself is level 1.
      entries.push({ id, number, title, level: counters.length + 1 });

      const numSpan = `<span class="wiki-num">${number}</span>`;
      const anchor =
        `<a class="wiki-anchor" href="#${escapeAttr(id)}" ` +
        `aria-label="${escapeAttr(linkLabel)}" title="${escapeAttr(linkLabel)}">${LINK_ICON_SVG}</a>`;
      return `<h${lvl} id="${escapeAttr(id)}"${attrs}>${numSpan}${inner}${anchor}</h${lvl}>`;
    }
  );

  return { html: decorated, entries };
}
