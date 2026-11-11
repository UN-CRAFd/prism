import { query } from "@/lib/db";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Limits password guessing. Every failed attempt on a key (an account, a
// username, …) is counted in reporting_platform.login_attempts; on the
// MAX_ATTEMPTS-th failure the key is locked. While locked, no password is even
// checked. A successful login clears the key.
//
// HOW LONG A LOCK LASTS
//   • Partner accounts (and usernames that match no account) stay locked until
//     a new password is issued: CRAF'd clicks "Reset password" on the Partners
//     page (which unlocks the account) and sends a new share link, on which the
//     partner sets a new password. Unknown usernames are locked the same way, so
//     the messages never reveal which usernames exist.
//   • The shared admin account is locked for ADMIN_LOCK_MINUTES only: it is the
//     account that unlocks everyone else, so locking it for good would leave
//     nobody able to sign in to issue new passwords.
//
// The counter is updated in one atomic statement, so parallel guesses cannot
// slip past the limit. Before db/add-login-attempts.sql has run the table does
// not exist; logins then keep working, unthrottled, and a warning is logged.
// ─────────────────────────────────────────────────────────────────────────────

export const MAX_ATTEMPTS = 5;
export const ADMIN_LOCK_MINUTES = 15;

let tableCache: boolean | null = null;
async function available(): Promise<boolean> {
  if (tableCache !== null) return tableCache;
  try {
    const rows = await query<{ t: string | null }>(
      `SELECT to_regclass('reporting_platform.login_attempts')::text AS t`
    );
    tableCache = !!rows[0]?.t;
  } catch {
    tableCache = false;
  }
  if (!tableCache) {
    logger.warn("login_attempts table missing — password attempts are not limited. Run db/add-login-attempts.sql.");
  }
  return tableCache;
}

/** Whether the key is locked; `minutes` is null for a lock that lasts until a new password is issued. */
export type LockStatus = { locked: false } | { locked: true; minutes: number | null };

export async function lockStatus(key: string): Promise<LockStatus> {
  if (!(await available())) return { locked: false };
  const rows = await query<{ indefinite: boolean; mins: number | null }>(
    `SELECT locked_until = 'infinity'::timestamptz AS indefinite,
            CASE WHEN locked_until = 'infinity'::timestamptz THEN NULL
                 ELSE CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())) / 60)::int END AS mins
       FROM reporting_platform.login_attempts
      WHERE key = $1 AND locked_until > NOW()`,
    [key]
  );
  if (!rows.length) return { locked: false };
  return { locked: true, minutes: rows[0].indefinite ? null : Math.max(1, rows[0].mins ?? 1) };
}

/**
 * Count a failed attempt. Returns how many attempts are left (0 = now locked).
 * `lockMinutes` null locks until a new password is issued (clearFailures);
 * a number locks for that long, after which counting starts again from 1.
 */
export async function recordFailure(
  key: string,
  max: number = MAX_ATTEMPTS,
  lockMinutes: number | null = null,
): Promise<number> {
  if (!(await available())) return max;
  const lockUntil = lockMinutes === null
    ? `'infinity'::timestamptz`
    : `NOW() + make_interval(mins => ${Math.max(1, Math.floor(lockMinutes))})`;
  const rows = await query<{ failures: number }>(
    `INSERT INTO reporting_platform.login_attempts AS la (key, failures, last_failed_at, locked_until)
     VALUES ($1, 1, NOW(), CASE WHEN 1 >= $2 THEN ${lockUntil} END)
     ON CONFLICT (key) DO UPDATE SET
       failures = CASE WHEN la.locked_until IS NOT NULL AND la.locked_until <= NOW() THEN 1
                       ELSE la.failures + 1 END,
       last_failed_at = NOW(),
       locked_until = CASE
         WHEN (CASE WHEN la.locked_until IS NOT NULL AND la.locked_until <= NOW() THEN 1
                    ELSE la.failures + 1 END) >= $2
           THEN ${lockUntil}
         ELSE NULL END
     RETURNING failures`,
    [key, max]
  );
  return Math.max(0, max - (rows[0]?.failures ?? max));
}

/** Clear the key: after a successful login, or when a new password is issued. */
export async function clearFailures(key: string): Promise<void> {
  if (!(await available())) return;
  await query(`DELETE FROM reporting_platform.login_attempts WHERE key = $1`, [key]);
}

/** The throttle key of a partner account (login page and share-link page share it). */
export const partnerKey = (partnerId: number | string) => `login:partner:${partnerId}`;

/** Partner ids whose accounts are currently locked (for the admin Partners page). */
export async function lockedPartnerIds(): Promise<Set<number>> {
  if (!(await available())) return new Set();
  const rows = await query<{ key: string }>(
    `SELECT key FROM reporting_platform.login_attempts
      WHERE key LIKE 'login:partner:%' AND locked_until > NOW()`
  );
  return new Set(rows.map((r) => Number(r.key.slice("login:partner:".length))).filter(Number.isInteger));
}

const LOCKED_FOR_GOOD =
  `Your account has been locked after ${MAX_ATTEMPTS} failed attempts. ` +
  `Please contact your CRAF'd focal point or email crafd@un.org — they will send you a new login link.`;

/** The message shown after a wrong password. */
export function attemptsLeftMessage(
  left: number,
  base = "Invalid username or password.",
  lockMinutes: number | null = null,
): string {
  if (left <= 0) {
    return lockMinutes === null
      ? LOCKED_FOR_GOOD
      : `Too many failed attempts. This account is locked for ${lockMinutes} minutes.`;
  }
  return `${base} ${left} ${left === 1 ? "attempt" : "attempts"} left.`;
}

/** The message shown while a key is locked. */
export function lockedMessage(minutes: number | null): string {
  if (minutes === null) return LOCKED_FOR_GOOD;
  return `Too many failed attempts. Please try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}
