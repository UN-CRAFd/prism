// ─────────────────────────────────────────────────────────────────────────────
// Strict image handling for uploads (testimonial photos, wiki images).
//
// The file name and the browser-declared type are both chosen by the uploader,
// so neither is trusted. An upload is accepted only if its first bytes are the
// signature of a real PNG, JPEG, WebP (or GIF, where allowed) — an HTML or SVG
// file renamed to photo.png is rejected. The detected type is what gets stored
// and what is sent back when the file is served.
//
// Serving always pins the content type to an image type from the allowlist and
// adds `nosniff` plus a sandboxing CSP, so even a file stored before this check
// existed can never be rendered as a web page on the platform's origin.
// ─────────────────────────────────────────────────────────────────────────────

import { contentDisposition } from "@/lib/content-disposition";

export type ImageType ="image/png" | "image/jpeg" | "image/webp" | "image/gif";

const SAFE_TYPES: readonly ImageType[] = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** The real image type of `buf`, read from its magic bytes, or null. */
export function detectImageType(buf: Uint8Array): ImageType | null {
  const b = (i: number) => buf[i];
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (b(0) === 0x89 && b(1) === 0x50 && b(2) === 0x4e && b(3) === 0x47 &&
      b(4) === 0x0d && b(5) === 0x0a && b(6) === 0x1a && b(7) === 0x0a) return "image/png";
  // JPEG: FF D8 FF
  if (b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff) return "image/jpeg";
  // WebP: "RIFF" .... "WEBP"
  if (b(0) === 0x52 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x46 &&
      b(8) === 0x57 && b(9) === 0x45 && b(10) === 0x42 && b(11) === 0x50) return "image/webp";
  // GIF: "GIF87a" / "GIF89a"
  if (b(0) === 0x47 && b(1) === 0x49 && b(2) === 0x46 && b(3) === 0x38 &&
      (b(4) === 0x37 || b(4) === 0x39) && b(5) === 0x61) return "image/gif";
  return null;
}

/**
 * Check an uploaded file is a real image of an allowed type. Returns the
 * detected type to store, or an error message for the uploader.
 */
export function checkImageUpload(
  buf: Uint8Array,
  allowed: readonly ImageType[] = ["image/png", "image/jpeg", "image/webp"],
): { ok: true; type: ImageType } | { ok: false; error: string } {
  const type = detectImageType(buf);
  if (!type || !allowed.includes(type)) {
    const label: Record<ImageType, string> = {
      "image/png": "PNG", "image/jpeg": "JPEG", "image/webp": "WebP", "image/gif": "GIF",
    };
    const names = allowed.map((t) => label[t]);
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
    return { ok: false, error: `This file is not a valid image. Please upload a ${list} file.` };
  }
  return { ok: true, type };
}

/**
 * Response headers for serving a stored image. A stored type outside the image
 * allowlist (e.g. a legacy row) is served as a download, never inline.
 */
export function imageResponseHeaders(
  storedType: string | null | undefined,
  disposition: { inline: boolean; fileName: string },
  size: number,
): Record<string, string> {
  const safe = (SAFE_TYPES as readonly string[]).includes(storedType ?? "") ? (storedType as string) : null;
  const mode = safe && disposition.inline ? "inline" : "attachment";
  return {
    "Content-Type": safe ?? "application/octet-stream",
    "Content-Disposition": contentDisposition(mode, disposition.fileName || "image"),
    "Content-Length": String(size),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
  };
}
