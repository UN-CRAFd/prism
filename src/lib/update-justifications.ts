import { UPDATE_TYPES, updateTypeLabel } from "@/lib/update-modules";

// ─────────────────────────────────────────────────────────────────────────────
// Justifications: why the partner is applying for each update type.
//
// One field per type the update covers, so a combined document explains its no
// cost extension separately from its budget revision. An update with no stored
// types — one created before the module matrix, or before the migration that
// persists them — gets a single general field under GENERAL_JUSTIFICATION_KEY.
// ─────────────────────────────────────────────────────────────────────────────

export const GENERAL_JUSTIFICATION_KEY = "general";

// An update can stand in for a periodic report, or it can carry a change the
// partner is asking for. Only the latter gets justified: nobody applies for an
// annual report, it simply falls due.
const PERIODIC_TYPES = ["annual_report", "final_report"];

/** Valid `update_type` values for a justification row. */
export function isJustificationKey(key: string): boolean {
  return key === GENERAL_JUSTIFICATION_KEY || UPDATE_TYPES.some((t) => t.value === key);
}

/** The fields the Justification page should show, in matrix column order. An
 *  update with nothing to apply for gets one general field instead. */
export function justificationFields(updateTypes: string[] | null | undefined): string[] {
  const applied = UPDATE_TYPES.filter(
    (t) => (updateTypes ?? []).includes(t.value) && !PERIODIC_TYPES.includes(t.value)
  ).map((t) => t.value);
  return applied.length > 0 ? applied : [GENERAL_JUSTIFICATION_KEY];
}

/** The question put to the partner for one field. */
export function justificationPrompt(key: string): string {
  if (key === GENERAL_JUSTIFICATION_KEY) return "Why is this project update being submitted?";
  return `Why are you applying for a ${updateTypeLabel(key)}?`;
}

// ── Combined-document wording ────────────────────────────────────────────────

/** "Annual Report and No Cost Extension" — an English list of the types. The
 *  periodic report leads, since it is the document the others are folded into;
 *  the rest keep matrix column order. */
export function updateTypeList(updateTypes: string[] | null | undefined): string {
  const selected = UPDATE_TYPES.filter((t) => (updateTypes ?? []).includes(t.value));
  const names = [
    ...selected.filter((t) => PERIODIC_TYPES.includes(t.value)),
    ...selected.filter((t) => !PERIODIC_TYPES.includes(t.value)),
  ].map((t) => t.label);
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What the document consists of, for the Overview box — "It consists of your
 *  Annual Report, Budget Revision and No Cost Extension, combined into one
 *  document." Null when the update has no stored types and there is nothing to
 *  say (updates created before the module matrix). */
export function combinedUpdateNote(updateTypes: string[] | null | undefined): string | null {
  const count = (updateTypes ?? []).filter((t) => UPDATE_TYPES.some((u) => u.value === t)).length;
  if (count === 0) return null;
  const list = updateTypeList(updateTypes);
  return count === 1
    ? `It consists of your ${list}.`
    : `It consists of your ${list}, combined into one document.`;
}
