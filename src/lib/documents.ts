// Single source of truth for the project-documents (annexes) feature: the fixed
// Document-type list, the allowed upload extensions, and the size cap. Shared by
// the API route (validation) and the editor UI (dropdown + accept attribute).
// The app stores file bytes in a Postgres bytea column with no external blob
// store, so uploads are deliberately capped small.

export const DOCUMENT_TYPES = [
  "Annex",
  "Agreement / Contract",
  "Budget",
  "Logframe / Results Framework",
  "Report",
  "Correspondence",
  "Other",
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

// Allowed file extensions (lower-case, no dot). Validation is by extension — it
// is robust across browsers/OSes that report inconsistent MIME types.
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

/** Human-readable file size, e.g. "2.4 MB" / "812 KB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
