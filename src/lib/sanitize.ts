import sanitizeHtml from "sanitize-html";

// ─────────────────────────────────────────────────────────────────────────────
// Server-side sanitizer for the lightweight rich-text fields (project narratives,
// project description). The values are stored as HTML and later rendered via
// dangerouslySetInnerHTML / a contentEditable surface, so they MUST be sanitized
// on the way IN — the client RichTextEditor is not a trust boundary (an attacker
// can POST arbitrary HTML straight to the API). This is Node-only (pulls in a DOM
// parser), so it must be imported from route handlers, never from a client module
// such as lib/richtext.ts.
//
// The allowlist mirrors exactly the tags the editor can produce (see the HTML_TAG
// set in lib/richtext.ts). Everything else — <script>, <iframe>, style/on* event
// handlers, javascript: URLs — is discarded.
// ─────────────────────────────────────────────────────────────────────────────

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p", "br", "ul", "ol", "li",
    "strong", "em", "b", "i", "u",
    "a", "div", "span",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "table", "thead", "tbody", "tr", "th", "td",
  ],
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  // Force links to open safely and drop referrer/opener access.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer nofollow" }),
  },
  disallowedTagsMode: "discard",
};

/**
 * Sanitize a stored rich-text value. `null`/`undefined` pass through unchanged so
 * callers can keep their "clear the field" semantics.
 */
export function sanitizeRichText(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return sanitizeHtml(value, OPTIONS);
}

// Pattern that wiki-embedded image srcs must match. Only our own served images
// are allowed; any other src (external URLs, data: URIs, etc.) are dropped.
const WIKI_IMG_SRC = /^\/api\/wiki-images\/\d+$/;

const WIKI_OPTIONS: sanitizeHtml.IOptions = {
  ...OPTIONS,
  allowedTags: [...(Array.isArray(OPTIONS.allowedTags) ? OPTIONS.allowedTags : []), "img"],
  allowedAttributes: {
    ...OPTIONS.allowedAttributes,
    img: ["src", "alt"],
  },
  // Drop any <img> whose src does not point at our own wiki-images API.
  exclusiveFilter: (frame) => {
    if (frame.tag === "img") {
      return !WIKI_IMG_SRC.test(frame.attribs.src ?? "");
    }
    return false;
  },
};

/**
 * Like sanitizeRichText but additionally allows <img src="/api/wiki-images/N" alt="…">.
 * Use only for wiki section body_html; never for ProDoc/report rich-text fields.
 */
export function sanitizeWikiHtml(value: string | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return sanitizeHtml(value, WIKI_OPTIONS);
}
