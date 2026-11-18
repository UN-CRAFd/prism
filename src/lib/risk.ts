import labels from "./labels";
import { RATING_RAMP, type RatingColors } from "@/lib/rating-colors";

/**
 * Single source of truth for risk-management domain logic.
 * Display text lives in labels.json; this module derives the numeric
 * lookups, the risk-level matrix and the colour config from it so the
 * UI, the API and the file-upload parser can never drift apart.
 */

export type RiskLevelKey = "low" | "medium" | "high" | "veryHigh";

const LIKELIHOOD = labels.risk.likelihood as Record<string, string>;
const IMPACT = labels.risk.impact as Record<string, string>;
const LEVELS = labels.risk.levels as Record<RiskLevelKey, string>;

// ── Label helpers ──────────────────────────────────────────────────────────

export function likelihoodLabel(value: number | null): string {
  return value == null ? "" : LIKELIHOOD[String(value)] ?? String(value);
}

export function impactLabel(value: number | null): string {
  return value == null ? "" : IMPACT[String(value)] ?? String(value);
}

export function riskLevelLabel(key: RiskLevelKey): string {
  return LEVELS[key];
}

// ── Text → number (used by the CSV/XLSX upload parser) ──────────────────────

function valueFromLabel(map: Record<string, string>, raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const n = Number(trimmed);
  if (Number.isFinite(n) && n >= 1 && n <= 5) return Math.round(n);
  const match = Object.entries(map).find(([, label]) => label.toLowerCase() === trimmed.toLowerCase());
  return match ? Number(match[0]) : null;
}

export const likelihoodFromText = (raw: string | undefined) => valueFromLabel(LIKELIHOOD, raw);
export const impactFromText = (raw: string | undefined) => valueFromLabel(IMPACT, raw);

// ── Risk-level matrix ───────────────────────────────────────────────────────
// Indexed [likelihood - 1][impact - 1]. Mirrors the source Excel formula
// exactly; kept as a table so it is decoupled from the (editable) labels.

const RISK_MATRIX: RiskLevelKey[][] = [
  //  impact →   Insignificant  Minor       Moderate  Major       Extreme
  /* Rare       */ ["low",       "low",      "medium", "medium",   "high"],
  /* Unlikely   */ ["low",       "low",      "medium", "medium",   "high"],
  /* Possible   */ ["low",       "medium",   "high",   "high",     "high"],
  /* Likely     */ ["medium",    "medium",   "high",   "high",     "veryHigh"],
  /* Very Likely*/ ["medium",    "high",     "high",   "veryHigh", "veryHigh"],
];

export function computeRiskLevelKey(likelihood: number | null, impact: number | null): RiskLevelKey | null {
  if (likelihood == null || impact == null) return null;
  return RISK_MATRIX[likelihood - 1]?.[impact - 1] ?? null;
}

// ── Colour config (shared styling for the coloured word badges) ─────────────

// Same light-orange ramp as the survey ratings (lib/rating-colors.ts), so every
// rating in the platform reads the same way: stronger = higher, no red/green.
type BadgeColors = RatingColors;

// Likelihood / impact 1–5.
export const SCALE_COLORS: Record<number, BadgeColors> = RATING_RAMP;

// Four risk levels spread over the five ramp steps, keeping both ends.
export const RISK_LEVEL_COLORS: Record<RiskLevelKey, BadgeColors> = {
  low:      RATING_RAMP[1],
  medium:   RATING_RAMP[2],
  high:     RATING_RAMP[4],
  veryHigh: RATING_RAMP[5],
};

export const FALLBACK_COLORS: BadgeColors = { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };

// The [1..5] scale used to render dropdown options.
export const SCALE = [1, 2, 3, 4, 5] as const;
