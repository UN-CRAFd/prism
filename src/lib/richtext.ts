// Helpers for the lightweight rich-text fields (narratives, project description).
//
// Content is stored as HTML in the same TEXT columns that previously held plain
// text. Legacy rows are plain text with newlines, so both the editor and every
// renderer must cope with either shape — `looksLikeHtml` decides which, and
// `toDisplayHtml` normalises to renderable HTML in both cases.

import DOMPurify from "dompurify";

const HTML_TAG = /<(p|br|ul|ol|li|strong|em|b|i|u|a|div|span|h[1-6]|table|thead|tbody|tr|th|td)\b/i;

// Allowlist mirrors the server-side sanitizer (lib/sanitize.ts) and the editor's
// tag set. Kept in sync deliberately — both are the same trust boundary.
const ALLOWED_TAGS = [
  "p", "br", "ul", "ol", "li",
  "strong", "em", "b", "i", "u",
  "a", "div", "span",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "table", "thead", "tbody", "tr", "th", "td",
];
const ALLOWED_ATTR = ["href", "title", "target", "rel"];

// Wiki variant: same allowlist plus <img> restricted to our own served URLs.
const WIKI_ALLOWED_TAGS = [...ALLOWED_TAGS, "img"];
const WIKI_ALLOWED_ATTR = [...ALLOWED_ATTR, "src", "alt"];
const WIKI_IMG_SRC_RE = /^\/api\/wiki-images\/\d+$/;

/**
 * Sanitize stored HTML before it is dropped into the DOM via
 * dangerouslySetInnerHTML. This is defense-in-depth: writes are already
 * sanitized server-side (lib/sanitize.ts), but rows created before that fix — or
 * any path that bypassed it — could still hold hostile markup. DOMPurify needs a
 * DOM, so on the server (no `window`) we pass the value through unchanged and
 * rely on the write-side sanitizer; the browser then re-sanitizes on render.
 */
function sanitizeDisplayHtml(html: string): string {
  if (typeof window === "undefined") return html;
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

/** True when a stored string is HTML produced by the editor (vs legacy plain text). */
export function looksLikeHtml(value: string): boolean {
  return HTML_TAG.test(value);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeWikiDisplayHtml(html: string): string {
  if (typeof window === "undefined") return html;
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: WIKI_ALLOWED_TAGS,
    ALLOWED_ATTR: WIKI_ALLOWED_ATTR,
  });
  // DOMPurify has no per-tag src restrictions, so strip any <img> whose src
  // is not our own wiki-images API URL (defense-in-depth on top of DOMPurify).
  return sanitized.replace(/<img\b[^>]*\/?>/gi, (tag) => {
    const m = /\bsrc="([^"]*)"/.exec(tag);
    return m && WIKI_IMG_SRC_RE.test(m[1]) ? tag : "";
  });
}

/**
 * Like toDisplayHtml but additionally preserves <img src="/api/wiki-images/N">.
 * Use for wiki section bodies; never for ProDoc/report fields.
 */
export function toWikiDisplayHtml(value: string | null | undefined): string {
  if (!value) return "";
  if (looksLikeHtml(value)) return sanitizeWikiDisplayHtml(value);
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Normalise a stored value to HTML safe to drop into an element. HTML passes
 * through untouched; legacy plain text is escaped and its blank-line/newline
 * structure turned into paragraphs and <br>s so it reads the same as before.
 */
export function toDisplayHtml(value: string | null | undefined): string {
  if (!value) return "";
  if (looksLikeHtml(value)) return sanitizeDisplayHtml(value);
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Convert a stored rich-text value to plain text, safe for CSV or plain
 * display. Works server-side (no document/window required).
 */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return "";
  if (!looksLikeHtml(value)) return value;
  const text = value
    .replace(/<\/(p|div|li)>|<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

/** Plain-text length of a rich value, for character counters. */
export function richTextLength(value: string | null | undefined): number {
  if (!value) return 0;
  if (!looksLikeHtml(value)) return value.length;
  if (typeof document !== "undefined") {
    const el = document.createElement("div");
    el.innerHTML = value;
    return (el.textContent ?? "").length;
  }
  // Server fallback: strip tags coarsely.
  return value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").length;
}
