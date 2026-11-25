// Word counting for the word limits. Safe on the server and in the browser (no DOM).
//
// Words = the plain text (HTML stripped, for rich-text values) split on whitespace,
// empty tokens ignored. Block-level tags and <br> count as whitespace, so
// "<p>one</p><p>two</p>" is two words; inline tags (<b>, <a>, …) do not split a word.

const BLOCK_BREAK = /<\/?(?:p|div|li|ul|ol|br|h[1-6]|tr|td|th|table|thead|tbody|blockquote|pre|hr)\b[^>]*>/gi;
const ANY_TAG = /<[^>]*>/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&");
}

/** Plain text of a (possibly HTML) value. */
function plainText(value: string): string {
  // Only strip when it looks like markup, so a plain-text "a < b" is left alone.
  if (!/<\/?[a-z][^>]*>/i.test(value)) return value;
  return decodeEntities(value.replace(BLOCK_BREAK, " ").replace(ANY_TAG, ""));
}

export function wordCount(value: string | null | undefined): number {
  if (!value) return 0;
  return plainText(value).split(/\s+/).filter(Boolean).length;
}
