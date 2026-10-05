import { query } from "@/lib/db";
import { DESCRIPTION_MAX_CHARS, narrativeLimit } from "@/lib/limits";

const CHAR_LIMITS_KEY = "char_limits";
const MAX_ALLOWED = 50_000;

export interface CharLimits {
  description: number;
  /** Overrides only. For effective limit per key use `limits.narratives[key] ?? narrativeLimit(key)`. */
  narratives: Record<string, number>;
}

function clampPositiveInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v) || v <= 0 || v > MAX_ALLOWED) return null;
  return v;
}

async function getStoredOverrides(): Promise<{ description?: number; narratives?: Record<string, number> }> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
      [CHAR_LIMITS_KEY]
    );
    const raw = rows[0]?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as { description?: number; narratives?: Record<string, number> };
  } catch {
    return {};
  }
}

/** Effective char limits: hardcoded defaults merged with stored overrides.
 *  `narratives` contains only keys with non-default values. Call
 *  `limits.narratives[key] ?? narrativeLimit(key)` for the effective per-key limit. */
export async function getCharLimits(): Promise<CharLimits> {
  const overrides = await getStoredOverrides();
  const descOverride = overrides.description != null ? clampPositiveInt(overrides.description) : null;
  const narratives: Record<string, number> = {};
  const raw = overrides.narratives && typeof overrides.narratives === "object" ? overrides.narratives : {};
  for (const [key, val] of Object.entries(raw)) {
    const v = clampPositiveInt(val);
    if (v !== null) narratives[key] = v;
  }
  return {
    description: descOverride ?? DESCRIPTION_MAX_CHARS,
    narratives,
  };
}

/** Validate and persist char limit overrides. Values equal to the hardcoded default are
 *  dropped so the stored blob stays minimal. Returns `{ error }` on invalid input. */
export async function setCharLimits(overrides: {
  description?: unknown;
  narratives?: unknown;
}): Promise<{ error?: string }> {
  const out: { description?: number; narratives?: Record<string, number> } = {};

  if (overrides.description !== undefined) {
    const v = clampPositiveInt(overrides.description);
    if (v === null) return { error: "description must be a positive integer ≤ 50,000" };
    if (v !== DESCRIPTION_MAX_CHARS) out.description = v;
  }

  if (overrides.narratives !== undefined) {
    if (
      typeof overrides.narratives !== "object" ||
      Array.isArray(overrides.narratives) ||
      overrides.narratives === null
    ) {
      return { error: "narratives must be an object" };
    }
    const narr: Record<string, number> = {};
    for (const [key, val] of Object.entries(overrides.narratives as Record<string, unknown>)) {
      const v = clampPositiveInt(val);
      if (v === null) return { error: `narratives.${key} must be a positive integer ≤ 50,000` };
      if (v !== narrativeLimit(key)) narr[key] = v;
    }
    if (Object.keys(narr).length > 0) out.narratives = narr;
  }

  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [CHAR_LIMITS_KEY, JSON.stringify(out)]
  );
  return {};
}
