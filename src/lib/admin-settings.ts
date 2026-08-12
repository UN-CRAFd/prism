import { query } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";

// ─────────────────────────────────────────────────────────────────────────────
// Admin login credential storage. The admin is a single shared account (not a
// DB user like partners). Its password lives in the app_settings key/value table
// under `admin_password_hash` once an admin sets one from the Settings page.
//
// Until a hash is stored, admin login falls back to the ADMIN_PASSWORD env var —
// so a fresh deploy works with no DB write, and that env value stays a recovery
// hatch if the stored password is ever forgotten. NOTE: session cookies are
// signed with SESSION_SECRET/ADMIN_PASSWORD (see lib/session.ts), which is
// deliberately independent of this login password: changing the password here
// does not invalidate existing sessions.
// ─────────────────────────────────────────────────────────────────────────────

const ADMIN_PASSWORD_HASH_KEY = "admin_password_hash";

/** The stored admin password hash, or null if none has been set yet. */
export async function getAdminPasswordHash(): Promise<string | null> {
  const rows = await query<{ value: string }>(
    `SELECT value FROM reporting_platform.app_settings WHERE key = $1 LIMIT 1`,
    [ADMIN_PASSWORD_HASH_KEY]
  );
  return rows[0]?.value ?? null;
}

/**
 * Verify a candidate admin password against the effective credential: the stored
 * hash if one exists, otherwise the ADMIN_PASSWORD env var. Returns false if
 * neither is configured (admin login disabled).
 */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const hash = await getAdminPasswordHash();
  if (hash) return verifyPassword(password, hash);
  const envPassword = process.env.ADMIN_PASSWORD;
  return !!envPassword && password === envPassword;
}

/** Hash and persist a new admin password (upsert into app_settings). */
export async function setAdminPassword(newPassword: string): Promise<void> {
  const hash = hashPassword(newPassword);
  await query(
    `INSERT INTO reporting_platform.app_settings (key, value)
     VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [ADMIN_PASSWORD_HASH_KEY, hash]
  );
}
