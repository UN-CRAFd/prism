// ─────────────────────────────────────────────────────────────────────────────
// Content-Disposition for file downloads, safe for ANY file name.
//
// HTTP headers may only carry Latin-1 text: a raw Arabic, Chinese or em-dash
// file name makes the header invalid and the download fails with an error. So
// every download sends two names (RFC 6266 / RFC 5987):
//   filename="…"           an ASCII stand-in for very old clients
//   filename*=UTF-8''…     the real name, percent-encoded — what every current
//                          browser uses, so the file keeps its original name
// Quotes, backslashes and control characters (CR/LF) never reach the header.
// ─────────────────────────────────────────────────────────────────────────────

export function contentDisposition(mode: "inline" | "attachment", fileName: string | null | undefined): string {
  const raw = (fileName ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim() || "download";
  const ext = raw.includes(".") ? raw.slice(raw.lastIndexOf(".")) : "";
  // ASCII stand-in: non-ASCII → "_", and never empty before the extension.
  let ascii = raw.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "").trim();
  if (!ascii.replace(/[_.\s]/g, "")) ascii = `download${/^[.\w-]+$/.test(ext) ? ext : ""}`;
  // encodeURIComponent leaves ' ( ) * unescaped, which RFC 5987 does not allow.
  const encoded = encodeURIComponent(raw).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
