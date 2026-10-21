import { ALWAYS_UPDATE_SECTIONS, PROJECT_UPDATE_SECTIONS } from "@/lib/project-updates";

// ─────────────────────────────────────────────────────────────────────────────
// The project-update module matrix.
//
// A project update is modular: the admin picks one or more UPDATE TYPES (the
// matrix columns — budget revision, no cost extension, …) and one or more
// MODULES (the rows). The union of the chosen modules is what the partner fills
// in, so several kinds of update combine into a single document.
//
// Which modules a given type REQUIRES is admin-authored, not hard-coded: the
// ticks in the matrix. DEFAULT_UPDATE_REQUIREMENTS below is only the starting
// point shipped with the app; admins override it via "Update category
// requirements" (persisted in app_settings, see lib/update-requirements.ts).
//
// Modules map onto report-editor sections so the existing editor/sidebar keeps
// working unchanged — `unlocked_sections` is DERIVED from the chosen modules
// (see modulesToSections). Every module now maps to a page; `section: null` is
// still allowed for a module added before its page exists.
//
// BASE ROWS AND ADD-ONS. Work Plan and Expenditure each have sub-categories, and
// those are ADDITIVE: they are extras layered on the base row, not alternatives
// to it. So several can apply at once — if the mix calls for both a proposed new
// budget and an extended time frame, Expenditure ends up with all three boxes
// ticked: the general "actual spending" row plus both add-ons. Every row in a
// group points at the same editor section, so this never produces more than one
// Work Plan or Expenditure tab. An add-on always implies its base row.
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateType {
  /** Stored value — the matrix column key. */
  value: string;
  /** Column header shown in the matrix. */
  label: string;
  /** Abbreviation used where the full label will not fit. */
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

export interface UpdateModule {
  /** Stored value — the matrix row key. */
  value: string;
  /** Row label shown in the matrix. Add-on rows read as "+ …". */
  label: string;
  /** Report-editor section this module unlocks, or null if it has no tab yet. */
  section: (typeof PROJECT_UPDATE_SECTIONS)[number] | null;
}

export interface UpdateModuleGroup {
  /** The parent module name (Work Plan, Expenditure, …). */
  label: string;
  /** The base row first, then its add-ons. A group of one renders flat. */
  modules: UpdateModule[];
}

// Rows follow the annual report's tab order, so an update assembled from these
// reads in the same sequence a reporter already knows. The two update-only
// groups are slotted in: Justification leads, HACT Recommendations sits with
// Risk Management, which it accompanies on a tranche release.
//
// `overview` has no row — it carries the project details and the authorization
// and is on every update unconditionally (see ALWAYS_UPDATE_SECTIONS).
export const UPDATE_MODULE_GROUPS: UpdateModuleGroup[] = [
  {
    label: "Justification",
    modules: [
      { value: "justification", label: "Justification", section: "justification" },
    ],
  },
  {
    label: "Surveys",
    modules: [{ value: "surveys", label: "Surveys", section: "surveys" }],
  },
  {
    label: "Key Achievements",
    modules: [{ value: "achievements", label: "Key Achievements", section: "achievements" }],
  },
  {
    label: "Partnerships",
    modules: [{ value: "partnerships", label: "Partnerships", section: "partnerships" }],
  },
  {
    label: "Results",
    modules: [{ value: "results", label: "Results", section: "results" }],
  },
  {
    label: "Lessons Learned",
    modules: [{ value: "lessons", label: "Lessons Learned", section: "lessons" }],
  },
  {
    label: "External Coverage",
    modules: [
      { value: "external_coverage", label: "External Coverage", section: "external-coverage" },
    ],
  },
  {
    label: "Testimonials",
    modules: [{ value: "testimonials", label: "Testimonials", section: "testimonials" }],
  },
  {
    label: "Work Plan",
    modules: [
      { value: "workplan",        label: "Work Plan",                            section: "workplan" },
      { value: "workplan_months", label: "+ extended time frame by {months} months",   section: "workplan" },
    ],
  },
  {
    label: "Indicators",
    modules: [{ value: "indicators", label: "Indicators", section: "indicators" }],
  },
  {
    label: "Expenditure",
    modules: [
      { value: "expenditure",        label: "Expenditure (actual spending)",      section: "expenditure" },
      { value: "expenditure_budget", label: "+ proposed new budget",              section: "expenditure" },
      { value: "expenditure_months", label: "+ extended time frame by {months} months", section: "expenditure" },
    ],
  },
  {
    label: "HACT Recommendations",
    modules: [
      { value: "hact", label: "HACT Recommendations", section: "hact" },
    ],
  },
  {
    label: "Risk Management",
    modules: [
      { value: "risk_management", label: "Risk management", section: "risk" },
    ],
  },
  {
    label: "Transfers",
    modules: [{ value: "transfers", label: "Transfers", section: "transfers" }],
  },
  {
    label: "Complementary Funding",
    modules: [
      { value: "complementary", label: "Complementary Funding", section: "complementary" },
    ],
  },
];

/** Every module, flattened in matrix row order. */
export const UPDATE_MODULES: UpdateModule[] = UPDATE_MODULE_GROUPS.flatMap((g) => g.modules);

/** A requirements map: update type → the module keys that type requires. */
export type UpdateRequirements = Record<string, string[]>;

// Shipped defaults. Admin-editable via the "Update category requirements" editor
// — treat these as a first guess, not policy.
//
// Each column ticks the base rows it needs plus any add-on it brings: Budget
// Revision adds the proposed new budget, No Cost Extension the extended time
// frame. Selecting both columns therefore ticks both add-ons alongside the
// general rows, rather than one of them replacing the other.
//
// The Annual Report and Final Report columns tick the full set of report
// sections, since an update standing in for one of those carries everything a
// report would. The narrower types tick only what they need.
const FULL_REPORT_MODULES = [
  "surveys", "achievements", "partnerships", "results", "lessons",
  "external_coverage", "testimonials", "workplan", "indicators",
  "expenditure", "risk_management", "transfers", "complementary",
];

export const DEFAULT_UPDATE_REQUIREMENTS: UpdateRequirements = {
  budget_revision: ["justification", "workplan", "expenditure", "expenditure_budget"],
  nce:             ["justification", "workplan", "workplan_months", "expenditure", "expenditure_months"],
  tranche_release: ["justification", "workplan", "expenditure", "hact", "risk_management"],
  reprogramming:   ["justification", "workplan", "expenditure"],
  annual_report:   [...FULL_REPORT_MODULES],
  final_report:    [...FULL_REPORT_MODULES],
};

// ── Extension length ────────────────────────────────────────────────────────
// Rows whose label carries `{months}` render an inline numeric field there. All
// of them share ONE value, stored on the update as `update_months`: the length
// of the extension is a property of the update itself, not of each row, so
// typing it against the Work Plan row and against the Expenditure row can never
// disagree.

export const MONTHS_TOKEN = "{months}";
export const MIN_EXTENSION_MONTHS = 1;
export const MAX_EXTENSION_MONTHS = 120;

/** True when this row's label carries the inline months field. */
export function hasMonthsField(key: string): boolean {
  return (UPDATE_MODULES.find((m) => m.value === key)?.label ?? "").includes(MONTHS_TOKEN);
}

/** True when the selection includes a row that needs the months value. */
export function needsMonths(modules: string[]): boolean {
  return modules.some(hasMonthsField);
}

/** A whole number of months in range, or null for anything else (blank included). */
export function normaliseMonths(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value.trim()) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  return n >= MIN_EXTENSION_MONTHS && n <= MAX_EXTENSION_MONTHS ? n : null;
}

/** The months the update's extended-time-frame add-on adds to one page — the
 *  Work Plan grid and the Expenditure table each ask for their own section. 0
 *  unless that page's months add-on is selected, so the general version of a
 *  page is never extended by accident.
 *
 *  Months are as far as this module goes. What those months DO to a timeline is
 *  a calendar question — which quarter the new end date falls in, which years
 *  the longer project now covers — and is answered against the project's own
 *  dates by the DB helpers (see PROJECT_DATE_CALCULATION_STANDARD.md), never by
 *  dividing the figure here. */
export function sectionExtensionMonths(
  section: string,
  modules: string[] | null | undefined,
  months?: number | null
): number {
  const selected = new Set(normaliseModules(modules));
  const extended = UPDATE_MODULES.some(
    (m) => m.section === section && hasMonthsField(m.value) && selected.has(m.value)
  );
  return extended ? (normaliseMonths(months) ?? 0) : 0;
}

/** True when `modules` selects `moduleKey` (after normalisation, so an add-on
 *  pulls in its base row). Used to resolve which version of a page to render. */
export function hasModule(modules: string[] | null | undefined, moduleKey: string): boolean {
  return normaliseModules(modules).includes(moduleKey);
}

/** The group a module belongs to, or undefined for an unknown key. */
export function moduleGroupOf(key: string): UpdateModuleGroup | undefined {
  return UPDATE_MODULE_GROUPS.find((g) => g.modules.some((m) => m.value === key));
}

/** True when the module is an add-on (any row after its group's base row). */
export function isAddOn(key: string): boolean {
  const group = moduleGroupOf(key);
  return group !== undefined && group.modules[0].value !== key;
}

/** The base row an add-on hangs off, or undefined if `key` is itself a base. */
export function baseModuleOf(key: string): string | undefined {
  return isAddOn(key) ? moduleGroupOf(key)!.modules[0].value : undefined;
}

/** The add-ons belonging to a base row (empty for an add-on or a lone module). */
export function addOnsOf(key: string): string[] {
  const group = moduleGroupOf(key);
  if (!group || group.modules[0].value !== key) return [];
  return group.modules.slice(1).map((m) => m.value);
}

/** Row label for use OUTSIDE the matrix, where an add-on has no parent row above
 *  it to give it context: "Expenditure + proposed new budget". `months` fills the
 *  inline field's place in the text; without it the label reads "XX months". */
export function moduleLabel(key: string, months?: number | null): string {
  const entry = UPDATE_MODULES.find((m) => m.value === key);
  if (!entry) return key;
  const group = moduleGroupOf(key);
  const text = entry.label.replace(MONTHS_TOKEN, months != null ? String(months) : "XX");
  return isAddOn(key) && group ? `${group.label} ${text}` : text;
}

export function updateTypeLabel(key: string): string {
  return UPDATE_TYPES.find((t) => t.value === key)?.label ?? key;
}

/** The report-editor sections unlocked by a set of modules, in canonical tab
 *  order and de-duplicated. Modules with no section contribute nothing. Add-ons
 *  share their base row's section, so a group never yields a second tab. */
export function modulesToSections(modules: string[]): string[] {
  const wanted = new Set(
    modules
      .map((key) => UPDATE_MODULES.find((m) => m.value === key)?.section)
      .filter((s): s is (typeof PROJECT_UPDATE_SECTIONS)[number] => Boolean(s))
  );
  // Overview is on every update whatever was ticked: it carries the project
  // details and the authorization, so there is no row for it in the matrix.
  for (const always of ALWAYS_UPDATE_SECTIONS) wanted.add(always);
  return PROJECT_UPDATE_SECTIONS.filter((s) => wanted.has(s));
}

/** The union of the modules the given update types require, in matrix row order.
 *  Combining columns combines their add-ons — Budget Revision + No Cost Extension
 *  ticks the proposed-new-budget row AND the extended-time-frame row. */
export function requiredModulesFor(types: string[], requirements: UpdateRequirements): string[] {
  return normaliseModules(types.flatMap((t) => requirements[t] ?? []));
}

/** Drop unknown keys and duplicates, pull in the base row of every selected
 *  add-on (an add-on is meaningless without the row it extends), and return in
 *  matrix row order. */
export function normaliseModules(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(value.filter((v): v is string => typeof v === "string"));
  for (const key of [...seen]) {
    const base = baseModuleOf(key);
    if (base) seen.add(base);
  }
  return UPDATE_MODULES.filter((m) => seen.has(m.value)).map((m) => m.value);
}

/** Drop unknown keys and duplicates, and return in matrix column order. */
export function normaliseTypes(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set(value.filter((v): v is string => typeof v === "string"));
  return UPDATE_TYPES.filter((t) => seen.has(t.value)).map((t) => t.value);
}

/** Validate/clean a requirements map: known types only, known modules only. */
export function normaliseRequirements(value: unknown): UpdateRequirements {
  const out: UpdateRequirements = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const type of UPDATE_TYPES) {
    const raw = (value as Record<string, unknown>)[type.value];
    if (raw === undefined) continue;
    out[type.value] = normaliseModules(raw);
  }
  return out;
}
