import labels from "@/lib/labels";
import { REPORT_SECTIONS, type ReportSectionGroup } from "@/lib/report-sections";
import { PROJECT_UPDATE_SECTIONS, type ProjectUpdateSection } from "@/lib/project-updates";
import {
  UPDATE_MODULE_GROUPS,
  UPDATE_MODULES,
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
// carries extra quarter columns, with a budget revision the expenditure page
// carries the new-requested-budget columns. Each page resolves its own version
// server-side — /api/workplan and /api/expenditure read the update's modules
// and hand the page what it needs — so there is nothing to resolve here, and
// no banner announcing it: the page shows its version by being it.
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
  /** Qualitative or Quantitative — the halves an annual report splits into, and
   *  which an update now splits into as well. */
  kind: ReportSectionGroup;
  /** Every module that maps here, base row first. */
  modules: UpdateModule[];
}

function groupFor(section: ProjectUpdateSection) {
  return UPDATE_MODULE_GROUPS.find((g) => g.modules.some((m) => m.section === section));
}

// Most update pages ARE annual-report sections, so they take their half from
// there and can never drift from it. The two update-only pages are placed by
// hand: Justification is the narrative reason for the update, and HACT
// Recommendations belongs with Risk Management, which it accompanies.
const UPDATE_ONLY_KIND: Record<string, ReportSectionGroup> = {
  justification: "Qualitative",
  hact: "Quantitative",
};

function kindFor(section: ProjectUpdateSection): ReportSectionGroup {
  return (
    REPORT_SECTIONS.find((s) => s.value === section)?.group ??
    UPDATE_ONLY_KIND[section] ??
    "Quantitative"
  );
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
    kind: kindFor(value),
    modules: UPDATE_MODULES.filter((m) => m.section === value),
  };
});

export function updateSection(value: string): UpdateSection | undefined {
  return UPDATE_SECTIONS.find((s) => s.value === value);
}

/** The given update pages split into their Qualitative / Quantitative halves,
 *  in that order, for the editor's tab bar and the partner sidebar. Pass the
 *  pages this update actually has: a half with nothing in it is dropped, so an
 *  update of purely quantitative pages shows one group rather than an empty
 *  heading. */
export function updateSectionGroups(
  sections: UpdateSection[]
): { label: ReportSectionGroup; sections: UpdateSection[] }[] {
  return (["Qualitative", "Quantitative"] as const)
    .map((label) => ({ label, sections: sections.filter((s) => s.kind === label) }))
    .filter((g) => g.sections.length > 0);
}
