import { query } from "@/lib/db";

// The project-update module matrix (update_types / update_modules / update_months)
// ships in db/add-update-modules.sql. Schema-drift guard: a DB that has not had
// the migration applied yet keeps working — callers leave the columns out of
// their SELECT/INSERT and an update falls back to its derived
// `unlocked_sections` alone. Cached module-side; only a migration changes it.
//
// Shared because more than one route needs the answer: /api/reports reads and
// writes the columns, /api/workplan reads them to size the extended time frame.
let hasModuleColumnsCache: boolean | null = null;

export async function hasUpdateModuleColumns(): Promise<boolean> {
  if (hasModuleColumnsCache !== null) return hasModuleColumnsCache;
  const present = await query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'reporting_platform'
        AND table_name   = 'reports'
        AND column_name  = ANY($1::text[])`,
    [["update_types", "update_modules", "update_months"]]
  );
  hasModuleColumnsCache = present.length === 3;
  return hasModuleColumnsCache;
}
