import { UPDATE_TYPES, updateTypeLabel } from "@/lib/update-modules";

// ─────────────────────────────────────────────────────────────────────────────
// Justification: why the partner is applying for this update.
//
// ONE field, whatever the document covers. A combined Budget Revision +
// Reprogramming is one request made for one set of reasons, so the question put
// to the partner names every type at once — "Why are you applying for a Budget
// Revision and Reprogramming?" — rather than splitting it into boxes that would
// invite the same answer twice.
//
// The single answer is stored under GENERAL_JUSTIFICATION_KEY. Per-type rows
// written by the earlier one-field-per-type page are still accepted by the API
// (and read back into the one field, see the Justification page) so nothing
// already typed is lost.
// ─────────────────────────────────────────────────────────────────────────────

export const GENERAL_JUSTIFICATION_KEY = "general";

// An update can stand in for a periodic report, or it can carry a change the
// partner is asking for. Only the latter is justified: nobody applies for an
// annual report, it simply falls due.
const PERIODIC_TYPES = ["annual_report", "final_report"];

/** Valid `update_type` values for a justification row. Type keys stay valid for
 *  the rows the per-type page wrote; new answers all go to the general key. */
export function isJustificationKey(key: string): boolean {
  return key === GENERAL_JUSTIFICATION_KEY || UPDATE_TYPES.some((t) => t.value === key);
}

/** The types this update actually applies for, in matrix column order — the
 *  periodic reports dropped, since they are not applied for. */
export function appliedTypes(updateTypes: string[] | null | undefined): string[] {
  return UPDATE_TYPES.filter(
    (t) => (updateTypes ?? []).includes(t.value) && !PERIODIC_TYPES.includes(t.value)
  ).map((t) => t.value);
}

/** The one question put to the partner, naming every type being applied for. */
export function justificationPrompt(updateTypes: string[] | null | undefined): string {
  const applied = appliedTypes(updateTypes);
  if (applied.length === 0) return "Why is this project update being submitted?";
  return `Why are you applying for a ${formatList(applied.map(updateTypeLabel))}?`;
}

// ── Combined-document wording ────────────────────────────────────────────────

/** "A, B and C" — an English list. */
function formatList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** "Annual Report and No Cost Extension" — an English list of the types. The
 *  periodic report leads, since it is the document the others are folded into;
 *  the rest keep matrix column order. */
export function updateTypeList(updateTypes: string[] | null | undefined): string {
  const selected = UPDATE_TYPES.filter((t) => (updateTypes ?? []).includes(t.value));
  const names = [
    ...selected.filter((t) => PERIODIC_TYPES.includes(t.value)),
    ...selected.filter((t) => !PERIODIC_TYPES.includes(t.value)),
  ].map((t) => t.label);
  return formatList(names);
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
