import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { verifyAdminPassword } from "@/lib/admin-settings";
import { createSessionToken, setSessionCookie, type Session } from "@/lib/session";
import { logger } from "@/lib/logger";

const INVALID = { error: "Invalid username or password" };

// Return the user payload (for client UI) AND set the signed, httpOnly session
// cookie the server trusts. The client-side localStorage user is now cosmetic:
// authorization is decided from this cookie, which the browser cannot read or forge.
async function loginResponse(user: {
  id: string;
  name: string;
  role: Session["role"];
  organization?: string;
}) {
  const token = await createSessionToken({
    role: user.role,
    org: user.role === "admin" ? null : user.organization ?? user.id,
    name: user.name,
  });
  return setSessionCookie(NextResponse.json({ user }), token);
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

  // ── Admin — verified server-side (password never shipped to the client) ──
  if (username.toLowerCase() === "admin") {
    // Checks the password hash set from the admin Settings page, falling back to
    // the ADMIN_PASSWORD env var until one is stored. If neither is configured,
    // admin login is disabled rather than falling back to a guessable value.
    try {
      if (await verifyAdminPassword(password)) {
        return loginResponse({ id: "admin", name: "CRAF'd Secretariat", role: "admin" });
      }
    } catch (err) {
      logger.error("POST /api/auth/login admin verify error:", err);
      return NextResponse.json({ error: "Login failed" }, { status: 500 });
    }
    return NextResponse.json(INVALID, { status: 401 });
  }

  // ── Partner — matched by short name or email, verified against the DB ──
  try {
    const rows = await query<{ short_name: string; long_name: string | null; password_hash: string | null }>(
      `SELECT short_name, long_name, password_hash
       FROM reporting_platform.partners
       WHERE lower(short_name) = lower($1) OR lower(mail_account) = lower($1)
       LIMIT 1`,
      [username]
    );

    const partner = rows[0];
    if (!partner || !partner.password_hash || !verifyPassword(password, partner.password_hash)) {
      return NextResponse.json(INVALID, { status: 401 });
    }

    return loginResponse({
      id: partner.short_name,
      name: partner.long_name || partner.short_name,
      role: "partner",
      organization: partner.short_name,
    });
  } catch (err) {
    logger.error("POST /api/auth/login error:", err);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
