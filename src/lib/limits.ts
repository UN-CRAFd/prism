// Word limits. Every limited free-text field is registered here: key → label, the
// section it is listed under in Admin › Settings, and its default. Admin overrides are
// stored separately (app_settings "word_limits", see lib/word-limits.ts) and only for
// values that differ from these defaults. Words are counted with lib/word-count.ts.
//
// NOT limited: names / titles (partner_organization, person_name, person_title,
// risk_name, organization_name, contributor_name), photo caption / credits, URLs and
// comment replies.

export interface WordLimitDef {
  label: string;
  section: string;
  default: number;
}

export const MAX_WORD_LIMIT = 5_000;

export const SECTION_PRODOC_GENERAL = "ProDoc › General information";
export const SECTION_PRODOC_NARRATIVES = "ProDoc › Narratives";

/** Order the sections are listed in Admin › Settings. */
export const WORD_LIMIT_SECTIONS = [
  SECTION_PRODOC_GENERAL,
  SECTION_PRODOC_NARRATIVES,
  "Key achievements",
  "Partnerships",
  "Results",
  "Lessons learned",
  "External coverage",
  "Surveys",
  "Indicators",
  "Risk",
  "Work plan",
  "Expenditure",
  "Testimonials",
  "HACT",
  "Justification",
] as const;

const d = (label: string, section: string, def = 100): WordLimitDef => ({ label, section, default: def });

export const WORD_LIMITS: Record<string, WordLimitDef> = {
  // ProDoc
  "prodoc.description": d("Project description", SECTION_PRODOC_GENERAL, 500),
  "expenditure_budget_category_notes.description": d("Budget category description", SECTION_PRODOC_GENERAL, 200),

  // Report / project update fields
  "key_achievements.achievement": d("Achievement", "Key achievements"),
  "key_achievements.significance": d("Significance", "Key achievements"),
  "partnerships.result": d("Result of the partnership", "Partnerships"),
  "results.context": d("Context", "Results"),
  "results.data_driven_decision": d("Data-driven decision", "Results"),
  "results.resulting_impact": d("Resulting impact", "Results"),
  "lessons_learned.lesson_learned": d("Lesson learned", "Lessons learned"),
  "lessons_learned.adjustment_informed": d("Adjustment informed", "Lessons learned"),
  "external_coverage.description": d("Description", "External coverage"),
  "external_coverage.reach_indicator": d("Reach / Indicator", "External coverage"),
  "surveys.context": d("Context", "Surveys"),
  "indicator_data.comment": d("Description", "Indicators"),
  "risk_management.risk_description": d("Risk description (new risks)", "Risk"),
  "risk_management.updated_mitigation": d("Mitigation", "Risk"),
  "workplan_entries.comment": d("Description (progress note)", "Work plan"),
  "expenditure_entries.comment": d("Description", "Expenditure"),
  "hact_recommendations.partner_comment": d("Partner comment", "HACT"),
  "update_justifications.justification": d("Justification", "Justification"),

  // Testimonials keep their previous limits
  "testimonials.leadership_quote": d("Leadership quote", "Testimonials", 25),
  "testimonials.partner_quote": d("Partner / user quote", "Testimonials", 20),
  "testimonials.ground_description": d("Photos from project implementation: description & caption", "Testimonials", 200),
};

// ProDoc narrative questions are an admin-managed set (standard_narrative_questions),
// so they are not enumerated above: each is "narrative.<narrative_key>", default 500.
export const NARRATIVE_LIMIT_PREFIX = "narrative.";
export const NARRATIVE_DEFAULT_WORDS = 500;
export const narrativeLimitKey = (narrativeKey: string) => `${NARRATIVE_LIMIT_PREFIX}${narrativeKey}`;

/** Default limit for a key, or null when the key isn't a registered limit. */
export function defaultWordLimit(key: string): number | null {
  if (key in WORD_LIMITS) return WORD_LIMITS[key].default;
  if (key.startsWith(NARRATIVE_LIMIT_PREFIX) && key.length > NARRATIVE_LIMIT_PREFIX.length) return NARRATIVE_DEFAULT_WORDS;
  return null;
}
