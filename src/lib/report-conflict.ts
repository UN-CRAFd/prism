import { query } from "@/lib/db";

// ─────────────────────────────────────────────────────────────────────────────
// Which uniqueness key the `reports` table actually has.
//
// db/add-update-index.sql adds `update_index` and widens the key from
// (project_id, year, data_type) to include it, so a project can carry more than
// one project update in a year. An ON CONFLICT arbiter has to name exactly the
// columns of the live constraint, so every insert into `reports` asks here which
// one is in force — deploying this code before running the migration would
// otherwise fail every report creation with "there is no unique or exclusion
// constraint matching the ON CONFLICT specification".
//
// Cached module-side: only a migration changes the answer.
// ─────────────────────────────────────────────────────────────────────────────

let hasUpdateIndexCache: boolean | null = null;

export async function hasUpdateIndex(): Promise<boolean> {
  if (hasUpdateIndexCache !== null) return hasUpdateIndexCache;
  const present = await query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND table_name   = 'reports'
        AND column_name  = 'update_index'`
  );
  hasUpdateIndexCache = present.length === 1;
  return hasUpdateIndexCache;
}

/** The ON CONFLICT target matching the live uniqueness key, parentheses included. */
export async function reportConflictTarget(): Promise<string> {
  return (await hasUpdateIndex())
    ? "(project_id, year, data_type, update_index)"
    : "(project_id, year, data_type)";
}

/** Trim a client-supplied update index. Empty means "the year's first update",
 *  which is what every report and prodoc also stores. */
export function normaliseUpdateIndex(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 40) : "";
}
