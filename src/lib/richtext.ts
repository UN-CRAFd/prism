// Helpers for the lightweight rich-text fields (narratives, project description).
//
// Content is stored as HTML in the same TEXT columns that previously held plain
// text. Legacy rows are plain text with newlines, so both the editor and every
// renderer must cope with either shape — `looksLikeHtml` decides which, and
// `toDisplayHtml` normalises to renderable HTML in both cases.

const HTML_TAG = /<(p|br|ul|ol|li|strong|em|b|i|u|a|div|span|h[1-6])\b/i;

/** True when a stored string is HTML produced by the editor (vs legacy plain text). */
export function looksLikeHtml(value: string): boolean {
  return HTML_TAG.test(value);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Normalise a stored value to HTML safe to drop into an element. HTML passes
 * through untouched; legacy plain text is escaped and its blank-line/newline
 * structure turned into paragraphs and <br>s so it reads the same as before.
 */
export function toDisplayHtml(value: string | null | undefined): string {
  if (!value) return "";
  if (looksLikeHtml(value)) return value;
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>")}</p>`)
    .join("");
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
