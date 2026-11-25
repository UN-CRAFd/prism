import { query } from "@/lib/db";
import { MAX_WORD_LIMIT, defaultWordLimit } from "@/lib/limits";

// Server side of the word limits: admin overrides live in app_settings under the key
// "word_limits" as { limitKey: number }. (The old "char_limits" key is ignored.)

const WORD_LIMITS_KEY = "word_limits";

function validLimit(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 && v <= MAX_WORD_LIMIT ? v : null;
}

/** Stored overrides only (keys whose value differs from the default). Never throws. */
export async function getWordLimitOverrides(): Promise<Record<string, number>> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
      [WORD_LIMITS_KEY]
    );
    const raw = rows[0]?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      const n = validLimit(v);
      if (n !== null && defaultWordLimit(k) !== null) out[k] = n;
    }
    return out;
  } catch {
    return {};
  }
}

export interface WordLimits {
  /** Effective limit (override, else default) for a registered key. */
  limit: (key: string) => number;
  overrides: Record<string, number>;
}

export async function getWordLimits(): Promise<WordLimits> {
  const overrides = await getWordLimitOverrides();
  return {
    overrides,
    limit: (key) => overrides[key] ?? defaultWordLimit(key) ?? MAX_WORD_LIMIT,
  };
}

/** Validate and persist the overrides (replaces the stored blob). Values equal to the
 *  default aren't stored. Returns `{ error }` on invalid input. */
export async function setWordLimits(input: unknown): Promise<{ error?: string }> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "limits must be an object" };
  const out: Record<string, number> = {};
  for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
    const def = defaultWordLimit(key);
    if (def === null) return { error: `Unknown limit "${key}"` };
    const n = validLimit(val);
    if (n === null) return { error: `"${key}" must be a whole number from 1 to ${MAX_WORD_LIMIT.toLocaleString("en-US")}` };
    if (n !== def) out[key] = n;
  }
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [WORD_LIMITS_KEY, JSON.stringify(out)]
  );
  return {};
}
