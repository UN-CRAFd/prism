// The update types — the columns of the project-update module matrix (see
// lib/update-modules.ts). Kept dependency-free so lib/project-updates.ts can name
// updates after their types without an import cycle.

export interface UpdateType {
  /** Stored value — the matrix column key. */
  value: string;
  /** Column header shown in the matrix. */
  label: string;
  /** Abbreviation used where the full label will not fit, and in update names. */
  short: string;
}

// No Cost Extension sits next to Budget Revision because those two are the pair
// that most often combines, each contributing its own add-on row.
export const UPDATE_TYPES: UpdateType[] = [
  { value: "budget_revision",   label: "Budget Revision",   short: "BR" },
  { value: "nce",               label: "No Cost Extension", short: "NCE" },
  { value: "tranche_release",   label: "Tranche Release",   short: "TR" },
  { value: "reprogramming",     label: "Reprogramming",     short: "RP" },
  { value: "annual_report",     label: "Annual Report",     short: "AR" },
  { value: "final_report",      label: "Final Report",      short: "FR" },
];

export function updateTypeLabel(key: string): string {
  return UPDATE_TYPES.find((t) => t.value === key)?.label ?? key;
}

/** The abbreviation ("BR", "NCE", …) for places that list types as badges. */
export function updateTypeShort(key: string): string {
  return UPDATE_TYPES.find((t) => t.value === key)?.short ?? key;
}

/** An update's types as one code — "BR-TR-AR" — always in UPDATE_TYPES order, so
 *  the same mix of types yields the same code however it was ticked. */
export function updateTypesCode(types: string[] | null | undefined): string {
  const chosen = new Set(types ?? []);
  return UPDATE_TYPES.filter((t) => chosen.has(t.value)).map((t) => t.short).join("-");
}
