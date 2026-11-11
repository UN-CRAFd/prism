// Project classification columns that only CRAF'd admins may see or set. Partners
// never receive them from the API (stripped on read) and their writes are ignored.
export const ADMIN_ONLY_CLASSIFICATION_FIELDS = [
  "allocation_modality", "investment_type", "investment_theme",
] as const;

/** Remove the admin-only classification fields from a project row. */
export function stripAdminOnlyProjectFields<T extends Record<string, unknown>>(row: T): T {
  const copy: Record<string, unknown> = { ...row };
  for (const f of ADMIN_ONLY_CLASSIFICATION_FIELDS) delete copy[f];
  return copy as T;
}
