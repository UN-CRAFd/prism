import labels from "@/lib/labels";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import { PROJECT_UPDATE_SECTIONS, type ProjectUpdateSection } from "@/lib/project-updates";
import {
  UPDATE_MODULE_GROUPS,
  UPDATE_MODULES,
  isAddOn,
  moduleLabel,
  type UpdateModule,
} from "@/lib/update-modules";

// ─────────────────────────────────────────────────────────────────────────────
// The pages a project update shows its partner.
//
// One page per module group in the matrix. Which pages an update has follows
// from its selected modules — `unlocked_sections` is just those modules mapped
// through UpdateModule.section (see modulesToSections) — so ticking a column in
// the matrix is what creates the partner's tabs.
//
// VARIANTS. A page is not always the same page. The add-on rows under a group
// (Work Plan "+ extended time frame", Expenditure "+ proposed new budget", …)
// select a VERSION of that single page: with an NCE in the mix the work plan
// needs its extra months columns, with a budget revision the expenditure page
// needs the proposed-new-budget columns. `sectionVariant` resolves which add-ons
// are live for a page so the page can render the right version of itself.
//
// Sections render from this list rather than REPORT_SECTIONS because two of them
// — Justification and HACT Recommendations — exist only on updates.
// ─────────────────────────────────────────────────────────────────────────────

export interface UpdateSection {
  /** URL segment and `unlocked_sections` key. */
  value: ProjectUpdateSection;
  /** Tab label. A getter so admin label overrides apply live, as elsewhere. */
  readonly label: string;
  /** The matrix group that produces this page. */
  group: string;
  /** Every module that maps here, base row first. */
  modules: UpdateModule[];
}

function groupFor(section: ProjectUpdateSection) {
  return UPDATE_MODULE_GROUPS.find((g) => g.modules.some((m) => m.section === section));
}

export const UPDATE_SECTIONS: UpdateSection[] = PROJECT_UPDATE_SECTIONS.map((value) => {
  const group = groupFor(value);
  return {
    value,
    get label() {
      // Most update pages are the annual report's own sections, so take their
      // label from there — that keeps the two in step and picks up admin label
      // overrides. The update-only pages fall back to the labels registry, then
      // to the matrix group name.
      return (
        REPORT_SECTIONS.find((s) => s.value === value)?.label ??
        (labels.sections as Record<string, string>)[value] ??
        group?.label ??
        value
      );
    },
    group: group?.label ?? value,
    modules: UPDATE_MODULES.filter((m) => m.section === value),
  };
});

export function updateSection(value: string): UpdateSection | undefined {
  return UPDATE_SECTIONS.find((s) => s.value === value);
}

/** Which version of a page to render, given the update's selected modules. */
export interface UpdateSectionVariant {
  section: string;
  /** Selected modules that map to this page, base row first. */
  modules: string[];
  /** The selected add-ons only — what makes this version differ from the plain one. */
  addOns: string[];
  /** True when that module is selected for this update. */
  has: (moduleKey: string) => boolean;
  /** Human-readable version name, e.g. "Work Plan + extended time frame by 6 months". */
  describe: (months?: number | null) => string;
}

/** Resolve the variant of `section` for an update carrying `selectedModules`. */
export function sectionVariant(section: string, selectedModules: string[]): UpdateSectionVariant {
  const chosen = new Set(selectedModules);
  const modules = UPDATE_MODULES.filter((m) => m.section === section && chosen.has(m.value)).map(
    (m) => m.value
  );
  const addOns = modules.filter(isAddOn);
  return {
    section,
    modules,
    addOns,
    has: (moduleKey) => modules.includes(moduleKey),
    describe: (months) => {
      const base = updateSection(section)?.group ?? section;
      if (addOns.length === 0) return base;
      // moduleLabel already qualifies an add-on with its group and fills in the
      // months figure, so strip the repeated group name off the extras.
      const extras = addOns.map((key) =>
        moduleLabel(key, months).replace(`${base} `, "")
      );
      return `${base} ${extras.join(" ")}`;
    },
  };
}
