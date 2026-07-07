import labels from "./labels.json";

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

interface BadgeColors { bg: string; text: string; border: string }

export const SCALE_COLORS: Record<number, BadgeColors> = {
  1: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  2: { bg: "bg-blue-50",   text: "text-blue-700",   border: "border-blue-300"   },
  3: { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  4: { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  5: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};

export const RISK_LEVEL_COLORS: Record<RiskLevelKey, BadgeColors> = {
  low:      { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300"  },
  medium:   { bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-300"  },
  high:     { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-300" },
  veryHigh: { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300"    },
};

export const FALLBACK_COLORS: BadgeColors = { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };

// The [1..5] scale used to render dropdown options.
export const SCALE = [1, 2, 3, 4, 5] as const;
