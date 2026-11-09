import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Session versions: how a password change logs people out.
//
// Login cookies are signed tokens and cannot be "deleted" on other devices. So
// each token carries the account's version number at login time, and every
// request compares it with the current one. Changing or resetting a password
// bumps the version → every earlier login of that account stops working,
// on every device (the admin and partner accounts are shared).
//
//   • admin    → app_settings key 'admin_session_version'
//   • partners → partners.session_version (db/add-session-versions.sql)
//
// Versions are cached for a few seconds per process so a page full of API
// calls costs one lookup; a bump clears the cache immediately.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_KEY = "admin_session_version";
const CACHE_MS = 10_000;
const cache = new Map<string, { v: number; at: number }>();

let partnerColumn: boolean | null = null;
async function hasPartnerColumn(): Promise<boolean> {
  if (partnerColumn !== null) return partnerColumn;
  try {
    const rows = await query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'reporting_platform' AND table_name = 'partners'
          AND column_name = 'session_version'`
    );
    partnerColumn = rows.length === 1;
  } catch {
    partnerColumn = false;
  }
  if (!partnerColumn) {
    logger.warn("partners.session_version missing — partner logins are not revoked on password change. Run db/add-session-versions.sql.");
  }
  return partnerColumn;
}

function cached(key: string): number | undefined {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.v : undefined;
}

/** Current admin session version (0 until the admin password is first changed). */
export async function adminVersion(): Promise<number> {
  const c = cached("admin");
  if (c !== undefined) return c;
  const rows = await query<{ value: string }>(
    `SELECT value FROM reporting_platform.app_settings WHERE key = $1`,
    [ADMIN_KEY]
  );
  const v = Number(rows[0]?.value ?? 0) || 0;
  cache.set("admin", { v, at: Date.now() });
  return v;
}

/** Current version of a partner account, or null if the partner no longer exists. */
export async function partnerVersion(partnerId: number): Promise<number | null> {
  const key = `p:${partnerId}`;
  const c = cached(key);
  if (c !== undefined) return c;
  const col = await hasPartnerColumn();
  const rows = await query<{ v: number }>(
    `SELECT ${col ? "session_version" : "0"} AS v FROM reporting_platform.partners WHERE id = $1`,
    [partnerId]
  );
  if (!rows.length) return null;
  const v = Number(rows[0].v) || 0;
  cache.set(key, { v, at: Date.now() });
  return v;
}

/** Log every admin login out. Returns the new version (for the caller's own new cookie). */
export async function bumpAdminVersion(): Promise<number> {
  const rows = await query<{ value: string }>(
    `INSERT INTO reporting_platform.app_settings (key, value) VALUES ($1, '1')
     ON CONFLICT (key) DO UPDATE
       SET value = ((COALESCE(NULLIF(app_settings.value, ''), '0'))::int + 1)::text
     RETURNING value`,
    [ADMIN_KEY]
  );
  cache.delete("admin");
  return Number(rows[0]?.value ?? 1);
}

/** Log every login of this partner out. Returns the new version (0 without the migration). */
export async function bumpPartnerVersion(partnerId: number | string): Promise<number> {
  cache.delete(`p:${partnerId}`);
  if (!(await hasPartnerColumn())) return 0;
  const rows = await query<{ v: number }>(
    `UPDATE reporting_platform.partners SET session_version = session_version + 1
      WHERE id = $1 RETURNING session_version AS v`,
    [partnerId]
  );
  return Number(rows[0]?.v ?? 0);
}
