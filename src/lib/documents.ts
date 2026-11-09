// Single source of truth for the project-documents (annexes) feature: the fixed
// Document-type list, the allowed upload extensions, and the size cap. Shared by
// the API route (validation) and the editor UI (dropdown + accept attribute).
// The app stores file bytes in a Postgres bytea column with no external blob
// store, so uploads are deliberately capped small.

import { optionValues } from "@/lib/options";

// Document types are admin-editable (Settings → Dropdown options); read live.
export function documentTypes(): string[] {
  return optionValues("documentType");
}

export type DocumentType = string;

/** Whether `value` is one of the currently-configured document types. */
export function isDocumentType(value: string): boolean {
  return documentTypes().includes(value);
}

// Allowed file extensions (lower-case, no dot). An upload must have one of these
// AND content that matches it (checkDocumentUpload below); the browser-reported
// MIME type is ignored, as browsers/OSes report it inconsistently.
export const ALLOWED_DOC_EXTENSIONS = [
  "pdf",
  "doc", "docx",
  "xls", "xlsx",
  "ppt", "pptx",
  "csv",
  "txt",
  "png", "jpg", "jpeg",
] as const;

// The `accept` attribute for the <input type="file">.
export const DOC_ACCEPT = ALLOWED_DOC_EXTENSIONS.map((e) => `.${e}`).join(",");

// Max upload size. Bytes live in the DB, so keep this modest.
export const MAX_DOC_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOC_MB = MAX_DOC_BYTES / (1024 * 1024);

/** Lower-case extension (without the dot) of a file name, or "" if none. */
export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function isAllowedDocExtension(name: string): boolean {
  return (ALLOWED_DOC_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

// The content type a document is stored and served with — derived from its
// (allowlisted) extension, never from what the uploader's browser claimed.
const DOC_MIME: Record<(typeof ALLOWED_DOC_EXTENSIONS)[number], string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

/** Content type for a stored document, from its file name (octet-stream if unknown). */
export function documentMimeType(fileName: string): string {
  return (DOC_MIME as Record<string, string>)[fileExtension(fileName)] ?? "application/octet-stream";
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((v, i) => b[at + i] === v);
const ZIP = [0x50, 0x4b, 0x03, 0x04];                          // docx / xlsx / pptx
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];  // doc / xls / ppt (Office 97–2003)

/**
 * Check an uploaded document: allowed extension AND content that really is
 * that kind of file (a renamed web page or program is rejected). Returns the
 * content type to store, or an error message for the uploader.
 */
export function checkDocumentUpload(
  fileName: string,
  b: Uint8Array,
): { ok: true; mimeType: string } | { ok: false; error: string } {
  const ext = fileExtension(fileName);
  if (!isAllowedDocExtension(fileName)) {
    return { ok: false, error: `That file type is not allowed. Allowed: ${ALLOWED_DOC_EXTENSIONS.join(", ")}.` };
  }
  let valid: boolean;
  switch (ext) {
    case "pdf": valid = startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]); break; // %PDF-
    case "docx": case "xlsx": case "pptx": valid = startsWith(b, ZIP); break;
    case "doc": case "xls": case "ppt": valid = startsWith(b, OLE); break;
    case "png": valid = startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); break;
    case "jpg": case "jpeg": valid = startsWith(b, [0xff, 0xd8, 0xff]); break;
    case "csv": case "txt": {
      // Plain text: no NUL bytes (binary files have them) in the first 8 KB.
      const head = b.subarray(0, 8192);
      valid = !head.includes(0);
      break;
    }
    default: valid = false;
  }
  if (!valid) {
    return { ok: false, error: `This file's content does not match its .${ext} extension. Please upload the original file.` };
  }
  return { ok: true, mimeType: documentMimeType(fileName) };
}

/** Human-readable file size, e.g. "2.4 MB" / "812 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Image uploads (testimonial photos) ──────────────────────────────────────
// Photos are stored as bytes on the testimonials row (same bytea mechanism as
// documents) and served back as an <img>. Images only, capped smaller than docs.

export const ALLOWED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp"] as const;

// Wiki images additionally allow GIF (used as animated screenshots / diagrams).
export const ALLOWED_WIKI_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp"] as const;

export function isAllowedWikiImageExtension(name: string): boolean {
  return (ALLOWED_WIKI_IMAGE_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

/** The `accept` attribute for an image <input type="file">. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_EXTENSIONS.map((e) => `.${e}`).join(",");

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTO_MB = MAX_PHOTO_BYTES / (1024 * 1024);

export function isAllowedImageExtension(name: string): boolean {
  return (ALLOWED_IMAGE_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}
