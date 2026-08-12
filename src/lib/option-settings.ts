import { query } from "@/lib/db";
import { applyOptionOverrides } from "@/lib/options";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted dropdown-option overrides. Stored as one JSON blob in app_settings
// under `option_overrides`: a partial `{ groupKey: { items: OptionItem[] } }` map
// holding only the groups an admin changed. Read during the root layout render
// (and by API routes that validate against these lists) and merged over the
// compiled-in defaults (see lib/options.ts). No migration needed — the
// app_settings key/value table already exists.
// ─────────────────────────────────────────────────────────────────────────────

const OPTION_OVERRIDES_KEY = "option_overrides";

/** The stored option overrides, or `{}` if none/unreadable. Never throws — a DB
 *  hiccup must not break page rendering, only fall back to default options. */
export async function getOptionOverrides(): Promise<Record<string, unknown>> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
      [OPTION_OVERRIDES_KEY]
    );
    const raw = rows[0]?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Load persisted overrides and patch the shared options singleton. Call this at
 *  the top of any API route that validates an incoming value against these lists
 *  — API routes don't render the root layout, so the singleton would otherwise
 *  hold only the compiled-in defaults and reject validly-added options. Idempotent
 *  and safe to call on every request. Never throws. */
export async function loadOptionOverrides(): Promise<void> {
  applyOptionOverrides(await getOptionOverrides());
}

/** Persist the full overrides object (replaces any previous value). */
export async function setOptionOverrides(overrides: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [OPTION_OVERRIDES_KEY, JSON.stringify(overrides)]
  );
}
