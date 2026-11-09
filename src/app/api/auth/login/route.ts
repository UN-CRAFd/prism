import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifyAdminPassword } from "@/lib/admin-settings";
import { createSessionToken, setSessionCookie, type Session } from "@/lib/session";
import { logger } from "@/lib/logger";
import { adminVersion, partnerVersion } from "@/lib/session-version";
import {
  ADMIN_LOCK_MINUTES, MAX_ATTEMPTS, attemptsLeftMessage, clearFailures, lockedMessage, lockStatus,
  partnerKey, recordFailure,
} from "@/lib/login-throttle";

const INVALID = { error: "Invalid username or password" };

// Return the user payload (for client UI) AND set the signed, httpOnly session
// cookie the server trusts. The client-side localStorage user is now cosmetic:
// authorization is decided from this cookie, which the browser cannot read or forge.
async function loginResponse(user: {
  id: string;
  name: string;
  role: Session["role"];
  organization?: string;
  partner_id?: number | null;
}) {
  // The account's current session version: a later password change bumps it
  // and ends this login (see lib/session-version).
  const ver = user.role === "admin"
    ? await adminVersion()
    : (await partnerVersion(user.partner_id as number)) ?? 0;
  const token = await createSessionToken({
    role: user.role,
    org: user.role === "admin" ? null : user.organization ?? user.id,
    partner_id: user.role === "admin" ? null : user.partner_id ?? null,
    name: user.name,
    ver,
  });
  return setSessionCookie(NextResponse.json({ user }), token);
}

// A wrong password: count it and tell the user how many attempts are left.
// `lockMinutes` null = locked until a new password is issued (partners);
// the shared admin account uses a timed lock (see lib/login-throttle).
async function failed(key: string, lockMinutes: number | null = null) {
  const left = await recordFailure(key, MAX_ATTEMPTS, lockMinutes);
  return NextResponse.json(
    { error: attemptsLeftMessage(left, undefined, lockMinutes), attemptsLeft: left },
    { status: left > 0 ? 401 : 429 }
  );
}

function locked(minutes: number | null) {
  return NextResponse.json(
    { error: lockedMessage(minutes), attemptsLeft: 0 },
    { status: 429 }
  );
}

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";
  if (!username || !password) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  try {
    // ── Admin — verified server-side (password never shipped to the client) ──
    if (username.toLowerCase() === "admin") {
      const key = "login:admin";
      const lock = await lockStatus(key);
      if (lock.locked) return locked(lock.minutes);
      // Checks the password hash set from the admin Settings page, falling back to
      // the ADMIN_PASSWORD env var until one is stored. If neither is configured,
      // admin login is disabled rather than falling back to a guessable value.
      if (await verifyAdminPassword(password)) {
        await clearFailures(key);
        return loginResponse({ id: "admin", name: "CRAF'd Secretariat", role: "admin" });
      }
      // Timed lock only: the admin account is the one that unlocks everyone else.
      return failed(key, ADMIN_LOCK_MINUTES);
    }

    // ── Partner — matched by short name or email, verified against the DB ──
    const rows = await query<{ id: number; short_name: string; long_name: string | null; password_hash: string | null }>(
      `SELECT id, short_name, long_name, password_hash
       FROM reporting_platform.partners
       WHERE lower(short_name) = lower($1) OR lower(mail_account) = lower($1)
       LIMIT 1`,
      [username]
    );
    const partner = rows[0];

    // Attempts are counted per ACCOUNT, so switching between the short name and
    // the e-mail address does not reset the count. An unknown username is
    // counted (and locked) under its own name exactly like a real one, so the
    // replies never reveal which usernames exist.
    const key = partner ? partnerKey(partner.id) : `login:name:${username.toLowerCase()}`;
    const lock = await lockStatus(key);
    if (lock.locked) return locked(lock.minutes);

    if (!partner || !partner.password_hash || !verifyPassword(password, partner.password_hash)) {
      return failed(key);
    }

    await clearFailures(key);
    return loginResponse({
      id: partner.short_name,
      name: partner.long_name || partner.short_name,
      role: "partner",
      organization: partner.short_name,
      partner_id: partner.id,
    });
  } catch (err) {
    logger.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
