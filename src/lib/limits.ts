export const DESCRIPTION_MAX_CHARS = 15_000;

const NARRATIVE_LIMITS: Record<string, number> = {
  background_relevance: 4500,
  theory_of_change:     4500,
  methodology:          4500,
  ecosystem_impact:     4500,
  crafd_principles:     3000,
  sustainability:       2500,
  scalability:          2500,
  innovation:           2500,
  cost_effectiveness:   2500,
};

export function narrativeLimit(key: string): number {
  return NARRATIVE_LIMITS[key] ?? 4500;
}
