import { query } from "@/lib/db";
import {
  DEFAULT_UPDATE_REQUIREMENTS,
  normaliseRequirements,
  type UpdateRequirements,
} from "@/lib/update-modules";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted "update category requirements" — which modules each update type
// requires (the permanent ticks in the project-update matrix). Stored as one
// JSON blob in app_settings under `update_requirements`, same mechanism as the
// label/option overrides (see lib/option-settings.ts). No migration needed —
// the app_settings key/value table already exists.
//
// A stored map REPLACES the compiled-in default for the types it mentions; types
// absent from the stored map keep their default row. That way adding a new type
// in code ships with a sensible tick row even on a DB that was written earlier.
// ─────────────────────────────────────────────────────────────────────────────

const UPDATE_REQUIREMENTS_KEY = "update_requirements";

/** The effective requirements: stored admin edits merged over the defaults.
 *  Never throws — a DB hiccup falls back to the compiled-in defaults. */
export async function getUpdateRequirements(): Promise<UpdateRequirements> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
      [UPDATE_REQUIREMENTS_KEY]
    );
    const raw = rows[0]?.value;
    if (!raw) return { ...DEFAULT_UPDATE_REQUIREMENTS };
    return { ...DEFAULT_UPDATE_REQUIREMENTS, ...normaliseRequirements(JSON.parse(raw)) };
  } catch {
    return { ...DEFAULT_UPDATE_REQUIREMENTS };
  }
}

/** Persist the full requirements map (replaces any previous value). */
export async function setUpdateRequirements(requirements: UpdateRequirements): Promise<void> {
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [UPDATE_REQUIREMENTS_KEY, JSON.stringify(requirements)]
  );
}
