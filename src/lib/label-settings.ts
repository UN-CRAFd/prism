import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Persisted UI-label overrides. Stored as one JSON blob in app_settings under
// `label_overrides` (a partial, same-shaped subtree of labels.json holding only
// the leaves an admin changed). Read during the root layout render and merged
// over the compiled-in defaults (see lib/labels.ts). No migration needed — the
// app_settings key/value table already exists.
// ─────────────────────────────────────────────────────────────────────────────

const LABEL_OVERRIDES_KEY = "label_overrides";

/** The stored label overrides, or `{}` if none/unreadable. Never throws — a DB
 *  hiccup must not break page rendering, only fall back to default labels. */
export async function getLabelOverrides(): Promise<Record<string, unknown>> {
  try {
    const rows = await query<{ value: string }>(
      `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
      [LABEL_OVERRIDES_KEY]
    );
    const raw = rows[0]?.value;
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Persist the full overrides object (replaces any previous value). */
export async function setLabelOverrides(overrides: Record<string, unknown>): Promise<void> {
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [LABEL_OVERRIDES_KEY, JSON.stringify(overrides)]
  );
}
